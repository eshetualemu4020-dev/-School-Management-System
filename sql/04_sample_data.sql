-- School Management ERP - SAMPLE DATA FOR DEVELOPMENT AND TESTS ONLY
-- Synthetic records. Never run this against production (SRS 6.4: seed scripts must not touch production data).
-- Requires 01, 02 and 03 to have been run and all business tables to be empty (explicit ids are used).
SET NAMES utf8mb4;

-- ---------------------------------------------------------------- users and roles
-- password_hash values are placeholders, not real hashes; nobody can sign in with them.
INSERT INTO users (id, username, email, phone, password_hash, status, must_change_password) VALUES
  (1,  'admin',      'admin@example.test',      '+251900000001', 'SAMPLE-NOT-A-REAL-HASH', 'active', 0),
  (2,  'registrar',  'registrar@example.test',  '+251900000002', 'SAMPLE-NOT-A-REAL-HASH', 'active', 0),
  (3,  'teacher.math','math@example.test',      '+251900000003', 'SAMPLE-NOT-A-REAL-HASH', 'active', 0),
  (4,  'teacher.eng','eng@example.test',        '+251900000004', 'SAMPLE-NOT-A-REAL-HASH', 'active', 0),
  (5,  'accountant', 'accountant@example.test', '+251900000005', 'SAMPLE-NOT-A-REAL-HASH', 'active', 0),
  (6,  'librarian',  'librarian@example.test',  '+251900000006', 'SAMPLE-NOT-A-REAL-HASH', 'active', 0),
  (7,  'student01',  'student01@example.test',  NULL,            'SAMPLE-NOT-A-REAL-HASH', 'active', 0),
  (8,  'guardian01', 'guardian01@example.test', '+251900000008', 'SAMPLE-NOT-A-REAL-HASH', 'active', 0),
  (9,  'principal',  'principal@example.test',  '+251900000009', 'SAMPLE-NOT-A-REAL-HASH', 'active', 0),
  (10, 'acad.director','director@example.test', '+251900000010', 'SAMPLE-NOT-A-REAL-HASH', 'active', 0);

INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES
  (1,  (SELECT id FROM roles WHERE code = 'system_admin'), 1),
  (2,  (SELECT id FROM roles WHERE code = 'registrar'), 1),
  (3,  (SELECT id FROM roles WHERE code = 'teacher'), 1),
  (4,  (SELECT id FROM roles WHERE code = 'teacher'), 1),
  (5,  (SELECT id FROM roles WHERE code = 'accountant'), 1),
  (6,  (SELECT id FROM roles WHERE code = 'librarian'), 1),
  (7,  (SELECT id FROM roles WHERE code = 'student'), 1),
  (8,  (SELECT id FROM roles WHERE code = 'guardian'), 1),
  (9,  (SELECT id FROM roles WHERE code = 'principal'), 1),
  (10, (SELECT id FROM roles WHERE code = 'academic_director'), 1);

-- ---------------------------------------------------------------- academic structure
INSERT INTO academic_years (id, name, label_ec, start_date, end_date, status, is_current) VALUES
  (2, '2025/26', '2018 E.C.', '2025-09-11', '2026-07-05', 'closed', 0),
  (1, '2026/27', '2019 E.C.', '2026-09-11', '2027-07-06', 'active', 1);

INSERT INTO terms (id, academic_year_id, term_no, name, start_date, end_date, status, is_current) VALUES
  (1, 1, 1, 'Semester 1', '2026-09-11', '2027-01-31', 'active',  1),
  (2, 1, 2, 'Semester 2', '2027-02-08', '2027-07-06', 'planned', 0);

INSERT INTO classrooms (id, name, building, room_type, capacity) VALUES
  (1, 'Room 101', 'Block A', 'classroom', 40),
  (2, 'Room 102', 'Block A', 'classroom', 40),
  (3, 'Science Lab', 'Block B', 'laboratory', 30);

INSERT INTO time_slots (id, day_of_week, start_time, end_time, label) VALUES
  (1, 1, '08:00:00', '08:45:00', 'Mon P1'),
  (2, 1, '08:50:00', '09:35:00', 'Mon P2'),
  (3, 1, '09:40:00', '10:25:00', 'Mon P3'),
  (4, 2, '08:00:00', '08:45:00', 'Tue P1');

