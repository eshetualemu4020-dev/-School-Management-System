import { pool } from '../../config/database';
import { RowDataPacket } from 'mysql2/promise';

export class ParentRepository {
  async getGuardianByUserId(userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, first_name, father_name, phone, email, verification_status 
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
         e.id as enrollment_id,
         e.roll_no,
         sec.id as section_id,
         sec.name as section_name,
         sec.stream,
         g.grade_level,
         g.display_name as grade_name
       FROM student_guardians sg
       JOIN students s ON sg.student_id = s.id
       JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       JOIN sections sec ON e.section_id = sec.id
       JOIN grades g ON sec.grade_id = g.id
       WHERE sg.guardian_id = ?
       ORDER BY s.first_name ASC`,
      [guardianId]
    );
    return rows;
  }

  async verifyChildAccess(guardianId: number, studentId: number): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 FROM student_guardians WHERE guardian_id = ? AND student_id = ? LIMIT 1`,
      [guardianId, studentId]
    );
    return rows.length > 0;
  }

  async getChildOverview(studentId: number) {
    const [studRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id,
         s.admission_no,
         s.first_name,
         s.father_name,
         e.id as enrollment_id,
         sec.id as section_id,
         sec.name as section_name,
         g.grade_level,
         g.display_name as grade_name
       FROM students s
       JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       JOIN sections sec ON e.section_id = sec.id
       JOIN grades g ON sec.grade_id = g.id
       WHERE s.id = ? LIMIT 1`,
      [studentId]
    );

    if (studRows.length === 0) return null;
    const info = studRows[0];

    // Attendance stats
    const [attRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status_code = 'present' THEN 1 ELSE 0 END) as present,
         SUM(CASE WHEN status_code = 'absent' THEN 1 ELSE 0 END) as absent,
         SUM(CASE WHEN status_code = 'late' THEN 1 ELSE 0 END) as late,
         SUM(CASE WHEN status_code = 'excused' THEN 1 ELSE 0 END) as excused
       FROM attendance_records
       WHERE enrollment_id = ?`,
      [info.enrollment_id]
    );

    const total = Number(attRows[0]?.total || 0);
    const present = Number(attRows[0]?.present || 0);
    const absent = Number(attRows[0]?.absent || 0);
    const rate = total > 0 ? Number(((present / total) * 100).toFixed(1)) : 100.0;

    // Recent Marks
    const [marksRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         m.score,
         a.max_score,
         a.title as assessment_title,
         sub.name as subject_name
       FROM marks m
       JOIN assessments a ON m.assessment_id = a.id
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
       WHERE m.enrollment_id = ?
       ORDER BY a.assessment_date DESC
       LIMIT 5`,
      [info.enrollment_id]
    );

    // Invoices summary
    const [finRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         IFNULL((SELECT SUM(line_total) FROM invoice_items ii JOIN invoices inv ON ii.invoice_id = inv.id WHERE inv.student_id = ?), 0) as totalInvoiced,
         IFNULL((SELECT SUM(p.amount) FROM payments p WHERE p.student_id = ? AND p.status = 'posted'), 0) as totalPaid`,
      [studentId, studentId]
    );

    const totalInvoiced = Number(finRows[0]?.totalInvoiced || 0);
    const totalPaid = Number(finRows[0]?.totalPaid || 0);

    return {
      studentInfo: info,
      attendance: {
        total,
        present,
        absent,
        late: Number(attRows[0]?.late || 0),
        excused: Number(attRows[0]?.excused || 0),
        rate
      },
      recentMarks: marksRows,
      finance: {
        totalInvoiced,
        totalPaid,
        outstanding: Math.max(0, totalInvoiced - totalPaid)
      }
    };
  }

  async getChildAttendance(enrollmentId: number) {
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
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         m.id as mark_id,
         m.score,
         m.feedback,
         a.title as assessment_title,
         a.max_score,
         a.weight,
         a.assessment_date,
         sub.name as subject_name,
         sub.code as subject_code
       FROM marks m
       JOIN assessments a ON m.assessment_id = a.id
       JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
       JOIN subjects sub ON ta.subject_id = sub.id
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

  async getChildFinance(studentId: number) {
    const [invoices] = await pool.query<RowDataPacket[]>(
      `SELECT 
         inv.id,
         inv.invoice_no,
         inv.issue_date,
         inv.due_date,
         inv.status,
         inv.notes,
         SUM(ii.line_total) as total_amount
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
