import express from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateEncryptedMnemonic } from '../utils/validation.js';

const router = express.Router();

// Get user's wallets (from existing wallets table)
router.get('/list', authenticateToken, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, address, network, created_at, updated_at FROM wallets WHERE user_id = ?',
      [req.user.id]
    );

    const wallets = result.rows.map(wallet => ({
      id: wallet.id,
      address: wallet.address,
      network: wallet.network,
      createdAt: wallet.created_at,
      updatedAt: wallet.updated_at
    }));

    res.json({
      success: true,
      wallets
    });

  } catch (error) {
    next(error);
  }
});

// Get wallet details (without exposing private keys)
router.get('/:walletId', authenticateToken, async (req, res, next) => {
  try {
    const { walletId } = req.params;

    const result = await query(
      'SELECT id, address, network, created_at, updated_at FROM wallets WHERE id = ? AND user_id = ?',
      [walletId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    const wallet = result.rows[0];

    res.json({
      success: true,
      wallet: {
        id: wallet.id,
        address: wallet.address,
        network: wallet.network,
        createdAt: wallet.created_at,
        updatedAt: wallet.updated_at
      }
    });

  } catch (error) {
    next(error);
  }
});

// Create new wallet
router.post('/create', authenticateToken, async (req, res, next) => {
  try {
    const { address, privateKeyEncrypted, mnemonicEncrypted, network = 'polygon' } = req.body;

    if (!address || !privateKeyEncrypted || !mnemonicEncrypted) {
      return res.status(400).json({
        success: false,
        message: 'Address, encrypted private key, and encrypted mnemonic are required'
      });
    }

    // Check if wallet address already exists
    const existingWallet = await query(
      'SELECT id FROM wallets WHERE address = ?',
      [address]
    );

    if (existingWallet.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Wallet with this address already exists'
      });
    }

    // Create wallet
    const result = await query(
      `INSERT INTO wallets (user_id, address, private_key_encrypted, mnemonic_encrypted, network, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [req.user.id, address, privateKeyEncrypted, mnemonicEncrypted, network]
    );

    const walletId = result.rows.insertId;

    // Log wallet creation
    await query(
      `INSERT INTO mobile_activity_logs (user_id, device_id, action, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, req.body.deviceId || 'unknown', 'wallet_created', `Wallet created: ${address}`, req.ip, req.headers['user-agent']]
    );

    res.status(201).json({
      success: true,
      message: 'Wallet created successfully',
      wallet: {
        id: walletId,
        address,
        network,
        createdAt: new Date().toISOString()
      }
    });

  } catch (error) {
    next(error);
  }
});

