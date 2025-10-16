-- Integration Schema for Mobile App
-- This adds mobile-specific features to your existing database
-- Run these ALTER statements on your existing database

-- Add mobile app fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS mobile_device_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS mobile_fcm_token VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS biometric_enabled TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS app_version VARCHAR(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS last_mobile_login DATETIME DEFAULT NULL;

-- Add mobile app fields to wallets table
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS mobile_backup_created TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_mobile_access DATETIME DEFAULT NULL;

-- Create mobile sessions table for JWT token management
CREATE TABLE IF NOT EXISTS mobile_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_device (user_id, device_id),
    INDEX idx_token_hash (token_hash),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create mobile wallet transactions table (for on-chain transactions)
CREATE TABLE IF NOT EXISTS mobile_wallet_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    wallet_id INT NOT NULL,
    type ENUM('send', 'receive', 'bridge_buy', 'bridge_sell') NOT NULL,
    amount DECIMAL(20, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL,
    description TEXT,
    tx_hash VARCHAR(66),
    gas_used BIGINT,
    gas_price BIGINT,
    block_number BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_wallet_id (wallet_id),
    INDEX idx_type (type),
    INDEX idx_status (status),
    INDEX idx_tx_hash (tx_hash),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create mobile activity logs table
CREATE TABLE IF NOT EXISTS mobile_activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    device_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_action (action),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create mobile app settings table
CREATE TABLE IF NOT EXISTS mobile_app_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_setting (user_id, setting_key),
    INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create push notification queue table
CREATE TABLE IF NOT EXISTS push_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    device_id VARCHAR(255),
    fcm_token VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSON,
    status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
    sent_at DATETIME,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default mobile app settings for existing users
INSERT INTO mobile_app_settings (user_id, setting_key, setting_value)
SELECT 
    id as user_id,
    'biometric_enabled' as setting_key,
    'false' as setting_value
FROM users
WHERE id NOT IN (SELECT user_id FROM mobile_app_settings WHERE setting_key = 'biometric_enabled');

INSERT INTO mobile_app_settings (user_id, setting_key, setting_value)
SELECT 
    id as user_id,
    'push_notifications' as setting_key,
    'true' as setting_value
FROM users
WHERE id NOT IN (SELECT user_id FROM mobile_app_settings WHERE setting_key = 'push_notifications');

INSERT INTO mobile_app_settings (user_id, setting_key, setting_value)
SELECT 
    id as user_id,
    'theme' as setting_key,
    'light' as setting_value
FROM users
WHERE id NOT IN (SELECT user_id FROM mobile_app_settings WHERE setting_key = 'theme');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_bridge_customer_id ON users(bridge_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer_id ON customer_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_type ON customer_transactions(type);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_status ON customer_transactions(status);