INSERT INTO subjects (id, code, name, name_am) VALUES
  (1, 'MATH', 'Mathematics', 'ሒሳብ'),
  (2, 'ENG',  'English',     'እንግሊዝኛ'),
  (3, 'PHY',  'Physics',     'ፊዚክስ'),
  (4, 'HIST', 'History',     'ታሪክ');

INSERT INTO grade_subjects (grade_id, subject_id, stream, is_compulsory, periods_per_week) VALUES
  (1, 1, 'all', 1, 5), (1, 2, 'all', 1, 5), (1, 3, 'all', 1, 3), (1, 4, 'all', 1, 2),
  (3, 3, 'natural_science', 1, 5), (3, 4, 'social_science', 1, 4);

-- ---------------------------------------------------------------- staff (needed by sections and teaching)
INSERT INTO staff (id, user_id, employee_no, first_name, father_name, grandfather_name, gender, job_title, department, staff_type, hire_date) VALUES
  (1, 3, 'EMP-0001', 'Teacher', 'Math',      'Sample', 'male',   'Mathematics teacher', 'Mathematics', 'teacher',   '2020-09-01'),
  (2, 4, 'EMP-0002', 'Teacher', 'English',   'Sample', 'female', 'English teacher',     'Languages',   'teacher',   '2021-09-01'),
  (3, 6, 'EMP-0003', 'Library', 'Staff',     'Sample', 'female', 'Librarian',           'Library',     'librarian', '2019-09-01');

INSERT INTO sections (id, grade_id, academic_year_id, name, stream, capacity, homeroom_staff_id, classroom_id) VALUES
  (1, 1, 1, 'A', 'none',            3,  1, 1),   -- capacity 3 so a fourth enrollment shows the full-section rule
  (2, 3, 1, 'A', 'natural_science', 40, 2, 2),
  (3, 1, 2, 'A', 'none',            40, NULL, NULL);

INSERT INTO teaching_assignments (id, staff_id, subject_id, section_id, academic_year_id) VALUES
  (1, 1, 1, 1, 1),
  (2, 2, 2, 1, 1),
  (3, 1, 1, 2, 1);

INSERT INTO timetable_entries (term_id, section_id, subject_id, staff_id, room_id, time_slot_id) VALUES
  (1, 1, 1, 1, 1, 1),
  (1, 1, 2, 2, 2, 2);

-- ---------------------------------------------------------------- people
CALL sp_next_number('admission', 2026, @n);
INSERT INTO students (id, user_id, admission_no, first_name, father_name, grandfather_name, name_am, gender, date_of_birth, admission_date, status, region, city)
VALUES (1, 7, fn_make_number('ADM', 2026, @n), 'Student01', 'Sample', 'Test', 'ተማሪ አንድ', 'female', '2011-03-14', '2026-08-20', 'active', 'Sidama', 'Hawassa');
CALL sp_next_number('admission', 2026, @n);
INSERT INTO students (id, admission_no, first_name, father_name, grandfather_name, gender, date_of_birth, admission_date, status, region, city)
VALUES (2, fn_make_number('ADM', 2026, @n), 'Student02', 'Sample', 'Test', 'male', '2011-07-02', '2026-08-20', 'active', 'Sidama', 'Hawassa');
CALL sp_next_number('admission', 2026, @n);
INSERT INTO students (id, admission_no, first_name, father_name, grandfather_name, gender, date_of_birth, admission_date, status)
VALUES (3, fn_make_number('ADM', 2026, @n), 'Student03', 'Sample', 'Test', 'female', '2011-11-21', '2026-08-21', 'active');
CALL sp_next_number('admission', 2026, @n);
INSERT INTO students (id, admission_no, first_name, father_name, grandfather_name, gender, date_of_birth, admission_date, status)
VALUES (4, fn_make_number('ADM', 2026, @n), 'Student04', 'Sample', 'Test', 'male', '2009-05-30', '2026-08-21', 'active');

