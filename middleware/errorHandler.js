// Global error handling middleware
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let error = {
    success: false,
    message: err.message || 'Internal Server Error',
    statusCode: err.statusCode || 500,
  };

  // Validation errors
  if (err.name === 'ValidationError') {
    error.message = Object.values(err.errors).map(val => val.message).join(', ');
    error.statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    error.statusCode = 401;
  }

  // Database errors
  if (err.code === '23505') { // Unique violation
    error.message = 'Resource already exists';
    error.statusCode = 409;
  }

  if (err.code === '23503') { // Foreign key violation
    error.message = 'Referenced resource not found';
    error.statusCode = 400;
  }

  // Rate limiting errors
  if (err.statusCode === 429) {
    error.message = 'Too many requests, please try again later';
    error.statusCode = 429;
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && error.statusCode === 500) {
    error.message = 'Internal Server Error';
  }

  // Log error details in development
  if (process.env.NODE_ENV === 'development') {
    error.stack = err.stack;
    error.details = err;
  }

  res.status(error.statusCode).json(error);
};
