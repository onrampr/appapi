import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import bridgeRoutes from './routes/bridge.js';
import userRoutes from './routes/user.js';
import { connectDB, query } from './config/database.js';
import errorHandler from './middleware/errorHandler.js';
import notFound from './middleware/notFound.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://onrampr.co';

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
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/bridge', bridgeRoutes);
app.use('/api/user', userRoutes);

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

// Not Found Middleware
app.use(notFound);

// Error Handling Middleware
app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: ${FRONTEND_URL}`);
  console.log(`🔗 API URL: http://localhost:${PORT}/api`);
  console.log(`🌐 External URL: https://api.onrampr.co`); // Assuming this is the external facing URL
  console.log(`💾 Memory usage: ${JSON.stringify(process.memoryUsage())}`);

  // Log all registered routes for debugging
  console.log('📋 Available routes:');
  app._router.stack.forEach(function(r){
    if (r.route && r.route.path){
      console.log(`   ${Object.keys(r.route.methods).join(', ').toUpperCase()}  ${r.route.path}`);
    }
  });
  console.log('🔍 Server ready - check terminal for request logs');
});
