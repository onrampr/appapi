import express from 'express';
import axios from 'axios';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Bridge API client
const bridgeAPI = axios.create({
  baseURL: process.env.BRIDGE_API_URL || 'https://api.bridge.xyz',
  headers: {
    'Api-Key': process.env.BRIDGE_API_KEY,
    'Content-Type': 'application/json',
  },
});

// Get user's Bridge customer ID
const getUserBridgeCustomerId = async (userId) => {
  const result = await query(
    'SELECT bridge_customer_id FROM users WHERE id = ?',
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0].bridge_customer_id : null;
};

// Initiate on-ramp (buy USDC) - integrates with existing system
router.post('/onramp', authenticateToken, async (req, res, next) => {
  try {
    const { amount, currency, walletAddress } = req.body;

    // Validate input
    if (!amount || !currency || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Amount, currency, and wallet address are required'
      });
    }

    // Get user's Bridge customer ID
    const bridgeCustomerId = await getUserBridgeCustomerId(req.user.id);
    if (!bridgeCustomerId) {
      return res.status(400).json({
        success: false,
        message: 'Bridge customer ID not found. Please complete KYC first.'
      });
    }

    // Create on-ramp request
    const onRampData = {
      amount: parseFloat(amount),
      currency: currency.toUpperCase(),
      wallet_address: walletAddress,
      customer_id: bridgeCustomerId,
      metadata: {
        user_id: req.user.id,
        email: req.user.email,
        source: 'mobile_app'
      }
    };

    // Call Bridge API
    const bridgeResponse = await bridgeAPI.post('/v0/onramp', onRampData);

    // Store transaction in existing customer_transactions table
    const result = await query(
      `INSERT INTO customer_transactions (transaction_id, customer_id, type, amount, currency, status, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        bridgeResponse.data.id,
        bridgeCustomerId,
        'transfer', // Using existing type
        amount,
        currency.toLowerCase(),
        bridgeResponse.data.state || 'pending',
        JSON.stringify(bridgeResponse.data)
      ]
    );

    // Log mobile on-ramp activity
    await query(
      `INSERT INTO mobile_activity_logs (user_id, device_id, action, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, req.body.deviceId || 'unknown', 'mobile_onramp', `On-ramp initiated: ${amount} ${currency}`, req.ip, req.headers['user-agent']]
    );

    res.json({
      success: true,
      message: 'On-ramp initiated successfully',
      transactionId: bridgeResponse.data.id,
      bridgeData: bridgeResponse.data
    });

  } catch (error) {
    console.error('On-ramp error:', error.response?.data || error.message);
    
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: error.response.data?.message || 'On-ramp failed'
      });
    }
    
    next(error);
  }
});

// Initiate off-ramp (sell USDC) - integrates with existing system
router.post('/offramp', authenticateToken, async (req, res, next) => {
  try {
    const { amount, currency, bankAccount, walletAddress } = req.body;

    // Validate input
    if (!amount || !currency || !bankAccount || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Amount, currency, bank account, and wallet address are required'
      });
    }

    // Get user's Bridge customer ID
    const bridgeCustomerId = await getUserBridgeCustomerId(req.user.id);
    if (!bridgeCustomerId) {
      return res.status(400).json({
        success: false,
        message: 'Bridge customer ID not found. Please complete KYC first.'
      });
    }

    // Create off-ramp request
    const offRampData = {
      amount: parseFloat(amount),
      currency: currency.toUpperCase(),
      bank_account: bankAccount,
      wallet_address: walletAddress,
      customer_id: bridgeCustomerId,
      metadata: {
        user_id: req.user.id,
        email: req.user.email,
        source: 'mobile_app'
      }
    };

    // Call Bridge API
    const bridgeResponse = await bridgeAPI.post('/v0/offramp', offRampData);

    // Store transaction in existing customer_transactions table
    const result = await query(
      `INSERT INTO customer_transactions (transaction_id, customer_id, type, amount, currency, status, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        bridgeResponse.data.id,
        bridgeCustomerId,
        'liquidation_drain', // Using existing type
        amount,
        currency.toLowerCase(),
        bridgeResponse.data.state || 'pending',
        JSON.stringify(bridgeResponse.data)
      ]
    );

    // Log mobile off-ramp activity
    await query(
      `INSERT INTO mobile_activity_logs (user_id, device_id, action, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, req.body.deviceId || 'unknown', 'mobile_offramp', `Off-ramp initiated: ${amount} ${currency}`, req.ip, req.headers['user-agent']]
    );

    res.json({
      success: true,
      message: 'Off-ramp initiated successfully',
      transactionId: bridgeResponse.data.id,
      bridgeData: bridgeResponse.data
    });

  } catch (error) {
    console.error('Off-ramp error:', error.response?.data || error.message);
    
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: error.response.data?.message || 'Off-ramp failed'
      });
    }
    
    next(error);
  }
});