INSERT INTO guardians (id, user_id, first_name, father_name, phone, verification_status, verified_by, verified_at, verification_method) VALUES
  (1, 8, 'Guardian01', 'Sample', '+251900000008', 'verified', 2, '2026-08-20 09:00:00.000', 'kebele_id');
INSERT INTO guardians (id, first_name, father_name, phone) VALUES
  (2, 'Guardian02', 'Sample', '+251900000012');

INSERT INTO student_guardians (student_id, guardian_id, relationship, is_primary, is_emergency_contact) VALUES
  (1, 1, 'mother', 1, 1),
  (2, 1, 'mother', 1, 1),
  (1, 2, 'relative', 0, 0);

-- enrollments: section 1 (capacity 3) is filled by students 1-3; the closed-year row needs @erp_override
INSERT INTO enrollments (id, student_id, section_id, academic_year_id, status, roll_no, enrolled_on, created_by) VALUES
  (1, 1, 1, 1, 'active', 1, '2026-09-11', 2),
  (2, 2, 1, 1, 'active', 2, '2026-09-11', 2),
  (3, 3, 1, 1, 'active', 3, '2026-09-11', 2),
  (4, 4, 2, 1, 'active', 1, '2026-09-11', 2);
SET @erp_override = 1;
INSERT INTO enrollments (id, student_id, section_id, academic_year_id, status, roll_no, enrolled_on, ended_on, created_by) VALUES
  (5, 1, 3, 2, 'promoted', 1, '2025-09-11', '2026-07-05', 2);
SET @erp_override = NULL;

INSERT INTO student_status_history (student_id, status, effective_date, reason, changed_by) VALUES
  (1, 'applicant', '2026-08-01', 'Application received', 2),
  (1, 'active',    '2026-08-20', 'Admitted', 2);

-- ---------------------------------------------------------------- attendance
INSERT INTO attendance_sessions (id, section_id, attendance_date, time_slot_id, recorded_by_staff_id, status, submitted_at) VALUES
  (1, 1, '2026-10-05', NULL, 1, 'submitted', '2026-10-05 07:30:00.000'),
  (2, 1, '2026-10-06', NULL, 1, 'locked',    '2026-10-06 07:30:00.000');
INSERT INTO attendance_records (session_id, enrollment_id, status_code, note, marked_by) VALUES
  (1, 1, 'present', NULL, 3), (1, 2, 'absent', 'Sick', 3), (1, 3, 'late', NULL, 3);
SET @erp_override = 1;
INSERT INTO attendance_records (session_id, enrollment_id, status_code, marked_by) VALUES
  (2, 1, 'present', 3), (2, 2, 'present', 3), (2, 3, 'excused', 3);
SET @erp_override = NULL;

-- ---------------------------------------------------------------- learning
INSERT INTO assignments (id, teaching_assignment_id, term_id, title, instructions, due_at, status, published_at, created_by) VALUES
  (1, 1, 1, 'Algebra worksheet 1', 'Solve questions 1-10.', '2026-10-20 15:00:00.000', 'published', '2026-10-06 08:00:00.000', 3);
INSERT INTO submissions (assignment_id, enrollment_id, submitted_at, status, content_text) VALUES
  (1, 1, '2026-10-08 10:00:00.000', 'submitted', 'Answers attached in the portal.');

-- ---------------------------------------------------------------- assessment and results
-- SAMPLE grading scale only. The real boundaries must be approved by the school (SRS 5.2, 13.3).
INSERT INTO grading_scales (id, name, academic_year_id, status, created_by) VALUES
  (1, 'SAMPLE scale - replace with the school-approved scale', 1, 'active', 10);
INSERT INTO grading_scale_bands (scale_id, letter, min_score, max_score, grade_points, remark, is_pass) VALUES
  (1, 'A', 90.00, 100.00, 4.00, 'Excellent', 1),
  (1, 'B', 80.00,  89.99, 3.00, 'Very good', 1),
  (1, 'C', 70.00,  79.99, 2.00, 'Good',      1),
  (1, 'D', 60.00,  69.99, 1.00, 'Satisfactory', 1),
  (1, 'E', 50.00,  59.99, 0.50, 'Pass',      1),
  (1, 'F',  0.00,  49.99, 0.00, 'Fail',      0);
