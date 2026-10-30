-- =====================================================================
-- MIGRATION 17: STUDENT PORTAL (REQUESTS, HELP & SUPPORT MESSAGING)
-- =====================================================================

SET NAMES utf8mb4;

-- 1. Student Document & Profile Requests Table
CREATE TABLE IF NOT EXISTS `student_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `request_no` VARCHAR(32) NOT NULL UNIQUE,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `request_type` ENUM('transcript', 'certificate', 'enrollment_verification', 'id_replacement', 'profile_correction') NOT NULL,
  `purpose` VARCHAR(255) NOT NULL,
  `reason` TEXT NULL,
  `copies_requested` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `delivery_method` ENUM('download', 'collect') NOT NULL DEFAULT 'download',
  `correction_field` VARCHAR(64) NULL,
  `current_value` VARCHAR(255) NULL,
  `requested_value` VARCHAR(255) NULL,
  `status` ENUM('submitted', 'in_review', 'approved', 'rejected', 'ready', 'cancelled') NOT NULL DEFAULT 'submitted',
  `decision_note` TEXT NULL,
  `decided_by` BIGINT UNSIGNED NULL,
  `decided_at` DATETIME(3) NULL,
  `document_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `idx_stu_req_student` (`student_id`),
  INDEX `idx_stu_req_status` (`status`),
  INDEX `idx_stu_req_type` (`request_type`),
  CONSTRAINT `fk_stu_req_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stu_req_decided_by` FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_stu_req_document` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Student Support Messages Table
CREATE TABLE IF NOT EXISTS `student_support_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `student_id` BIGINT UNSIGNED NOT NULL,
  `category` ENUM('academic', 'admissions', 'fees', 'technical', 'other') NOT NULL,
  `subject` VARCHAR(190) NOT NULL,
  `message` TEXT NOT NULL,
  `status` ENUM('open', 'answered', 'closed') NOT NULL DEFAULT 'open',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `idx_support_student` (`student_id`),
  INDEX `idx_support_status` (`status`),
  CONSTRAINT `fk_support_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Student Support Message Replies Table
CREATE TABLE IF NOT EXISTS `student_support_replies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `message_id` BIGINT UNSIGNED NOT NULL,
  `sender_user_id` BIGINT UNSIGNED NOT NULL,
  `sender_role` ENUM('student', 'staff', 'admin') NOT NULL,
  `reply_text` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_reply_msg` (`message_id`),
  CONSTRAINT `fk_reply_message` FOREIGN KEY (`message_id`) REFERENCES `student_support_messages`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reply_sender` FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
