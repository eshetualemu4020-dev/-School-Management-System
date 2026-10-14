import { pool } from '../../config/database';
import { RowDataPacket } from 'mysql2';

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

  async getTimetable(staffId: number) {
    const query = `
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
      ORDER BY ts.day_of_week ASC, ts.start_time ASC
    `;
    const [rows] = await pool.query<RowDataPacket[]>(query, [staffId]);
    return rows;
  }

  async getAnnouncements() {
    const query = `
      SELECT 
        id,
        title,
        body,
        published_at,
        created_at
      FROM announcements
      WHERE status = 'published' AND (expires_at IS NULL OR expires_at >= NOW())
      ORDER BY published_at DESC
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
}
