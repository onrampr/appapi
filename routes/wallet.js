import express from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Backup encrypted mnemonic
router.post('/backup', authenticateToken, async (req, res, next) => {
  try {
    const { encryptedMnemonic } = req.body;

    if (!encryptedMnemonic) {
      return res.status(400).json({
        success: false,
        message: 'Encrypted mnemonic is required'
      });
    }

    // Store encrypted mnemonic in database
    const result = await query(
      'INSERT INTO wallets (user_id, encrypted_mnemonic, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE encrypted_mnemonic = VALUES(encrypted_mnemonic)',
      [req.user.userId, encryptedMnemonic]
    );

    res.json({
      success: true,
      message: 'Mnemonic backed up successfully'
    });

  } catch (error) {
    console.error('Backup error:', error);
    next(error);
  }
});

// Restore encrypted mnemonic
router.get('/restore', authenticateToken, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT encrypted_mnemonic FROM wallets WHERE user_id = ?',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No backup found'
      });
    }

    res.json({
      success: true,
      encryptedMnemonic: result.rows[0].encrypted_mnemonic
    });

  } catch (error) {
    console.error('Restore error:', error);
    next(error);
  }
});

// Get wallet transactions
router.get('/transactions', authenticateToken, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.userId]
    );

    res.json({
      success: true,
      transactions: result.rows
    });

  } catch (error) {
    console.error('Transactions error:', error);
    next(error);
  }
});

export default router;
