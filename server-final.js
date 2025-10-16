import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware only
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://onrampr.co',
  credentials: true
}));

// More lenient rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased from 100 to 1000
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    memory: process.memoryUsage(),
    port: PORT
  });
});

// Basic API routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    port: PORT
  });
});

// Auth routes - Multiple methods to ensure it works
app.get('/api/auth/login', (req, res) => {
  res.json({
    success: true,
    message: 'Login endpoint ready (GET)',
    timestamp: new Date().toISOString(),
    port: PORT,
    method: 'GET'
  });
});

app.post('/api/auth/login', (req, res) => {
  res.json({
    success: true,
    message: 'Login endpoint ready (POST)',
    timestamp: new Date().toISOString(),
    port: PORT,
    method: 'POST',
    body: req.body
  });
});

// Alternative auth route
app.all('/api/auth/login', (req, res) => {
  res.json({
    success: true,
    message: 'Login endpoint ready (ALL)',
    timestamp: new Date().toISOString(),
    port: PORT,
    method: req.method,
    body: req.body
  });
});

// Simple wallet route
app.get('/api/wallet/list', (req, res) => {
  res.json({
    success: true,
    message: 'Wallet endpoint ready',
    wallets: [],
    port: PORT
  });
});

// Test route for debugging
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Test endpoint working',
    timestamp: new Date().toISOString(),
    port: PORT,
    headers: req.headers
  });
});

// Simple register route
app.post('/api/auth/register', (req, res) => {
  res.json({
    success: true,
    message: 'Register endpoint ready',
    timestamp: new Date().toISOString(),
    port: PORT,
    method: 'POST',
    body: req.body
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    availableRoutes: [
      'GET /health',
      'GET /api/health',
      'GET /api/test',
      'GET /api/auth/login',
      'POST /api/auth/login',
      'ALL /api/auth/login',
      'POST /api/auth/register',
      'GET /api/wallet/list'
    ]
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => { // Listen on all interfaces
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'https://onrampr.co'}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
  console.log(`🌐 External URL: https://api.onrampr.co`);
  console.log(`💾 Memory usage: ${JSON.stringify(process.memoryUsage())}`);
  console.log(`📋 Available routes:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /api/health`);
  console.log(`   GET  /api/test`);
  console.log(`   GET  /api/auth/login`);
  console.log(`   POST /api/auth/login`);
  console.log(`   ALL  /api/auth/login`);
  console.log(`   POST /api/auth/register`);
  console.log(`   GET  /api/wallet/list`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});
