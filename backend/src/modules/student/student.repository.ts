import { pool } from '../../config/database';
import { RowDataPacket } from 'mysql2/promise';

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
       JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       JOIN sections sec ON e.section_id = sec.id
       JOIN grades g ON sec.grade_id = g.id
       JOIN academic_years ay ON sec.academic_year_id = ay.id
       WHERE s.user_id = ?
       LIMIT 1`,
      [userId]
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
      `SELECT id, title, body, published_at 
       FROM announcements 
       WHERE status = 'published'
       ORDER BY published_at DESC 
       LIMIT 10`
    );
    return rows;
  }
}
