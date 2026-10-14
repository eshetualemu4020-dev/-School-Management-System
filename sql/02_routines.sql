-- School Management ERP - routines: functions, procedures, triggers and views
-- Run after 01_schema.sql.  Works on MySQL 8.0 and MariaDB 10.6+.
--
-- Error convention: every rule violation raises SQLSTATE '45000' with a message that starts with a
-- stable code, "ERP-Exxx: ...".  The API maps the code to an HTTP status (see README.md and the Database design tab of the documentation).
--
-- Session variables the application sets for rules that need context (SET @name = value; per connection/request):
--   @erp_user_id        users.id of the person acting (required for mark corrections)
--   @erp_change_reason  reason text (required for mark corrections after submission)
--   @erp_approved_by    users.id of the second approver (optional on mark corrections)
--   @erp_override       1 = an authorised override (closed year, full section, locked attendance); API must audit it

SET NAMES utf8mb4;
DELIMITER $$

-- ---------------------------------------------------------------------------------------------------------
-- NUMBERING (FR-FIN-10): run inside the same transaction that inserts the row that uses the number
-- ---------------------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_make_number$$
CREATE FUNCTION fn_make_number(p_prefix VARCHAR(10), p_year SMALLINT UNSIGNED, p_value BIGINT UNSIGNED)
RETURNS VARCHAR(30) DETERMINISTIC
BEGIN
  RETURN CONCAT(p_prefix, '-', p_year, '-', LPAD(p_value, 6, '0'));
END$$

DROP PROCEDURE IF EXISTS sp_next_number$$
CREATE PROCEDURE sp_next_number(IN p_name VARCHAR(40), IN p_year SMALLINT UNSIGNED, OUT p_value BIGINT UNSIGNED)
BEGIN
  -- ON DUPLICATE KEY UPDATE takes an exclusive lock straight away; INSERT IGNORE would take a shared lock
  -- first and deadlock when many sessions start a new year at the same moment.
  INSERT INTO number_sequences (name, year_key, next_value) VALUES (p_name, p_year, 1)
    ON DUPLICATE KEY UPDATE next_value = next_value;
  SELECT next_value INTO p_value FROM number_sequences WHERE name = p_name AND year_key = p_year FOR UPDATE;
  UPDATE number_sequences SET next_value = next_value + 1 WHERE name = p_name AND year_key = p_year;
END$$

-- ---------------------------------------------------------------------------------------------------------
-- INVOICE STATUS: derived from charges and allocations of posted payments
-- ---------------------------------------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_refresh_invoice_status$$
CREATE PROCEDURE sp_refresh_invoice_status(IN p_invoice_id BIGINT UNSIGNED)
main: BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_total DECIMAL(14,2);
  DECLARE v_paid DECIMAL(14,2);
  SELECT status INTO v_status FROM invoices WHERE id = p_invoice_id;
  IF v_status IS NULL OR v_status IN ('draft', 'void') THEN LEAVE main; END IF;
  SELECT COALESCE(SUM(line_total), 0) INTO v_total FROM invoice_items WHERE invoice_id = p_invoice_id;
  SELECT COALESCE(SUM(pa.allocated_amount), 0) INTO v_paid
    FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id AND p.status = 'posted'
   WHERE pa.invoice_id = p_invoice_id;
  UPDATE invoices
     SET status = CASE WHEN v_paid <= 0 THEN 'issued'
                       WHEN v_paid >= v_total THEN 'paid'
                       ELSE 'partially_paid' END
   WHERE id = p_invoice_id;
END$$

DROP PROCEDURE IF EXISTS sp_assert_allocation_ok$$
CREATE PROCEDURE sp_assert_allocation_ok(IN p_alloc_id BIGINT UNSIGNED, IN p_payment_id BIGINT UNSIGNED,
                                         IN p_invoice_id BIGINT UNSIGNED, IN p_amount DECIMAL(12,2))
