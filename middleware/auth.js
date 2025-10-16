import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

// Middleware to verify JWT token and authenticate user
export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access token required' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify user still exists and is active (using existing users table)
    const result = await query(
      'SELECT id, email, first_name, last_name, is_verified, kyc_status, tos_status, bridge_customer_id FROM users WHERE id = ?',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = result.rows[0];
    
    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      is_verified: user.is_verified,
      kyc_status: user.kyc_status,
      tos_status: user.tos_status,
      bridge_customer_id: user.bridge_customer_id
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication error' 
    });
  }
};

// Optional middleware for mobile sessions
export const authenticateMobileSession = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const deviceId = req.headers['x-device-id'];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access token required' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check mobile session if device ID is provided
    if (deviceId) {
      const sessionResult = await query(
        'SELECT id FROM mobile_sessions WHERE user_id = ? AND device_id = ? AND expires_at > NOW()',
        [decoded.id, deviceId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid or expired session' 
        });
      }
    }

    // Verify user still exists and is active
    const result = await query(
      'SELECT id, email, first_name, last_name, is_verified, kyc_status, tos_status, bridge_customer_id FROM users WHERE id = ?',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = result.rows[0];
    
    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      is_verified: user.is_verified,
      kyc_status: user.kyc_status,
      tos_status: user.tos_status,
      bridge_customer_id: user.bridge_customer_id
    };

    // Update last accessed time for mobile session
    if (deviceId) {
      await query(
        'UPDATE mobile_sessions SET last_accessed = NOW() WHERE user_id = ? AND device_id = ?',
        [user.id, deviceId]
      );
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired' 
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication error' 
    });
  }
};

// Middleware to check if user is verified
export const requireVerified = (req, res, next) => {
  if (!req.user || !req.user.is_verified) {
    return res.status(403).json({
      success: false,
      message: 'Email verification required'
    });
  }
  next();
};

// Middleware to check if user has completed KYC
export const requireKYC = (req, res, next) => {
  if (!req.user || req.user.kyc_status !== 'active') {
    return res.status(403).json({
      success: false,
      message: 'KYC verification required'
    });
  }
  next();
};

// Middleware to check if user has accepted terms of service
export const requireTOS = (req, res, next) => {
  if (!req.user || req.user.tos_status !== 'approved') {
    return res.status(403).json({
      success: false,
      message: 'Terms of service acceptance required'
    });
  }
  next();
};

// Middleware to check if user has Bridge customer ID
export const requireBridgeCustomer = (req, res, next) => {
  if (!req.user || !req.user.bridge_customer_id) {
    return res.status(403).json({
      success: false,
      message: 'Bridge customer setup required'
    });
  }
  next();
};

// Optional middleware - doesn't fail if token is missing
export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query(
      'SELECT id, email, first_name, last_name, is_verified, kyc_status, tos_status, bridge_customer_id FROM users WHERE id = ?',
      [decoded.id]
    );

    req.user = result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    req.user = null;
  }

  next();
};