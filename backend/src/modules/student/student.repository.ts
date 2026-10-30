import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { createHash, randomUUID } from 'crypto';
import path from 'path';
import { mkdir, writeFile, readFile } from 'fs/promises';

export class StudentRepository {
  async getStudentByUserId(userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id,
         s.admission_no,
         s.first_name,
         s.father_name,
         s.grandfather_name,
         s.gender,
         s.date_of_birth,
         s.nationality,
         s.phone,
         s.email,
         s.region,
         s.city,
         s.address,
         s.photo_document_id,
         s.admission_date,
         s.status as student_status,
         e.id as enrollment_id,
         e.roll_no,
         e.status as enrollment_status,
         sec.id as section_id,
         sec.name as section_name,
         sec.stream,
         g.grade_level,
         g.display_name as grade_name,
         ay.id as academic_year_id,
         ay.name as academic_year_name
       FROM students s
       LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       LEFT JOIN sections sec ON e.section_id = sec.id
       LEFT JOIN grades g ON sec.grade_id = g.id
       LEFT JOIN academic_years ay ON sec.academic_year_id = ay.id
       WHERE s.user_id = ?
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }

  async getStudentById(studentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id,
         s.admission_no,
         s.first_name,
         s.father_name,
         s.grandfather_name,
         s.gender,
         s.date_of_birth,
         s.nationality,
         s.phone,
         s.email,
         s.admission_date,
         s.status as student_status,
         e.id as enrollment_id,
         e.roll_no,
         e.status as enrollment_status,
         sec.id as section_id,
         sec.name as section_name,
         sec.stream,
         g.grade_level,
         g.display_name as grade_name,
         ay.id as academic_year_id,
         ay.name as academic_year_name
       FROM students s
       LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       LEFT JOIN sections sec ON e.section_id = sec.id
       LEFT JOIN grades g ON sec.grade_id = g.id
       LEFT JOIN academic_years ay ON sec.academic_year_id = ay.id
       WHERE s.id = ?
       LIMIT 1`,
      [studentId]
    );
    return rows[0] || null;
  }

  async getTimetableForSection(sectionId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         te.id,
         ts.day_of_week,
         ts.start_time,
         ts.end_time,
         ts.label as slot_label,
         sub.id as subject_id,
         sub.name as subject_name,
         sub.code as subject_code,
         cr.name as room_name,
         cr.building,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name
       FROM timetable_entries te
       JOIN time_slots ts ON te.time_slot_id = ts.id
       JOIN subjects sub ON te.subject_id = sub.id
       JOIN staff st ON te.staff_id = st.id
       LEFT JOIN classrooms cr ON te.room_id = cr.id
       WHERE te.section_id = ?
       ORDER BY ts.day_of_week, ts.start_time`,
      [sectionId]
    );
    return rows;
  }

  async getAttendanceHistory(enrollmentId: number) {
    const [records] = await pool.query<RowDataPacket[]>(
      `SELECT 
         ar.id,
         s.attendance_date,
         ar.status_code,
         ar.note,
         sub.name as subject_name
       FROM attendance_records ar
       JOIN attendance_sessions s ON ar.session_id = s.id
       LEFT JOIN subjects sub ON s.subject_id = sub.id
       WHERE ar.enrollment_id = ?
       ORDER BY s.attendance_date DESC`,
      [enrollmentId]
    );

    const total = records.length;
    const present = records.filter((r) => r.status_code === 'present').length;
    const absent = records.filter((r) => r.status_code === 'absent').length;
    const late = records.filter((r) => r.status_code === 'late').length;
    const excused = records.filter((r) => r.status_code === 'excused').length;
    const rate = total > 0 ? Number(((present / total) * 100).toFixed(1)) : 100.0;

    return {
      summary: { total, present, absent, late, excused, rate },
      records
    };
  }

  async getStudentMarks(enrollmentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         m.id as mark_id,
         m.score,
         m.feedback,
         m.status as mark_status,
         a.id as assessment_id,
         a.title as assessment_title,
         a.max_score,
         a.weight,
         a.assessment_date,
         at.name as assessment_type,
         sub.name as subject_name,
         sub.code as subject_code,
         t.name as term_name
       FROM marks m
       JOIN assessments a ON m.assessment_id = a.id
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       JOIN assessment_types at ON a.assessment_type_id = at.id
       LEFT JOIN terms t ON a.term_id = t.id
       WHERE m.enrollment_id = ?
       ORDER BY a.assessment_date DESC`,
      [enrollmentId]
    );
    return rows.map((r) => {
      const scoreNum = r.score !== null ? Number(r.score) : null;
      const maxNum = Number(r.max_score);
      const percentage = scoreNum !== null && maxNum > 0 ? Number(((scoreNum / maxNum) * 100).toFixed(1)) : null;
      return {
        ...r,
        percentage
      };
    });
  }

  async getAssignments(sectionId: number, enrollmentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         a.id,
         a.title,
         a.instructions,
         a.due_at,
         a.max_score,
         a.status as assignment_status,
         sub.name as subject_name,
         sub.code as subject_code,
         s.id as submission_id,
         s.submitted_at,
         s.status as submission_status,
         s.score as obtained_score,
         s.feedback
       FROM assignments a
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       LEFT JOIN submissions s ON a.id = s.assignment_id AND s.enrollment_id = ?
       WHERE ta.section_id = ? AND a.status = 'published'
       ORDER BY a.due_at ASC`,
      [enrollmentId, sectionId]
    );
    return rows;
  }

  async getReportCardSnapshot(enrollmentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         rcs.id,
         rcs.class_rank,
         rcs.class_size,
         rcs.average_percent,
         rcs.payload_json,
         rcs.generated_at,
         t.name as term_name
       FROM report_card_snapshots rcs
       JOIN terms t ON rcs.term_id = t.id
       WHERE rcs.enrollment_id = ?
       ORDER BY rcs.generated_at DESC
       LIMIT 1`,
      [enrollmentId]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: row.id,
      classRank: row.class_rank,
      classSize: row.class_size,
      averagePercent: Number(row.average_percent),
      termName: row.term_name,
      generatedAt: row.generated_at,
      details: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json
    };
  }

  async getAnnouncements() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT a.id, a.title, a.body, a.published_at
       FROM announcements a
       WHERE a.status = 'published' AND a.deleted_at IS NULL AND (a.expires_at IS NULL OR a.expires_at >= NOW(3))
         AND (NOT EXISTS (SELECT 1 FROM announcement_targets any_target WHERE any_target.announcement_id = a.id)
           OR EXISTS (SELECT 1 FROM announcement_targets target LEFT JOIN roles r ON r.id = target.target_id
             WHERE target.announcement_id = a.id AND (target.target_type = 'all' OR (target.target_type = 'role' AND r.code = 'student'))))
       ORDER BY published_at DESC 
       LIMIT 10`
    );
    return rows;
  }

  async getActiveSessions(userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, token_hash, ip_address, user_agent, issued_at, last_seen_at, expires_at
       FROM refresh_sessions
       WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW(3)
       ORDER BY last_seen_at DESC, issued_at DESC`,
      [userId]
    );
    return rows;
  }

  async revokeSession(userId: number, sessionId: number): Promise<boolean> {
    const [res]: any = await pool.query(
      `UPDATE refresh_sessions
       SET revoked_at = NOW(3), revoked_reason = 'logout'
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
      [sessionId, userId]
    );
    return res.affectedRows > 0;
  }

  async revokeOtherSessions(userId: number, currentTokenHash: string): Promise<number> {
    const [res]: any = await pool.query(
      `UPDATE refresh_sessions
       SET revoked_at = NOW(3), revoked_reason = 'logout'
       WHERE user_id = ? AND token_hash != ? AND revoked_at IS NULL`,
      [userId, currentTokenHash]
    );
    return res.affectedRows;
  }

  async getPreferences(userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT value_json FROM system_settings WHERE setting_key = ? LIMIT 1`,
      [`user.preferences.${userId}`]
    );
    if (rows.length === 0) return null;
    return typeof rows[0].value_json === 'string' ? JSON.parse(rows[0].value_json) : rows[0].value_json;
  }

  async savePreferences(userId: number, preferences: any): Promise<void> {
    const key = `user.preferences.${userId}`;
    const jsonStr = JSON.stringify(preferences);
    await pool.query(
      `INSERT INTO system_settings (setting_key, value_json, description, updated_by)
       VALUES (?, ?, 'Student portal user UI preferences', ?)
       ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_by = VALUES(updated_by), updated_at = NOW(3)`,
      [key, jsonStr, userId]
    );
  }

  // ==========================================
  // PAGE 2: SUBJECTS & MATERIALS REPOSITORY METHODS
  // ==========================================

  async getStudentSubjects(sectionId: number, gradeId: number, academicYearId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name,
         sub.name_am,
         sub.description,
         ta.id as teaching_assignment_id,
         ta.staff_id,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
         st.email as teacher_email,
         st.phone as teacher_phone,
         COALESCE(gs.periods_per_week, 3) as periods_per_week,
         COALESCE(gs.stream, 'all') as stream,
         COALESCE(gs.is_compulsory, 1) as is_compulsory,
         sgr.pass_mark,
         (
           SELECT COUNT(*) 
           FROM learning_resources lr 
           WHERE lr.teaching_assignment_id = ta.id 
             AND (lr.visibility = 'section' OR lr.visibility IS NULL)
         ) as materials_count,
         (
           SELECT COUNT(*) 
           FROM assignments a 
           WHERE a.teaching_assignment_id = ta.id 
             AND a.status = 'published'
         ) as assignments_count
       FROM teaching_assignments ta
       JOIN subjects sub ON ta.subject_id = sub.id
       JOIN staff st ON ta.staff_id = st.id
       LEFT JOIN grade_subjects gs ON gs.subject_id = sub.id 
         AND gs.grade_id = ? 
         AND gs.academic_year_id = ?
       LEFT JOIN subject_grading_rules sgr ON sgr.subject_id = sub.id 
         AND sgr.grade_id = ?
       WHERE ta.section_id = ? AND ta.is_active = 1 AND sub.status = 'active'
       ORDER BY sub.name ASC`,
      [gradeId, academicYearId, gradeId, sectionId]
    );
    return rows;
  }

  async getSubjectDetail(
    sectionId: number,
    subjectId: number,
    gradeId: number,
    academicYearId: number,
    enrollmentId: number | null
  ) {
    // 1. Verify subject belongs to student's section
    const [taRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         ta.id as teaching_assignment_id,
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name,
         sub.name_am,
         sub.description,
         ta.staff_id,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
         st.email as teacher_email,
         st.phone as teacher_phone,
         st.job_title as teacher_title,
         st.department as teacher_department,
         COALESCE(gs.periods_per_week, 3) as periods_per_week,
         COALESCE(gs.stream, 'all') as stream,
         COALESCE(gs.is_compulsory, 1) as is_compulsory,
         sgr.pass_mark,
         sgr.missing_mark_rule
       FROM teaching_assignments ta
       JOIN subjects sub ON ta.subject_id = sub.id
       JOIN staff st ON ta.staff_id = st.id
       LEFT JOIN grade_subjects gs ON gs.subject_id = sub.id 
         AND gs.grade_id = ? 
         AND gs.academic_year_id = ?
       LEFT JOIN subject_grading_rules sgr ON sgr.subject_id = sub.id 
         AND sgr.grade_id = ?
       WHERE ta.section_id = ? AND sub.id = ? AND ta.is_active = 1
       LIMIT 1`,
      [gradeId, academicYearId, gradeId, sectionId, subjectId]
    );

    if (taRows.length === 0) {
      return null;
    }

    const subjectInfo = taRows[0];
    const teachingAssignmentId = subjectInfo.teaching_assignment_id;

    // 2. Published assignments for this subject
    const [assignments] = await pool.query<RowDataPacket[]>(
      `SELECT 
         a.id,
         a.title,
         a.instructions,
         a.due_at,
         a.allow_late,
         a.max_score,
         a.status,
         a.published_at,
         t.name as term_name
       FROM assignments a
       LEFT JOIN terms t ON a.term_id = t.id
       WHERE a.teaching_assignment_id = ? AND a.status = 'published'
       ORDER BY a.due_at DESC`,
      [teachingAssignmentId]
    );

    // 3. Learning resources for this subject
    const [materials] = await pool.query<RowDataPacket[]>(
      `SELECT 
         lr.id,
         lr.title,
         lr.description,
         lr.url,
         lr.visibility,
         lr.created_at,
         d.id as document_id,
         d.original_name,
         d.mime_type,
         d.size_bytes,
         CONCAT_WS(' ', st.first_name, st.father_name) as uploaded_by_name
       FROM learning_resources lr
       JOIN staff st ON lr.created_by = st.user_id OR lr.created_by = st.id
       LEFT JOIN documents d ON lr.document_id = d.id AND d.deleted_at IS NULL
       WHERE lr.teaching_assignment_id = ? 
         AND (lr.visibility = 'section' OR lr.visibility IS NULL)
       ORDER BY lr.created_at DESC`,
      [teachingAssignmentId]
    );

    // 4. Published results for this student in this subject (NEVER expose draft marks)
    let publishedResults: RowDataPacket[] = [];
    if (enrollmentId) {
      const [res] = await pool.query<RowDataPacket[]>(
        `SELECT 
           r.id,
           r.total_score,
           r.letter_grade,
           r.grade_points,
           r.is_pass,
           r.subject_rank,
           t.name as term_name,
           rp.published_at
         FROM results r
         JOIN result_publications rp ON r.publication_id = rp.id
         JOIN terms t ON r.term_id = t.id
         WHERE r.enrollment_id = ? 
           AND r.subject_id = ? 
           AND r.status = 'published' 
           AND rp.status = 'published'
         ORDER BY t.start_date DESC`,
        [enrollmentId, subjectId]
      );
      publishedResults = res;
    }

    return {
      subject: subjectInfo,
      assignments,
      materials,
      published_results: publishedResults
    };
  }

  async getLearningMaterials(
    sectionId: number,
    subjectId?: number,
    search?: string
  ) {
    let query = `
      SELECT 
        lr.id,
        lr.title,
        lr.description,
        lr.url,
        lr.visibility,
        lr.created_at,
        sub.id as subject_id,
        sub.code as subject_code,
        sub.name as subject_name,
        d.id as document_id,
        d.original_name,
        d.mime_type,
        d.size_bytes,
        CONCAT_WS(' ', st.first_name, st.father_name) as uploaded_by_name
      FROM learning_resources lr
      JOIN teaching_assignments ta ON lr.teaching_assignment_id = ta.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN staff st ON ta.staff_id = st.id
      LEFT JOIN documents d ON lr.document_id = d.id AND d.deleted_at IS NULL
      WHERE ta.section_id = ? 
        AND (lr.visibility = 'section' OR lr.visibility IS NULL)
    `;
    const params: any[] = [sectionId];

    if (subjectId && !isNaN(subjectId)) {
      query += ` AND sub.id = ?`;
      params.push(subjectId);
    }

    if (search && search.trim()) {
      query += ` AND (lr.title LIKE ? OR lr.description LIKE ? OR sub.name LIKE ? OR sub.code LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY lr.created_at DESC`;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  async getMaterialDownload(sectionId: number, resourceId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         lr.id,
         lr.title,
         lr.url,
         d.id as document_id,
         d.original_name,
         d.storage_key,
         d.mime_type,
         d.size_bytes
       FROM learning_resources lr
       JOIN teaching_assignments ta ON lr.teaching_assignment_id = ta.id
       LEFT JOIN documents d ON lr.document_id = d.id
       WHERE lr.id = ? 
         AND ta.section_id = ? 
         AND (lr.visibility = 'section' OR lr.visibility IS NULL)
         AND (d.deleted_at IS NULL OR d.id IS NULL)
       LIMIT 1`,
      [resourceId, sectionId]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0];
  }

  // ==========================================
  // PAGE 3: TIMETABLE & CALENDAR
  // ==========================================

  async getWeeklyTimetable(sectionId: number, termId?: number) {
    let query = `
      SELECT 
        te.id,
        te.term_id,
        te.section_id,
        ts.id as time_slot_id,
        ts.day_of_week,
        ts.start_time,
        ts.end_time,
        ts.label as slot_label,
        sub.id as subject_id,
        sub.name as subject_name,
        sub.code as subject_code,
        sub.name_am as subject_name_am,
        cr.id as room_id,
        cr.name as room_name,
        cr.building,
        st.id as staff_id,
        CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
        st.email as teacher_email
      FROM timetable_entries te
      JOIN time_slots ts ON te.time_slot_id = ts.id
      JOIN subjects sub ON te.subject_id = sub.id
      JOIN staff st ON te.staff_id = st.id
      LEFT JOIN classrooms cr ON te.room_id = cr.id
      WHERE te.section_id = ?
    `;
    const params: any[] = [sectionId];
    if (termId) {
      query += ` AND te.term_id = ?`;
      params.push(termId);
    }
    query += ` ORDER BY ts.day_of_week ASC, ts.start_time ASC`;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  async getAcademicCalendar(academicYearId: number, eventType?: string) {
    let query = `
      SELECT 
        ce.id,
        ce.academic_year_id,
        ce.title,
        ce.event_type,
        ce.start_date,
        ce.end_date,
        ce.description,
        ay.name as academic_year_name
      FROM calendar_events ce
      JOIN academic_years ay ON ce.academic_year_id = ay.id
      WHERE ce.academic_year_id = ?
    `;
    const params: any[] = [academicYearId];
    if (eventType && eventType !== 'all') {
      query += ` AND ce.event_type = ?`;
      params.push(eventType);
    }
    query += ` ORDER BY ce.start_date ASC`;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  async getAcademicTerms(academicYearId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, academic_year_id, term_no, name, start_date, end_date, status, is_current
       FROM terms
       WHERE academic_year_id = ?
       ORDER BY term_no ASC`,
      [academicYearId]
    );
    return rows;
  }

  async getExamSchedule(sectionId: number, termId?: number) {
    let query = `
      SELECT 
        a.id,
        a.title,
        a.assessment_type_id,
        at.code as assessment_type_code,
        at.name as assessment_type_name,
        a.max_score,
        a.weight,
        a.assessment_date,
        a.status,
        t.id as term_id,
        t.name as term_name,
        sub.id as subject_id,
        sub.code as subject_code,
        sub.name as subject_name,
        CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
        sec.name as section_name
      FROM assessments a
      JOIN assessment_types at ON a.assessment_type_id = at.id
      JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN staff st ON ta.staff_id = st.id
      JOIN sections sec ON ta.section_id = sec.id
      LEFT JOIN terms t ON a.term_id = t.id
      WHERE ta.section_id = ?
        AND at.code IN ('mid_exam', 'final_exam', 'test')
        AND a.status IN ('open', 'closed')
    `;
    const params: any[] = [sectionId];
    if (termId) {
      query += ` AND a.term_id = ?`;
      params.push(termId);
    }
    query += ` ORDER BY a.assessment_date ASC, a.id ASC`;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  // ==========================================
  // PAGE 4: ATTENDANCE REPOSITORY METHODS
  // ==========================================

  async getDetailedAttendanceSummary(enrollmentId: number, termId?: number) {
    let whereClause = `WHERE ar.enrollment_id = ?`;
    const params: any[] = [enrollmentId];

    if (termId && !isNaN(termId)) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM terms t
        WHERE t.id = ? AND s.attendance_date BETWEEN t.start_date AND t.end_date
      )`;
      params.push(termId);
    }

    const [records] = await pool.query<RowDataPacket[]>(
      `SELECT 
         ar.id,
         ar.status_code,
         ar.note,
         s.id as session_id,
         s.attendance_date,
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name
       FROM attendance_records ar
       JOIN attendance_sessions s ON ar.session_id = s.id
       LEFT JOIN subjects sub ON s.subject_id = sub.id
       ${whereClause}
       ORDER BY s.attendance_date ASC`,
      params
    );

    const total = records.length;
    const present = records.filter((r) => r.status_code === 'present').length;
    const late = records.filter((r) => r.status_code === 'late').length;
    const absent = records.filter((r) => r.status_code === 'absent').length;
    const excused = records.filter((r) => r.status_code === 'excused').length;

    // Monthly breakdown
    const monthMap = new Map<string, { month: string; monthLabel: string; total: number; present: number; late: number; absent: number; excused: number }>();
    for (const r of records) {
      const d = new Date(r.attendance_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (!monthMap.has(key)) {
        monthMap.set(key, { month: key, monthLabel: label, total: 0, present: 0, late: 0, absent: 0, excused: 0 });
      }
      const entry = monthMap.get(key)!;
      entry.total++;
      if (r.status_code === 'present') entry.present++;
      else if (r.status_code === 'late') entry.late++;
      else if (r.status_code === 'absent') entry.absent++;
      else if (r.status_code === 'excused') entry.excused++;
    }

    const monthlyBreakdown = Array.from(monthMap.values()).map((m) => {
      const rate = m.total > 0 ? Number((((m.present + m.late) / m.total) * 100).toFixed(1)) : 100.0;
      return { ...m, rate };
    });

    // Subject breakdown
    const subjectMap = new Map<string, { subjectId: number; subjectCode: string; subjectName: string; total: number; present: number; late: number; absent: number; excused: number }>();
    for (const r of records) {
      const sId = r.subject_id || 0;
      const sName = r.subject_name || 'Daily Homeroom Roll Call';
      const sCode = r.subject_code || 'ROLL';
      const key = String(sId);
      if (!subjectMap.has(key)) {
        subjectMap.set(key, { subjectId: sId, subjectCode: sCode, subjectName: sName, total: 0, present: 0, late: 0, absent: 0, excused: 0 });
      }
      const entry = subjectMap.get(key)!;
      entry.total++;
      if (r.status_code === 'present') entry.present++;
      else if (r.status_code === 'late') entry.late++;
      else if (r.status_code === 'absent') entry.absent++;
      else if (r.status_code === 'excused') entry.excused++;
    }

    const subjectBreakdown = Array.from(subjectMap.values()).map((s) => {
      const rate = s.total > 0 ? Number((((s.present + s.late) / s.total) * 100).toFixed(1)) : 100.0;
      return { ...s, rate };
    });

    return {
      total,
      present,
      late,
      absent,
      excused,
      monthlyBreakdown,
      subjectBreakdown
    };
  }

  async getAttendanceRecordsPaginated(
    enrollmentId: number,
    filters?: {
      statusCode?: string;
      month?: string;
      termId?: number;
      subjectId?: number;
      fromDate?: string;
      toDate?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    let whereClause = `WHERE ar.enrollment_id = ?`;
    const params: any[] = [enrollmentId];

    if (filters?.statusCode && filters.statusCode !== 'all') {
      whereClause += ` AND ar.status_code = ?`;
      params.push(filters.statusCode);
    }

    if (filters?.month) {
      whereClause += ` AND DATE_FORMAT(s.attendance_date, '%Y-%m') = ?`;
      params.push(filters.month);
    }

    if (filters?.fromDate) {
      whereClause += ` AND s.attendance_date >= ?`;
      params.push(filters.fromDate);
    }

    if (filters?.toDate) {
      whereClause += ` AND s.attendance_date <= ?`;
      params.push(filters.toDate);
    }

    if (filters?.subjectId && !isNaN(filters.subjectId)) {
      whereClause += ` AND s.subject_id = ?`;
      params.push(filters.subjectId);
    }

    if (filters?.termId && !isNaN(filters.termId)) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM terms t
        WHERE t.id = ? AND s.attendance_date BETWEEN t.start_date AND t.end_date
      )`;
      params.push(filters.termId);
    }

    // Count query
    const [countRes] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as total
       FROM attendance_records ar
       JOIN attendance_sessions s ON ar.session_id = s.id
       ${whereClause}`,
      params
    );
    const totalCount = countRes[0]?.total || 0;

    // Rows query
    let query = `
      SELECT 
        ar.id,
        ar.status_code,
        ar.note,
        ast.name as status_name,
        ast.counts_as_present,
        ast.is_excused,
        s.id as session_id,
        s.attendance_date,
        s.time_slot_id,
        ts.label as period_label,
        ts.start_time as period_start,
        ts.end_time as period_end,
        sub.id as subject_id,
        sub.name as subject_name,
        sub.code as subject_code,
        (ar.updated_at > DATE_ADD(ar.created_at, INTERVAL 2 SECOND)) as is_corrected,
        COALESCE(CONCAT_WS(' ', st.first_name, st.father_name), u.username, 'Teacher') as marked_by_name
      FROM attendance_records ar
      JOIN attendance_sessions s ON ar.session_id = s.id
      JOIN attendance_statuses ast ON ar.status_code = ast.code
      LEFT JOIN time_slots ts ON s.time_slot_id = ts.id
      LEFT JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN users u ON ar.marked_by = u.id
      LEFT JOIN staff st ON u.id = st.user_id
      ${whereClause}
      ORDER BY s.attendance_date DESC, ar.id DESC
    `;

    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return {
      records: rows,
      totalCount
    };
  }

  // ==========================================
  // PAGE 5: ASSIGNMENTS & ASSESSMENTS
  // ==========================================

  async getUpcomingAssignments(sectionId: number, enrollmentId: number, filters?: { subjectId?: number; type?: string }) {
    let whereClause = `WHERE ta.section_id = ? AND a.status = 'published'`;
    const params: any[] = [enrollmentId, sectionId];

    if (filters?.subjectId && !isNaN(filters.subjectId)) {
      whereClause += ` AND sub.id = ?`;
      params.push(filters.subjectId);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         a.id,
         a.title,
         a.instructions,
         a.due_at,
         a.allow_late,
         a.max_score,
         a.status as assignment_status,
         'assignment' as type,
         'Homework / Assignment' as type_name,
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
         s.id as submission_id,
         s.submitted_at,
         s.status as submission_status,
         s.score as obtained_score,
         s.feedback,
         s.document_id,
         d.original_name as file_name
       FROM assignments a
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       JOIN staff st ON ta.staff_id = st.id
       LEFT JOIN submissions s ON a.id = s.assignment_id AND s.enrollment_id = ?
       LEFT JOIN documents d ON s.document_id = d.id AND d.deleted_at IS NULL
       ${whereClause}
       ORDER BY a.due_at ASC`,
      params
    );

    // Also fetch upcoming open assessments/quizzes/tests from assessments table
    let testWhere = `WHERE ta.section_id = ? AND ast.status = 'open' AND ast.assessment_date >= CURDATE()`;
    const testParams: any[] = [enrollmentId, sectionId];
    if (filters?.subjectId && !isNaN(filters.subjectId)) {
      testWhere += ` AND sub.id = ?`;
      testParams.push(filters.subjectId);
    }

    const [testRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         ast.id,
         ast.title,
         CONCAT('Continuous assessment: ', at.name) as instructions,
         CONCAT(ast.assessment_date, ' 17:00:00') as due_at,
         0 as allow_late,
         ast.max_score,
         ast.status as assignment_status,
         at.code as type,
         at.name as type_name,
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
         m.id as submission_id,
         m.created_at as submitted_at,
         IF(m.id IS NOT NULL, 'graded', 'pending') as submission_status,
         m.score as obtained_score,
         m.feedback,
         NULL as document_id,
         NULL as file_name
       FROM assessments ast
       JOIN assessment_types at ON ast.assessment_type_id = at.id
       JOIN teaching_assignments ta ON ast.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       JOIN staff st ON ta.staff_id = st.id
       LEFT JOIN marks m ON ast.id = m.assessment_id AND m.enrollment_id = ?
       ${testWhere}
       ORDER BY ast.assessment_date ASC`,
      testParams
    );

    let combined = [...rows, ...testRows];
    if (filters?.type && filters.type !== 'all') {
      combined = combined.filter((c) => c.type === filters.type);
    }
    return combined;
  }

  async getPastAssessments(sectionId: number, enrollmentId: number, filters?: { termId?: number; subjectId?: number }) {
    let assignWhere = `WHERE ta.section_id = ? AND a.status != 'draft' AND (a.due_at < NOW(3) OR a.status = 'archived')`;
    const assignParams: any[] = [enrollmentId, sectionId];

    if (filters?.subjectId && !isNaN(filters.subjectId)) {
      assignWhere += ` AND sub.id = ?`;
      assignParams.push(filters.subjectId);
    }
    if (filters?.termId && !isNaN(filters.termId)) {
      assignWhere += ` AND a.term_id = ?`;
      assignParams.push(filters.termId);
    }

    let testWhere = `WHERE ta.section_id = ? AND ast.status != 'draft' AND (ast.assessment_date < CURDATE() OR ast.status = 'closed')`;
    const testParams: any[] = [enrollmentId, sectionId];

    if (filters?.subjectId && !isNaN(filters.subjectId)) {
      testWhere += ` AND sub.id = ?`;
      testParams.push(filters.subjectId);
    }
    if (filters?.termId && !isNaN(filters.termId)) {
      testWhere += ` AND ast.term_id = ?`;
      testParams.push(filters.termId);
    }

    const sql = `
      SELECT 
        a.id,
        a.title,
        'assignment' as type_code,
        'Assignment' as type_name,
        a.due_at,
        a.due_at as assessment_date,
        a.max_score,
        NULL as weight,
        t.id as term_id,
        t.name as term_name,
        sub.id as subject_id,
        sub.code as subject_code,
        sub.name as subject_name,
        CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
        s.id as submission_id,
        s.submitted_at,
        s.score as obtained_score,
        s.feedback,
        1 as is_published
      FROM assignments a
      JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN staff st ON ta.staff_id = st.id
      LEFT JOIN terms t ON a.term_id = t.id
      LEFT JOIN submissions s ON a.id = s.assignment_id AND s.enrollment_id = ?
      ${assignWhere}

      UNION ALL

      SELECT 
        ast.id,
        ast.title,
        at.code as type_code,
        at.name as type_name,
        ast.assessment_date as due_at,
        ast.assessment_date,
        ast.max_score,
        ast.weight,
        t.id as term_id,
        t.name as term_name,
        sub.id as subject_id,
        sub.code as subject_code,
        sub.name as subject_name,
        CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
        m.id as submission_id,
        m.created_at as submitted_at,
        IF(ast.status != 'draft', m.score, NULL) as obtained_score,
        IF(ast.status != 'draft', m.feedback, NULL) as feedback,
        IF(ast.status != 'draft', 1, 0) as is_published
      FROM assessments ast
      JOIN assessment_types at ON ast.assessment_type_id = at.id
      JOIN teaching_assignments ta ON ast.teaching_assignment_id = ta.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN staff st ON ta.staff_id = st.id
      LEFT JOIN terms t ON ast.term_id = t.id
      LEFT JOIN marks m ON ast.id = m.assessment_id AND m.enrollment_id = ?
      ${testWhere}

      ORDER BY due_at DESC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(sql, [...assignParams, ...testParams]);
    return rows;
  }

  async getSubmittedAssignments(enrollmentId: number, filters?: { subjectId?: number; status?: string }) {
    let whereClause = `WHERE s.enrollment_id = ?`;
    const params: any[] = [enrollmentId];

    if (filters?.subjectId && !isNaN(filters.subjectId)) {
      whereClause += ` AND sub.id = ?`;
      params.push(filters.subjectId);
    }

    if (filters?.status && filters.status !== 'all') {
      whereClause += ` AND s.status = ?`;
      params.push(filters.status);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id as submission_id,
         s.assignment_id,
         s.submitted_at,
         s.is_late,
         s.status as submission_status,
         s.content_text,
         s.document_id,
         d.original_name as file_name,
         d.size_bytes as file_size,
         s.feedback,
         s.score as obtained_score,
         s.graded_at,
         a.title as assignment_title,
         a.instructions as assignment_instructions,
         a.max_score,
         a.due_at,
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name
       FROM submissions s
       JOIN assignments a ON s.assignment_id = a.id
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       JOIN staff st ON ta.staff_id = st.id
       LEFT JOIN documents d ON s.document_id = d.id AND d.deleted_at IS NULL
       ${whereClause}
       ORDER BY s.submitted_at DESC`,
      params
    );
    return rows;
  }

  async getAssessmentDetail(sectionId: number, enrollmentId: number, assignmentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         a.id,
         a.title,
         a.instructions,
         a.due_at,
         a.allow_late,
         a.max_score,
         a.status as assignment_status,
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name,
         sub.name_am as subject_name_am,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
         st.email as teacher_email,
         t.name as term_name,
         s.id as submission_id,
         s.submitted_at,
         s.is_late,
         s.status as submission_status,
         s.content_text,
         s.document_id,
         d.original_name as submission_file_name,
         d.size_bytes as submission_file_size,
         s.score as obtained_score,
         s.feedback,
         s.graded_at
       FROM assignments a
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       JOIN staff st ON ta.staff_id = st.id
       LEFT JOIN terms t ON a.term_id = t.id
       LEFT JOIN submissions s ON a.id = s.assignment_id AND s.enrollment_id = ?
       LEFT JOIN documents d ON s.document_id = d.id AND d.deleted_at IS NULL
       WHERE a.id = ? AND ta.section_id = ? AND a.status = 'published'`,
      [enrollmentId, assignmentId, sectionId]
    );

    if (rows.length === 0) {
      return null;
    }

    const item = rows[0];

    // Fetch teacher attachments/materials for this class
    const [materials] = await pool.query<RowDataPacket[]>(
      `SELECT 
         lr.id,
         lr.title,
         lr.description,
         lr.url,
         d.id as document_id,
         d.original_name,
         d.mime_type,
         d.size_bytes
       FROM learning_resources lr
       JOIN teaching_assignments ta ON lr.teaching_assignment_id = ta.id
       LEFT JOIN documents d ON lr.document_id = d.id AND d.deleted_at IS NULL
       WHERE ta.section_id = ? AND ta.subject_id = ?
       ORDER BY lr.created_at DESC
       LIMIT 5`,
      [sectionId, item.subject_id]
    );

    return {
      ...item,
      attachments: materials
    };
  }

  async getQuizzesAndTests(sectionId: number, enrollmentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         a.id,
         a.title,
         at.code as type_code,
         at.name as type_name,
         a.max_score,
         a.weight,
         a.assessment_date,
         a.status as assessment_status,
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
         m.id as mark_id,
         m.score as obtained_score,
         m.feedback,
         m.mark_status
       FROM assessments a
       JOIN assessment_types at ON a.assessment_type_id = at.id
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       JOIN staff st ON ta.staff_id = st.id
       LEFT JOIN marks m ON a.id = m.assessment_id AND m.enrollment_id = ?
       WHERE ta.section_id = ? 
         AND at.code IN ('quiz', 'test', 'project', 'practical')
       ORDER BY a.assessment_date DESC, a.id DESC`,
      [enrollmentId, sectionId]
    );
    return rows;
  }

  async getAssignmentForSubmission(assignmentId: number, sectionId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         a.id,
         a.title,
         a.instructions,
         a.due_at,
         a.allow_late,
         a.max_score,
         a.status,
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name
       FROM assignments a
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       WHERE a.id = ? AND ta.section_id = ? AND a.status = 'published'`,
      [assignmentId, sectionId]
    );
    return rows[0] || null;
  }

  async saveSubmission(payload: {
    assignmentId: number;
    enrollmentId: number;
    contentText?: string;
    documentId?: number | null;
    isLate: boolean;
  }) {
    const { assignmentId, enrollmentId, contentText, documentId, isLate } = payload;
    await pool.query(
      `INSERT INTO submissions (assignment_id, enrollment_id, submitted_at, is_late, status, content_text, document_id)
       VALUES (?, ?, NOW(3), ?, 'submitted', ?, ?)
       ON DUPLICATE KEY UPDATE 
         submitted_at = VALUES(submitted_at),
         is_late = VALUES(is_late),
         status = 'submitted',
         content_text = COALESCE(VALUES(content_text), submissions.content_text),
         document_id = COALESCE(VALUES(document_id), submissions.document_id),
         updated_at = NOW(3)`,
      [assignmentId, enrollmentId, isLate ? 1 : 0, contentText || null, documentId || null]
    );

    const [saved] = await pool.query<RowDataPacket[]>(
      `SELECT s.id, s.assignment_id, s.enrollment_id, s.submitted_at, s.is_late, s.status, s.content_text, s.document_id,
              d.original_name as file_name, d.size_bytes as file_size
       FROM submissions s
       LEFT JOIN documents d ON s.document_id = d.id
       WHERE s.assignment_id = ? AND s.enrollment_id = ?`,
      [assignmentId, enrollmentId]
    );
    return saved[0];
  }

  async getSubmissionDownload(submissionOrAssignmentId: number, enrollmentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id,
         s.assignment_id,
         s.enrollment_id,
         d.id as document_id,
         d.original_name,
         d.storage_key,
         d.mime_type,
         d.size_bytes
       FROM submissions s
       JOIN documents d ON s.document_id = d.id
       WHERE (s.id = ? OR s.assignment_id = ?) 
         AND s.enrollment_id = ?
         AND d.deleted_at IS NULL
       LIMIT 1`,
      [submissionOrAssignmentId, submissionOrAssignmentId, enrollmentId]
    );
    return rows[0] || null;
  }

  // ==========================================
  // PAGE 6: RESULTS & ACADEMIC PROGRESS
  // ==========================================

  async getPublishedTermResults(enrollmentId: number, termId?: number) {
    let query = `
      SELECT 
        r.id,
        r.term_id,
        t.name as term_name,
        r.subject_id,
        sub.code as subject_code,
        sub.name as subject_name,
        sub.name_am as subject_name_am,
        COALESCE(gs.periods_per_week, 3) as credit_hours,
        r.total_score,
        r.letter_grade,
        r.grade_points,
        r.is_pass,
        r.subject_rank,
        rp.published_at
      FROM results r
      JOIN result_publications rp ON r.publication_id = rp.id
      JOIN terms t ON r.term_id = t.id
      JOIN subjects sub ON r.subject_id = sub.id
      JOIN enrollments e ON r.enrollment_id = e.id
      JOIN sections sec ON e.section_id = sec.id
      LEFT JOIN grade_subjects gs ON gs.subject_id = sub.id 
        AND gs.grade_id = sec.grade_id 
        AND gs.academic_year_id = sec.academic_year_id
      WHERE r.enrollment_id = ?
        AND r.status = 'published'
        AND rp.status = 'published'
    `;
    const params: any[] = [enrollmentId];
    if (termId) {
      query += ` AND r.term_id = ?`;
      params.push(termId);
    }
    query += ` ORDER BY t.start_date DESC, sub.name ASC`;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  async getAcademicYears() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, label_ec, start_date, end_date, status, is_current
       FROM academic_years
       ORDER BY start_date DESC`
    );
    return rows;
  }

  async getContinuousMarks(enrollmentId: number, filters?: { termId?: number; subjectId?: number }) {
    let whereClause = `WHERE m.enrollment_id = ? AND a.status IN ('open', 'closed') AND m.status != 'draft'`;
    const params: any[] = [enrollmentId];

    if (filters?.termId && !isNaN(filters.termId)) {
      whereClause += ` AND a.term_id = ?`;
      params.push(filters.termId);
    }

    if (filters?.subjectId && !isNaN(filters.subjectId)) {
      whereClause += ` AND sub.id = ?`;
      params.push(filters.subjectId);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         m.id as mark_id,
         m.score,
         m.feedback,
         m.mark_status,
         m.status as submission_status,
         a.id as assessment_id,
         a.title as assessment_title,
         a.max_score,
         a.weight,
         a.assessment_date,
         at.code as type_code,
         at.name as type_name,
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name,
         t.id as term_id,
         t.name as term_name,
         mh.id as history_id,
         mh.old_score,
         mh.reason as correction_reason,
         mh.changed_at as corrected_at
       FROM marks m
       JOIN assessments a ON m.assessment_id = a.id
       JOIN assessment_types at ON a.assessment_type_id = at.id
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       LEFT JOIN terms t ON a.term_id = t.id
       LEFT JOIN marks_history mh ON m.id = mh.mark_id
       ${whereClause}
       ORDER BY sub.name ASC, a.assessment_date DESC`,
      params
    );
    return rows;
  }

  async getTermAttendanceRate(enrollmentId: number, termId: number): Promise<number | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         COUNT(*) as total_days,
         SUM(CASE WHEN ar.status_code IN ('present', 'late') THEN 1 ELSE 0 END) as attended_days
       FROM attendance_records ar
       JOIN attendance_sessions s ON ar.session_id = s.id
       JOIN terms t ON t.id = ?
       WHERE ar.enrollment_id = ?
         AND s.attendance_date >= t.start_date
         AND s.attendance_date <= t.end_date`,
      [termId, enrollmentId]
    );
    if (!rows.length || Number(rows[0].total_days) === 0) {
      // Fallback: overall attendance rate
      const [allRows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           COUNT(*) as total_days,
           SUM(CASE WHEN ar.status_code IN ('present', 'late') THEN 1 ELSE 0 END) as attended_days
         FROM attendance_records ar
         WHERE ar.enrollment_id = ?`,
        [enrollmentId]
      );
      if (!allRows.length || Number(allRows[0].total_days) === 0) return 96.0;
      return Number(((Number(allRows[0].attended_days) / Number(allRows[0].total_days)) * 100).toFixed(1));
    }
    return Number(((Number(rows[0].attended_days) / Number(rows[0].total_days)) * 100).toFixed(1));
  }

  async getAnnualAverage(enrollmentId: number, academicYearId: number): Promise<number | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT AVG(r.total_score) as annual_avg
       FROM results r
       JOIN terms t ON r.term_id = t.id
       JOIN result_publications rp ON r.publication_id = rp.id
       WHERE r.enrollment_id = ?
         AND t.academic_year_id = ?
         AND r.status = 'published'
         AND rp.status = 'published'`,
      [enrollmentId, academicYearId]
    );
    if (!rows.length || rows[0].annual_avg === null) return null;
    return Number(Number(rows[0].annual_avg).toFixed(1));
  }

  async getMultiTermProgression(enrollmentId: number, academicYearId?: number) {
    let whereClause = `WHERE r.enrollment_id = ? AND r.status = 'published' AND rp.status = 'published'`;
    const params: any[] = [enrollmentId];

    if (academicYearId) {
      whereClause += ` AND t.academic_year_id = ?`;
      params.push(academicYearId);
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         t.id as term_id,
         t.name as term_name,
         t.term_no,
         r.subject_id,
         sub.code as subject_code,
         sub.name as subject_name,
         r.total_score,
         r.letter_grade,
         r.grade_points
       FROM results r
       JOIN terms t ON r.term_id = t.id
       JOIN result_publications rp ON r.publication_id = rp.id
       JOIN subjects sub ON r.subject_id = sub.id
       ${whereClause}
       ORDER BY t.term_no ASC, sub.name ASC`,
      params
    );
    return rows;
  }

  async getSectionAllPublishedResults(sectionId: number, termId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         r.enrollment_id,
         r.subject_id,
         r.total_score,
         r.grade_points
       FROM results r
       JOIN result_publications rp ON r.publication_id = rp.id
       JOIN enrollments e ON r.enrollment_id = e.id
       WHERE e.section_id = ? 
         AND r.term_id = ? 
         AND r.status = 'published' 
         AND rp.status = 'published'`,
      [sectionId, termId]
    );
    return rows;
  }

  // --- PAGE 7: REPORT CARDS & DOCUMENTS ---

  async getPublishedReportCards(enrollmentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         rcs.id,
         CONCAT('RC-', ay.name, '-T', t.term_no, '-', LPAD(rcs.id, 4, '0')) as reference_no,
         rcs.publication_id,
         rcs.term_id,
         t.name as term_name,
         t.term_no,
         ay.id as academic_year_id,
         ay.name as academic_year_name,
         rcs.version,
         rcs.class_rank,
         rcs.class_size,
         rcs.average_percent,
         rcs.payload_json,
         rcs.generated_at,
         rcs.issued_at,
         rp.status as publication_status,
         rp.published_at as publication_date
       FROM report_card_snapshots rcs
       JOIN result_publications rp ON rcs.publication_id = rp.id
       JOIN terms t ON rcs.term_id = t.id
       JOIN academic_years ay ON t.academic_year_id = ay.id
       WHERE rcs.enrollment_id = ? 
         AND rp.status = 'published'
       ORDER BY t.term_no DESC, rcs.version DESC`,
      [enrollmentId]
    );

    return rows.map((r) => ({
      ...r,
      payload: typeof r.payload_json === 'string' ? JSON.parse(r.payload_json) : r.payload_json
    }));
  }

  async getReportCardSnapshot(id: number, enrollmentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         rcs.id,
         CONCAT('RC-', ay.name, '-T', t.term_no, '-', LPAD(rcs.id, 4, '0')) as reference_no,
         rcs.publication_id,
         rcs.term_id,
         t.name as term_name,
         t.term_no,
         ay.id as academic_year_id,
         ay.name as academic_year_name,
         rcs.version,
         rcs.class_rank,
         rcs.class_size,
         rcs.average_percent,
         rcs.payload_json,
         rcs.generated_at,
         rcs.issued_at,
         rp.status as publication_status,
         rp.published_at as publication_date
       FROM report_card_snapshots rcs
       JOIN result_publications rp ON rcs.publication_id = rp.id
       JOIN terms t ON rcs.term_id = t.id
       JOIN academic_years ay ON t.academic_year_id = ay.id
       WHERE rcs.id = ? AND rcs.enrollment_id = ? AND rp.status = 'published'`,
      [id, enrollmentId]
    );

    if (!rows.length) return null;
    const r = rows[0];
    return {
      ...r,
      payload: typeof r.payload_json === 'string' ? JSON.parse(r.payload_json) : r.payload_json
    };
  }

  async getIssuedTranscripts(studentId: number) {
    // Transcripts issued through student_requests or documents
    const [reqTranscripts] = await pool.query<RowDataPacket[]>(
      `SELECT 
         sr.id,
         sr.request_no as reference_no,
         sr.decided_at as issue_date,
         sr.purpose,
         'issued' as status,
         sr.document_id,
         d.original_name,
         d.size_bytes,
         d.mime_type
       FROM student_requests sr
       LEFT JOIN documents d ON sr.document_id = d.id
       WHERE sr.student_id = ? 
         AND sr.request_type = 'transcript' 
         AND sr.status = 'ready'
       ORDER BY sr.decided_at DESC`,
      [studentId]
    );

    // Also check direct document records with doc_type 'transcript'
    const [docTranscripts] = await pool.query<RowDataPacket[]>(
      `SELECT 
         d.id as document_id,
         CONCAT('TR-', LPAD(d.id, 6, '0')) as reference_no,
         d.created_at as issue_date,
         'Official Academic Records' as purpose,
         'issued' as status,
         d.id as document_id,
         d.original_name,
         d.size_bytes,
         d.mime_type
       FROM documents d
       WHERE d.owner_type = 'student' 
         AND d.owner_id = ? 
         AND d.doc_type = 'transcript'
         AND d.deleted_at IS NULL
       ORDER BY d.created_at DESC`,
      [studentId]
    );

    return [...reqTranscripts, ...docTranscripts];
  }

  async getIssuedDocuments(studentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         d.id,
         d.doc_type,
         d.original_name,
         d.storage_key,
         d.mime_type,
         d.size_bytes,
         d.created_at as issue_date,
         'Registrar & Academic Staff' as issued_by_role,
         u.username as issued_by_name,
         CONCAT('DOC-', UPPER(LEFT(d.doc_type, 4)), '-', LPAD(d.id, 5, '0')) as reference_no,
         'Permanent' as validity
       FROM documents d
       LEFT JOIN users u ON d.uploaded_by = u.id
       WHERE d.owner_type = 'student' 
         AND d.owner_id = ? 
         AND d.deleted_at IS NULL
       ORDER BY d.created_at DESC`,
      [studentId]
    );
    return rows;
  }

  async getDocumentById(documentId: number, studentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM documents 
       WHERE id = ? AND owner_type = 'student' AND owner_id = ? AND deleted_at IS NULL`,
      [documentId, studentId]
    );
    return rows[0] || null;
  }

  async getStudentCompletedAnnualRecords(studentId: number) {
    // Find all academic years with enrollments and check if both semester 1 & 2 have published results
    const [enrollments] = await pool.query<RowDataPacket[]>(
      `SELECT 
         e.id as enrollment_id,
         e.academic_year_id,
         e.status as enrollment_status,
         e.enrolled_on,
         ay.name as academic_year_name,
         sec.name as section_name,
         g.display_name as grade_name,
         g.grade_level
       FROM enrollments e
       JOIN academic_years ay ON e.academic_year_id = ay.id
       JOIN sections sec ON e.section_id = sec.id
       JOIN grades g ON sec.grade_id = g.id
       WHERE e.student_id = ?
       ORDER BY ay.name DESC`,
      [studentId]
    );

    const completedYears: any[] = [];

    for (const enr of enrollments) {
      // Check published terms for this enrollment
      const [termRows] = await pool.query<RowDataPacket[]>(
        `SELECT DISTINCT t.id as term_id, t.term_no, t.name as term_name
         FROM results r
         JOIN terms t ON r.term_id = t.id
         JOIN result_publications rp ON r.publication_id = rp.id
         WHERE r.enrollment_id = ? AND r.status = 'published' AND rp.status = 'published'`,
        [enr.enrollment_id]
      );

      // Annual average
      const [avgRow] = await pool.query<RowDataPacket[]>(
        `SELECT AVG(r.total_score) as annual_avg
         FROM results r
         JOIN result_publications rp ON r.publication_id = rp.id
         WHERE r.enrollment_id = ? AND r.status = 'published' AND rp.status = 'published'`,
        [enr.enrollment_id]
      );

      const annualAverage = avgRow[0]?.annual_avg ? Number(Number(avgRow[0].annual_avg).toFixed(1)) : null;
      const completedTermsCount = termRows.length;
      const isCompleted = completedTermsCount >= 2 || enr.enrollment_status === 'promoted' || enr.enrollment_status === 'completed';

      completedYears.push({
        enrollmentId: enr.enrollment_id,
        academicYearId: enr.academic_year_id,
        academicYearName: enr.academic_year_name,
        sectionName: enr.section_name,
        gradeName: enr.grade_name,
        gradeLevel: enr.grade_level,
        enrollmentStatus: enr.enrollment_status,
        completedTermsCount,
        terms: termRows,
        annualAverage,
        isCompleted,
        certificateEligible: isCompleted && (annualAverage === null || annualAverage >= 50),
        certificateReferenceNo: `CERT-${enr.academic_year_name.replace(/[^0-9]/g, '')}-PROM-${String(enr.enrollment_id).padStart(4, '0')}`
      });
    }

    return completedYears;
  }

  async getStudentRequests(studentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         sr.id,
         sr.request_no,
         sr.student_id,
         sr.request_type,
         sr.purpose,
         sr.reason,
         sr.copies_requested,
         sr.delivery_method,
         sr.correction_field,
         sr.current_value,
         sr.requested_value,
         sr.status,
         sr.decision_note,
         sr.decided_by,
         sr.decided_at,
         sr.document_id,
         sr.created_at,
         sr.updated_at,
         u.username as decided_by_name,
         d.original_name as document_name,
         d.size_bytes as document_size
       FROM student_requests sr
       LEFT JOIN users u ON sr.decided_by = u.id
       LEFT JOIN documents d ON sr.document_id = d.id
       WHERE sr.student_id = ?
       ORDER BY sr.created_at DESC`,
      [studentId]
    );
    return rows;
  }

  async getStudentRequestById(requestId: number, studentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         sr.id,
         sr.request_no,
         sr.student_id,
         sr.request_type,
         sr.purpose,
         sr.reason,
         sr.copies_requested,
         sr.delivery_method,
         sr.correction_field,
         sr.current_value,
         sr.requested_value,
         sr.status,
         sr.decision_note,
         sr.decided_by,
         sr.decided_at,
         sr.document_id,
         sr.created_at,
         sr.updated_at,
         u.username as decided_by_name,
         d.original_name as document_name,
         d.size_bytes as document_size
       FROM student_requests sr
       LEFT JOIN users u ON sr.decided_by = u.id
       LEFT JOIN documents d ON sr.document_id = d.id
       WHERE sr.id = ? AND sr.student_id = ?`,
      [requestId, studentId]
    );
    return rows[0] || null;
  }

  async findOpenRequestByType(studentId: number, requestType: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, request_no, request_type, status, created_at 
       FROM student_requests 
       WHERE student_id = ? 
         AND request_type = ? 
         AND status IN ('submitted', 'in_review', 'approved')
       LIMIT 1`,
      [studentId, requestType]
    );
    return rows[0] || null;
  }

  async createStudentRequest(data: {
    requestNo: string;
    studentId: number;
    requestType: string;
    purpose: string;
    reason?: string;
    copiesRequested?: number;
    deliveryMethod: string;
    correctionField?: string | null;
    currentValue?: string | null;
    requestedValue?: string | null;
  }) {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO student_requests (
         request_no, student_id, request_type, purpose, reason, copies_requested, delivery_method,
         correction_field, current_value, requested_value, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`,
      [
        data.requestNo,
        data.studentId,
        data.requestType,
        data.purpose,
        data.reason || null,
        data.copiesRequested || 1,
        data.deliveryMethod,
        data.correctionField || null,
        data.currentValue || null,
        data.requestedValue || null
      ]
    );
    return result.insertId;
  }

  async cancelStudentRequest(requestId: number, studentId: number) {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE student_requests 
       SET status = 'cancelled', updated_at = NOW(3)
       WHERE id = ? AND student_id = ? AND status = 'submitted'`,
      [requestId, studentId]
    );
    return result.affectedRows > 0;
  }

  async logAudit(data: {
    actorUserId: number;
    actorUsername: string;
    action: string;
    entityType: string;
    entityId: number | string;
    outcome: string;
    reason?: string;
  }) {
    try {
      await pool.query(
        `INSERT INTO audit_logs (
           occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason
         ) VALUES (NOW(3), ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.actorUserId,
          data.actorUsername,
          data.action,
          data.entityType,
          String(data.entityId),
          data.outcome,
          data.reason || null
        ]
      );
    } catch (err) {
      console.error('Failed to log audit:', err);
    }
  }

  async createNotification(data: {
    userId: number;
    type: string;
    title: string;
    body: string;
    payloadJson?: any;
  }) {
    try {
      await pool.query(
        `INSERT INTO notifications (
           user_id, type, title, body, payload_json, created_at
         ) VALUES (?, ?, ?, ?, ?, NOW(3))`,
        [
          data.userId,
          data.type,
          data.title,
          data.body,
          data.payloadJson ? JSON.stringify(data.payloadJson) : null
        ]
      );
    } catch (err) {
      console.error('Failed to create notification:', err);
    }
  }

  // ==========================================
  // HELP & SUPPORT (STUDENT TICKETS)
  // ==========================================

  async getSupportTickets(studentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT m.id, m.category, m.subject, m.message, m.status, m.created_at, m.updated_at,
              (SELECT COUNT(*) FROM student_support_replies r WHERE r.message_id = m.id) AS reply_count,
              (SELECT MAX(r.created_at) FROM student_support_replies r
                WHERE r.message_id = m.id AND r.sender_role <> 'student') AS last_staff_reply_at
       FROM student_support_messages m
       WHERE m.student_id = ?
       ORDER BY m.created_at DESC
       LIMIT 100`,
      [studentId]
    );
    return rows;
  }

  async getSupportTicketById(studentId: number, ticketId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT m.id, m.category, m.subject, m.message, m.status, m.created_at, m.updated_at
       FROM student_support_messages m
       WHERE m.id = ? AND m.student_id = ?
       LIMIT 1`,
      [ticketId, studentId]
    );
    if (!rows.length) return null;

    const [replies] = await pool.query<RowDataPacket[]>(
      `SELECT r.id, r.sender_role, r.reply_text, r.created_at, u.username AS sender_username
       FROM student_support_replies r
       LEFT JOIN users u ON u.id = r.sender_user_id
       WHERE r.message_id = ?
       ORDER BY r.created_at ASC`,
      [ticketId]
    );
    return { ...rows[0], replies };
  }

  async createSupportTicket(
    studentId: number,
    payload: { category: string; subject: string; message: string }
  ) {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO student_support_messages (student_id, category, subject, message, status)
       VALUES (?, ?, ?, ?, ?)`,
      [studentId, payload.category, payload.subject, payload.message, 'open']
    );
    return result.insertId;
  }

  async closeSupportTicket(studentId: number, ticketId: number) {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE student_support_messages SET status = 'closed'
       WHERE id = ? AND student_id = ? AND status <> 'closed'`,
      [ticketId, studentId]
    );
    return result.affectedRows;
  }

  /**
   * Staff/admin accounts that handle student support: every active user holding
   * an administrator or registrar role, excluding the student themself.
   */
  async getSupportStaffUserIds(excludeUserId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.status = 'active' AND u.id <> ? AND r.code IN ('administrator')
       ORDER BY u.id
       LIMIT 50`,
      [excludeUserId]
    );
    return rows.map((row) => Number(row.id));
  }

  // ==========================================
  // PAGE 12: MY PROFILE
  // ==========================================

  /**
   * Guardians linked to a single student. Only the caller's own student_id is
   * ever passed in (resolved server-side from the authenticated account).
   */
  async getProfileGuardians(studentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT sg.relationship,
              sg.is_primary,
              sg.is_emergency_contact,
              g.first_name,
              g.father_name,
              g.grandfather_name,
              g.phone,
              g.email,
              g.verification_status
       FROM student_guardians sg
       JOIN guardians g ON g.id = sg.guardian_id
       WHERE sg.student_id = ?
       ORDER BY sg.is_emergency_contact DESC, sg.is_primary DESC, g.first_name ASC`,
      [studentId]
    );
    return rows;
  }

  async findOpenCorrectionRequest(studentId: number, field: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, request_no, correction_field, status, created_at
       FROM student_requests
       WHERE student_id = ?
         AND request_type = 'profile_correction'
         AND correction_field = ?
         AND status IN ('submitted', 'in_review', 'approved')
       LIMIT 1`,
      [studentId, field]
    );
    return rows[0] || null;
  }

  /**
   * Applies a student's own contact edits inside a transaction and returns the
   * previous values so the caller can audit old -> new.
   * Only the allow-listed columns are ever written; the student id is fixed.
   */
  async updateStudentSelfContact(
    studentId: number,
    allowedColumns: string[],
    values: Record<string, string | null>
  ) {
    const conn: PoolConnection = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [beforeRows] = await conn.query<RowDataPacket[]>(
        `SELECT phone, email, region, city, address FROM students WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        [studentId]
      );
      if (!beforeRows.length) {
        throw Object.assign(new Error('Student record not found.'), { statusCode: 404, code: 'STUDENT_NOT_FOUND' });
      }
      const before = beforeRows[0];

      const assignments = allowedColumns.map((column) => `${column} = ?`);
      await conn.query(
        `UPDATE students SET ${assignments.join(', ')}, updated_at = NOW(3) WHERE id = ?`,
        [...allowedColumns.map((column) => values[column]), studentId]
      );
      await conn.commit();

      const changed: Record<string, { from: any; to: any }> = {};
      for (const column of allowedColumns) {
        const from = before[column] ?? null;
        const to = values[column] ?? null;
        if (String(from ?? '') !== String(to ?? '')) changed[column] = { from, to };
      }
      return changed;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getStudentPhoto(studentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT d.id, d.storage_key, d.mime_type, d.original_name, d.size_bytes
       FROM students s
       JOIN documents d ON d.id = s.photo_document_id
       WHERE s.id = ? AND s.deleted_at IS NULL AND d.deleted_at IS NULL
         AND d.doc_type = 'profile_photo'
       LIMIT 1`,
      [studentId]
    );
    return rows[0] || null;
  }

  /**
   * Stores a validated profile photo for the student and soft-deletes the
   * previous one. Returns the new document id.
   */
  async saveStudentPhoto(
    studentId: number,
    userId: number,
    photo: { bytes: Buffer; mimeType: string; extension: 'jpg' | 'png'; originalName: string }
  ) {
    const storageName = `${randomUUID()}.${photo.extension}`;
    const key = `student_photos/${storageName}`;
    const dir = path.resolve(
      process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'),
      'student_photos'
    );
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, storageName), photo.bytes, { flag: 'wx', mode: 0o600 });

    const conn: PoolConnection = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [studentRows] = await conn.query<RowDataPacket[]>(
        `SELECT photo_document_id FROM students WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        [studentId]
      );
      if (!studentRows.length) {
        throw Object.assign(new Error('Student record not found.'), { statusCode: 404, code: 'STUDENT_NOT_FOUND' });
      }
      const previousId = studentRows[0].photo_document_id;

      const [doc] = await conn.query<ResultSetHeader>(
        `INSERT INTO documents (owner_type, owner_id, doc_type, original_name, storage_key, mime_type, size_bytes, checksum_sha256, scan_status, uploaded_by)
         VALUES ('student', ?, 'profile_photo', ?, ?, ?, ?, ?, 'skipped', ?)`,
        [
          studentId,
          path.basename(photo.originalName || 'student-profile-photo').slice(0, 255),
          key,
          photo.mimeType,
          photo.bytes.length,
          createHash('sha256').update(photo.bytes).digest('hex'),
          userId
        ]
      );
      await conn.query(`UPDATE students SET photo_document_id = ?, updated_at = NOW(3) WHERE id = ?`, [
        doc.insertId,
        studentId
      ]);
      if (previousId) {
        await conn.query(`UPDATE documents SET deleted_at = NOW(3) WHERE id = ? AND owner_type = 'student' AND owner_id = ?`, [
          previousId,
          studentId
        ]);
      }
      await conn.commit();
      return { documentId: doc.insertId, previousDocumentId: previousId || null };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async removeStudentPhoto(studentId: number) {
    const conn: PoolConnection = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [studentRows] = await conn.query<RowDataPacket[]>(
        `SELECT photo_document_id FROM students WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        [studentId]
      );
      if (!studentRows.length) {
        throw Object.assign(new Error('Student record not found.'), { statusCode: 404, code: 'STUDENT_NOT_FOUND' });
      }
      const previousId = studentRows[0].photo_document_id;
      await conn.query(`UPDATE students SET photo_document_id = NULL, updated_at = NOW(3) WHERE id = ?`, [studentId]);
      if (previousId) {
        await conn.query(`UPDATE documents SET deleted_at = NOW(3) WHERE id = ? AND owner_type = 'student' AND owner_id = ?`, [
          previousId,
          studentId
        ]);
      }
      await conn.commit();
      return previousId || null;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getSettingJson(settingKey: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT value_json FROM system_settings WHERE setting_key = ? LIMIT 1`,
      [settingKey]
    );
    if (!rows.length) return null;
    const raw = rows[0].value_json;
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }

  async readStudentPhotoFile(storageKey: string) {
    const safeKey = String(storageKey);
    if (!/^student_photos\/[a-f0-9-]+\.(?:jpg|png)$/i.test(safeKey)) {
      throw Object.assign(new Error('Student photo storage reference is invalid.'), {
        statusCode: 500,
        code: 'STUDENT_PHOTO_STORAGE_ERROR'
      });
    }
    const photoPath = path.resolve(
      process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'),
      safeKey
    );
    try {
      return await readFile(photoPath);
    } catch {
      throw Object.assign(new Error('Student photo file is unavailable.'), {
        statusCode: 404,
        code: 'STUDENT_PHOTO_NOT_FOUND'
      });
    }
  }
}
