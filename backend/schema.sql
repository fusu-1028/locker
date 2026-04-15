CREATE DATABASE IF NOT EXISTS smart_locker
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_locker;

-- Optional: run the statements below as MySQL root if locker_user has not been created yet.
-- CREATE USER IF NOT EXISTS 'locker_user'@'127.0.0.1' IDENTIFIED BY '123456';
-- CREATE USER IF NOT EXISTS 'locker_user'@'localhost' IDENTIFIED BY '123456';
-- GRANT ALL PRIVILEGES ON smart_locker.* TO 'locker_user'@'127.0.0.1';
-- GRANT ALL PRIVILEGES ON smart_locker.* TO 'locker_user'@'localhost';
-- FLUSH PRIVILEGES;

CREATE TABLE IF NOT EXISTS parcels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL COMMENT 'User phone number',
  pickup_code CHAR(6) NOT NULL UNIQUE COMMENT '6-digit pickup code',
  cabinet_no TINYINT UNSIGNED NOT NULL DEFAULT 1 UNIQUE COMMENT 'Cabinet number',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Current parcels waiting for pickup';

CREATE TABLE IF NOT EXISTS parcel_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  parcel_id BIGINT UNSIGNED NULL COMMENT 'Historical parcel id',
  action ENUM('store', 'pickup') NOT NULL COMMENT 'Business action',
  phone VARCHAR(20) NOT NULL COMMENT 'User phone number',
  pickup_code CHAR(6) NOT NULL COMMENT '6-digit pickup code snapshot',
  cabinet_no TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Cabinet number',
  source VARCHAR(20) NOT NULL DEFAULT 'miniapp' COMMENT 'Request source: miniapp/hardware/debug',
  note VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Business note',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_records_created_at (created_at),
  INDEX idx_records_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Locker operation history';
