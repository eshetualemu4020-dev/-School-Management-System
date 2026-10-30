-- =====================================================================
-- PACKAGE 3 MIGRATION: APPROVALS QUEUE SYSTEM
-- =====================================================================

CREATE TABLE IF NOT EXISTS approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  type ENUM(
    'attendance_edit_after_lock',
    'result_unlock',
    'student_transfer',
    'student_withdrawal',
    'fee_waiver',
    'payment_void',
    'admission_application'
  ) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  old_value_json JSON NULL,
  new_value_json JSON NULL,
  reason TEXT NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  decided_by BIGINT UNSIGNED NULL,
  decision_note TEXT NULL,
  decided_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  deleted_by BIGINT UNSIGNED NULL,
  INDEX idx_approvals_status (status),
  INDEX idx_approvals_type (type),
  INDEX idx_approvals_requested_by (requested_by),
  INDEX idx_approvals_created_at (created_at),
  CONSTRAINT fk_approvals_requested_by FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_approvals_decided_by FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