INSERT INTO subject_grading_rules (subject_id, grade_id, scale_id, pass_mark) VALUES (1, 1, 1, 50.00);

INSERT INTO assessments (id, teaching_assignment_id, term_id, assessment_type_id, title, max_score, weight, assessment_date, status, created_by) VALUES
  (1, 1, 1, (SELECT id FROM assessment_types WHERE code = 'mid_exam'),   'Mathematics mid exam',   50.00, 30.00, '2026-11-10', 'open', 3),
  (2, 1, 1, (SELECT id FROM assessment_types WHERE code = 'final_exam'), 'Mathematics final exam', 100.00, 70.00, '2027-01-20', 'open', 3);

INSERT INTO marks (id, assessment_id, enrollment_id, mark_status, score, status, entered_by, submitted_at) VALUES
  (1, 1, 1, 'scored', 40.00, 'submitted', 3, '2026-11-11 10:00:00.000'),
  (2, 1, 2, 'scored', 35.00, 'submitted', 3, '2026-11-11 10:00:00.000'),
  (3, 1, 3, 'scored', 28.00, 'draft',     3, NULL),
  (4, 2, 1, 'scored', 85.00, 'submitted', 3, '2027-01-21 10:00:00.000');

INSERT INTO result_publications (id, section_id, term_id, version, status, submitted_by, submitted_at, approved_by, approved_at, published_by, published_at) VALUES
  (1, 1, 1, 1, 'published', 3, '2027-01-25 09:00:00.000', 10, '2027-01-26 09:00:00.000', 10, '2027-01-27 09:00:00.000');
INSERT INTO results (publication_id, term_id, version, enrollment_id, subject_id, total_score, letter_grade, grade_points, is_pass, status) VALUES
  (1, 1, 1, 1, 1, 82.00, 'B', 3.00, 1, 'published');
INSERT INTO report_card_snapshots (publication_id, term_id, version, enrollment_id, class_rank, class_size, average_percent, payload_json, generated_by) VALUES
  (1, 1, 1, 1, 1, 3, 82.00, '{"student":"Student01 Sample Test","term":"Semester 1","subjects":[{"code":"MATH","total":82.0,"letter":"B"}]}', 10);

INSERT INTO external_exam_results (student_id, exam_type, exam_year, candidate_no, subject_name, score, imported_by) VALUES
  (4, 'SAMPLE national exam', 2026, 'SAMPLE-0001', 'Mathematics', 71.00, 2);

-- ---------------------------------------------------------------- finance
INSERT INTO fee_structures (academic_year_id, grade_id, fee_category_id, eligibility, amount, due_date) VALUES
  (1, 1, (SELECT id FROM fee_categories WHERE code = 'tuition'),      'all', 3000.00, '2026-10-31'),
  (1, 1, (SELECT id FROM fee_categories WHERE code = 'registration'), 'all',  500.00, '2026-09-30');

INSERT INTO scholarships (id, student_id, fee_category_id, award_type, value, reason, approved_by, valid_from, status) VALUES
  (1, 2, (SELECT id FROM fee_categories WHERE code = 'tuition'), 'percent', 10.00, 'SAMPLE sibling discount', 9, '2026-09-01', 'active');

-- invoice 1: two lines, issued; invoice 2: draft with a scholarship discount
CALL sp_next_number('invoice', 2026, @n);
INSERT INTO invoices (id, invoice_no, student_id, academic_year_id, enrollment_id, issue_date, due_date, status, created_by)
VALUES (1, fn_make_number('INV', 2026, @n), 1, 1, 1, '2026-09-15', '2026-10-31', 'draft', 5);
INSERT INTO invoice_items (invoice_id, fee_category_id, description, quantity, unit_amount) VALUES
  (1, (SELECT id FROM fee_categories WHERE code = 'tuition'),      'Tuition Semester 1', 1, 3000.00),
  (1, (SELECT id FROM fee_categories WHERE code = 'registration'), 'Registration fee',   1,  500.00);
UPDATE invoices SET status = 'issued' WHERE id = 1;

