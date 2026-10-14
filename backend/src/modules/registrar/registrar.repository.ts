import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export class RegistrarRepository {
  async getDashboardMetrics() {
    const [counts] = await pool.query<RowDataPacket[]>(
      `SELECT 
         (SELECT COUNT(*) FROM students) as totalStudents,
         (SELECT COUNT(*) FROM students WHERE status = 'active') as activeStudents,
         (SELECT COUNT(*) FROM students WHERE status = 'applicant') as applicantStudents,
         (SELECT COUNT(*) FROM students WHERE status = 'transferred') as transferredStudents,
         (SELECT COUNT(*) FROM transfers_withdrawals) as totalTransfersWithdrawals,
         (SELECT COUNT(*) FROM documents WHERE owner_type = 'student') as verifiedDocuments`
    );

    return {
      totalStudents: Number(counts[0]?.totalStudents || 0),
      activeStudents: Number(counts[0]?.activeStudents || 0),
      applicantStudents: Number(counts[0]?.applicantStudents || 0),
      transferredStudents: Number(counts[0]?.transferredStudents || 0),
      totalTransfers: Number(counts[0]?.totalTransfersWithdrawals || 0),
      verifiedDocuments: Number(counts[0]?.verifiedDocuments || 0)
    };
  }

  async getStudents(search?: string, sectionId?: number, status?: string) {
    let sql = `
      SELECT 
        s.id,
        s.admission_no,
        s.first_name,
        s.father_name,
        s.grandfather_name,
        s.gender,
        s.date_of_birth,
        s.admission_date,
        s.status as student_status,
        s.phone,
        e.id as enrollment_id,
        e.roll_no,
        e.status as enrollment_status,
        sec.id as section_id,
        sec.name as section_name,
        sec.stream,
        g.grade_level,
        g.display_name as grade_name
      FROM students s
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN sections sec ON e.section_id = sec.id
      LEFT JOIN grades g ON sec.grade_id = g.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      sql += ` AND (s.admission_no LIKE ? OR s.first_name LIKE ? OR s.father_name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (sectionId) {
      sql += ` AND sec.id = ?`;
      params.push(sectionId);
    }

    if (status) {
      sql += ` AND s.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY g.grade_level ASC, sec.name ASC, s.admission_no ASC LIMIT 100`;

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async getSectionsWithAvailability() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id,
         s.name as section_name,
         s.stream,
         s.capacity,
         g.grade_level,
         g.display_name as grade_name,
         ay.name as academic_year_name,
         COUNT(e.id) as enrolled_count,
         (s.capacity - COUNT(e.id)) as available_seats
       FROM sections s
       JOIN grades g ON s.grade_id = g.id
       JOIN academic_years ay ON s.academic_year_id = ay.id
       LEFT JOIN enrollments e ON s.id = e.section_id AND e.status = 'active'
       WHERE s.status = 'active'
       GROUP BY s.id
       ORDER BY g.grade_level, s.name`
    );
    return rows;
  }

  async registerStudent(payload: {
    admissionNo: string;
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    dateOfBirth: string;
    sectionId: number;
    phone?: string;
    address?: string;
    registeredByUserId: number;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check section capacity
      const [secRows] = await conn.query<RowDataPacket[]>(
        `SELECT s.id, s.capacity, s.academic_year_id,
                (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') as current_count
         FROM sections s WHERE s.id = ? FOR UPDATE`,
        [payload.sectionId]
      );

      if (secRows.length === 0) {
        throw new Error('Selected section does not exist.');
      }

      const sec = secRows[0];
      if (sec.current_count >= sec.capacity) {
        throw new Error(`Section capacity (${sec.capacity}) is fully reached.`);
      }

      // Check admissionNo unique
      const [admCheck] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM students WHERE admission_no = ?',
        [payload.admissionNo]
      );
      if (admCheck.length > 0) {
        throw new Error(`Admission number '${payload.admissionNo}' is already taken.`);
      }

      // Insert student
      const [studRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO students (admission_no, first_name, father_name, grandfather_name, gender, date_of_birth, phone, address, admission_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), 'active')`,
        [
          payload.admissionNo,
          payload.firstName,
          payload.fatherName,
          payload.grandfatherName || null,
          payload.gender,
          payload.dateOfBirth,
          payload.phone || null,
          payload.address || null
        ]
      );

      const studentId = studRes.insertId;
      const nextRollNo = sec.current_count + 1;

      // Insert enrollment
      await conn.query(
        `INSERT INTO enrollments (student_id, section_id, academic_year_id, status, roll_no, enrolled_on, created_by)
         VALUES (?, ?, ?, 'active', ?, CURDATE(), ?)`,
        [studentId, payload.sectionId, sec.academic_year_id, nextRollNo, payload.registeredByUserId]
      );

      await conn.commit();
      return studentId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async reassignSection(studentId: number, newSectionId: number) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check target section capacity
      const [secRows] = await conn.query<RowDataPacket[]>(
        `SELECT s.capacity,
                (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') as current_count
         FROM sections s WHERE s.id = ? FOR UPDATE`,
        [newSectionId]
      );

      if (secRows.length === 0) throw new Error('Target section not found.');
      if (secRows[0].current_count >= secRows[0].capacity) {
        throw new Error('Target section is at maximum capacity.');
      }

      // Update active enrollment
      const [updRes] = await conn.query<ResultSetHeader>(
        `UPDATE enrollments SET section_id = ? WHERE student_id = ? AND status = 'active'`,
        [newSectionId, studentId]
      );

      if (updRes.affectedRows === 0) {
        throw new Error('Active enrollment not found for this student.');
      }

      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getTransfersWithdrawals() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         tw.id,
         tw.type,
         tw.destination_school,
         tw.effective_date,
         tw.reason,
         s.admission_no,
         CONCAT_WS(' ', s.first_name, s.father_name) as student_name,
         sec.name as section_name,
         u.username as approved_by_user
       FROM transfers_withdrawals tw
       JOIN students s ON tw.student_id = s.id
       JOIN enrollments e ON tw.enrollment_id = e.id
       JOIN sections sec ON e.section_id = sec.id
       LEFT JOIN users u ON tw.approved_by = u.id
       ORDER BY tw.effective_date DESC`
    );
    return rows;
  }

  async recordTransferWithdrawal(payload: {
    studentId: number;
    type: 'transfer' | 'withdrawal';
    destinationSchool?: string;
    effectiveDate: string;
    reason: string;
    approvedByUserId: number;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [enrRows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM enrollments WHERE student_id = ? AND status = 'active' LIMIT 1`,
        [payload.studentId]
      );
      if (enrRows.length === 0) {
        throw new Error('Active enrollment not found for this student.');
      }

      const enrollmentId = enrRows[0].id;

      // Insert record
      await conn.query(
        `INSERT INTO transfers_withdrawals (student_id, enrollment_id, type, destination_school, effective_date, reason, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.studentId,
          enrollmentId,
          payload.type,
          payload.destinationSchool || null,
          payload.effectiveDate,
          payload.reason,
          payload.approvedByUserId
        ]
      );

      // Update student status
      const newStatus = payload.type === 'transfer' ? 'transferred' : 'withdrawn';
      await conn.query('UPDATE students SET status = ? WHERE id = ?', [newStatus, payload.studentId]);
      await conn.query("UPDATE enrollments SET status = 'ended' WHERE id = ?", [enrollmentId]);

      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getStudentDocuments() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         d.id,
         d.doc_type,
         d.original_name,
         d.mime_type,
         d.size_bytes,
         d.scan_status,
         d.created_at,
         s.admission_no,
         CONCAT_WS(' ', s.first_name, s.father_name) as student_name
       FROM documents d
       JOIN students s ON d.owner_id = s.id AND d.owner_type = 'student'
       ORDER BY d.created_at DESC`
    );
    return rows;
  }
}
