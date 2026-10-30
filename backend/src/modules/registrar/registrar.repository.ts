import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { createHash, randomUUID } from 'crypto';
import { AppError } from '../../middleware/errorHandler';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';

export class RegistrarRepository {
  async getStudentPhoto(studentId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT d.storage_key, d.mime_type
       FROM students s
       JOIN documents d ON d.id = s.photo_document_id
       WHERE s.id = ? AND s.deleted_at IS NULL AND d.deleted_at IS NULL AND d.doc_type = 'profile_photo'
       LIMIT 1`,
      [studentId]
    );
    if (!rows.length) throw new AppError('Student photo not found.', 404, 'STUDENT_PHOTO_NOT_FOUND');
    const storageKey = String(rows[0].storage_key);
    if (!/^student_photos\/[a-f0-9-]+\.(?:jpg|png)$/i.test(storageKey)) {
      throw new AppError('Student photo storage reference is invalid.', 500, 'STUDENT_PHOTO_STORAGE_ERROR');
    }
    const photoPath = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'), storageKey);
    try {
      return { bytes: await readFile(photoPath), mimeType: String(rows[0].mime_type) };
    } catch {
      throw new AppError('Student photo file is unavailable.', 404, 'STUDENT_PHOTO_NOT_FOUND');
    }
  }

  async getDashboardMetrics() {
    const [counts] = await pool.query<RowDataPacket[]>(
      `SELECT 
         (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL) as totalStudents,
         (SELECT COUNT(*) FROM enrollments e
          JOIN academic_years ay ON ay.id = e.academic_year_id
          WHERE e.status = 'active' AND ay.is_current = 1) as activeStudents,
         (SELECT COUNT(*) FROM students WHERE status = 'applicant' AND deleted_at IS NULL) as applicantStudents,
         (SELECT COUNT(*) FROM students WHERE status = 'transferred' AND deleted_at IS NULL) as transferredStudents,
         (SELECT COUNT(*) FROM transfers_withdrawals tw
          JOIN enrollments e ON e.id = tw.enrollment_id
          JOIN academic_years ay ON ay.id = e.academic_year_id
          WHERE ay.is_current = 1) as totalTransfers,
         (SELECT COUNT(*) FROM documents d
          JOIN students s ON s.id = d.owner_id
          WHERE d.owner_type = 'student' AND d.deleted_at IS NULL AND s.deleted_at IS NULL) as studentDocuments,
         (SELECT COALESCE(SUM(sec.capacity), 0) FROM sections sec
          JOIN academic_years ay ON ay.id = sec.academic_year_id
          WHERE sec.status = 'active' AND sec.deleted_at IS NULL AND ay.is_current = 1) as totalCapacity,
         (SELECT COUNT(*) FROM enrollments e
          JOIN academic_years ay ON ay.id = e.academic_year_id
          WHERE e.status = 'active' AND ay.is_current = 1) as currentEnrollments`
    );

    const [recentAdmissions] = await pool.query<RowDataPacket[]>(
      `SELECT id, admission_no, first_name, father_name, admission_date, created_at
       FROM students WHERE deleted_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 8`
    );

    return {
      totalStudents: Number(counts[0]?.totalStudents || 0),
      activeStudents: Number(counts[0]?.activeStudents || 0),
      applicantStudents: Number(counts[0]?.applicantStudents || 0),
      transferredStudents: Number(counts[0]?.transferredStudents || 0),
      totalTransfers: Number(counts[0]?.totalTransfers || 0),
      studentDocuments: Number(counts[0]?.studentDocuments || 0),
      totalCapacity: Number(counts[0]?.totalCapacity || 0),
      availableSeats: Math.max(
        0,
        Number(counts[0]?.totalCapacity || 0) - Number(counts[0]?.currentEnrollments || 0)
      ),
      recentAdmissions
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
        s.status as status,
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
      LEFT JOIN enrollments e ON s.id = e.student_id
        AND e.status = 'active'
        AND e.academic_year_id = (SELECT id FROM academic_years WHERE is_current = 1 LIMIT 1)
      LEFT JOIN sections sec ON e.section_id = sec.id
      LEFT JOIN grades g ON sec.grade_id = g.id
      WHERE s.deleted_at IS NULL
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

  async getAdmissionApplications(filters: {
    search?: string;
    status?: string;
    limit: number;
    offset: number;
  }) {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.search) {
      conditions.push('(aa.application_ref LIKE ? OR aa.first_name LIKE ? OR aa.father_name LIKE ? OR aa.guardian_name LIKE ?)');
      const search = `%${filters.search}%`;
      params.push(search, search, search, search);
    }
    if (filters.status) {
      conditions.push('aa.status = ?');
      params.push(filters.status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM admission_applications aa ${where}`,
      params
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT aa.id, aa.application_ref, aa.first_name, aa.father_name, aa.grandfather_name,
              aa.gender, aa.date_of_birth, aa.phone, aa.email, aa.address,
              aa.guardian_name, aa.guardian_phone, aa.previous_school, aa.status,
              aa.decision_note, aa.decided_at, aa.registered_student_id, aa.created_at,
              creator.username AS created_by_username, decider.username AS decided_by_username
       FROM admission_applications aa
       JOIN users creator ON creator.id = aa.created_by
       LEFT JOIN users decider ON decider.id = aa.decided_by
       ${where}
       ORDER BY aa.created_at DESC, aa.id DESC
       LIMIT ? OFFSET ?`,
      [...params, filters.limit, filters.offset]
    );
    return { items: rows, total: Number(countRows[0]?.total || 0) };
  }

  async createAdmissionApplication(payload: {
    applicationRef: string;
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    dateOfBirth: string;
    phone?: string;
    email?: string;
    address?: string;
    guardianName?: string;
    guardianPhone?: string;
    previousSchool?: string;
    userId: number;
    username: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query<ResultSetHeader>(
        `INSERT INTO admission_applications
           (application_ref, first_name, father_name, grandfather_name, gender, date_of_birth,
            phone, email, address, guardian_name, guardian_phone, previous_school, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.applicationRef, payload.firstName, payload.fatherName,
          payload.grandfatherName || null, payload.gender, payload.dateOfBirth,
          payload.phone || null, payload.email || null, payload.address || null,
          payload.guardianName || null, payload.guardianPhone || null,
          payload.previousSchool || null, payload.userId
        ]
      );
      const applicationId = result.insertId;
      const details = {
        application_ref: payload.applicationRef,
        first_name: payload.firstName,
        father_name: payload.fatherName,
        grandfather_name: payload.grandfatherName || null,
        gender: payload.gender,
        date_of_birth: payload.dateOfBirth,
        phone: payload.phone || null,
        email: payload.email || null,
        address: payload.address || null,
        guardian_name: payload.guardianName || null,
        guardian_phone: payload.guardianPhone || null,
        previous_school: payload.previousSchool || null
      };
      const [approvalResult] = await conn.query<ResultSetHeader>(
        `INSERT INTO approvals
           (type, entity_type, entity_id, requested_by, new_value_json, reason, status)
         VALUES ('admission_application', 'admission_applications', ?, ?, ?, ?, 'pending')`,
        [
          applicationId,
          payload.userId,
          JSON.stringify(details),
          `Review admission application ${payload.applicationRef}`
        ]
      );
      await conn.query(
        `INSERT INTO audit_logs
           (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (?, ?, 'admission.application_submitted', 'admission_applications', ?, 'success', ?, ?)`,
        [
          payload.userId,
          payload.username,
          String(applicationId),
          JSON.stringify({ applicationRef: payload.applicationRef, approvalId: approvalResult.insertId }),
          'Application submitted for authorized review'
        ]
      );
      await conn.commit();
      return { id: applicationId, applicationRef: payload.applicationRef, status: 'pending_review' as const };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
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
       WHERE s.status = 'active' AND s.deleted_at IS NULL AND g.is_active = 1 AND ay.is_current = 1 AND ay.status = 'active'
       GROUP BY s.id
       ORDER BY g.grade_level, s.name`
    );
    return rows;
  }

  async registerStudent(payload: {
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    dateOfBirth: string;
    sectionId: number;
    phone?: string;
    email?: string;
    address?: string;
    previousSchool?: string;
    applicationId?: number;
    photo?: { originalName: string; mimeType: string; dataBase64: string };
    registeredByUserId: number;
    registeredByUsername: string;
  }) {
    let photoFilePath: string | undefined;
    let photoBytes: Buffer | undefined;
    let photoMime: string | undefined;
    let photoName: string | undefined;
    if (payload.photo) {
      const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(payload.photo.dataBase64 || '');
      if (!match || match[1] !== payload.photo.mimeType) {
        throw new AppError('Upload a valid JPEG or PNG student photo.', 400, 'INVALID_STUDENT_PHOTO');
      }
      photoMime = match[1];
      photoBytes = Buffer.from(match[2], 'base64');
      const [sizeRows] = await pool.query<RowDataPacket[]>(
        `SELECT value_json FROM system_settings WHERE setting_key = 'uploads.max_mb' LIMIT 1`
      );
      let configuredMax = sizeRows[0]?.value_json ?? 5;
      if (typeof configuredMax === 'string') {
        try { configuredMax = JSON.parse(configuredMax); } catch { /* Setting may be a plain numeric string. */ }
      }
      const parsedMax = Number(configuredMax);
      const maxMb = Math.min(20, Math.max(1, Number.isFinite(parsedMax) ? parsedMax : 5));
      if (!photoBytes.length || photoBytes.length > maxMb * 1024 * 1024) {
        throw new AppError(`Student photo must be smaller than ${maxMb} MB.`, 400, 'STUDENT_PHOTO_TOO_LARGE');
      }
      const isJpeg = photoMime === 'image/jpeg' && photoBytes.length >= 3 &&
        photoBytes[0] === 0xff && photoBytes[1] === 0xd8 && photoBytes[2] === 0xff;
      const isPng = photoMime === 'image/png' &&
        photoBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!isJpeg && !isPng) {
        throw new AppError('The photo contents do not match a supported image format.', 400, 'INVALID_STUDENT_PHOTO');
      }
      photoName = path.basename(payload.photo.originalName || 'student-photo').slice(0, 255);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let studentDetails = {
        firstName: payload.firstName,
        fatherName: payload.fatherName,
        grandfatherName: payload.grandfatherName,
        gender: payload.gender,
        dateOfBirth: payload.dateOfBirth,
        phone: payload.phone,
        email: payload.email,
        address: payload.address,
        previousSchool: payload.previousSchool
      };
      if (payload.applicationId) {
        const [applicationRows] = await conn.query<RowDataPacket[]>(
          `SELECT first_name, father_name, grandfather_name, gender, date_of_birth, phone, email, address, previous_school, status
           FROM admission_applications
           WHERE id = ?
           FOR UPDATE`,
          [payload.applicationId]
        );
        const application = applicationRows[0];
        if (!application) {
          throw new AppError('Admission application was not found.', 404, 'ADMISSION_APPLICATION_NOT_FOUND');
        }
        if (application.status !== 'approved') {
          throw new AppError('Only an approved admission application can be registered.', 409, 'ADMISSION_APPLICATION_NOT_APPROVED');
        }
        studentDetails = {
          firstName: application.first_name,
          fatherName: application.father_name,
          grandfatherName: application.grandfather_name,
          gender: application.gender,
          dateOfBirth: application.date_of_birth,
          phone: application.phone,
          email: application.email,
          address: application.address,
          previousSchool: application.previous_school
        };
      }

      // Check section capacity
      const [secRows] = await conn.query<RowDataPacket[]>(
        `SELECT s.id, s.capacity, s.academic_year_id,
                (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') as current_count
         FROM sections s
         JOIN grades g ON g.id = s.grade_id AND g.is_active = 1
         JOIN academic_years ay ON ay.id = s.academic_year_id
         WHERE s.id = ? AND s.status = 'active' AND s.deleted_at IS NULL AND ay.is_current = 1 AND ay.status = 'active'
         FOR UPDATE`,
        [payload.sectionId]
      );

      if (secRows.length === 0) {
        throw new AppError('Selected section is unavailable for enrollment.', 404, 'SECTION_NOT_FOUND');
      }

      const sec = secRows[0];
      if (Number(sec.current_count) >= Number(sec.capacity)) {
        throw new AppError(`Section capacity (${sec.capacity}) is full.`, 409, 'SECTION_CAPACITY_REACHED');
      }

      let photoDocumentId: number | null = null;
      if (photoBytes && photoMime && photoName) {
        const storageName = `${randomUUID()}.${photoMime === 'image/jpeg' ? 'jpg' : 'png'}`;
        const storageDir = path.resolve(
          process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'),
          'student_photos'
        );
        await mkdir(storageDir, { recursive: true });
        photoFilePath = path.join(storageDir, storageName);
        await writeFile(photoFilePath, photoBytes, { flag: 'wx', mode: 0o600 });
        const [documentResult] = await conn.query<ResultSetHeader>(
          `INSERT INTO documents
             (owner_type, owner_id, doc_type, original_name, storage_key, mime_type, size_bytes, checksum_sha256, scan_status, uploaded_by)
           VALUES ('student', 0, 'profile_photo', ?, ?, ?, ?, ?, 'skipped', ?)`,
          [
            photoName,
            `student_photos/${storageName}`,
            photoMime,
            photoBytes.length,
            createHash('sha256').update(photoBytes).digest('hex'),
            payload.registeredByUserId
          ]
        );
        photoDocumentId = documentResult.insertId;
      }

      const temporaryAdmissionNo = `P-${randomUUID().replace(/-/g, '').slice(0, 28)}`;
      const [studRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO students
           (admission_no, first_name, father_name, grandfather_name, gender, date_of_birth, phone, email, address, previous_school, admission_date, status, photo_document_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), 'active', ?)`,
        [
          temporaryAdmissionNo,
          studentDetails.firstName,
          studentDetails.fatherName,
          studentDetails.grandfatherName || null,
          studentDetails.gender,
          studentDetails.dateOfBirth,
          studentDetails.phone || null,
          studentDetails.email || null,
          studentDetails.address || null,
          studentDetails.previousSchool || null,
          photoDocumentId
        ]
      );

