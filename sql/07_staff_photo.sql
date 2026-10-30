-- School Management ERP - staff profile photo support
-- Teachers (and other staff) can have a profile photo, matching students and
-- administrator accounts. The file bytes live in private storage; `documents`
-- holds the metadata and `staff.photo_document_id` points at the current file.
--
-- Apply with the migrator account (DDL), e.g.:
--   mysql -u erp_migrator -p school_erp < sql/07_staff_photo.sql
--
-- Idempotency: the column, key and foreign key are each guarded so the script
-- can be re-run safely. MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS,
-- so a procedure checks INFORMATION_SCHEMA first.

SET NAMES utf8mb4;

DROP PROCEDURE IF EXISTS `sp_add_staff_photo_column`;

DELIMITER /
/

CREATE PROCEDURE `sp_add_staff_photo_column`()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'staff'
       AND COLUMN_NAME = 'photo_document_id'
  ) THEN
    ALTER TABLE `staff`
      ADD COLUMN `photo_document_id` BIGINT UNSIGNED NULL COMMENT 'Profile photo file' AFTER `user_id`;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'staff'
       AND INDEX_NAME = 'ix_staff_photo_document'
  ) THEN
    ALTER TABLE `staff` ADD KEY `ix_staff_photo_document` (`photo_document_id`);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'staff'
       AND CONSTRAINT_NAME = 'fk_staff_photo_document_id'
  ) THEN
    ALTER TABLE `staff`
      ADD CONSTRAINT `fk_staff_photo_document_id`
      FOREIGN KEY (`photo_document_id`) REFERENCES `documents` (`id`);
  END IF;
END
/
/

DELIMITER;

CALL `sp_add_staff_photo_column` ();

DROP PROCEDURE `sp_add_staff_photo_column`;

-- The runtime account already has full DML on `staff` and `documents`
-- (see sql/05_grants.sql), so no additional privileges are required.

FLUSH PRIVILEGES;