CALL sp_next_number('invoice', 2026, @n);
INSERT INTO invoices (id, invoice_no, student_id, academic_year_id, enrollment_id, issue_date, due_date, status, created_by)
VALUES (2, fn_make_number('INV', 2026, @n), 2, 1, 2, '2026-09-15', '2026-10-31', 'draft', 5);
INSERT INTO invoice_items (invoice_id, fee_category_id, scholarship_id, description, quantity, unit_amount, discount_amount) VALUES
  (2, (SELECT id FROM fee_categories WHERE code = 'tuition'), 1, 'Tuition Semester 1 (10% sibling discount)', 1, 3000.00, 300.00);

-- two payments for invoice 1: cash 1000 then Telebirr 2500 (paid in full)
START TRANSACTION;
CALL sp_next_number('receipt', 2026, @n);
INSERT INTO payments (id, receipt_no, student_id, amount, method, reference, payer_name, received_at, received_by, idempotency_key)
VALUES (1, fn_make_number('RCT', 2026, @n), 1, 1000.00, 'cash', NULL, 'Guardian01 Sample', '2026-09-20 08:15:00.000', 5, 'sample-key-0001');
INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount, allocated_by) VALUES (1, 1, 1000.00, 5);
COMMIT;

START TRANSACTION;
CALL sp_next_number('receipt', 2026, @n);
INSERT INTO payments (id, receipt_no, student_id, amount, method, reference, payer_name, received_at, received_by, idempotency_key)
VALUES (2, fn_make_number('RCT', 2026, @n), 1, 2500.00, 'telebirr', 'TB-SAMPLE-0001', 'Guardian01 Sample', '2026-10-02 10:30:00.000', 5, 'sample-key-0002');
INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount, allocated_by) VALUES (2, 1, 2500.00, 5);
COMMIT;

-- ---------------------------------------------------------------- library
INSERT INTO book_categories (id, name) VALUES (1, 'Science'), (2, 'Literature');
INSERT INTO books (id, isbn, title, author, publisher, publication_year, category_id, language) VALUES
  (1, '9780000000001', 'Sample Physics for Secondary Schools', 'A. Author', 'Sample Press', 2020, 1, 'English'),
  (2, '9780000000002', 'Sample Short Stories',                  'B. Author', 'Sample Press', 2018, 2, 'English'),
  (3, NULL,            'Sample Atlas',                          'C. Author', NULL,           2015, 1, 'English');
INSERT INTO book_copies (id, book_id, barcode, location) VALUES
  (1, 1, 'LIB-0001', 'Shelf S1'), (2, 1, 'LIB-0002', 'Shelf S1'), (3, 2, 'LIB-0003', 'Shelf L1'), (4, 3, 'LIB-0004', 'Reference');
INSERT INTO library_loans (id, copy_id, student_id, checkout_at, due_at, issued_by) VALUES
  (1, 2, 2, '2026-09-28 10:00:00.000', '2026-10-05 10:00:00.000', 6);   -- overdue
INSERT INTO library_loans (id, copy_id, student_id, checkout_at, due_at, issued_by) VALUES
  (2, 1, 1, '2026-10-08 10:00:00.000', '2026-10-22 10:00:00.000', 6);   -- on time

-- ---------------------------------------------------------------- communication and audit
INSERT INTO announcements (id, title, body, status, created_by, published_by, published_at) VALUES
  (1, 'Welcome to 2019 E.C.', 'Classes start on Meskerem 1.', 'published', 9, 9, '2026-09-01 08:00:00.000');
INSERT INTO announcement_targets (announcement_id, target_type, target_id) VALUES (1, 'all', NULL);
INSERT INTO notifications (user_id, type, title, body, payload_json) VALUES
  (8, 'absence_alert', 'Absence recorded', 'Student02 was absent on 2026-10-05.', '{"entity":"attendance_records","session_id":1}');
INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, request_id, ip_address) VALUES
  (2, 'registrar', 'student.create', 'students', '1', 'success', '{"admission_no":{"old":null,"new":"ADM-2026-000001"}}', '00000000-0000-4000-8000-000000000001', '127.0.0.1');
