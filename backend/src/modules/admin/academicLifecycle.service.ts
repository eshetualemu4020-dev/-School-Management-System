import { randomUUID } from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';

type Actor = { userId: number; username: string };

function requirePositiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new AppError(`${field} must be a positive integer.`, 400, 'INVALID_ACADEMIC_INPUT');
  }
  return parsed;
}

function parseDateTime(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    throw new AppError(`${field} must be a local date and time in YYYY-MM-DDTHH:mm format.`, 400, 'INVALID_EXAM_TIME');
  }
  const normalized = value.length === 16 ? `${value}:00` : value;
  const parsed = new Date(`${normalized}Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== normalized) {
    throw new AppError(`${field} is not a valid date and time.`, 400, 'INVALID_EXAM_TIME');
  }
  return value.replace('T', ' ') + (value.length === 16 ? ':00' : '');
}

export class AcademicLifecycleService {
  async getOptions() {
    const [years] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, start_date, end_date, status FROM academic_years ORDER BY start_date DESC`
    );
    const [terms] = await pool.query<RowDataPacket[]>(
      `SELECT t.id, t.academic_year_id, t.name, t.start_date, t.end_date, t.status,
              ay.name AS academic_year_name
       FROM terms t JOIN academic_years ay ON ay.id = t.academic_year_id
       ORDER BY ay.start_date DESC, t.term_no`
    );
    const [sections] = await pool.query<RowDataPacket[]>(
      `SELECT sec.id, sec.academic_year_id, sec.grade_id, sec.name, sec.stream,
              g.grade_level, g.display_name AS grade_name, ay.name AS academic_year_name
       FROM sections sec
       JOIN grades g ON g.id = sec.grade_id
       JOIN academic_years ay ON ay.id = sec.academic_year_id
       WHERE sec.status = 'active' AND sec.deleted_at IS NULL
       ORDER BY ay.start_date DESC, g.grade_level, sec.name`
    );
    const [assignments] = await pool.query<RowDataPacket[]>(
      `SELECT ta.id, ta.academic_year_id, ta.section_id, ta.subject_id, ta.staff_id,
              sec.name AS section_name, g.grade_level, sub.code AS subject_code,
              sub.name AS subject_name, CONCAT_WS(' ', st.first_name, st.father_name) AS teacher_name
       FROM teaching_assignments ta
       JOIN sections sec ON sec.id = ta.section_id
       JOIN grades g ON g.id = sec.grade_id
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN staff st ON st.id = ta.staff_id
       WHERE ta.is_active = 1 AND sec.status = 'active' AND sec.deleted_at IS NULL
       ORDER BY ta.academic_year_id DESC, g.grade_level, sec.name, sub.name`
    );
    const [rooms] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, building, capacity FROM classrooms WHERE status = 'active' ORDER BY name`
    );
    const [staff] = await pool.query<RowDataPacket[]>(
      `SELECT id, CONCAT_WS(' ', first_name, father_name) AS name FROM staff
       WHERE status = 'active' ORDER BY first_name, father_name`
    );
    const [grades] = await pool.query<RowDataPacket[]>(
      `SELECT id, grade_level, display_name FROM grades WHERE is_active = 1 ORDER BY grade_level`
    );
    const [subjects] = await pool.query<RowDataPacket[]>(
      `SELECT id, code, name FROM subjects WHERE status = 'active' ORDER BY name`
    );
    const [enrollments] = await pool.query<RowDataPacket[]>(
      `SELECT e.id AS enrollment_id, e.student_id, e.section_id, e.academic_year_id,
              s.admission_no, CONCAT_WS(' ', s.first_name, s.father_name, s.grandfather_name) AS student_name,
              sec.name AS section_name, sec.grade_id, g.grade_level, g.display_name AS grade_name,
              ay.name AS academic_year_name
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN sections sec ON sec.id = e.section_id
       JOIN grades g ON g.id = sec.grade_id
       JOIN academic_years ay ON ay.id = e.academic_year_id
       WHERE e.status = 'active' AND s.status = 'active' AND s.deleted_at IS NULL
       ORDER BY ay.start_date DESC, g.grade_level, sec.name, s.admission_no`
    );
    return { years, terms, sections, assignments, rooms, staff, grades, subjects, enrollments };
  }

  async listPolicies(academicYearId?: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.*, ay.name AS academic_year_name, g.display_name AS grade_name
       FROM academic_progression_policies p
       JOIN academic_years ay ON ay.id = p.academic_year_id
       JOIN grades g ON g.id = p.grade_id
       WHERE (? IS NULL OR p.academic_year_id = ?)
       ORDER BY ay.start_date DESC, g.grade_level`,
      [academicYearId || null, academicYearId || null]
    );
    return rows;
  }

  async savePolicy(payload: {
    academicYearId: unknown; gradeId: unknown; minimumAverage: unknown;
    maximumFailedSubjects: unknown; minimumAttendancePercent: unknown;
    probationAverage: unknown; minimumCoursesPerTerm: unknown; maximumCoursesPerTerm: unknown;
  }, actor: Actor) {
    const academicYearId = requirePositiveInteger(payload.academicYearId, 'Academic year');
    const gradeId = requirePositiveInteger(payload.gradeId, 'Grade');
    const minimumAverage = Number(payload.minimumAverage);
    const maximumFailedSubjects = Number(payload.maximumFailedSubjects);
    const minimumAttendancePercent = Number(payload.minimumAttendancePercent);
    const probationAverage = Number(payload.probationAverage);
    const minimumCoursesPerTerm = Number(payload.minimumCoursesPerTerm);
    const maximumCoursesPerTerm = Number(payload.maximumCoursesPerTerm);
    if (![minimumAverage, minimumAttendancePercent, probationAverage].every((n) => Number.isFinite(n) && n >= 0 && n <= 100) ||
        !Number.isInteger(maximumFailedSubjects) || maximumFailedSubjects < 0 ||
        !Number.isInteger(minimumCoursesPerTerm) || !Number.isInteger(maximumCoursesPerTerm) ||
        minimumCoursesPerTerm < 0 || maximumCoursesPerTerm < minimumCoursesPerTerm || maximumCoursesPerTerm > 50) {
      throw new AppError('Policy values are outside their allowed ranges.', 400, 'INVALID_ACADEMIC_POLICY');
    }
    const [scopeRows] = await pool.query<RowDataPacket[]>(
      `SELECT ay.status AS year_status, g.is_active AS grade_active
       FROM academic_years ay
       CROSS JOIN grades g
       WHERE ay.id = ? AND g.id = ?`,
      [academicYearId, gradeId]
    );
    if (!scopeRows[0] || scopeRows[0].year_status === 'closed' || !Number(scopeRows[0].grade_active)) {
      throw new AppError('Policy can only be configured for an existing, open academic year and active grade.', 409, 'ACADEMIC_POLICY_SCOPE_CLOSED');
    }
    await pool.query(
      `INSERT INTO academic_progression_policies
         (academic_year_id, grade_id, minimum_average, maximum_failed_subjects,
          minimum_attendance_percent, probation_average, minimum_courses_per_term,
          maximum_courses_per_term, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE minimum_average = VALUES(minimum_average),
         maximum_failed_subjects = VALUES(maximum_failed_subjects),
         minimum_attendance_percent = VALUES(minimum_attendance_percent),
         probation_average = VALUES(probation_average),
         minimum_courses_per_term = VALUES(minimum_courses_per_term),
         maximum_courses_per_term = VALUES(maximum_courses_per_term),
         updated_by = VALUES(updated_by)`,
      [academicYearId, gradeId, minimumAverage, maximumFailedSubjects, minimumAttendancePercent,
        probationAverage, minimumCoursesPerTerm, maximumCoursesPerTerm, actor.userId]
    );
    await this.audit(actor, 'academic.policy.update', 'academic_progression_policies', `${academicYearId}:${gradeId}`, payload);
    return { success: true };
  }

  async listSubjectPrerequisites(gradeId?: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT req.id, req.grade_id, req.subject_id, req.prerequisite_subject_id,
              g.display_name AS grade_name, target.code AS subject_code, target.name AS subject_name,
              prior.code AS prerequisite_code, prior.name AS prerequisite_name
       FROM academic_subject_prerequisites req
       JOIN grades g ON g.id = req.grade_id
       JOIN subjects target ON target.id = req.subject_id
       JOIN subjects prior ON prior.id = req.prerequisite_subject_id
       WHERE (? IS NULL OR req.grade_id = ?)
       ORDER BY g.grade_level, target.name, prior.name`,
      [gradeId || null, gradeId || null]
    );
    return rows;
  }

  async addSubjectPrerequisite(payload: {
    gradeId: unknown; subjectId: unknown; prerequisiteSubjectId: unknown;
  }, actor: Actor) {
    const gradeId = requirePositiveInteger(payload.gradeId, 'Grade');
    const subjectId = requirePositiveInteger(payload.subjectId, 'Subject');
    const prerequisiteSubjectId = requirePositiveInteger(payload.prerequisiteSubjectId, 'Prerequisite subject');
    if (subjectId === prerequisiteSubjectId) throw new AppError('A subject cannot be its own prerequisite.', 400, 'INVALID_SUBJECT_PREREQUISITE');
    const [gradeRows] = await pool.query<RowDataPacket[]>(`SELECT id FROM grades WHERE id = ? AND is_active = 1`, [gradeId]);
    if (!gradeRows.length) throw new AppError('Active grade was not found.', 404, 'GRADE_NOT_FOUND');
    const [subjectRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM subjects WHERE id IN (?, ?) AND status = 'active'`, [subjectId, prerequisiteSubjectId]
    );
    if (subjectRows.length !== 2) throw new AppError('Both subjects must be active.', 404, 'SUBJECT_NOT_FOUND');
    const [existingRules] = await pool.query<RowDataPacket[]>(
      `SELECT subject_id, prerequisite_subject_id FROM academic_subject_prerequisites WHERE grade_id = ?`,
      [gradeId]
    );
    const prerequisitesBySubject = new Map<number, number[]>();
    for (const rule of existingRules) {
      const target = Number(rule.subject_id);
      prerequisitesBySubject.set(target, [...(prerequisitesBySubject.get(target) || []), Number(rule.prerequisite_subject_id)]);
    }
    const pending = [prerequisiteSubjectId];
    const visited = new Set<number>();
    while (pending.length) {
      const current = pending.pop()!;
      if (current === subjectId) throw new AppError('This prerequisite would create a circular course dependency.', 409, 'CIRCULAR_SUBJECT_PREREQUISITE');
      if (visited.has(current)) continue;
      visited.add(current);
      pending.push(...(prerequisitesBySubject.get(current) || []));
    }
    try {
      const [inserted] = await pool.query<ResultSetHeader>(
        `INSERT INTO academic_subject_prerequisites (grade_id, subject_id, prerequisite_subject_id, created_by)
         VALUES (?, ?, ?, ?)`,
        [gradeId, subjectId, prerequisiteSubjectId, actor.userId]
      );
      await this.audit(actor, 'academic.course_prerequisite.add', 'academic_subject_prerequisites', String(inserted.insertId), {
        gradeId, subjectId, prerequisiteSubjectId
      });
      return { id: inserted.insertId };
    } catch (err) {
      if ((err as { code?: string })?.code === 'ER_DUP_ENTRY') {
        throw new AppError('This prerequisite rule already exists.', 409, 'DUPLICATE_SUBJECT_PREREQUISITE');
      }
      throw err;
    }
  }

  async removeSubjectPrerequisite(idValue: unknown, actor: Actor) {
    const id = requirePositiveInteger(idValue, 'Prerequisite rule');
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM academic_subject_prerequisites WHERE id = ?`, [id]
    );
    if (!result.affectedRows) throw new AppError('Prerequisite rule was not found.', 404, 'SUBJECT_PREREQUISITE_NOT_FOUND');
    await this.audit(actor, 'academic.course_prerequisite.remove', 'academic_subject_prerequisites', String(id), {});
    return { success: true };
  }

  async listExamSchedules(termId?: number, sectionId?: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT es.id, es.assessment_id, es.room_id, es.invigilator_staff_id,
              es.starts_at, es.ends_at, es.status, es.created_at,
              a.title, a.term_id, t.name AS term_name, ay.id AS academic_year_id, ay.name AS academic_year_name,
              sec.id AS section_id, sec.name AS section_name, g.display_name AS grade_name,
              sub.name AS subject_name, cr.name AS room_name,
              CONCAT_WS(' ', inv.first_name, inv.father_name) AS invigilator_name,
              CONCAT_WS(' ', teacher.first_name, teacher.father_name) AS teacher_name
       FROM academic_exam_schedules es
       JOIN assessments a ON a.id = es.assessment_id
       JOIN terms t ON t.id = a.term_id
       JOIN academic_years ay ON ay.id = t.academic_year_id
       JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
       JOIN sections sec ON sec.id = ta.section_id
       JOIN grades g ON g.id = sec.grade_id
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN staff teacher ON teacher.id = ta.staff_id
       JOIN classrooms cr ON cr.id = es.room_id
       LEFT JOIN staff inv ON inv.id = es.invigilator_staff_id
       WHERE (? IS NULL OR a.term_id = ?) AND (? IS NULL OR ta.section_id = ?)
       ORDER BY es.starts_at, g.grade_level, sec.name, sub.name`,
      [termId || null, termId || null, sectionId || null, sectionId || null]
    );
    return rows;
  }

  async saveExamSchedule(payload: {
    id?: unknown; assessmentId: unknown; roomId: unknown; invigilatorStaffId?: unknown;
    startsAt: unknown; endsAt: unknown;
  }, actor: Actor) {
    const assessmentId = requirePositiveInteger(payload.assessmentId, 'Assessment');
    const roomId = requirePositiveInteger(payload.roomId, 'Room');
    const id = payload.id === undefined ? undefined : requirePositiveInteger(payload.id, 'Schedule');
    const startsAt = parseDateTime(payload.startsAt, 'Start time');
    const endsAt = parseDateTime(payload.endsAt, 'End time');
    if (startsAt >= endsAt) throw new AppError('Exam end time must be after its start time.', 400, 'INVALID_EXAM_TIME');
    const invigilatorStaffId = payload.invigilatorStaffId ? requirePositiveInteger(payload.invigilatorStaffId, 'Invigilator') : null;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [assessmentRows] = await conn.query<RowDataPacket[]>(
        `SELECT a.id, a.title, a.assessment_date, a.term_id, t.start_date, t.end_date,
                ta.section_id, ta.staff_id, sec.name AS section_name,
                (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = sec.id AND e.status = 'active') AS student_count
         FROM assessments a
         JOIN terms t ON t.id = a.term_id
         JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
         JOIN sections sec ON sec.id = ta.section_id
         WHERE a.id = ? AND a.status <> 'closed' AND ta.is_active = 1
         FOR UPDATE`,
        [assessmentId]
      );
      const assessment = assessmentRows[0];
      if (!assessment) throw new AppError('Open assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');
      const startDate = startsAt.slice(0, 10);
      const endDate = endsAt.slice(0, 10);
      if (startDate !== endDate || startDate < String(assessment.start_date).slice(0, 10) ||
          startDate > String(assessment.end_date).slice(0, 10) ||
          (assessment.assessment_date && startDate !== String(assessment.assessment_date).slice(0, 10))) {
        throw new AppError('The exam must take place on one day within its term and match the assessment date when one is set.', 400, 'EXAM_DATE_OUTSIDE_TERM');
      }
      const [roomRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, capacity FROM classrooms WHERE id = ? AND status = 'active' FOR UPDATE`, [roomId]
      );
      if (!roomRows[0]) throw new AppError('Choose an active exam room.', 404, 'EXAM_ROOM_NOT_FOUND');
      if (roomRows[0].capacity !== null && Number(roomRows[0].capacity) < Number(assessment.student_count)) {
        throw new AppError('Exam room capacity is below the number of active students in the section.', 409, 'EXAM_ROOM_CAPACITY');
      }
      if (invigilatorStaffId) {
        const [staffRows] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM staff WHERE id = ? AND status = 'active' FOR UPDATE`, [invigilatorStaffId]
        );
        if (!staffRows[0]) throw new AppError('Choose an active invigilator.', 404, 'INVIGILATOR_NOT_FOUND');
      }
      const [conflicts] = await conn.query<RowDataPacket[]>(
        `SELECT es.id, es.room_id, ta.section_id, ta.staff_id, es.invigilator_staff_id
         FROM academic_exam_schedules es
         JOIN assessments a ON a.id = es.assessment_id
         JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
         WHERE es.starts_at < ? AND es.ends_at > ?
           AND (? IS NULL OR es.id <> ?)
           AND (es.room_id = ? OR ta.section_id = ? OR
                ta.staff_id = ? OR es.invigilator_staff_id = ? OR
                (? IS NOT NULL AND (ta.staff_id = ? OR es.invigilator_staff_id = ?)))
         FOR UPDATE`,
        [endsAt, startsAt, id || null, id || null, roomId, assessment.section_id,
          assessment.staff_id, assessment.staff_id, invigilatorStaffId,
          invigilatorStaffId, invigilatorStaffId]
      );
      if (conflicts.length) {
        const conflict = conflicts[0];
        const reason = Number(conflict.room_id) === roomId ? 'room' :
          Number(conflict.section_id) === Number(assessment.section_id) ? 'section' : 'teacher/invigilator';
        throw new AppError(`This exam conflicts with another scheduled exam (${reason} overlap).`, 409, 'EXAM_SCHEDULE_CONFLICT');
      }
      let scheduleId: number;
      if (id) {
        const [currentRows] = await conn.query<RowDataPacket[]>(
          `SELECT id, status FROM academic_exam_schedules WHERE id = ? FOR UPDATE`, [id]
        );
        if (!currentRows[0]) throw new AppError('Exam schedule was not found.', 404, 'EXAM_SCHEDULE_NOT_FOUND');
        if (currentRows[0].status === 'locked') throw new AppError('Locked exam schedules cannot be changed.', 409, 'EXAM_SCHEDULE_LOCKED');
        await conn.query(
          `UPDATE academic_exam_schedules SET assessment_id = ?, room_id = ?, invigilator_staff_id = ?,
             starts_at = ?, ends_at = ? WHERE id = ?`,
          [assessmentId, roomId, invigilatorStaffId, startsAt, endsAt, id]
        );
        scheduleId = id;
      } else {
        const [inserted] = await conn.query<ResultSetHeader>(
          `INSERT INTO academic_exam_schedules
             (assessment_id, room_id, invigilator_staff_id, starts_at, ends_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [assessmentId, roomId, invigilatorStaffId, startsAt, endsAt, actor.userId]
        );
        scheduleId = inserted.insertId;
      }
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes)
         VALUES (?, ?, ?, 'academic_exam_schedules', ?, 'success', ?)`,
        [actor.userId, actor.username, id ? 'academic.exam_schedule.update' : 'academic.exam_schedule.create',
          String(scheduleId), JSON.stringify({ assessmentId, roomId, invigilatorStaffId, startsAt, endsAt })]
      );
      await conn.commit();
      return { id: scheduleId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async setExamScheduleStatus(idValue: unknown, status: unknown, actor: Actor) {
    const id = requirePositiveInteger(idValue, 'Schedule');
    if (status !== 'published' && status !== 'locked') {
      throw new AppError('Exam schedule status must be published or locked.', 400, 'INVALID_EXAM_STATUS');
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT es.status, a.status AS assessment_status
         FROM academic_exam_schedules es JOIN assessments a ON a.id = es.assessment_id
         WHERE es.id = ? FOR UPDATE`, [id]
      );
      if (!rows[0]) throw new AppError('Exam schedule was not found.', 404, 'EXAM_SCHEDULE_NOT_FOUND');
      if (rows[0].status === 'locked') throw new AppError('Exam schedule is already locked.', 409, 'EXAM_SCHEDULE_LOCKED');
      if (status === 'locked' && rows[0].status !== 'published') {
        throw new AppError('Publish the exam schedule before locking it.', 409, 'EXAM_SCHEDULE_NOT_PUBLISHED');
      }
      if (rows[0].assessment_status === 'closed' && status === 'published') {
        throw new AppError('A closed assessment cannot be published on an exam schedule.', 409, 'ASSESSMENT_CLOSED');
      }
      await conn.query(`UPDATE academic_exam_schedules SET status = ? WHERE id = ?`, [status, id]);
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome)
         VALUES (?, ?, ?, 'academic_exam_schedules', ?, 'success')`,
        [actor.userId, actor.username, `academic.exam_schedule.${status}`, String(id)]
      );
      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async listCourseEnrollments(sectionId?: number, termId?: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ce.id, ce.enrollment_id, ce.teaching_assignment_id, ce.term_id, ce.status, ce.created_at,
              s.id AS student_id, s.admission_no,
              CONCAT_WS(' ', s.first_name, s.father_name, s.grandfather_name) AS student_name,
              sub.code AS subject_code, sub.name AS subject_name, sec.name AS section_name,
              t.name AS term_name, ay.name AS academic_year_name
       FROM academic_course_enrollments ce
       JOIN enrollments e ON e.id = ce.enrollment_id
       JOIN students s ON s.id = e.student_id
       JOIN teaching_assignments ta ON ta.id = ce.teaching_assignment_id
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN sections sec ON sec.id = ta.section_id
       JOIN terms t ON t.id = ce.term_id
       JOIN academic_years ay ON ay.id = t.academic_year_id
       WHERE (? IS NULL OR sec.id = ?) AND (? IS NULL OR ce.term_id = ?)
       ORDER BY sec.name, s.first_name, sub.name`,
      [sectionId || null, sectionId || null, termId || null, termId || null]
    );
    return rows;
  }

  async enrollCourse(payload: { enrollmentId: unknown; teachingAssignmentId: unknown; termId: unknown }, actor: Actor) {
    const enrollmentId = requirePositiveInteger(payload.enrollmentId, 'Student enrollment');
    const teachingAssignmentId = requirePositiveInteger(payload.teachingAssignmentId, 'Teaching assignment');
    const termId = requirePositiveInteger(payload.termId, 'Term');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT e.student_id, e.section_id, e.academic_year_id, e.status AS enrollment_status,
                sec.grade_id, sec.stream, ta.subject_id, ta.section_id AS assignment_section_id,
                ta.academic_year_id AS assignment_year_id, ta.is_active, t.academic_year_id AS term_year_id,
                t.status AS term_status, ay.status AS year_status, s.name AS subject_name
         FROM enrollments e
         JOIN sections sec ON sec.id = e.section_id
         JOIN teaching_assignments ta ON ta.id = ?
         JOIN subjects s ON s.id = ta.subject_id
         JOIN terms t ON t.id = ?
         JOIN academic_years ay ON ay.id = t.academic_year_id
         WHERE e.id = ? FOR UPDATE`,
        [teachingAssignmentId, termId, enrollmentId]
      );
      const row = rows[0];
      if (!row) throw new AppError('Choose a valid student enrollment, assignment, and term.', 404, 'COURSE_ENROLLMENT_SCOPE_NOT_FOUND');
      if (row.enrollment_status !== 'active' || Number(row.section_id) !== Number(row.assignment_section_id) ||
          Number(row.academic_year_id) !== Number(row.assignment_year_id) ||
          Number(row.academic_year_id) !== Number(row.term_year_id) || !Number(row.is_active) ||
          row.term_status === 'closed' || row.year_status === 'closed') {
        throw new AppError('Student, course, and term must belong to the same active section and academic year.', 409, 'COURSE_ENROLLMENT_SCOPE_MISMATCH');
      }
      const [policyRows] = await conn.query<RowDataPacket[]>(
        `SELECT minimum_courses_per_term, maximum_courses_per_term
         FROM academic_progression_policies WHERE academic_year_id = ? AND grade_id = ?`,
        [row.academic_year_id, row.grade_id]
      );
      if (!policyRows[0]) throw new AppError('Configure the academic policy for this year and grade before enrolling students in courses.', 409, 'ACADEMIC_POLICY_REQUIRED');
      const [offeredRows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM grade_subjects
         WHERE grade_id = ? AND subject_id = ? AND (academic_year_id IS NULL OR academic_year_id = ?)
           AND (stream = 'all' OR stream = ?)
         LIMIT 1`,
        [row.grade_id, row.subject_id, row.academic_year_id, row.stream === 'none' ? 'all' : row.stream]
      );
      if (!offeredRows[0]) throw new AppError('This subject is not offered to the student grade or stream.', 409, 'SUBJECT_NOT_OFFERED');
      const [duplicateSubject] = await conn.query<RowDataPacket[]>(
        `SELECT ce.id FROM academic_course_enrollments ce
         JOIN teaching_assignments other_ta ON other_ta.id = ce.teaching_assignment_id
         WHERE ce.enrollment_id = ? AND ce.term_id = ? AND ce.status = 'approved'
           AND other_ta.subject_id = ? LIMIT 1`,
        [enrollmentId, termId, row.subject_id]
      );
      if (duplicateSubject.length) throw new AppError('Student is already enrolled in this subject for the selected term.', 409, 'DUPLICATE_COURSE_ENROLLMENT');
      const [prerequisites] = await conn.query<RowDataPacket[]>(
        `SELECT prereq.prerequisite_subject_id, subject.name AS prerequisite_name
         FROM academic_subject_prerequisites prereq
         JOIN subjects subject ON subject.id = prereq.prerequisite_subject_id
         WHERE prereq.grade_id = ? AND prereq.subject_id = ?`,
        [row.grade_id, row.subject_id]
      );
      for (const prerequisite of prerequisites) {
        const [passedRows] = await conn.query<RowDataPacket[]>(
          `SELECT 1
           FROM results r
           JOIN result_publications rp ON rp.id = r.publication_id AND rp.status = 'published'
           JOIN enrollments prior_e ON prior_e.id = r.enrollment_id
           JOIN academic_years prior_ay ON prior_ay.id = prior_e.academic_year_id
           JOIN academic_years current_ay ON current_ay.id = ?
           WHERE prior_e.student_id = ? AND prior_e.id <> ? AND prior_ay.start_date < current_ay.start_date
             AND r.subject_id = ? AND r.is_pass = 1 AND r.status = 'published'
           LIMIT 1`,
          [row.academic_year_id, row.student_id, enrollmentId, prerequisite.prerequisite_subject_id]
        );
        if (!passedRows.length) {
          throw new AppError(`Student must pass ${prerequisite.prerequisite_name} before taking ${row.subject_name}.`, 409, 'COURSE_PREREQUISITE_NOT_MET');
        }
      }
      const [countRows] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM academic_course_enrollments
         WHERE enrollment_id = ? AND term_id = ? AND status = 'approved'`,
        [enrollmentId, termId]
      );
      const count = Number(countRows[0]?.total || 0);
      if (count >= Number(policyRows[0].maximum_courses_per_term)) {
        throw new AppError('Student has reached the maximum courses allowed for this term.', 409, 'COURSE_LIMIT_REACHED');
      }
      const [existingRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, status FROM academic_course_enrollments
         WHERE enrollment_id = ? AND teaching_assignment_id = ? AND term_id = ? FOR UPDATE`,
        [enrollmentId, teachingAssignmentId, termId]
      );
      let courseEnrollmentId: number;
      if (existingRows[0]?.status === 'approved') {
        throw new AppError('Student is already enrolled in this assignment for the selected term.', 409, 'DUPLICATE_COURSE_ENROLLMENT');
      } else if (existingRows[0]) {
        courseEnrollmentId = Number(existingRows[0].id);
        await conn.query(
          `UPDATE academic_course_enrollments
           SET status = 'approved', enrolled_by = ?, dropped_at = NULL WHERE id = ?`,
          [actor.userId, courseEnrollmentId]
        );
      } else {
        const [inserted] = await conn.query<ResultSetHeader>(
          `INSERT INTO academic_course_enrollments
             (enrollment_id, teaching_assignment_id, term_id, status, enrolled_by)
           VALUES (?, ?, ?, 'approved', ?)`,
          [enrollmentId, teachingAssignmentId, termId, actor.userId]
        );
        courseEnrollmentId = inserted.insertId;
      }
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes)
         VALUES (?, ?, 'academic.course_enroll', 'academic_course_enrollments', ?, 'success', ?)`,
        [actor.userId, actor.username, String(courseEnrollmentId), JSON.stringify({ enrollmentId, teachingAssignmentId, termId })]
      );
      await conn.commit();
      return { id: courseEnrollmentId };
    } catch (err) {
      await conn.rollback();
      if ((err as { code?: string })?.code === 'ER_DUP_ENTRY') {
        throw new AppError('This course enrollment already exists.', 409, 'DUPLICATE_COURSE_ENROLLMENT');
      }
      throw err;
    } finally {
      conn.release();
    }
  }

  async dropCourseEnrollment(idValue: unknown, reasonValue: unknown, actor: Actor) {
    const id = requirePositiveInteger(idValue, 'Course enrollment');
    const reason = typeof reasonValue === 'string' ? reasonValue.trim() : '';
    if (!reason || reason.length > 500) throw new AppError('A reason of up to 500 characters is required to drop a course.', 400, 'DROP_REASON_REQUIRED');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT ce.id, ce.enrollment_id, ce.term_id, ce.status, ta.subject_id,
                e.academic_year_id, sec.grade_id, sec.stream, p.minimum_courses_per_term,
                EXISTS (
                  SELECT 1 FROM grade_subjects gs
                  WHERE gs.grade_id = sec.grade_id AND gs.subject_id = ta.subject_id
                    AND gs.is_compulsory = 1
                    AND (gs.academic_year_id IS NULL OR gs.academic_year_id = e.academic_year_id)
                    AND (gs.stream = 'all' OR gs.stream = sec.stream)
                ) AS is_compulsory
         FROM academic_course_enrollments ce
         JOIN enrollments e ON e.id = ce.enrollment_id
         JOIN sections sec ON sec.id = e.section_id
         JOIN teaching_assignments ta ON ta.id = ce.teaching_assignment_id
         LEFT JOIN academic_progression_policies p ON p.academic_year_id = e.academic_year_id AND p.grade_id = sec.grade_id
         WHERE ce.id = ? FOR UPDATE`,
        [id]
      );
      const course = rows[0];
      if (!course || course.status !== 'approved') throw new AppError('Active course enrollment was not found.', 404, 'COURSE_ENROLLMENT_NOT_FOUND');
      if (Number(course.is_compulsory)) throw new AppError('A compulsory curriculum course cannot be dropped.', 409, 'COMPULSORY_COURSE_CANNOT_DROP');
      const [countRows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM academic_course_enrollments
         WHERE enrollment_id = ? AND term_id = ? AND status = 'approved' FOR UPDATE`,
        [course.enrollment_id, course.term_id]
      );
      if (course.minimum_courses_per_term !== null &&
          countRows.length - 1 < Number(course.minimum_courses_per_term)) {
        throw new AppError('Dropping this course would put the student below the configured minimum course load.', 409, 'MINIMUM_COURSE_LOAD');
      }
      await conn.query(
        `UPDATE academic_course_enrollments SET status = 'dropped', dropped_at = NOW(3) WHERE id = ?`,
        [id]
      );
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (?, ?, 'academic.course_drop', 'academic_course_enrollments', ?, 'success', ?, ?)`,
        [actor.userId, actor.username, String(id), JSON.stringify({ enrollmentId: course.enrollment_id, termId: course.term_id }), reason]
      );
      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getTranscript(studentIdValue: unknown) {
    const studentId = requirePositiveInteger(studentIdValue, 'Student');
    const [studentRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, admission_no, CONCAT_WS(' ', first_name, father_name, grandfather_name) AS student_name
       FROM students WHERE id = ? AND deleted_at IS NULL`, [studentId]
    );
    if (!studentRows[0]) throw new AppError('Student record was not found.', 404, 'STUDENT_NOT_FOUND');
    const [records] = await pool.query<RowDataPacket[]>(
      `SELECT snap.id, snap.enrollment_id, snap.term_id, snap.version, snap.average_percent,
              snap.class_rank, snap.class_size, snap.payload_json, snap.generated_at, snap.issued_at,
              t.name AS term_name, ay.name AS academic_year_name, ay.start_date,
              g.display_name AS grade_name, sec.name AS section_name
       FROM report_card_snapshots snap
       JOIN result_publications rp ON rp.id = snap.publication_id AND rp.status = 'published'
       JOIN terms t ON t.id = snap.term_id
       JOIN academic_years ay ON ay.id = t.academic_year_id
       JOIN enrollments e ON e.id = snap.enrollment_id
       JOIN sections sec ON sec.id = e.section_id
       JOIN grades g ON g.id = sec.grade_id
       WHERE e.student_id = ?
         AND snap.version = (
           SELECT MAX(s2.version) FROM report_card_snapshots s2
           JOIN result_publications rp2 ON rp2.id = s2.publication_id AND rp2.status = 'published'
           WHERE s2.enrollment_id = snap.enrollment_id AND s2.term_id = snap.term_id
         )
       ORDER BY ay.start_date, t.term_no`,
      [studentId]
    );
    return { student: studentRows[0], records };
  }

  async issueTranscript(studentIdValue: unknown, actor: Actor) {
    const transcript = await this.getTranscript(studentIdValue);
    if (!transcript.records.length) throw new AppError('There are no published academic results to issue as a transcript.', 409, 'TRANSCRIPT_RESULTS_UNAVAILABLE');
    const transcriptNumber = `TR-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const payload = {
      ...transcript,
      records: transcript.records.map((record) => ({
        ...record,
        payload_json: typeof record.payload_json === 'string' ? JSON.parse(record.payload_json) : record.payload_json
      }))
    };
    const [inserted] = await pool.query<ResultSetHeader>(
      `INSERT INTO academic_transcript_issues (student_id, transcript_number, payload_json, generated_by)
       VALUES (?, ?, ?, ?)`,
      [transcript.student.id, transcriptNumber, JSON.stringify(payload), actor.userId]
    );
    await this.audit(actor, 'academic.transcript.issue', 'academic_transcript_issues', String(inserted.insertId), { transcriptNumber, studentId: transcript.student.id });
    return { id: inserted.insertId, transcriptNumber, payload };
  }

  async getIssuedTranscripts(studentIdValue: unknown) {
    const studentId = requirePositiveInteger(studentIdValue, 'Student');
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, transcript_number, payload_json, generated_at
       FROM academic_transcript_issues WHERE student_id = ? ORDER BY generated_at DESC`,
      [studentId]
    );
    return rows;
  }

  async getRankings(termIdValue: unknown, sectionIdValue: unknown) {
    const termId = requirePositiveInteger(termIdValue, 'Term');
    const sectionId = requirePositiveInteger(sectionIdValue, 'Section');
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT snap.enrollment_id, s.admission_no,
              CONCAT_WS(' ', s.first_name, s.father_name, s.grandfather_name) AS student_name,
              snap.average_percent, snap.class_rank, snap.class_size
       FROM report_card_snapshots snap
       JOIN result_publications rp ON rp.id = snap.publication_id AND rp.status = 'published'
       JOIN enrollments e ON e.id = snap.enrollment_id
       JOIN students s ON s.id = e.student_id
       WHERE snap.term_id = ? AND rp.section_id = ?
         AND snap.version = (
           SELECT MAX(s2.version) FROM report_card_snapshots s2
           JOIN result_publications rp2 ON rp2.id = s2.publication_id AND rp2.status = 'published'
           WHERE s2.enrollment_id = snap.enrollment_id AND s2.term_id = snap.term_id
         )
       ORDER BY snap.class_rank IS NULL, snap.class_rank, snap.average_percent DESC, s.admission_no`,
      [termId, sectionId]
    );
    return rows;
  }

  async evaluatePromotions(academicYearIdValue: unknown) {
    const academicYearId = requirePositiveInteger(academicYearIdValue, 'Academic year');
    const [termRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM terms WHERE academic_year_id = ? AND status <> 'planned'`,
      [academicYearId]
    );
    const expectedTerms = Number(termRows[0]?.total || 0);
    if (expectedTerms === 0) throw new AppError('The selected year has no active terms to evaluate.', 409, 'ACADEMIC_TERMS_REQUIRED');
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT e.id AS enrollment_id, e.student_id, e.section_id, e.academic_year_id,
              sec.grade_id, sec.name AS section_name, g.grade_level, g.display_name AS grade_name,
              (g.grade_level = (SELECT MAX(grade_level) FROM grades WHERE is_active = 1)) AS final_grade,
              s.admission_no, CONCAT_WS(' ', s.first_name, s.father_name, s.grandfather_name) AS student_name,
              p.minimum_average, p.maximum_failed_subjects, p.minimum_attendance_percent,
              p.probation_average, p.minimum_courses_per_term, p.maximum_courses_per_term,
              (SELECT COUNT(DISTINCT snap.term_id)
               FROM report_card_snapshots snap
               JOIN result_publications rp ON rp.id = snap.publication_id AND rp.status = 'published'
               JOIN terms t ON t.id = snap.term_id AND t.academic_year_id = e.academic_year_id
               WHERE snap.enrollment_id = e.id) AS published_terms,
              (SELECT AVG(r.total_score)
               FROM results r
               JOIN result_publications rp ON rp.id = r.publication_id AND rp.status = 'published'
               JOIN terms t ON t.id = r.term_id AND t.academic_year_id = e.academic_year_id
               WHERE r.enrollment_id = e.id AND r.status = 'published' AND r.total_score IS NOT NULL) AS average_score,
              (SELECT COUNT(DISTINCT r.subject_id)
               FROM results r
               JOIN result_publications rp ON rp.id = r.publication_id AND rp.status = 'published'
               JOIN terms t ON t.id = r.term_id AND t.academic_year_id = e.academic_year_id
               WHERE r.enrollment_id = e.id AND r.status = 'published' AND r.is_pass = 0) AS failed_subjects,
              (SELECT COUNT(*) FROM terms required_term
               WHERE required_term.academic_year_id = e.academic_year_id
                 AND required_term.status <> 'planned'
                 AND (SELECT COUNT(*) FROM academic_course_enrollments ce
                      WHERE ce.enrollment_id = e.id AND ce.term_id = required_term.id AND ce.status = 'approved')
                     < COALESCE(p.minimum_courses_per_term, 0)) AS course_terms_below_minimum,
              (SELECT COUNT(*) FROM terms required_term
               WHERE required_term.academic_year_id = e.academic_year_id
                 AND required_term.status <> 'planned'
                 AND EXISTS (
                   SELECT 1 FROM grade_subjects gs
                   WHERE gs.grade_id = sec.grade_id AND gs.is_compulsory = 1
                     AND (gs.academic_year_id IS NULL OR gs.academic_year_id = e.academic_year_id)
                     AND (gs.stream = 'all' OR gs.stream = sec.stream)
                     AND NOT EXISTS (
                       SELECT 1 FROM academic_course_enrollments ce
                       JOIN teaching_assignments course_ta ON course_ta.id = ce.teaching_assignment_id
                       WHERE ce.enrollment_id = e.id AND ce.term_id = required_term.id AND ce.status = 'approved'
                         AND course_ta.subject_id = gs.subject_id
                     )
                 )) AS terms_missing_compulsory_courses,
              (SELECT COUNT(*) FROM attendance_records ar
               JOIN attendance_sessions ats ON ats.id = ar.session_id
               JOIN academic_years ay ON ay.id = e.academic_year_id
               JOIN attendance_statuses ast ON ast.code = ar.status_code
               WHERE ar.enrollment_id = e.id AND ats.attendance_date BETWEEN ay.start_date AND ay.end_date) AS attendance_total,
              (SELECT COUNT(*) FROM attendance_records ar
               JOIN attendance_sessions ats ON ats.id = ar.session_id
               JOIN academic_years ay ON ay.id = e.academic_year_id
               JOIN attendance_statuses ast ON ast.code = ar.status_code
               WHERE ar.enrollment_id = e.id AND ats.attendance_date BETWEEN ay.start_date AND ay.end_date
                 AND ast.counts_as_present = 1) AS attendance_present,
              EXISTS (SELECT 1 FROM promotions pm WHERE pm.enrollment_id = e.id) AS decision_exists
       FROM enrollments e
       JOIN sections sec ON sec.id = e.section_id
       JOIN grades g ON g.id = sec.grade_id
       JOIN students s ON s.id = e.student_id
       LEFT JOIN academic_progression_policies p ON p.academic_year_id = e.academic_year_id AND p.grade_id = sec.grade_id
       WHERE e.academic_year_id = ? AND e.status = 'active' AND s.deleted_at IS NULL
       ORDER BY g.grade_level, sec.name, s.admission_no`,
      [academicYearId]
    );
    return rows.map((row) => {
      const publishedTerms = Number(row.published_terms || 0);
      const average = row.average_score === null ? null : Number(row.average_score);
      const failedSubjects = Number(row.failed_subjects || 0);
      const attendanceTotal = Number(row.attendance_total || 0);
      const attendancePercent = attendanceTotal ? Number(row.attendance_present || 0) * 100 / attendanceTotal : null;
      const courseTermsBelowMinimum = Number(row.course_terms_below_minimum || 0);
      const termsMissingCompulsory = Number(row.terms_missing_compulsory_courses || 0);
      const reasons: string[] = [];
      if (row.minimum_average === null) reasons.push('Promotion policy is not configured for this grade.');
      if (publishedTerms < expectedTerms) reasons.push(`Published results are missing for ${expectedTerms - publishedTerms} term(s).`);
      if (average === null) reasons.push('No finalized subject results are available.');
      if (attendancePercent === null) reasons.push('No attendance records are available.');
      if (average !== null && row.minimum_average !== null && average < Number(row.minimum_average)) reasons.push('Annual average is below the configured promotion threshold.');
      if (row.maximum_failed_subjects !== null && failedSubjects > Number(row.maximum_failed_subjects)) reasons.push('Failed subject count exceeds the configured limit.');
      if (attendancePercent !== null && row.minimum_attendance_percent !== null && attendancePercent < Number(row.minimum_attendance_percent)) reasons.push('Attendance is below the configured minimum.');
      if (courseTermsBelowMinimum > 0) reasons.push(`Minimum course enrollment is not met in ${courseTermsBelowMinimum} term(s).`);
      if (termsMissingCompulsory > 0) reasons.push(`Compulsory curriculum courses are missing in ${termsMissingCompulsory} term(s).`);
      return {
        enrollmentId: Number(row.enrollment_id),
        studentId: Number(row.student_id),
        admissionNo: row.admission_no,
        studentName: row.student_name,
        gradeId: Number(row.grade_id),
        gradeLevel: Number(row.grade_level),
        gradeName: row.grade_name,
        sectionName: row.section_name,
        average: average === null ? null : Number(average.toFixed(2)),
        failedSubjects,
        attendancePercent: attendancePercent === null ? null : Number(attendancePercent.toFixed(2)),
        publishedTerms,
        expectedTerms,
        courseTermsBelowMinimum,
        termsMissingCompulsory,
        policyConfigured: row.minimum_average !== null,
        decisionExists: Boolean(row.decision_exists),
        recommendedDecision: reasons.length ? 'review' : Number(row.final_grade) ? 'graduation_review' : 'promoted',
        reasons
      };
    });
  }

  async recordPromotion(payload: {
    enrollmentId: unknown; decision: unknown; toAcademicYearId?: unknown; toGradeId?: unknown;
    effectiveDate: unknown; remarks?: unknown;
  }, actor: Actor) {
    const enrollmentId = requirePositiveInteger(payload.enrollmentId, 'Enrollment');
    if (!['promoted', 'repeat', 'graduated'].includes(String(payload.decision))) {
      throw new AppError('Promotion decision must be promoted, repeat, or graduated.', 400, 'INVALID_PROMOTION_DECISION');
    }
    const decision = payload.decision as 'promoted' | 'repeat' | 'graduated';
    if (decision === 'graduated') {
      throw new AppError('Graduation must go through the eligibility, approval, and certificate workflow.', 409, 'USE_GRADUATION_WORKFLOW');
    }
    const effectiveDate = String(payload.effectiveDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) || Number.isNaN(Date.parse(`${effectiveDate}T00:00:00Z`))) {
      throw new AppError('A valid effective date is required.', 400, 'INVALID_EFFECTIVE_DATE');
    }
    const remarks = typeof payload.remarks === 'string' ? payload.remarks.trim() : '';
    if (remarks.length > 500) throw new AppError('Remarks must be 500 characters or fewer.', 400, 'INVALID_PROMOTION_REMARKS');
    if (decision === 'repeat' && !remarks) {
      throw new AppError('A written reason is required for a retention decision.', 400, 'RETENTION_REASON_REQUIRED');
    }
    const toGradeId = payload.toGradeId ? requirePositiveInteger(payload.toGradeId, 'Destination grade') : null;
    const toAcademicYearId = payload.toAcademicYearId ? requirePositiveInteger(payload.toAcademicYearId, 'Destination academic year') : null;
    if (!toGradeId || !toAcademicYearId) {
      throw new AppError('Select a destination grade and academic year for a promotion or retention decision.', 400, 'PROMOTION_TARGET_REQUIRED');
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [enrollmentRows] = await conn.query<RowDataPacket[]>(
        `SELECT e.id, e.student_id, e.status, e.academic_year_id,
                s.status AS student_status, g.id AS grade_id, g.grade_level, ay.start_date
         FROM enrollments e JOIN students s ON s.id = e.student_id
         JOIN sections sec ON sec.id = e.section_id
         JOIN grades g ON g.id = sec.grade_id
         JOIN academic_years ay ON ay.id = e.academic_year_id
         WHERE e.id = ? FOR UPDATE`, [enrollmentId]
      );
      const enrollment = enrollmentRows[0];
      if (!enrollment || enrollment.status !== 'active') throw new AppError('Active student enrollment was not found.', 404, 'ACTIVE_ENROLLMENT_NOT_FOUND');
      if (decision === 'promoted') {
        const evaluations = await this.evaluatePromotions(Number(enrollment.academic_year_id));
        const evaluation = evaluations.find((item) => item.enrollmentId === enrollmentId);
        if (!evaluation || evaluation.reasons.length > 0 || evaluation.recommendedDecision !== 'promoted') {
          throw new AppError('Promotion requirements are not satisfied. Review the academic evaluation before recording a promotion.', 409, 'PROMOTION_REQUIREMENTS_NOT_MET');
        }
      }
      const [existing] = await conn.query<RowDataPacket[]>(`SELECT id FROM promotions WHERE enrollment_id = ?`, [enrollmentId]);
      if (existing.length) throw new AppError('A promotion decision already exists for this enrollment.', 409, 'PROMOTION_ALREADY_RECORDED');
      if (decision === 'promoted' || decision === 'repeat') {
        const [targetRows] = await conn.query<RowDataPacket[]>(
          `SELECT sec.id FROM sections sec
           JOIN grades target_grade ON target_grade.id = sec.grade_id
           JOIN grades source_grade ON source_grade.id = ?
           JOIN academic_years ay ON ay.id = sec.academic_year_id
           JOIN academic_years source_ay ON source_ay.id = ?
           WHERE sec.grade_id = ? AND sec.academic_year_id = ? AND sec.status = 'active'
             AND sec.deleted_at IS NULL AND ay.status <> 'closed'
             AND ay.start_date > source_ay.start_date
             AND target_grade.grade_level = source_grade.grade_level + ? LIMIT 1`,
          [enrollment.grade_id, enrollment.academic_year_id, toGradeId, toAcademicYearId, decision === 'repeat' ? 0 : 1]
        );
        if (!targetRows.length) throw new AppError('Destination grade has no active section in the selected academic year.', 409, 'PROMOTION_TARGET_UNAVAILABLE');
      }
      await conn.query(
        `INSERT INTO promotions
           (enrollment_id, decision, to_grade_id, to_academic_year_id, effective_date, remarks, decided_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [enrollmentId, decision, toGradeId, toAcademicYearId, effectiveDate, remarks || null, actor.userId]
      );
      const nextEnrollmentStatus = decision === 'promoted' ? 'promoted' : decision === 'repeat' ? 'repeated' : 'completed';
      await conn.query(
        `UPDATE enrollments SET status = ?, ended_on = ? WHERE id = ?`,
        [nextEnrollmentStatus, effectiveDate, enrollmentId]
      );
      if ((decision as string) === 'graduated') {
        await conn.query(`UPDATE students SET status = 'graduated' WHERE id = ?`, [enrollment.student_id]);
        await conn.query(
          `INSERT INTO student_status_history (student_id, status, effective_date, reason, changed_by)
           VALUES (?, 'graduated', ?, ?, ?)`,
          [enrollment.student_id, effectiveDate, remarks || 'Academic graduation decision', actor.userId]
        );
      }
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (?, ?, 'academic.promotion.record', 'promotions', ?, 'success', ?, ?)`,
        [actor.userId, actor.username, String(enrollmentId), JSON.stringify({ decision, toGradeId, toAcademicYearId }), remarks || null]
      );
      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      if ((err as { code?: string })?.code === 'ER_DUP_ENTRY') {
        throw new AppError('A promotion decision already exists for this enrollment.', 409, 'PROMOTION_ALREADY_RECORDED');
      }
      throw err;
    } finally {
      conn.release();
    }
  }

  async listProbations(academicYearId?: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT pr.*, e.academic_year_id, t.name AS term_name, ay.name AS academic_year_name,
              s.admission_no, CONCAT_WS(' ', s.first_name, s.father_name, s.grandfather_name) AS student_name,
              g.display_name AS grade_name, sec.name AS section_name,
              creator.username AS created_by_username, resolver.username AS resolved_by_username
       FROM academic_probation_records pr
       JOIN enrollments e ON e.id = pr.enrollment_id
       JOIN students s ON s.id = e.student_id
       JOIN sections sec ON sec.id = e.section_id
       JOIN grades g ON g.id = sec.grade_id
       JOIN terms t ON t.id = pr.term_id
       JOIN academic_years ay ON ay.id = t.academic_year_id
       JOIN users creator ON creator.id = pr.created_by
       LEFT JOIN users resolver ON resolver.id = pr.resolved_by
       WHERE (? IS NULL OR e.academic_year_id = ?)
       ORDER BY FIELD(pr.status, 'active', 'escalated', 'cleared'), pr.follow_up_date`,
      [academicYearId || null, academicYearId || null]
    );
    return rows;
  }

  async listProbationCandidates(termIdValue: unknown) {
    const termId = requirePositiveInteger(termIdValue, 'Term');
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT snap.enrollment_id, e.student_id, s.admission_no,
              CONCAT_WS(' ', s.first_name, s.father_name, s.grandfather_name) AS student_name,
              g.display_name AS grade_name, sec.name AS section_name,
              t.name AS term_name, snap.average_percent, p.probation_average,
              EXISTS (
                SELECT 1 FROM academic_probation_records pr
                WHERE pr.enrollment_id = e.id AND pr.term_id = t.id AND pr.status IN ('active', 'escalated')
              ) AS already_on_probation
       FROM report_card_snapshots snap
       JOIN result_publications rp ON rp.id = snap.publication_id AND rp.status = 'published'
       JOIN terms t ON t.id = snap.term_id
       JOIN enrollments e ON e.id = snap.enrollment_id AND e.status = 'active'
       JOIN students s ON s.id = e.student_id AND s.status = 'active' AND s.deleted_at IS NULL
       JOIN sections sec ON sec.id = e.section_id
       JOIN grades g ON g.id = sec.grade_id
       JOIN academic_progression_policies p ON p.academic_year_id = e.academic_year_id AND p.grade_id = g.id
       WHERE t.id = ? AND snap.average_percent IS NOT NULL
         AND snap.average_percent < p.probation_average
         AND snap.version = (
           SELECT MAX(s2.version) FROM report_card_snapshots s2
           JOIN result_publications rp2 ON rp2.id = s2.publication_id AND rp2.status = 'published'
           WHERE s2.enrollment_id = snap.enrollment_id AND s2.term_id = snap.term_id
         )
       ORDER BY snap.average_percent, s.admission_no`,
      [termId]
    );
    return rows;
  }

  async createProbation(payload: {
    enrollmentId: unknown; termId: unknown; reason: unknown; improvementPlan?: unknown; followUpDate?: unknown;
  }, actor: Actor) {
    const enrollmentId = requirePositiveInteger(payload.enrollmentId, 'Enrollment');
    const termId = requirePositiveInteger(payload.termId, 'Term');
    const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
    const improvementPlan = typeof payload.improvementPlan === 'string' ? payload.improvementPlan.trim() : '';
    const followUpDate = payload.followUpDate ? String(payload.followUpDate) : null;
    if (!reason || reason.length > 500) throw new AppError('A probation reason of up to 500 characters is required.', 400, 'PROBATION_REASON_REQUIRED');
    if (improvementPlan.length > 5000) throw new AppError('Improvement plan must be 5,000 characters or fewer.', 400, 'PROBATION_PLAN_TOO_LONG');
    if (followUpDate && (!/^\d{4}-\d{2}-\d{2}$/.test(followUpDate) || Number.isNaN(Date.parse(`${followUpDate}T00:00:00Z`)))) {
      throw new AppError('Follow-up date must be a valid date.', 400, 'INVALID_FOLLOW_UP_DATE');
    }
    const [scope] = await pool.query<RowDataPacket[]>(
      `SELECT e.id FROM enrollments e
       JOIN terms t ON t.id = ? AND t.academic_year_id = e.academic_year_id
       WHERE e.id = ? AND e.status = 'active'`, [termId, enrollmentId]
    );
    if (!scope.length) throw new AppError('Probation term and active enrollment must belong to the same academic year.', 409, 'PROBATION_SCOPE_MISMATCH');
    const [inserted] = await pool.query<ResultSetHeader>(
      `INSERT INTO academic_probation_records
         (enrollment_id, term_id, reason, improvement_plan, follow_up_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [enrollmentId, termId, reason, improvementPlan || null, followUpDate, actor.userId]
    );
    await this.audit(actor, 'academic.probation.create', 'academic_probation_records', String(inserted.insertId), { enrollmentId, termId, reason });
    return { id: inserted.insertId };
  }

  async updateProbation(idValue: unknown, status: unknown, actor: Actor) {
    const id = requirePositiveInteger(idValue, 'Probation record');
    if (status !== 'cleared' && status !== 'escalated') throw new AppError('Probation status must be cleared or escalated.', 400, 'INVALID_PROBATION_STATUS');
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE academic_probation_records
       SET status = ?, resolved_by = ?, resolved_at = NOW(3)
       WHERE id = ? AND status = 'active'`,
      [status, actor.userId, id]
    );
    if (!result.affectedRows) throw new AppError('Active probation record was not found.', 404, 'ACTIVE_PROBATION_NOT_FOUND');
    await this.audit(actor, `academic.probation.${status}`, 'academic_probation_records', String(id), {});
    return { success: true };
  }

  async evaluateGraduation(academicYearIdValue: unknown) {
    const academicYearId = requirePositiveInteger(academicYearIdValue, 'Academic year');
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT e.id AS enrollment_id, e.student_id, s.admission_no,
              CONCAT_WS(' ', s.first_name, s.father_name, s.grandfather_name) AS student_name,
              sec.name AS section_name, g.id AS grade_id,
              g.grade_level, g.display_name AS grade_name,
              p.minimum_average, p.maximum_failed_subjects, p.minimum_attendance_percent,
              (SELECT COUNT(*) FROM terms required_term
               WHERE required_term.academic_year_id = e.academic_year_id
                 AND required_term.status <> 'planned') AS expected_terms,
              (SELECT COUNT(DISTINCT snap.term_id)
               FROM report_card_snapshots snap
               JOIN result_publications rp ON rp.id = snap.publication_id AND rp.status = 'published'
               JOIN terms published_term ON published_term.id = snap.term_id
               WHERE snap.enrollment_id = e.id AND published_term.academic_year_id = e.academic_year_id) AS published_terms,
              (SELECT COUNT(*) FROM terms required_term
               WHERE required_term.academic_year_id = e.academic_year_id
                 AND required_term.status <> 'planned'
                 AND (SELECT COUNT(*) FROM academic_course_enrollments ce
                      WHERE ce.enrollment_id = e.id AND ce.term_id = required_term.id AND ce.status = 'approved')
                     < COALESCE(p.minimum_courses_per_term, 0)) AS course_terms_below_minimum,
              (SELECT COUNT(*) FROM terms required_term
               WHERE required_term.academic_year_id = e.academic_year_id
                 AND required_term.status <> 'planned'
                 AND EXISTS (
                   SELECT 1 FROM grade_subjects gs
                   WHERE gs.grade_id = sec.grade_id AND gs.is_compulsory = 1
                     AND (gs.academic_year_id IS NULL OR gs.academic_year_id = e.academic_year_id)
                     AND (gs.stream = 'all' OR gs.stream = sec.stream)
                     AND NOT EXISTS (
                       SELECT 1 FROM academic_course_enrollments ce
                       JOIN teaching_assignments course_ta ON course_ta.id = ce.teaching_assignment_id
                       WHERE ce.enrollment_id = e.id AND ce.term_id = required_term.id AND ce.status = 'approved'
                         AND course_ta.subject_id = gs.subject_id
                     )
                 )) AS terms_missing_compulsory_courses,
              (SELECT AVG(r.total_score) FROM results r
               JOIN result_publications rp ON rp.id = r.publication_id AND rp.status = 'published'
               JOIN terms t ON t.id = r.term_id AND t.academic_year_id = e.academic_year_id
               WHERE r.enrollment_id = e.id AND r.status = 'published' AND r.total_score IS NOT NULL) AS average_score,
              (SELECT COUNT(DISTINCT r.subject_id) FROM results r
               JOIN result_publications rp ON rp.id = r.publication_id AND rp.status = 'published'
               JOIN terms t ON t.id = r.term_id AND t.academic_year_id = e.academic_year_id
               WHERE r.enrollment_id = e.id AND r.status = 'published' AND r.is_pass = 0) AS failed_subjects,
              (SELECT COUNT(*) FROM attendance_records ar
               JOIN attendance_sessions ats ON ats.id = ar.session_id
               JOIN academic_years ay ON ay.id = e.academic_year_id
               WHERE ar.enrollment_id = e.id AND ats.attendance_date BETWEEN ay.start_date AND ay.end_date) AS attendance_total,
              (SELECT COUNT(*) FROM attendance_records ar
               JOIN attendance_sessions ats ON ats.id = ar.session_id
               JOIN attendance_statuses ast ON ast.code = ar.status_code
               JOIN academic_years ay ON ay.id = e.academic_year_id
               WHERE ar.enrollment_id = e.id AND ats.attendance_date BETWEEN ay.start_date AND ay.end_date
                 AND ast.counts_as_present = 1) AS attendance_present,
              EXISTS (SELECT 1 FROM academic_graduation_reviews gr WHERE gr.enrollment_id = e.id) AS review_exists
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN sections sec ON sec.id = e.section_id
       JOIN grades g ON g.id = sec.grade_id
       LEFT JOIN academic_progression_policies p ON p.academic_year_id = e.academic_year_id AND p.grade_id = g.id
       WHERE e.academic_year_id = ? AND e.status = 'active'
         AND g.grade_level = (SELECT MAX(grade_level) FROM grades WHERE is_active = 1)
       ORDER BY s.admission_no`,
      [academicYearId]
    );
    return rows.map((row) => {
      const reasons: string[] = [];
      if (Number(row.expected_terms || 0) === 0 || Number(row.published_terms || 0) < Number(row.expected_terms || 0)) {
        reasons.push('Published results are incomplete for the academic year.');
      }
      if (row.minimum_average === null) reasons.push('Graduation policy is not configured for this grade.');
      if (row.average_score === null) reasons.push('No published academic results are available.');
      if (row.average_score !== null && row.minimum_average !== null && Number(row.average_score) < Number(row.minimum_average)) reasons.push('Average is below the graduation threshold.');
      if (row.maximum_failed_subjects !== null && Number(row.failed_subjects || 0) > Number(row.maximum_failed_subjects)) reasons.push('Failed subject count exceeds the allowed limit.');
      if (Number(row.course_terms_below_minimum || 0) > 0) reasons.push('Minimum course enrollment is incomplete for one or more terms.');
      if (Number(row.terms_missing_compulsory_courses || 0) > 0) reasons.push('Compulsory curriculum courses are incomplete for one or more terms.');
      const attendanceTotal = Number(row.attendance_total || 0);
      const attendancePercent = attendanceTotal ? Number(row.attendance_present || 0) * 100 / attendanceTotal : null;
      if (attendancePercent === null) reasons.push('No attendance records are available.');
      if (attendancePercent !== null && row.minimum_attendance_percent !== null && attendancePercent < Number(row.minimum_attendance_percent)) reasons.push('Attendance is below the graduation threshold.');
      return {
        enrollmentId: Number(row.enrollment_id), studentId: Number(row.student_id),
        admissionNo: row.admission_no, studentName: row.student_name,
        sectionName: row.section_name, gradeName: row.grade_name,
        average: row.average_score === null ? null : Number(Number(row.average_score).toFixed(2)),
        failedSubjects: Number(row.failed_subjects || 0),
        attendancePercent: attendancePercent === null ? null : Number(attendancePercent.toFixed(2)),
        eligible: reasons.length === 0, reasons, reviewExists: Boolean(row.review_exists)
      };
    });
  }

  async listGraduationReviews(academicYearId?: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT gr.*, e.academic_year_id, ay.name AS academic_year_name, s.admission_no,
              CONCAT_WS(' ', s.first_name, s.father_name, s.grandfather_name) AS student_name,
              g.display_name AS grade_name, sec.name AS section_name, u.username AS reviewed_by_username
       FROM academic_graduation_reviews gr
       JOIN enrollments e ON e.id = gr.enrollment_id
       JOIN students s ON s.id = e.student_id
       JOIN sections sec ON sec.id = e.section_id
       JOIN grades g ON g.id = sec.grade_id
       JOIN academic_years ay ON ay.id = e.academic_year_id
       LEFT JOIN users u ON u.id = gr.reviewed_by
       WHERE (? IS NULL OR e.academic_year_id = ?)
       ORDER BY gr.updated_at DESC`,
      [academicYearId || null, academicYearId || null]
    );
    return rows;
  }

  async saveGraduationReview(payload: { enrollmentId: unknown; decision: unknown; note?: unknown }, actor: Actor) {
    const enrollmentId = requirePositiveInteger(payload.enrollmentId, 'Enrollment');
    if (!['approved', 'rejected'].includes(String(payload.decision))) {
      throw new AppError('Graduation decision must be approved or rejected.', 400, 'INVALID_GRADUATION_DECISION');
    }
    const decision = payload.decision as 'approved' | 'rejected';
    const note = typeof payload.note === 'string' ? payload.note.trim() : '';
    if (note.length > 500) throw new AppError('Graduation note must be 500 characters or fewer.', 400, 'GRADUATION_NOTE_TOO_LONG');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [enrollmentRows] = await conn.query<RowDataPacket[]>(
        `SELECT e.id, e.student_id, e.status FROM enrollments e WHERE e.id = ? FOR UPDATE`, [enrollmentId]
      );
      const enrollment = enrollmentRows[0];
      if (!enrollment || enrollment.status !== 'active') throw new AppError('Active enrollment was not found.', 404, 'ACTIVE_ENROLLMENT_NOT_FOUND');
      const [reviewRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, status FROM academic_graduation_reviews WHERE enrollment_id = ? FOR UPDATE`, [enrollmentId]
      );
      if (reviewRows[0]?.status === 'issued') throw new AppError('Graduation has already been issued.', 409, 'GRADUATION_ALREADY_ISSUED');
      if (decision === 'approved') {
        const graduationCandidates = await this.evaluateGraduation(Number(enrollment.academic_year_id));
        const candidate = graduationCandidates.find((item) => item.enrollmentId === enrollmentId);
        if (!candidate?.eligible) {
          throw new AppError('Student does not meet the configured graduation requirements.', 409, 'GRADUATION_REQUIREMENTS_NOT_MET');
        }
        const [eligibleRows] = await conn.query<RowDataPacket[]>(
          `SELECT e.id FROM enrollments e
           JOIN sections sec ON sec.id = e.section_id
           JOIN grades g ON g.id = sec.grade_id
           JOIN academic_progression_policies p ON p.academic_year_id = e.academic_year_id AND p.grade_id = g.id
           WHERE e.id = ? AND e.status = 'active'
             AND g.grade_level = (SELECT MAX(grade_level) FROM grades WHERE is_active = 1)
             AND (SELECT COUNT(*) FROM terms required_term
                  WHERE required_term.academic_year_id = e.academic_year_id
                    AND required_term.status <> 'planned') > 0
             AND (SELECT COUNT(*) FROM terms required_term
                  WHERE required_term.academic_year_id = e.academic_year_id
                    AND required_term.status <> 'planned') = (
                    SELECT COUNT(DISTINCT snap.term_id)
                    FROM report_card_snapshots snap
                    JOIN result_publications rp ON rp.id = snap.publication_id AND rp.status = 'published'
                    JOIN terms published_term ON published_term.id = snap.term_id
                    WHERE snap.enrollment_id = e.id AND published_term.academic_year_id = e.academic_year_id
                  )
             AND (SELECT AVG(r.total_score) FROM results r
                  JOIN result_publications rp ON rp.id = r.publication_id AND rp.status = 'published'
                  JOIN terms t ON t.id = r.term_id AND t.academic_year_id = e.academic_year_id
                  WHERE r.enrollment_id = e.id AND r.status = 'published' AND r.total_score IS NOT NULL) >= p.minimum_average
             AND (SELECT COUNT(*) FROM attendance_records ar
                  JOIN attendance_sessions ats ON ats.id = ar.session_id
                  JOIN academic_years ay ON ay.id = e.academic_year_id
                  WHERE ar.enrollment_id = e.id AND ats.attendance_date BETWEEN ay.start_date AND ay.end_date) > 0
             AND 100 * (SELECT COUNT(*) FROM attendance_records ar
                  JOIN attendance_sessions ats ON ats.id = ar.session_id
                  JOIN attendance_statuses ast ON ast.code = ar.status_code
                  JOIN academic_years ay ON ay.id = e.academic_year_id
                  WHERE ar.enrollment_id = e.id AND ats.attendance_date BETWEEN ay.start_date AND ay.end_date
                    AND ast.counts_as_present = 1)
                 / NULLIF((SELECT COUNT(*) FROM attendance_records ar
                  JOIN attendance_sessions ats ON ats.id = ar.session_id
                  JOIN academic_years ay ON ay.id = e.academic_year_id
                  WHERE ar.enrollment_id = e.id AND ats.attendance_date BETWEEN ay.start_date AND ay.end_date), 0)
                 >= p.minimum_attendance_percent
             AND EXISTS (
               SELECT 1 FROM results r
               JOIN result_publications rp ON rp.id = r.publication_id AND rp.status = 'published'
               WHERE r.enrollment_id = e.id AND r.status = 'published'
             )
             AND (SELECT COUNT(DISTINCT r.subject_id) FROM results r
               JOIN result_publications rp ON rp.id = r.publication_id AND rp.status = 'published'
               WHERE r.enrollment_id = e.id AND r.status = 'published' AND r.is_pass = 0
             ) <= p.maximum_failed_subjects`,
          [enrollmentId]
        );
        if (!eligibleRows.length) throw new AppError('Student is not eligible under the configured academic graduation policy.', 409, 'GRADUATION_REQUIREMENTS_NOT_MET');
      }
      if (reviewRows[0]) {
        await conn.query(
          `UPDATE academic_graduation_reviews
           SET status = ?, decision_note = ?, reviewed_by = ?, reviewed_at = NOW(3)
           WHERE id = ?`,
          [decision, note || null, actor.userId, reviewRows[0].id]
        );
      } else {
        await conn.query(
          `INSERT INTO academic_graduation_reviews
             (enrollment_id, status, decision_note, reviewed_by, reviewed_at)
           VALUES (?, ?, ?, ?, NOW(3))`,
          [enrollmentId, decision, note || null, actor.userId]
        );
      }
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (?, ?, 'academic.graduation.review', 'academic_graduation_reviews', ?, 'success', ?, ?)`,
        [actor.userId, actor.username, String(enrollmentId), JSON.stringify({ decision }), note || null]
      );
      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async issueGraduationCertificate(enrollmentIdValue: unknown, certificateNumberValue: unknown, actor: Actor) {
    const enrollmentId = requirePositiveInteger(enrollmentIdValue, 'Enrollment');
    const certificateNumber = typeof certificateNumberValue === 'string' ? certificateNumberValue.trim() : '';
    if (!certificateNumber || certificateNumber.length > 60) {
      throw new AppError('A unique certificate number of up to 60 characters is required.', 400, 'CERTIFICATE_NUMBER_REQUIRED');
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [reviews] = await conn.query<RowDataPacket[]>(
        `SELECT gr.id, gr.status, e.student_id, e.status AS enrollment_status, s.status AS student_status
         FROM academic_graduation_reviews gr
         JOIN enrollments e ON e.id = gr.enrollment_id
         JOIN students s ON s.id = e.student_id
         WHERE gr.enrollment_id = ? FOR UPDATE`, [enrollmentId]
      );
      if (!reviews[0] || reviews[0].status !== 'approved') {
        throw new AppError('Only an approved graduation review can be issued.', 409, 'GRADUATION_NOT_APPROVED');
      }
      await conn.query(
        `UPDATE academic_graduation_reviews
         SET status = 'issued', certificate_number = ?, reviewed_by = ?, reviewed_at = NOW(3)
         WHERE id = ?`,
        [certificateNumber, actor.userId, reviews[0].id]
      );
      const [priorPromotion] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM promotions WHERE enrollment_id = ? FOR UPDATE`, [enrollmentId]
      );
      if (priorPromotion.length) {
        throw new AppError('A promotion/retention decision already exists for this enrollment.', 409, 'PROMOTION_ALREADY_RECORDED');
      }
      await conn.query(
        `INSERT INTO promotions (enrollment_id, decision, effective_date, remarks, decided_by)
         VALUES (?, 'graduated', CURDATE(), ?, ?)`,
        [enrollmentId, `Certificate ${certificateNumber} issued`, actor.userId]
      );
      await conn.query(`UPDATE enrollments SET status = 'completed', ended_on = CURDATE() WHERE id = ?`, [enrollmentId]);
      await conn.query(`UPDATE students SET status = 'graduated' WHERE id = ?`, [reviews[0].student_id]);
      await conn.query(
        `INSERT INTO student_status_history (student_id, status, effective_date, reason, changed_by)
         VALUES (?, 'graduated', CURDATE(), ?, ?)`,
        [reviews[0].student_id, `Graduation certificate ${certificateNumber} issued`, actor.userId]
      );
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes)
         VALUES (?, ?, 'academic.graduation.issue', 'academic_graduation_reviews', ?, 'success', ?)`,
        [actor.userId, actor.username, String(reviews[0].id), JSON.stringify({ certificateNumber, studentId: reviews[0].student_id })]
      );
      await conn.commit();
      return { success: true };
    } catch (err) {
      await conn.rollback();
      if ((err as { code?: string })?.code === 'ER_DUP_ENTRY') {
        throw new AppError('Certificate number has already been used.', 409, 'DUPLICATE_CERTIFICATE_NUMBER');
      }
      throw err;
    } finally {
      conn.release();
    }
  }

  private async audit(actor: Actor, action: string, entityType: string, entityId: string, changes: unknown) {
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes)
       VALUES (?, ?, ?, ?, ?, 'success', ?)`,
      [actor.userId, actor.username, action, entityType, entityId, JSON.stringify(changes)]
    );
  }
}