BEGIN
  DECLARE v_pay_amount DECIMAL(12,2);
  DECLARE v_pay_student BIGINT UNSIGNED;
  DECLARE v_pay_status VARCHAR(10);
  DECLARE v_inv_student BIGINT UNSIGNED;
  DECLARE v_inv_status VARCHAR(20);
  DECLARE v_inv_total DECIMAL(14,2);
  DECLARE v_pay_used DECIMAL(14,2);
  DECLARE v_inv_used DECIMAL(14,2);
  SELECT amount, student_id, status INTO v_pay_amount, v_pay_student, v_pay_status
    FROM payments WHERE id = p_payment_id FOR UPDATE;
  SELECT student_id, status INTO v_inv_student, v_inv_status
    FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_pay_student <> v_inv_student THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E503: payment and invoice belong to different students';
  END IF;
  IF v_pay_status <> 'posted' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E509: only a posted payment can be allocated';
  END IF;
  IF v_inv_status NOT IN ('issued', 'partially_paid', 'paid') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E506: invoice is not open for payment (draft or void)';
  END IF;
  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_pay_used
    FROM payment_allocations WHERE payment_id = p_payment_id AND id <> COALESCE(p_alloc_id, 0);
  IF v_pay_used + p_amount > v_pay_amount THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E501: allocations exceed the payment amount';
  END IF;
  SELECT COALESCE(SUM(line_total), 0) INTO v_inv_total FROM invoice_items WHERE invoice_id = p_invoice_id;
  SELECT COALESCE(SUM(pa.allocated_amount), 0) INTO v_inv_used
    FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id AND p.status = 'posted'
   WHERE pa.invoice_id = p_invoice_id AND pa.id <> COALESCE(p_alloc_id, 0);
  IF v_inv_used + p_amount > v_inv_total THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E502: allocations exceed the invoice total';
  END IF;
END$$

-- ---------------------------------------------------------------------------------------------------------
-- ACADEMIC YEARS AND TERMS (FR-ACAD-01): no overlapping periods
-- ---------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_academic_years_bi$$
CREATE TRIGGER trg_academic_years_bi BEFORE INSERT ON academic_years FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM academic_years WHERE NEW.start_date <= end_date AND NEW.end_date >= start_date) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E101: academic year overlaps an existing academic year';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_academic_years_bu$$
CREATE TRIGGER trg_academic_years_bu BEFORE UPDATE ON academic_years FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM academic_years WHERE id <> NEW.id AND NEW.start_date <= end_date AND NEW.end_date >= start_date) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E101: academic year overlaps an existing academic year';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_terms_bi$$
CREATE TRIGGER trg_terms_bi BEFORE INSERT ON terms FOR EACH ROW
BEGIN
  DECLARE v_start DATE;
  DECLARE v_end DATE;
  SELECT start_date, end_date INTO v_start, v_end FROM academic_years WHERE id = NEW.academic_year_id;
  IF NEW.start_date < v_start OR NEW.end_date > v_end THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E102: term must fall inside its academic year';
  END IF;
  IF EXISTS (SELECT 1 FROM terms WHERE academic_year_id = NEW.academic_year_id
                AND NEW.start_date <= end_date AND NEW.end_date >= start_date) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E103: term overlaps another term of the same year';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_terms_bu$$
CREATE TRIGGER trg_terms_bu BEFORE UPDATE ON terms FOR EACH ROW
BEGIN
  DECLARE v_start DATE;
  DECLARE v_end DATE;
  SELECT start_date, end_date INTO v_start, v_end FROM academic_years WHERE id = NEW.academic_year_id;
  IF NEW.start_date < v_start OR NEW.end_date > v_end THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E102: term must fall inside its academic year';
  END IF;
  IF EXISTS (SELECT 1 FROM terms WHERE academic_year_id = NEW.academic_year_id AND id <> NEW.id
                AND NEW.start_date <= end_date AND NEW.end_date >= start_date) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E103: term overlaps another term of the same year';
  END IF;
END$$

