import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3000; // Fixed port 3000

// Basic middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    port: PORT
  });
});

// API health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    port: PORT
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Test endpoint working',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Auth login - GET
app.get('/api/auth/login', (req, res) => {
  res.json({
    success: true,
    message: 'Login endpoint ready (GET)',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Auth login - POST
app.post('/api/auth/login', (req, res) => {
  res.json({
    success: true,
    message: 'Login endpoint ready (POST)',
    timestamp: new Date().toISOString(),
    port: PORT,
    body: req.body
  });
});

// Auth register - POST
app.post('/api/auth/register', (req, res) => {
  res.json({
    success: true,
    message: 'Register endpoint ready',
    timestamp: new Date().toISOString(),
    port: PORT,
    body: req.body
  });
});

// Wallet list
app.get('/api/wallet/list', (req, res) => {
  res.json({
    success: true,
    message: 'Wallet endpoint ready',
    wallets: [],
    port: PORT
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    port: PORT
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
});