// Get transaction status - works with existing customer_transactions
router.get('/transactions/:transactionId/status', authenticateToken, async (req, res, next) => {
  try {
    const { transactionId } = req.params;

    // Get user's Bridge customer ID
    const bridgeCustomerId = await getUserBridgeCustomerId(req.user.id);
    if (!bridgeCustomerId) {
      return res.status(400).json({
        success: false,
        message: 'Bridge customer ID not found'
      });
    }

    // Get transaction from existing customer_transactions table
    const result = await query(
      'SELECT transaction_id, status, data FROM customer_transactions WHERE transaction_id = ? AND customer_id = ?',
      [transactionId, bridgeCustomerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    const transaction = result.rows[0];

    // Get latest status from Bridge API
    try {
      const bridgeResponse = await bridgeAPI.get(`/v0/transfers/${transactionId}`);
      
      // Update status in database if changed
      if (bridgeResponse.data.state !== transaction.status) {
        await query(
          'UPDATE customer_transactions SET status = ?, data = ?, updated_at = NOW() WHERE transaction_id = ?',
          [bridgeResponse.data.state, JSON.stringify(bridgeResponse.data), transactionId]
        );
      }

      res.json({
        success: true,
        status: bridgeResponse.data.state,
        data: bridgeResponse.data
      });

    } catch (bridgeError) {
      // If Bridge API fails, return cached status
      res.json({
        success: true,
        status: transaction.status,
        data: transaction.data ? JSON.parse(transaction.data) : null
      });
    }

  } catch (error) {
    next(error);
  }
});

// Get supported currencies
router.get('/currencies', authenticateToken, async (req, res, next) => {
  try {
    const response = await bridgeAPI.get('/v0/currencies');
    
    res.json({
      success: true,
      currencies: response.data
    });

  } catch (error) {
    console.error('Currencies error:', error.response?.data || error.message);
    
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: error.response.data?.message || 'Failed to fetch currencies'
      });
    }
    
    next(error);
  }
});

// Get exchange rates
router.get('/exchange-rates', authenticateToken, async (req, res, next) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'From and to currencies are required'
      });
    }

    const response = await bridgeAPI.get(`/v0/exchange_rates?from=${from}&to=${to}`);
    
    res.json({
      success: true,
      rate: response.data
    });

  } catch (error) {
    console.error('Exchange rates error:', error.response?.data || error.message);
    
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: error.response.data?.message || 'Failed to fetch exchange rates'
      });
    }
    
    next(error);
  }
});

// Get user's Bridge transactions (from existing customer_transactions table)
router.get('/transactions', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const offset = (page - 1) * limit;

    // Get user's Bridge customer ID
    const bridgeCustomerId = await getUserBridgeCustomerId(req.user.id);
    if (!bridgeCustomerId) {
      return res.json({
        success: true,
        transactions: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        }
      });
    }

    let whereClause = 'WHERE customer_id = ?';
    const params = [bridgeCustomerId];
    let paramCount = 1;

    if (type) {
      paramCount++;
      whereClause += ` AND type = ?`;
      params.push(type);
    }

    // Get transactions from existing customer_transactions table
    const transactionsResult = await query(
      `SELECT id, transaction_id, type, amount, currency, status, data, created_at, updated_at
       FROM customer_transactions 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM customer_transactions ${whereClause}`,
      params
    );

    const transactions = transactionsResult.rows.map(tx => ({
      id: tx.id,
      transactionId: tx.transaction_id,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      data: tx.data ? JSON.parse(tx.data) : null,
      createdAt: tx.created_at,
      updatedAt: tx.updated_at
    }));

    res.json({
      success: true,
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

// Get KYC status from existing system
router.get('/kyc/status', authenticateToken, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT kyc_status, bridge_customer_id FROM users WHERE id = ?',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      kycStatus: user.kyc_status,
      bridgeCustomerId: user.bridge_customer_id,
      hasCustomerId: !!user.bridge_customer_id
    });

  } catch (error) {
    next(error);
  }
});

// Get external accounts from existing system
router.get('/external-accounts', authenticateToken, async (req, res, next) => {
  try {
    // Get user's Bridge customer ID
    const bridgeCustomerId = await getUserBridgeCustomerId(req.user.id);
    if (!bridgeCustomerId) {
      return res.json({
        success: true,
        accounts: []
      });
    }

    // Get external accounts from existing external_accounts_cache table
    const result = await query(
      'SELECT id, external_account_id, account_type, account_details FROM external_accounts_cache WHERE customer_id = ?',
      [bridgeCustomerId]
    );

    const accounts = result.rows.map(account => ({
      id: account.id,
      externalAccountId: account.external_account_id,
      accountType: account.account_type,
      accountDetails: account.account_details ? JSON.parse(account.account_details) : null
    }));

    res.json({
      success: true,
      accounts
    });

  } catch (error) {
    next(error);
  }
});

// Webhook handler for Bridge.xyz updates (integrates with existing system)
router.post('/webhook', async (req, res, next) => {
  try {
    const webhookData = req.body;
    
    console.log('Bridge webhook received:', webhookData);

    // Verify webhook signature if secret is provided
    if (process.env.BRIDGE_WEBHOOK_SECRET) {
      // Implement webhook signature verification here
      // const signature = req.headers['x-bridge-signature'];
      // if (!verifyWebhookSignature(signature, webhookData)) {
      //   return res.status(401).json({ error: 'Invalid signature' });
      // }
    }

    // Update transaction status in existing customer_transactions table
    if (webhookData.id) {
      await query(
        'UPDATE customer_transactions SET status = ?, data = ?, updated_at = NOW() WHERE transaction_id = ?',
        [webhookData.state, JSON.stringify(webhookData), webhookData.id]
      );

      // Log webhook activity
      await query(
        `INSERT INTO mobile_activity_logs (user_id, device_id, action, details, ip_address, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [null, 'webhook', 'bridge_webhook', `Webhook update: ${webhookData.id} - ${webhookData.state}`, req.ip, req.headers['user-agent']]
      );
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    next(error);
  }
});

export default router;