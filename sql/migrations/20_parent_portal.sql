-- =====================================================================
-- MIGRATION 20: PARENT & GUARDIAN PORTAL (PRODUCTION GRADE)
-- HSPSMS v4.1 Technical Architecture
-- =====================================================================

SET NAMES utf8mb4;

-- 1. Extend student_guardians with granular permission flags & link lifecycle
ALTER TABLE `student_guardians`
  ADD COLUMN `can_view_results` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Allows viewing marks and report cards',
  ADD COLUMN `can_view_attendance` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Allows viewing attendance records and summaries',
  ADD COLUMN `can_view_fees` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Allows viewing invoices and payments',
  ADD COLUMN `can_message_staff` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Allows messaging assigned teachers',
  ADD COLUMN `status` ENUM('pending', 'active', 'suspended', 'ended') NOT NULL DEFAULT 'active' COMMENT 'Link state',
  ADD COLUMN `verified_by` BIGINT UNSIGNED NULL COMMENT 'Registrar who verified the relationship',
  ADD COLUMN `verified_at` DATETIME(3) NULL COMMENT 'Verification timestamp',
  ADD COLUMN `ended_at` DATETIME(3) NULL COMMENT 'When the link was closed',
  ADD COLUMN `ended_reason` VARCHAR(255) NULL COMMENT 'Reason for closing or revoking access',
  ADD INDEX `ix_student_guardians_status` (`status`);

-- 2. Extend guardians with verified contact tracking and preferences
ALTER TABLE `guardians`
  ADD COLUMN `phone_verified_at` DATETIME(3) NULL COMMENT 'Mobile phone verification timestamp',
  ADD COLUMN `email_verified_at` DATETIME(3) NULL COMMENT 'Email verification timestamp',
  ADD COLUMN `preferred_language` VARCHAR(10) NOT NULL DEFAULT 'en' COMMENT 'en or am';

-- 3. Guardian Invites Table for Registrar-controlled onboarding
CREATE TABLE IF NOT EXISTS `guardian_invites` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `guardian_id` BIGINT UNSIGNED NULL,
  `contact_phone` VARCHAR(30) NOT NULL,
  `relationship` ENUM('mother','father','guardian','sibling','relative','other') NOT NULL,
  `token_hash` CHAR(64) NOT NULL UNIQUE,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_by` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ix_invites_student` (`student_id`),
  INDEX `ix_invites_phone` (`contact_phone`),
  INDEX `ix_invites_expiry` (`expires_at`),
  CONSTRAINT `fk_invite_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invite_guardian` FOREIGN KEY (`guardian_id`) REFERENCES `guardians` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_invite_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Expiring onboarding invitations for parents';

-- 4. Parent Requests & Follow-up Replies Table (Page 9)
CREATE TABLE IF NOT EXISTS `parent_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `request_no` VARCHAR(32) NOT NULL UNIQUE,
  `guardian_id` BIGINT UNSIGNED NOT NULL,
  `student_id` BIGINT UNSIGNED NULL,
  `category` ENUM('record_correction', 'fee_inquiry', 'bonafide_letter', 'meeting_request', 'general') NOT NULL,
  `subject` VARCHAR(190) NOT NULL,
  `description` TEXT NOT NULL,
  `status` ENUM('submitted', 'under_review', 'awaiting_information', 'resolved', 'rejected') NOT NULL DEFAULT 'submitted',
  `assigned_role` VARCHAR(40) NOT NULL DEFAULT 'registrar',
  `due_at` DATETIME(3) NULL,
  `resolved_at` DATETIME(3) NULL,
  `resolved_by` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `ix_parent_req_guardian` (`guardian_id`),
  INDEX `ix_parent_req_student` (`student_id`),
  INDEX `ix_parent_req_status` (`status`),
  INDEX `ix_parent_req_category` (`category`),
  CONSTRAINT `fk_preq_guardian` FOREIGN KEY (`guardian_id`) REFERENCES `guardians` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_preq_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_preq_resolver` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Parent formal requests and inquiries';