      const studentId = studRes.insertId;
      if (photoDocumentId) {
        await conn.query(`UPDATE documents SET owner_id = ? WHERE id = ?`, [studentId, photoDocumentId]);
      }
      const admissionNo = `HS-${new Date().getFullYear()}-${String(studentId).padStart(6, '0')}`;
      await conn.query('UPDATE students SET admission_no = ? WHERE id = ?', [admissionNo, studentId]);
      const nextRollNo = Number(sec.current_count) + 1;

      // Insert enrollment
      await conn.query(
        `INSERT INTO enrollments (student_id, section_id, academic_year_id, status, roll_no, enrolled_on, created_by)
         VALUES (?, ?, ?, 'active', ?, CURDATE(), ?)`,
        [studentId, payload.sectionId, sec.academic_year_id, nextRollNo, payload.registeredByUserId]
      );

      if (payload.applicationId) {
        const [applicationUpdate] = await conn.query<ResultSetHeader>(
          `UPDATE admission_applications
           SET status = 'registered', registered_student_id = ?, updated_at = NOW(3)
           WHERE id = ? AND status = 'approved'`,
          [studentId, payload.applicationId]
        );
        if (applicationUpdate.affectedRows !== 1) {
          throw new AppError('Admission application is no longer available for registration.', 409, 'ADMISSION_APPLICATION_STATE_CHANGED');
        }
      }

