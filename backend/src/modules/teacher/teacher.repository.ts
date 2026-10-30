import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile, readFile } from 'fs/promises';
import path from 'path';

export class TeacherRepository {
  async getAssignedClasses(staffId: number, academicYearId?: number) {
    let query = `
      SELECT 
        ta.id as teaching_assignment_id,
        ta.staff_id,
        ta.subject_id,
        ta.section_id,
        ta.academic_year_id,
        s.name as section_name,
        s.stream,
        s.capacity,
        g.grade_level,
        g.display_name as grade_name,
        sub.name as subject_name,
        sub.code as subject_code,
        ay.name as academic_year_name,
        (
          SELECT COUNT(*) 
          FROM enrollments e 
          WHERE e.section_id = s.id AND e.status = 'active'
        ) as student_count
      FROM teaching_assignments ta
      JOIN sections s ON ta.section_id = s.id
      JOIN grades g ON s.grade_id = g.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN academic_years ay ON ta.academic_year_id = ay.id
      WHERE ta.staff_id = ? AND ta.is_active = 1
    `;
    const params: any[] = [staffId];

    if (academicYearId) {
      query += ` AND ta.academic_year_id = ?`;
      params.push(academicYearId);
    } else {
      query += ` AND ay.is_current = 1`;
    }

    query += ` ORDER BY g.grade_level ASC, s.name ASC, sub.name ASC`;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  async verifyTeacherAssignment(staffId: number, sectionId: number, subjectId?: number): Promise<boolean> {
    let sql = `
      SELECT id FROM teaching_assignments 
      WHERE staff_id = ? AND section_id = ? AND is_active = 1
    `;
    const params: any[] = [staffId, sectionId];
    if (subjectId) {
      sql += ` AND subject_id = ?`;
      params.push(subjectId);
    }
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows.length > 0;
  }

  async getStudentsForSection(sectionId: number) {
    const query = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        s.first_name,
        s.father_name,
        s.grandfather_name,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as full_name,
        s.gender,
        e.id as enrollment_id,
        e.roll_no,
        e.status as enrollment_status
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      WHERE e.section_id = ? AND e.status = 'active'
      ORDER BY e.roll_no ASC, s.first_name ASC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [sectionId]);
    return rows;
  }

