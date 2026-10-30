-- Migration 07: Package 5 - Disaster Recovery, Backup, Restore, Recycle Bin, and System Health
-- Safe, idempotent execution for School Management ERP

-- 1. Backups Table
CREATE TABLE IF NOT EXISTS backups (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  type ENUM('manual', 'scheduled', 'pre_close') NOT NULL DEFAULT 'manual',
  status ENUM('completed', 'failed', 'restoring') NOT NULL DEFAULT 'completed',
  checksum VARCHAR(64) NULL,
  notes VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_backups_created_at (created_at),
  CONSTRAINT fk_backups_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add Soft Delete columns to main entity tables
-- students
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE students ADD COLUMN deleted_at TIMESTAMP(3) NULL AFTER updated_at, ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at, ADD INDEX idx_students_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- staff
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' AND COLUMN_NAME = 'deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE staff ADD COLUMN deleted_at TIMESTAMP(3) NULL AFTER updated_at, ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at, ADD INDEX idx_staff_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sections
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sections' AND COLUMN_NAME = 'deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE sections ADD COLUMN deleted_at TIMESTAMP(3) NULL AFTER updated_at, ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at, ADD INDEX idx_sections_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- subjects
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subjects' AND COLUMN_NAME = 'deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE subjects ADD COLUMN deleted_at TIMESTAMP(3) NULL AFTER updated_at, ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at, ADD INDEX idx_subjects_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- announcements
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcements' AND COLUMN_NAME = 'deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE announcements ADD COLUMN deleted_at TIMESTAMP(3) NULL AFTER updated_at, ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at, ADD INDEX idx_announcements_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- books
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'books' AND COLUMN_NAME = 'deleted_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE books ADD COLUMN deleted_at TIMESTAMP(3) NULL AFTER updated_at, ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at, ADD INDEX idx_books_deleted_at (deleted_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Seed Disaster Recovery and System Health Settings
INSERT INTO system_settings (setting_key, value_json, description)
VALUES
  ('backup.retention_daily', CAST('30' AS JSON), 'Daily database backup retention limit in days'),
  ('backup.retention_monthly', CAST('12' AS JSON), 'Monthly database backup retention limit in months'),
  ('backup.auto_scheduled', CAST('true' AS JSON), 'Enable automated daily background database backups'),
  ('system.maintenance_mode', CAST('false' AS JSON), 'System maintenance flag blocking non-administrator operations'),
  ('recycle_bin.retention_days', CAST('30' AS JSON), 'Grace period in days before soft-deleted records are permanently purged')
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP(3);