      await conn.query(
        `INSERT INTO audit_logs
           (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (?, ?, 'student.register', 'students', ?, 'success', ?, 'Student registration and initial enrollment')`,
        [
          payload.registeredByUserId,
          payload.registeredByUsername,
          String(studentId),
          JSON.stringify({
            admissionNo,
            sectionId: payload.sectionId,
            academicYearId: sec.academic_year_id,
            applicationId: payload.applicationId || null,
            photoUploaded: Boolean(photoDocumentId)
          })
        ]
      );

      await conn.commit();
      return { studentId, admissionNo, applicationId: payload.applicationId || null, photoUploaded: Boolean(photoDocumentId) };
    } catch (err) {
      await conn.rollback();
      if (photoFilePath) await unlink(photoFilePath).catch(() => undefined);
      throw err;
    } finally {
      conn.release();
    }
  }

  async reassignSection(
    studentId: number,
    newSectionId: number,
    actor: { userId: number; username: string; reason: string }
  ) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [secRows] = await conn.query<RowDataPacket[]>(
        `SELECT s.id, s.capacity, s.academic_year_id,
                (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') as current_count
         FROM sections s
         JOIN academic_years ay ON ay.id = s.academic_year_id
         WHERE s.id = ? AND s.status = 'active' AND s.deleted_at IS NULL AND ay.status = 'active'
         FOR UPDATE`,
        [newSectionId]
      );

      if (secRows.length === 0) {
        throw new AppError('Target section is unavailable.', 404, 'SECTION_NOT_FOUND');
      }

      const [enrollmentRows] = await conn.query<RowDataPacket[]>(
        `SELECT e.id, e.section_id, e.academic_year_id, sec.name AS section_name
         FROM enrollments e
         JOIN sections sec ON sec.id = e.section_id
         WHERE e.student_id = ? AND e.status = 'active'
         FOR UPDATE`,
        [studentId]
      );
      if (enrollmentRows.length === 0) {
        throw new AppError('Active enrollment not found for this student.', 404, 'ACTIVE_ENROLLMENT_NOT_FOUND');
      }

      const current = enrollmentRows[0];
      const target = secRows[0];
      if (Number(current.academic_year_id) !== Number(target.academic_year_id)) {
        throw new AppError('A placement change must stay within the same academic year.', 400, 'ACADEMIC_YEAR_MISMATCH');
      }
      if (Number(current.section_id) === Number(newSectionId)) {
        throw new AppError('The student is already assigned to this section.', 400, 'SECTION_UNCHANGED');
      }
      if (Number(target.current_count) >= Number(target.capacity)) {
        throw new AppError('Target section is at maximum capacity.', 409, 'SECTION_CAPACITY_REACHED');
      }

      const [studentRows] = await conn.query<RowDataPacket[]>(
        'SELECT admission_no FROM students WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [studentId]
      );
      if (studentRows.length === 0) {
        throw new AppError('Student record not found.', 404, 'STUDENT_NOT_FOUND');
      }

      const [targetSectionRows] = await conn.query<RowDataPacket[]>(
        'SELECT name FROM sections WHERE id = ? LIMIT 1',
        [newSectionId]
      );
      const [rollRows] = await conn.query<RowDataPacket[]>(
        'SELECT COALESCE(MAX(roll_no), 0) + 1 AS next_roll_no FROM enrollments WHERE section_id = ? AND status = ?',
        [newSectionId, 'active']
      );

      const [updRes] = await conn.query<ResultSetHeader>(
        `UPDATE enrollments SET status = 'completed', ended_on = CURDATE()
         WHERE id = ? AND status = 'active'`,
        [current.id]
      );
      if (updRes.affectedRows === 0) {
        throw new AppError('Active enrollment changed before placement was saved.', 409, 'ENROLLMENT_CHANGED');
      }

      const [newEnrollment] = await conn.query<ResultSetHeader>(
        `INSERT INTO enrollments
           (student_id, section_id, academic_year_id, status, roll_no, enrolled_on, created_by)
         VALUES (?, ?, ?, 'active', ?, CURDATE(), ?)`,
        [studentId, newSectionId, target.academic_year_id, rollRows[0].next_roll_no, actor.userId]
      );

      await conn.query(
        `INSERT INTO audit_logs
           (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (?, ?, 'student.placement_change', 'enrollments', ?, 'success', ?, ?)`,
        [
          actor.userId,
          actor.username,
          String(newEnrollment.insertId),
          JSON.stringify({
            studentId,
            admissionNo: studentRows[0].admission_no,
            previousEnrollmentId: current.id,
            fromSectionId: current.section_id,
            fromSection: current.section_name,
            toSectionId: newSectionId,
            toSection: targetSectionRows[0]?.name
          }),
          actor.reason
        ]
      );

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
         tw.id, tw.type, tw.destination_school, tw.effective_date, tw.reason, tw.created_at,
         s.id AS student_id, s.admission_no,
         CONCAT_WS(' ', s.first_name, s.father_name, s.grandfather_name) AS student_name,
         sec.name AS section_name, u.username AS approved_by_user
       FROM transfers_withdrawals tw
       JOIN students s ON tw.student_id = s.id
       JOIN enrollments e ON tw.enrollment_id = e.id
       JOIN sections sec ON e.section_id = sec.id
       LEFT JOIN users u ON tw.approved_by = u.id
       WHERE s.deleted_at IS NULL
       ORDER BY tw.created_at DESC
       LIMIT 100`
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
    approvedByUsername: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [enrRows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM enrollments WHERE student_id = ? AND status = 'active' FOR UPDATE`,
        [payload.studentId]
      );
      if (enrRows.length === 0) {
        throw new AppError('Active enrollment not found for this student.', 404, 'ACTIVE_ENROLLMENT_NOT_FOUND');
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
      await conn.query(
        'UPDATE enrollments SET status = ?, ended_on = ? WHERE id = ?',
        [newStatus, payload.effectiveDate, enrollmentId]
      );
      await conn.query(
        `INSERT INTO audit_logs
           (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (?, ?, 'student.exit_recorded', 'transfers_withdrawals', ?, 'success', ?, ?)`,
        [
          payload.approvedByUserId,
          payload.approvedByUsername,
          String(enrollmentId),
          JSON.stringify({ studentId: payload.studentId, type: payload.type, effectiveDate: payload.effectiveDate }),
          payload.reason
        ]
      );

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
         CONCAT_WS(' ', s.first_name, s.father_name, s.grandfather_name) as student_name
       FROM documents d
       JOIN students s ON d.owner_id = s.id AND d.owner_type = 'student'
       WHERE d.deleted_at IS NULL AND s.deleted_at IS NULL
       ORDER BY d.created_at DESC
       LIMIT 100`
    );
    return rows;
  }

  async getGuardians(filters: {
    search?: string;
    verificationStatus?: 'pending' | 'verified' | 'suspended';
    limit: number;
    offset: number;
  }) {
    let where = `WHERE 1 = 1`;
    const params: any[] = [];
    if (filters.verificationStatus) {
      where += ` AND g.verification_status = ?`;
      params.push(filters.verificationStatus);
    }
    if (filters.search) {
      where += ` AND (
        g.first_name LIKE ? OR g.father_name LIKE ? OR g.grandfather_name LIKE ?
        OR g.phone LIKE ? OR g.email LIKE ? OR s.admission_no LIKE ?
        OR s.first_name LIKE ? OR s.father_name LIKE ?
      )`;
      const search = `%${filters.search}%`;
      params.push(search, search, search, search, search, search, search, search);
    }

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT g.id) AS total
       FROM guardians g
       LEFT JOIN student_guardians sg ON sg.guardian_id = g.id
       LEFT JOIN students s ON s.id = sg.student_id AND s.deleted_at IS NULL
       ${where}`,
      params
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         g.id, g.first_name, g.father_name, g.grandfather_name, g.name_am,
         g.phone, g.email, g.address, g.verification_status, g.verified_at,
         COUNT(DISTINCT s.id) AS linked_student_count,
         GROUP_CONCAT(DISTINCT sg.relationship ORDER BY sg.relationship SEPARATOR ', ') AS relationships,
         MAX(sg.is_emergency_contact) AS emergency_contact
       FROM guardians g
       LEFT JOIN student_guardians sg ON sg.guardian_id = g.id
       LEFT JOIN students s ON s.id = sg.student_id AND s.deleted_at IS NULL
       ${where}
       GROUP BY g.id
       ORDER BY g.father_name, g.first_name, g.id
       LIMIT ? OFFSET ?`,
      [...params, filters.limit, filters.offset]
    );
    return { items: rows, total: Number(countRows[0]?.total || 0) };
  }

  async getAttendanceSummary(filters: {
    sectionId?: number;
    startDate?: string;
    endDate?: string;
    limit: number;
    offset: number;
  }) {
    let where = `WHERE 1 = 1`;
    const params: any[] = [];
    if (filters.sectionId) {
      where += ` AND s.section_id = ?`;
      params.push(filters.sectionId);
    }
    if (filters.startDate) {
      where += ` AND s.attendance_date >= ?`;
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      where += ` AND s.attendance_date <= ?`;
      params.push(filters.endDate);
    }

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM attendance_sessions s
       ${where}`,
      params
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         s.id AS session_id, s.attendance_date, s.status AS session_status,
         sec.id AS section_id, sec.name AS section_name, g.display_name AS grade_name,
         sub.name AS subject_name, COUNT(ar.id) AS recorded_students,
         SUM(CASE WHEN ar.status_code = 'present' THEN 1 ELSE 0 END) AS present_count,
         SUM(CASE WHEN ar.status_code = 'absent' THEN 1 ELSE 0 END) AS absent_count,
         SUM(CASE WHEN ar.status_code = 'late' THEN 1 ELSE 0 END) AS late_count,
         SUM(CASE WHEN ar.status_code = 'excused' THEN 1 ELSE 0 END) AS excused_count
       FROM attendance_sessions s
       JOIN sections sec ON sec.id = s.section_id
       JOIN grades g ON g.id = sec.grade_id
       LEFT JOIN subjects sub ON sub.id = s.subject_id
       LEFT JOIN attendance_records ar ON ar.session_id = s.id
       ${where}
       GROUP BY s.id, s.attendance_date, s.status, sec.id, sec.name, g.display_name, sub.name
       ORDER BY s.attendance_date DESC, s.id DESC
       LIMIT ? OFFSET ?`,
      [...params, filters.limit, filters.offset]
    );
    return { items: rows, total: Number(countRows[0]?.total || 0) };
  }

  async getAssessmentCompleteness(filters: {
    academicYearId?: number;
    sectionId?: number;
    termId?: number;
    limit: number;
    offset: number;
  }) {
    let where = `WHERE 1 = 1`;
    const params: any[] = [];
    if (filters.academicYearId) {
      where += ` AND ta.academic_year_id = ?`;
      params.push(filters.academicYearId);
    }
    if (filters.sectionId) {
      where += ` AND ta.section_id = ?`;
      params.push(filters.sectionId);
    }
    if (filters.termId) {
      where += ` AND a.term_id = ?`;
      params.push(filters.termId);
    }

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM assessments a
       JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
       ${where}`,
      params
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         a.id AS assessment_id, a.title, a.assessment_date, a.status AS assessment_status,
         a.max_score, a.weight, t.id AS term_id, t.name AS term_name,
         ay.id AS academic_year_id, ay.name AS academic_year_name,
         sec.id AS section_id, sec.name AS section_name, g.display_name AS grade_name,
         sub.id AS subject_id, sub.name AS subject_name, at.name AS assessment_type,
         COUNT(DISTINCT e.id) AS expected_students,
         COUNT(DISTINCT m.enrollment_id) AS students_with_marks,
         COUNT(DISTINCT CASE WHEN m.status IN ('submitted', 'locked') THEN m.enrollment_id END) AS finalized_students,
         COUNT(DISTINCT CASE WHEN m.status = 'draft' THEN m.enrollment_id END) AS draft_students
       FROM assessments a
       JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
       JOIN terms t ON t.id = a.term_id
       JOIN academic_years ay ON ay.id = ta.academic_year_id
       JOIN sections sec ON sec.id = ta.section_id
       JOIN grades g ON g.id = sec.grade_id
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN assessment_types at ON at.id = a.assessment_type_id
       LEFT JOIN enrollments e
         ON e.section_id = ta.section_id AND e.academic_year_id = ta.academic_year_id
         AND e.status = 'active'
       LEFT JOIN marks m ON m.assessment_id = a.id AND m.enrollment_id = e.id
       ${where}
       GROUP BY a.id, a.title, a.assessment_date, a.status, a.max_score, a.weight,
         t.id, t.name, ay.id, ay.name, sec.id, sec.name, g.display_name,
         sub.id, sub.name, at.name
       ORDER BY t.start_date DESC, a.assessment_date DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, filters.limit, filters.offset]
    );
    return { items: rows, total: Number(countRows[0]?.total || 0) };
  }

  async getApprovedAcademicRecords(filters: {
    academicYearId?: number;
    sectionId?: number;
    termId?: number;
    search?: string;
    limit: number;
    offset: number;
  }) {
    let where = `WHERE rp.status = 'published'`;
    const params: any[] = [];
    if (filters.academicYearId) {
      where += ` AND ay.id = ?`;
      params.push(filters.academicYearId);
    }
    if (filters.sectionId) {
      where += ` AND sec.id = ?`;
      params.push(filters.sectionId);
    }
    if (filters.termId) {
      where += ` AND t.id = ?`;
      params.push(filters.termId);
    }
    if (filters.search) {
      where += ` AND (s.admission_no LIKE ? OR s.first_name LIKE ? OR s.father_name LIKE ?)`;
      const search = `%${filters.search}%`;
      params.push(search, search, search);
    }

    const joins = `
       FROM report_card_snapshots rcs
       JOIN result_publications rp
         ON rp.id = rcs.publication_id AND rp.term_id = rcs.term_id AND rp.version = rcs.version
       JOIN terms t ON t.id = rcs.term_id
       JOIN academic_years ay ON ay.id = t.academic_year_id
       JOIN enrollments e ON e.id = rcs.enrollment_id
       JOIN students s ON s.id = e.student_id AND s.deleted_at IS NULL
       JOIN sections sec ON sec.id = e.section_id
       JOIN grades g ON g.id = sec.grade_id`;
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total ${joins} ${where}`,
      params
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         rcs.id AS report_card_id, rp.id AS publication_id,
         rp.status AS publication_status, rcs.version, t.id AS term_id, t.name AS term_name,
         ay.id AS academic_year_id, ay.name AS academic_year_name,
         s.id AS student_id, s.admission_no, s.first_name, s.father_name,
         e.roll_no, sec.id AS section_id, sec.name AS section_name, g.display_name AS grade_name,
         rcs.average_percent, rcs.class_rank, rcs.class_size,
         rcs.payload_json, rcs.generated_at, rcs.issued_at
       ${joins}
       ${where}
       ORDER BY ay.start_date DESC, t.term_no DESC, sec.name, e.roll_no, s.admission_no
       LIMIT ? OFFSET ?`,
      [...params, filters.limit, filters.offset]
    );
    return { items: rows, total: Number(countRows[0]?.total || 0) };
  }

  async getPromotionRecords(filters: {
    academicYearId?: number;
    decision?: 'promoted' | 'repeat' | 'graduated';
    search?: string;
    limit: number;
    offset: number;
  }) {
    let where = `WHERE s.deleted_at IS NULL`;
    const params: any[] = [];
    if (filters.academicYearId) {
      where += ` AND e.academic_year_id = ?`;
      params.push(filters.academicYearId);
    }
    if (filters.decision) {
      where += ` AND p.decision = ?`;
      params.push(filters.decision);
    }
    if (filters.search) {
      where += ` AND (s.admission_no LIKE ? OR s.first_name LIKE ? OR s.father_name LIKE ?)`;
      const search = `%${filters.search}%`;
      params.push(search, search, search);
    }
    const joins = `
       FROM promotions p
       JOIN enrollments e ON e.id = p.enrollment_id
       JOIN students s ON s.id = e.student_id
       JOIN sections sec ON sec.id = e.section_id
       JOIN grades from_grade ON from_grade.id = sec.grade_id
       LEFT JOIN grades to_grade ON to_grade.id = p.to_grade_id
       LEFT JOIN academic_years from_year ON from_year.id = e.academic_year_id
       LEFT JOIN academic_years to_year ON to_year.id = p.to_academic_year_id
       LEFT JOIN users u ON u.id = p.decided_by`;
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total ${joins} ${where}`,
      params
    );
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         p.id, p.decision, p.effective_date, p.remarks, p.created_at,
         s.id AS student_id, s.admission_no, s.first_name, s.father_name,
         e.id AS enrollment_id, e.roll_no, sec.name AS section_name,
         from_grade.display_name AS from_grade_name, from_year.name AS from_academic_year,
         to_grade.display_name AS to_grade_name, to_year.name AS to_academic_year,
         u.username AS decided_by
       ${joins}
       ${where}
       ORDER BY p.effective_date DESC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, filters.limit, filters.offset]
    );
    return { items: rows, total: Number(countRows[0]?.total || 0) };
  }

  async getDataQualitySummary() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM students s
          WHERE s.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM student_guardians sg WHERE sg.student_id = s.id)
         ) AS students_without_guardians,
         (SELECT COUNT(*) FROM guardians g
          WHERE g.verification_status = 'pending'
         ) AS guardians_pending_verification,
         (SELECT COUNT(*) FROM students s
          WHERE s.status = 'active' AND s.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM enrollments e
              JOIN academic_years ay ON ay.id = e.academic_year_id
              WHERE e.student_id = s.id AND e.status = 'active' AND ay.is_current = 1
            )
         ) AS active_students_without_current_enrollment,
         (SELECT COUNT(*) FROM assessments a
          JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
          JOIN academic_years ay ON ay.id = ta.academic_year_id
          WHERE ay.is_current = 1
            AND NOT EXISTS (
              SELECT 1 FROM marks m
              WHERE m.assessment_id = a.id AND m.status IN ('submitted', 'locked')
            )
         ) AS current_assessments_without_finalized_marks`
    );
    return rows[0] || {};
  }

  async getRegistrationByYear(mode: 'calendar' | 'academic' = 'calendar') {
    if (mode === 'academic') {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           ay.id AS academic_year_id,
           ay.name AS year_label,
           ay.label_ec,
           ay.is_current,
           COUNT(DISTINCT e.student_id) AS student_count
         FROM academic_years ay
         LEFT JOIN enrollments e ON e.academic_year_id = ay.id AND e.status IN ('active', 'completed', 'promoted')
         GROUP BY ay.id, ay.name, ay.label_ec, ay.is_current, ay.start_date
         ORDER BY ay.start_date ASC`
      );
      return rows.map((r) => ({
        year: String(r.year_label),
        label: `${r.year_label}${r.label_ec ? ` (${r.label_ec})` : ''}`,
        count: Number(r.student_count),
        isCurrent: Boolean(r.is_current),
        mode: 'academic' as const
      }));
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         CAST(reg_year AS CHAR) AS year_label,
         reg_year AS year_num,
         COUNT(*) AS student_count
       FROM (
         SELECT YEAR(s.admission_date) AS reg_year
         FROM students s
         WHERE s.deleted_at IS NULL AND s.admission_date IS NOT NULL
       ) t
       GROUP BY reg_year
       ORDER BY year_num ASC`
    );
    return rows.map((r) => ({
      year: String(r.year_label),
      label: String(r.year_label),
      count: Number(r.student_count),
      mode: 'calendar' as const
    }));
  }

  async getDataQualityDetails(indicator: string, limit: number, offset: number) {
    if (indicator === 'students_without_guardians') {
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM students s
         WHERE s.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM student_guardians sg WHERE sg.student_id = s.id)`
      );
      const [items] = await pool.query<RowDataPacket[]>(
        `SELECT s.id, s.admission_no, s.first_name, s.father_name, s.grandfather_name, s.gender, s.admission_date, s.status, s.phone, s.email
         FROM students s
         WHERE s.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM student_guardians sg WHERE sg.student_id = s.id)
         ORDER BY s.admission_no ASC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      return { total: Number(countRows[0].total), items };
    }

    if (indicator === 'guardians_pending_verification') {
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM guardians g
         WHERE g.verification_status = 'pending'`
      );
      const [items] = await pool.query<RowDataPacket[]>(
        `SELECT g.id, g.first_name, g.father_name, g.grandfather_name, g.phone, g.email, g.verification_status, g.created_at,
                (SELECT COUNT(*) FROM student_guardians sg WHERE sg.guardian_id = g.id) AS linked_students_count
         FROM guardians g
         WHERE g.verification_status = 'pending'
         ORDER BY g.created_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      return { total: Number(countRows[0].total), items };
    }

    if (indicator === 'active_students_without_current_enrollment') {
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM students s
         WHERE s.status = 'active' AND s.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM enrollments e
             JOIN academic_years ay ON ay.id = e.academic_year_id
             WHERE e.student_id = s.id AND e.status = 'active' AND ay.is_current = 1
           )`
      );
      const [items] = await pool.query<RowDataPacket[]>(
        `SELECT s.id, s.admission_no, s.first_name, s.father_name, s.grandfather_name, s.gender, s.admission_date, s.status, s.phone, s.email
         FROM students s
         WHERE s.status = 'active' AND s.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM enrollments e
             JOIN academic_years ay ON ay.id = e.academic_year_id
             WHERE e.student_id = s.id AND e.status = 'active' AND ay.is_current = 1
           )
         ORDER BY s.admission_no ASC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      return { total: Number(countRows[0].total), items };
    }

    if (indicator === 'current_assessments_without_finalized_marks') {
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
         FROM assessments a
         JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
         JOIN academic_years ay ON ay.id = ta.academic_year_id
         WHERE ay.is_current = 1
           AND NOT EXISTS (
             SELECT 1 FROM marks m WHERE m.assessment_id = a.id AND m.status IN ('submitted', 'locked')
           )`
      );
      const [items] = await pool.query<RowDataPacket[]>(
        `SELECT a.id, a.title, a.max_score, a.weight, a.status AS assessment_status, a.assessment_date,
                sub.name AS subject_name,
                sec.name AS section_name,
                gr.display_name AS grade_name,
                CONCAT(st.first_name, ' ', st.father_name) AS teacher_name,
                (SELECT COUNT(*) FROM marks m WHERE m.assessment_id = a.id) AS entered_marks_count,
                (SELECT COUNT(*) FROM enrollments en WHERE en.section_id = sec.id AND en.status = 'active') AS total_students_count
         FROM assessments a
         JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
         JOIN academic_years ay ON ay.id = ta.academic_year_id
         JOIN subjects sub ON sub.id = ta.subject_id
         JOIN sections sec ON sec.id = ta.section_id
         JOIN grades gr ON gr.id = sec.grade_id
         JOIN staff st ON st.id = ta.staff_id
         WHERE ay.is_current = 1
           AND NOT EXISTS (
             SELECT 1 FROM marks m WHERE m.assessment_id = a.id AND m.status IN ('submitted', 'locked')
           )
         ORDER BY a.id DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      return { total: Number(countRows[0].total), items };
    }

    throw new AppError('Invalid data quality indicator.', 400, 'INVALID_INDICATOR');
  }

  async getRegistrarProfile(userId: number) {
    const [uRows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         u.id AS user_id,
         u.username,
         u.email AS user_email,
         u.phone AS user_phone,
         u.status AS user_status,
         u.created_at AS account_created_at,
         u.last_login_at,
         s.id AS staff_id,
         s.employee_no,
         s.first_name,
         s.father_name,
         s.grandfather_name,
         s.name_am,
         s.gender,
         s.date_of_birth,
         COALESCE(s.phone, u.phone) AS phone,
         COALESCE(s.email, u.email) AS email,
         s.address,
         COALESCE(s.job_title, 'Registrar') AS job_title,
         COALESCE(s.department, 'Office of the Registrar') AS department,
         COALESCE(s.staff_type, 'administrator') AS staff_type,
         s.hire_date,
         COALESCE(s.status, 'active') AS employment_status,
         (
           SELECT d.id FROM documents d 
           WHERE d.owner_type = 'user' AND d.owner_id = u.id 
             AND d.doc_type = 'registrar_profile_photo' AND d.deleted_at IS NULL 
           ORDER BY d.id DESC LIMIT 1
         ) AS photo_document_id
       FROM users u
       LEFT JOIN staff s ON s.user_id = u.id
       WHERE u.id = ?`,
      [userId]
    );

    if (!uRows.length) {
      throw new AppError('Registrar user not found.', 404, 'USER_NOT_FOUND');
    }

    const [activityRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, occurred_at, action, entity_type, outcome, reason
       FROM audit_logs
       WHERE actor_user_id = ?
       ORDER BY id DESC
       LIMIT 10`,
      [userId]
    );

    return {
      ...uRows[0],
      recent_activity: activityRows
    };
  }

  async getRegistrarProfilePhoto(userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT storage_key, mime_type FROM documents
       WHERE owner_type = 'user' AND owner_id = ? AND doc_type = 'registrar_profile_photo' AND deleted_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
    if (!rows.length) {
      throw new AppError('Registrar profile photo not found.', 404, 'REGISTRAR_PHOTO_NOT_FOUND');
    }
    const key = String(rows[0].storage_key);
    if (!/^registrar_profile_photos\/[a-f0-9-]+\.(?:jpg|png)$/i.test(key)) {
      throw new AppError('Registrar photo reference is invalid.', 500, 'REGISTRAR_PHOTO_STORAGE_ERROR');
    }
    const photoPath = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'), key);
    try {
      return { bytes: await readFile(photoPath), mimeType: String(rows[0].mime_type) };
    } catch {
      throw new AppError('Registrar profile photo is unavailable.', 404, 'REGISTRAR_PHOTO_NOT_FOUND');
    }
  }

  private async saveRegistrarProfilePhoto(userId: number, photo: { originalName?: string; mimeType?: string; dataBase64?: string }) {
    const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(photo.dataBase64 || ''));
    if (!match) throw new AppError('Choose a valid JPEG or PNG profile photo.', 400, 'INVALID_PROFILE_PHOTO');
    const mimeType = match[1];
    const bytes = Buffer.from(match[2], 'base64');
    const jpeg = mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = mimeType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!bytes.length || bytes.length > 5 * 1024 * 1024 || (!jpeg && !png)) {
      throw new AppError('Profile photo must be a valid JPEG or PNG image no larger than 5 MB.', 400, 'INVALID_PROFILE_PHOTO');
    }
    const storageName = `${randomUUID()}.${jpeg ? 'jpg' : 'png'}`;
    const key = `registrar_profile_photos/${storageName}`;
    const dir = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'), 'registrar_profile_photos');
    await mkdir(dir, { recursive: true });
    const photoPath = path.join(dir, storageName);
    await writeFile(photoPath, bytes, { flag: 'wx', mode: 0o600 });
    try {
      await pool.query(
        `UPDATE documents SET deleted_at = NOW() 
         WHERE owner_type = 'user' AND owner_id = ? AND doc_type = 'registrar_profile_photo' AND deleted_at IS NULL`,
        [userId]
      );
      const [insertDoc] = await pool.query<ResultSetHeader>(
        `INSERT INTO documents (owner_type, owner_id, doc_type, original_name, storage_key, mime_type, size_bytes, checksum_sha256, scan_status, uploaded_by)
         VALUES ('user', ?, 'registrar_profile_photo', ?, ?, ?, ?, ?, 'skipped', ?)`,
        [userId, path.basename(photo.originalName || 'registrar-profile-photo').slice(0, 255), key, mimeType, bytes.length, createHash('sha256').update(bytes).digest('hex'), userId]
      );

      // If staff record exists, update photo_document_id as well
      await pool.query(
        `UPDATE staff SET photo_document_id = ? WHERE user_id = ?`,
        [insertDoc.insertId, userId]
      );
    } catch (err) {
      await unlink(photoPath).catch(() => undefined);
      throw err;
    }
  }

  async updateRegistrarProfile(
    userId: number,
    payload: {
      email?: string;
      phone?: string;
      address?: string;
      photo?: { originalName?: string; mimeType?: string; dataBase64?: string };
      removePhoto?: boolean;
    }
  ) {
    const userFields: string[] = [];
    const userParams: any[] = [];
    if (payload.phone !== undefined) {
      userFields.push('phone = ?');
      userParams.push(payload.phone ? payload.phone.trim() : null);
    }
    if (payload.email !== undefined) {
      userFields.push('email = ?');
      userParams.push(payload.email ? payload.email.trim() : null);
    }

    if (userFields.length > 0) {
      userParams.push(userId);
      await pool.query(`UPDATE users SET ${userFields.join(', ')} WHERE id = ?`, userParams);
    }

    // Update staff record if linked
    const [staffRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM staff WHERE user_id = ?`,
      [userId]
    );

    if (staffRows.length > 0) {
      const staffFields: string[] = [];
      const staffParams: any[] = [];
      if (payload.phone !== undefined) {
        staffFields.push('phone = ?');
        staffParams.push(payload.phone ? payload.phone.trim() : null);
      }
      if (payload.email !== undefined) {
        staffFields.push('email = ?');
        staffParams.push(payload.email ? payload.email.trim() : null);
      }
      if (payload.address !== undefined) {
        staffFields.push('address = ?');
        staffParams.push(payload.address ? payload.address.trim() : null);
      }

      if (staffFields.length > 0) {
        staffParams.push(staffRows[0].id);
        await pool.query(`UPDATE staff SET ${staffFields.join(', ')} WHERE id = ?`, staffParams);
      }
    }

    if (payload.removePhoto) {
      await pool.query(
        `UPDATE documents SET deleted_at = NOW() 
         WHERE owner_type = 'user' AND owner_id = ? AND doc_type = 'registrar_profile_photo' AND deleted_at IS NULL`,
        [userId]
      );
      await pool.query(
        `UPDATE staff SET photo_document_id = NULL WHERE user_id = ?`,
        [userId]
      );
    } else if (payload.photo) {
      await this.saveRegistrarProfilePhoto(userId, payload.photo);
    }

    // Insert audit log
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
       VALUES (NOW(), ?, 'registrar', 'PROFILE_UPDATE', 'users', ?, 'success', ?, 'Registrar personal profile details updated')`,
      [userId, String(userId), JSON.stringify({ email: payload.email, phone: payload.phone, address: payload.address, photo: payload.removePhoto ? 'removed' : (payload.photo ? 'updated' : undefined) })]
    );

    return true;
  }
}
