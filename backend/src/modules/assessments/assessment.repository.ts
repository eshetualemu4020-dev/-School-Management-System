import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';

export interface MarkEntryInput {
  enrollmentId: number;
  score: number;
  feedback?: string;
  markStatus?: 'scored' | 'absent' | 'excused' | 'exempt';
}

export class AssessmentRepository {
  async getAssessmentsForTeacher(
    staffId: number,
    filters?: {
      sectionId?: number;
      subjectId?: number;
      termId?: number;
      academicYearId?: number;
    }
  ) {
    let sql = `
      SELECT 
        a.id,
        a.teaching_assignment_id,
        a.term_id,
        t.name as term_name,
        a.assessment_type_id,
        at.name as assessment_type_name,
        at.code as assessment_type_code,
        a.title,
        a.max_score,
        a.weight,
        a.assessment_date,
        a.status,
        sec.id as section_id,
        sec.name as section_name,
        g.display_name as grade_name,
        sub.id as subject_id,
        sub.name as subject_name,
        sub.code as subject_code,
        (SELECT COUNT(*) FROM marks m WHERE m.assessment_id = a.id AND m.score IS NOT NULL) as marks_count,
        (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = sec.id AND e.status = 'active') as total_students,
        (
          SELECT m.status 
          FROM marks m 
          WHERE m.assessment_id = a.id 
          LIMIT 1
        ) as marks_submission_status
      FROM assessments a
      JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
      JOIN terms t ON a.term_id = t.id
      JOIN assessment_types at ON a.assessment_type_id = at.id
      JOIN sections sec ON ta.section_id = sec.id
      JOIN grades g ON sec.grade_id = g.id
      JOIN subjects sub ON ta.subject_id = sub.id
      WHERE ta.staff_id = ?
    `;
    const params: any[] = [staffId];

    if (filters?.sectionId) {
      sql += ` AND ta.section_id = ?`;
      params.push(filters.sectionId);
    }
    if (filters?.subjectId) {
      sql += ` AND ta.subject_id = ?`;
      params.push(filters.subjectId);
    }
    if (filters?.termId) {
      sql += ` AND a.term_id = ?`;
      params.push(filters.termId);
    }
    if (filters?.academicYearId) {
      sql += ` AND ta.academic_year_id = ?`;
      params.push(filters.academicYearId);
    }

    sql += ` ORDER BY a.assessment_date DESC, a.id DESC`;

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async getAssessmentById(assessmentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        a.id,
        a.teaching_assignment_id,
        ta.staff_id,
        ta.section_id,
        ta.subject_id,
        a.term_id,
        t.name as term_name,
        a.assessment_type_id,
        at.name as assessment_type_name,
        a.title,
        a.max_score,
        a.weight,
        a.assessment_date,
        a.status,
        sec.name as section_name,
        g.display_name as grade_name,
        sub.name as subject_name
      FROM assessments a
      JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
      JOIN terms t ON a.term_id = t.id
      JOIN assessment_types at ON a.assessment_type_id = at.id
      JOIN sections sec ON ta.section_id = sec.id
      JOIN grades g ON sec.grade_id = g.id
      JOIN subjects sub ON ta.subject_id = sub.id
      WHERE a.id = ?`,
      [assessmentId]
    );
    return rows[0] || null;
  }

  async getAssessmentMarks(assessmentId: number, sectionId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
        e.id as enrollment_id,
        e.roll_no,
        st.id as student_id,
        st.admission_no,
        st.first_name,
        st.father_name,
        CONCAT(st.first_name, ' ', st.father_name) as student_name,
        m.id as mark_id,
        m.score,
        m.feedback,
        m.mark_status,
        COALESCE(m.status, 'draft') as status
      FROM enrollments e
      JOIN students st ON e.student_id = st.id
      LEFT JOIN marks m ON m.enrollment_id = e.id AND m.assessment_id = ?
      WHERE e.section_id = ? AND e.status = 'active'
      ORDER BY e.roll_no ASC, st.first_name ASC`,
      [assessmentId, sectionId]
    );
    return rows;
  }

  async createAssessment(
    teachingAssignmentId: number,
    termId: number,
    assessmentTypeId: number,
    title: string,
    maxScore: number,
    weight: number,
    assessmentDate: string,
    userId: number
  ): Promise<number> {
    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO assessments (teaching_assignment_id, term_id, assessment_type_id, title, max_score, weight, assessment_date, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [teachingAssignmentId, termId, assessmentTypeId, title, maxScore, weight, assessmentDate, userId]
    );
    return res.insertId;
  }

  // Atomic marks save / submit
  async saveMarksTransaction(
    assessmentId: number,
    userId: number,
    username: string,
    status: 'draft' | 'submitted',
    marks: MarkEntryInput[]
  ) {
    const conn: PoolConnection = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check current marks status to prevent overriding submitted/locked marks without approval
      const [existingStatus] = await conn.query<RowDataPacket[]>(
        `SELECT status FROM marks WHERE assessment_id = ? LIMIT 1 FOR UPDATE`,
        [assessmentId]
      );

      if (existingStatus.length > 0 && existingStatus[0].status === 'locked') {
        throw new Error('ERP-EXAM-01: Published and locked results cannot be modified without authorized correction.');
      }

      for (const m of marks) {
        await conn.query(
          `INSERT INTO marks (assessment_id, enrollment_id, score, feedback, mark_status, status, entered_by, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ${status === 'submitted' ? 'NOW()' : 'NULL'})
           ON DUPLICATE KEY UPDATE
             score = VALUES(score),
             feedback = VALUES(feedback),
             mark_status = VALUES(mark_status),
             status = VALUES(status),
             entered_by = VALUES(entered_by),
             submitted_at = ${status === 'submitted' ? 'NOW()' : 'submitted_at'}`,
          [
            assessmentId,
            m.enrollmentId,
            m.score,
            m.feedback || null,
            m.markStatus || 'scored',
            status,
            userId
          ]
        );
      }

      // Record audit log
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (?, ?, ?, 'assessments', ?, 'success', ?, ?)`,
        [
          userId,
          username,
          status === 'submitted' ? 'marks.submit' : 'marks.draft',
          String(assessmentId),
          JSON.stringify({ assessmentId, totalMarks: marks.length, status }),
          status === 'submitted' ? 'Submitted marks for approval' : 'Saved marks draft'
        ]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async getAssessmentTypes() {
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT id, code, name FROM assessment_types ORDER BY id ASC`);
    return rows;
  }
}
