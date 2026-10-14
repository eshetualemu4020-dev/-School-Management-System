import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';

export interface AttendanceRecordInput {
  enrollmentId: number;
  statusCode: 'present' | 'absent' | 'late' | 'excused';
  note?: string;
}

export class AttendanceRepository {
  async findSession(sectionId: number, date: string, subjectId?: number): Promise<RowDataPacket | null> {
    let sql = `
      SELECT id, section_id, attendance_date, subject_id, status, submitted_at, recorded_by_staff_id
      FROM attendance_sessions
      WHERE section_id = ? AND attendance_date = ?
    `;
    const params: any[] = [sectionId, date];
    if (subjectId) {
      sql += ` AND (subject_id = ? OR subject_id IS NULL)`;
      params.push(subjectId);
    }
    sql += ` ORDER BY id DESC LIMIT 1`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows[0] || null;
  }

  async getSessionWithRecords(sessionId: number) {
    const [sessionRows] = await pool.query<RowDataPacket[]>(
      `SELECT s.id, s.section_id, s.attendance_date, s.subject_id, s.status, s.submitted_at, s.recorded_by_staff_id,
              sec.name as section_name, g.display_name as grade_name, sub.name as subject_name
       FROM attendance_sessions s
       JOIN sections sec ON s.section_id = sec.id
       JOIN grades g ON sec.grade_id = g.id
       LEFT JOIN subjects sub ON s.subject_id = sub.id
       WHERE s.id = ?`,
      [sessionId]
    );

    if (sessionRows.length === 0) return null;

    const [recordRows] = await pool.query<RowDataPacket[]>(
      `SELECT ar.id, ar.session_id, ar.enrollment_id, ar.status_code, ar.note,
              st.id as student_id, st.admission_no, st.first_name, st.father_name,
              CONCAT(st.first_name, ' ', st.father_name) as student_name,
              e.roll_no
       FROM attendance_records ar
       JOIN enrollments e ON ar.enrollment_id = e.id
       JOIN students st ON e.student_id = st.id
       WHERE ar.session_id = ?
       ORDER BY e.roll_no ASC, st.first_name ASC`,
      [sessionId]
    );

    return {
      session: sessionRows[0],
      records: recordRows
    };
  }

  async getAttendanceHistory(sectionId: number, startDate?: string, endDate?: string) {
    let sql = `
      SELECT 
        s.id as session_id,
        s.attendance_date,
        s.status,
        s.submitted_at,
        sub.name as subject_name,
        COUNT(ar.id) as total_students,
        SUM(CASE WHEN ar.status_code = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN ar.status_code = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN ar.status_code = 'late' THEN 1 ELSE 0 END) as late_count,
        SUM(CASE WHEN ar.status_code = 'excused' THEN 1 ELSE 0 END) as excused_count
      FROM attendance_sessions s
      LEFT JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN attendance_records ar ON s.id = ar.session_id
      WHERE s.section_id = ?
    `;
    const params: any[] = [sectionId];

    if (startDate) {
      sql += ` AND s.attendance_date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND s.attendance_date <= ?`;
      params.push(endDate);
    }

    sql += ` GROUP BY s.id, s.attendance_date, s.status, s.submitted_at, sub.name ORDER BY s.attendance_date DESC LIMIT 30`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  // Database Transactional Execution for Recording Attendance
  async saveAttendanceTransaction(
    staffId: number,
    userId: number,
    username: string,
    sectionId: number,
    attendanceDate: string,
    subjectId: number | null,
    status: 'submitted' | 'locked',
    records: AttendanceRecordInput[]
  ) {
    const conn: PoolConnection = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check if session already exists
      let [existing] = await conn.query<RowDataPacket[]>(
        `SELECT id, status FROM attendance_sessions WHERE section_id = ? AND attendance_date = ? FOR UPDATE`,
        [sectionId, attendanceDate]
      );

      let sessionId: number;

      if (existing.length > 0) {
        sessionId = existing[0].id;
        if (existing[0].status === 'locked') {
          throw new Error('ERP-ATT-01: Attendance session is locked against alteration.');
        }

        // Update session status
        await conn.query(
          `UPDATE attendance_sessions 
           SET status = ?, submitted_at = NOW(), recorded_by_staff_id = ? 
           WHERE id = ?`,
          [status, staffId, sessionId]
        );
      } else {
        // Create new session
        const [res] = await conn.query<ResultSetHeader>(
          `INSERT INTO attendance_sessions (section_id, attendance_date, subject_id, recorded_by_staff_id, status, submitted_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [sectionId, attendanceDate, subjectId, staffId, status]
        );
        sessionId = res.insertId;
      }

      // Upsert student attendance records
      for (const rec of records) {
        await conn.query(
          `INSERT INTO attendance_records (session_id, enrollment_id, status_code, note, marked_by)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
             status_code = VALUES(status_code),
             note = VALUES(note),
             marked_by = VALUES(marked_by)`,
          [sessionId, rec.enrollmentId, rec.statusCode, rec.note || null, userId]
        );
      }

      // Write to audit_logs
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (?, ?, 'attendance.record', 'attendance_sessions', ?, 'success', ?, ?)`,
        [
          userId,
          username,
          String(sessionId),
          JSON.stringify({ sectionId, attendanceDate, totalRecords: records.length, status }),
          'Recorded daily section attendance'
        ]
      );

      await conn.commit();
      return sessionId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
