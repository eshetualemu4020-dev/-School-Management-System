-- =====================================================================
-- MIGRATION 15: TEACHER PORTAL APPROVAL TYPES
-- =====================================================================

ALTER TABLE approvals 
MODIFY COLUMN type ENUM(
  'attendance_edit_after_lock',
  'result_unlock',
  'student_transfer',
  'student_withdrawal',
  'fee_waiver',
  'payment_void',
  'admission_application',
  'leave_request',
  'timetable_change'
) NOT NULL;
