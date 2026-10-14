-- School Management ERP - database schema (MySQL 8.0 / MariaDB 10.6+)
-- Generated for SRS v1.0 + v1.1 addendum. 68 tables in 9 modules.
-- Conventions: InnoDB, utf8mb4, BIGINT UNSIGNED surrogate keys, DECIMAL for money and marks,
--              all timestamps are DATETIME(3) in UTC (run the server with time_zone = '+00:00').
-- Order: Part A creates tables (no foreign keys), Part B adds foreign keys.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- ##########################################################################
-- PART A - TABLES
-- ##########################################################################

-- ==========================================================================
-- MODULE: Identity, access and system  (10 tables)
-- ==========================================================================
CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `username` VARCHAR(60) NOT NULL COMMENT 'Unique login name (case-insensitive)',
  `email` VARCHAR(190) NULL COMMENT 'Contact and recovery email; unique when present',
  `phone` VARCHAR(30) NULL COMMENT 'Mobile number in international format, e.g. +2519xxxxxxxx',
  `password_hash` VARCHAR(255) NULL COMMENT 'Argon2id or bcrypt hash; NULL until an invitation is accepted',
  `status` ENUM('invited','active','disabled','locked') NOT NULL DEFAULT 'invited' COMMENT 'Account lifecycle state',
  `must_change_password` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = force a password change at next sign-in',
  `mfa_enabled` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Multi-factor authentication switched on (FR-AUTH-06)',
  `failed_login_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Consecutive failed sign-ins; reset on success',
  `locked_until` DATETIME(3) NULL COMMENT 'End of a temporary lockout (UTC)',
  `last_login_at` DATETIME(3) NULL COMMENT 'Last successful sign-in (UTC)',
  `password_changed_at` DATETIME(3) NULL COMMENT 'When the password was last set (UTC)',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  UNIQUE KEY `uq_users_email` (`email`),
  KEY `ix_users_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Login accounts for every person who signs in. Accounts are disabled, never deleted.';

CREATE TABLE `roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `code` VARCHAR(40) NOT NULL COMMENT 'Stable machine name, e.g. registrar',
  `name` VARCHAR(80) NOT NULL COMMENT 'Display name',
  `description` VARCHAR(255) NULL COMMENT 'What the role is for',
  `is_system` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = built-in role that must not be deleted',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_code` (`code`),
  UNIQUE KEY `uq_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Named bundles of permissions (RBAC).';

CREATE TABLE `permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `code` VARCHAR(60) NOT NULL COMMENT 'Permission code in module.action form',
  `module` VARCHAR(40) NOT NULL COMMENT 'Module the permission belongs to',
  `description` VARCHAR(255) NULL COMMENT 'What the permission allows',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Granular permission codes checked by the backend, e.g. marks.enter.';

