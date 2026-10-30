-- =====================================================================
-- MIGRATION 18: STUDENT SUBMISSION ATTACHMENTS (SCOPE A FILE UPLOADS)
-- =====================================================================

SET NAMES utf8mb4;

SET @exist := (
  SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'submissions' 
    AND COLUMN_NAME = 'document_id'
);

SET @query = IF(
  @exist = 0, 
  'ALTER TABLE `submissions` ADD COLUMN `document_id` BIGINT UNSIGNED NULL AFTER `content_text`, ADD CONSTRAINT `fk_submissions_document_id` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`) ON DELETE SET NULL',
  'SELECT "Column document_id already exists in submissions"'
);

PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
