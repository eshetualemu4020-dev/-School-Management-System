import { pool } from '../../config/database';
import { RowDataPacket } from 'mysql2/promise';

export class ParentRepository {
  async getGuardianByUserId(userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, first_name, father_name, phone, email, verification_status, preferred_language
       FROM guardians 
       WHERE user_id = ? 
       LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  }

  async getLinkedChildren(guardianId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id as student_id,
         s.admission_no,
         s.first_name,
         s.father_name,
         s.grandfather_name,
         s.gender,
         s.date_of_birth,
         s.status as student_status,
         sg.relationship,
         sg.is_primary,
         sg.can_view_results,
         sg.can_view_attendance,
         sg.can_view_fees,
         sg.can_message_staff,
         sg.status as link_status,
         sg.verified_at,
         e.id as enrollment_id,
         e.status as enrollment_status,
         e.roll_no,
         sec.id as section_id,
         sec.name as section_name,
         sec.stream,
         g.id as grade_id,
         g.grade_level,
         g.display_name as grade_name,
         ay.id as academic_year_id,
         ay.name as academic_year_name
       FROM student_guardians sg
       JOIN students s ON sg.student_id = s.id
       LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       LEFT JOIN sections sec ON e.section_id = sec.id
       LEFT JOIN grades g ON sec.grade_id = g.id
       LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
       WHERE sg.guardian_id = ? AND s.deleted_at IS NULL AND sg.ended_at IS NULL
       ORDER BY s.first_name ASC`,
      [guardianId]
    );
    return rows;
  }

  async verifyChildAccess(guardianId: number, studentId: number): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 
       FROM student_guardians sg
       JOIN guardians g ON sg.guardian_id = g.id
       WHERE sg.guardian_id = ? AND sg.student_id = ? AND sg.status = 'active' AND sg.ended_at IS NULL AND g.verification_status = 'verified'
       LIMIT 1`,
      [guardianId, studentId]
    );
    return rows.length > 0;
  }

  async getChildOverview(studentId: number, enrollmentId?: number, sectionId?: number) {
    const [studRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id,
         s.admission_no,
         s.first_name,
         s.father_name,
         s.status as student_status,
         e.id as enrollment_id,
         e.roll_no,
         sec.id as section_id,
         sec.name as section_name,
         sec.stream,
         g.id as grade_id,
         g.grade_level,
         g.display_name as grade_name,
         ay.id as academic_year_id,
         ay.name as academic_year_name
       FROM students s
       LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       LEFT JOIN sections sec ON e.section_id = sec.id
       LEFT JOIN grades g ON sec.grade_id = g.id
       LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
       WHERE s.id = ? LIMIT 1`,
      [studentId]
    );

    if (studRows.length === 0) return null;
    const info = studRows[0];
    const activeEnrollmentId = enrollmentId || info.enrollment_id;
    const activeSectionId = sectionId || info.section_id;

    // Attendance stats
    let total = 0;
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    let rate = 100.0;

    if (activeEnrollmentId) {
      const [attRows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           COUNT(*) as total,
           SUM(CASE WHEN status_code = 'present' THEN 1 ELSE 0 END) as present,
           SUM(CASE WHEN status_code = 'absent' THEN 1 ELSE 0 END) as absent,
           SUM(CASE WHEN status_code = 'late' THEN 1 ELSE 0 END) as late,
           SUM(CASE WHEN status_code = 'excused' THEN 1 ELSE 0 END) as excused
         FROM attendance_records
         WHERE enrollment_id = ?`,
        [activeEnrollmentId]
      );

      total = Number(attRows[0]?.total || 0);
      present = Number(attRows[0]?.present || 0);
      absent = Number(attRows[0]?.absent || 0);
      late = Number(attRows[0]?.late || 0);
      excused = Number(attRows[0]?.excused || 0);
      rate = total > 0 ? Number(((present / total) * 100).toFixed(1)) : 100.0;
    }

    // Recent Marks
    let marksRows: any[] = [];
    if (activeEnrollmentId) {
      const [mRows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           m.score,
           a.max_score,
           a.title as assessment_title,
           a.assessment_date,
           sub.name as subject_name
         FROM marks m
         JOIN assessments a ON m.assessment_id = a.id
         JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
         JOIN subjects sub ON ta.subject_id = sub.id
         WHERE m.enrollment_id = ?
         ORDER BY a.assessment_date DESC
         LIMIT 5`,
        [activeEnrollmentId]
      );
      marksRows = mRows;
    }

    // Upcoming Assessments
    let upcomingAssessments: any[] = [];
    if (activeSectionId) {
      const [upRows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           a.id,
           a.title,
           COALESCE(at.name, 'Assessment') as assessment_type,
           a.max_score,
           a.assessment_date,
           sub.name as subject_name
         FROM assessments a
         JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
         JOIN subjects sub ON ta.subject_id = sub.id
         LEFT JOIN assessment_types at ON a.assessment_type_id = at.id
         WHERE ta.section_id = ? AND a.assessment_date >= CURDATE()
         ORDER BY a.assessment_date ASC
         LIMIT 4`,
        [activeSectionId]
      );
      upcomingAssessments = upRows;
    }

    // Report card summary
    let reportCardSummary: any = null;
    if (activeEnrollmentId) {
      const [rcRows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           average_percent as gpa, 
           class_rank as rank_in_section, 
           class_size as total_students,
           issued_at
         FROM report_card_snapshots
         WHERE enrollment_id = ?
         ORDER BY id DESC LIMIT 1`,
        [activeEnrollmentId]
      );
      if (rcRows.length > 0) {
        reportCardSummary = rcRows[0];
      }
    }

    return {
      studentInfo: info,
      attendance: {
        total,
        present,
        absent,
        late,
        excused,
        rate
      },
      recentMarks: marksRows,
      upcomingAssessments,
      reportCard: reportCardSummary
    };
  }

  async getChildAttendance(enrollmentId: number) {
    if (!enrollmentId) return [];
    const [rows] = await pool.query<RowDataPacket[]>(
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
    return rows;
  }

  async getChildMarks(enrollmentId: number) {
    if (!enrollmentId) return [];
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         m.id as mark_id,
         m.score,
         m.feedback,
         a.title as assessment_title,
         COALESCE(at.name, 'Assessment') as assessment_type,
         a.max_score,
         a.weight,
         a.assessment_date,
         sub.name as subject_name,
         sub.code as subject_code
       FROM marks m
       JOIN assessments a ON m.assessment_id = a.id
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       LEFT JOIN assessment_types at ON a.assessment_type_id = at.id
       WHERE m.enrollment_id = ?
       ORDER BY a.assessment_date DESC`,
      [enrollmentId]
    );

    return rows.map((r) => {
      const scoreNum = r.score !== null ? Number(r.score) : null;
      const maxNum = Number(r.max_score);
      const percentage = scoreNum !== null && maxNum > 0 ? Number(((scoreNum / maxNum) * 100).toFixed(1)) : null;
      return { ...r, percentage };
    });
  }

  async getChildSubjects(sectionId: number) {
    if (!sectionId) return [];
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         sub.id as subject_id,
         sub.name as subject_name,
         sub.code as subject_code,
         sub.description,
         ta.id as teaching_assignment_id,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
         st.phone as teacher_phone,
         st.email as teacher_email,
         (
           SELECT COUNT(*) FROM learning_resources lr
           WHERE lr.teaching_assignment_id = ta.id AND (lr.visibility = 'section' OR lr.visibility IS NULL)
         ) as materials_count
       FROM teaching_assignments ta
       JOIN subjects sub ON ta.subject_id = sub.id
       LEFT JOIN staff st ON ta.staff_id = st.id
       WHERE ta.section_id = ? AND ta.is_active = 1
       ORDER BY sub.name ASC`,
      [sectionId]
    );
    return rows;
  }

  async getChildTimetable(sectionId: number) {
    if (!sectionId) return [];
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         te.id,
         te.section_id,
         te.subject_id,
         ts.day_of_week,
         ts.start_time,
         ts.end_time,
         ts.label as slot_label,
         sub.name as subject_name,
         sub.code as subject_code,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
         c.name as room_number,
         c.name as room_name,
         c.building
       FROM timetable_entries te
       JOIN time_slots ts ON te.time_slot_id = ts.id
       JOIN subjects sub ON te.subject_id = sub.id
       LEFT JOIN staff st ON te.staff_id = st.id
       LEFT JOIN classrooms c ON te.room_id = c.id
       WHERE te.section_id = ?
       ORDER BY ts.day_of_week ASC, ts.start_time ASC`,
      [sectionId]
    );
    return rows;
  }

  async getChildAssessments(sectionId: number, enrollmentId: number) {
    let upcoming: any[] = [];
    let past: any[] = [];

    if (sectionId) {
      const [upRows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           a.id,
           a.title,
           COALESCE(at.name, 'Assessment') as assessment_type,
           a.max_score,
           a.weight,
           a.assessment_date,
           sub.name as subject_name,
           CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name
         FROM assessments a
         JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
         JOIN subjects sub ON ta.subject_id = sub.id
         LEFT JOIN assessment_types at ON a.assessment_type_id = at.id
         LEFT JOIN staff st ON ta.staff_id = st.id
         WHERE ta.section_id = ? AND a.assessment_date >= CURDATE()
         ORDER BY a.assessment_date ASC`,
        [sectionId]
      );
      upcoming = upRows;
    }

    if (sectionId && enrollmentId) {
      const [pastRows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           a.id,
           a.title,
           COALESCE(at.name, 'Assessment') as assessment_type,
           a.max_score,
           a.weight,
           a.assessment_date,
           sub.name as subject_name,
           m.score,
           m.feedback
         FROM assessments a
         JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
         JOIN subjects sub ON ta.subject_id = sub.id
         LEFT JOIN assessment_types at ON a.assessment_type_id = at.id
         LEFT JOIN marks m ON m.assessment_id = a.id AND m.enrollment_id = ?
         WHERE ta.section_id = ? AND a.assessment_date < CURDATE()
         ORDER BY a.assessment_date DESC`,
        [enrollmentId, sectionId]
      );
      past = pastRows;
    }

    return { upcoming, past };
  }

  async getChildDocuments(studentId: number, enrollmentId: number) {
    let reportCards: any[] = [];
    if (enrollmentId) {
      const [rcRows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           rcs.id,
           rcs.enrollment_id,
           rcs.term_id,
           t.name as term_name,
           rcs.average_percent as gpa,
           rcs.class_rank as rank_in_section,
           rcs.class_size as total_students,
           rcs.issued_at,
           rcs.generated_at
         FROM report_card_snapshots rcs
         LEFT JOIN terms t ON rcs.term_id = t.id
         WHERE rcs.enrollment_id = ?
         ORDER BY rcs.id DESC`,
        [enrollmentId]
      );
      reportCards = rcRows;
    }

    const [transcripts] = await pool.query<RowDataPacket[]>(
      `SELECT 
         sr.id as request_id,
         sr.request_no,
         sr.request_type,
         sr.status,
         sr.created_at,
         d.id as document_id,
         d.original_name as file_name,
         d.doc_type,
         d.mime_type,
         d.size_bytes
       FROM student_requests sr
       LEFT JOIN documents d ON sr.document_id = d.id
       WHERE sr.student_id = ? AND sr.status = 'approved'
       ORDER BY sr.created_at DESC`,
      [studentId]
    );

    return { reportCards, transcripts };
  }

  async getChildEnrollmentHistory(studentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         e.id as enrollment_id,
         e.status as enrollment_status,
         e.roll_no,
         e.enrolled_on,
         e.ended_on,
         g.grade_level,
         g.display_name as grade_name,
         sec.name as section_name,
         sec.stream,
         ay.name as academic_year_name,
         ay.start_date,
         ay.end_date
       FROM enrollments e
       JOIN sections sec ON e.section_id = sec.id
       JOIN grades g ON sec.grade_id = g.id
       JOIN academic_years ay ON e.academic_year_id = ay.id
       WHERE e.student_id = ?
       ORDER BY ay.start_date DESC, e.enrolled_on DESC`,
      [studentId]
    );
    return rows;
  }

  async getParentRequests(guardianId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         pr.id,
         pr.request_no,
         pr.guardian_id,
         pr.student_id,
         s.first_name as student_first_name,
         s.father_name as student_father_name,
         s.admission_no,
         pr.category,
         pr.subject,
         pr.description,
         pr.status,
         pr.assigned_role,
         pr.created_at,
         pr.resolved_at
       FROM parent_requests pr
       LEFT JOIN students s ON pr.student_id = s.id
       WHERE pr.guardian_id = ?
       ORDER BY pr.created_at DESC`,
      [guardianId]
    );

    const requestIds = rows.map((r) => r.id);
    let replies: any[] = [];
    if (requestIds.length > 0) {
      const [replyRows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           prr.id,
           prr.request_id,
           prr.sender_role,
           prr.reply_text,
           prr.created_at,
           u.username as sender_username
         FROM parent_request_replies prr
         JOIN users u ON prr.sender_user_id = u.id
         WHERE prr.request_id IN (?)
         ORDER BY prr.created_at ASC`,
        [requestIds]
      );
      replies = replyRows;
    }

    return rows.map((r) => ({
      ...r,
      replies: replies.filter((rep) => rep.request_id === r.id)
    }));
  }

  async createParentRequest(
    guardianId: number,
    studentId: number | null,
    data: { category: string; subject: string; description: string }
  ) {
    const requestNo = `PR-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const [result]: any = await pool.query(
      `INSERT INTO parent_requests (request_no, guardian_id, student_id, category, subject, description, status)
       VALUES (?, ?, ?, ?, ?, ?, 'submitted')`,
      [requestNo, guardianId, studentId || null, data.category, data.subject, data.description]
    );
    return { id: result.insertId, request_no: requestNo, ...data, status: 'submitted' };
  }

  async getChildFinance(studentId: number) {
    const [invoices] = await pool.query<RowDataPacket[]>(
      `SELECT 
         inv.id,
         inv.invoice_no,
         inv.issue_date,
         inv.due_date,
         inv.status,
         inv.notes,
         SUM(ii.line_total) as total_amount,
         IFNULL((
           SELECT SUM(pa.allocated_amount)
           FROM payment_allocations pa
           JOIN payments p ON p.id = pa.payment_id
           WHERE pa.invoice_id = inv.id AND p.status = 'posted'
         ), 0) as paid_amount
       FROM invoices inv
       LEFT JOIN invoice_items ii ON inv.id = ii.invoice_id
       WHERE inv.student_id = ?
       GROUP BY inv.id
       ORDER BY inv.issue_date DESC`,
      [studentId]
    );

    const [payments] = await pool.query<RowDataPacket[]>(
      `SELECT 
         id,
         receipt_no,
         amount,
         method,
         reference,
         payer_name,
         received_at,
         status
       FROM payments
       WHERE student_id = ?
       ORDER BY received_at DESC`,
      [studentId]
    );

    return { invoices, payments };
  }

  async getAnnouncements(guardianId?: number, studentId?: number) {
    let sql = `
      SELECT DISTINCT a.id, a.title, a.body, a.published_at,
             COALESCE(CONCAT_WS(' ', st.first_name, st.father_name), u.username, 'School Administration') as published_by_name
      FROM announcements a
      LEFT JOIN users u ON a.published_by = u.id
      LEFT JOIN staff st ON st.user_id = u.id
      WHERE a.status = 'published' AND a.deleted_at IS NULL AND (a.expires_at IS NULL OR a.expires_at >= NOW(3))
    `;

    const params: any[] = [];

    if (studentId) {
      sql += `
        AND (
          NOT EXISTS (SELECT 1 FROM announcement_targets any_t WHERE any_t.announcement_id = a.id)
          OR EXISTS (
            SELECT 1 FROM announcement_targets target
            JOIN enrollments e ON e.student_id = ? AND e.status = 'active'
            JOIN sections sec ON e.section_id = sec.id
            WHERE target.announcement_id = a.id
              AND (
                target.target_type = 'all'
                OR (target.target_type = 'grade' AND target.target_id = sec.grade_id)
                OR (target.target_type = 'section' AND target.target_id = sec.id)
              )
          )
        )
      `;
      params.push(studentId);
    } else if (guardianId) {
      sql += `
        AND (
          NOT EXISTS (SELECT 1 FROM announcement_targets any_t WHERE any_t.announcement_id = a.id)
          OR EXISTS (
            SELECT 1 FROM announcement_targets target
            LEFT JOIN roles r ON r.id = target.target_id
            LEFT JOIN (
              SELECT DISTINCT sec.grade_id, sec.id as section_id
              FROM student_guardians sg
              JOIN enrollments e ON sg.student_id = e.student_id AND e.status = 'active'
              JOIN sections sec ON e.section_id = sec.id
              WHERE sg.guardian_id = ? AND sg.status = 'active' AND sg.ended_at IS NULL
            ) kids ON (
              (target.target_type = 'grade' AND target.target_id = kids.grade_id)
              OR (target.target_type = 'section' AND target.target_id = kids.section_id)
            )
            WHERE target.announcement_id = a.id
              AND (
                target.target_type = 'all'
                OR (target.target_type = 'role' AND r.code = 'guardian')
                OR kids.grade_id IS NOT NULL
              )
          )
        )
      `;
      params.push(guardianId);
    }

    sql += ` ORDER BY a.published_at DESC LIMIT 30`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async getTeacherCommunications(guardianId: number, studentId?: number) {
    let sql = `
      SELECT 
        pc.id,
        pc.subject,
        pc.message,
        pc.sent_at,
        pc.created_at,
        CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
        st.email as teacher_email,
        st.phone as teacher_phone,
        s.id as student_id,
        CONCAT_WS(' ', s.first_name, s.father_name) as student_name,
        s.admission_no
      FROM parent_communications pc
      JOIN staff st ON pc.teacher_staff_id = st.id
      LEFT JOIN students s ON pc.student_id = s.id
      WHERE (pc.guardian_id = ? OR pc.guardian_id IS NULL)
    `;
    const params: any[] = [guardianId];

    if (studentId) {
      sql += ` AND pc.student_id = ?`;
      params.push(studentId);
    }

    sql += ` ORDER BY pc.sent_at DESC LIMIT 30`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async getMeetingRequests(guardianId: number, studentId?: number) {
    let sql = `
      SELECT 
        mr.id,
        mr.teacher_staff_id,
        mr.guardian_id,
        mr.student_id,
        mr.requested_date,
        mr.requested_time,
        mr.agenda,
        mr.status,
        mr.meeting_notes,
        mr.created_at,
        CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
        st.email as teacher_email,
        st.phone as teacher_phone,
        CONCAT_WS(' ', s.first_name, s.father_name) as student_name,
        s.admission_no
      FROM parent_meeting_requests mr
      JOIN staff st ON mr.teacher_staff_id = st.id
      JOIN students s ON mr.student_id = s.id
      WHERE mr.guardian_id = ?
    `;
    const params: any[] = [guardianId];

    if (studentId) {
      sql += ` AND mr.student_id = ?`;
      params.push(studentId);
    }

    sql += ` ORDER BY mr.created_at DESC LIMIT 30`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async createMeetingRequest(
    guardianId: number,
    data: { teacherStaffId: number; studentId: number; requestedDate: string; requestedTime: string; agenda: string }
  ) {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO parent_meeting_requests 
        (teacher_staff_id, guardian_id, student_id, requested_date, requested_time, agenda, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [data.teacherStaffId, guardianId, data.studentId, data.requestedDate, data.requestedTime, data.agenda]
    );
    return result.insertId;
  }

  async getStaffTeachingStudent(studentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT
         st.id as staff_id,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
         st.email as teacher_email,
         sub.name as subject_name
       FROM enrollments e
       JOIN teaching_assignments ta ON e.section_id = ta.section_id AND ta.is_active = 1
       JOIN staff st ON ta.staff_id = st.id
       JOIN subjects sub ON ta.subject_id = sub.id
       WHERE e.student_id = ? AND e.status = 'active'
       ORDER BY teacher_name ASC`,
      [studentId]
    );
    return rows;
  }
}