-- ---------------------------------------------------------------------------------------------------------
-- TIMETABLE (FR-ACAD-04): the teacher must be assigned to the subject and section for that year
-- ---------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_timetable_entries_bi$$
CREATE TRIGGER trg_timetable_entries_bi BEFORE INSERT ON timetable_entries FOR EACH ROW
BEGIN
  DECLARE v_year BIGINT UNSIGNED;
  SELECT academic_year_id INTO v_year FROM terms WHERE id = NEW.term_id;
  IF NOT EXISTS (SELECT 1 FROM teaching_assignments
                  WHERE staff_id = NEW.staff_id AND subject_id = NEW.subject_id AND section_id = NEW.section_id
                    AND academic_year_id = v_year AND is_active = 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E801: teacher has no active teaching assignment for this subject and section';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_timetable_entries_bu$$
CREATE TRIGGER trg_timetable_entries_bu BEFORE UPDATE ON timetable_entries FOR EACH ROW
BEGIN
  DECLARE v_year BIGINT UNSIGNED;
  SELECT academic_year_id INTO v_year FROM terms WHERE id = NEW.term_id;
  IF NOT EXISTS (SELECT 1 FROM teaching_assignments
                  WHERE staff_id = NEW.staff_id AND subject_id = NEW.subject_id AND section_id = NEW.section_id
                    AND academic_year_id = v_year AND is_active = 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E801: teacher has no active teaching assignment for this subject and section';
  END IF;
END$$

-- ---------------------------------------------------------------------------------------------------------
-- ENROLLMENT (FR-STU-07): closed year and full section are refused unless @erp_override = 1
-- ---------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_enrollments_bi$$
CREATE TRIGGER trg_enrollments_bi BEFORE INSERT ON enrollments FOR EACH ROW
BEGIN
  DECLARE v_year_status VARCHAR(10);
  DECLARE v_cap INT;
  DECLARE v_cnt INT;
  SELECT status INTO v_year_status FROM academic_years WHERE id = NEW.academic_year_id;
  IF v_year_status = 'closed' AND COALESCE(@erp_override, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E201: academic year is closed for enrollment';
  END IF;
  IF NEW.status = 'active' THEN
    SELECT capacity INTO v_cap FROM sections WHERE id = NEW.section_id FOR UPDATE;
    SELECT COUNT(*) INTO v_cnt FROM enrollments WHERE section_id = NEW.section_id AND status = 'active';
    IF v_cnt >= v_cap AND COALESCE(@erp_override, 0) <> 1 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E202: section is full';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_enrollments_bu$$
CREATE TRIGGER trg_enrollments_bu BEFORE UPDATE ON enrollments FOR EACH ROW
BEGIN
  DECLARE v_cap INT;
  DECLARE v_cnt INT;
  IF NEW.status = 'active' AND (OLD.status <> 'active' OR OLD.section_id <> NEW.section_id) THEN
    SELECT capacity INTO v_cap FROM sections WHERE id = NEW.section_id FOR UPDATE;
    SELECT COUNT(*) INTO v_cnt FROM enrollments WHERE section_id = NEW.section_id AND status = 'active' AND id <> NEW.id;
    IF v_cnt >= v_cap AND COALESCE(@erp_override, 0) <> 1 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E202: section is full';
    END IF;
  END IF;
END$$

-- ---------------------------------------------------------------------------------------------------------
-- ATTENDANCE (FR-ATT-03, FR-ATT-04)
-- ---------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_attendance_records_bi$$
CREATE TRIGGER trg_attendance_records_bi BEFORE INSERT ON attendance_records FOR EACH ROW
BEGIN
  DECLARE v_sec BIGINT UNSIGNED;
  DECLARE v_sstatus VARCHAR(10);
  DECLARE v_en_sec BIGINT UNSIGNED;
  SELECT section_id, status INTO v_sec, v_sstatus FROM attendance_sessions WHERE id = NEW.session_id;
  SELECT section_id INTO v_en_sec FROM enrollments WHERE id = NEW.enrollment_id;
  IF v_sec <> v_en_sec THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E301: student is not enrolled in the section of this attendance session';
  END IF;
  IF v_sstatus = 'locked' AND COALESCE(@erp_override, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E302: attendance session is locked; a correction needs permission';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_attendance_records_bu$$
CREATE TRIGGER trg_attendance_records_bu BEFORE UPDATE ON attendance_records FOR EACH ROW
BEGIN
  DECLARE v_sec BIGINT UNSIGNED;
  DECLARE v_sstatus VARCHAR(10);
  DECLARE v_en_sec BIGINT UNSIGNED;
  SELECT section_id, status INTO v_sec, v_sstatus FROM attendance_sessions WHERE id = NEW.session_id;
  SELECT section_id INTO v_en_sec FROM enrollments WHERE id = NEW.enrollment_id;
  IF v_sec <> v_en_sec THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E301: student is not enrolled in the section of this attendance session';
  END IF;
  IF v_sstatus = 'locked' AND COALESCE(@erp_override, 0) <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E302: attendance session is locked; a correction needs permission';
  END IF;
END$$

-- ---------------------------------------------------------------------------------------------------------
-- ASSESSMENTS AND MARKS (FR-EXAM-02, FR-EXAM-03, FR-EXAM-07, FR-EXAM-10)
-- ---------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_assessments_bi$$
CREATE TRIGGER trg_assessments_bi BEFORE INSERT ON assessments FOR EACH ROW
BEGIN
  DECLARE v_ta_year BIGINT UNSIGNED;
  DECLARE v_term_year BIGINT UNSIGNED;
  SELECT academic_year_id INTO v_ta_year FROM teaching_assignments WHERE id = NEW.teaching_assignment_id;
  SELECT academic_year_id INTO v_term_year FROM terms WHERE id = NEW.term_id;
  IF v_ta_year <> v_term_year THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E404: term belongs to a different academic year than the teaching assignment';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_assessments_bu$$
CREATE TRIGGER trg_assessments_bu BEFORE UPDATE ON assessments FOR EACH ROW
BEGIN
  DECLARE v_ta_year BIGINT UNSIGNED;
  DECLARE v_term_year BIGINT UNSIGNED;
  SELECT academic_year_id INTO v_ta_year FROM teaching_assignments WHERE id = NEW.teaching_assignment_id;
  SELECT academic_year_id INTO v_term_year FROM terms WHERE id = NEW.term_id;
  IF v_ta_year <> v_term_year THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E404: term belongs to a different academic year than the teaching assignment';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_marks_bi$$
CREATE TRIGGER trg_marks_bi BEFORE INSERT ON marks FOR EACH ROW
BEGIN
  DECLARE v_max DECIMAL(6,2);
  DECLARE v_ta_section BIGINT UNSIGNED;
  DECLARE v_ta_year BIGINT UNSIGNED;
  DECLARE v_en_section BIGINT UNSIGNED;
  DECLARE v_en_year BIGINT UNSIGNED;
  SELECT a.max_score, ta.section_id, ta.academic_year_id INTO v_max, v_ta_section, v_ta_year
    FROM assessments a JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
   WHERE a.id = NEW.assessment_id;
  SELECT section_id, academic_year_id INTO v_en_section, v_en_year FROM enrollments WHERE id = NEW.enrollment_id;
  IF NEW.score IS NOT NULL AND NEW.score > v_max THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E401: score is above the assessment maximum';
  END IF;
  IF v_en_section <> v_ta_section OR v_en_year <> v_ta_year THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E402: student is not enrolled in the section this assessment belongs to';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_marks_bu$$
CREATE TRIGGER trg_marks_bu BEFORE UPDATE ON marks FOR EACH ROW
BEGIN
  DECLARE v_max DECIMAL(6,2);
  DECLARE v_ta_section BIGINT UNSIGNED;
  DECLARE v_ta_year BIGINT UNSIGNED;
  DECLARE v_en_section BIGINT UNSIGNED;
  DECLARE v_en_year BIGINT UNSIGNED;
  SELECT a.max_score, ta.section_id, ta.academic_year_id INTO v_max, v_ta_section, v_ta_year
    FROM assessments a JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
   WHERE a.id = NEW.assessment_id;
  SELECT section_id, academic_year_id INTO v_en_section, v_en_year FROM enrollments WHERE id = NEW.enrollment_id;
  IF NEW.score IS NOT NULL AND NEW.score > v_max THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E401: score is above the assessment maximum';
  END IF;
  IF v_en_section <> v_ta_section OR v_en_year <> v_ta_year THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E402: student is not enrolled in the section this assessment belongs to';
  END IF;
  IF OLD.status IN ('submitted', 'locked')
     AND (NOT (OLD.score <=> NEW.score) OR OLD.mark_status <> NEW.mark_status) THEN
    IF @erp_change_reason IS NULL OR CHAR_LENGTH(TRIM(@erp_change_reason)) = 0 OR @erp_user_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E403: changing a submitted mark needs @erp_change_reason and @erp_user_id';
    END IF;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_marks_au$$
CREATE TRIGGER trg_marks_au AFTER UPDATE ON marks FOR EACH ROW
BEGIN
  IF OLD.status IN ('submitted', 'locked')
     AND (NOT (OLD.score <=> NEW.score) OR OLD.mark_status <> NEW.mark_status) THEN
    INSERT INTO marks_history (mark_id, old_score, new_score, old_mark_status, new_mark_status,
                               reason, changed_by, approved_by)
    VALUES (NEW.id, OLD.score, NEW.score, OLD.mark_status, NEW.mark_status,
            @erp_change_reason, @erp_user_id, @erp_approved_by);
  END IF;
END$$

-- ---------------------------------------------------------------------------------------------------------
-- GRADING BANDS: ranges inside one scale must not overlap
-- ---------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_grading_scale_bands_bi$$
CREATE TRIGGER trg_grading_scale_bands_bi BEFORE INSERT ON grading_scale_bands FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM grading_scale_bands
              WHERE scale_id = NEW.scale_id AND NEW.min_score <= max_score AND NEW.max_score >= min_score) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E901: grade band overlaps another band of the same scale';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_grading_scale_bands_bu$$
CREATE TRIGGER trg_grading_scale_bands_bu BEFORE UPDATE ON grading_scale_bands FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM grading_scale_bands
              WHERE scale_id = NEW.scale_id AND id <> NEW.id AND NEW.min_score <= max_score AND NEW.max_score >= min_score) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E901: grade band overlaps another band of the same scale';
  END IF;
END$$

-- ---------------------------------------------------------------------------------------------------------
-- FINANCE (section 5.3, FR-FIN-04, FR-FIN-05, FR-FIN-07)
-- ---------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_invoice_items_bi$$
CREATE TRIGGER trg_invoice_items_bi BEFORE INSERT ON invoice_items FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20);
  SELECT status INTO v_status FROM invoices WHERE id = NEW.invoice_id;
  IF v_status <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E507: invoice lines are locked once the invoice is issued';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_invoice_items_bu$$
CREATE TRIGGER trg_invoice_items_bu BEFORE UPDATE ON invoice_items FOR EACH ROW
BEGIN
  DECLARE v_old VARCHAR(20);
  DECLARE v_new VARCHAR(20);
  SELECT status INTO v_old FROM invoices WHERE id = OLD.invoice_id;
  SELECT status INTO v_new FROM invoices WHERE id = NEW.invoice_id;
  IF v_old <> 'draft' OR v_new <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E507: invoice lines are locked once the invoice is issued';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_invoice_items_bd$$
CREATE TRIGGER trg_invoice_items_bd BEFORE DELETE ON invoice_items FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(20);
  SELECT status INTO v_status FROM invoices WHERE id = OLD.invoice_id;
  IF v_status <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E507: invoice lines are locked once the invoice is issued';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_invoices_bu$$
CREATE TRIGGER trg_invoices_bu BEFORE UPDATE ON invoices FOR EACH ROW
BEGIN
  IF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'void')
     AND (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = NEW.id) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E511: an invoice needs at least one line before it can be issued';
  END IF;
  IF NEW.status = 'void' AND OLD.status <> 'void'
     AND EXISTS (SELECT 1 FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id AND p.status = 'posted'
                  WHERE pa.invoice_id = NEW.id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E513: invoice has allocated payments; reverse them before voiding';
  END IF;
  IF OLD.status <> 'draft' AND (NEW.student_id <> OLD.student_id OR NEW.invoice_no <> OLD.invoice_no
                                OR NEW.currency <> OLD.currency) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E514: student, number and currency of an issued invoice cannot change';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_invoices_bd$$
CREATE TRIGGER trg_invoices_bd BEFORE DELETE ON invoices FOR EACH ROW
BEGIN
  IF OLD.status <> 'draft' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E512: an issued invoice cannot be deleted; void it instead';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_payments_bu$$
CREATE TRIGGER trg_payments_bu BEFORE UPDATE ON payments FOR EACH ROW
BEGIN
  IF NEW.amount <> OLD.amount OR NEW.student_id <> OLD.student_id OR NEW.receipt_no <> OLD.receipt_no
     OR NEW.method <> OLD.method OR NOT (NEW.reference <=> OLD.reference)
     OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.received_at <> OLD.received_at
     OR NEW.currency <> OLD.currency OR NEW.received_by <> OLD.received_by THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E504: a posted payment is immutable; use a reversal';
  END IF;
  IF OLD.status <> 'posted' AND NEW.status <> OLD.status THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E504: a voided or reversed payment cannot change status again';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_payments_bd$$
CREATE TRIGGER trg_payments_bd BEFORE DELETE ON payments FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E505: payments are never deleted; use a reversal';
END$$

DROP TRIGGER IF EXISTS trg_payments_au$$
CREATE TRIGGER trg_payments_au AFTER UPDATE ON payments FOR EACH ROW
BEGIN
  DECLARE v_done INT DEFAULT 0;
  DECLARE v_inv BIGINT UNSIGNED;
  DECLARE cur CURSOR FOR SELECT invoice_id FROM payment_allocations WHERE payment_id = NEW.id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;
  IF NEW.status <> OLD.status THEN
    OPEN cur;
    refresh_loop: LOOP
      FETCH cur INTO v_inv;
      IF v_done = 1 THEN LEAVE refresh_loop; END IF;
      CALL sp_refresh_invoice_status(v_inv);
    END LOOP;
    CLOSE cur;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_payment_allocations_bi$$
CREATE TRIGGER trg_payment_allocations_bi BEFORE INSERT ON payment_allocations FOR EACH ROW
BEGIN
  CALL sp_assert_allocation_ok(NULL, NEW.payment_id, NEW.invoice_id, NEW.allocated_amount);
END$$

DROP TRIGGER IF EXISTS trg_payment_allocations_bu$$
CREATE TRIGGER trg_payment_allocations_bu BEFORE UPDATE ON payment_allocations FOR EACH ROW
BEGIN
  CALL sp_assert_allocation_ok(NEW.id, NEW.payment_id, NEW.invoice_id, NEW.allocated_amount);
END$$

DROP TRIGGER IF EXISTS trg_payment_allocations_bd$$
CREATE TRIGGER trg_payment_allocations_bd BEFORE DELETE ON payment_allocations FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E505: allocations are never deleted; reverse the payment instead';
END$$

DROP TRIGGER IF EXISTS trg_payment_allocations_ai$$
CREATE TRIGGER trg_payment_allocations_ai AFTER INSERT ON payment_allocations FOR EACH ROW
BEGIN
  CALL sp_refresh_invoice_status(NEW.invoice_id);
END$$

DROP TRIGGER IF EXISTS trg_payment_allocations_au$$
CREATE TRIGGER trg_payment_allocations_au AFTER UPDATE ON payment_allocations FOR EACH ROW
BEGIN
  CALL sp_refresh_invoice_status(NEW.invoice_id);
  IF OLD.invoice_id <> NEW.invoice_id THEN CALL sp_refresh_invoice_status(OLD.invoice_id); END IF;
END$$

DROP TRIGGER IF EXISTS trg_payment_reversals_bi$$
CREATE TRIGGER trg_payment_reversals_bi BEFORE INSERT ON payment_reversals FOR EACH ROW
BEGIN
  DECLARE v_amount DECIMAL(12,2);
  DECLARE v_used DECIMAL(14,2);
  SELECT amount INTO v_amount FROM payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO v_used FROM payment_reversals
   WHERE payment_id = NEW.payment_id AND status <> 'rejected';
  IF v_used + NEW.amount > v_amount THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E510: reversals exceed the payment amount';
  END IF;
END$$

-- ---------------------------------------------------------------------------------------------------------
-- LIBRARY (FR-LIB-03): copy status follows the loan
-- ---------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_library_loans_bi$$
CREATE TRIGGER trg_library_loans_bi BEFORE INSERT ON library_loans FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(12);
  SELECT status INTO v_status FROM book_copies WHERE id = NEW.copy_id FOR UPDATE;
  IF NEW.returned_at IS NULL AND v_status <> 'available' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E601: this copy is not available for loan';
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_library_loans_ai$$
CREATE TRIGGER trg_library_loans_ai AFTER INSERT ON library_loans FOR EACH ROW
BEGIN
  IF NEW.returned_at IS NULL THEN
    UPDATE book_copies SET status = 'on_loan' WHERE id = NEW.copy_id;
  END IF;
END$$

DROP TRIGGER IF EXISTS trg_library_loans_au$$
CREATE TRIGGER trg_library_loans_au AFTER UPDATE ON library_loans FOR EACH ROW
BEGIN
  IF OLD.returned_at IS NULL AND NEW.returned_at IS NOT NULL THEN
    UPDATE book_copies SET status = 'available' WHERE id = NEW.copy_id AND status = 'on_loan';
  END IF;
END$$

-- ---------------------------------------------------------------------------------------------------------
-- APPEND-ONLY TABLES (sections 9.3 and 9.4): enforced for every account, including administrators
-- ---------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_logs_bu$$
CREATE TRIGGER trg_audit_logs_bu BEFORE UPDATE ON audit_logs FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E701: audit_logs is append-only';
END$$

DROP TRIGGER IF EXISTS trg_audit_logs_bd$$
CREATE TRIGGER trg_audit_logs_bd BEFORE DELETE ON audit_logs FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E701: audit_logs is append-only';
END$$

DROP TRIGGER IF EXISTS trg_marks_history_bu$$
CREATE TRIGGER trg_marks_history_bu BEFORE UPDATE ON marks_history FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E702: marks_history is append-only';
END$$

DROP TRIGGER IF EXISTS trg_marks_history_bd$$
CREATE TRIGGER trg_marks_history_bd BEFORE DELETE ON marks_history FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ERP-E702: marks_history is append-only';
END$$

DELIMITER ;

-- =========================================================================================================
-- VIEWS (read-only helpers for dashboards and reports; every report must still apply the caller's scope)
-- =========================================================================================================
CREATE OR REPLACE VIEW v_current_enrollments AS
SELECT e.id AS enrollment_id, e.student_id, s.admission_no,
       s.first_name, s.father_name, s.grandfather_name, s.name_am,
       e.section_id, sec.name AS section_name, sec.stream,
       g.id AS grade_id, g.grade_level, g.display_name AS grade_name,
       e.academic_year_id, ay.name AS academic_year, e.enrolled_on
  FROM enrollments e
  JOIN students s ON s.id = e.student_id
  JOIN sections sec ON sec.id = e.section_id
  JOIN grades g ON g.id = sec.grade_id
  JOIN academic_years ay ON ay.id = e.academic_year_id
 WHERE e.status = 'active' AND ay.is_current = 1;

CREATE OR REPLACE VIEW v_section_capacity AS
SELECT sec.id AS section_id, sec.academic_year_id, sec.grade_id, sec.name AS section_name, sec.capacity,
       COUNT(e.id) AS active_students,
       CAST(sec.capacity AS SIGNED) - COUNT(e.id) AS free_seats
  FROM sections sec
  LEFT JOIN enrollments e ON e.section_id = sec.id AND e.status = 'active'
 GROUP BY sec.id, sec.academic_year_id, sec.grade_id, sec.name, sec.capacity;

CREATE OR REPLACE VIEW v_invoice_balances AS
SELECT i.id AS invoice_id, i.invoice_no, i.student_id, i.academic_year_id, i.status, i.currency, i.due_date,
       COALESCE(it.charges, 0) AS charges,
       COALESCE(al.paid, 0) AS allocated,
       COALESCE(it.charges, 0) - COALESCE(al.paid, 0) AS balance,
       (i.status IN ('issued', 'partially_paid') AND i.due_date < CURRENT_DATE
        AND COALESCE(it.charges, 0) > COALESCE(al.paid, 0)) AS is_overdue
  FROM invoices i
  LEFT JOIN (SELECT invoice_id, SUM(line_total) AS charges FROM invoice_items GROUP BY invoice_id) it
         ON it.invoice_id = i.id
  LEFT JOIN (SELECT pa.invoice_id, SUM(pa.allocated_amount) AS paid
               FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id AND p.status = 'posted'
              GROUP BY pa.invoice_id) al ON al.invoice_id = i.id;

CREATE OR REPLACE VIEW v_payment_unallocated AS
SELECT p.id AS payment_id, p.receipt_no, p.student_id, p.method, p.status, p.currency, p.amount,
       COALESCE(SUM(pa.allocated_amount), 0) AS allocated,
       p.amount - COALESCE(SUM(pa.allocated_amount), 0) AS unallocated
  FROM payments p
  LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
 GROUP BY p.id, p.receipt_no, p.student_id, p.method, p.status, p.currency, p.amount;

CREATE OR REPLACE VIEW v_attendance_summary AS
SELECT ar.enrollment_id, e.student_id, e.section_id,
       COUNT(*) AS sessions_recorded,
       SUM(ar.status_code = 'present') AS present_count,
       SUM(ar.status_code = 'late') AS late_count,
       SUM(ar.status_code = 'absent') AS absent_count,
       SUM(ar.status_code = 'excused') AS excused_count,
       ROUND(100 * SUM(st.counts_as_present) / COUNT(*), 2) AS attendance_percent
  FROM attendance_records ar
  JOIN enrollments e ON e.id = ar.enrollment_id
  JOIN attendance_statuses st ON st.code = ar.status_code
 GROUP BY ar.enrollment_id, e.student_id, e.section_id;

CREATE OR REPLACE VIEW v_mark_totals AS
SELECT m.enrollment_id, a.teaching_assignment_id, ta.subject_id, a.term_id,
       COUNT(*) AS marks_counted,
       SUM(a.weight) AS weight_covered,
       ROUND(SUM(m.score / a.max_score * a.weight), 2) AS weighted_points
  FROM marks m
  JOIN assessments a ON a.id = m.assessment_id
  JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
 WHERE m.mark_status = 'scored' AND m.score IS NOT NULL
 GROUP BY m.enrollment_id, a.teaching_assignment_id, ta.subject_id, a.term_id;

CREATE OR REPLACE VIEW v_library_overdue AS
SELECT l.id AS loan_id, l.copy_id, bc.barcode, b.title, l.student_id, l.staff_id,
       l.checkout_at, l.due_at,
       DATEDIFF(UTC_DATE(), DATE(l.due_at)) AS days_overdue
  FROM library_loans l
  JOIN book_copies bc ON bc.id = l.copy_id
  JOIN books b ON b.id = bc.book_id
 WHERE l.returned_at IS NULL AND l.due_at < UTC_TIMESTAMP(3);
