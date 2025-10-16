import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://onrampr.co';

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'ysdkgzpgms_rampr',
  connectionLimit: 10,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  charset: 'utf8mb4',
  timezone: '+00:00',
  supportBigNumbers: true,
  bigNumberStrings: true
};

// Create connection pool
let pool;
const createPool = () => {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
    console.log('✅ MySQL Connection Pool created.');
  }
  return pool;
};

// Connect to database
const connectDB = async () => {
  try {
    createPool();
    const connection = await pool.getConnection();
    console.log('✅ MySQL Database connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ MySQL Database connection failed:', error);
    process.exit(1);
  }
};

// Database query helper
const query = async (sql, params) => {
  const pool = createPool();
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(sql, params);
    return { rows, insertId: rows.insertId };
  } catch (error) {
    console.error('❌ Database query failed:', error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
};

// Connect to MySQL database
connectDB();

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Api-Key', 'Idempotency-Key'],
  credentials: true
}));
app.use(express.json());
app.use(compression());

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Allow 1000 requests per 15 minutes
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl} - ${new Date().toISOString()}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  const memoryUsage = process.memoryUsage();
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    memory: memoryUsage,
    port: PORT,
    externalUrl: FRONTEND_URL
  });
});

// Auth middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access token required' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const result = await query(
      'SELECT id, email, first_name, last_name FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = result.rows[0];
    req.user = {
      userId: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name
    };

    next();
  } catch (error) {
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid token' 
    });
  }
};

// Auth Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user
    const userResult = await query(
      'SELECT id, first_name, last_name, email, password FROM users WHERE email = ?',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = userResult.rows[0];

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
      { 
        userId: user.id, 
        email: user.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const result = await query(
      'INSERT INTO users (first_name, last_name, email, password, created_at) VALUES (?, ?, ?, ?, NOW())',
      [firstName, lastName, email, hashedPassword]
    );

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: result.insertId, 
        email: email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return success response
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: result.insertId,
        firstName,
        lastName,
        email
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Wallet Routes
app.get('/api/wallet/list', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Wallet endpoint ready',
    wallets: []
  });
});

app.post('/api/wallet/backup', authenticateToken, async (req, res) => {
  try {
    const { encryptedMnemonic } = req.body;

    if (!encryptedMnemonic) {
      return res.status(400).json({
        success: false,
        message: 'Encrypted mnemonic is required'
      });
    }

    // Store encrypted mnemonic in database
    await query(
      'INSERT INTO wallets (user_id, encrypted_mnemonic, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE encrypted_mnemonic = VALUES(encrypted_mnemonic)',
      [req.user.userId, encryptedMnemonic]
    );

    res.json({
      success: true,
      message: 'Mnemonic backed up successfully'
    });

  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

app.get('/api/wallet/restore', authenticateToken, async (req, res) => {
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
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// User Routes
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const userResult = await query(
      'SELECT id, first_name, last_name, email, created_at FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Bridge Routes (simplified)
app.post('/api/bridge/onramp', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'On-ramp initiated successfully',
    transaction: { id: 'test-transaction-id' }
  });
});

app.post('/api/bridge/offramp', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Off-ramp initiated successfully',
    transaction: { id: 'test-transaction-id' }
  });
});

app.get('/api/bridge/transactions', authenticateToken, (req, res) => {
  res.json({
    success: true,
    transactions: []
  });
});

// Debugging endpoint
app.get('/api/test', (req, res) => {
  console.log('Test endpoint called');
  res.status(200).json({
    success: true,
    message: 'Test endpoint working!',
    port: PORT,
    externalUrl: FRONTEND_URL
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: ${FRONTEND_URL}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
  console.log(`🌐 External URL: https://api.onrampr.co`);
  console.log(`💾 Memory usage: ${JSON.stringify(process.memoryUsage())}`);
  console.log('🔍 Server ready - check terminal for request logs');
});
