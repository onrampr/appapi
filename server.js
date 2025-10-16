import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Health check - WORKING
app.get('/health', (req, res) => {
  console.log('Health check called');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    port: PORT
  });
});

// API health check - WORKING
app.get('/api/health', (req, res) => {
  console.log('API health check called');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    port: PORT
  });
});

// Test endpoint - SHOULD WORK
app.get('/api/test', (req, res) => {
  console.log('Test endpoint called');
  res.json({
    success: true,
    message: 'Test endpoint working',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Auth login - GET - SHOULD WORK
app.get('/api/auth/login', (req, res) => {
  console.log('Auth login GET called');
  res.json({
    success: true,
    message: 'Login endpoint ready (GET)',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Auth login - POST - SHOULD WORK
app.post('/api/auth/login', (req, res) => {
  console.log('Auth login POST called');
  res.json({
    success: true,
    message: 'Login endpoint ready (POST)',
    timestamp: new Date().toISOString(),
    port: PORT,
    body: req.body
  });
});

// Auth register - POST - SHOULD WORK
app.post('/api/auth/register', (req, res) => {
  console.log('Auth register POST called');
  res.json({
    success: true,
    message: 'Register endpoint ready',
    timestamp: new Date().toISOString(),
    port: PORT,
    body: req.body
  });
});

// Wallet list - SHOULD WORK
app.get('/api/wallet/list', (req, res) => {
  console.log('Wallet list called');
  res.json({
    success: true,
    message: 'Wallet endpoint ready',
    wallets: [],
    port: PORT
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log(`404 - ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    port: PORT,
    availableRoutes: [
      'GET /health',
      'GET /api/health',
      'GET /api/test',
      'GET /api/auth/login',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/wallet/list'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 External URL: https://api.onrampr.co`);
  console.log(`📋 Available routes:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /api/health`);
  console.log(`   GET  /api/test`);
  console.log(`   GET  /api/auth/login`);
  console.log(`   POST /api/auth/login`);
  console.log(`   POST /api/auth/register`);
  console.log(`   GET  /api/wallet/list`);
  console.log(`\n🔍 Server ready - check terminal for request logs`);
});