CREATE TABLE `user_roles` (
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'The user',
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT 'The role granted',
  `assigned_by` BIGINT UNSIGNED NULL COMMENT 'Administrator who granted the role',
  `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'When the role was granted (UTC)',
  PRIMARY KEY (`user_id`, `role_id`),
  KEY `ix_user_roles_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Which roles each user holds (many-to-many).';

CREATE TABLE `role_permissions` (
  `role_id` BIGINT UNSIGNED NOT NULL COMMENT 'The role',
  `permission_id` BIGINT UNSIGNED NOT NULL COMMENT 'The permission granted',
  `access_level` ENUM('full','limited') NOT NULL DEFAULT 'full' COMMENT 'full = all records; limited = own, assigned or linked records only',
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `ix_role_permissions_permission` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Permissions granted to each role, with the scope of access.';

CREATE TABLE `refresh_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'Owner of the session',
  `token_hash` CHAR(64) NOT NULL COMMENT 'SHA-256 of the refresh token; the token itself is never stored',
  `family_id` CHAR(36) NOT NULL COMMENT 'UUID shared by a rotation chain; reuse of an old token revokes the family',
  `replaced_by_id` BIGINT UNSIGNED NULL COMMENT 'Next token in the rotation chain',
  `issued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Issue time (UTC)',
  `expires_at` DATETIME(3) NOT NULL COMMENT 'Expiry time (UTC)',
  `revoked_at` DATETIME(3) NULL COMMENT 'Set when logged out, rotated or revoked',
  `revoked_reason` ENUM('logout','rotated','reuse_detected','admin','password_change','account_disabled') NULL COMMENT 'Why the session ended',
  `ip_address` VARCHAR(45) NULL COMMENT 'Client IP at issue (IPv4 or IPv6)',
  `user_agent` VARCHAR(255) NULL COMMENT 'Client user agent at issue',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_refresh_sessions_token` (`token_hash`),
  KEY `ix_refresh_sessions_user` (`user_id`, `revoked_at`),
  KEY `ix_refresh_sessions_family` (`family_id`),
  KEY `ix_refresh_sessions_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Server-side refresh-token sessions; supports rotation and revocation (FR-AUTH-03).';

CREATE TABLE `password_reset_tokens` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'Account being reset',
  `token_hash` CHAR(64) NOT NULL COMMENT 'SHA-256 of the emailed token',
  `requested_ip` VARCHAR(45) NULL COMMENT 'IP that requested the reset',
  `expires_at` DATETIME(3) NOT NULL COMMENT 'Token expiry (UTC)',
  `used_at` DATETIME(3) NULL COMMENT 'Set when consumed; a used token is never valid again',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_password_reset_token` (`token_hash`),
  KEY `ix_password_reset_user` (`user_id`, `used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Single-use, expiring password reset tokens (FR-AUTH-04).';

CREATE TABLE `system_settings` (
  `setting_key` VARCHAR(100) NOT NULL COMMENT 'Dotted key, e.g. attendance.mode',
  `value_json` JSON NOT NULL COMMENT 'Setting value as JSON',
  `description` VARCHAR(255) NULL COMMENT 'What the setting controls',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Incremented on every change',
  `updated_by` BIGINT UNSIGNED NULL COMMENT 'User who last changed it',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='School-wide configuration as key/value JSON; every change is audited (FR-ADM-01, FR-ADM-03).';

CREATE TABLE `number_sequences` (
  `name` VARCHAR(40) NOT NULL COMMENT 'Sequence name: admission, invoice, receipt',
  `year_key` SMALLINT UNSIGNED NOT NULL COMMENT 'Year the counter restarts for; 0 = never restarts',
  `next_value` BIGINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Next number to hand out',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last use (UTC)',
  PRIMARY KEY (`name`, `year_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Concurrency-safe counters for admission, invoice and receipt numbers (FR-FIN-10).';

CREATE TABLE `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'When the action happened (UTC)',
  `actor_user_id` BIGINT UNSIGNED NULL COMMENT 'Who acted; NULL for unknown user or system job',
  `actor_username` VARCHAR(60) NULL COMMENT 'Username as typed or as it was at the time',
  `action` VARCHAR(80) NOT NULL COMMENT 'Action code, e.g. marks.correct or auth.login_failed',
  `entity_type` VARCHAR(60) NULL COMMENT 'Table or business object affected',
  `entity_id` VARCHAR(64) NULL COMMENT 'Key of the affected row, as text so composite keys fit',
  `outcome` ENUM('success','failure','denied') NOT NULL DEFAULT 'success' COMMENT 'Result of the attempt',
  `changes` JSON NULL COMMENT 'Old and new values of safe fields; never passwords or tokens',
  `reason` VARCHAR(500) NULL COMMENT 'Reason given when one is required',
  `request_id` CHAR(36) NULL COMMENT 'API correlation ID (section 5.5)',
  `ip_address` VARCHAR(45) NULL COMMENT 'Client IP',
  `user_agent` VARCHAR(255) NULL COMMENT 'Client user agent',
  PRIMARY KEY (`id`),
  KEY `ix_audit_entity` (`entity_type`, `entity_id`),
  KEY `ix_audit_actor_time` (`actor_user_id`, `occurred_at`),
  KEY `ix_audit_action_time` (`action`, `occurred_at`),
  KEY `ix_audit_request` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Append-only record of security-sensitive and business-critical actions (sections 9.3 and 9.4).';


-- ==========================================================================
-- MODULE: Communication and documents  (5 tables)
-- ==========================================================================
CREATE TABLE `documents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `owner_type` VARCHAR(40) NOT NULL COMMENT 'Kind of record the file belongs to, e.g. student, assignment',
  `owner_id` BIGINT UNSIGNED NOT NULL COMMENT 'Key of the owning record (polymorphic, no foreign key)',
  `doc_type` VARCHAR(40) NOT NULL COMMENT 'Document type, e.g. birth_certificate, receipt_image',
  `original_name` VARCHAR(255) NOT NULL COMMENT 'File name as uploaded',
  `storage_key` VARCHAR(255) NOT NULL COMMENT 'Private storage path or object key; never a public URL',
  `mime_type` VARCHAR(100) NOT NULL COMMENT 'Validated content type',
  `size_bytes` BIGINT UNSIGNED NOT NULL COMMENT 'File size in bytes',
  `checksum_sha256` CHAR(64) NOT NULL COMMENT 'SHA-256 of the file for integrity checks',
  `scan_status` ENUM('pending','clean','infected','skipped') NOT NULL DEFAULT 'pending' COMMENT 'Malware scan result',
  `uploaded_by` BIGINT UNSIGNED NOT NULL COMMENT 'Uploading user',
  `retention_until` DATE NULL COMMENT 'Earliest date the file may be purged under the retention policy',
  `deleted_at` DATETIME(3) NULL COMMENT 'Soft-delete time (UTC)',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_documents_storage_key` (`storage_key`),
  KEY `ix_documents_owner` (`owner_type`, `owner_id`),
  KEY `ix_documents_uploader` (`uploaded_by`),
  CONSTRAINT `ck_documents_size` CHECK (`size_bytes` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Metadata for uploaded files; the bytes live in private storage, never in the database (FR-STU-04, FR-LRN-04).';

CREATE TABLE `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'Recipient',
  `type` VARCHAR(60) NOT NULL COMMENT 'Notification type, e.g. absence_alert, result_published',
  `title` VARCHAR(190) NOT NULL COMMENT 'Short heading',
  `body` VARCHAR(1000) NULL COMMENT 'Message text',
  `payload_json` JSON NULL COMMENT 'Reference data such as entity type and id',
  `read_at` DATETIME(3) NULL COMMENT 'NULL = unread',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_notifications_inbox` (`user_id`, `read_at`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='In-app notification inbox with read state (FR-COM-02).';

CREATE TABLE `notification_outbox` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `user_id` BIGINT UNSIGNED NULL COMMENT 'Recipient user when known',
  `channel` ENUM('email','sms') NOT NULL COMMENT 'Delivery channel',
  `recipient` VARCHAR(190) NOT NULL COMMENT 'Email address or phone number',
  `subject` VARCHAR(190) NULL COMMENT 'Email subject',
  `payload_json` JSON NOT NULL COMMENT 'Template name and merge data',
  `status` ENUM('pending','sent','failed','cancelled') NOT NULL DEFAULT 'pending' COMMENT 'Delivery state',
  `attempts` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Delivery attempts so far',
  `last_error` VARCHAR(500) NULL COMMENT 'Last provider error, without secrets',
  `next_attempt_at` DATETIME(3) NULL COMMENT 'When the worker should retry (UTC)',
  `sent_at` DATETIME(3) NULL COMMENT 'Provider acceptance time (UTC)',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_outbox_queue` (`status`, `next_attempt_at`),
  KEY `ix_outbox_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Queue of email and SMS messages with retry; failures never roll back business transactions (section 7.4).';

CREATE TABLE `announcements` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `title` VARCHAR(190) NOT NULL COMMENT 'Headline',
  `body` TEXT NOT NULL COMMENT 'Full text',
  `status` ENUM('draft','published','archived') NOT NULL DEFAULT 'draft' COMMENT 'Publication state',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT 'Author',
  `published_by` BIGINT UNSIGNED NULL COMMENT 'User who published it',
  `published_at` DATETIME(3) NULL COMMENT 'Publication time (UTC)',
  `expires_at` DATETIME(3) NULL COMMENT 'Hide after this time (UTC)',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_announcements_status` (`status`, `published_at`),
  CONSTRAINT `ck_announcements_published` CHECK (`status` <> 'published' OR (`published_by` IS NOT NULL AND `published_at` IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Announcements written by staff (FR-COM-01).';

CREATE TABLE `announcement_targets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `announcement_id` BIGINT UNSIGNED NOT NULL COMMENT 'The announcement',
  `target_type` ENUM('all','role','grade','section') NOT NULL COMMENT 'Kind of audience',
  `target_id` BIGINT UNSIGNED NULL COMMENT 'roles.id, grades.id or sections.id; NULL for all (polymorphic)',
  `target_key` BIGINT UNSIGNED GENERATED ALWAYS AS (IFNULL(`target_id`, 0)) STORED COMMENT 'Generated: target_id with NULL as 0, so the unique key works',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_announcement_target` (`announcement_id`, `target_type`, `target_key`),
  CONSTRAINT `ck_announcement_target` CHECK ((`target_type` = 'all' AND `target_id` IS NULL) OR (`target_type` <> 'all' AND `target_id` IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Audience of an announcement: whole school, a role, a grade or a section.';


-- ==========================================================================
-- MODULE: Academic structure  (11 tables)
-- ==========================================================================
CREATE TABLE `academic_years` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `name` VARCHAR(40) NOT NULL COMMENT 'Gregorian label, e.g. 2026/27',
  `label_ec` VARCHAR(40) NULL COMMENT 'Ethiopian calendar label, e.g. 2019 E.C.',
  `start_date` DATE NOT NULL COMMENT 'First day (Gregorian ISO date)',
  `end_date` DATE NOT NULL COMMENT 'Last day (Gregorian ISO date)',
  `status` ENUM('planned','active','closed') NOT NULL DEFAULT 'planned' COMMENT 'closed blocks new enrollments',
  `is_current` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = the year the UI opens on; at most one',
  `current_key` TINYINT GENERATED ALWAYS AS (IF(`is_current` = 1, 1, NULL)) STORED COMMENT 'Generated: 1 when current, else NULL; unique key allows only one current year',
  `closed_at` DATETIME(3) NULL COMMENT 'When the year was closed (UTC)',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_academic_years_name` (`name`),
  UNIQUE KEY `uq_academic_years_current` (`current_key`),
  CONSTRAINT `ck_academic_years_dates` CHECK (`end_date` > `start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='School years with non-overlapping date ranges (FR-ACAD-01, FR-ETH-02).';

CREATE TABLE `terms` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `academic_year_id` BIGINT UNSIGNED NOT NULL COMMENT 'Parent year',
  `term_no` TINYINT UNSIGNED NOT NULL COMMENT 'Order inside the year: 1, 2, ...',
  `name` VARCHAR(40) NOT NULL COMMENT 'Display name, e.g. Semester 1',
  `start_date` DATE NOT NULL COMMENT 'First day',
  `end_date` DATE NOT NULL COMMENT 'Last day',
  `status` ENUM('planned','active','closed') NOT NULL DEFAULT 'planned' COMMENT 'Term state',
  `is_current` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = current term; at most one',
  `current_key` TINYINT GENERATED ALWAYS AS (IF(`is_current` = 1, 1, NULL)) STORED COMMENT 'Generated: 1 when current, else NULL; unique',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_terms_year_no` (`academic_year_id`, `term_no`),
  UNIQUE KEY `uq_terms_year_name` (`academic_year_id`, `name`),
  UNIQUE KEY `uq_terms_current` (`current_key`),
  CONSTRAINT `ck_terms_dates` CHECK (`end_date` > `start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Terms or semesters inside an academic year; the number per year is configurable (FR-ETH-09).';

CREATE TABLE `grades` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `grade_level` TINYINT UNSIGNED NOT NULL COMMENT 'Numeric level, 9 to 12 in the baseline',
  `display_name` VARCHAR(40) NOT NULL COMMENT 'Display name, e.g. Grade 9',
  `has_streams` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = sections choose Natural or Social Science (Grades 11-12)',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = hidden from new setups',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_grades_level` (`grade_level`),
  CONSTRAINT `ck_grades_level` CHECK (`grade_level` BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Grade levels; Grades 9 to 12 are seeded, others can be added.';

CREATE TABLE `classrooms` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `name` VARCHAR(60) NOT NULL COMMENT 'Room name or number',
  `building` VARCHAR(60) NULL COMMENT 'Building or block',
  `room_type` ENUM('classroom','laboratory','library','hall','other') NOT NULL DEFAULT 'classroom' COMMENT 'Kind of room',
  `capacity` SMALLINT UNSIGNED NULL COMMENT 'Seats',
  `status` ENUM('active','inactive') NOT NULL DEFAULT 'active' COMMENT 'Availability',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_classrooms_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Physical rooms used by sections and the timetable.';

CREATE TABLE `time_slots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `day_of_week` TINYINT UNSIGNED NOT NULL COMMENT 'ISO weekday: 1 = Monday ... 7 = Sunday',
  `start_time` TIME NOT NULL COMMENT 'Period start',
  `end_time` TIME NOT NULL COMMENT 'Period end',
  `label` VARCHAR(40) NOT NULL COMMENT 'Display label, e.g. Period 1',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_time_slots_day_start` (`day_of_week`, `start_time`),
  CONSTRAINT `ck_time_slots_day` CHECK (`day_of_week` BETWEEN 1 AND 7),
  CONSTRAINT `ck_time_slots_time` CHECK (`end_time` > `start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Reusable periods of the school day, per weekday.';

CREATE TABLE `calendar_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `academic_year_id` BIGINT UNSIGNED NOT NULL COMMENT 'Year the event belongs to',
  `title` VARCHAR(190) NOT NULL COMMENT 'Event name',
  `event_type` ENUM('holiday','exam','break','event','other') NOT NULL DEFAULT 'event' COMMENT 'Category',
  `start_date` DATE NOT NULL COMMENT 'First day',
  `end_date` DATE NOT NULL COMMENT 'Last day',
  `description` VARCHAR(500) NULL COMMENT 'Details',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT 'Author',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_calendar_events_dates` (`academic_year_id`, `start_date`, `end_date`),
  CONSTRAINT `ck_calendar_events_dates` CHECK (`end_date` >= `start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='School calendar: holidays, exam periods, breaks and events (FR-ACAD-02).';

CREATE TABLE `subjects` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `code` VARCHAR(20) NOT NULL COMMENT 'Short code, e.g. MATH',
  `name` VARCHAR(100) NOT NULL COMMENT 'English name',
  `name_am` VARCHAR(100) NULL COMMENT 'Amharic name',
  `status` ENUM('active','inactive') NOT NULL DEFAULT 'active' COMMENT 'Availability',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subjects_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Subjects offered by the school.';

CREATE TABLE `grade_subjects` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `grade_id` BIGINT UNSIGNED NOT NULL COMMENT 'Grade',
  `subject_id` BIGINT UNSIGNED NOT NULL COMMENT 'Subject',
  `stream` ENUM('all','natural_science','social_science') NOT NULL DEFAULT 'all' COMMENT 'Stream the subject applies to',
  `is_compulsory` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = every student in scope takes it',
  `periods_per_week` TINYINT UNSIGNED NULL COMMENT 'Planned weekly periods',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_grade_subjects` (`grade_id`, `subject_id`, `stream`),
  KEY `ix_grade_subjects_subject` (`subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Which subjects apply to which grade and stream (grade applicability).';

CREATE TABLE `sections` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `grade_id` BIGINT UNSIGNED NOT NULL COMMENT 'Grade',
  `academic_year_id` BIGINT UNSIGNED NOT NULL COMMENT 'Year',
  `name` VARCHAR(40) NOT NULL COMMENT 'Section name, e.g. A',
  `stream` ENUM('none','natural_science','social_science') NOT NULL DEFAULT 'none' COMMENT 'Stream for Grades 11-12 (FR-ETH-06)',
  `capacity` SMALLINT UNSIGNED NOT NULL DEFAULT 40 COMMENT 'Maximum active enrollments',
  `homeroom_staff_id` BIGINT UNSIGNED NULL COMMENT 'Homeroom teacher',
  `classroom_id` BIGINT UNSIGNED NULL COMMENT 'Default room',
  `status` ENUM('active','closed') NOT NULL DEFAULT 'active' COMMENT 'Section state',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sections_scope_name` (`grade_id`, `academic_year_id`, `name`),
  UNIQUE KEY `uq_sections_id_year` (`id`, `academic_year_id`),
  KEY `ix_sections_year` (`academic_year_id`),
  CONSTRAINT `ck_sections_capacity` CHECK (`capacity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='A class group inside a grade for one academic year, e.g. Grade 10 Section A.';

CREATE TABLE `teaching_assignments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `staff_id` BIGINT UNSIGNED NOT NULL COMMENT 'Teacher',
  `subject_id` BIGINT UNSIGNED NOT NULL COMMENT 'Subject taught',
  `section_id` BIGINT UNSIGNED NOT NULL COMMENT 'Section taught',
  `academic_year_id` BIGINT UNSIGNED NOT NULL COMMENT 'Year; must match the section year',
  `valid_from` DATE NULL COMMENT 'Optional start of the teaching period',
  `valid_to` DATE NULL COMMENT 'Optional end of the teaching period',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = no longer teaching this class',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_teaching_assignments` (`staff_id`, `subject_id`, `section_id`, `academic_year_id`),
  KEY `ix_teaching_assignments_section` (`section_id`),
  KEY `ix_teaching_assignments_subject` (`subject_id`),
  CONSTRAINT `ck_teaching_assignments_dates` CHECK (`valid_to` IS NULL OR `valid_from` IS NULL OR `valid_to` >= `valid_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Teacher x subject x section for one academic year (FR-ACAD-03). The scope for timetables, assignments and marks.';

CREATE TABLE `timetable_entries` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT 'Term the timetable applies to',
  `section_id` BIGINT UNSIGNED NOT NULL COMMENT 'Section taught',
  `subject_id` BIGINT UNSIGNED NOT NULL COMMENT 'Subject taught',
  `staff_id` BIGINT UNSIGNED NOT NULL COMMENT 'Teacher; must hold a matching teaching assignment',
  `room_id` BIGINT UNSIGNED NOT NULL COMMENT 'Room used',
  `time_slot_id` BIGINT UNSIGNED NOT NULL COMMENT 'Weekday and period',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_timetable_section_slot` (`term_id`, `section_id`, `time_slot_id`),
  UNIQUE KEY `uq_timetable_teacher_slot` (`term_id`, `staff_id`, `time_slot_id`),
  UNIQUE KEY `uq_timetable_room_slot` (`term_id`, `room_id`, `time_slot_id`),
  KEY `ix_timetable_subject` (`subject_id`),
  KEY `ix_timetable_slot` (`time_slot_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Weekly timetable. Unique keys make teacher, room and section clashes impossible (FR-ACAD-04, FR-ACAD-05).';


-- ==========================================================================
-- MODULE: People and enrollment  (10 tables)
-- ==========================================================================
CREATE TABLE `students` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `user_id` BIGINT UNSIGNED NULL COMMENT 'Login account, when the student has one',
  `admission_no` VARCHAR(30) NOT NULL COMMENT 'Public admission number; unique',
  `first_name` VARCHAR(60) NOT NULL COMMENT 'Given name',
  `father_name` VARCHAR(60) NOT NULL COMMENT 'Father name (Ethiopian naming)',
  `grandfather_name` VARCHAR(60) NULL COMMENT 'Grandfather name',
  `name_am` VARCHAR(190) NULL COMMENT 'Full name in Amharic script',
  `gender` ENUM('female','male') NOT NULL COMMENT 'Gender as recorded on official documents',
  `date_of_birth` DATE NOT NULL COMMENT 'Birth date (Gregorian ISO date)',
  `nationality` VARCHAR(60) NULL DEFAULT 'Ethiopian' COMMENT 'Nationality',
  `phone` VARCHAR(30) NULL COMMENT 'Student phone, optional',
  `email` VARCHAR(190) NULL COMMENT 'Student email, optional',
  `region` VARCHAR(80) NULL COMMENT 'Region or city administration',
  `city` VARCHAR(80) NULL COMMENT 'City or town',
  `address` VARCHAR(255) NULL COMMENT 'Residential address',
  `previous_school` VARCHAR(190) NULL COMMENT 'School attended before admission',
  `admission_date` DATE NOT NULL COMMENT 'Date admitted',
  `status` ENUM('applicant','active','transferred','withdrawn','graduated') NOT NULL DEFAULT 'applicant' COMMENT 'Current status (FR-STU-05)',
  `photo_document_id` BIGINT UNSIGNED NULL COMMENT 'Profile photo file',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_students_admission_no` (`admission_no`),
  UNIQUE KEY `uq_students_user` (`user_id`),
  KEY `ix_students_name` (`father_name`, `first_name`),
  KEY `ix_students_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Master record of every learner. History lives in enrollments and status history.';

CREATE TABLE `guardians` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `user_id` BIGINT UNSIGNED NULL COMMENT 'Login account once invited',
  `first_name` VARCHAR(60) NOT NULL COMMENT 'Given name',
  `father_name` VARCHAR(60) NOT NULL COMMENT 'Father name',
  `grandfather_name` VARCHAR(60) NULL COMMENT 'Grandfather name',
  `name_am` VARCHAR(190) NULL COMMENT 'Full name in Amharic script',
  `phone` VARCHAR(30) NOT NULL COMMENT 'Mobile number; receives the sign-in one-time code',
  `email` VARCHAR(190) NULL COMMENT 'Email address',
  `address` VARCHAR(255) NULL COMMENT 'Residential address',
  `verification_status` ENUM('pending','verified','suspended') NOT NULL DEFAULT 'pending' COMMENT 'Only verified guardians can see data',
  `verified_by` BIGINT UNSIGNED NULL COMMENT 'Registrar who verified',
  `verified_at` DATETIME(3) NULL COMMENT 'Verification time (UTC)',
  `verification_method` ENUM('kebele_id','national_id','passport','school_form','other') NULL COMMENT 'Document type checked; the ID number is not stored',
  `verification_note` VARCHAR(255) NULL COMMENT 'Registrar note',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_guardians_user` (`user_id`),
  KEY `ix_guardians_phone` (`phone`),
  KEY `ix_guardians_name` (`father_name`, `first_name`),
  CONSTRAINT `ck_guardians_verified` CHECK (`verification_status` <> 'verified' OR (`verified_by` IS NOT NULL AND `verified_at` IS NOT NULL AND `verification_method` IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Parents and authorized adults. Access is blocked until verified (FR-GRD-01 to FR-GRD-04).';

CREATE TABLE `student_guardians` (
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT 'The student',
  `guardian_id` BIGINT UNSIGNED NOT NULL COMMENT 'The guardian',
  `relationship` ENUM('mother','father','guardian','sibling','relative','other') NOT NULL COMMENT 'Relationship to the student',
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = primary contact; at most one per student',
  `is_emergency_contact` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = may be called in emergencies',
  `primary_student_key` BIGINT UNSIGNED GENERATED ALWAYS AS (IF(`is_primary` = 1, `student_id`, NULL)) STORED COMMENT 'Generated: student_id when primary, else NULL; unique key allows one primary',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`student_id`, `guardian_id`),
  UNIQUE KEY `uq_student_guardians_primary` (`primary_student_key`),
  KEY `ix_student_guardians_guardian` (`guardian_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Links students to guardians (many-to-many) with relationship and a single primary guardian.';

CREATE TABLE `staff` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `user_id` BIGINT UNSIGNED NULL COMMENT 'Login account',
  `employee_no` VARCHAR(30) NOT NULL COMMENT 'Employee number; unique',
  `first_name` VARCHAR(60) NOT NULL COMMENT 'Given name',
  `father_name` VARCHAR(60) NOT NULL COMMENT 'Father name',
  `grandfather_name` VARCHAR(60) NULL COMMENT 'Grandfather name',
  `name_am` VARCHAR(190) NULL COMMENT 'Full name in Amharic script',
  `gender` ENUM('female','male') NOT NULL COMMENT 'Gender',
  `date_of_birth` DATE NULL COMMENT 'Birth date',
  `phone` VARCHAR(30) NULL COMMENT 'Mobile number',
  `email` VARCHAR(190) NULL COMMENT 'Email address',
  `address` VARCHAR(255) NULL COMMENT 'Residential address',
  `job_title` VARCHAR(100) NOT NULL COMMENT 'Position, e.g. Mathematics teacher',
  `department` VARCHAR(100) NULL COMMENT 'Department',
  `staff_type` ENUM('teacher','administrator','support','librarian','accountant','other') NOT NULL DEFAULT 'teacher' COMMENT 'Broad category',
  `hire_date` DATE NULL COMMENT 'Start date',
  `end_date` DATE NULL COMMENT 'Termination date',
  `status` ENUM('active','on_leave','terminated') NOT NULL DEFAULT 'active' COMMENT 'Employment status',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_employee_no` (`employee_no`),
  UNIQUE KEY `uq_staff_user` (`user_id`),
  KEY `ix_staff_name` (`father_name`, `first_name`),
  KEY `ix_staff_status` (`status`, `staff_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Teachers and employees.';

CREATE TABLE `staff_attendance` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `staff_id` BIGINT UNSIGNED NOT NULL COMMENT 'Staff member',
  `attendance_date` DATE NOT NULL COMMENT 'Day',
  `status` ENUM('present','absent','late','on_leave') NOT NULL COMMENT 'Result',
  `note` VARCHAR(255) NULL COMMENT 'Note',
  `recorded_by` BIGINT UNSIGNED NOT NULL COMMENT 'User who recorded it',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_staff_attendance_day` (`staff_id`, `attendance_date`),
  KEY `ix_staff_attendance_date` (`attendance_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Basic daily staff attendance (FR-ATT-08).';

CREATE TABLE `enrollments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student',
  `section_id` BIGINT UNSIGNED NOT NULL COMMENT 'Section',
  `academic_year_id` BIGINT UNSIGNED NOT NULL COMMENT 'Year; must equal the section year (composite foreign key)',
  `status` ENUM('active','completed','transferred','withdrawn','promoted','repeated') NOT NULL DEFAULT 'active' COMMENT 'State of this enrollment',
  `roll_no` SMALLINT UNSIGNED NULL COMMENT 'Roll number inside the section',
  `enrolled_on` DATE NOT NULL COMMENT 'Effective start date',
  `ended_on` DATE NULL COMMENT 'Effective end date',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT 'Registrar who enrolled the student',
  `active_key` TINYINT GENERATED ALWAYS AS (IF(`status` = 'active', 1, NULL)) STORED COMMENT 'Generated: 1 while active, else NULL; with the unique key allows one active enrollment per student per year',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_one_active_enrollment` (`student_id`, `academic_year_id`, `active_key`),
  UNIQUE KEY `uq_enrollments_id_section` (`id`, `section_id`),
  KEY `ix_enrollments_section` (`section_id`, `status`),
  KEY `ix_enrollments_year` (`academic_year_id`),
  CONSTRAINT `ck_enrollments_dates` CHECK (`ended_on` IS NULL OR `ended_on` >= `enrolled_on`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='A student placed in a section for an academic year. History is kept, never overwritten (FR-STU-06 to FR-STU-09).';

CREATE TABLE `student_status_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student',
  `status` ENUM('applicant','active','transferred','withdrawn','graduated') NOT NULL COMMENT 'Status the student moved to',
  `effective_date` DATE NOT NULL COMMENT 'Date the status took effect',
  `reason` VARCHAR(255) NULL COMMENT 'Reason',
  `changed_by` BIGINT UNSIGNED NOT NULL COMMENT 'User who made the change',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_student_status_history` (`student_id`, `effective_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Append-only history of student status changes (FR-STU-05).';

CREATE TABLE `transfers_withdrawals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student',
  `enrollment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Enrollment being ended',
  `type` ENUM('transfer','withdrawal') NOT NULL COMMENT 'Kind of exit',
  `destination_school` VARCHAR(190) NULL COMMENT 'School transferred to',
  `effective_date` DATE NOT NULL COMMENT 'Last day at this school',
  `reason` VARCHAR(500) NULL COMMENT 'Reason given',
  `approved_by` BIGINT UNSIGNED NOT NULL COMMENT 'Approver',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_transfers_student` (`student_id`),
  KEY `ix_transfers_enrollment` (`enrollment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Transfers out and withdrawals with effective date and approver (FR-STU-08).';

CREATE TABLE `promotions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `enrollment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Enrollment being decided',
  `decision` ENUM('promoted','repeat','graduated') NOT NULL COMMENT 'Decision',
  `to_grade_id` BIGINT UNSIGNED NULL COMMENT 'Grade for next year; required when promoted',
  `to_academic_year_id` BIGINT UNSIGNED NULL COMMENT 'Next academic year',
  `effective_date` DATE NOT NULL COMMENT 'Effective date',
  `remarks` VARCHAR(500) NULL COMMENT 'Notes',
  `decided_by` BIGINT UNSIGNED NOT NULL COMMENT 'Decision maker',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_promotions_enrollment` (`enrollment_id`),
  CONSTRAINT `ck_promotions_target` CHECK (`decision` <> 'promoted' OR `to_grade_id` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='End-of-year decision for an enrollment: promoted, repeat or graduated (FR-STU-08).';

CREATE TABLE `discipline_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student',
  `enrollment_id` BIGINT UNSIGNED NULL COMMENT 'Enrollment at the time',
  `incident_date` DATE NOT NULL COMMENT 'Date of the incident',
  `category` VARCHAR(60) NOT NULL COMMENT 'Incident category',
  `severity` ENUM('minor','moderate','serious') NOT NULL COMMENT 'Severity',
  `description` TEXT NOT NULL COMMENT 'What happened',
  `action_taken` VARCHAR(500) NULL COMMENT 'Action taken',
  `recorded_by` BIGINT UNSIGNED NOT NULL COMMENT 'Staff user who recorded it',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_discipline_student` (`student_id`, `incident_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Behavior incidents, visible to staff only (FR-DISC-01, optional).';


-- ==========================================================================
-- MODULE: Attendance  (3 tables)
-- ==========================================================================
CREATE TABLE `attendance_statuses` (
  `code` VARCHAR(20) NOT NULL COMMENT 'Code: present, absent, late, excused, ...',
  `name` VARCHAR(60) NOT NULL COMMENT 'Display name',
  `counts_as_present` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = counts toward the attendance rate',
  `is_excused` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = excused absence',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = hidden from the picker',
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Order in the UI',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Configurable attendance codes; the four standard ones are seeded (FR-ATT-02).';

CREATE TABLE `attendance_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `section_id` BIGINT UNSIGNED NOT NULL COMMENT 'Section',
  `attendance_date` DATE NOT NULL COMMENT 'Date',
  `time_slot_id` BIGINT UNSIGNED NULL COMMENT 'Period; NULL for a daily roll call',
  `subject_id` BIGINT UNSIGNED NULL COMMENT 'Subject in per-period mode',
  `slot_key` BIGINT UNSIGNED GENERATED ALWAYS AS (IFNULL(`time_slot_id`, 0)) STORED COMMENT 'Generated: time_slot_id with NULL as 0, so the unique key works',
  `recorded_by_staff_id` BIGINT UNSIGNED NOT NULL COMMENT 'Teacher who took the roll',
  `status` ENUM('open','submitted','locked') NOT NULL DEFAULT 'open' COMMENT 'locked = corrections need permission and an audit event',
  `submitted_at` DATETIME(3) NULL COMMENT 'Submission time (UTC)',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_session` (`section_id`, `attendance_date`, `slot_key`),
  KEY `ix_attendance_sessions_date` (`attendance_date`),
  KEY `ix_attendance_sessions_staff` (`recorded_by_staff_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='One attendance roll call for a section on a date; daily or per period (FR-ATT-01, FR-ATT-07).';

CREATE TABLE `attendance_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `session_id` BIGINT UNSIGNED NOT NULL COMMENT 'Roll call',
  `enrollment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student enrollment; must belong to the session section',
  `status_code` VARCHAR(20) NOT NULL COMMENT 'Attendance status',
  `note` VARCHAR(255) NULL COMMENT 'Note, e.g. reason for absence',
  `marked_by` BIGINT UNSIGNED NOT NULL COMMENT 'User who last changed the record',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_record` (`session_id`, `enrollment_id`),
  KEY `ix_attendance_records_enrollment` (`enrollment_id`),
  KEY `ix_attendance_records_status` (`status_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='One status per enrolled student per session; duplicates are impossible (FR-ATT-03).';


-- ==========================================================================
-- MODULE: Learning  (3 tables)
-- ==========================================================================
CREATE TABLE `assignments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `teaching_assignment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Teacher, subject and section in one reference',
  `term_id` BIGINT UNSIGNED NULL COMMENT 'Term',
  `title` VARCHAR(190) NOT NULL COMMENT 'Title',
  `instructions` TEXT NULL COMMENT 'Instructions',
  `due_at` DATETIME(3) NOT NULL COMMENT 'Deadline (UTC)',
  `allow_late` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = late submissions accepted',
  `max_score` DECIMAL(6,2) NULL COMMENT 'Maximum score if graded',
  `status` ENUM('draft','published','closed') NOT NULL DEFAULT 'draft' COMMENT 'Visibility to students',
  `published_at` DATETIME(3) NULL COMMENT 'Publication time (UTC)',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT 'Author',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_assignments_scope` (`teaching_assignment_id`, `status`, `due_at`),
  KEY `ix_assignments_term` (`term_id`),
  CONSTRAINT `ck_assignments_max` CHECK (`max_score` IS NULL OR `max_score` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Homework and tasks published to a class (FR-LRN-01).';

CREATE TABLE `submissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `assignment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Assignment',
  `enrollment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student enrollment',
  `submitted_at` DATETIME(3) NOT NULL COMMENT 'When submitted (UTC)',
  `is_late` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = after the deadline',
  `status` ENUM('submitted','graded','returned','resubmit_requested') NOT NULL DEFAULT 'submitted' COMMENT 'Review state',
  `content_text` TEXT NULL COMMENT 'Typed answer; files go in documents',
  `feedback` TEXT NULL COMMENT 'Teacher feedback',
  `score` DECIMAL(6,2) NULL COMMENT 'Score if graded',
  `graded_by` BIGINT UNSIGNED NULL COMMENT 'Grader',
  `graded_at` DATETIME(3) NULL COMMENT 'Grading time (UTC)',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_submissions` (`assignment_id`, `enrollment_id`),
  KEY `ix_submissions_enrollment` (`enrollment_id`),
  CONSTRAINT `ck_submissions_score` CHECK (`score` IS NULL OR `score` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Student work for an assignment, with feedback and status (FR-LRN-02, FR-LRN-03).';

CREATE TABLE `learning_resources` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `teaching_assignment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Class the resource belongs to',
  `title` VARCHAR(190) NOT NULL COMMENT 'Title',
  `description` VARCHAR(500) NULL COMMENT 'Description',
  `document_id` BIGINT UNSIGNED NULL COMMENT 'Uploaded file',
  `url` VARCHAR(500) NULL COMMENT 'External link',
  `visibility` ENUM('section','staff_only') NOT NULL DEFAULT 'section' COMMENT 'Who can open it',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT 'Author',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_learning_resources_scope` (`teaching_assignment_id`),
  CONSTRAINT `ck_learning_resources_source` CHECK (`document_id` IS NOT NULL OR `url` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Notes and files shared with a class; access limited to the section (FR-LRN-04).';


-- ==========================================================================
-- MODULE: Assessment and results  (11 tables)
-- ==========================================================================
CREATE TABLE `assessment_types` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `code` VARCHAR(30) NOT NULL COMMENT 'Machine code',
  `name` VARCHAR(80) NOT NULL COMMENT 'Display name',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = hidden',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assessment_types_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Kinds of assessment: quiz, mid exam, final exam, project, ... (FR-EXAM-01).';

CREATE TABLE `grading_scales` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `name` VARCHAR(80) NOT NULL COMMENT 'Scale name',
  `academic_year_id` BIGINT UNSIGNED NULL COMMENT 'Year the scale applies from; NULL = any',
  `status` ENUM('draft','active','retired') NOT NULL DEFAULT 'draft' COMMENT 'Only active scales are used',
  `rounding_decimals` TINYINT UNSIGNED NOT NULL DEFAULT 2 COMMENT 'Decimals kept when rounding totals',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT 'Author',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_grading_scales_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='A school-approved set of grade bands (FR-EXAM-04). Values must come from the school.';

CREATE TABLE `grading_scale_bands` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `scale_id` BIGINT UNSIGNED NOT NULL COMMENT 'Scale',
  `letter` VARCHAR(5) NOT NULL COMMENT 'Grade letter or label',
  `min_score` DECIMAL(5,2) NOT NULL COMMENT 'Lowest percentage in the band',
  `max_score` DECIMAL(5,2) NOT NULL COMMENT 'Highest percentage in the band',
  `grade_points` DECIMAL(3,2) NULL COMMENT 'Grade points, if used',
  `remark` VARCHAR(60) NULL COMMENT 'Remark, e.g. Excellent',
  `is_pass` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = a passing band',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_grading_bands_letter` (`scale_id`, `letter`),
  CONSTRAINT `ck_grading_bands_range` CHECK (`min_score` >= 0 AND `max_score` <= 100 AND `min_score` <= `max_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Score ranges mapped to letters and pass/fail; ranges must not overlap.';

CREATE TABLE `subject_grading_rules` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `subject_id` BIGINT UNSIGNED NOT NULL COMMENT 'Subject',
  `grade_id` BIGINT UNSIGNED NOT NULL COMMENT 'Grade',
  `scale_id` BIGINT UNSIGNED NOT NULL COMMENT 'Grading scale used',
  `pass_mark` DECIMAL(5,2) NOT NULL DEFAULT 50.00 COMMENT 'Minimum percentage to pass; confirm with the school',
  `weights_must_total_100` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = assessment weights must add to 100',
  `missing_mark_rule` ENUM('zero','exclude','incomplete') NOT NULL DEFAULT 'incomplete' COMMENT 'How a missing mark is treated',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subject_grading_rules` (`subject_id`, `grade_id`, `scale_id`),
  KEY `ix_subject_grading_rules_grade` (`grade_id`),
  KEY `ix_subject_grading_rules_scale` (`scale_id`),
  CONSTRAINT `ck_subject_grading_pass` CHECK (`pass_mark` BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Pass mark, weighting and missing-mark rules per subject and grade (FR-ACAD-06, section 5.2).';

CREATE TABLE `assessments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `teaching_assignment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Teacher, subject and section in one reference',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT 'Term; must be in the same year as the teaching assignment',
  `assessment_type_id` BIGINT UNSIGNED NOT NULL COMMENT 'Kind of assessment',
  `title` VARCHAR(190) NOT NULL COMMENT 'Title',
  `max_score` DECIMAL(6,2) NOT NULL COMMENT 'Maximum mark; greater than zero (section 5.2)',
  `weight` DECIMAL(5,2) NOT NULL COMMENT 'Weight in the term total, percent',
  `assessment_date` DATE NULL COMMENT 'Date held',
  `status` ENUM('draft','open','closed') NOT NULL DEFAULT 'draft' COMMENT 'open = teachers can enter marks',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT 'Author',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_assessments_scope` (`teaching_assignment_id`, `term_id`),
  KEY `ix_assessments_term` (`term_id`),
  KEY `ix_assessments_type` (`assessment_type_id`),
  CONSTRAINT `ck_assessments_max` CHECK (`max_score` > 0),
  CONSTRAINT `ck_assessments_weight` CHECK (`weight` >= 0 AND `weight` <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='A scored activity for a class and term (FR-EXAM-01).';

CREATE TABLE `marks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `assessment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Assessment',
  `enrollment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student enrollment; must be in the assessment section',
  `mark_status` ENUM('scored','absent','excused','exempt') NOT NULL DEFAULT 'scored' COMMENT 'Only scored marks carry a score',
  `score` DECIMAL(6,2) NULL COMMENT 'Marks obtained; 0 to the assessment maximum',
  `feedback` VARCHAR(500) NULL COMMENT 'Teacher comment',
  `status` ENUM('draft','submitted','locked') NOT NULL DEFAULT 'draft' COMMENT 'locked after approval; later changes go through correction',
  `entered_by` BIGINT UNSIGNED NOT NULL COMMENT 'Teacher user who entered it',
  `submitted_at` DATETIME(3) NULL COMMENT 'Submission time (UTC)',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_marks` (`assessment_id`, `enrollment_id`),
  KEY `ix_marks_enrollment` (`enrollment_id`),
  CONSTRAINT `ck_marks_score` CHECK (`score` IS NULL OR `score` >= 0),
  CONSTRAINT `ck_marks_status_score` CHECK (`mark_status` = 'scored' OR `score` IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='One mark per assessment per student. Range and enrollment are checked by triggers; changes after submission need a reason.';

CREATE TABLE `marks_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `mark_id` BIGINT UNSIGNED NOT NULL COMMENT 'Mark that changed',
  `old_score` DECIMAL(6,2) NULL COMMENT 'Score before',
  `new_score` DECIMAL(6,2) NULL COMMENT 'Score after',
  `old_mark_status` ENUM('scored','absent','excused','exempt') NOT NULL COMMENT 'Mark status before',
  `new_mark_status` ENUM('scored','absent','excused','exempt') NOT NULL COMMENT 'Mark status after',
  `reason` VARCHAR(500) NOT NULL COMMENT 'Mandatory reason',
  `changed_by` BIGINT UNSIGNED NOT NULL COMMENT 'User who changed it',
  `approved_by` BIGINT UNSIGNED NULL COMMENT 'Second approver; must differ from changed_by',
  `changed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Change time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_marks_history_mark` (`mark_id`, `changed_at`),
  CONSTRAINT `ck_marks_history_approver` CHECK (`approved_by` IS NULL OR `approved_by` <> `changed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Append-only log of every mark change after submission (FR-EXAM-07, FR-EXAM-10).';

CREATE TABLE `result_publications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `section_id` BIGINT UNSIGNED NOT NULL COMMENT 'Section',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT 'Term',
  `version` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Starts at 1; each correction creates the next version',
  `status` ENUM('draft','submitted','approved','published','corrected','withdrawn') NOT NULL DEFAULT 'draft' COMMENT 'Workflow state',
  `supersedes_id` BIGINT UNSIGNED NULL COMMENT 'Earlier version this one replaces',
  `submitted_by` BIGINT UNSIGNED NULL COMMENT 'Submitter',
  `submitted_at` DATETIME(3) NULL COMMENT 'Submission time (UTC)',
  `approved_by` BIGINT UNSIGNED NULL COMMENT 'Approver; differs from submitter',
  `approved_at` DATETIME(3) NULL COMMENT 'Approval time (UTC)',
  `published_by` BIGINT UNSIGNED NULL COMMENT 'Publisher',
  `published_at` DATETIME(3) NULL COMMENT 'Publication time (UTC); results are visible from here',
  `correction_reason` VARCHAR(500) NULL COMMENT 'Why a correction version was created',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_result_publications` (`section_id`, `term_id`, `version`),
  UNIQUE KEY `uq_result_publications_key` (`id`, `term_id`, `version`),
  KEY `ix_result_publications_term` (`term_id`),
  CONSTRAINT `ck_result_pub_approved` CHECK (`status` NOT IN ('approved','published') OR `approved_by` IS NOT NULL),
  CONSTRAINT `ck_result_pub_published` CHECK (`status` <> 'published' OR (`published_by` IS NOT NULL AND `published_at` IS NOT NULL)),
  CONSTRAINT `ck_result_pub_separation` CHECK (`approved_by` IS NULL OR `submitted_by` IS NULL OR `approved_by` <> `submitted_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Result batch for a section and term with a review workflow and version number (FR-EXAM-05, FR-EXAM-06).';

CREATE TABLE `results` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `publication_id` BIGINT UNSIGNED NOT NULL COMMENT 'Result batch',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT 'Term; must equal the publication term',
  `version` INT UNSIGNED NOT NULL COMMENT 'Version; must equal the publication version',
  `enrollment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student enrollment',
  `subject_id` BIGINT UNSIGNED NOT NULL COMMENT 'Subject',
  `total_score` DECIMAL(6,2) NULL COMMENT 'Weighted total out of 100; NULL when incomplete',
  `letter_grade` VARCHAR(5) NULL COMMENT 'Letter from the grading scale',
  `grade_points` DECIMAL(3,2) NULL COMMENT 'Grade points',
  `is_pass` TINYINT(1) NULL COMMENT '1 pass, 0 fail, NULL incomplete',
  `subject_rank` SMALLINT UNSIGNED NULL COMMENT 'Rank in the section, if the school ranks',
  `status` ENUM('draft','approved','published','superseded') NOT NULL DEFAULT 'draft' COMMENT 'Mirrors the publication; superseded after a correction',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_results` (`enrollment_id`, `term_id`, `subject_id`, `version`),
  KEY `ix_results_publication` (`publication_id`),
  KEY `ix_results_subject` (`subject_id`),
  CONSTRAINT `ck_results_total` CHECK (`total_score` IS NULL OR `total_score` BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Calculated subject results per student, one row per version (FR-EXAM-04).';

CREATE TABLE `report_card_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `publication_id` BIGINT UNSIGNED NOT NULL COMMENT 'Result batch',
  `term_id` BIGINT UNSIGNED NOT NULL COMMENT 'Term; equals the publication term',
  `version` INT UNSIGNED NOT NULL COMMENT 'Version; equals the publication version',
  `enrollment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student enrollment',
  `class_rank` SMALLINT UNSIGNED NULL COMMENT 'Rank in the section, if ranked',
  `class_size` SMALLINT UNSIGNED NULL COMMENT 'Students ranked',
  `average_percent` DECIMAL(5,2) NULL COMMENT 'Average percentage',
  `payload_json` JSON NOT NULL COMMENT 'Full card content as issued',
  `generated_by` BIGINT UNSIGNED NOT NULL COMMENT 'User who generated it',
  `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Generation time (UTC)',
  `issued_at` DATETIME(3) NULL COMMENT 'When released to the student or guardian',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_report_cards` (`enrollment_id`, `term_id`, `version`),
  KEY `ix_report_cards_publication` (`publication_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Frozen report card content so issued cards stay stable after corrections (FR-EXAM-08).';

CREATE TABLE `external_exam_results` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student',
  `exam_type` VARCHAR(60) NOT NULL COMMENT 'Exam name; wording follows the current national scheme',
  `exam_year` SMALLINT UNSIGNED NOT NULL COMMENT 'Year taken (Gregorian)',
  `candidate_no` VARCHAR(40) NULL COMMENT 'Candidate or registration number',
  `subject_name` VARCHAR(100) NOT NULL COMMENT 'Subject as reported',
  `score` DECIMAL(6,2) NULL COMMENT 'Score as reported',
  `result_label` VARCHAR(40) NULL COMMENT 'Pass, band or other label as reported',
  `import_batch` CHAR(36) NULL COMMENT 'UUID of the CSV import',
  `imported_by` BIGINT UNSIGNED NOT NULL COMMENT 'User who imported it',
  `imported_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Import time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_external_exam` (`student_id`, `exam_type`, `exam_year`, `subject_name`),
  KEY `ix_external_exam_batch` (`import_batch`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='National or regional exam results imported as external records (FR-ETH-07).';


-- ==========================================================================
-- MODULE: Finance  (9 tables)
-- ==========================================================================
CREATE TABLE `fee_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `code` VARCHAR(30) NOT NULL COMMENT 'Machine code',
  `name` VARCHAR(100) NOT NULL COMMENT 'Display name',
  `is_recurring` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = charged every term or month',
  `status` ENUM('active','inactive') NOT NULL DEFAULT 'active' COMMENT 'Availability',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fee_categories_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Kinds of fee: tuition, registration, exam, ... (FR-FIN-01).';

CREATE TABLE `fee_structures` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `academic_year_id` BIGINT UNSIGNED NOT NULL COMMENT 'Year',
  `grade_id` BIGINT UNSIGNED NOT NULL COMMENT 'Grade',
  `fee_category_id` BIGINT UNSIGNED NOT NULL COMMENT 'Fee category',
  `eligibility` ENUM('all','new_students','continuing') NOT NULL DEFAULT 'all' COMMENT 'Which students the fee applies to',
  `amount` DECIMAL(12,2) NOT NULL COMMENT 'Amount per student',
  `currency` CHAR(3) NOT NULL DEFAULT 'ETB' COMMENT 'ISO 4217 currency code',
  `due_date` DATE NULL COMMENT 'Default due date',
  `due_rule` VARCHAR(150) NULL COMMENT 'Free-text due rule, e.g. before each term',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = not offered',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fee_structures` (`academic_year_id`, `grade_id`, `fee_category_id`, `eligibility`),
  KEY `ix_fee_structures_grade` (`grade_id`),
  KEY `ix_fee_structures_category` (`fee_category_id`),
  CONSTRAINT `ck_fee_structures_amount` CHECK (`amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Fee amounts per year, grade and category (FR-FIN-01).';

CREATE TABLE `scholarships` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student',
  `fee_category_id` BIGINT UNSIGNED NULL COMMENT 'Fee category it applies to; NULL = all',
  `award_type` ENUM('percent','fixed') NOT NULL COMMENT 'Percent of a fee or fixed amount',
  `value` DECIMAL(12,2) NOT NULL COMMENT 'Percent (0-100) or amount',
  `reason` VARCHAR(500) NOT NULL COMMENT 'Why it was granted',
  `approved_by` BIGINT UNSIGNED NOT NULL COMMENT 'Approver',
  `valid_from` DATE NOT NULL COMMENT 'Start date',
  `valid_to` DATE NULL COMMENT 'End date; NULL = open ended',
  `status` ENUM('active','expired','revoked') NOT NULL DEFAULT 'active' COMMENT 'State',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_scholarships_student` (`student_id`, `status`),
  KEY `ix_scholarships_category` (`fee_category_id`),
  CONSTRAINT `ck_scholarships_value` CHECK (`value` > 0 AND (`award_type` = 'fixed' OR `value` <= 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Approved discounts and waivers with reason and approver (FR-FIN-09).';

CREATE TABLE `payment_methods` (
  `code` VARCHAR(30) NOT NULL COMMENT 'Code: cash, bank_transfer, telebirr, cbe_birr',
  `name` VARCHAR(60) NOT NULL COMMENT 'Display name',
  `requires_reference` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = a reference number is mandatory',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 = hidden',
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Order in the UI',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Configurable payment methods; cash, bank transfer, Telebirr and CBE Birr are seeded (FR-FIN-12).';

CREATE TABLE `invoices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `invoice_no` VARCHAR(30) NOT NULL COMMENT 'Public invoice number from number_sequences',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student billed',
  `academic_year_id` BIGINT UNSIGNED NOT NULL COMMENT 'Year',
  `enrollment_id` BIGINT UNSIGNED NULL COMMENT 'Enrollment billed, if relevant',
  `issue_date` DATE NOT NULL COMMENT 'Issue date',
  `due_date` DATE NOT NULL COMMENT 'Due date',
  `currency` CHAR(3) NOT NULL DEFAULT 'ETB' COMMENT 'ISO 4217 currency code',
  `status` ENUM('draft','issued','partially_paid','paid','void') NOT NULL DEFAULT 'draft' COMMENT 'Payment status maintained by sp_refresh_invoice_status',
  `notes` VARCHAR(500) NULL COMMENT 'Notes',
  `created_by` BIGINT UNSIGNED NOT NULL COMMENT 'Creator',
  `voided_by` BIGINT UNSIGNED NULL COMMENT 'User who voided it',
  `voided_at` DATETIME(3) NULL COMMENT 'Void time (UTC)',
  `void_reason` VARCHAR(500) NULL COMMENT 'Mandatory when void',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoices_no` (`invoice_no`),
  KEY `ix_invoices_student` (`student_id`, `academic_year_id`),
  KEY `ix_invoices_status_due` (`status`, `due_date`),
  CONSTRAINT `ck_invoices_dates` CHECK (`due_date` >= `issue_date`),
  CONSTRAINT `ck_invoices_void` CHECK (`status` <> 'void' OR (`void_reason` IS NOT NULL AND `voided_by` IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Fee invoices. Charges are locked once issued; balance is derived (section 5.3, FR-FIN-02, FR-FIN-06).';

CREATE TABLE `invoice_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `invoice_id` BIGINT UNSIGNED NOT NULL COMMENT 'Invoice',
  `fee_category_id` BIGINT UNSIGNED NULL COMMENT 'Fee category',
  `scholarship_id` BIGINT UNSIGNED NULL COMMENT 'Scholarship that produced the discount',
  `description` VARCHAR(255) NOT NULL COMMENT 'Line text',
  `quantity` DECIMAL(10,2) NOT NULL DEFAULT 1.00 COMMENT 'Quantity',
  `unit_amount` DECIMAL(12,2) NOT NULL COMMENT 'Price per unit',
  `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Discount on the line',
  `line_total` DECIMAL(14,2) GENERATED ALWAYS AS (ROUND(`quantity` * `unit_amount` - `discount_amount`, 2)) STORED COMMENT 'Generated: quantity x unit_amount - discount_amount',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_invoice_items_invoice` (`invoice_id`),
  KEY `ix_invoice_items_category` (`fee_category_id`),
  CONSTRAINT `ck_invoice_items_amounts` CHECK (`quantity` > 0 AND `unit_amount` >= 0 AND `discount_amount` >= 0 AND `discount_amount` <= `quantity` * `unit_amount`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Invoice lines with quantity, unit amount and discount (FR-FIN-02).';

CREATE TABLE `payments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `receipt_no` VARCHAR(30) NOT NULL COMMENT 'Public receipt number from number_sequences',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student the payment is for',
  `amount` DECIMAL(12,2) NOT NULL COMMENT 'Amount received; greater than zero',
  `currency` CHAR(3) NOT NULL DEFAULT 'ETB' COMMENT 'ISO 4217 currency code',
  `method` VARCHAR(30) NOT NULL COMMENT 'Payment method code',
  `reference` VARCHAR(100) NULL COMMENT 'Bank slip, transaction or Telebirr/CBE Birr reference',
  `payer_name` VARCHAR(150) NULL COMMENT 'Who paid',
  `received_at` DATETIME(3) NOT NULL COMMENT 'When the money was received (UTC)',
  `received_by` BIGINT UNSIGNED NOT NULL COMMENT 'Accountant who recorded it',
  `status` ENUM('posted','voided','reversed') NOT NULL DEFAULT 'posted' COMMENT 'posted unless cancelled through a reversal',
  `idempotency_key` VARCHAR(64) NOT NULL COMMENT 'Client-supplied key; a retry returns the original payment (AT-07)',
  `evidence_document_id` BIGINT UNSIGNED NULL COMMENT 'Scanned slip or screenshot',
  `notes` VARCHAR(500) NULL COMMENT 'Notes',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_receipt` (`receipt_no`),
  UNIQUE KEY `uq_payments_idempotency` (`idempotency_key`),
  UNIQUE KEY `uq_payments_method_ref` (`method`, `reference`),
  KEY `ix_payments_student` (`student_id`, `received_at`),
  KEY `ix_payments_received` (`received_at`),
  KEY `ix_payments_status` (`status`),
  CONSTRAINT `ck_payments_amount` CHECK (`amount` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Posted payments. Immutable except status; never deleted (section 5.3, FR-FIN-03, FR-FIN-05).';

CREATE TABLE `payment_allocations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `payment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Payment',
  `invoice_id` BIGINT UNSIGNED NOT NULL COMMENT 'Invoice credited',
  `allocated_amount` DECIMAL(12,2) NOT NULL COMMENT 'Amount applied; greater than zero',
  `allocated_by` BIGINT UNSIGNED NOT NULL COMMENT 'User who allocated',
  `allocated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Allocation time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payment_allocations` (`payment_id`, `invoice_id`),
  KEY `ix_payment_allocations_invoice` (`invoice_id`),
  CONSTRAINT `ck_payment_allocations_amount` CHECK (`allocated_amount` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Splits a payment across invoices; totals are enforced by trigger (FR-FIN-04).';

CREATE TABLE `payment_reversals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `payment_id` BIGINT UNSIGNED NOT NULL COMMENT 'Payment being reversed',
  `reversal_type` ENUM('refund','void') NOT NULL COMMENT 'Refund of money or void of a mistaken entry',
  `amount` DECIMAL(12,2) NOT NULL COMMENT 'Amount reversed',
  `reason` VARCHAR(500) NOT NULL COMMENT 'Mandatory reason',
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT 'Approval state',
  `requested_by` BIGINT UNSIGNED NOT NULL COMMENT 'Requester',
  `approved_by` BIGINT UNSIGNED NULL COMMENT 'Approver; must differ from the requester',
  `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Request time (UTC)',
  `decided_at` DATETIME(3) NULL COMMENT 'Decision time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_payment_reversals_payment` (`payment_id`),
  CONSTRAINT `ck_payment_reversals_amount` CHECK (`amount` > 0),
  CONSTRAINT `ck_payment_reversals_approver` CHECK (`approved_by` IS NULL OR `approved_by` <> `requested_by`),
  CONSTRAINT `ck_payment_reversals_status` CHECK (`status` <> 'approved' OR `approved_by` IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Refund and void requests with a second approver (FR-FIN-07).';


-- ==========================================================================
-- MODULE: Library  (6 tables)
-- ==========================================================================
CREATE TABLE `book_categories` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `name` VARCHAR(100) NOT NULL COMMENT 'Category name',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_book_categories_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Library subject categories.';

CREATE TABLE `books` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `isbn` VARCHAR(20) NULL COMMENT 'ISBN when available',
  `title` VARCHAR(255) NOT NULL COMMENT 'Title',
  `author` VARCHAR(255) NOT NULL COMMENT 'Author',
  `publisher` VARCHAR(190) NULL COMMENT 'Publisher',
  `publication_year` SMALLINT UNSIGNED NULL COMMENT 'Year of publication',
  `category_id` BIGINT UNSIGNED NOT NULL COMMENT 'Category',
  `language` VARCHAR(40) NULL COMMENT 'Language of the book',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_books_isbn` (`isbn`),
  KEY `ix_books_category` (`category_id`),
  FULLTEXT KEY `ft_books_search` (`title`, `author`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Catalog titles (FR-LIB-01).';

CREATE TABLE `book_copies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `book_id` BIGINT UNSIGNED NOT NULL COMMENT 'Title',
  `barcode` VARCHAR(40) NOT NULL COMMENT 'Unique copy identifier',
  `status` ENUM('available','on_loan','reserved','lost','damaged','withdrawn') NOT NULL DEFAULT 'available' COMMENT 'Availability; kept in sync by loan triggers',
  `location` VARCHAR(100) NULL COMMENT 'Shelf or room',
  `acquired_on` DATE NULL COMMENT 'Date acquired',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_book_copies_barcode` (`barcode`),
  KEY `ix_book_copies_book` (`book_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Individual physical copies with barcode and availability (FR-LIB-01, FR-LIB-02).';

CREATE TABLE `library_loans` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `copy_id` BIGINT UNSIGNED NOT NULL COMMENT 'Copy borrowed',
  `student_id` BIGINT UNSIGNED NULL COMMENT 'Borrower when a student',
  `staff_id` BIGINT UNSIGNED NULL COMMENT 'Borrower when a staff member',
  `checkout_at` DATETIME(3) NOT NULL COMMENT 'Checkout time (UTC)',
  `due_at` DATETIME(3) NOT NULL COMMENT 'Due time (UTC)',
  `returned_at` DATETIME(3) NULL COMMENT 'Return time; NULL while on loan',
  `renewal_count` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Times renewed',
  `issued_by` BIGINT UNSIGNED NOT NULL COMMENT 'Librarian who checked it out',
  `received_by` BIGINT UNSIGNED NULL COMMENT 'Librarian who took it back',
  `active_copy_id` BIGINT UNSIGNED GENERATED ALWAYS AS (IF(`returned_at` IS NULL, `copy_id`, NULL)) STORED COMMENT 'Generated: copy_id while on loan, else NULL; unique key allows one active loan per copy',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_one_active_loan` (`active_copy_id`),
  KEY `ix_loans_copy` (`copy_id`),
  KEY `ix_loans_student` (`student_id`, `returned_at`),
  KEY `ix_loans_staff` (`staff_id`, `returned_at`),
  KEY `ix_loans_due` (`returned_at`, `due_at`),
  CONSTRAINT `ck_loans_borrower` CHECK ((`student_id` IS NULL) <> (`staff_id` IS NULL)),
  CONSTRAINT `ck_loans_dates` CHECK (`due_at` > `checkout_at` AND (`returned_at` IS NULL OR `returned_at` >= `checkout_at`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Checkouts and returns. One active loan per copy is enforced by a unique key (FR-LIB-03).';

CREATE TABLE `library_reservations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `book_id` BIGINT UNSIGNED NOT NULL COMMENT 'Title reserved',
  `student_id` BIGINT UNSIGNED NOT NULL COMMENT 'Student',
  `status` ENUM('active','fulfilled','cancelled','expired') NOT NULL DEFAULT 'active' COMMENT 'State',
  `reserved_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Reservation time (UTC)',
  `expires_at` DATETIME(3) NOT NULL COMMENT 'Hold expiry (UTC)',
  `fulfilled_loan_id` BIGINT UNSIGNED NULL COMMENT 'Loan that fulfilled it',
  `open_key` TINYINT GENERATED ALWAYS AS (IF(`status` = 'active', 1, NULL)) STORED COMMENT 'Generated: 1 while active, else NULL; unique key allows one open reservation',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_open_reservation` (`book_id`, `student_id`, `open_key`),
  KEY `ix_reservations_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Holds on a title; one open reservation per student and title.';

CREATE TABLE `library_fines` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Surrogate primary key',
  `loan_id` BIGINT UNSIGNED NOT NULL COMMENT 'Loan that caused the fine',
  `amount` DECIMAL(10,2) NOT NULL COMMENT 'Fine amount',
  `reason` ENUM('overdue','damaged','lost') NOT NULL DEFAULT 'overdue' COMMENT 'Reason',
  `status` ENUM('assessed','paid','waived') NOT NULL DEFAULT 'assessed' COMMENT 'State',
  `assessed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Assessment time (UTC)',
  `paid_payment_id` BIGINT UNSIGNED NULL COMMENT 'Payment that settled it',
  `waived_by` BIGINT UNSIGNED NULL COMMENT 'Approver of a waiver',
  `waive_reason` VARCHAR(255) NULL COMMENT 'Reason for the waiver',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Row creation time (UTC)',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Last change time (UTC)',
  PRIMARY KEY (`id`),
  KEY `ix_library_fines_loan` (`loan_id`),
  KEY `ix_library_fines_status` (`status`),
  CONSTRAINT `ck_library_fines_amount` CHECK (`amount` >= 0),
  CONSTRAINT `ck_library_fines_waiver` CHECK (`status` <> 'waived' OR (`waived_by` IS NOT NULL AND `waive_reason` IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Overdue and damage fines where enabled (FR-LIB-04).';


-- ##########################################################################
-- PART B - FOREIGN KEYS
-- ##########################################################################

-- Module: Identity, access and system
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_role_id` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);
ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`);
ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_role_id` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;
ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_permission_id` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE;
ALTER TABLE `refresh_sessions` ADD CONSTRAINT `fk_refresh_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `refresh_sessions` ADD CONSTRAINT `fk_refresh_sessions_replaced_by_id` FOREIGN KEY (`replaced_by_id`) REFERENCES `refresh_sessions` (`id`);
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `fk_password_reset_tokens_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `system_settings` ADD CONSTRAINT `fk_system_settings_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`);
ALTER TABLE `audit_logs` ADD CONSTRAINT `fk_audit_logs_actor_user_id` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`);

-- Module: Communication and documents
ALTER TABLE `documents` ADD CONSTRAINT `fk_documents_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`);
ALTER TABLE `notifications` ADD CONSTRAINT `fk_notifications_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `notification_outbox` ADD CONSTRAINT `fk_notification_outbox_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `announcements` ADD CONSTRAINT `fk_announcements_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
ALTER TABLE `announcements` ADD CONSTRAINT `fk_announcements_published_by` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`);
ALTER TABLE `announcement_targets` ADD CONSTRAINT `fk_announcement_targets_announcement_id` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`id`) ON DELETE CASCADE;

-- Module: Academic structure
ALTER TABLE `terms` ADD CONSTRAINT `fk_terms_academic_year_id` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `calendar_events` ADD CONSTRAINT `fk_calendar_events_academic_year_id` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `calendar_events` ADD CONSTRAINT `fk_calendar_events_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
ALTER TABLE `grade_subjects` ADD CONSTRAINT `fk_grade_subjects_grade_id` FOREIGN KEY (`grade_id`) REFERENCES `grades` (`id`);
ALTER TABLE `grade_subjects` ADD CONSTRAINT `fk_grade_subjects_subject_id` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`);
ALTER TABLE `sections` ADD CONSTRAINT `fk_sections_grade_id` FOREIGN KEY (`grade_id`) REFERENCES `grades` (`id`);
ALTER TABLE `sections` ADD CONSTRAINT `fk_sections_academic_year_id` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `sections` ADD CONSTRAINT `fk_sections_homeroom_staff_id` FOREIGN KEY (`homeroom_staff_id`) REFERENCES `staff` (`id`);
ALTER TABLE `sections` ADD CONSTRAINT `fk_sections_classroom_id` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms` (`id`);
ALTER TABLE `teaching_assignments` ADD CONSTRAINT `fk_teaching_assignments_staff_id` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`);
ALTER TABLE `teaching_assignments` ADD CONSTRAINT `fk_teaching_assignments_subject_id` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`);
ALTER TABLE `teaching_assignments` ADD CONSTRAINT `fk_teaching_assignments_section_id_academic_year_id` FOREIGN KEY (`section_id`, `academic_year_id`) REFERENCES `sections` (`id`, `academic_year_id`);
ALTER TABLE `timetable_entries` ADD CONSTRAINT `fk_timetable_entries_term_id` FOREIGN KEY (`term_id`) REFERENCES `terms` (`id`);
ALTER TABLE `timetable_entries` ADD CONSTRAINT `fk_timetable_entries_section_id` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`);
ALTER TABLE `timetable_entries` ADD CONSTRAINT `fk_timetable_entries_subject_id` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`);
ALTER TABLE `timetable_entries` ADD CONSTRAINT `fk_timetable_entries_staff_id` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`);
ALTER TABLE `timetable_entries` ADD CONSTRAINT `fk_timetable_entries_room_id` FOREIGN KEY (`room_id`) REFERENCES `classrooms` (`id`);
ALTER TABLE `timetable_entries` ADD CONSTRAINT `fk_timetable_entries_time_slot_id` FOREIGN KEY (`time_slot_id`) REFERENCES `time_slots` (`id`);

-- Module: People and enrollment
ALTER TABLE `students` ADD CONSTRAINT `fk_students_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `students` ADD CONSTRAINT `fk_students_photo_document_id` FOREIGN KEY (`photo_document_id`) REFERENCES `documents` (`id`);
ALTER TABLE `guardians` ADD CONSTRAINT `fk_guardians_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `guardians` ADD CONSTRAINT `fk_guardians_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`);
ALTER TABLE `student_guardians` ADD CONSTRAINT `fk_student_guardians_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`);
ALTER TABLE `student_guardians` ADD CONSTRAINT `fk_student_guardians_guardian_id` FOREIGN KEY (`guardian_id`) REFERENCES `guardians` (`id`);
ALTER TABLE `staff` ADD CONSTRAINT `fk_staff_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
ALTER TABLE `staff_attendance` ADD CONSTRAINT `fk_staff_attendance_staff_id` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`);
ALTER TABLE `staff_attendance` ADD CONSTRAINT `fk_staff_attendance_recorded_by` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`);
ALTER TABLE `enrollments` ADD CONSTRAINT `fk_enrollments_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`);
ALTER TABLE `enrollments` ADD CONSTRAINT `fk_enrollments_section_id_academic_year_id` FOREIGN KEY (`section_id`, `academic_year_id`) REFERENCES `sections` (`id`, `academic_year_id`);
ALTER TABLE `enrollments` ADD CONSTRAINT `fk_enrollments_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
ALTER TABLE `student_status_history` ADD CONSTRAINT `fk_student_status_history_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`);
ALTER TABLE `student_status_history` ADD CONSTRAINT `fk_student_status_history_changed_by` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`);
ALTER TABLE `transfers_withdrawals` ADD CONSTRAINT `fk_transfers_withdrawals_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`);
ALTER TABLE `transfers_withdrawals` ADD CONSTRAINT `fk_transfers_withdrawals_enrollment_id` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`);
ALTER TABLE `transfers_withdrawals` ADD CONSTRAINT `fk_transfers_withdrawals_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`);
ALTER TABLE `promotions` ADD CONSTRAINT `fk_promotions_enrollment_id` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`);
ALTER TABLE `promotions` ADD CONSTRAINT `fk_promotions_to_grade_id` FOREIGN KEY (`to_grade_id`) REFERENCES `grades` (`id`);
ALTER TABLE `promotions` ADD CONSTRAINT `fk_promotions_to_academic_year_id` FOREIGN KEY (`to_academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `promotions` ADD CONSTRAINT `fk_promotions_decided_by` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`);
ALTER TABLE `discipline_records` ADD CONSTRAINT `fk_discipline_records_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`);
ALTER TABLE `discipline_records` ADD CONSTRAINT `fk_discipline_records_enrollment_id` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`);
ALTER TABLE `discipline_records` ADD CONSTRAINT `fk_discipline_records_recorded_by` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`);

-- Module: Attendance
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `fk_attendance_sessions_section_id` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`);
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `fk_attendance_sessions_time_slot_id` FOREIGN KEY (`time_slot_id`) REFERENCES `time_slots` (`id`);
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `fk_attendance_sessions_subject_id` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`);
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `fk_attendance_sessions_recorded_by_staff_id` FOREIGN KEY (`recorded_by_staff_id`) REFERENCES `staff` (`id`);
ALTER TABLE `attendance_records` ADD CONSTRAINT `fk_attendance_records_session_id` FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions` (`id`);
ALTER TABLE `attendance_records` ADD CONSTRAINT `fk_attendance_records_enrollment_id` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`);
ALTER TABLE `attendance_records` ADD CONSTRAINT `fk_attendance_records_status_code` FOREIGN KEY (`status_code`) REFERENCES `attendance_statuses` (`code`);
ALTER TABLE `attendance_records` ADD CONSTRAINT `fk_attendance_records_marked_by` FOREIGN KEY (`marked_by`) REFERENCES `users` (`id`);

-- Module: Learning
ALTER TABLE `assignments` ADD CONSTRAINT `fk_assignments_teaching_assignment_id` FOREIGN KEY (`teaching_assignment_id`) REFERENCES `teaching_assignments` (`id`);
ALTER TABLE `assignments` ADD CONSTRAINT `fk_assignments_term_id` FOREIGN KEY (`term_id`) REFERENCES `terms` (`id`);
ALTER TABLE `assignments` ADD CONSTRAINT `fk_assignments_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
ALTER TABLE `submissions` ADD CONSTRAINT `fk_submissions_assignment_id` FOREIGN KEY (`assignment_id`) REFERENCES `assignments` (`id`);
ALTER TABLE `submissions` ADD CONSTRAINT `fk_submissions_enrollment_id` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`);
ALTER TABLE `submissions` ADD CONSTRAINT `fk_submissions_graded_by` FOREIGN KEY (`graded_by`) REFERENCES `users` (`id`);
ALTER TABLE `learning_resources` ADD CONSTRAINT `fk_learning_resources_teaching_assignment_id` FOREIGN KEY (`teaching_assignment_id`) REFERENCES `teaching_assignments` (`id`);
ALTER TABLE `learning_resources` ADD CONSTRAINT `fk_learning_resources_document_id` FOREIGN KEY (`document_id`) REFERENCES `documents` (`id`);
ALTER TABLE `learning_resources` ADD CONSTRAINT `fk_learning_resources_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

-- Module: Assessment and results
ALTER TABLE `grading_scales` ADD CONSTRAINT `fk_grading_scales_academic_year_id` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `grading_scales` ADD CONSTRAINT `fk_grading_scales_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
ALTER TABLE `grading_scale_bands` ADD CONSTRAINT `fk_grading_scale_bands_scale_id` FOREIGN KEY (`scale_id`) REFERENCES `grading_scales` (`id`) ON DELETE CASCADE;
ALTER TABLE `subject_grading_rules` ADD CONSTRAINT `fk_subject_grading_rules_subject_id` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`);
ALTER TABLE `subject_grading_rules` ADD CONSTRAINT `fk_subject_grading_rules_grade_id` FOREIGN KEY (`grade_id`) REFERENCES `grades` (`id`);
ALTER TABLE `subject_grading_rules` ADD CONSTRAINT `fk_subject_grading_rules_scale_id` FOREIGN KEY (`scale_id`) REFERENCES `grading_scales` (`id`);
ALTER TABLE `assessments` ADD CONSTRAINT `fk_assessments_teaching_assignment_id` FOREIGN KEY (`teaching_assignment_id`) REFERENCES `teaching_assignments` (`id`);
ALTER TABLE `assessments` ADD CONSTRAINT `fk_assessments_term_id` FOREIGN KEY (`term_id`) REFERENCES `terms` (`id`);
ALTER TABLE `assessments` ADD CONSTRAINT `fk_assessments_assessment_type_id` FOREIGN KEY (`assessment_type_id`) REFERENCES `assessment_types` (`id`);
ALTER TABLE `assessments` ADD CONSTRAINT `fk_assessments_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
ALTER TABLE `marks` ADD CONSTRAINT `fk_marks_assessment_id` FOREIGN KEY (`assessment_id`) REFERENCES `assessments` (`id`);
ALTER TABLE `marks` ADD CONSTRAINT `fk_marks_enrollment_id` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`);
ALTER TABLE `marks` ADD CONSTRAINT `fk_marks_entered_by` FOREIGN KEY (`entered_by`) REFERENCES `users` (`id`);
ALTER TABLE `marks_history` ADD CONSTRAINT `fk_marks_history_mark_id` FOREIGN KEY (`mark_id`) REFERENCES `marks` (`id`);
ALTER TABLE `marks_history` ADD CONSTRAINT `fk_marks_history_changed_by` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`);
ALTER TABLE `marks_history` ADD CONSTRAINT `fk_marks_history_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`);
ALTER TABLE `result_publications` ADD CONSTRAINT `fk_result_publications_section_id` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`);
ALTER TABLE `result_publications` ADD CONSTRAINT `fk_result_publications_term_id` FOREIGN KEY (`term_id`) REFERENCES `terms` (`id`);
ALTER TABLE `result_publications` ADD CONSTRAINT `fk_result_publications_supersedes_id` FOREIGN KEY (`supersedes_id`) REFERENCES `result_publications` (`id`);
ALTER TABLE `result_publications` ADD CONSTRAINT `fk_result_publications_submitted_by` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`);
ALTER TABLE `result_publications` ADD CONSTRAINT `fk_result_publications_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`);
ALTER TABLE `result_publications` ADD CONSTRAINT `fk_result_publications_published_by` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`);
ALTER TABLE `results` ADD CONSTRAINT `fk_results_publication_id_term_id_version` FOREIGN KEY (`publication_id`, `term_id`, `version`) REFERENCES `result_publications` (`id`, `term_id`, `version`);
ALTER TABLE `results` ADD CONSTRAINT `fk_results_enrollment_id` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`);
ALTER TABLE `results` ADD CONSTRAINT `fk_results_subject_id` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`);
ALTER TABLE `report_card_snapshots` ADD CONSTRAINT `fk_report_card_snapshots_publication_id_term_id_version` FOREIGN KEY (`publication_id`, `term_id`, `version`) REFERENCES `result_publications` (`id`, `term_id`, `version`);
ALTER TABLE `report_card_snapshots` ADD CONSTRAINT `fk_report_card_snapshots_enrollment_id` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`);
ALTER TABLE `report_card_snapshots` ADD CONSTRAINT `fk_report_card_snapshots_generated_by` FOREIGN KEY (`generated_by`) REFERENCES `users` (`id`);
ALTER TABLE `external_exam_results` ADD CONSTRAINT `fk_external_exam_results_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`);
ALTER TABLE `external_exam_results` ADD CONSTRAINT `fk_external_exam_results_imported_by` FOREIGN KEY (`imported_by`) REFERENCES `users` (`id`);

-- Module: Finance
ALTER TABLE `fee_structures` ADD CONSTRAINT `fk_fee_structures_academic_year_id` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `fee_structures` ADD CONSTRAINT `fk_fee_structures_grade_id` FOREIGN KEY (`grade_id`) REFERENCES `grades` (`id`);
ALTER TABLE `fee_structures` ADD CONSTRAINT `fk_fee_structures_fee_category_id` FOREIGN KEY (`fee_category_id`) REFERENCES `fee_categories` (`id`);
ALTER TABLE `scholarships` ADD CONSTRAINT `fk_scholarships_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`);
ALTER TABLE `scholarships` ADD CONSTRAINT `fk_scholarships_fee_category_id` FOREIGN KEY (`fee_category_id`) REFERENCES `fee_categories` (`id`);
ALTER TABLE `scholarships` ADD CONSTRAINT `fk_scholarships_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`);
ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`);
ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_academic_year_id` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_enrollment_id` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`);
ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);
ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_voided_by` FOREIGN KEY (`voided_by`) REFERENCES `users` (`id`);
ALTER TABLE `invoice_items` ADD CONSTRAINT `fk_invoice_items_invoice_id` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`);
ALTER TABLE `invoice_items` ADD CONSTRAINT `fk_invoice_items_fee_category_id` FOREIGN KEY (`fee_category_id`) REFERENCES `fee_categories` (`id`);
ALTER TABLE `invoice_items` ADD CONSTRAINT `fk_invoice_items_scholarship_id` FOREIGN KEY (`scholarship_id`) REFERENCES `scholarships` (`id`);
ALTER TABLE `payments` ADD CONSTRAINT `fk_payments_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`);
ALTER TABLE `payments` ADD CONSTRAINT `fk_payments_method` FOREIGN KEY (`method`) REFERENCES `payment_methods` (`code`);
ALTER TABLE `payments` ADD CONSTRAINT `fk_payments_received_by` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`);
ALTER TABLE `payments` ADD CONSTRAINT `fk_payments_evidence_document_id` FOREIGN KEY (`evidence_document_id`) REFERENCES `documents` (`id`);
ALTER TABLE `payment_allocations` ADD CONSTRAINT `fk_payment_allocations_payment_id` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`);
ALTER TABLE `payment_allocations` ADD CONSTRAINT `fk_payment_allocations_invoice_id` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`);
ALTER TABLE `payment_allocations` ADD CONSTRAINT `fk_payment_allocations_allocated_by` FOREIGN KEY (`allocated_by`) REFERENCES `users` (`id`);
ALTER TABLE `payment_reversals` ADD CONSTRAINT `fk_payment_reversals_payment_id` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`);
ALTER TABLE `payment_reversals` ADD CONSTRAINT `fk_payment_reversals_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`);
ALTER TABLE `payment_reversals` ADD CONSTRAINT `fk_payment_reversals_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`);

-- Module: Library
ALTER TABLE `books` ADD CONSTRAINT `fk_books_category_id` FOREIGN KEY (`category_id`) REFERENCES `book_categories` (`id`);
ALTER TABLE `book_copies` ADD CONSTRAINT `fk_book_copies_book_id` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`);
ALTER TABLE `library_loans` ADD CONSTRAINT `fk_library_loans_copy_id` FOREIGN KEY (`copy_id`) REFERENCES `book_copies` (`id`);
ALTER TABLE `library_loans` ADD CONSTRAINT `fk_library_loans_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`);
ALTER TABLE `library_loans` ADD CONSTRAINT `fk_library_loans_staff_id` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`id`);
ALTER TABLE `library_loans` ADD CONSTRAINT `fk_library_loans_issued_by` FOREIGN KEY (`issued_by`) REFERENCES `users` (`id`);
ALTER TABLE `library_loans` ADD CONSTRAINT `fk_library_loans_received_by` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`);
ALTER TABLE `library_reservations` ADD CONSTRAINT `fk_library_reservations_book_id` FOREIGN KEY (`book_id`) REFERENCES `books` (`id`);
ALTER TABLE `library_reservations` ADD CONSTRAINT `fk_library_reservations_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`);
ALTER TABLE `library_reservations` ADD CONSTRAINT `fk_library_reservations_fulfilled_loan_id` FOREIGN KEY (`fulfilled_loan_id`) REFERENCES `library_loans` (`id`);
ALTER TABLE `library_fines` ADD CONSTRAINT `fk_library_fines_loan_id` FOREIGN KEY (`loan_id`) REFERENCES `library_loans` (`id`);
ALTER TABLE `library_fines` ADD CONSTRAINT `fk_library_fines_paid_payment_id` FOREIGN KEY (`paid_payment_id`) REFERENCES `payments` (`id`);
ALTER TABLE `library_fines` ADD CONSTRAINT `fk_library_fines_waived_by` FOREIGN KEY (`waived_by`) REFERENCES `users` (`id`);

SET FOREIGN_KEY_CHECKS = 1;
