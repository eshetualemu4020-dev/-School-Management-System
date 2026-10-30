-- School Management ERP - staff qualifications and supporting documents
-- Adds the qualification register for teaching (and other) staff, plus the
-- verification workflow and document linkage required by the Teacher
-- Management page (Qualifications & Documents).
--
-- Apply with the migrator account (DDL), e.g.:
--   mysql -u erp_migrator -p school_erp < sql/06_staff_qualifications.sql
--
-- Design notes:
--   * One staff member has many qualifications (1-to-many).
--   * Each qualification may have one active supporting document. The file
--     bytes live in private storage; `documents` holds the metadata and
--     `qualification_documents` links the file to the qualification and
--     records the verification decision (who/when/status/note).
--   * `documents.owner_type = 'staff_qualification'` and `owner_id =
--     staff_qualifications.id`, so the existing generic document pipeline
--     (retention, soft delete, checksum, malware scan status) keeps working.

SET NAMES utf8mb4;

SET FOREIGN_KEY_CHECKS = 0;

-- ==========================================================================
-- 1. Qualifications held by a staff member
-- ==========================================================================
CREATE TABLE IF NOT EXISTS `staff_qualifications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
    `staff_id` BIGINT UNSIGNED NOT NULL COMMENT 'Owning staff member',
    `qualification_level` ENUM(
        'phd',
        'masters',
        'bachelors',
        'diploma',
        'certificate',
        'high_school',
        'other'
    ) NOT NULL COMMENT 'Award level',
    `title` VARCHAR(190) NOT NULL COMMENT 'Qualification title, e.g. BSc in Mathematics',
    `institution` VARCHAR(190) NOT NULL COMMENT 'Awarding institution',
    `field_of_study` VARCHAR(190) NULL COMMENT 'Field or major',
    `award_date` DATE NULL COMMENT 'Date the qualification was awarded',
    `grade_or_class` VARCHAR(60) NULL COMMENT 'Grade, class or result, e.g. Very Good / 3.7 GPA',
    `registration_no` VARCHAR(80) NULL COMMENT 'Certificate or registration number, when printed on the document',
    `notes` VARCHAR(500) NULL COMMENT 'Administrative notes',
    `created_by` BIGINT UNSIGNED NULL COMMENT 'User who recorded the qualification',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
    `deleted_at` DATETIME(3) NULL COMMENT 'Soft-delete time (UTC)',
    PRIMARY KEY (`id`),
    KEY `ix_staff_qualifications_staff` (`staff_id`, `deleted_at`),
    KEY `ix_staff_qualifications_level` (`qualification_level`),
    CONSTRAINT `fk_staff_qualifications_staff` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Academic and professional qualifications recorded for a staff member.';

-- ==========================================================================
-- 2. Supporting document attached to a qualification (with verification)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS `qualification_documents` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
    `qualification_id` BIGINT UNSIGNED NOT NULL COMMENT 'Owning qualification',
    `document_id` BIGINT UNSIGNED NOT NULL COMMENT 'The stored file metadata (documents.id)',
    `verification_status` ENUM(
        'pending',
        'verified',
        'rejected',
        'replaced'
    ) NOT NULL DEFAULT 'pending' COMMENT 'Review state',
    `verified_by` BIGINT UNSIGNED NULL COMMENT 'User who verified or rejected the document',
    `verified_at` DATETIME(3) NULL COMMENT 'Verification decision time (UTC)',
    `verification_note` VARCHAR(255) NULL COMMENT 'Reviewer note or rejection reason',
    `replaced_by_id` BIGINT UNSIGNED NULL COMMENT 'Newer qualification_documents row that replaced this one',
    `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = current document for the qualification',
    `uploaded_by` BIGINT UNSIGNED NOT NULL COMMENT 'User who uploaded the file',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_qualification_document` (`document_id`),
    KEY `ix_qualification_documents_qualification` (
        `qualification_id`,
        `is_active`
    ),
    KEY `ix_qualification_documents_status` (`verification_status`),
    CONSTRAINT `fk_qualification_documents_qualification` FOREIGN KEY (`qualification_id`) REFERENCES `staff_qualifications` (`id`) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Supporting file for a staff qualification with its verification decision.';

SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================================================
-- 3. Application privileges (mirrors sql/05_grants.sql)
-- ==========================================================================
-- The runtime API performs full DML on qualifications but must never delete
-- verification history, so DELETE is granted only on the parent table where
-- the soft-delete workflow is used.
GRANT
SELECT,
INSERT
,
UPDATE ON `school_erp`.`staff_qualifications` TO 'erp_app' @'localhost';

GRANT
SELECT,
INSERT
,
UPDATE ON `school_erp`.`qualification_documents` TO 'erp_app' @'localhost';

GRANT
SELECT ON `school_erp`.`staff_qualifications` TO 'erp_readonly' @'localhost';

GRANT
SELECT ON `school_erp`.`qualification_documents` TO 'erp_readonly' @'localhost';

FLUSH PRIVILEGES;