  async getTimetable(staffId: number, sectionId?: number) {
    let query = `
      SELECT 
        te.id,
        te.term_id,
        t.name as term_name,
        te.section_id,
        sec.name as section_name,
        g.display_name as grade_name,
        te.subject_id,
        sub.name as subject_name,
        sub.code as subject_code,
        te.room_id,
        c.name as room_name,
        c.building,
        ts.day_of_week,
        ts.start_time,
        ts.end_time,
        ts.label as slot_label
      FROM timetable_entries te
      JOIN time_slots ts ON te.time_slot_id = ts.id
      JOIN sections sec ON te.section_id = sec.id
      JOIN grades g ON sec.grade_id = g.id
      JOIN subjects sub ON te.subject_id = sub.id
      JOIN terms t ON te.term_id = t.id
      LEFT JOIN classrooms c ON te.room_id = c.id
      WHERE te.staff_id = ? AND t.is_current = 1
    `;
    const params: any[] = [staffId];
    if (sectionId) {
      query += ` AND te.section_id = ?`;
      params.push(sectionId);
    }
    query += ` ORDER BY ts.day_of_week ASC, ts.start_time ASC`;
    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  async getAnnouncements() {
    const query = `
      SELECT DISTINCT a.id, a.title, a.body, a.published_at, a.created_at
      FROM announcements a
      WHERE a.status = 'published' AND a.deleted_at IS NULL AND (a.expires_at IS NULL OR a.expires_at >= NOW(3))
        AND (NOT EXISTS (SELECT 1 FROM announcement_targets any_target WHERE any_target.announcement_id = a.id)
          OR EXISTS (SELECT 1 FROM announcement_targets target LEFT JOIN roles r ON r.id = target.target_id
            WHERE target.announcement_id = a.id AND (target.target_type = 'all' OR (target.target_type = 'role' AND r.code = 'teacher'))))
      ORDER BY a.published_at DESC
      LIMIT 10
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query);
    return rows;
  }

  async getDashboardOverview(staffId: number) {
    // 1. Assigned classes count
    const [classesCount] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT section_id) as total_sections, COUNT(*) as total_assignments
       FROM teaching_assignments 
       WHERE staff_id = ? AND is_active = 1`,
      [staffId]
    );

    // 2. Attendance count for today
    const [attStats] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as recorded_today
       FROM attendance_sessions
       WHERE recorded_by_staff_id = ? AND attendance_date = CURDATE()`,
      [staffId]
    );

    // 3. Assessments count in draft/open/closed
    const [assessmentStats] = await pool.query<RowDataPacket[]>(
      `SELECT 
         COUNT(*) as total_assessments,
         SUM(CASE WHEN a.status = 'draft' THEN 1 ELSE 0 END) as draft_assessments,
         SUM(CASE WHEN a.status = 'open' THEN 1 ELSE 0 END) as open_assessments
       FROM assessments a
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       WHERE ta.staff_id = ?`,
      [staffId]
    );

    return {
      assignedSections: classesCount[0]?.total_sections || 0,
      assignedClasses: classesCount[0]?.total_assignments || 0,
      todayAttendanceRecorded: attStats[0]?.recorded_today || 0,
      totalAssessments: assessmentStats[0]?.total_assessments || 0,
      draftAssessments: assessmentStats[0]?.draft_assessments || 0
    };
  }

  async getTeacherSubjects(staffId: number) {
    const query = `
      SELECT DISTINCT 
        sub.id,
        sub.code,
        sub.name,
        sub.name_am
      FROM teaching_assignments ta
      JOIN subjects sub ON ta.subject_id = sub.id
      WHERE ta.staff_id = ? AND ta.is_active = 1
      ORDER BY sub.name ASC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [staffId]);
    return rows;
  }

  async getAcademicYears() {
    const query = `
      SELECT id, name, label_ec, is_current, status, start_date, end_date
      FROM academic_years
      ORDER BY is_current DESC, start_date DESC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query);
    return rows;
  }

  async getTerms(academicYearId?: number) {
    let query = `
      SELECT id, academic_year_id, term_no, name, is_current, status, start_date, end_date
      FROM terms
    `;
    const params: any[] = [];
    if (academicYearId) {
      query += ` WHERE academic_year_id = ?`;
      params.push(academicYearId);
    }
    query += ` ORDER BY term_no ASC`;
    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  async getAttendanceReport(
    staffId: number,
    params: {
      sectionId: number;
      subjectId?: number;
      termId?: number;
      academicYearId?: number;
      startDate?: string;
      endDate?: string;
    }
  ) {
    // 1. Fetch section metadata
    const [secRows] = await pool.query<RowDataPacket[]>(
      `SELECT s.id, s.name as section_name, g.display_name as grade_name
       FROM sections s
       JOIN grades g ON s.grade_id = g.id
       WHERE s.id = ?`,
      [params.sectionId]
    );
    const sectionInfo = secRows[0] || null;

    // 2. Fetch subject metadata if provided
    let subjectInfo: any = null;
    if (params.subjectId) {
      const [subRows] = await pool.query<RowDataPacket[]>(
        `SELECT id, name, code FROM subjects WHERE id = ?`,
        [params.subjectId]
      );
      subjectInfo = subRows[0] || null;
    }

    // 3. Query attendance records per student
    let sessionJoin = `
      LEFT JOIN attendance_sessions att_s ON att_s.section_id = e.section_id
    `;
    const sqlParams: any[] = [];

    if (params.subjectId) {
      sessionJoin += ` AND att_s.subject_id = ?`;
      sqlParams.push(params.subjectId);
    }
    if (params.termId) {
      sessionJoin += ` AND att_s.term_id = ?`;
      sqlParams.push(params.termId);
    }
    if (params.academicYearId) {
      sessionJoin += ` AND att_s.academic_year_id = ?`;
      sqlParams.push(params.academicYearId);
    }
    if (params.startDate) {
      sessionJoin += ` AND att_s.attendance_date >= ?`;
      sqlParams.push(params.startDate);
    }
    if (params.endDate) {
      sessionJoin += ` AND att_s.attendance_date <= ?`;
      sqlParams.push(params.endDate);
    }

    const query = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as full_name,
        s.gender,
        e.roll_no,
        e.id as enrollment_id,
        COUNT(DISTINCT att_s.id) as total_sessions,
        SUM(CASE WHEN ar.status_code = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN ar.status_code = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN ar.status_code = 'late' THEN 1 ELSE 0 END) as late_count,
        SUM(CASE WHEN ar.status_code = 'excused' THEN 1 ELSE 0 END) as excused_count
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      ${sessionJoin}
      LEFT JOIN attendance_records ar ON ar.session_id = att_s.id AND ar.enrollment_id = e.id
      WHERE e.section_id = ? AND e.status = 'active'
      GROUP BY s.id, s.admission_no, full_name, s.gender, e.roll_no, e.id
      ORDER BY e.roll_no ASC, s.first_name ASC
    `;
    sqlParams.push(params.sectionId);

    const [rows] = await pool.query<RowDataPacket[]>(query, sqlParams);

    let totalSessionsSum = 0;
    let totalPresentSum = 0;
    let totalLateSum = 0;

    const formattedStudents = rows.map((r) => {
      const totalSessions = Number(r.total_sessions) || 0;
      const present = Number(r.present_count) || 0;
      const late = Number(r.late_count) || 0;
      const absent = Number(r.absent_count) || 0;
      const excused = Number(r.excused_count) || 0;
      const attended = present + late;

      totalSessionsSum += totalSessions;
      totalPresentSum += present;
      totalLateSum += late;

      // School attendance formula: (present + late) / total_sessions * 100. Excused is noted in record.
      const percentage = totalSessions > 0 ? Number(((attended / totalSessions) * 100).toFixed(1)) : 100.0;

      return {
        studentId: r.student_id,
        admissionNo: r.admission_no,
        fullName: r.full_name,
        gender: r.gender,
        rollNo: r.roll_no,
        totalSessions,
        present,
        absent,
        late,
        excused,
        attendancePercentage: percentage
      };
    });

    const overallRate = totalSessionsSum > 0 
      ? Number((((totalPresentSum + totalLateSum) / totalSessionsSum) * 100).toFixed(1))
      : 100.0;

    return {
      section: sectionInfo,
      subject: subjectInfo,
      totalStudents: formattedStudents.length,
      overallAttendanceRate: overallRate,
      appliedFilters: params,
      records: formattedStudents
    };
  }

  async getMarksReport(
    staffId: number,
    params: {
      sectionId: number;
      subjectId?: number;
      termId?: number;
      assessmentId?: number;
      academicYearId?: number;
    }
  ) {
    let whereClause = `
      WHERE ta.staff_id = ?
        AND sec.id = ?
        AND e.status = 'active'
    `;
    const sqlParams: any[] = [staffId, params.sectionId];

    if (params.subjectId) {
      whereClause += ` AND sub.id = ?`;
      sqlParams.push(params.subjectId);
    }
    if (params.termId) {
      whereClause += ` AND a.term_id = ?`;
      sqlParams.push(params.termId);
    }
    if (params.assessmentId) {
      whereClause += ` AND a.id = ?`;
      sqlParams.push(params.assessmentId);
    }
    if (params.academicYearId) {
      whereClause += ` AND ta.academic_year_id = ?`;
      sqlParams.push(params.academicYearId);
    }

    const query = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as full_name,
        e.roll_no,
        a.id as assessment_id,
        a.title as assessment_name,
        at.name as assessment_type_name,
        sub.name as subject_name,
        sub.code as subject_code,
        sec.name as section_name,
        t.name as term_name,
        a.max_score,
        a.weight,
        m.score,
        m.mark_status,
        m.status as mark_status_lifecycle,
        a.status as assessment_status,
        m.feedback
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      JOIN sections sec ON e.section_id = sec.id
      JOIN teaching_assignments ta ON ta.section_id = sec.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN assessments a ON a.teaching_assignment_id = ta.id
      JOIN assessment_types at ON a.assessment_type_id = at.id
      JOIN terms t ON a.term_id = t.id
      LEFT JOIN marks m ON m.assessment_id = a.id AND m.enrollment_id = e.id
      ${whereClause}
      ORDER BY a.assessment_date DESC, a.id DESC, e.roll_no ASC, s.first_name ASC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query, sqlParams);

    const formattedRecords = rows.map((r) => {
      const score = r.score !== null ? Number(r.score) : null;
      const maxScore = Number(r.max_score);
      const percentage = score !== null && maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(1)) : null;

      return {
        studentId: r.student_id,
        admissionNo: r.admission_no,
        fullName: r.full_name,
        rollNo: r.roll_no,
        assessmentId: r.assessment_id,
        assessmentName: r.assessment_name,
        assessmentType: r.assessment_type_name,
        subjectName: r.subject_name,
        subjectCode: r.subject_code,
        sectionName: r.section_name,
        termName: r.term_name,
        score,
        maxScore,
        percentage,
        weight: Number(r.weight),
        markStatus: r.mark_status || 'unmarked',
        lifecycleStatus: r.mark_status_lifecycle || 'draft',
        assessmentStatus: r.assessment_status,
        feedback: r.feedback || null
      };
    });

    const validScores = formattedRecords.filter((r) => r.score !== null).map((r) => r.score as number);
    const avgScore = validScores.length > 0
      ? Number((validScores.reduce((acc, v) => acc + v, 0) / validScores.length).toFixed(2))
      : null;

    return {
      appliedFilters: params,
      totalRecords: formattedRecords.length,
      scoredCount: validScores.length,
      unmarkedCount: formattedRecords.length - validScores.length,
      averageScore: avgScore,
      records: formattedRecords
    };
  }

  async getClassPerformanceReport(
    staffId: number,
    params: {
      sectionId: number;
      subjectId?: number;
      termId?: number;
      assessmentId?: number;
    }
  ) {
    let whereClause = `
      WHERE ta.staff_id = ?
        AND sec.id = ?
    `;
    const sqlParams: any[] = [staffId, params.sectionId];

    if (params.subjectId) {
      whereClause += ` AND sub.id = ?`;
      sqlParams.push(params.subjectId);
    }
    if (params.termId) {
      whereClause += ` AND a.term_id = ?`;
      sqlParams.push(params.termId);
    }
    if (params.assessmentId) {
      whereClause += ` AND a.id = ?`;
      sqlParams.push(params.assessmentId);
    }

    const query = `
      SELECT 
        a.id as assessment_id,
        a.title as assessment_name,
        at.name as assessment_type_name,
        a.max_score,
        a.weight,
        sub.name as subject_name,
        sec.name as section_name,
        COUNT(DISTINCT e.id) as total_enrolled,
        COUNT(m.id) as assessed_count,
        ROUND(AVG(m.score), 2) as avg_score,
        MIN(m.score) as min_score,
        MAX(m.score) as max_score,
        SUM(CASE WHEN (m.score / a.max_score) >= 0.85 THEN 1 ELSE 0 END) as grade_excellent,
        SUM(CASE WHEN (m.score / a.max_score) >= 0.75 AND (m.score / a.max_score) < 0.85 THEN 1 ELSE 0 END) as grade_very_good,
        SUM(CASE WHEN (m.score / a.max_score) >= 0.60 AND (m.score / a.max_score) < 0.75 THEN 1 ELSE 0 END) as grade_good,
        SUM(CASE WHEN (m.score / a.max_score) >= 0.50 AND (m.score / a.max_score) < 0.60 THEN 1 ELSE 0 END) as grade_satisfactory,
        SUM(CASE WHEN (m.score / a.max_score) < 0.50 THEN 1 ELSE 0 END) as grade_needs_improvement
      FROM teaching_assignments ta
      JOIN sections sec ON ta.section_id = sec.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN enrollments e ON e.section_id = sec.id AND e.status = 'active'
      JOIN assessments a ON a.teaching_assignment_id = ta.id
      JOIN assessment_types at ON a.assessment_type_id = at.id
      LEFT JOIN marks m ON m.assessment_id = a.id AND m.enrollment_id = e.id AND m.score IS NOT NULL
      ${whereClause}
      GROUP BY a.id, a.title, at.name, a.max_score, a.weight, sub.name, sec.name
      ORDER BY a.assessment_date DESC, a.id DESC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query, sqlParams);

    const assessmentsList = rows.map((r) => {
      const maxScore = Number(r.max_score);
      const avgScore = r.avg_score !== null ? Number(r.avg_score) : null;
      const avgPercentage = avgScore !== null && maxScore > 0 ? Number(((avgScore / maxScore) * 100).toFixed(1)) : null;

      return {
        assessmentId: r.assessment_id,
        assessmentName: r.assessment_name,
        assessmentType: r.assessment_type_name,
        subjectName: r.subject_name,
        sectionName: r.section_name,
        maxScore,
        weight: Number(r.weight),
        totalEnrolled: Number(r.total_enrolled),
        assessedCount: Number(r.assessed_count),
        missingMarksCount: Number(r.total_enrolled) - Number(r.assessed_count),
        averageScore: avgScore,
        highestScore: r.max_score !== null && r.assessed_count > 0 ? Number(r.max_score) : null,
        lowestScore: r.min_score !== null && r.assessed_count > 0 ? Number(r.min_score) : null,
        averagePercentage: avgPercentage,
        gradeDistribution: {
          excellent: Number(r.grade_excellent) || 0,
          veryGood: Number(r.grade_very_good) || 0,
          good: Number(r.grade_good) || 0,
          satisfactory: Number(r.grade_satisfactory) || 0,
          needsImprovement: Number(r.grade_needs_improvement) || 0
        }
      };
    });

    return {
      appliedFilters: params,
      totalAssessments: assessmentsList.length,
      assessments: assessmentsList
    };
  }

  async getStudentPerformanceReport(
    staffId: number,
    params: {
      sectionId: number;
      studentId?: number;
      subjectId?: number;
      termId?: number;
    }
  ) {
    // If a specific studentId is provided, get that student's detailed report
    if (params.studentId) {
      const [studRows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           s.id as student_id,
           s.admission_no,
           CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as full_name,
           s.gender,
           e.roll_no,
           sec.name as section_name
         FROM students s
         JOIN enrollments e ON e.student_id = s.id
         JOIN sections sec ON e.section_id = sec.id
         WHERE s.id = ? AND e.section_id = ? AND e.status = 'active'`,
        [params.studentId, params.sectionId]
      );
      if (studRows.length === 0) {
        return { student: null, assessments: [], attendance: null };
      }

      // Assessments & marks
      let assWhere = `
        WHERE ta.staff_id = ?
          AND ta.section_id = ?
          AND e.student_id = ?
      `;
      const assParams: any[] = [staffId, params.sectionId, params.studentId];
      if (params.subjectId) {
        assWhere += ` AND sub.id = ?`;
        assParams.push(params.subjectId);
      }
      if (params.termId) {
        assWhere += ` AND a.term_id = ?`;
        assParams.push(params.termId);
      }

      const assQuery = `
        SELECT 
          a.id as assessment_id,
          a.title as assessment_name,
          at.name as assessment_type_name,
          sub.name as subject_name,
          sub.code as subject_code,
          t.name as term_name,
          a.max_score,
          a.weight,
          m.score,
          m.feedback,
          m.mark_status,
          m.status as lifecycle_status
        FROM assessments a
        JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
        JOIN subjects sub ON ta.subject_id = sub.id
        JOIN assessment_types at ON a.assessment_type_id = at.id
        JOIN terms t ON a.term_id = t.id
        JOIN enrollments e ON e.section_id = ta.section_id
        LEFT JOIN marks m ON m.assessment_id = a.id AND m.enrollment_id = e.id
        ${assWhere}
        ORDER BY a.assessment_date DESC, a.id DESC
      `;
      const [assRows] = await pool.query<RowDataPacket[]>(assQuery, assParams);

      // Student Attendance Summary
      let attWhere = ``;
      const attParams: any[] = [];
      if (params.subjectId) {
        attWhere += ` AND att_s.subject_id = ?`;
        attParams.push(params.subjectId);
      }
      if (params.termId) {
        attWhere += ` AND att_s.term_id = ?`;
        attParams.push(params.termId);
      }

      const attQuery = `
        SELECT 
          COUNT(DISTINCT att_s.id) as total_sessions,
          SUM(CASE WHEN ar.status_code = 'present' THEN 1 ELSE 0 END) as present_count,
          SUM(CASE WHEN ar.status_code = 'absent' THEN 1 ELSE 0 END) as absent_count,
          SUM(CASE WHEN ar.status_code = 'late' THEN 1 ELSE 0 END) as late_count,
          SUM(CASE WHEN ar.status_code = 'excused' THEN 1 ELSE 0 END) as excused_count
        FROM enrollments e
        JOIN attendance_sessions att_s ON att_s.section_id = e.section_id ${attWhere}
        LEFT JOIN attendance_records ar ON ar.session_id = att_s.id AND ar.enrollment_id = e.id
        WHERE e.section_id = ? AND e.student_id = ? AND e.status = 'active'
      `;
      attParams.push(params.sectionId, params.studentId);
      const [attRows] = await pool.query<RowDataPacket[]>(attQuery, attParams);
      const attRow = attRows[0] || {};
      const totalSessions = Number(attRow.total_sessions) || 0;
      const present = Number(attRow.present_count) || 0;
      const late = Number(attRow.late_count) || 0;
      const attendancePct = totalSessions > 0 ? Number((((present + late) / totalSessions) * 100).toFixed(1)) : 100.0;

      const assessmentsList = assRows.map((r) => {
        const score = r.score !== null ? Number(r.score) : null;
        const maxScore = Number(r.max_score);
        const percentage = score !== null && maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(1)) : null;
        return {
          assessmentId: r.assessment_id,
          assessmentName: r.assessment_name,
          assessmentType: r.assessment_type_name,
          subjectName: r.subject_name,
          subjectCode: r.subject_code,
          termName: r.term_name,
          maxScore,
          weight: Number(r.weight),
          score,
          percentage,
          feedback: r.feedback || null,
          markStatus: r.mark_status || 'unmarked',
          lifecycleStatus: r.lifecycle_status || 'draft'
        };
      });

      return {
        appliedFilters: params,
        student: studRows[0],
        assessments: assessmentsList,
        attendance: {
          totalSessions,
          present,
          absent: Number(attRow.absent_count) || 0,
          late,
          excused: Number(attRow.excused_count) || 0,
          attendancePercentage: attendancePct
        }
      };
    }

    // Otherwise, return all students summary in section
    let markJoin = `
      LEFT JOIN assessments a ON a.teaching_assignment_id = ta.id
      LEFT JOIN marks m ON m.assessment_id = a.id AND m.enrollment_id = e.id AND m.score IS NOT NULL
    `;
    const sqlParams: any[] = [staffId, params.sectionId];
    if (params.subjectId) {
      markJoin += ` AND sub.id = ?`;
      sqlParams.push(params.subjectId);
    }
    if (params.termId) {
      markJoin += ` AND a.term_id = ?`;
      sqlParams.push(params.termId);
    }

    const query = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as full_name,
        s.gender,
        e.roll_no,
        COUNT(DISTINCT a.id) as available_assessments,
        COUNT(DISTINCT m.id) as completed_assessments,
        ROUND(AVG((m.score / a.max_score) * 100), 1) as average_percentage
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      JOIN teaching_assignments ta ON ta.section_id = e.section_id
      JOIN subjects sub ON ta.subject_id = sub.id
      ${markJoin}
      WHERE ta.staff_id = ? AND e.section_id = ? AND e.status = 'active'
      GROUP BY s.id, s.admission_no, full_name, s.gender, e.roll_no
      ORDER BY e.roll_no ASC, s.first_name ASC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query, sqlParams);

    return {
      appliedFilters: params,
      totalStudents: rows.length,
      students: rows
    };
  }

  async getAssessmentSummaryReport(
    staffId: number,
    params: {
      subjectId?: number;
      sectionId?: number;
      termId?: number;
      academicYearId?: number;
    }
  ) {
    let whereClause = `WHERE ta.staff_id = ?`;
    const sqlParams: any[] = [staffId];

    if (params.subjectId) {
      whereClause += ` AND sub.id = ?`;
      sqlParams.push(params.subjectId);
    }
    if (params.sectionId) {
      whereClause += ` AND sec.id = ?`;
      sqlParams.push(params.sectionId);
    }
    if (params.termId) {
      whereClause += ` AND a.term_id = ?`;
      sqlParams.push(params.termId);
    }
    if (params.academicYearId) {
      whereClause += ` AND ta.academic_year_id = ?`;
      sqlParams.push(params.academicYearId);
    }

    const query = `
      SELECT 
        a.id as assessment_id,
        a.title as assessment_title,
        at.name as assessment_type_name,
        sub.name as subject_name,
        sub.code as subject_code,
        sec.name as section_name,
        t.name as term_name,
        a.assessment_date,
        a.max_score,
        a.weight,
        a.status as workflow_status,
        COUNT(DISTINCT e.id) as students_enrolled,
        COUNT(DISTINCT m.id) as students_assessed,
        (COUNT(DISTINCT e.id) - COUNT(DISTINCT m.id)) as missing_marks,
        ROUND(AVG(m.score), 2) as average_score,
        ROUND((AVG(m.score) / a.max_score) * 100, 1) as average_percentage
      FROM assessments a
      JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN sections sec ON ta.section_id = sec.id
      JOIN terms t ON a.term_id = t.id
      JOIN assessment_types at ON a.assessment_type_id = at.id
      JOIN enrollments e ON e.section_id = sec.id AND e.status = 'active'
      LEFT JOIN marks m ON m.assessment_id = a.id AND m.enrollment_id = e.id AND m.score IS NOT NULL
      ${whereClause}
      GROUP BY a.id, a.title, at.name, sub.name, sub.code, sec.name, t.name, a.assessment_date, a.max_score, a.weight, a.status
      ORDER BY a.assessment_date DESC, a.id DESC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query, sqlParams);

    return {
      appliedFilters: params,
      totalAssessments: rows.length,
      assessments: rows
    };
  }

  // =========================================================================
  // EXTENDED TEACHER NAVIGATION & PAGES REPOSITORY METHODS
  // =========================================================================

  async getDashboardExtended(staffId: number, userId: number) {
    const overview = await this.getDashboardOverview(staffId);

    // 1. Today's Timetable
    const [todayTimetable] = await pool.query<RowDataPacket[]>(
      `SELECT 
        te.id,
        te.section_id,
        sec.name as section_name,
        g.display_name as grade_name,
        te.subject_id,
        sub.name as subject_name,
        sub.code as subject_code,
        te.room_id,
        c.name as room_name,
        c.building,
        ts.day_of_week,
        ts.start_time,
        ts.end_time,
        ts.label as slot_label
      FROM timetable_entries te
      JOIN terms t ON te.term_id = t.id
      JOIN sections sec ON te.section_id = sec.id
      JOIN grades g ON sec.grade_id = g.id
      JOIN subjects sub ON te.subject_id = sub.id
      JOIN classrooms c ON te.room_id = c.id
      JOIN time_slots ts ON te.time_slot_id = ts.id
      WHERE te.staff_id = ? AND t.is_current = 1
        AND ts.day_of_week = CASE DAYOFWEEK(CURDATE())
          WHEN 1 THEN 7 -- Sunday
          WHEN 2 THEN 1 -- Monday
          WHEN 3 THEN 2 -- Tuesday
          WHEN 4 THEN 3 -- Wednesday
          WHEN 5 THEN 4 -- Thursday
          WHEN 6 THEN 5 -- Friday
          WHEN 7 THEN 6 -- Saturday
        END
      ORDER BY ts.start_time ASC`,
      [staffId]
    );

    // 2. Attendance Tasks Due Today
    const [tasksDue] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT 
        s.id as section_id,
        s.name as section_name,
        g.display_name as grade_name,
        sub.id as subject_id,
        sub.name as subject_name
       FROM teaching_assignments ta
       JOIN sections s ON ta.section_id = s.id
       JOIN grades g ON s.grade_id = g.id
       JOIN subjects sub ON ta.subject_id = sub.id
       WHERE ta.staff_id = ? AND ta.is_active = 1
         AND NOT EXISTS (
           SELECT 1 FROM attendance_sessions att_s
           WHERE att_s.section_id = s.id 
             AND att_s.attendance_date = CURDATE()
             AND (att_s.subject_id = sub.id OR att_s.subject_id IS NULL)
         )
       LIMIT 10`,
      [staffId]
    );

    // 3. Marks Awaiting Completion
    const [marksAwaiting] = await pool.query<RowDataPacket[]>(
      `SELECT 
        a.id,
        a.title,
        a.max_score,
        a.weight,
        a.status as assessment_status,
        sub.name as subject_name,
        sec.name as section_name,
        t.name as term_name,
        COUNT(DISTINCT e.id) as total_students,
        COUNT(DISTINCT m.id) as marks_entered
       FROM assessments a
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       JOIN sections sec ON ta.section_id = sec.id
       JOIN terms t ON a.term_id = t.id
       JOIN enrollments e ON e.section_id = sec.id AND e.status = 'active'
       LEFT JOIN marks m ON m.assessment_id = a.id AND m.enrollment_id = e.id AND m.score IS NOT NULL
       WHERE ta.staff_id = ? AND a.status IN ('draft', 'open')
       GROUP BY a.id, a.title, a.max_score, a.weight, a.status, sub.name, sec.name, t.name
       HAVING marks_entered < total_students OR a.status = 'draft'
       ORDER BY a.created_at DESC
       LIMIT 6`,
      [staffId]
    );

    // 4. Returned Corrections
    const [returnedCorrections] = await pool.query<RowDataPacket[]>(
      `SELECT 
        id,
        type,
        entity_type,
        entity_id,
        reason,
        status,
        decision_note,
        decided_at,
        created_at
       FROM approvals
       WHERE requested_by = ? AND status = 'rejected'
       ORDER BY decided_at DESC
       LIMIT 5`,
      [userId]
    );

    // 5. Upcoming Deadlines
    const [upcomingAssignments] = await pool.query<RowDataPacket[]>(
      `SELECT 
        a.id,
        a.title,
        a.due_at,
        a.max_score,
        sec.name as section_name,
        sub.name as subject_name
       FROM assignments a
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN sections sec ON ta.section_id = sec.id
       JOIN subjects sub ON ta.subject_id = sub.id
       WHERE ta.staff_id = ? AND a.due_at >= NOW(3)
       ORDER BY a.due_at ASC
       LIMIT 5`,
      [staffId]
    );

    // 6. School Calendar Events
    const [calendarEvents] = await pool.query<RowDataPacket[]>(
      `SELECT id, title, event_type, start_date, end_date, description
       FROM calendar_events
       WHERE end_date >= CURDATE()
       ORDER BY start_date ASC
       LIMIT 5`
    );

    // 7. Recent Notifications
    const [recentNotifications] = await pool.query<RowDataPacket[]>(
      `SELECT id, type, title, body, payload_json, read_at, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    const announcements = await this.getAnnouncements();

    return {
      overview: {
        ...overview,
        attendanceTasksDueCount: tasksDue.length,
        marksAwaitingCount: marksAwaiting.length,
        returnedCorrectionsCount: returnedCorrections.length,
        unreadNotificationsCount: recentNotifications.filter((n) => !n.read_at).length
      },
      todayTimetable,
      attendanceTasksDue: tasksDue,
      marksAwaitingCompletion: marksAwaiting,
      returnedCorrections,
      upcomingDeadlines: upcomingAssignments,
      calendarEvents,
      recentNotifications,
      announcements
    };
  }

  // =========================================================================
  // PAGE 2: ATTENDANCE HISTORY & CORRECTIONS WORKFLOW
  // =========================================================================

  async getAttendanceHistory(staffId: number, sectionId: number, startDate?: string, endDate?: string) {
    let sql = `
      SELECT 
        att_s.id as session_id,
        att_s.attendance_date,
        att_s.status as session_status,
        att_s.subject_id,
        sub.name as subject_name,
        sub.code as subject_code,
        COUNT(ar.id) as total_records,
        SUM(CASE WHEN ar.status_code = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN ar.status_code = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN ar.status_code = 'late' THEN 1 ELSE 0 END) as late_count,
        SUM(CASE WHEN ar.status_code = 'excused' THEN 1 ELSE 0 END) as excused_count
      FROM attendance_sessions att_s
      LEFT JOIN subjects sub ON att_s.subject_id = sub.id
      LEFT JOIN attendance_records ar ON ar.session_id = att_s.id
      WHERE att_s.section_id = ? AND att_s.recorded_by_staff_id = ?
    `;
    const params: any[] = [sectionId, staffId];

    if (startDate) {
      sql += ` AND att_s.attendance_date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND att_s.attendance_date <= ?`;
      params.push(endDate);
    }

    sql += ` GROUP BY att_s.id, att_s.attendance_date, att_s.status, att_s.subject_id, sub.name, sub.code
             ORDER BY att_s.attendance_date DESC, att_s.id DESC`;

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async requestAttendanceCorrection(
    staffId: number,
    userId: number,
    payload: {
      sessionId: number;
      sectionId: number;
      attendanceDate: string;
      reason: string;
      oldRecords: any[];
      newRecords: any[];
    }
  ) {
    const isAssigned = await this.verifyTeacherAssignment(staffId, payload.sectionId);
    if (!isAssigned) {
      throw new Error('You are not assigned to teach this section.');
    }

    const [result] = await pool.query<any>(
      `INSERT INTO approvals (
        type,
        entity_type,
        entity_id,
        requested_by,
        old_value_json,
        new_value_json,
        reason,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        'attendance_edit_after_lock',
        'attendance_session',
        payload.sessionId,
        userId,
        JSON.stringify(payload.oldRecords),
        JSON.stringify(payload.newRecords),
        payload.reason
      ]
    );

    // Audit Event
    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, changes, reason)
       VALUES (?, 'REQUEST_ATTENDANCE_CORRECTION', 'attendance_session', ?, ?, ?)`,
      [
        userId,
        String(payload.sessionId),
        JSON.stringify({
          approvalId: result.insertId,
          sectionId: payload.sectionId,
          date: payload.attendanceDate
        }),
        payload.reason
      ]
    );

    return { approvalId: result.insertId, status: 'pending' };
  }

  async getRepeatedAbsences(staffId: number, sectionId: number) {
    const isAssigned = await this.verifyTeacherAssignment(staffId, sectionId);
    if (!isAssigned) {
      throw new Error('Forbidden: You are not assigned to this section.');
    }

    const query = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as student_name,
        e.roll_no,
        COUNT(ar.id) as total_absences,
        MAX(att_s.attendance_date) as last_absence_date
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      JOIN attendance_records ar ON ar.enrollment_id = e.id AND ar.status_code = 'absent'
      JOIN attendance_sessions att_s ON ar.session_id = att_s.id
      WHERE e.section_id = ? AND e.status = 'active'
      GROUP BY s.id, s.admission_no, student_name, e.roll_no
      HAVING total_absences >= 3
      ORDER BY total_absences DESC, last_absence_date DESC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [sectionId]);
    return rows;
  }

  async getStudentAttendanceDetail(staffId: number, sectionId: number, studentId: number) {
    const isAssigned = await this.verifyTeacherAssignment(staffId, sectionId);
    if (!isAssigned) {
      throw new Error('Forbidden: You are not assigned to this section.');
    }

    const query = `
      SELECT 
        att_s.attendance_date,
        ar.status_code,
        ar.note,
        sub.name as subject_name
      FROM attendance_records ar
      JOIN attendance_sessions att_s ON ar.session_id = att_s.id
      JOIN enrollments e ON ar.enrollment_id = e.id
      LEFT JOIN subjects sub ON att_s.subject_id = sub.id
      WHERE e.section_id = ? AND e.student_id = ?
      ORDER BY att_s.attendance_date DESC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [sectionId, studentId]);
    return rows;
  }

  // =========================================================================
  // PAGE 3: MARKS CORRECTIONS & HISTORY
  // =========================================================================

  async requestMarkCorrection(
    staffId: number,
    userId: number,
    payload: {
      assessmentId: number;
      reason: string;
      oldMarks: any[];
      newMarks: any[];
    }
  ) {
    const [assessment] = await pool.query<RowDataPacket[]>(
      `SELECT a.id, a.title, ta.staff_id, ta.section_id, ta.subject_id 
       FROM assessments a
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       WHERE a.id = ? AND ta.staff_id = ?`,
      [payload.assessmentId, staffId]
    );

    if (assessment.length === 0) {
      throw new Error('Assessment not found or not assigned to you.');
    }

    const [result] = await pool.query<any>(
      `INSERT INTO approvals (
        type,
        entity_type,
        entity_id,
        requested_by,
        old_value_json,
        new_value_json,
        reason,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        'result_unlock',
        'assessments',
        payload.assessmentId,
        userId,
        JSON.stringify(payload.oldMarks),
        JSON.stringify(payload.newMarks),
        payload.reason
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, changes, reason)
       VALUES (?, 'REQUEST_MARK_CORRECTION', 'assessments', ?, ?, ?)`,
      [
        userId,
        String(payload.assessmentId),
        JSON.stringify({
          approvalId: result.insertId,
          assessmentId: payload.assessmentId
        }),
        payload.reason
      ]
    );

    return { approvalId: result.insertId, status: 'pending' };
  }

  async getMarksHistory(staffId: number, assessmentId: number) {
    const [assessment] = await pool.query<RowDataPacket[]>(
      `SELECT a.id FROM assessments a
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       WHERE a.id = ? AND ta.staff_id = ?`,
      [assessmentId, staffId]
    );
    if (assessment.length === 0) {
      throw new Error('Assessment not found or unauthorized.');
    }

    const query = `
      SELECT 
        mh.id,
        mh.mark_id,
        mh.old_score,
        mh.new_score,
        mh.old_mark_status,
        mh.new_mark_status,
        mh.reason,
        mh.changed_at,
        u_changed.username as changed_by_user,
        u_app.username as approved_by_user,
        s.admission_no,
        CONCAT(s.first_name, ' ', s.father_name) as student_name
      FROM marks_history mh
      JOIN marks m ON mh.mark_id = m.id
      JOIN enrollments e ON m.enrollment_id = e.id
      JOIN students s ON e.student_id = s.id
      LEFT JOIN users u_changed ON mh.changed_by = u_changed.id
      LEFT JOIN users u_app ON mh.approved_by = u_app.id
      WHERE m.assessment_id = ?
      ORDER BY mh.changed_at DESC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [assessmentId]);
    return rows;
  }

  async getMissingMarks(staffId: number, assessmentId: number) {
    const [assessment] = await pool.query<RowDataPacket[]>(
      `SELECT a.id, a.title, ta.section_id 
       FROM assessments a
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       WHERE a.id = ? AND ta.staff_id = ?`,
      [assessmentId, staffId]
    );
    if (assessment.length === 0) {
      throw new Error('Assessment not found or unauthorized.');
    }

    const sectionId = assessment[0].section_id;

    const query = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as student_name,
        e.roll_no,
        e.id as enrollment_id
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      LEFT JOIN marks m ON m.assessment_id = ? AND m.enrollment_id = e.id AND m.score IS NOT NULL
      WHERE e.section_id = ? AND e.status = 'active' AND m.id IS NULL
      ORDER BY e.roll_no ASC, s.first_name ASC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [assessmentId, sectionId]);
    return rows;
  }

  // =========================================================================
  // PAGE 5: MY CLASSES DETAIL & SCOPED STUDENT PROFILE
  // =========================================================================

  async getClassDetail(staffId: number, sectionId: number) {
    const isAssigned = await this.verifyTeacherAssignment(staffId, sectionId);
    if (!isAssigned) {
      throw new Error('Forbidden: You are not assigned to this class.');
    }

    // Section info with homeroom
    const [sectionRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        s.id,
        s.name as section_name,
        s.stream,
        s.capacity,
        g.grade_level,
        g.display_name as grade_name,
        c.name as default_room,
        CONCAT(st_hr.first_name, ' ', st_hr.father_name) as homeroom_teacher_name,
        st_hr.employee_no as homeroom_employee_no,
        (s.homeroom_staff_id = ?) as is_homeroom_teacher
       FROM sections s
       JOIN grades g ON s.grade_id = g.id
       LEFT JOIN classrooms c ON s.classroom_id = c.id
       LEFT JOIN staff st_hr ON s.homeroom_staff_id = st_hr.id
       WHERE s.id = ?`,
      [staffId, sectionId]
    );

    // Full student roster with contact & attendance stats
    const [roster] = await pool.query<RowDataPacket[]>(
      `SELECT 
        s.id as student_id,
        s.admission_no,
        s.first_name,
        s.father_name,
        s.grandfather_name,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as full_name,
        s.gender,
        s.date_of_birth,
        s.phone,
        e.id as enrollment_id,
        e.roll_no,
        g.phone as guardian_phone,
        CONCAT(g.first_name, ' ', g.father_name) as guardian_name,
        sg.relationship as guardian_relation,
        (
          SELECT COUNT(*) 
          FROM attendance_records ar
          JOIN attendance_sessions att ON ar.session_id = att.id
          WHERE ar.enrollment_id = e.id AND ar.status_code = 'present' AND att.section_id = e.section_id
        ) as present_sessions,
        (
          SELECT COUNT(*) 
          FROM attendance_records ar
          JOIN attendance_sessions att ON ar.session_id = att.id
          WHERE ar.enrollment_id = e.id AND ar.status_code = 'absent' AND att.section_id = e.section_id
        ) as absent_sessions
       FROM enrollments e
       JOIN students s ON e.student_id = s.id
       LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = 1
       LEFT JOIN guardians g ON sg.guardian_id = g.id
       WHERE e.section_id = ? AND e.status = 'active'
       ORDER BY e.roll_no ASC, s.first_name ASC`,
      [sectionId]
    );

    return {
      section: sectionRows[0] || null,
      totalStudents: roster.length,
      roster
    };
  }

  async getStudentProfileScoped(staffId: number, studentId: number) {
    // 1. Check teacher teaches this student in at least one assigned section
    const [enrollCheck] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT ta.id
       FROM teaching_assignments ta
       JOIN enrollments e ON ta.section_id = e.section_id
       WHERE ta.staff_id = ? AND e.student_id = ? AND ta.is_active = 1 AND e.status = 'active'`,
      [staffId, studentId]
    );

    if (enrollCheck.length === 0) {
      throw new Error('Forbidden: You can only view profiles of students in your assigned classes.');
    }

    // 2. Student general details
    const [studentRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        s.id,
        s.admission_no,
        s.first_name,
        s.father_name,
        s.grandfather_name,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as full_name,
        s.gender,
        s.date_of_birth,
        s.status,
        sec.id as section_id,
        sec.name as section_name,
        g.display_name as grade_name,
        e.roll_no
       FROM students s
       JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       JOIN sections sec ON e.section_id = sec.id
       JOIN grades g ON sec.grade_id = g.id
       WHERE s.id = ?`,
      [studentId]
    );

    // 3. Scores strictly for subjects taught by THIS teacher
    const [marks] = await pool.query<RowDataPacket[]>(
      `SELECT 
        sub.id as subject_id,
        sub.name as subject_name,
        sub.code as subject_code,
        a.id as assessment_id,
        a.title as assessment_title,
        a.max_score,
        a.weight,
        m.score,
        m.mark_status,
        m.feedback,
        t.name as term_name
       FROM teaching_assignments ta
       JOIN subjects sub ON ta.subject_id = sub.id
       JOIN assessments a ON a.teaching_assignment_id = ta.id
       JOIN terms t ON a.term_id = t.id
       JOIN enrollments e ON ta.section_id = e.section_id AND e.student_id = ?
       LEFT JOIN marks m ON m.assessment_id = a.id AND m.enrollment_id = e.id
       WHERE ta.staff_id = ?
       ORDER BY t.term_no ASC, a.created_at ASC`,
      [studentId, staffId]
    );

    // 4. Attendance in this teacher's classes
    const [attStats] = await pool.query<RowDataPacket[]>(
      `SELECT 
        ar.status_code,
        COUNT(*) as count
       FROM attendance_records ar
       JOIN attendance_sessions att ON ar.session_id = att.id
       JOIN enrollments e ON ar.enrollment_id = e.id
       JOIN teaching_assignments ta ON ta.section_id = att.section_id
       WHERE e.student_id = ? AND ta.staff_id = ?
       GROUP BY ar.status_code`,
      [studentId, staffId]
    );

    return {
      student: studentRows[0] || null,
      mySubjectMarks: marks,
      attendanceSummary: attStats
    };
  }

  async getHomeroomSection(staffId: number) {
    const query = `
      SELECT 
        s.id,
        s.name as section_name,
        s.stream,
        s.capacity,
        g.display_name as grade_name,
        (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') as active_students
      FROM sections s
      JOIN grades g ON s.grade_id = g.id
      WHERE s.homeroom_staff_id = ? AND s.status = 'active'
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [staffId]);
    return rows[0] || null;
  }

  // =========================================================================
  // PAGE 7: MY SUBJECTS
  // =========================================================================

  async getSubjectsDetailed(staffId: number) {
    const query = `
      SELECT 
        sub.id as subject_id,
        sub.code as subject_code,
        sub.name as subject_name,
        sub.name_am,
        gs.periods_per_week,
        gs.stream as grade_subject_stream,
        gs.is_compulsory,
        g.grade_level,
        g.display_name as grade_name,
        sec.id as section_id,
        sec.name as section_name,
        (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = sec.id AND e.status = 'active') as student_count
      FROM teaching_assignments ta
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN sections sec ON ta.section_id = sec.id
      JOIN grades g ON sec.grade_id = g.id
      LEFT JOIN grade_subjects gs ON gs.grade_id = g.id AND gs.subject_id = sub.id
      WHERE ta.staff_id = ? AND ta.is_active = 1
      ORDER BY g.grade_level ASC, sub.name ASC, sec.name ASC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [staffId]);
    return rows;
  }

  // =========================================================================
  // PAGE 8: ASSIGNMENTS & HOMEWORK MANAGEMENT
  // =========================================================================

  async getAssignmentsList(staffId: number, filters?: { sectionId?: number; termId?: number }) {
    let sql = `
      SELECT 
        a.id,
        a.teaching_assignment_id,
        a.title,
        a.instructions,
        a.due_at,
        a.allow_late,
        a.max_score,
        a.status,
        a.published_at,
        a.created_at,
        sub.name as subject_name,
        sub.code as subject_code,
        sec.name as section_name,
        sec.id as section_id,
        t.name as term_name,
        (SELECT COUNT(*) FROM submissions sub_m WHERE sub_m.assignment_id = a.id) as submission_count,
        (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = sec.id AND e.status = 'active') as total_enrolled
      FROM assignments a
      JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN sections sec ON ta.section_id = sec.id
      LEFT JOIN terms t ON a.term_id = t.id
      WHERE ta.staff_id = ?
    `;
    const params: any[] = [staffId];

    if (filters?.sectionId) {
      sql += ` AND sec.id = ?`;
      params.push(filters.sectionId);
    }
    if (filters?.termId) {
      sql += ` AND a.term_id = ?`;
      params.push(filters.termId);
    }

    sql += ` ORDER BY a.due_at DESC, a.id DESC`;

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async createAssignment(
    staffId: number,
    userId: number,
    payload: {
      teachingAssignmentId: number;
      termId?: number;
      title: string;
      instructions?: string;
      dueAt: string;
      allowLate?: boolean;
      maxScore?: number;
      status?: 'draft' | 'published';
    }
  ) {
    const [ta] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM teaching_assignments WHERE id = ? AND staff_id = ?`,
      [payload.teachingAssignmentId, staffId]
    );
    if (ta.length === 0) {
      throw new Error('Unauthorized: Teaching assignment not assigned to you.');
    }

    const [result] = await pool.query<any>(
      `INSERT INTO assignments (
        teaching_assignment_id,
        term_id,
        title,
        instructions,
        due_at,
        allow_late,
        max_score,
        status,
        published_at,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.teachingAssignmentId,
        payload.termId || null,
        payload.title,
        payload.instructions || null,
        payload.dueAt,
        payload.allowLate ? 1 : 0,
        payload.maxScore || null,
        payload.status || 'draft',
        payload.status === 'published' ? new Date() : null,
        userId
      ]
    );

    return { id: result.insertId, ...payload };
  }

  async getAssignmentSubmissions(staffId: number, assignmentId: number) {
    const [assign] = await pool.query<RowDataPacket[]>(
      `SELECT a.id, a.title, a.max_score, ta.section_id
       FROM assignments a
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       WHERE a.id = ? AND ta.staff_id = ?`,
      [assignmentId, staffId]
    );
    if (assign.length === 0) {
      throw new Error('Assignment not found or unauthorized.');
    }

    const sectionId = assign[0].section_id;

    const query = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as student_name,
        e.roll_no,
        e.id as enrollment_id,
        sub.id as submission_id,
        sub.submitted_at,
        sub.is_late,
        sub.status as submission_status,
        sub.content_text,
        sub.feedback,
        sub.score,
        sub.graded_at
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      LEFT JOIN submissions sub ON sub.assignment_id = ? AND sub.enrollment_id = e.id
      WHERE e.section_id = ? AND e.status = 'active'
      ORDER BY e.roll_no ASC, s.first_name ASC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [assignmentId, sectionId]);
    return {
      assignment: assign[0],
      submissions: rows
    };
  }

  async gradeSubmission(
    staffId: number,
    userId: number,
    submissionId: number,
    payload: { score: number; feedback?: string }
  ) {
    const [sub] = await pool.query<RowDataPacket[]>(
      `SELECT sub.id, a.max_score 
       FROM submissions sub
       JOIN assignments a ON sub.assignment_id = a.id
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       WHERE sub.id = ? AND ta.staff_id = ?`,
      [submissionId, staffId]
    );
    if (sub.length === 0) {
      throw new Error('Submission not found or unauthorized.');
    }

    if (payload.score < 0 || (sub[0].max_score && payload.score > sub[0].max_score)) {
      throw new Error(`Score must be between 0 and ${sub[0].max_score || 100}`);
    }

    await pool.query(
      `UPDATE submissions 
       SET score = ?, feedback = ?, status = 'graded', graded_by = ?, graded_at = NOW(3)
       WHERE id = ?`,
      [payload.score, payload.feedback || null, userId, submissionId]
    );

    return { id: submissionId, score: payload.score, status: 'graded' };
  }

  // =========================================================================
  // PAGE 9: LESSONS & TEACHING MATERIALS LIBRARY
  // =========================================================================

  async getLearningResources(
    staffId: number,
    filters?: { sectionId?: number; subjectId?: number; search?: string }
  ) {
    let sql = `
      SELECT 
        lr.id,
        lr.teaching_assignment_id,
        lr.title,
        lr.description,
        lr.document_id,
        lr.url,
        lr.visibility,
        lr.created_at,
        lr.updated_at,
        sub.id as subject_id,
        sub.name as subject_name,
        sub.code as subject_code,
        sec.id as section_id,
        sec.name as section_name,
        g.id as grade_id,
        g.grade_level,
        g.display_name as grade_name,
        d.original_name as file_name,
        d.mime_type as file_mime_type,
        d.size_bytes as file_size_bytes
      FROM learning_resources lr
      JOIN teaching_assignments ta ON lr.teaching_assignment_id = ta.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN sections sec ON ta.section_id = sec.id
      JOIN grades g ON sec.grade_id = g.id
      LEFT JOIN documents d ON lr.document_id = d.id AND d.deleted_at IS NULL
      WHERE ta.staff_id = ?
    `;
    const params: any[] = [staffId];

    if (filters?.sectionId) {
      sql += ` AND sec.id = ?`;
      params.push(filters.sectionId);
    }

    if (filters?.subjectId) {
      sql += ` AND sub.id = ?`;
      params.push(filters.subjectId);
    }

    if (filters?.search && filters.search.trim()) {
      sql += ` AND (lr.title LIKE ? OR lr.description LIKE ? OR sub.name LIKE ?)`;
      const s = `%${filters.search.trim()}%`;
      params.push(s, s, s);
    }

    sql += ` ORDER BY lr.created_at DESC`;

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async createLearningResource(
    staffId: number,
    userId: number,
    payload: {
      teachingAssignmentId: number;
      title: string;
      description?: string;
      url?: string;
      visibility?: 'section' | 'staff_only';
      file?: {
        originalName: string;
        mimeType: string;
        dataBase64: string;
      };
    }
  ) {
    const [ta] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM teaching_assignments WHERE id = ? AND staff_id = ?`,
      [payload.teachingAssignmentId, staffId]
    );
    if (ta.length === 0) {
      throw new Error('Unauthorized teaching assignment.');
    }

    if (!payload.title || !payload.title.trim()) {
      throw new Error('Resource title is required.');
    }

    let documentId: number | null = null;
    let externalUrl: string | null = null;

    if (payload.file && payload.file.dataBase64) {
      const rawBase64 = payload.file.dataBase64.replace(/^data:[^;]+;base64,/, '');
      const bytes = Buffer.from(rawBase64, 'base64');
      if (bytes.length === 0) {
        throw new Error('Uploaded file is empty.');
      }
      if (bytes.length > 25 * 1024 * 1024) {
        throw new Error('Uploaded file exceeds maximum limit of 25MB.');
      }

      const uploadDir = path.resolve(
        process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'),
        'learning_resources'
      );
      await mkdir(uploadDir, { recursive: true });

      const safeExt = path.extname(payload.file.originalName || '').toLowerCase().slice(0, 10) || '.bin';
      const storageKey = `learning_resources/${randomUUID()}${safeExt}`;
      const filePath = path.resolve(
        process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'),
        storageKey
      );

      await writeFile(filePath, bytes);

      const [docResult] = await pool.query<ResultSetHeader>(
        `INSERT INTO documents (
          owner_type,
          owner_id,
          doc_type,
          original_name,
          storage_key,
          mime_type,
          size_bytes,
          checksum_sha256,
          scan_status,
          uploaded_by
        ) VALUES ('learning_resource', 0, 'lesson_material', ?, ?, ?, ?, ?, 'clean', ?)`,
        [
          path.basename(payload.file.originalName || 'lesson-material').slice(0, 255),
          storageKey,
          payload.file.mimeType || 'application/octet-stream',
          bytes.length,
          createHash('sha256').update(bytes).digest('hex'),
          userId
        ]
      );

      documentId = docResult.insertId;
    }

    if (payload.url && payload.url.trim()) {
      const cleanUrl = payload.url.trim();
      if (!/^https?:\/\//i.test(cleanUrl)) {
        throw new Error('External link must be a valid HTTP or HTTPS URL.');
      }
      externalUrl = cleanUrl;
    }

    if (!documentId && !externalUrl) {
      throw new Error('Either an uploaded file or an external web link is required.');
    }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO learning_resources (
        teaching_assignment_id,
        title,
        description,
        document_id,
        url,
        visibility,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.teachingAssignmentId,
        payload.title.trim(),
        payload.description?.trim() || null,
        documentId,
        externalUrl,
        payload.visibility || 'section',
        userId
      ]
    );

    const resourceId = result.insertId;
    if (documentId) {
      await pool.query(
        `UPDATE documents SET owner_id = ? WHERE id = ?`,
        [resourceId, documentId]
      );
    }

    return {
      id: resourceId,
      teachingAssignmentId: payload.teachingAssignmentId,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      documentId,
      url: externalUrl,
      visibility: payload.visibility || 'section'
    };
  }

  async getLearningResourceFile(staffId: number, resourceId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT lr.id, lr.title, d.original_name, d.storage_key, d.mime_type, d.size_bytes
       FROM learning_resources lr
       JOIN teaching_assignments ta ON lr.teaching_assignment_id = ta.id
       JOIN documents d ON lr.document_id = d.id
       WHERE lr.id = ? AND ta.staff_id = ? AND d.deleted_at IS NULL`,
      [resourceId, staffId]
    );
    if (!rows.length) {
      throw new Error('File not found or unauthorized access.');
    }

    const storageKey = String(rows[0].storage_key);
    const filePath = path.resolve(
      process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'),
      storageKey
    );

    const bytes = await readFile(filePath);
    return {
      bytes,
      mimeType: String(rows[0].mime_type),
      originalName: String(rows[0].original_name),
      sizeBytes: Number(rows[0].size_bytes)
    };
  }

  async updateLearningResource(
    staffId: number,
    userId: number,
    resourceId: number,
    payload: {
      title?: string;
      description?: string;
      url?: string;
      visibility?: 'section' | 'staff_only';
      file?: {
        originalName: string;
        mimeType: string;
        dataBase64: string;
      };
    }
  ) {
    const [lr] = await pool.query<RowDataPacket[]>(
      `SELECT lr.id, lr.document_id, lr.url
       FROM learning_resources lr
       JOIN teaching_assignments ta ON lr.teaching_assignment_id = ta.id
       WHERE lr.id = ? AND ta.staff_id = ?`,
      [resourceId, staffId]
    );
    if (lr.length === 0) {
      throw new Error('Resource not found or unauthorized.');
    }

    let documentId: number | null = lr[0].document_id;
    let externalUrl: string | null = lr[0].url;

    if (payload.file && payload.file.dataBase64) {
      const rawBase64 = payload.file.dataBase64.replace(/^data:[^;]+;base64,/, '');
      const bytes = Buffer.from(rawBase64, 'base64');
      if (bytes.length > 25 * 1024 * 1024) {
        throw new Error('Uploaded file exceeds maximum limit of 25MB.');
      }

      const uploadDir = path.resolve(
        process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'),
        'learning_resources'
      );
      await mkdir(uploadDir, { recursive: true });

      const safeExt = path.extname(payload.file.originalName || '').toLowerCase().slice(0, 10) || '.bin';
      const storageKey = `learning_resources/${randomUUID()}${safeExt}`;
      const filePath = path.resolve(
        process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'),
        storageKey
      );

      await writeFile(filePath, bytes);

      const [docResult] = await pool.query<ResultSetHeader>(
        `INSERT INTO documents (
          owner_type,
          owner_id,
          doc_type,
          original_name,
          storage_key,
          mime_type,
          size_bytes,
          checksum_sha256,
          scan_status,
          uploaded_by
        ) VALUES ('learning_resource', ?, 'lesson_material', ?, ?, ?, ?, ?, 'clean', ?)`,
        [
          resourceId,
          path.basename(payload.file.originalName || 'lesson-material').slice(0, 255),
          storageKey,
          payload.file.mimeType || 'application/octet-stream',
          bytes.length,
          createHash('sha256').update(bytes).digest('hex'),
          userId
        ]
      );

      if (lr[0].document_id) {
        await pool.query(`UPDATE documents SET deleted_at = NOW(3) WHERE id = ?`, [lr[0].document_id]);
      }

      documentId = docResult.insertId;
    }

    if (payload.url !== undefined) {
      const cleanUrl = payload.url ? payload.url.trim() : null;
      if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
        throw new Error('External link must be a valid HTTP or HTTPS URL.');
      }
      externalUrl = cleanUrl;
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (payload.title && payload.title.trim()) {
      updates.push(`title = ?`);
      params.push(payload.title.trim());
    }
    if (payload.description !== undefined) {
      updates.push(`description = ?`);
      params.push(payload.description?.trim() || null);
    }
    if (payload.visibility) {
      updates.push(`visibility = ?`);
      params.push(payload.visibility);
    }
    if (documentId !== lr[0].document_id) {
      updates.push(`document_id = ?`);
      params.push(documentId);
    }
    if (externalUrl !== lr[0].url) {
      updates.push(`url = ?`);
      params.push(externalUrl);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW(3)`);
      const updateSql = `UPDATE learning_resources SET ${updates.join(', ')} WHERE id = ?`;
      params.push(resourceId);
      await pool.query(updateSql, params);
    }

    return { id: resourceId, success: true };
  }

  async deleteLearningResource(staffId: number, resourceId: number) {
    const [lr] = await pool.query<RowDataPacket[]>(
      `SELECT lr.id, lr.document_id FROM learning_resources lr
       JOIN teaching_assignments ta ON lr.teaching_assignment_id = ta.id
       WHERE lr.id = ? AND ta.staff_id = ?`,
      [resourceId, staffId]
    );
    if (lr.length === 0) {
      throw new Error('Resource not found or unauthorized.');
    }

    if (lr[0].document_id) {
      await pool.query(`UPDATE documents SET deleted_at = NOW(3) WHERE id = ?`, [lr[0].document_id]);
    }

    await pool.query(`DELETE FROM learning_resources WHERE id = ?`, [resourceId]);
    return { success: true };
  }

  // =========================================================================
  // PAGE 10: STUDENT WELFARE & BEHAVIOR
  // =========================================================================

  async getDisciplineRecords(
    userId: number,
    filters?: {
      sectionId?: number;
      severity?: string;
      category?: string;
      search?: string;
    }
  ) {
    // Shows only incidents reported by the teacher, confidential counseling details omitted
    let query = `
      SELECT 
        d.id,
        d.student_id,
        d.enrollment_id,
        d.incident_date,
        d.category,
        d.severity,
        d.description,
        d.action_taken,
        d.created_at,
        d.updated_at,
        s.admission_no,
        CONCAT(s.first_name, ' ', s.father_name) as student_name,
        s.gender,
        sec.id as section_id,
        sec.name as section_name,
        g.display_name as grade_name
      FROM discipline_records d
      JOIN students s ON d.student_id = s.id
      LEFT JOIN enrollments e ON d.enrollment_id = e.id
      LEFT JOIN sections sec ON e.section_id = sec.id
      LEFT JOIN grades g ON sec.grade_id = g.id
      WHERE d.recorded_by = ?
    `;
    const params: any[] = [userId];

    if (filters?.sectionId) {
      query += ` AND e.section_id = ?`;
      params.push(filters.sectionId);
    }
    if (filters?.severity && filters.severity !== 'all') {
      query += ` AND d.severity = ?`;
      params.push(filters.severity);
    }
    if (filters?.category && filters.category !== 'all') {
      query += ` AND d.category = ?`;
      params.push(filters.category);
    }
    if (filters?.search && filters.search.trim()) {
      query += ` AND (CONCAT(s.first_name, ' ', s.father_name) LIKE ? OR s.admission_no LIKE ? OR d.description LIKE ? OR d.action_taken LIKE ?)`;
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY d.incident_date DESC, d.id DESC`;
    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  async reportDisciplineIncident(
    staffId: number,
    userId: number,
    payload: {
      studentId: number;
      incidentDate: string;
      category: string;
      severity: 'minor' | 'moderate' | 'serious';
      description: string;
      actionTaken?: string;
    }
  ) {
    // Verify teacher teaches student or is section homeroom teacher
    const [check] = await pool.query<RowDataPacket[]>(
      `SELECT e.id as enrollment_id
       FROM enrollments e
       LEFT JOIN teaching_assignments ta ON e.section_id = ta.section_id AND ta.staff_id = ?
       LEFT JOIN sections sec ON e.section_id = sec.id AND sec.homeroom_staff_id = ?
       WHERE e.student_id = ? AND (ta.staff_id IS NOT NULL OR sec.homeroom_staff_id IS NOT NULL) AND e.status = 'active'
       LIMIT 1`,
      [staffId, staffId, payload.studentId]
    );
    if (check.length === 0) {
      throw new Error('Forbidden: You can only record incidents for students you teach.');
    }

    const enrollmentId = check[0].enrollment_id;

    const [result] = await pool.query<any>(
      `INSERT INTO discipline_records (
        student_id,
        enrollment_id,
        incident_date,
        category,
        severity,
        description,
        action_taken,
        recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.studentId,
        enrollmentId,
        payload.incidentDate,
        payload.category,
        payload.severity,
        payload.description,
        payload.actionTaken || null,
        userId
      ]
    );

    return { id: result.insertId, ...payload };
  }

  async updateDisciplineRecord(
    staffId: number,
    userId: number,
    recordId: number,
    payload: {
      incidentDate?: string;
      category?: string;
      severity?: 'minor' | 'moderate' | 'serious';
      description?: string;
      actionTaken?: string;
    }
  ) {
    const [check] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM discipline_records WHERE id = ? AND recorded_by = ?`,
      [recordId, userId]
    );
    if (check.length === 0) {
      throw new Error('Forbidden: You can only update discipline records that you reported.');
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (payload.incidentDate !== undefined) {
      fields.push('incident_date = ?');
      params.push(payload.incidentDate);
    }
    if (payload.category !== undefined) {
      fields.push('category = ?');
      params.push(payload.category);
    }
    if (payload.severity !== undefined) {
      fields.push('severity = ?');
      params.push(payload.severity);
    }
    if (payload.description !== undefined) {
      fields.push('description = ?');
      params.push(payload.description);
    }
    if (payload.actionTaken !== undefined) {
      fields.push('action_taken = ?');
      params.push(payload.actionTaken || null);
    }

    if (fields.length > 0) {
      params.push(recordId, userId);
      await pool.query(
        `UPDATE discipline_records SET ${fields.join(', ')} WHERE id = ? AND recorded_by = ?`,
        params
      );
    }

    return { success: true, id: recordId };
  }

  async deleteDisciplineRecord(staffId: number, userId: number, recordId: number) {
    const [check] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM discipline_records WHERE id = ? AND recorded_by = ?`,
      [recordId, userId]
    );
    if (check.length === 0) {
      throw new Error('Forbidden: You can only delete discipline records that you reported.');
    }

    await pool.query(
      `DELETE FROM discipline_records WHERE id = ? AND recorded_by = ?`,
      [recordId, userId]
    );

    return { success: true, id: recordId };
  }

  // =========================================================================
  // PAGE 11: COMMUNICATION & PARENT CONTACT
  // =========================================================================

  async getContactableParents(staffId: number) {
    const query = `
      SELECT DISTINCT 
        g.id as guardian_id,
        CONCAT(g.first_name, ' ', g.father_name) as guardian_name,
        g.phone as guardian_phone,
        g.email as guardian_email,
        sg.relationship,
        s.id as student_id,
        s.admission_no,
        s.first_name,
        s.father_name,
        CONCAT(s.first_name, ' ', s.father_name) as student_name,
        sec.id as section_id,
        sec.name as section_name,
        gr.display_name as grade_name
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      JOIN student_guardians sg ON sg.student_id = s.id
      JOIN guardians g ON sg.guardian_id = g.id
      JOIN sections sec ON e.section_id = sec.id
      LEFT JOIN grades gr ON sec.grade_id = gr.id
      LEFT JOIN teaching_assignments ta ON ta.section_id = sec.id AND ta.staff_id = ? AND ta.is_active = 1
      WHERE (ta.staff_id IS NOT NULL OR sec.homeroom_staff_id = ?) AND e.status = 'active'
      ORDER BY section_name ASC, student_name ASC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [staffId, staffId]);
    return rows;
  }

  async getCommunications(
    staffId: number,
    filters?: {
      search?: string;
      recipientRole?: string;
    }
  ) {
    let query = `
      SELECT 
        pc.id,
        pc.recipient_role,
        pc.subject,
        pc.message,
        pc.sent_at,
        pc.guardian_id,
        pc.student_id,
        CONCAT(g.first_name, ' ', g.father_name) as guardian_name,
        g.phone as guardian_phone,
        CONCAT(s.first_name, ' ', s.father_name) as student_name,
        s.admission_no,
        sec.name as section_name
      FROM parent_communications pc
      LEFT JOIN guardians g ON pc.guardian_id = g.id
      LEFT JOIN students s ON pc.student_id = s.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN sections sec ON e.section_id = sec.id
      WHERE pc.teacher_staff_id = ?
    `;
    const params: any[] = [staffId];

    if (filters?.recipientRole && filters.recipientRole !== 'all') {
      query += ` AND pc.recipient_role = ?`;
      params.push(filters.recipientRole);
    }
    if (filters?.search && filters.search.trim()) {
      query += ` AND (pc.subject LIKE ? OR pc.message LIKE ? OR CONCAT(g.first_name, ' ', g.father_name) LIKE ? OR CONCAT(s.first_name, ' ', s.father_name) LIKE ? OR s.admission_no LIKE ?)`;
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term, term, term);
    }

    query += ` ORDER BY pc.sent_at DESC`;
    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  async sendCommunication(
    staffId: number,
    _userId: number,
    payload: {
      guardianId?: number;
      studentId?: number;
      recipientRole: 'guardian' | 'administration' | 'colleague';
      subject: string;
      message: string;
    }
  ) {
    const [result] = await pool.query<any>(
      `INSERT INTO parent_communications (
        teacher_staff_id,
        guardian_id,
        student_id,
        recipient_role,
        subject,
        message
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        staffId,
        payload.guardianId || null,
        payload.studentId || null,
        payload.recipientRole,
        payload.subject,
        payload.message
      ]
    );

    return { id: result.insertId, ...payload, sentAt: new Date() };
  }

  async deleteCommunication(staffId: number, messageId: number) {
    const [check] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM parent_communications WHERE id = ? AND teacher_staff_id = ?`,
      [messageId, staffId]
    );
    if (check.length === 0) {
      throw new Error('Forbidden: You can only delete messages sent by yourself.');
    }
    await pool.query(
      `DELETE FROM parent_communications WHERE id = ? AND teacher_staff_id = ?`,
      [messageId, staffId]
    );
    return { success: true, id: messageId };
  }

  async getMeetingRequests(
    staffId: number,
    filters?: {
      status?: string;
      search?: string;
    }
  ) {
    let query = `
      SELECT 
        pm.id,
        pm.guardian_id,
        pm.student_id,
        pm.requested_date,
        pm.requested_time,
        pm.agenda,
        pm.status,
        pm.meeting_notes,
        pm.created_at,
        pm.updated_at,
        CONCAT(g.first_name, ' ', g.father_name) as guardian_name,
        g.phone as guardian_phone,
        g.email as guardian_email,
        sg.relationship,
        CONCAT(s.first_name, ' ', s.father_name) as student_name,
        s.admission_no,
        sec.name as section_name
      FROM parent_meeting_requests pm
      JOIN guardians g ON pm.guardian_id = g.id
      JOIN students s ON pm.student_id = s.id
      LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.guardian_id = g.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN sections sec ON e.section_id = sec.id
      WHERE pm.teacher_staff_id = ?
    `;
    const params: any[] = [staffId];

    if (filters?.status && filters.status !== 'all') {
      query += ` AND pm.status = ?`;
      params.push(filters.status);
    }
    if (filters?.search && filters.search.trim()) {
      query += ` AND (pm.agenda LIKE ? OR CONCAT(g.first_name, ' ', g.father_name) LIKE ? OR CONCAT(s.first_name, ' ', s.father_name) LIKE ? OR s.admission_no LIKE ?)`;
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY pm.requested_date DESC, pm.id DESC`;
    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  async createMeetingRequest(
    staffId: number,
    payload: {
      guardianId: number;
      studentId: number;
      requestedDate: string;
      requestedTime: string;
      agenda: string;
    }
  ) {
    const [result] = await pool.query<any>(
      `INSERT INTO parent_meeting_requests (
        teacher_staff_id,
        guardian_id,
        student_id,
        requested_date,
        requested_time,
        agenda,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [
        staffId,
        payload.guardianId,
        payload.studentId,
        payload.requestedDate,
        payload.requestedTime,
        payload.agenda
      ]
    );

    return { id: result.insertId, ...payload, status: 'pending' };
  }

  async updateMeetingRequest(
    staffId: number,
    meetingId: number,
    payload: {
      status?: 'pending' | 'confirmed' | 'completed' | 'cancelled';
      meetingNotes?: string;
      requestedDate?: string;
      requestedTime?: string;
      agenda?: string;
    }
  ) {
    const [check] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM parent_meeting_requests WHERE id = ? AND teacher_staff_id = ?`,
      [meetingId, staffId]
    );
    if (check.length === 0) {
      throw new Error('Forbidden: You can only update meeting requests created by yourself.');
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (payload.status !== undefined) {
      fields.push('status = ?');
      params.push(payload.status);
    }
    if (payload.meetingNotes !== undefined) {
      fields.push('meeting_notes = ?');
      params.push(payload.meetingNotes || null);
    }
    if (payload.requestedDate !== undefined) {
      fields.push('requested_date = ?');
      params.push(payload.requestedDate);
    }
    if (payload.requestedTime !== undefined) {
      fields.push('requested_time = ?');
      params.push(payload.requestedTime);
    }
    if (payload.agenda !== undefined) {
      fields.push('agenda = ?');
      params.push(payload.agenda);
    }

    if (fields.length > 0) {
      params.push(meetingId, staffId);
      await pool.query(
        `UPDATE parent_meeting_requests SET ${fields.join(', ')} WHERE id = ? AND teacher_staff_id = ?`,
        params
      );
    }

    return { success: true, id: meetingId };
  }

  async deleteMeetingRequest(staffId: number, meetingId: number) {
    const [check] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM parent_meeting_requests WHERE id = ? AND teacher_staff_id = ?`,
      [meetingId, staffId]
    );
    if (check.length === 0) {
      throw new Error('Forbidden: You can only delete meeting requests created by yourself.');
    }
    await pool.query(
      `DELETE FROM parent_meeting_requests WHERE id = ? AND teacher_staff_id = ?`,
      [meetingId, staffId]
    );
    return { success: true, id: meetingId };
  }

  // =========================================================================
  // PAGE 12: REQUESTS & APPROVALS (TEACHER VIEW)
  // =========================================================================

  async getMyRequests(
    userId: number,
    filters?: {
      status?: string;
      type?: string;
      search?: string;
    }
  ) {
    let query = `
      SELECT 
        a.id,
        a.type,
        a.entity_type,
        a.entity_id,
        a.old_value_json,
        a.new_value_json,
        a.reason,
        a.status,
        a.decision_note,
        a.decided_at,
        a.created_at,
        u_dec.username as decided_by_username
      FROM approvals a
      LEFT JOIN users u_dec ON a.decided_by = u_dec.id
      WHERE a.requested_by = ?
    `;
    const params: any[] = [userId];

    if (filters?.status && filters.status !== 'all') {
      query += ` AND a.status = ?`;
      params.push(filters.status);
    }
    if (filters?.type && filters.type !== 'all') {
      query += ` AND a.type = ?`;
      params.push(filters.type);
    }
    if (filters?.search && filters.search.trim()) {
      query += ` AND (a.reason LIKE ? OR a.decision_note LIKE ? OR u_dec.username LIKE ? OR a.entity_type LIKE ?)`;
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY a.created_at DESC`;
    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows;
  }

  async createTeacherRequest(
    userId: number,
    staffId: number,
    payload: {
      type: 'leave_request' | 'attendance_edit_after_lock' | 'result_unlock' | 'timetable_change';
      entityType?: string;
      entityId?: number;
      reason: string;
      oldValueJson?: any;
      newValueJson: any;
    }
  ) {
    const validTypes = [
      'leave_request',
      'attendance_edit_after_lock',
      'result_unlock',
      'timetable_change'
    ];

    if (!validTypes.includes(payload.type)) {
      throw new Error(`Invalid request type: ${payload.type}`);
    }

    if (!payload.reason || !payload.reason.trim()) {
      throw new Error('A detailed reason or justification is required.');
    }

    let entityType = payload.entityType;
    let entityId = payload.entityId || null;

    if (payload.type === 'leave_request') {
      entityType = 'staff_leave';
      entityId = staffId;
    } else if (payload.type === 'attendance_edit_after_lock') {
      entityType = 'attendance_session';
    } else if (payload.type === 'result_unlock') {
      entityType = 'assessments';
    } else if (payload.type === 'timetable_change') {
      entityType = 'timetable_entry';
    }

    const [result] = await pool.query<any>(
      `INSERT INTO approvals (
        type,
        entity_type,
        entity_id,
        requested_by,
        old_value_json,
        new_value_json,
        reason,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        payload.type,
        entityType || 'general',
        entityId,
        userId,
        payload.oldValueJson ? JSON.stringify(payload.oldValueJson) : null,
        JSON.stringify(payload.newValueJson || {}),
        payload.reason.trim()
      ]
    );

    return {
      id: result.insertId,
      type: payload.type,
      entityType,
      entityId,
      status: 'pending',
      reason: payload.reason.trim(),
      newValueJson: payload.newValueJson,
      createdAt: new Date()
    };
  }

  async cancelMyRequest(userId: number, requestId: number) {
    const [check] = await pool.query<RowDataPacket[]>(
      `SELECT id, status FROM approvals WHERE id = ? AND requested_by = ?`,
      [requestId, userId]
    );

    if (check.length === 0) {
      throw new Error('Request not found or unauthorized.');
    }
    if (check[0].status !== 'pending') {
      throw new Error('Only pending requests can be cancelled.');
    }

    await pool.query(
      `UPDATE approvals SET status = 'cancelled', updated_at = NOW(3) WHERE id = ?`,
      [requestId]
    );

    return { id: requestId, status: 'cancelled' };
  }

  // =========================================================================
  // PAGE 14: LEAVE & STAFF SERVICES (VIEW ATTENDANCE & APPLY)
  // =========================================================================

  async getStaffAttendanceHistory(
    staffId: number,
    filters?: {
      status?: string;
      startDate?: string;
      endDate?: string;
    }
  ) {
    // 1. Fetch staff member profile info
    const [staffRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        s.id,
        s.employee_no,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as full_name,
        s.job_title,
        s.department,
        s.status as employment_status,
        s.hire_date
      FROM staff s
      WHERE s.id = ?`,
      [staffId]
    );

    // 2. Build attendance history query
    let query = `
      SELECT 
        sa.id,
        sa.attendance_date,
        sa.status,
        sa.note,
        sa.created_at
      FROM staff_attendance sa
      WHERE sa.staff_id = ?
    `;
    const params: any[] = [staffId];

    if (filters?.status && filters.status !== 'all') {
      query += ` AND sa.status = ?`;
      params.push(filters.status);
    }
    if (filters?.startDate) {
      query += ` AND sa.attendance_date >= ?`;
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      query += ` AND sa.attendance_date <= ?`;
      params.push(filters.endDate);
    }

    query += ` ORDER BY sa.attendance_date DESC LIMIT 150`;
    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    // 3. Calculate all-time status summary
    const [summaryRows] = await pool.query<RowDataPacket[]>(
      `SELECT status, COUNT(*) as cnt FROM staff_attendance WHERE staff_id = ? GROUP BY status`,
      [staffId]
    );

    let present = 0;
    let absent = 0;
    let late = 0;
    let onLeave = 0;

    summaryRows.forEach((r) => {
      const cnt = Number(r.cnt) || 0;
      if (r.status === 'present') present = cnt;
      else if (r.status === 'absent') absent = cnt;
      else if (r.status === 'late') late = cnt;
      else if (r.status === 'on_leave') onLeave = cnt;
    });

    const totalDays = present + absent + late + onLeave;
    const attendanceRate = totalDays > 0 ? Math.round(((present + late) / totalDays) * 100) : 100;

    return {
      staff: staffRows[0] || null,
      records: rows,
      summary: {
        totalDays,
        present,
        absent,
        late,
        onLeave,
        attendanceRate
      }
    };
  }

  async getMyLeaveApplications(userId: number) {
    const query = `
      SELECT 
        a.id,
        a.type,
        a.entity_type,
        a.entity_id,
        a.new_value_json,
        a.reason,
        a.status,
        a.decision_note,
        a.decided_at,
        a.created_at,
        u_dec.username as decided_by_username
      FROM approvals a
      LEFT JOIN users u_dec ON a.decided_by = u_dec.id
      WHERE a.requested_by = ? AND a.type = 'leave_request'
      ORDER BY a.created_at DESC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [userId]);
    return rows.map((r) => {
      let parsed = r.new_value_json;
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch (e) {}
      }
      return {
        ...r,
        new_value_json: parsed
      };
    });
  }

  async applyForLeave(
    staffId: number,
    userId: number,
    payload: {
      startDate: string;
      endDate: string;
      leaveType: string;
      reason: string;
      coverTeacher?: string;
      contactPhone?: string;
    }
  ) {
    if (!payload.startDate || !payload.endDate || !payload.reason?.trim()) {
      throw new Error('Start date, end date, and reason are required.');
    }

    const start = new Date(payload.startDate);
    const end = new Date(payload.endDate);
    if (end < start) {
      throw new Error('End date cannot be earlier than start date.');
    }

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const fullPayload = {
      ...payload,
      reason: payload.reason.trim(),
      totalDays
    };

    const [result] = await pool.query<any>(
      `INSERT INTO approvals (
        type,
        entity_type,
        entity_id,
        requested_by,
        new_value_json,
        reason,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [
        'leave_request',
        'staff_leave',
        staffId,
        userId,
        JSON.stringify(fullPayload),
        payload.reason.trim()
      ]
    );

    return { approvalId: result.insertId, status: 'pending', ...fullPayload };
  }

  // =========================================================================
  // PAGE 15: MY PROFILE
  // =========================================================================

  async getTeacherProfile(staffId: number, userId: number) {
    // 1. Staff and user info
    const [staffRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        s.id as staff_id,
        s.employee_no,
        CONCAT(s.first_name, ' ', s.father_name, ' ', COALESCE(s.grandfather_name, '')) as full_name,
        s.first_name,
        s.father_name,
        s.grandfather_name,
        s.name_am,
        s.gender,
        s.date_of_birth,
        s.phone,
        s.email,
        s.address,
        s.hire_date,
        s.staff_type,
        s.department,
        s.job_title,
        'Full-time' as contract_type,
        s.status as employment_status,
        u.id as user_id,
        u.username,
        u.created_at as account_created_at,
        u.last_login_at
       FROM staff s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = ? AND u.id = ?`,
      [staffId, userId]
    );

    // 2. Qualifications
    const [qualifications] = await pool.query<RowDataPacket[]>(
      `SELECT 
        sq.id,
        sq.qualification_level,
        sq.title,
        sq.institution,
        sq.field_of_study,
        sq.award_date,
        sq.grade_or_class,
        sq.registration_no,
        qd.verification_status,
        d.original_name as document_name,
        d.mime_type as document_type
       FROM staff_qualifications sq
       LEFT JOIN qualification_documents qd ON qd.qualification_id = sq.id
       LEFT JOIN documents d ON qd.document_id = d.id
       WHERE sq.staff_id = ? AND sq.deleted_at IS NULL
       ORDER BY sq.award_date DESC`,
      [staffId]
    );

    // 3. Active Sessions from refresh_sessions
    const [sessions] = await pool.query<RowDataPacket[]>(
      `SELECT 
        id,
        ip_address,
        user_agent,
        expires_at,
        issued_at as created_at
       FROM refresh_sessions
       WHERE user_id = ? AND expires_at >= NOW(3) AND revoked_at IS NULL
       ORDER BY issued_at DESC`,
      [userId]
    );

    // 4. Activity Trail from audit_logs
    const [activity] = await pool.query<RowDataPacket[]>(
      `SELECT 
        id,
        action,
        entity_type,
        entity_id,
        occurred_at as created_at
       FROM audit_logs
       WHERE actor_user_id = ?
       ORDER BY occurred_at DESC
       LIMIT 20`,
      [userId]
    );

    return {
      profile: staffRows[0] || null,
      qualifications,
      activeSessions: sessions,
      activityTrail: activity
    };
  }

  async revokeSession(userId: number, sessionId: number) {
    await pool.query(
      `UPDATE refresh_sessions SET revoked_at = NOW(3), revoked_reason = 'logout' WHERE id = ? AND user_id = ?`,
      [sessionId, userId]
    );
    return { success: true };
  }
}

