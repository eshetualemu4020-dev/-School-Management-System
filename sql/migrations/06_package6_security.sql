-- Migration: 06_package6_security.sql
-- Package 6: Real Security Administration
-- Adds login_attempts, user_two_factor, last_seen_at column on refresh_sessions, and security policy settings.

SET NAMES utf8mb4;

-- 1. Ensure refresh_sessions has last_seen_at
SET @dbname = DATABASE();
SET @tablename = 'refresh_sessions';
SET @columnname = 'last_seen_at';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  'ALTER TABLE `refresh_sessions` ADD COLUMN `last_seen_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `issued_at`'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 2. Create login_attempts table
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `user_id` BIGINT UNSIGNED NULL COMMENT 'Associated user if resolved',
  `username` VARCHAR(190) NOT NULL COMMENT 'Username or email attempted',
  `ip_address` VARCHAR(45) NULL COMMENT 'Client IP address',
  `user_agent` VARCHAR(255) NULL COMMENT 'Client user agent',
  `success` TINYINT(1) NOT NULL COMMENT '1 = success, 0 = failure',
  `failure_reason` VARCHAR(100) NULL COMMENT 'Reason if failed (e.g. invalid_password, locked, not_found)',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Timestamp of attempt (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_login_attempts_username` (`username`, `created_at`),
  KEY `ix_login_attempts_ip` (`ip_address`, `created_at`),
  KEY `ix_login_attempts_user` (`user_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audit log of all login attempts for security and lockout policies.';

-- 3. Create user_two_factor table
CREATE TABLE IF NOT EXISTS `user_two_factor` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'User owner',
  `secret_encrypted` VARCHAR(255) NOT NULL COMMENT 'Base32 TOTP secret',
  `backup_codes_json` JSON NULL COMMENT 'Array of single-use recovery codes',
  `is_enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = active, 0 = disabled',
  `enabled_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'When MFA was activated',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_two_factor_user` (`user_id`),
  CONSTRAINT `fk_user_two_factor_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Two-factor authentication credentials per user.';

-- 4. Seed system settings for security policies
INSERT INTO `system_settings` (`setting_key`, `value_json`, `description`, `version`, `updated_at`)
VALUES
  ('security.password_min_length', '8', 'Minimum required password characters (default: 8)', 1, NOW(3)),
  ('security.password_require_uppercase', 'true', 'Require at least one uppercase letter in passwords', 1, NOW(3)),
  ('security.password_require_lowercase', 'true', 'Require at least one lowercase letter in passwords', 1, NOW(3)),
  ('security.password_require_number', 'true', 'Require at least one digit in passwords', 1, NOW(3)),
  ('security.password_require_symbol', 'false', 'Require at least one symbol in passwords', 1, NOW(3)),
  ('security.max_failed_logins', '5', 'Number of consecutive failed logins before temporary lockout', 1, NOW(3)),
  ('security.lockout_duration_minutes', '15', 'Temporary account lockout duration in minutes', 1, NOW(3)),
  ('security.require_mfa_roles', '["system_admin"]', 'Roles strictly requiring two-factor authentication', 1, NOW(3)),
  ('security.session_timeout_minutes', '15', 'Access token inactivity timeout in minutes', 1, NOW(3))
ON DUPLICATE KEY UPDATE
  `value_json` = VALUES(`value_json`),
  `description` = VALUES(`description`),
  `updated_at` = NOW(3);
