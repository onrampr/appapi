import mysql from 'mysql2/promise';

// Database configuration for existing onrampr database
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

export const createPool = () => {
  if (!pool) {
    pool = mysql.createPool(dbConfig);
  }
  return pool;
};

// Test database connection
export const testConnection = async () => {
  try {
    const connectionPool = createPool();
    const connection = await connectionPool.getConnection();
    console.log('✅ MySQL Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ MySQL Database connection failed:', error.message);
    return false;
  }
};

// Connect to database (alias for testConnection)
export const connectDB = async () => {
  try {
    const connectionPool = createPool();
    const connection = await connectionPool.getConnection();
    console.log('✅ MySQL Database connected successfully');
    connection.release();
  } catch (error) {
    console.error('❌ MySQL Database connection failed:', error);
    process.exit(1);
  }
};

// Database query helper
export const query = async (text, params = []) => {
  const start = Date.now();
  try {
    const connectionPool = createPool();
    const [rows, fields] = await connectionPool.execute(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text: text.substring(0, 100) + '...', duration, rows: Array.isArray(rows) ? rows.length : 1 });
    return { rows, fields };
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

// Transaction helper
export const transaction = async (callback) => {
  const connectionPool = createPool();
  const connection = await connectionPool.getConnection();
  
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Get pool instance
export const getPool = () => {
  return createPool();
};

export default createPool;
