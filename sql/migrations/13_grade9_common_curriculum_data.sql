-- Grades 9 and 10 follow the common curriculum.
UPDATE grades
SET has_streams = 0
WHERE grade_level IN (9, 10) AND has_streams <> 0;

-- Normalize any existing Grade 9 or Grade 10 section records created while stream support
-- was enabled, while preserving the class and its enrollment history.
UPDATE sections sec
JOIN grades g ON g.id = sec.grade_id
SET sec.stream = 'none'
WHERE g.grade_level IN (9, 10) AND sec.stream <> 'none';

-- Collapse any Grade 9 or Grade 10 stream-specific curriculum mappings into one common
-- mapping per academic-year scope. Preserve the strongest period and
-- compulsory settings before removing duplicate configuration rows.
UPDATE grade_subjects gs
JOIN (
  SELECT gs2.grade_id, gs2.subject_id, gs2.academic_year_scope,
         MIN(gs2.id) AS keep_id,
         MAX(COALESCE(gs2.periods_per_week, 0)) AS periods_per_week,
         MAX(gs2.is_compulsory) AS is_compulsory
  FROM grade_subjects gs2
  JOIN grades g2 ON g2.id = gs2.grade_id
  WHERE g2.grade_level IN (9, 10)
  GROUP BY gs2.grade_id, gs2.subject_id, gs2.academic_year_scope
) scoped ON scoped.keep_id = gs.id
SET gs.periods_per_week = NULLIF(scoped.periods_per_week, 0),
    gs.is_compulsory = scoped.is_compulsory;

DELETE gs
FROM grade_subjects gs
JOIN grades g ON g.id = gs.grade_id AND g.grade_level IN (9, 10)
JOIN grade_subjects keep_row
  ON keep_row.grade_id = gs.grade_id
 AND keep_row.subject_id = gs.subject_id
 AND keep_row.academic_year_scope = gs.academic_year_scope
 AND keep_row.id < gs.id;

UPDATE grade_subjects gs
JOIN grades g ON g.id = gs.grade_id
SET gs.stream = 'all'
WHERE g.grade_level IN (9, 10) AND gs.stream <> 'all';
