-- School Management ERP - database accounts and privileges
-- Replace every CHANGE_ME password with a long random secret from your secret manager (NFR-SEC-03).
-- Change the host part ('localhost') to the address your API runs from; never use '%' in production.
-- Four accounts: migrator (DDL), app (runtime), readonly (reporting), backup (dumps).

CREATE USER IF NOT EXISTS 'erp_migrator'@'localhost' IDENTIFIED BY 'CHANGE_ME_migrator';
CREATE USER IF NOT EXISTS 'erp_app'@'localhost'      IDENTIFIED BY 'CHANGE_ME_app';
CREATE USER IF NOT EXISTS 'erp_readonly'@'localhost' IDENTIFIED BY 'CHANGE_ME_readonly';
CREATE USER IF NOT EXISTS 'erp_backup'@'localhost'   IDENTIFIED BY 'CHANGE_ME_backup';

-- Migrator: schema changes only; used by the deployment pipeline, never by the running API.
GRANT ALL PRIVILEGES ON `school_erp`.* TO 'erp_migrator'@'localhost';

-- App: normal reads and writes, but audit and finance history cannot be rewritten (AT-19, section 5.3).
-- full DML on 62 tables
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`users` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`roles` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`permissions` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`user_roles` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`role_permissions` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`refresh_sessions` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`password_reset_tokens` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`system_settings` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`number_sequences` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`documents` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`notifications` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`notification_outbox` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`announcements` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`announcement_targets` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`academic_years` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`terms` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`grades` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`classrooms` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`time_slots` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`calendar_events` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`subjects` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`grade_subjects` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`sections` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`teaching_assignments` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`timetable_entries` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`students` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`guardians` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`student_guardians` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`staff` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`staff_attendance` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`enrollments` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`transfers_withdrawals` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`promotions` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`discipline_records` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`attendance_statuses` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`attendance_sessions` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`attendance_records` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`assignments` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`submissions` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`learning_resources` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`assessment_types` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`grading_scales` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`grading_scale_bands` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`subject_grading_rules` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`assessments` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`marks` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`result_publications` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`results` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`report_card_snapshots` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`external_exam_results` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON `school_erp`.`academic_progression_policies` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, DELETE ON `school_erp`.`academic_subject_prerequisites` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON `school_erp`.`academic_course_enrollments` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON `school_erp`.`academic_exam_schedules` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON `school_erp`.`academic_probation_records` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON `school_erp`.`academic_graduation_reviews` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT ON `school_erp`.`academic_transcript_issues` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`fee_categories` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`fee_structures` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`scholarships` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`payment_methods` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`invoices` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`invoice_items` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`book_categories` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`books` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`book_copies` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`library_loans` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`library_reservations` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON `school_erp`.`library_fines` TO 'erp_app'@'localhost';
-- append-only: no UPDATE, no DELETE
GRANT SELECT, INSERT ON `school_erp`.`audit_logs` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT ON `school_erp`.`marks_history` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT ON `school_erp`.`student_status_history` TO 'erp_app'@'localhost';
-- financial records: no DELETE
GRANT SELECT, INSERT, UPDATE ON `school_erp`.`payments` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON `school_erp`.`payment_allocations` TO 'erp_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON `school_erp`.`payment_reversals` TO 'erp_app'@'localhost';
-- views and routines
GRANT SELECT ON `school_erp`.`v_current_enrollments` TO 'erp_app'@'localhost';
GRANT SELECT ON `school_erp`.`v_section_capacity` TO 'erp_app'@'localhost';
GRANT SELECT ON `school_erp`.`v_invoice_balances` TO 'erp_app'@'localhost';
GRANT SELECT ON `school_erp`.`v_payment_unallocated` TO 'erp_app'@'localhost';
GRANT SELECT ON `school_erp`.`v_attendance_summary` TO 'erp_app'@'localhost';
GRANT SELECT ON `school_erp`.`v_mark_totals` TO 'erp_app'@'localhost';
GRANT SELECT ON `school_erp`.`v_library_overdue` TO 'erp_app'@'localhost';
GRANT EXECUTE ON `school_erp`.* TO 'erp_app'@'localhost';

-- Readonly: reports and BI tools; credentials and sessions are not readable.
GRANT SELECT ON `school_erp`.`roles` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`permissions` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`user_roles` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`role_permissions` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`system_settings` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`number_sequences` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`audit_logs` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`documents` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`notifications` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`notification_outbox` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`announcements` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`announcement_targets` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`academic_years` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`terms` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`grades` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`classrooms` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`time_slots` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`calendar_events` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`subjects` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`grade_subjects` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`sections` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`teaching_assignments` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`timetable_entries` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`students` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`guardians` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`student_guardians` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`staff` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`staff_attendance` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`enrollments` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`student_status_history` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`transfers_withdrawals` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`promotions` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`discipline_records` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`attendance_statuses` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`attendance_sessions` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`attendance_records` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`assignments` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`submissions` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`learning_resources` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`assessment_types` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`grading_scales` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`grading_scale_bands` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`subject_grading_rules` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`assessments` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`marks` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`marks_history` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`result_publications` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`results` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`report_card_snapshots` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`external_exam_results` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`academic_progression_policies` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`academic_subject_prerequisites` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`academic_course_enrollments` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`academic_exam_schedules` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`academic_probation_records` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`academic_graduation_reviews` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`academic_transcript_issues` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`fee_categories` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`fee_structures` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`scholarships` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`payment_methods` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`invoices` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`invoice_items` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`payments` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`payment_allocations` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`payment_reversals` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`book_categories` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`books` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`book_copies` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`library_loans` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`library_reservations` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`library_fines` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`v_current_enrollments` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`v_section_capacity` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`v_invoice_balances` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`v_payment_unallocated` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`v_attendance_summary` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`v_mark_totals` TO 'erp_readonly'@'localhost';
GRANT SELECT ON `school_erp`.`v_library_overdue` TO 'erp_readonly'@'localhost';

-- Backup: logical dumps with mysqldump --single-transaction (add global PROCESS / RELOAD only if your tool needs them).
GRANT SELECT, SHOW VIEW, TRIGGER, LOCK TABLES, EVENT, EXECUTE ON `school_erp`.* TO 'erp_backup'@'localhost';
-- Dumping routines needs one more privilege, and it depends on the server. Run the line for your server:
--   MariaDB:        GRANT SELECT ON mysql.proc TO 'erp_backup'@'localhost';   (tested)
--   MySQL 8.0.20+: GRANT SHOW_ROUTINE ON *.* TO 'erp_backup'@'localhost';   (not tested here)

FLUSH PRIVILEGES;
