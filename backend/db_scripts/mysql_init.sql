-- Kbuiq Database Schema

CREATE TABLE IF NOT EXISTS system_config (
    `key` VARCHAR(50) PRIMARY KEY,
    `value` JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    endpoint VARCHAR(1024) NOT NULL,
    type VARCHAR(20) DEFAULT 'http', -- 'http', 'tcp', 'mysql', 'mongodb'
    current_status VARCHAR(50) DEFAULT 'unknown',
    uptime FLOAT DEFAULT 100.0,
    average_response_time FLOAT DEFAULT 0.0,
    headers JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_id INT NOT NULL,
    timestamp DATETIME NOT NULL,
    response_time INT,
    status INT,
    success BOOLEAN,
    error TEXT,
    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
    INDEX idx_service_time (service_id, timestamp)
);

CREATE TABLE IF NOT EXISTS notification_channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'webhook', 'email'
    config JSON NOT NULL,
    events JSON NOT NULL, -- { "up": true, "down": true }
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'kubiq-viewer', -- 'kubiq-admin', 'kubiq-viewer'
    enabled BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed Initial System Config
INSERT IGNORE INTO system_config (`key`, `value`) VALUES ('status_page', '{"title": "Kubiq Status", "refreshInterval": 60000, "slug": null}');

CREATE TABLE IF NOT EXISTS passkeys (
    id VARCHAR(255) PRIMARY KEY, -- Credential ID
    public_key TEXT NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    webauthn_user_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) DEFAULT 'My Passkey',
    counter BIGINT NOT NULL,
    device_type VARCHAR(50) NOT NULL,
    backed_up BOOLEAN NOT NULL,
    transports JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id)
);


CREATE TABLE IF NOT EXISTS system_metrics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cpu_load FLOAT NOT NULL,
    memory_used BIGINT NOT NULL,
    memory_total BIGINT NOT NULL,
    disk_usage JSON NOT NULL, -- Array of mount points and usage
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_timestamp (timestamp)
);
