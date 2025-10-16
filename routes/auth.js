import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateRegister, validateLogin } from '../utils/validation.js';

const router = express.Router();

// Register new user (integrates with existing web users)
router.post('/register', async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = validateRegister(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { firstName, lastName, email, password } = value;

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user (using existing users table structure)
    const result = await query(
      `INSERT INTO users (first_name, last_name, email, password, verification_code, verification_code_expires, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [firstName, lastName, email, hashedPassword, verificationCode, verificationExpires]
    );

    // Get the created user
    const userResult = await query(
      'SELECT id, first_name, last_name, email, is_verified, kyc_status, tos_status, bridge_customer_id, created_at FROM users WHERE id = ?',
      [result.rows.insertId]
    );

    const user = userResult.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Log mobile registration activity
    await query(
      `INSERT INTO mobile_activity_logs (user_id, device_id, action, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, req.body.deviceId || 'unknown', 'mobile_register', 'Mobile app registration', req.ip, req.headers['user-agent']]
    );

    // TODO: Send verification email (integrate with existing email system)
    console.log(`Verification code for ${email}: ${verificationCode}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        isVerified: user.is_verified,
        kycStatus: user.kyc_status,
        tosStatus: user.tos_status,
        bridgeCustomerId: user.bridge_customer_id,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    next(error);
  }
});

// Login user (works with existing web users)
router.post('/login', async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = validateLogin(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { email, password, deviceId } = value;

    // Find user
    const result = await query(
      'SELECT id, first_name, last_name, email, password, is_verified, kyc_status, tos_status, bridge_customer_id, created_at FROM users WHERE email = ?',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Update last mobile login
    await query(
      'UPDATE users SET last_mobile_login = NOW() WHERE id = ?',
      [user.id]
    );

    // Store mobile session
    const tokenHash = jwt.sign(token, process.env.JWT_SECRET);
    await query(
      `INSERT INTO mobile_sessions (user_id, device_id, token_hash, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [user.id, deviceId || 'unknown', tokenHash, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]
    );

    // Log mobile login activity
    await query(
      `INSERT INTO mobile_activity_logs (user_id, device_id, action, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, deviceId || 'unknown', 'mobile_login', 'Mobile app login', req.ip, req.headers['user-agent']]
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        isVerified: user.is_verified,
        kycStatus: user.kyc_status,
        tosStatus: user.tos_status,
        bridgeCustomerId: user.bridge_customer_id,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    next(error);
  }
});

// Verify email (works with existing verification system)
router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    // Find user with valid verification code
    const result = await query(
      'SELECT id, email FROM users WHERE verification_code = ? AND verification_code_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification token'
      });
    }

    const user = result.rows[0];

    // Update user verification status
    await query(
      'UPDATE users SET is_verified = 1, verification_code = NULL, verification_code_expires = NULL, updated_at = NOW() WHERE id = ?',
      [user.id]
    );

    // Log verification activity
    await query(
      `INSERT INTO mobile_activity_logs (user_id, device_id, action, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, req.body.deviceId || 'unknown', 'mobile_verify_email', 'Mobile app email verification', req.ip, req.headers['user-agent']]
    );

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Forgot password (integrates with existing system)
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Check if user exists
    const result = await query(
      'SELECT id, email FROM users WHERE email = ?',
      [email]
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Store reset token in database (using existing structure)
    await query(
      'UPDATE users SET verification_code = ?, verification_code_expires = DATE_ADD(NOW(), INTERVAL 1 HOUR), updated_at = NOW() WHERE id = ?',
      [resetToken, user.id]
    );

    // Log forgot password activity
    await query(
      `INSERT INTO mobile_activity_logs (user_id, device_id, action, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, req.body.deviceId || 'unknown', 'mobile_forgot_password', 'Mobile app forgot password', req.ip, req.headers['user-agent']]
    );

    // TODO: Send password reset email (integrate with existing email system)
    console.log(`Password reset token for ${email}: ${resetToken}`);

    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent'
    });

  } catch (error) {
    next(error);
  }
});

// Reset password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and password are required'
      });
    }

    // Check if reset token exists and is valid
    const result = await query(
      'SELECT id FROM users WHERE verification_code = ? AND verification_code_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    const userId = result.rows[0].id;

    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update password and clear reset token
    await query(
      'UPDATE users SET password = ?, verification_code = NULL, verification_code_expires = NULL, updated_at = NOW() WHERE id = ?',
      [hashedPassword, userId]
    );

    // Log password reset activity
    await query(
      `INSERT INTO mobile_activity_logs (user_id, device_id, action, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, req.body.deviceId || 'unknown', 'mobile_reset_password', 'Mobile app password reset', req.ip, req.headers['user-agent']]
    );

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', authenticateToken, async (req, res, next) => {
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
        tosStatus: req.user.tos_status,
        bridgeCustomerId: req.user.bridge_customer_id
      }
    });
  } catch (error) {
    next(error);
  }
});

// Logout (clean up mobile session)
router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    const { deviceId } = req.body;

    // Remove mobile session
    if (deviceId) {
      await query(
        'DELETE FROM mobile_sessions WHERE user_id = ? AND device_id = ?',
        [req.user.id, deviceId]
      );
    }

    // Log logout activity
    await query(
      `INSERT INTO mobile_activity_logs (user_id, device_id, action, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, deviceId || 'unknown', 'mobile_logout', 'Mobile app logout', req.ip, req.headers['user-agent']]
    );

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    next(error);
  }
});

// Check if user exists (for web app integration)
router.get('/exists/:email', async (req, res, next) => {
  try {
    const { email } = req.params;

    const result = await query(
      'SELECT id, email, first_name, last_name FROM users WHERE email = ?',
      [email]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        exists: false
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      exists: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;