// Get wallet transactions (from existing customer_transactions table)
router.get('/transactions', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const offset = (page - 1) * limit;

    // Get user's bridge customer ID
    const userResult = await query(
      'SELECT bridge_customer_id FROM users WHERE id = ?',
      [req.user.id]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].bridge_customer_id) {
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

    const bridgeCustomerId = userResult.rows[0].bridge_customer_id;

    let whereClause = 'WHERE customer_id = ?';
    const params = [bridgeCustomerId];
    let paramCount = 1;

    if (type) {
      paramCount++;
      whereClause += ` AND type = ?`;
      params.push(type);
    }

    // Get transactions from customer_transactions table
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

// Get mobile wallet transactions (on-chain transactions)
router.get('/mobile-transactions', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE user_id = ?';
    const params = [req.user.id];
    let paramCount = 1;

    if (type) {
      paramCount++;
      whereClause += ` AND type = ?`;
      params.push(type);
    }

    // Get mobile transactions
    const transactionsResult = await query(
      `SELECT id, type, amount, currency, status, description, tx_hash, gas_used, gas_price, block_number, created_at, updated_at
       FROM mobile_wallet_transactions 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM mobile_wallet_transactions ${whereClause}`,
      params
    );

    const transactions = transactionsResult.rows.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status,
      description: tx.description,
      txHash: tx.tx_hash,
      gasUsed: tx.gas_used,
      gasPrice: tx.gas_price,
      blockNumber: tx.block_number,
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

// Add mobile wallet transaction
router.post('/mobile-transactions', authenticateToken, async (req, res, next) => {
  try {
    const { walletId, type, amount, currency, status, description, txHash, gasUsed, gasPrice, blockNumber } = req.body;

    // Validate required fields
    if (!walletId || !type || !amount || !currency || !status) {
      return res.status(400).json({
        success: false,
        message: 'Wallet ID, type, amount, currency, and status are required'
      });
    }

    // Verify wallet belongs to user
    const walletCheck = await query(
      'SELECT id FROM wallets WHERE id = ? AND user_id = ?',
      [walletId, req.user.id]
    );

    if (walletCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    const result = await query(
      `INSERT INTO mobile_wallet_transactions (user_id, wallet_id, type, amount, currency, status, description, tx_hash, gas_used, gas_price, block_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, walletId, type, amount, currency, status, description, txHash, gasUsed, gasPrice, blockNumber]
    );

    const transactionId = result.rows.insertId;

    res.status(201).json({
      success: true,
      message: 'Transaction recorded successfully',
      transaction: {
        id: transactionId,
        type,
        amount,
        currency,
        status,
        description,
        txHash
      }
    });

  } catch (error) {
    next(error);
  }
});

// Update transaction status
router.patch('/mobile-transactions/:id', authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, txHash, blockNumber } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const updateFields = ['status = ?'];
    const params = [status];

    if (txHash) {
      updateFields.push('tx_hash = ?');
      params.push(txHash);
    }

    if (blockNumber) {
      updateFields.push('block_number = ?');
      params.push(blockNumber);
    }

    params.push(id, req.user.id);

    const result = await query(
      `UPDATE mobile_wallet_transactions 
       SET ${updateFields.join(', ')}, updated_at = NOW()
       WHERE id = ? AND user_id = ?`,
      params
    );

    if (result.rows.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      message: 'Transaction updated successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Get wallet statistics
router.get('/stats', authenticateToken, async (req, res, next) => {
  try {
    // Get user's bridge customer ID
    const userResult = await query(
      'SELECT bridge_customer_id FROM users WHERE id = ?',
      [req.user.id]
    );

    let bridgeStats = {
      totalTransactions: 0,
      completedTransactions: 0,
      totalVolume: 0
    };

    if (userResult.rows.length > 0 && userResult.rows[0].bridge_customer_id) {
      const bridgeCustomerId = userResult.rows[0].bridge_customer_id;

      // Get Bridge transaction stats
      const bridgeStatsResult = await query(
        `SELECT 
           COUNT(*) as total_transactions,
           COUNT(CASE WHEN status = 'payment_processed' THEN 1 END) as completed_transactions,
           COALESCE(SUM(CASE WHEN status = 'payment_processed' THEN amount ELSE 0 END), 0) as total_volume
         FROM customer_transactions 
         WHERE customer_id = ?`,
        [bridgeCustomerId]
      );

      bridgeStats = {
        totalTransactions: parseInt(bridgeStatsResult.rows[0].total_transactions) || 0,
        completedTransactions: parseInt(bridgeStatsResult.rows[0].completed_transactions) || 0,
        totalVolume: parseFloat(bridgeStatsResult.rows[0].total_volume) || 0
      };
    }

    // Get mobile transaction stats
    const mobileStatsResult = await query(
      `SELECT 
         COUNT(*) as total_transactions,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_transactions,
         COALESCE(SUM(CASE WHEN status = 'completed' AND type = 'send' THEN amount ELSE 0 END), 0) as total_sent,
         COALESCE(SUM(CASE WHEN status = 'completed' AND type = 'receive' THEN amount ELSE 0 END), 0) as total_received
       FROM mobile_wallet_transactions 
       WHERE user_id = ?`,
      [req.user.id]
    );

    const mobileStats = mobileStatsResult.rows[0];

    res.json({
      success: true,
      stats: {
        bridge: bridgeStats,
        mobile: {
          totalTransactions: parseInt(mobileStats.total_transactions) || 0,
          completedTransactions: parseInt(mobileStats.completed_transactions) || 0,
          totalSent: parseFloat(mobileStats.total_sent) || 0,
          totalReceived: parseFloat(mobileStats.total_received) || 0
        }
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;