CREATE TABLE IF NOT EXISTS `parent_request_replies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `request_id` BIGINT UNSIGNED NOT NULL,
  `sender_user_id` BIGINT UNSIGNED NOT NULL,
  `sender_role` ENUM('guardian', 'staff', 'admin') NOT NULL,
  `reply_text` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ix_preq_reply_req` (`request_id`),
  CONSTRAINT `fk_preq_reply_request` FOREIGN KEY (`request_id`) REFERENCES `parent_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_preq_reply_user` FOREIGN KEY (`sender_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Communication thread for parent requests';

-- 5. Attendance Explanations / Absence Excuses Table (Page 4)
CREATE TABLE IF NOT EXISTS `attendance_explanations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `attendance_record_id` BIGINT UNSIGNED NOT NULL,
  `guardian_id` BIGINT UNSIGNED NOT NULL,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `reason` TEXT NOT NULL,
  `attachment_document_id` BIGINT UNSIGNED NULL,
  `status` ENUM('submitted', 'accepted', 'declined') NOT NULL DEFAULT 'submitted',
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` DATETIME(3) NULL,
  `review_note` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_att_explanation` (`attendance_record_id`, `guardian_id`),
  INDEX `ix_att_exp_student` (`student_id`),
  INDEX `ix_att_exp_status` (`status`),
  CONSTRAINT `fk_atexp_record` FOREIGN KEY (`attendance_record_id`) REFERENCES `attendance_records` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_atexp_guardian` FOREIGN KEY (`guardian_id`) REFERENCES `guardians` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_atexp_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_atexp_doc` FOREIGN KEY (`attachment_document_id`) REFERENCES `documents` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_atexp_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Parent absence explanations with staff review';

-- 6. Direct Parent-Teacher Messaging Threads (Page 7)
CREATE TABLE IF NOT EXISTS `parent_message_threads` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `guardian_id` BIGINT UNSIGNED NOT NULL,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `staff_id` BIGINT UNSIGNED NOT NULL,
  `subject` VARCHAR(190) NOT NULL,
  `status` ENUM('active', 'archived', 'closed') NOT NULL DEFAULT 'active',
  `last_message_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ix_pm_thread_guardian` (`guardian_id`),
  INDEX `ix_pm_thread_staff` (`staff_id`),
  INDEX `ix_pm_thread_student` (`student_id`),
  CONSTRAINT `fk_pmt_guardian` FOREIGN KEY (`guardian_id`) REFERENCES `guardians` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pmt_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pmt_staff` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Conversations between guardian and child teachers';

CREATE TABLE IF NOT EXISTS `parent_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `thread_id` BIGINT UNSIGNED NOT NULL,
  `sender_user_id` BIGINT UNSIGNED NOT NULL,
  `body` TEXT NOT NULL,
  `read_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `ix_pm_thread_id` (`thread_id`),
  CONSTRAINT `fk_pm_thread` FOREIGN KEY (`thread_id`) REFERENCES `parent_message_threads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pm_sender` FOREIGN KEY (`sender_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Individual messages inside parent-teacher threads';

-- 7. Dismissed Alerts per Guardian
CREATE TABLE IF NOT EXISTS `guardian_dismissed_alerts` (
  `guardian_id` BIGINT UNSIGNED NOT NULL,
  `alert_key` VARCHAR(120) NOT NULL,
  `student_id` BIGINT UNSIGNED NULL,
  `dismissed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`guardian_id`, `alert_key`),
  CONSTRAINT `fk_gda_guardian` FOREIGN KEY (`guardian_id`) REFERENCES `guardians` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tracks dismissed attention alerts per guardian';

-- 8. Dynamic Configuration Seeds for Parent Portal in system_settings
INSERT INTO `system_settings` (`setting_key`, `value_json`, `description`, `version`, `updated_at`)
VALUES
  ('parent_portal.enabled', 'true', 'Master switch for parent portal access', 1, NOW(3)),
  ('parent_portal.fees_enabled', 'true', 'Enables Page 11 Fees and Payments module', 1, NOW(3)),
  ('parent_portal.messaging_enabled', 'true', 'Enables bidirectional teacher messaging within working hours', 1, NOW(3)),
  ('parent_portal.meetings_enabled', 'true', 'Enables parent-teacher conference meeting booking', 1, NOW(3)),
  ('parent_portal.resources_enabled', 'true', 'Enables learning materials download for enrolled subjects', 1, NOW(3)),
  ('parent_portal.excuse_submission_enabled', 'true', 'Allows parents to submit explanations for student absences', 1, NOW(3)),
  ('parent_portal.show_class_position', 'true', 'Displays official report card class rank to parents', 1, NOW(3)),
  ('parent_portal.daily_message_limit', '5', 'Max messages a parent may send to staff per day', 1, NOW(3)),
  ('parent_portal.retention_read_only_days', '90', 'Days of read-only access after a child graduates or withdraws', 1, NOW(3)),
  ('attendance.minimum_acceptable_rate', '85.0', 'Minimum attendance rate threshold before attention alerts trigger', 1, NOW(3)),
  ('attendance.consecutive_absence_alert', '3', 'Consecutive absences triggering guardian attention alert', 1, NOW(3))
ON DUPLICATE KEY UPDATE
  `value_json` = VALUES(`value_json`),
  `description` = VALUES(`description`),
  `updated_at` = NOW(3);
