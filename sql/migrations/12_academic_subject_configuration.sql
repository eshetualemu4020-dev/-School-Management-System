ALTER TABLE subjects
  ADD COLUMN description VARCHAR(500) NULL AFTER name_am;

ALTER TABLE grade_subjects
  ADD COLUMN academic_year_id BIGINT UNSIGNED NULL AFTER stream,
  ADD COLUMN academic_year_scope BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(academic_year_id, 0)) STORED AFTER updated_at,
  DROP INDEX uq_grade_subjects,
  ADD UNIQUE KEY uq_grade_subjects (grade_id, subject_id, stream, academic_year_scope),
  ADD KEY ix_grade_subjects_year (academic_year_id),
  ADD CONSTRAINT fk_grade_subjects_academic_year_id FOREIGN KEY (academic_year_id) REFERENCES academic_years(id);
