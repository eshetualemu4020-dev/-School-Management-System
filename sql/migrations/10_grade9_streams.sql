-- Superseded by migration 11, which restores Grade 9 to the common curriculum.
UPDATE grades
SET has_streams = 1
WHERE grade_level = 9;
