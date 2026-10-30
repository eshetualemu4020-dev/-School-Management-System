-- Ensure Grade 9 uses the common curriculum like Grade 10.
UPDATE grades
SET has_streams = 0
WHERE grade_level = 9;
