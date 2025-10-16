import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req, res, next) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        firstName: req.user.first_name,
        lastName: req.user.last_name,
        email: req.user.email,
        isVerified: req.user.is_verified,
        kycStatus: req.user.kyc_status,
        createdAt: req.user.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res, next) => {
  try {
    const { firstName, lastName } = req.body;

    // Validate input
    if (!firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'First name and last name are required'
      });
    }

    // Update user profile
    const result = await query(
      'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
      [firstName, lastName, req.user.id]
    );

    if (result.rows.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: req.user.id,
        firstName: firstName,
        lastName: lastName,
        email: req.user.email,
        isVerified: req.user.is_verified,
        kycStatus: req.user.kyc_status
      }
    });

  } catch (error) {
    next(error);
  }
});

// Change password
router.post('/change-password', authenticateToken, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    // Get current password hash
    const result = await query(
      'SELECT password FROM users WHERE id = ?',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, req.user.id]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Enable two-factor authentication
router.post('/2fa/enable', authenticateToken, async (req, res, next) => {
  try {
    const { secret, code } = req.body;

    if (!secret || !code) {
      return res.status(400).json({
        success: false,
        message: 'Secret and verification code are required'
      });
    }

    // TODO: Implement 2FA verification logic here
    // For now, we'll just store the secret
    
    await query(
      'UPDATE users SET two_factor_secret = ?, two_factor_enabled = 1 WHERE id = ?',
      [secret, req.user.id]
    );

    res.json({
      success: true,
      message: 'Two-factor authentication enabled successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Disable two-factor authentication
router.post('/2fa/disable', authenticateToken, async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Verification code is required'
      });
    }

    // TODO: Implement 2FA verification logic here
    // For now, we'll just disable 2FA
    
    await query(
      'UPDATE users SET two_factor_secret = NULL, two_factor_enabled = 0 WHERE id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      message: 'Two-factor authentication disabled successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Get KYC status
router.get('/kyc/status', authenticateToken, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT kyc_status, kyc_data FROM users WHERE id = ?',
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
      kycData: user.kyc_data ? JSON.parse(user.kyc_data) : null
    });

  } catch (error) {
    next(error);
  }
});

// Update KYC status
router.put('/kyc/status', authenticateToken, async (req, res, next) => {
  try {
    const { status, data } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'KYC status is required'
      });
    }

    // Validate status
    const validStatuses = ['pending', 'under_review', 'active', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid KYC status'
      });
    }

    await query(
      'UPDATE users SET kyc_status = ?, kyc_data = ? WHERE id = ?',
      [status, data ? JSON.stringify(data) : null, req.user.id]
    );

    res.json({
      success: true,
      message: 'KYC status updated successfully',
      kycStatus: status
    });

  } catch (error) {
    next(error);
  }
});

// Get user activity logs
router.get('/activity', authenticateToken, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT action, details, ip_address, user_agent, created_at
       FROM user_activity_logs 
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, parseInt(limit), parseInt(offset)]
    );

    const activities = result.rows.map(activity => ({
      action: activity.action,
      details: activity.details,
      ipAddress: activity.ip_address,
      userAgent: activity.user_agent,
      createdAt: activity.created_at
    }));

    res.json({
      success: true,
      activities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    next(error);
  }
});

// Log user activity
router.post('/activity', authenticateToken, async (req, res, next) => {
  try {
    const { action, details } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        message: 'Action is required'
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await query(
      `INSERT INTO user_activity_logs (user_id, action, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, action, details, ipAddress, userAgent]
    );

    res.json({
      success: true,
      message: 'Activity logged successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Delete user account
router.delete('/account', authenticateToken, async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password confirmation is required'
      });
    }

    // Verify password
    const result = await query(
      'SELECT password FROM users WHERE id = ?',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Password is incorrect'
      });
    }

    // Start transaction to delete user data
    const connection = await query('START TRANSACTION');

    try {
      // Delete user activity logs
      await query('DELETE FROM user_activity_logs WHERE user_id = ?', [req.user.id]);
      
      // Delete wallet transactions
      await query('DELETE FROM wallet_transactions WHERE user_id = ?', [req.user.id]);
      
      // Delete bridge transactions
      await query('DELETE FROM bridge_transactions WHERE user_id = ?', [req.user.id]);
      
      // Delete user
      await query('DELETE FROM users WHERE id = ?', [req.user.id]);
      
      await query('COMMIT');

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });

    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    next(error);
  }
});

export default router;