CREATE TABLE IF NOT EXISTS academic_progression_policies (
  academic_year_id BIGINT UNSIGNED NOT NULL,
  grade_id BIGINT UNSIGNED NOT NULL,
  minimum_average DECIMAL(5,2) NOT NULL DEFAULT 50.00,
  maximum_failed_subjects SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  minimum_attendance_percent DECIMAL(5,2) NOT NULL DEFAULT 75.00,
  probation_average DECIMAL(5,2) NOT NULL DEFAULT 60.00,
  minimum_courses_per_term TINYINT UNSIGNED NOT NULL DEFAULT 1,
  maximum_courses_per_term TINYINT UNSIGNED NOT NULL DEFAULT 12,
  updated_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (academic_year_id, grade_id),
  CONSTRAINT ck_progression_policy_average CHECK (minimum_average BETWEEN 0 AND 100),
  CONSTRAINT ck_progression_policy_attendance CHECK (minimum_attendance_percent BETWEEN 0 AND 100),
  CONSTRAINT ck_progression_policy_probation CHECK (probation_average BETWEEN 0 AND 100),
  CONSTRAINT ck_progression_policy_courses CHECK (minimum_courses_per_term <= maximum_courses_per_term),
  CONSTRAINT fk_progression_policy_year FOREIGN KEY (academic_year_id) REFERENCES academic_years(id),
  CONSTRAINT fk_progression_policy_grade FOREIGN KEY (grade_id) REFERENCES grades(id),
  CONSTRAINT fk_progression_policy_user FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academic_subject_prerequisites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  grade_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  prerequisite_subject_id BIGINT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_academic_subject_prerequisite (grade_id, subject_id, prerequisite_subject_id),
  CONSTRAINT ck_academic_subject_prerequisite_distinct CHECK (subject_id <> prerequisite_subject_id),
  CONSTRAINT fk_subject_prerequisite_grade FOREIGN KEY (grade_id) REFERENCES grades(id),
  CONSTRAINT fk_subject_prerequisite_subject FOREIGN KEY (subject_id) REFERENCES subjects(id),
  CONSTRAINT fk_subject_prerequisite_required FOREIGN KEY (prerequisite_subject_id) REFERENCES subjects(id),
  CONSTRAINT fk_subject_prerequisite_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academic_course_enrollments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  teaching_assignment_id BIGINT UNSIGNED NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  status ENUM('approved','dropped') NOT NULL DEFAULT 'approved',
  enrolled_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  dropped_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_academic_course_enrollment (enrollment_id, teaching_assignment_id, term_id),
  KEY ix_academic_course_assignment (teaching_assignment_id, term_id, status),
  CONSTRAINT fk_course_enrollment_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
  CONSTRAINT fk_course_enrollment_assignment FOREIGN KEY (teaching_assignment_id) REFERENCES teaching_assignments(id),
  CONSTRAINT fk_course_enrollment_term FOREIGN KEY (term_id) REFERENCES terms(id),
  CONSTRAINT fk_course_enrollment_user FOREIGN KEY (enrolled_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academic_exam_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assessment_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NOT NULL,
  invigilator_staff_id BIGINT UNSIGNED NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  status ENUM('draft','published','locked') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_academic_exam_assessment (assessment_id),
  KEY ix_academic_exam_time (starts_at, ends_at, status),
  CONSTRAINT ck_academic_exam_time CHECK (ends_at > starts_at),
  CONSTRAINT fk_academic_exam_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id),
  CONSTRAINT fk_academic_exam_room FOREIGN KEY (room_id) REFERENCES classrooms(id),
  CONSTRAINT fk_academic_exam_invigilator FOREIGN KEY (invigilator_staff_id) REFERENCES staff(id),
  CONSTRAINT fk_academic_exam_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academic_probation_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(500) NOT NULL,
  improvement_plan TEXT NULL,
  follow_up_date DATE NULL,
  status ENUM('active','cleared','escalated') NOT NULL DEFAULT 'active',
  created_by BIGINT UNSIGNED NOT NULL,
  resolved_by BIGINT UNSIGNED NULL,
  resolved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_probation_enrollment_term (enrollment_id, term_id),
  KEY ix_probation_status (status, follow_up_date),
  CONSTRAINT fk_probation_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
  CONSTRAINT fk_probation_term FOREIGN KEY (term_id) REFERENCES terms(id),
  CONSTRAINT fk_probation_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_probation_resolver FOREIGN KEY (resolved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academic_graduation_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  enrollment_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending','eligible','approved','rejected','issued') NOT NULL DEFAULT 'pending',
  missing_requirements JSON NULL,
  decision_note VARCHAR(500) NULL,
  certificate_number VARCHAR(60) NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_graduation_review_enrollment (enrollment_id),
  UNIQUE KEY uq_graduation_certificate_number (certificate_number),
  CONSTRAINT fk_graduation_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
  CONSTRAINT fk_graduation_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS academic_transcript_issues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NOT NULL,
  transcript_number VARCHAR(40) NOT NULL,
  payload_json JSON NOT NULL,
  generated_by BIGINT UNSIGNED NOT NULL,
  generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_academic_transcript_number (transcript_number),
  KEY ix_academic_transcript_student (student_id, generated_at),
  CONSTRAINT fk_academic_transcript_student FOREIGN KEY (student_id) REFERENCES students(id),
  CONSTRAINT fk_academic_transcript_user FOREIGN KEY (generated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
