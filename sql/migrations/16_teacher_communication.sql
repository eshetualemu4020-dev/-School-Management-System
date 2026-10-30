-- =====================================================================
-- MIGRATION 16: TEACHER COMMUNICATION & PARENT MEETINGS
-- =====================================================================

CREATE TABLE IF NOT EXISTS parent_communications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  teacher_staff_id BIGINT UNSIGNED NOT NULL,
  guardian_id BIGINT UNSIGNED NULL,
  student_id BIGINT UNSIGNED NULL,
  recipient_role ENUM('guardian', 'administration', 'colleague') NOT NULL DEFAULT 'guardian',
  recipient_user_id BIGINT UNSIGNED NULL,
  subject VARCHAR(190) NOT NULL,
  message TEXT NOT NULL,
  sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_comm_teacher (teacher_staff_id),
  INDEX idx_comm_guardian (guardian_id),
  INDEX idx_comm_student (student_id),
  CONSTRAINT fk_comm_teacher FOREIGN KEY (teacher_staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CONSTRAINT fk_comm_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE SET NULL,
  CONSTRAINT fk_comm_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parent_meeting_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  teacher_staff_id BIGINT UNSIGNED NOT NULL,
  guardian_id BIGINT UNSIGNED NOT NULL,
  student_id BIGINT UNSIGNED NOT NULL,
  requested_date DATE NOT NULL,
  requested_time VARCHAR(20) NOT NULL,
  agenda TEXT NOT NULL,
  status ENUM('pending', 'confirmed', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
  meeting_notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_meet_teacher (teacher_staff_id),
  INDEX idx_meet_guardian (guardian_id),
  INDEX idx_meet_student (student_id),
  INDEX idx_meet_status (status),
  CONSTRAINT fk_meet_teacher FOREIGN KEY (teacher_staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CONSTRAINT fk_meet_guardian FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE CASCADE,
  CONSTRAINT fk_meet_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
