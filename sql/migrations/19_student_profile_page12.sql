-- =====================================================================
-- MIGRATION 19: STUDENT PROFILE (PAGE 12) SUPPORT
-- =====================================================================
-- Additive only. No columns are dropped, renamed or reset.
-- The correction columns (correction_field / current_value / requested_value)
-- already exist on student_requests from migration 17; this migration adds the
-- indexes needed by the profile and correction-request read paths.
-- =====================================================================

SET NAMES utf8mb4;

-- Index the "open request of this type/field for this student" lookups used by
-- both duplicate-request checks and the Correction Requests tab.
SET @exist := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'student_requests'
    AND INDEX_NAME = 'idx_requests_student_type_status'
);
SET @query = IF(
  @exist = 0,
  'ALTER TABLE `student_requests` ADD INDEX `idx_requests_student_type_status` (`student_id`, `request_type`, `status`)',
  'SELECT "Index idx_requests_student_type_status already exists"'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index the profile-photo document lookup (owner_type, owner_id, doc_type).
SET @exist := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'documents'
    AND INDEX_NAME = 'idx_documents_owner_type'
);
SET @query = IF(
  @exist = 0,
  'ALTER TABLE `documents` ADD INDEX `idx_documents_owner_type` (`owner_type`, `owner_id`, `doc_type`, `deleted_at`)',
  'SELECT "Index idx_documents_owner_type already exists"'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Profile correction requests are filtered by type + correction field.
SET @exist := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'student_requests'
    AND INDEX_NAME = 'idx_requests_correction_field'
);
SET @query = IF(
  @exist = 0,
  'ALTER TABLE `student_requests` ADD INDEX `idx_requests_correction_field` (`student_id`, `correction_field`, `status`)',
  'SELECT "Index idx_requests_correction_field already exists"'
);
PREPARE stmt FROM @query;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
