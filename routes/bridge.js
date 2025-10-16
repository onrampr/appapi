import express from 'express';
import axios from 'axios';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Bridge.xyz API configuration
const BRIDGE_API_URL = process.env.BRIDGE_API_URL || 'https://api.bridge.xyz';
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY;

// Helper function to make Bridge API calls
const bridgeAPICall = async (endpoint, data = {}) => {
  try {
    const response = await axios.post(`${BRIDGE_API_URL}${endpoint}`, data, {
      headers: {
        'Authorization': `Bearer ${BRIDGE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Bridge API error:', error.response?.data || error.message);
    throw error;
  }
};

// Initiate on-ramp (buy USDC)
router.post('/onramp', authenticateToken, async (req, res, next) => {
  try {
    const { amount, currency, walletAddress } = req.body;

    if (!amount || !currency || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Amount, currency, and wallet address are required'
      });
    }

    // Call Bridge.xyz API
    const bridgeResponse = await bridgeAPICall('/v1/onramp', {
      amount,
      currency,
      walletAddress,
      userId: req.user.userId
    });

    // Store transaction in database
    await query(
      'INSERT INTO customer_transactions (user_id, type, amount, currency, status, bridge_transaction_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [req.user.userId, 'onramp', amount, currency, 'pending', bridgeResponse.transactionId]
    );

    res.json({
      success: true,
      message: 'On-ramp initiated successfully',
      transaction: bridgeResponse
    });

  } catch (error) {
    console.error('On-ramp error:', error);
    next(error);
  }
});

// Initiate off-ramp (sell USDC)
router.post('/offramp', authenticateToken, async (req, res, next) => {
  try {
    const { amount, currency, bankAccount, walletAddress } = req.body;

    if (!amount || !currency || !bankAccount || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Amount, currency, bank account, and wallet address are required'
      });
    }

    // Call Bridge.xyz API
    const bridgeResponse = await bridgeAPICall('/v1/offramp', {
      amount,
      currency,
      bankAccount,
      walletAddress,
      userId: req.user.userId
    });

    // Store transaction in database
    await query(
      'INSERT INTO customer_transactions (user_id, type, amount, currency, status, bridge_transaction_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [req.user.userId, 'offramp', amount, currency, 'pending', bridgeResponse.transactionId]
    );

    res.json({
      success: true,
      message: 'Off-ramp initiated successfully',
      transaction: bridgeResponse
    });

  } catch (error) {
    console.error('Off-ramp error:', error);
    next(error);
  }
});

// Get Bridge transactions
router.get('/transactions', authenticateToken, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM customer_transactions WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );

    res.json({
      success: true,
      transactions: result.rows
    });

  } catch (error) {
    console.error('Bridge transactions error:', error);
    next(error);
  }
});

// Get supported currencies
router.get('/currencies', async (req, res, next) => {
  try {
    res.json({
      success: true,
      currencies: ['USD', 'EUR', 'GBP', 'USDC']
    });
  } catch (error) {
    console.error('Currencies error:', error);
    next(error);
  }
});

export default router;
