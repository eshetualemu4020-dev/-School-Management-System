import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { AppError } from '../../middleware/errorHandler';
import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile, unlink, readFile } from 'fs/promises';
import path from 'path';

export class AdminRepository {
  async getAdminNotificationPreferences(userId: number) {
    const settingKey = `user.notifications.${userId}`;
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT value_json FROM system_settings WHERE setting_key = ? LIMIT 1`, [settingKey]);
    const defaults = { securityAlerts: true, guardianBroadcasts: true, attendanceDigest: false, systemErrors: true };
    if (!rows.length) return defaults;
    let value = rows[0].value_json;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return defaults; }
    }
    return Object.fromEntries(Object.keys(defaults).map((key) => [key, typeof value?.[key] === 'boolean' ? value[key] : defaults[key as keyof typeof defaults]]));
  }

  async saveAdminNotificationPreferences(userId: number, username: string, preferences: {
    securityAlerts: boolean; guardianBroadcasts: boolean; attendanceDigest: boolean; systemErrors: boolean;
  }) {
    const settingKey = `user.notifications.${userId}`;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO system_settings (setting_key, value_json, description, version, updated_by, updated_at)
         VALUES (?, ?, 'Administrator notification delivery preferences', 1, ?, NOW(3))
         ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), version = version + 1, updated_by = VALUES(updated_by), updated_at = NOW(3)`,
        [settingKey, JSON.stringify(preferences), userId]
      );
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, ?, 'ADMIN_NOTIFICATION_PREFERENCES_UPDATE', 'users', ?, 'success', ?, 'Administrator notification preferences updated')`,
        [userId, username, String(userId), JSON.stringify(preferences)]
      );
      await conn.commit();
      return preferences;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async saveStaffPhoto(payload: {
    staffId: number;
    originalName: string;
    mimeType: string;
    dataBase64: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(payload.dataBase64 || '');
    if (!match || match[1] !== payload.mimeType) throw new AppError('Upload a valid JPEG or PNG staff photo.', 400, 'INVALID_STAFF_PHOTO');
    const mimeType = match[1];
    const bytes = Buffer.from(match[2], 'base64');
    const isJpeg = mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = mimeType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!bytes.length || bytes.length > 5 * 1024 * 1024 || (!isJpeg && !isPng)) {
      throw new AppError('Staff photo must be a valid JPEG or PNG image no larger than 5 MB.', 400, 'INVALID_STAFF_PHOTO');
    }

    const storageName = `${randomUUID()}.${isJpeg ? 'jpg' : 'png'}`;
    const storageKey = `staff_photos/${storageName}`;
    const dir = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'), 'staff_photos');
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, storageName);
    await writeFile(filePath, bytes, { flag: 'wx', mode: 0o600 });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [staffRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, photo_document_id FROM staff WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        [payload.staffId]
      );
      if (!staffRows.length) throw new AppError('Staff record not found.', 404, 'STAFF_NOT_FOUND');

      const previousDocumentId = staffRows[0].photo_document_id;
      const [docResult] = await conn.query<ResultSetHeader>(
        `INSERT INTO documents (owner_type, owner_id, doc_type, original_name, storage_key, mime_type, size_bytes, checksum_sha256, scan_status, uploaded_by)
         VALUES ('staff', ?, 'staff_profile_photo', ?, ?, ?, ?, ?, 'skipped', ?)`,
        [
          payload.staffId,
          path.basename(payload.originalName || 'staff-photo').slice(0, 255),
          storageKey,
          mimeType,
          bytes.length,
          createHash('sha256').update(bytes).digest('hex'),
          payload.adminUserId
        ]
      );
      await conn.query(`UPDATE staff SET photo_document_id = ? WHERE id = ?`, [docResult.insertId, payload.staffId]);
      if (previousDocumentId) {
        await conn.query(`UPDATE documents SET deleted_at = NOW(3) WHERE id = ?`, [previousDocumentId]);
      }
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, ?, 'STAFF_PHOTO_UPDATE', 'staff', ?, 'success', ?, 'Staff profile photo updated')`,
        [
          payload.adminUserId,
          payload.adminUsername,
          String(payload.staffId),
          JSON.stringify({ documentId: docResult.insertId, replacedDocumentId: previousDocumentId || null })
        ]
      );
      await conn.commit();
      return { documentId: docResult.insertId };
    } catch (err) {
      await conn.rollback();
      await unlink(filePath).catch(() => undefined);
      throw err;
    } finally {
      conn.release();
    }
  }

  async getStaffPhoto(staffId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT d.storage_key, d.mime_type
         FROM staff st
         JOIN documents d ON d.id = st.photo_document_id
        WHERE st.id = ? AND st.deleted_at IS NULL AND d.deleted_at IS NULL
          AND d.doc_type = 'staff_profile_photo' LIMIT 1`,
      [staffId]
    );
    if (!rows.length) throw new AppError('Staff photo not found.', 404, 'STAFF_PHOTO_NOT_FOUND');
    const storageKey = String(rows[0].storage_key);
    if (!/^staff_photos\/[a-f0-9-]+\.(?:jpg|png)$/i.test(storageKey)) {
      throw new AppError('Staff photo storage reference is invalid.', 500, 'STAFF_PHOTO_STORAGE_ERROR');
    }
    try {
      return {
        bytes: await readFile(path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'), storageKey)),
        mimeType: String(rows[0].mime_type)
      };
    } catch {
      throw new AppError('Staff photo file is unavailable.', 404, 'STAFF_PHOTO_NOT_FOUND');
    }
  }

  async getStudentPhoto(id: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT d.storage_key, d.mime_type FROM students s
       JOIN documents d ON d.id = s.photo_document_id
       WHERE s.id = ? AND d.deleted_at IS NULL AND d.doc_type = 'profile_photo' LIMIT 1`, [id]
    );
    if (!rows.length) throw new AppError('Student photo not found.', 404, 'STUDENT_PHOTO_NOT_FOUND');
    const storageKey = String(rows[0].storage_key);
    if (!/^student_photos\/[a-f0-9-]+\.(?:jpg|png)$/i.test(storageKey)) throw new AppError('Student photo storage reference is invalid.', 500, 'STUDENT_PHOTO_STORAGE_ERROR');
    const photoPath = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'), storageKey);
    try {
      return { bytes: await readFile(photoPath), mimeType: String(rows[0].mime_type) };
    } catch {
      throw new AppError('Student photo file is unavailable.', 404, 'STUDENT_PHOTO_NOT_FOUND');
    }
  }

  async getAdminProfilePhoto(userId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT storage_key, mime_type FROM documents
       WHERE owner_type = 'user' AND owner_id = ? AND doc_type = 'admin_profile_photo' AND deleted_at IS NULL
       ORDER BY id DESC LIMIT 1`, [userId]
    );
    if (!rows.length) throw new AppError('Administrator profile photo not found.', 404, 'ADMIN_PHOTO_NOT_FOUND');
    const key = String(rows[0].storage_key);
    if (!/^admin_profile_photos\/[a-f0-9-]+\.(?:jpg|png)$/i.test(key)) throw new AppError('Administrator photo reference is invalid.', 500, 'ADMIN_PHOTO_STORAGE_ERROR');
    try {
      return { bytes: await readFile(path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'), key)), mimeType: String(rows[0].mime_type) };
    } catch {
      throw new AppError('Administrator profile photo is unavailable.', 404, 'ADMIN_PHOTO_NOT_FOUND');
    }
  }

  private async saveAdminProfilePhoto(userId: number, uploadedBy: number, photo: { originalName?: string; mimeType?: string; dataBase64?: string }) {
    const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(photo.dataBase64 || ''));
    if (!match) throw new AppError('Choose a valid JPEG or PNG profile photo.', 400, 'INVALID_ADMIN_PHOTO');
    const mimeType = match[1];
    const bytes = Buffer.from(match[2], 'base64');
    const jpeg = mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = mimeType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!bytes.length || bytes.length > 5 * 1024 * 1024 || (!jpeg && !png)) throw new AppError('Profile photo must be a valid JPEG or PNG image no larger than 5 MB.', 400, 'INVALID_ADMIN_PHOTO');
    const storageName = `${randomUUID()}.${jpeg ? 'jpg' : 'png'}`;
    const key = `admin_profile_photos/${storageName}`;
    const dir = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'), 'admin_profile_photos');
    await mkdir(dir, { recursive: true });
    const photoPath = path.join(dir, storageName);
    await writeFile(photoPath, bytes, { flag: 'wx', mode: 0o600 });
    try {
      await pool.query(`UPDATE documents SET deleted_at = NOW() WHERE owner_type = 'user' AND owner_id = ? AND doc_type = 'admin_profile_photo' AND deleted_at IS NULL`, [userId]);
      await pool.query(
        `INSERT INTO documents (owner_type, owner_id, doc_type, original_name, storage_key, mime_type, size_bytes, checksum_sha256, scan_status, uploaded_by)
         VALUES ('user', ?, 'admin_profile_photo', ?, ?, ?, ?, ?, 'skipped', ?)`,
        [userId, path.basename(photo.originalName || 'admin-profile-photo').slice(0, 255), key, mimeType, bytes.length, createHash('sha256').update(bytes).digest('hex'), uploadedBy]
      );
    } catch (err) {
      await unlink(photoPath).catch(() => undefined);
      throw err;
    }
  }

  // =========================================================================
  // PAGE 1: DASHBOARD OVERVIEW & ALERT METRICS
  // =========================================================================
  async getSchoolOverviewMetrics() {
    // 1. Student Counts
    const [studRes] = await pool.query<RowDataPacket[]>(
      `SELECT
         COUNT(*) as totalStudents,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeStudents,
         SUM(CASE WHEN status = 'applicant' THEN 1 ELSE 0 END) as applicantStudents,
         SUM(CASE WHEN status = 'transferred' THEN 1 ELSE 0 END) as transferredStudents,
         SUM(CASE WHEN status = 'withdrawn' THEN 1 ELSE 0 END) as withdrawnStudents,
         SUM(CASE WHEN status = 'graduated' THEN 1 ELSE 0 END) as graduatedStudents
       FROM students`
    );

    // 2. Staff Counts
    const [staffRes] = await pool.query<RowDataPacket[]>(
      `SELECT
         COUNT(*) as totalStaff,
         SUM(CASE WHEN staff_type = 'teacher' THEN 1 ELSE 0 END) as totalTeachers,
         SUM(CASE WHEN staff_type = 'administrator' THEN 1 ELSE 0 END) as totalAdministrators,
         SUM(CASE WHEN staff_type = 'librarian' THEN 1 ELSE 0 END) as totalLibrarians,
         SUM(CASE WHEN staff_type = 'accountant' THEN 1 ELSE 0 END) as totalAccountants,
         SUM(CASE WHEN staff_type = 'support' THEN 1 ELSE 0 END) as totalSupport
       FROM staff WHERE status = 'active'`
    );

    // 3. Academic Structure Counts
    const [academicRes] = await pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM sections WHERE status = 'active') as totalSections,
         (SELECT COUNT(*) FROM subjects WHERE status = 'active') as totalSubjects,
         (SELECT COUNT(*) FROM classrooms WHERE status = 'active') as totalClassrooms,
         (SELECT COUNT(*) FROM academic_years) as totalAcademicYears,
         (SELECT COUNT(*) FROM teaching_assignments WHERE is_active = 1) as activeAssignments`
    );

    // 4. Today Attendance
    const [attendanceToday] = await pool.query<RowDataPacket[]>(
      `SELECT
         COUNT(DISTINCT s.id) as sessionsToday,
         SUM(CASE WHEN r.status_code = 'present' THEN 1 ELSE 0 END) as presentToday,
         SUM(CASE WHEN r.status_code = 'absent' THEN 1 ELSE 0 END) as absentToday,
         SUM(CASE WHEN r.status_code = 'late' THEN 1 ELSE 0 END) as lateToday,
         SUM(CASE WHEN r.status_code = 'excused' THEN 1 ELSE 0 END) as excusedToday
       FROM attendance_sessions s
       JOIN attendance_records r ON s.id = r.session_id
       WHERE s.attendance_date = CURDATE()`
    );

    // 5. Total Attendance All-Time
    const [attStats] = await pool.query<RowDataPacket[]>(
      `SELECT
         COUNT(*) as totalRecords,
         SUM(CASE WHEN status_code = 'present' THEN 1 ELSE 0 END) as presentCount,
         SUM(CASE WHEN status_code = 'absent' THEN 1 ELSE 0 END) as absentCount
       FROM attendance_records`
    );
    const totalAtt = Number(attStats[0]?.totalRecords || 0);
    const presAtt = Number(attStats[0]?.presentCount || 0);
    const attRate = totalAtt > 0 ? Math.round((presAtt / totalAtt) * 100) : 95;

    // 6. Assessments & Marks
    const [marksStats] = await pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM assessments) as totalAssessments,
         (SELECT COUNT(*) FROM marks WHERE status = 'locked') as approvedMarks,
         (SELECT COUNT(*) FROM marks WHERE status = 'submitted') as submittedMarks,
         (SELECT COUNT(*) FROM marks WHERE status = 'draft') as pendingApprovals`
    );

    // 7. Active Academic Period
    const [currYear] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, label_ec FROM academic_years WHERE status = 'active' OR is_current = 1 LIMIT 1`
    );
    const [currTerm] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, term_no FROM terms WHERE status = 'active' OR is_current = 1 LIMIT 1`
    );

    // 8. Finance
    const [financeRes] = await pool.query<RowDataPacket[]>(
      `SELECT
         IFNULL((SELECT SUM(line_total) FROM invoice_items), 0) as totalInvoiced,
         IFNULL((SELECT SUM(amount) FROM payments WHERE status = 'posted'), 0) as totalCollected`
    );
    const totalInvoiced = Number(financeRes[0]?.totalInvoiced || 0);
    const totalCollected = Number(financeRes[0]?.totalCollected || 0);

    // 9. Trend: Students by Grade & Stream
    const [enrollmentByGrade] = await pool.query<RowDataPacket[]>(
      `SELECT
         g.grade_level,
         g.display_name as grade_name,
         COUNT(e.id) as student_count,
         SUM(CASE WHEN sec.stream = 'natural_science' THEN 1 ELSE 0 END) as natural_science_count,
         SUM(CASE WHEN sec.stream = 'social_science' THEN 1 ELSE 0 END) as social_science_count
       FROM grades g
       LEFT JOIN sections sec ON g.id = sec.grade_id AND sec.status = 'active'
       LEFT JOIN enrollments e ON sec.id = e.section_id AND e.status = 'active'
       GROUP BY g.id, g.grade_level, g.display_name
       ORDER BY g.grade_level ASC`
    );

    // 10. Trend: Attendance by Day (Last 7 active days)
    const [recentAttendanceTrend] = await pool.query<RowDataPacket[]>(
      `SELECT
         s.attendance_date,
         COUNT(r.id) as total_logged,
         SUM(CASE WHEN r.status_code = 'present' THEN 1 ELSE 0 END) as present_logged,
         ROUND(SUM(CASE WHEN r.status_code = 'present' THEN 1 ELSE 0 END) / COUNT(r.id) * 100, 1) as rate
       FROM attendance_sessions s
       JOIN attendance_records r ON s.id = r.session_id
       GROUP BY s.attendance_date
       ORDER BY s.attendance_date DESC
       LIMIT 7`
    );

    // 11. Alerts Calculation
    // Incomplete registrations
    const [incReg] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM students
       WHERE status = 'applicant' OR date_of_birth IS NULL OR phone IS NULL`
    );

    // Unassigned Teachers
    const [unassignedSec] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM sections
       WHERE status = 'active' AND (homeroom_staff_id IS NULL OR homeroom_staff_id = 0)`
    );

    // Missing Attendance Today
    const [missingAtt] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM sections sec
       WHERE sec.status = 'active'
       AND sec.id NOT IN (SELECT section_id FROM attendance_sessions WHERE attendance_date = CURDATE())`
    );

    // Overdue Library Loans
    const [overdueLoans] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM library_loans WHERE returned_at IS NULL AND due_at < NOW()`
    );

    const alerts = [
      {
        id: 'inc-reg',
        type: 'warning',
        title: 'Incomplete Student Registrations',
        count: Number(incReg[0]?.count || 0),
        message: `${incReg[0]?.count || 0} student records are incomplete or in applicant status.`,
        targetTab: 'students'
      },
      {
        id: 'unassigned-teachers',
        type: 'danger',
        title: 'Unassigned Homeroom Faculty',
        count: Number(unassignedSec[0]?.count || 0),
        message: `${unassignedSec[0]?.count || 0} active sections do not have a designated homeroom teacher.`,
        targetTab: 'assignments_timetable'
      },
      {
        id: 'missing-att',
        type: 'info',
        title: 'Pending Attendance Submission',
        count: Number(missingAtt[0]?.count || 0),
        message: `${missingAtt[0]?.count || 0} active sections have not logged attendance today.`,
        targetTab: 'attendance_results'
      },
      {
        id: 'overdue-loans',
        type: 'warning',
        title: 'Overdue Library Loans',
        count: Number(overdueLoans[0]?.count || 0),
        message: `${overdueLoans[0]?.count || 0} library books are past their return due date.`,
        targetTab: 'reports_library'
      },
      {
        id: 'pending-marks',
        type: 'info',
        title: 'Submitted Marks for Approval',
        count: Number(marksStats[0]?.submittedMarks || 0),
        message: `${marksStats[0]?.submittedMarks || 0} student assessment marks await administrative approval.`,
        targetTab: 'attendance_results'
      }
    ];

    // School Name from system_settings
    const [schoolNameRow] = await pool.query<RowDataPacket[]>(
      `SELECT value_json FROM system_settings WHERE setting_key = 'school.name' LIMIT 1`
    );
    const schoolName = schoolNameRow[0]?.value_json ? String(schoolNameRow[0].value_json).replace(/^"|"$/g, '') : 'Ketema Nigus Secondary & Preparatory School';

    return {
      schoolName: schoolName === 'Your School Name' ? 'Ketema Nigus Secondary & Preparatory School' : schoolName,
      students: {
        total: Number(studRes[0]?.totalStudents || 0),
        active: Number(studRes[0]?.activeStudents || 0),
        applicants: Number(studRes[0]?.applicantStudents || 0),
        transferred: Number(studRes[0]?.transferredStudents || 0),
        withdrawn: Number(studRes[0]?.withdrawnStudents || 0),
        graduated: Number(studRes[0]?.graduatedStudents || 0)
      },
      staff: {
        total: Number(staffRes[0]?.totalStaff || 0),
        teachers: Number(staffRes[0]?.totalTeachers || 0),
        administrators: Number(staffRes[0]?.totalAdministrators || 0),
        librarians: Number(staffRes[0]?.totalLibrarians || 0),
        accountants: Number(staffRes[0]?.totalAccountants || 0),
        support: Number(staffRes[0]?.totalSupport || 0)
      },
      academic: {
        totalSections: Number(academicRes[0]?.totalSections || 0),
        totalSubjects: Number(academicRes[0]?.totalSubjects || 0),
        totalClassrooms: Number(academicRes[0]?.totalClassrooms || 0),
        totalAcademicYears: Number(academicRes[0]?.totalAcademicYears || 0),
        activeAssignments: Number(academicRes[0]?.activeAssignments || 0),
        academicYear: currYear[0] || { id: 3, name: '2026/27', label_ec: '2019 E.C.' },
        currentTerm: currTerm[0] || { id: 3, name: 'Semester 1', term_no: 1 }
      },
      attendance: {
        attendanceRate: attRate,
        totalRecords: totalAtt,
        absentCount: Number(attStats[0]?.absentCount || 0)
      },
      todayAttendance: {
        sessions: Number(attendanceToday[0]?.sessionsToday || 0),
        present: Number(attendanceToday[0]?.presentToday || 0),
        absent: Number(attendanceToday[0]?.absentToday || 0),
        late: Number(attendanceToday[0]?.lateToday || 0),
        excused: Number(attendanceToday[0]?.excusedToday || 0)
      },
      academics: {
        totalAssessments: Number(marksStats[0]?.totalAssessments || 0),
        approvedMarks: Number(marksStats[0]?.approvedMarks || 0),
        submittedMarks: Number(marksStats[0]?.submittedMarks || 0),
        pendingApprovals: Number(marksStats[0]?.pendingApprovals || 0)
      },
      finance: {
        totalInvoiced,
        totalCollected,
        outstandingBalance: Math.max(0, totalInvoiced - totalCollected)
      },
      enrollmentByGrade,
      recentAttendanceTrend,
      alerts
    };
  }

  // =========================================================================
  // PAGE 2: STUDENT MANAGEMENT
  // =========================================================================
  async getStudentOptions() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND (TABLE_NAME, COLUMN_NAME) IN (
           ('students', 'status'), ('students', 'gender'),
           ('sections', 'stream'), ('student_guardians', 'relationship')
         )`
    );
    const options: Record<string, string[]> = { statuses: [], genders: [], streams: [], guardianRelationships: [] };
    const keys: Record<string, string> = {
      'students.status': 'statuses',
      'students.gender': 'genders',
      'sections.stream': 'streams',
      'student_guardians.relationship': 'guardianRelationships'
    };
    for (const row of rows) {
      const key = keys[`${row.table_name}.${row.column_name}`];
      if (!key || !String(row.column_type).startsWith('enum(')) continue;
      options[key] = [...String(row.column_type).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((match) => match[1].replace(/\\'/g, "'"));
    }
    return options;
  }

  async getStudents(filters: {
    search?: string;
    gradeId?: number;
    sectionId?: number;
    status?: string;
    stream?: string;
    gender?: string;
    limit?: number;
    offset?: number;
    incompleteOnly?: boolean;
  }) {
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
        s.email,
        s.address,
        e.id as enrollment_id,
        e.roll_no,
        e.status as enrollment_status,
        sec.id as section_id,
        sec.name as section_name,
        sec.stream as section_stream,
        g.id as grade_id,
        g.grade_level,
        g.display_name as grade_name,
        (SELECT CONCAT(grd.first_name, ' ', grd.father_name, ' (', sg.relationship, ' - ', grd.phone, ')')
         FROM student_guardians sg
         JOIN guardians grd ON sg.guardian_id = grd.id
         WHERE sg.student_id = s.id AND sg.is_primary = 1
         LIMIT 1) as primary_guardian,
        (SELECT COUNT(*) FROM documents d WHERE d.owner_type = 'student' AND d.owner_id = s.id) as doc_count
      FROM students s
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN sections sec ON e.section_id = sec.id
      LEFT JOIN grades g ON sec.grade_id = g.id
      WHERE s.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (filters.search) {
      sql += ` AND (s.admission_no LIKE ? OR s.first_name LIKE ? OR s.father_name LIKE ? OR s.phone LIKE ?)`;
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.gradeId) {
      sql += ` AND g.id = ?`;
      params.push(filters.gradeId);
    }

    if (filters.sectionId) {
      sql += ` AND sec.id = ?`;
      params.push(filters.sectionId);
    }

    if (filters.status) {
      sql += ` AND s.status = ?`;
      params.push(filters.status);
    }

    if (filters.stream) {
      sql += ` AND sec.stream = ?`;
      params.push(filters.stream);
    }

    if (filters.gender) {
      sql += ` AND s.gender = ?`;
      params.push(filters.gender);
    }

    if (filters.incompleteOnly) {
      sql += ` AND (s.phone IS NULL OR s.phone = '' OR s.status = 'applicant' OR NOT EXISTS (
        SELECT 1 FROM student_guardians sg WHERE sg.student_id = s.id AND sg.is_primary = 1
      ))`;
    }

    const whereFrom = sql.slice(sql.indexOf('FROM students'));
    const [countRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(DISTINCT s.id) AS total ${whereFrom}`, params);
    const pageSize = Math.min(Math.max(filters.limit || 50, 1), 100);
    sql += ` ORDER BY g.grade_level ASC, sec.name ASC, s.first_name ASC LIMIT ? OFFSET ?`;
    params.push(pageSize, Math.max(filters.offset || 0, 0));

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return { items: rows, total: Number(countRows[0]?.total || 0) };
  }

  async getStudentById(id: number) {
    const [studRows] = await pool.query<RowDataPacket[]>(
      `SELECT
         s.*,
         e.id as enrollment_id,
         e.roll_no,
         e.status as enrollment_status,
         sec.id as section_id,
         sec.name as section_name,
         sec.stream as section_stream,
         g.id as grade_id,
         g.grade_level,
         g.display_name as grade_name,
         ay.name as academic_year_name
       FROM students s
       LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       LEFT JOIN sections sec ON e.section_id = sec.id
       LEFT JOIN grades g ON sec.grade_id = g.id
       LEFT JOIN academic_years ay ON sec.academic_year_id = ay.id
       WHERE s.id = ?`,
      [id]
    );

    if (studRows.length === 0) return null;
    const student = studRows[0];

    // Linked guardians
    const [guardians] = await pool.query<RowDataPacket[]>(
      `SELECT g.id, g.first_name, g.father_name, g.phone, g.email, g.address, sg.relationship, sg.is_primary, sg.is_emergency_contact
       FROM student_guardians sg
       JOIN guardians g ON sg.guardian_id = g.id
       WHERE sg.student_id = ?`,
      [id]
    );

    // Enrollment history
    const [enrollments] = await pool.query<RowDataPacket[]>(
      `SELECT e.*, sec.name as section_name, g.display_name as grade_name, ay.name as academic_year_name
       FROM enrollments e
       JOIN sections sec ON e.section_id = sec.id
       JOIN grades g ON sec.grade_id = g.id
       JOIN academic_years ay ON sec.academic_year_id = ay.id
       WHERE e.student_id = ?
       ORDER BY e.created_at DESC`,
      [id]
    );

    // Status history
    const [statusHistory] = await pool.query<RowDataPacket[]>(
      `SELECT sh.*, u.username as changed_by_user
       FROM student_status_history sh
       LEFT JOIN users u ON sh.changed_by = u.id
       WHERE sh.student_id = ?
       ORDER BY sh.created_at DESC`,
      [id]
    );

    return {
      ...student,
      guardians,
      enrollments,
      statusHistory
    };
  }

  async registerStudent(payload: {
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    dateOfBirth: string;
    phone?: string;
    address?: string;
    sectionId: number;
    guardianName?: string;
    guardianPhone?: string;
    guardianRelation?: string;
    adminUserId: number;
    adminUsername: string;
    photo?: { originalName: string; mimeType: string; dataBase64: string };
  }) {
    let photoFilePath: string | undefined;
    let photoBytes: Buffer | undefined;
    let photoMime = '';
    let photoName = '';
    if (payload.photo) {
      const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(payload.photo.dataBase64 || '');
      if (!match || match[1] !== payload.photo.mimeType) throw new AppError('Upload a valid JPEG or PNG student photo.', 400, 'INVALID_STUDENT_PHOTO');
      photoMime = match[1];
      photoBytes = Buffer.from(match[2], 'base64');
      const [sizeRows] = await pool.query<RowDataPacket[]>(`SELECT value_json FROM system_settings WHERE setting_key = 'uploads.max_mb' LIMIT 1`);
      let configuredMax = sizeRows[0]?.value_json ?? 5;
      if (typeof configuredMax === 'string') {
        try { configuredMax = JSON.parse(configuredMax); } catch { /* value may already be a plain number string */ }
      }
      const parsedMax = Number(configuredMax);
      const maxMb = Math.min(20, Math.max(1, Number.isFinite(parsedMax) ? parsedMax : 5));
      if (!photoBytes.length || photoBytes.length > maxMb * 1024 * 1024) throw new AppError(`Student photo must be smaller than ${maxMb} MB.`, 400, 'STUDENT_PHOTO_TOO_LARGE');
      const isJpeg = photoMime === 'image/jpeg' && photoBytes[0] === 0xff && photoBytes[1] === 0xd8 && photoBytes[2] === 0xff;
      const isPng = photoMime === 'image/png' && photoBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!isJpeg && !isPng) throw new AppError('The photo contents do not match a supported image format.', 400, 'INVALID_STUDENT_PHOTO');
      photoName = path.basename(payload.photo.originalName || 'student-photo').slice(0, 255);
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check section & capacity
      const [secRows] = await conn.query<RowDataPacket[]>(
        `SELECT s.id, s.capacity, s.academic_year_id, s.status,
                (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') as current_count
         FROM sections s WHERE s.id = ? FOR UPDATE`,
        [payload.sectionId]
      );
      if (secRows.length === 0) {
        throw new AppError('Selected section does not exist.', 404, 'SECTION_NOT_FOUND');
      }
      const sec = secRows[0];
      if (sec.status !== 'active') {
        throw new AppError('Selected section is closed and cannot accept new admissions.', 409, 'SECTION_CLOSED');
      }
      if (sec.current_count >= sec.capacity) {
        throw new AppError(`Section capacity of ${sec.capacity} has been reached.`, 400, 'SECTION_FULL');
      }

      let photoDocumentId: number | null = null;
      if (photoBytes) {
        const storageKey = `${randomUUID()}.${photoMime === 'image/jpeg' ? 'jpg' : 'png'}`;
        const storageDir = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'), 'student_photos');
        await mkdir(storageDir, { recursive: true });
        photoFilePath = path.join(storageDir, storageKey);
        await writeFile(photoFilePath, photoBytes, { flag: 'wx', mode: 0o600 });
        const [docResult] = await conn.query<ResultSetHeader>(
          `INSERT INTO documents (owner_type, owner_id, doc_type, original_name, storage_key, mime_type, size_bytes, checksum_sha256, scan_status, uploaded_by)
           VALUES ('student', 0, 'profile_photo', ?, ?, ?, ?, ?, 'skipped', ?)`,
          [photoName, `student_photos/${storageKey}`, photoMime, photoBytes.length, createHash('sha256').update(photoBytes).digest('hex'), payload.adminUserId]
        );
        photoDocumentId = docResult.insertId;
      }

      const [yearRows] = await conn.query<RowDataPacket[]>(`SELECT YEAR(CURDATE()) AS sequence_year`);
      const sequenceYear = Number(yearRows[0].sequence_year);
      const [prefixRows] = await conn.query<RowDataPacket[]>(
        `SELECT JSON_UNQUOTE(value_json) AS prefix FROM system_settings WHERE setting_key = 'numbering.admission_prefix' LIMIT 1`
      );
      const admissionPrefix = String(prefixRows[0]?.prefix || '').trim();
      if (!/^[A-Z0-9]{2,8}$/.test(admissionPrefix)) {
        throw new AppError('Admission number prefix is not configured correctly.', 500, 'ADMISSION_NUMBER_CONFIGURATION_ERROR');
      }
      const [existingNumbers] = await conn.query<RowDataPacket[]>(
        `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(admission_no, '-', -1) AS UNSIGNED)), 0) + 1 AS next_value
         FROM students WHERE admission_no LIKE CONCAT(?, '-', ?, '-%')`,
        [admissionPrefix, sequenceYear]
      );
      await conn.query(
        `INSERT INTO number_sequences (name, year_key, next_value) VALUES ('admission', ?, ?)
         ON DUPLICATE KEY UPDATE next_value = GREATEST(next_value, VALUES(next_value))`,
        [sequenceYear, existingNumbers[0].next_value]
      );
      await conn.query(`CALL sp_next_number('admission', ?, @next_admission_number)`, [sequenceYear]);
      const [sequenceRows] = await conn.query<RowDataPacket[]>(`SELECT @next_admission_number AS sequence_value`);
      const [numberRows] = await conn.query<RowDataPacket[]>(
        `SELECT fn_make_number(?, ?, ?) AS admission_no`,
        [admissionPrefix, sequenceYear, sequenceRows[0]?.sequence_value]
      );
      const admissionNo = String(numberRows[0].admission_no);

      // Insert student
      const [studRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO students (admission_no, first_name, father_name, grandfather_name, gender, date_of_birth, phone, address, admission_date, status, photo_document_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), 'active', ?)`,
        [
          admissionNo,
          payload.firstName,
          payload.fatherName,
          payload.grandfatherName || null,
          payload.gender,
          payload.dateOfBirth,
          payload.phone || null,
          payload.address || null,
          photoDocumentId
        ]
      );
      const studentId = studRes.insertId;
      if (photoDocumentId) await conn.query(`UPDATE documents SET owner_id = ? WHERE id = ?`, [studentId, photoDocumentId]);

      // Assign Roll No
      const nextRollNo = (sec.current_count || 0) + 1;

      // Insert enrollment
      await conn.query<ResultSetHeader>(
        `INSERT INTO enrollments (student_id, section_id, academic_year_id, roll_no, status, enrolled_on, created_by)
         VALUES (?, ?, ?, ?, 'active', CURDATE(), ?)`,
        [studentId, sec.id, sec.academic_year_id, nextRollNo, payload.adminUserId]
      );

      // Link Guardian if provided
      if (payload.guardianName && payload.guardianPhone) {
        const nameParts = payload.guardianName.trim().split(' ');
        const gFirst = nameParts[0] || 'Guardian';
        const gFather = nameParts.slice(1).join(' ') || 'Parent';

        const [guardRes] = await conn.query<ResultSetHeader>(
          `INSERT INTO guardians (first_name, father_name, phone)
           VALUES (?, ?, ?)`,
          [gFirst, gFather, payload.guardianPhone]
        );
        const guardianId = guardRes.insertId;

        await conn.query(
          `INSERT INTO student_guardians (student_id, guardian_id, relationship, is_primary, is_emergency_contact)
           VALUES (?, ?, ?, 1, 1)`,
          [studentId, guardianId, payload.guardianRelation!]
        );
      }

      // Write Audit Log
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(), ?, ?, 'STUDENT_REGISTER', 'students', ?, 'success', ?, 'New student registration by administrator')`,
        [
          payload.adminUserId,
          payload.adminUsername,
          String(studentId),
          JSON.stringify({ admissionNo, sectionId: payload.sectionId })
        ]
      );

      await conn.commit();
      return { id: studentId, admissionNo };
    } catch (err) {
      await conn.rollback();
      if (photoFilePath) await unlink(photoFilePath).catch(() => undefined);
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateStudent(id: number, payload: {
    firstName?: string;
    fatherName?: string;
    grandfatherName?: string;
    gender?: string;
    dateOfBirth?: string;
    phone?: string;
    address?: string;
    guardianName?: string;
    guardianPhone?: string;
    guardianRelation?: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    const fields: string[] = [];
    const params: any[] = [];

    if (payload.firstName) { fields.push('first_name = ?'); params.push(payload.firstName); }
    if (payload.fatherName) { fields.push('father_name = ?'); params.push(payload.fatherName); }
    if (payload.grandfatherName !== undefined) { fields.push('grandfather_name = ?'); params.push(payload.grandfatherName || null); }
    if (payload.gender) { fields.push('gender = ?'); params.push(payload.gender); }
    if (payload.dateOfBirth) { fields.push('date_of_birth = ?'); params.push(payload.dateOfBirth); }
    if (payload.phone !== undefined) { fields.push('phone = ?'); params.push(payload.phone || null); }
    if (payload.address !== undefined) { fields.push('address = ?'); params.push(payload.address || null); }

    if (fields.length === 0) throw new AppError('Provide at least one student field to update.', 400, 'EMPTY_UPDATE');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [students] = await conn.query<RowDataPacket[]>(`SELECT id FROM students WHERE id = ? FOR UPDATE`, [id]);
      if (students.length === 0) throw new AppError('Student not found.', 404, 'STUDENT_NOT_FOUND');

      const guardianName = payload.guardianName?.trim() || '';
      const guardianPhone = payload.guardianPhone?.trim() || '';
      if (Boolean(guardianName) !== Boolean(guardianPhone)) {
        throw new AppError('Provide both the guardian name and phone number.', 400, 'GUARDIAN_CONTACT_INCOMPLETE');
      }
      if (guardianName && guardianPhone) {
        const nameParts = guardianName.split(/\s+/);
        const firstName = nameParts.shift() || '';
        const fatherName = nameParts.join(' ') || firstName;
        const [primaryGuardians] = await conn.query<RowDataPacket[]>(
          `SELECT guardian_id FROM student_guardians WHERE student_id = ? AND is_primary = 1 FOR UPDATE`, [id]
        );
        if (primaryGuardians.length) {
          await conn.query(`UPDATE guardians SET first_name = ?, father_name = ?, phone = ? WHERE id = ?`,
            [firstName, fatherName, guardianPhone, primaryGuardians[0].guardian_id]);
          await conn.query(`UPDATE student_guardians SET relationship = ?, is_emergency_contact = 1 WHERE student_id = ? AND guardian_id = ?`,
            [payload.guardianRelation || 'guardian', id, primaryGuardians[0].guardian_id]);
        } else {
          const [guardianResult] = await conn.query<ResultSetHeader>(
            `INSERT INTO guardians (first_name, father_name, phone) VALUES (?, ?, ?)`, [firstName, fatherName, guardianPhone]
          );
          await conn.query(
            `INSERT INTO student_guardians (student_id, guardian_id, relationship, is_primary, is_emergency_contact) VALUES (?, ?, ?, 1, 1)`,
            [id, guardianResult.insertId, payload.guardianRelation || 'guardian']
          );
        }
      }

      params.push(id);
      await conn.query(`UPDATE students SET ${fields.join(', ')} WHERE id = ?`, params);
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(), ?, ?, 'STUDENT_UPDATE', 'students', ?, 'success', ?, 'Student details updated')`,
        [payload.adminUserId, payload.adminUsername, String(id), JSON.stringify({
          firstName: payload.firstName,
          fatherName: payload.fatherName,
          grandfatherName: payload.grandfatherName,
          gender: payload.gender,
          dateOfBirth: payload.dateOfBirth,
          phone: payload.phone,
          address: payload.address,
          guardianName: payload.guardianName,
          guardianPhone: payload.guardianPhone,
          guardianRelation: payload.guardianRelation
        })]
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

  async updateStudentStatus(payload: {
    studentId: number;
    newStatus: 'active' | 'applicant' | 'transferred' | 'withdrawn' | 'graduated';
    reason: string;
    destinationSchool?: string;
    effectiveDate: string;
    sectionId?: number;
    adminUserId: number;
    adminUsername: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [studRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, status FROM students WHERE id = ? FOR UPDATE`,
        [payload.studentId]
      );
      if (studRows.length === 0) {
        throw new AppError('Student not found', 404, 'STUDENT_NOT_FOUND');
      }

      // Update student table
      await conn.query(`UPDATE students SET status = ? WHERE id = ?`, [payload.newStatus, payload.studentId]);

      let endedEnrollmentIds: number[] = [];
      if (['transferred', 'withdrawn', 'graduated'].includes(payload.newStatus)) {
        const enrollmentStatus = payload.newStatus === 'graduated' ? 'completed' : payload.newStatus;
        const [activeEnrollments] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM enrollments WHERE student_id = ? AND status = 'active' FOR UPDATE`, [payload.studentId]
        );
        endedEnrollmentIds = activeEnrollments.map((enrollment) => Number(enrollment.id));
        await conn.query(
          `UPDATE enrollments SET status = ?, ended_on = ? WHERE student_id = ? AND status = 'active'`,
          [enrollmentStatus, payload.effectiveDate, payload.studentId]
        );
      }

      if (payload.newStatus === 'active') {
        const [sectionRows] = await conn.query<RowDataPacket[]>(
          `SELECT s.id, s.capacity, s.academic_year_id, s.status,
                  (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') AS current_count
           FROM sections s WHERE s.id = ? FOR UPDATE`,
          [payload.sectionId]
        );
        if (!sectionRows.length) throw new AppError('Selected section does not exist.', 404, 'SECTION_NOT_FOUND');
        const section = sectionRows[0];
        if (section.status !== 'active') throw new AppError('The selected section is closed.', 409, 'SECTION_CLOSED');

        const [activeEnrollments] = await conn.query<RowDataPacket[]>(
          `SELECT id, section_id FROM enrollments WHERE student_id = ? AND academic_year_id = ? AND status = 'active' FOR UPDATE`,
          [payload.studentId, section.academic_year_id]
        );
        const alreadyPlaced = activeEnrollments.some((enrollment) => Number(enrollment.section_id) === Number(section.id));
        if (!alreadyPlaced) {
          if (Number(section.current_count) >= Number(section.capacity)) {
            throw new AppError(`Section capacity of ${section.capacity} has been reached.`, 400, 'SECTION_FULL');
          }
          for (const enrollment of activeEnrollments) {
            await conn.query(`UPDATE enrollments SET status = 'transferred', ended_on = ? WHERE id = ?`, [payload.effectiveDate, enrollment.id]);
          }
          const [rollRows] = await conn.query<RowDataPacket[]>(
            `SELECT COALESCE(MAX(roll_no), 0) + 1 AS next_roll_no FROM enrollments WHERE section_id = ? AND academic_year_id = ?`,
            [section.id, section.academic_year_id]
          );
          await conn.query(
            `INSERT INTO enrollments (student_id, section_id, academic_year_id, roll_no, status, enrolled_on, created_by)
             VALUES (?, ?, ?, ?, 'active', ?, ?)`,
            [payload.studentId, section.id, section.academic_year_id, rollRows[0].next_roll_no, payload.effectiveDate, payload.adminUserId]
          );
        }
      }

      // Status history
      await conn.query(
        `INSERT INTO student_status_history (student_id, status, effective_date, reason, changed_by)
         VALUES (?, ?, ?, ?, ?)`,
        [payload.studentId, payload.newStatus, payload.effectiveDate, payload.reason, payload.adminUserId]
      );

      // Transfers / withdrawals table if relevant
      if (payload.newStatus === 'transferred' || payload.newStatus === 'withdrawn') {
        for (const enrollmentId of endedEnrollmentIds) {
          await conn.query(
            `INSERT INTO transfers_withdrawals (student_id, enrollment_id, type, destination_school, effective_date, reason, approved_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              payload.studentId,
              enrollmentId,
              payload.newStatus === 'transferred' ? 'transfer' : 'withdrawal',
              payload.destinationSchool || null,
              payload.effectiveDate,
              payload.reason,
              payload.adminUserId
            ]
          );
        }
      }

      // Audit log
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(), ?, ?, 'STUDENT_STATUS_CHANGE', 'students', ?, 'success', ?, ?)`,
        [
          payload.adminUserId,
          payload.adminUsername,
          String(payload.studentId),
          JSON.stringify({ status: payload.newStatus, reason: payload.reason }),
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

  async reassignStudentSection(payload: {
    studentId: number;
    newSectionId: number;
    adminUserId: number;
    adminUsername: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [secRows] = await conn.query<RowDataPacket[]>(
        `SELECT s.id, s.capacity, s.academic_year_id, s.name, s.stream, g.grade_level,
                (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') as current_count
         FROM sections s JOIN grades g ON g.id = s.grade_id WHERE s.id = ? FOR UPDATE`,
        [payload.newSectionId]
      );
      if (secRows.length === 0) {
        throw new AppError('Destination section not found', 404, 'SECTION_NOT_FOUND');
      }
      const sec = secRows[0];
      if (sec.current_count >= sec.capacity) {
        throw new AppError(`Destination section capacity of ${sec.capacity} is reached.`, 400, 'SECTION_FULL');
      }

      const [studentRows] = await conn.query<RowDataPacket[]>(`SELECT id, status FROM students WHERE id = ? FOR UPDATE`, [payload.studentId]);
      if (!studentRows.length) throw new AppError('Student not found.', 404, 'STUDENT_NOT_FOUND');
      if (studentRows[0].status !== 'active') throw new AppError('Only active students can be reassigned between sections.', 409, 'STUDENT_NOT_ACTIVE');

      const [currEnroll] = await conn.query<RowDataPacket[]>(
        `SELECT e.id, sec.id as section_id, sec.stream, g.grade_level
         FROM enrollments e JOIN sections sec ON sec.id = e.section_id JOIN grades g ON g.id = sec.grade_id
         WHERE e.student_id = ? AND e.academic_year_id = ? AND e.status = 'active' FOR UPDATE`,
        [payload.studentId, sec.academic_year_id]
      );
      if (currEnroll.length && Number(currEnroll[0].section_id) === Number(sec.id)) {
        throw new AppError('Student is already assigned to this section.', 409, 'ALREADY_IN_SECTION');
      }
      if (currEnroll.length && Number(currEnroll[0].grade_level) !== Number(sec.grade_level)) {
        throw new AppError('Section reassignment must stay within the student’s current grade. Use the promotion workflow to change grades.', 409, 'GRADE_CHANGE_NOT_ALLOWED');
      }
      if (currEnroll.length && currEnroll[0].stream !== sec.stream) {
        throw new AppError('The destination section must match the student’s current stream.', 409, 'STREAM_MISMATCH');
      }

      const nextRollNo = (sec.current_count || 0) + 1;

      if (currEnroll.length > 0) {
        await conn.query(
          `UPDATE enrollments SET status = 'transferred', ended_on = CURDATE() WHERE id = ?`,
          [currEnroll[0].id]
        );
      }
      await conn.query(
        `INSERT INTO enrollments (student_id, section_id, academic_year_id, roll_no, status, enrolled_on, created_by)
         VALUES (?, ?, ?, ?, 'active', CURDATE(), ?)`,
        [payload.studentId, sec.id, sec.academic_year_id, nextRollNo, payload.adminUserId]
      );

      // Audit log
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(), ?, ?, 'STUDENT_SECTION_REASSIGN', 'students', ?, 'success', ?, 'Section placement updated by admin')`,
        [
          payload.adminUserId,
          payload.adminUsername,
          String(payload.studentId),
          JSON.stringify({ newSectionId: sec.id, newRollNo: nextRollNo })
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

  async getTransfersHistory() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
         tw.*,
         s.admission_no,
         CONCAT_WS(' ', s.first_name, s.father_name) as student_name,
         u.username as approved_by_user
       FROM transfers_withdrawals tw
       JOIN students s ON tw.student_id = s.id
       LEFT JOIN users u ON tw.approved_by = u.id
       ORDER BY tw.effective_date DESC, tw.created_at DESC`
    );
    return rows;
  }

  // =========================================================================
  // PAGE 3: STAFF AND USER MANAGEMENT
  // =========================================================================
  async getStaff(search?: string, staffType?: string, status?: string, options?: { limit?: number; offset?: number; sort?: string }) {
    let sql = `
      SELECT
        st.id,
        st.employee_no,
        st.first_name,
        st.father_name,
        st.grandfather_name,
        st.gender,
        st.date_of_birth,
        st.phone,
        st.email,
        st.address,
        st.job_title,
        st.department,
        st.staff_type,
        st.hire_date,
        st.status,
        st.user_id,
        st.photo_document_id,
        u.username as linked_username,
        u.status as user_account_status,
        (SELECT COUNT(*) FROM teaching_assignments ta WHERE ta.staff_id = st.id AND ta.is_active = 1) as active_assignments_count,
        (SELECT COUNT(*) FROM staff_qualifications q WHERE q.staff_id = st.id AND q.deleted_at IS NULL) as qualification_count,
        (SELECT COUNT(*) FROM qualification_documents qd
           JOIN staff_qualifications q2 ON q2.id = qd.qualification_id AND q2.deleted_at IS NULL
          WHERE q2.staff_id = st.id AND qd.is_active = 1 AND qd.verification_status = 'pending') as unverified_document_count
      FROM staff st
      LEFT JOIN users u ON st.user_id = u.id
      WHERE st.deleted_at IS NULL
    `;
    const params: any[] = [];

    if (search) {
      sql += ` AND (st.employee_no LIKE ? OR st.first_name LIKE ? OR st.father_name LIKE ? OR st.department LIKE ? OR st.email LIKE ? OR st.job_title LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (staffType) {
      sql += ` AND st.staff_type = ?`;
      params.push(staffType);
    }

    if (status) {
      sql += ` AND st.status = ?`;
      params.push(status);
    }

    const sortMap: Record<string, string> = {
      name: 'st.first_name ASC, st.father_name ASC',
      name_desc: 'st.first_name DESC, st.father_name DESC',
      employee_no: 'st.employee_no ASC',
      load: 'active_assignments_count DESC, st.first_name ASC',
      load_asc: 'active_assignments_count ASC, st.first_name ASC',
      status: 'st.status ASC, st.first_name ASC',
      hire_date: 'st.hire_date DESC, st.first_name ASC'
    };
    sql += ` ORDER BY ${sortMap[options?.sort || ''] || 'st.staff_type ASC, st.first_name ASC'}`;

    const limit = Number(options?.limit);
    const offset = Number(options?.offset);
    if (Number.isInteger(limit) && limit > 0) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, Number.isInteger(offset) && offset > 0 ? offset : 0);
    }

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async getTeacherProfile(staffId: number) {
    const [staffRows] = await pool.query<RowDataPacket[]>(
      `SELECT st.id, st.employee_no, st.first_name, st.father_name, st.grandfather_name, st.name_am,
              st.gender, st.date_of_birth, st.phone, st.email, st.address, st.job_title, st.department,
              st.staff_type, st.hire_date, st.end_date, st.status, st.user_id, st.photo_document_id,
              st.created_at, st.updated_at,
              u.username AS linked_username, u.status AS user_account_status, u.email AS account_email,
              u.must_change_password, u.locked_until, u.last_login_at
         FROM staff st
         LEFT JOIN users u ON st.user_id = u.id
        WHERE st.id = ? AND st.deleted_at IS NULL`,
      [staffId]
    );
    if (!staffRows.length) return null;
    const staff = staffRows[0];

    const [assignments] = await pool.query<RowDataPacket[]>(
      `SELECT ta.id, ta.section_id, ta.subject_id, ta.academic_year_id, ta.is_active, ta.created_at,
              sub.code AS subject_code, sub.name AS subject_name,
              sec.name AS section_name, sec.stream AS section_stream,
              g.grade_level, g.display_name AS grade_name
         FROM teaching_assignments ta
         JOIN subjects sub ON ta.subject_id = sub.id
         JOIN sections sec ON ta.section_id = sec.id
         JOIN grades g ON sec.grade_id = g.id
        WHERE ta.staff_id = ? AND ta.is_active = 1
        ORDER BY g.grade_level ASC, sec.name ASC, sub.name ASC`,
      [staffId]
    );

    const [homeroom] = await pool.query<RowDataPacket[]>(
      `SELECT sec.id, sec.name AS section_name, g.display_name AS grade_name, g.grade_level,
              ay.name AS academic_year
         FROM sections sec
         JOIN grades g ON sec.grade_id = g.id
         LEFT JOIN academic_years ay ON sec.academic_year_id = ay.id
        WHERE sec.homeroom_staff_id = ? AND sec.status = 'active'
        ORDER BY g.grade_level ASC, sec.name ASC`,
      [staffId]
    );

    const [timetable] = await pool.query<RowDataPacket[]>(
      `SELECT te.id, ts.day_of_week, ts.start_time, ts.end_time, ts.label AS slot_label,
              sub.code AS subject_code, sub.name AS subject_name,
              sec.name AS section_name, g.display_name AS grade_name
         FROM timetable_entries te
         JOIN time_slots ts ON te.time_slot_id = ts.id
         JOIN subjects sub ON te.subject_id = sub.id
         JOIN sections sec ON te.section_id = sec.id
         JOIN grades g ON sec.grade_id = g.id
        WHERE te.staff_id = ?
        ORDER BY ts.day_of_week ASC, ts.start_time ASC`,
      [staffId]
    );

    const [attendance] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent,
              SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late,
              SUM(CASE WHEN status = 'on_leave' THEN 1 ELSE 0 END) AS on_leave
         FROM staff_attendance
        WHERE staff_id = ? AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [staffId]
    );

    return {
      staff,
      assignments,
      homeroom,
      timetable,
      attendanceSummary: attendance[0] || { total: 0, present: 0, absent: 0, late: 0, on_leave: 0 }
    };
  }

  async getTeacherAssignments(staffId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ta.id, ta.section_id, ta.subject_id, ta.academic_year_id, ta.is_active,
              sub.code AS subject_code, sub.name AS subject_name,
              sec.name AS section_name, sec.stream AS section_stream,
              g.grade_level, g.display_name AS grade_name,
              ay.name AS academic_year,
              (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = sec.id AND e.status = 'active') AS student_count
         FROM teaching_assignments ta
         JOIN subjects sub ON ta.subject_id = sub.id
         JOIN sections sec ON ta.section_id = sec.id
         JOIN grades g ON sec.grade_id = g.id
         LEFT JOIN academic_years ay ON ta.academic_year_id = ay.id
        WHERE ta.staff_id = ? AND ta.is_active = 1
        ORDER BY g.grade_level ASC, sec.name ASC, sub.name ASC`,
      [staffId]
    );
    return rows;
  }

  // =========================================================================
  // STAFF QUALIFICATIONS & SUPPORTING DOCUMENTS
  // =========================================================================
  async getStaffQualifications(staffId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT q.id, q.staff_id, q.qualification_level, q.title, q.institution, q.field_of_study,
              q.award_date, q.grade_or_class, q.registration_no, q.notes, q.created_at, q.updated_at,
              qd.id AS document_link_id, qd.document_id, qd.verification_status, qd.verification_note,
              qd.verified_at, qd.verified_by, qd.is_active AS document_active,
              d.original_name, d.mime_type, d.size_bytes, d.scan_status, d.created_at AS uploaded_at,
              verifier.username AS verified_by_username
         FROM staff_qualifications q
         LEFT JOIN qualification_documents qd ON qd.qualification_id = q.id AND qd.is_active = 1
         LEFT JOIN documents d ON d.id = qd.document_id AND d.deleted_at IS NULL
         LEFT JOIN users verifier ON verifier.id = qd.verified_by
        WHERE q.staff_id = ? AND q.deleted_at IS NULL
        ORDER BY COALESCE(q.award_date, '1900-01-01') DESC, q.id DESC`,
      [staffId]
    );
    return rows;
  }

  async getQualificationById(id: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, staff_id, qualification_level, title, institution, field_of_study, award_date,
              grade_or_class, registration_no, notes, deleted_at
         FROM staff_qualifications WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  async getActiveQualificationDocument(qualificationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT qd.id, qd.qualification_id, qd.document_id, qd.verification_status, qd.verification_note,
              qd.verified_by, qd.verified_at, qd.uploaded_by, qd.created_at,
              d.storage_key, d.mime_type, d.original_name, d.size_bytes, d.checksum_sha256, d.scan_status
         FROM qualification_documents qd
         JOIN documents d ON d.id = qd.document_id
        WHERE qd.qualification_id = ? AND qd.is_active = 1 AND d.deleted_at IS NULL
        ORDER BY qd.id DESC LIMIT 1`,
      [qualificationId]
    );
    return rows[0] || null;
  }

  async getQualificationDocumentByLinkId(linkId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT qd.id, qd.qualification_id, qd.document_id, qd.verification_status, qd.is_active,
              d.storage_key, d.mime_type, d.original_name, d.size_bytes, d.checksum_sha256, d.scan_status
         FROM qualification_documents qd
         JOIN documents d ON d.id = qd.document_id
        WHERE qd.id = ? AND d.deleted_at IS NULL LIMIT 1`,
      [linkId]
    );
    return rows[0] || null;
  }

  async createQualification(payload: {
    staffId: number;
    qualificationLevel: string;
    title: string;
    institution: string;
    fieldOfStudy?: string;
    awardDate?: string;
    gradeOrClass?: string;
    registrationNo?: string;
    notes?: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [staffRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, first_name, father_name FROM staff WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        [payload.staffId]
      );
      if (!staffRows.length) throw new AppError('Staff record not found.', 404, 'STAFF_NOT_FOUND');

      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO staff_qualifications
           (staff_id, qualification_level, title, institution, field_of_study, award_date,
            grade_or_class, registration_no, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.staffId,
          payload.qualificationLevel,
          payload.title,
          payload.institution,
          payload.fieldOfStudy || null,
          payload.awardDate || null,
          payload.gradeOrClass || null,
          payload.registrationNo || null,
          payload.notes || null,
          payload.adminUserId
        ]
      );
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, ?, 'STAFF_QUALIFICATION_CREATE', 'staff_qualifications', ?, 'success', ?, 'Qualification recorded for staff member')`,
        [
          payload.adminUserId,
          payload.adminUsername,
          String(res.insertId),
          JSON.stringify({
            staffId: payload.staffId,
            qualificationLevel: payload.qualificationLevel,
            title: payload.title,
            institution: payload.institution
          })
        ]
      );
      await conn.commit();
      return { id: res.insertId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateQualification(id: number, payload: {
    qualificationLevel?: string;
    title?: string;
    institution?: string;
    fieldOfStudy?: string;
    awardDate?: string;
    gradeOrClass?: string;
    registrationNo?: string;
    notes?: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    const fields: string[] = [];
    const params: any[] = [];
    if (payload.qualificationLevel !== undefined) { fields.push('qualification_level = ?'); params.push(payload.qualificationLevel); }
    if (payload.title !== undefined) { fields.push('title = ?'); params.push(payload.title.trim()); }
    if (payload.institution !== undefined) { fields.push('institution = ?'); params.push(payload.institution.trim()); }
    if (payload.fieldOfStudy !== undefined) { fields.push('field_of_study = ?'); params.push(payload.fieldOfStudy || null); }
    if (payload.awardDate !== undefined) { fields.push('award_date = ?'); params.push(payload.awardDate || null); }
    if (payload.gradeOrClass !== undefined) { fields.push('grade_or_class = ?'); params.push(payload.gradeOrClass || null); }
    if (payload.registrationNo !== undefined) { fields.push('registration_no = ?'); params.push(payload.registrationNo || null); }
    if (payload.notes !== undefined) { fields.push('notes = ?'); params.push(payload.notes || null); }
    if (!fields.length) throw new AppError('Provide at least one qualification field to update.', 400, 'EMPTY_UPDATE');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM staff_qualifications WHERE id = ? AND deleted_at IS NULL FOR UPDATE`, [id]
      );
      if (!rows.length) throw new AppError('Qualification not found.', 404, 'QUALIFICATION_NOT_FOUND');
      params.push(id);
      await conn.query(`UPDATE staff_qualifications SET ${fields.join(', ')} WHERE id = ?`, params);
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, ?, 'STAFF_QUALIFICATION_UPDATE', 'staff_qualifications', ?, 'success', ?, 'Qualification details updated')`,
        [
          payload.adminUserId,
          payload.adminUsername,
          String(id),
          JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([key]) => !['adminUserId', 'adminUsername'].includes(key))))
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

  async deleteQualification(id: number, adminUserId: number, adminUsername: string) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id, staff_id, title FROM staff_qualifications WHERE id = ? AND deleted_at IS NULL FOR UPDATE`, [id]
      );
      if (!rows.length) throw new AppError('Qualification not found.', 404, 'QUALIFICATION_NOT_FOUND');
      await conn.query(`UPDATE staff_qualifications SET deleted_at = NOW(3) WHERE id = ?`, [id]);
      await conn.query(
        `UPDATE qualification_documents SET is_active = 0, verification_status = 'replaced' WHERE qualification_id = ? AND is_active = 1`,
        [id]
      );
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, ?, 'STAFF_QUALIFICATION_DELETE', 'staff_qualifications', ?, 'success', ?, 'Qualification removed')`,
        [adminUserId, adminUsername, String(id), JSON.stringify({ staffId: rows[0].staff_id, title: rows[0].title })]
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

  async attachQualificationDocument(payload: {
    qualificationId: number;
    originalName: string;
    mimeType: string;
    bytes: Buffer;
    adminUserId: number;
    adminUsername: string;
  }) {
    const extensionMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png'
    };
    const extension = extensionMap[payload.mimeType];
    if (!extension) throw new AppError('Unsupported document type.', 400, 'UNSUPPORTED_DOCUMENT_TYPE');

    const storageName = `${randomUUID()}.${extension}`;
    const storageKey = `staff_qualification_documents/${storageName}`;
    const dir = path.resolve(
      process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'),
      'staff_qualification_documents'
    );
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, storageName);
    await writeFile(filePath, payload.bytes, { flag: 'wx', mode: 0o600 });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [qualRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, staff_id, title FROM staff_qualifications WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        [payload.qualificationId]
      );
      if (!qualRows.length) throw new AppError('Qualification not found.', 404, 'QUALIFICATION_NOT_FOUND');

      // Supersede any existing active document for this qualification.
      await conn.query(
        `UPDATE qualification_documents SET is_active = 0, verification_status = 'replaced' WHERE qualification_id = ? AND is_active = 1`,
        [payload.qualificationId]
      );

      const [docRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO documents (owner_type, owner_id, doc_type, original_name, storage_key, mime_type, size_bytes, checksum_sha256, scan_status, uploaded_by)
         VALUES ('staff_qualification', ?, 'qualification_certificate', ?, ?, ?, ?, ?, 'skipped', ?)`,
        [
          payload.qualificationId,
          path.basename(payload.originalName).slice(0, 255),
          storageKey,
          payload.mimeType,
          payload.bytes.length,
          createHash('sha256').update(payload.bytes).digest('hex'),
          payload.adminUserId
        ]
      );
      const [linkRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO qualification_documents (qualification_id, document_id, verification_status, is_active, uploaded_by)
         VALUES (?, ?, 'pending', 1, ?)`,
        [payload.qualificationId, docRes.insertId, payload.adminUserId]
      );
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, ?, 'STAFF_QUALIFICATION_DOCUMENT_UPLOAD', 'staff_qualifications', ?, 'success', ?, 'Supporting document uploaded')`,
        [
          payload.adminUserId,
          payload.adminUsername,
          String(payload.qualificationId),
          JSON.stringify({ documentId: docRes.insertId, originalName: payload.originalName, mimeType: payload.mimeType, sizeBytes: payload.bytes.length })
        ]
      );
      await conn.commit();
      return { linkId: linkRes.insertId, documentId: docRes.insertId };
    } catch (err) {
      await conn.rollback();
      await unlink(filePath).catch(() => undefined);
      throw err;
    } finally {
      conn.release();
    }
  }

  async setQualificationDocumentVerification(payload: {
    linkId: number;
    status: 'verified' | 'rejected';
    note?: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT qd.id, qd.qualification_id, qd.document_id, qd.verification_status
           FROM qualification_documents qd
          WHERE qd.id = ? FOR UPDATE`,
        [payload.linkId]
      );
      if (!rows.length) throw new AppError('Qualification document not found.', 404, 'QUALIFICATION_DOCUMENT_NOT_FOUND');
      if (!Number(rows[0].qualification_id)) throw new AppError('Qualification document is not linked.', 409, 'QUALIFICATION_DOCUMENT_UNLINKED');

      await conn.query(
        `UPDATE qualification_documents
            SET verification_status = ?, verification_note = ?, verified_by = ?, verified_at = NOW(3)
          WHERE id = ?`,
        [payload.status, payload.note || null, payload.adminUserId, payload.linkId]
      );
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, ?, ?, 'staff_qualifications', ?, 'success', ?, ?)`,
        [
          payload.adminUserId,
          payload.adminUsername,
          payload.status === 'verified' ? 'STAFF_QUALIFICATION_DOCUMENT_VERIFY' : 'STAFF_QUALIFICATION_DOCUMENT_REJECT',
          String(rows[0].qualification_id),
          JSON.stringify({ documentId: rows[0].document_id, verificationStatus: payload.status }),
          payload.note || `Document marked ${payload.status}`
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

  async getQualificationAuditHistory(staffId: number, limit = 50) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT al.id, al.occurred_at, al.actor_username, al.action, al.outcome, al.changes, al.reason
         FROM audit_logs al
         JOIN staff_qualifications q ON q.id = al.entity_id AND al.entity_type = 'staff_qualifications'
        WHERE q.staff_id = ?
          AND al.action LIKE 'STAFF_QUALIFICATION%'
        ORDER BY al.occurred_at DESC, al.id DESC
        LIMIT ?`,
      [staffId, limit]
    );
    return rows;
  }

  async readQualificationDocumentFile(linkId: number) {
    const doc = await this.getQualificationDocumentByLinkId(linkId);
    if (!doc) throw new AppError('Qualification document not found.', 404, 'QUALIFICATION_DOCUMENT_NOT_FOUND');
    const key = String(doc.storage_key);
    if (!/^staff_qualification_documents\/[a-f0-9-]+\.(?:pdf|jpg|png)$/i.test(key)) {
      throw new AppError('Qualification document storage reference is invalid.', 500, 'QUALIFICATION_DOCUMENT_STORAGE_ERROR');
    }
    try {
      const bytes = await readFile(path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'), key));
      return { bytes, mimeType: String(doc.mime_type), originalName: String(doc.original_name) };
    } catch {
      throw new AppError('Qualification document file is unavailable.', 404, 'QUALIFICATION_DOCUMENT_NOT_FOUND');
    }
  }

  async createStaff(payload: {
    employeeNo: string;
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    phone?: string;
    email?: string;
    jobTitle: string;
    department: string;
    staffType: 'teacher' | 'administrator' | 'librarian' | 'accountant' | 'support' | 'other';
    hireDate?: string;
    createAccount?: boolean;
    username?: string;
    password?: string;
    roleCode?: string;
    adminUserId: number;
    adminUsername: string;
    photo?: { originalName: string; mimeType: string; dataBase64: string };
  }) {
    let photoFilePath: string | undefined;
    let photoBytes: Buffer | undefined;
    let photoMime = '';
    let photoName = '';
    if (payload.photo) {
      const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(payload.photo.dataBase64 || '');
      if (!match || match[1] !== payload.photo.mimeType) throw new AppError('Upload a valid JPEG or PNG staff photo.', 400, 'INVALID_STAFF_PHOTO');
      photoMime = match[1];
      photoBytes = Buffer.from(match[2], 'base64');
      if (!photoBytes.length || photoBytes.length > 5 * 1024 * 1024) throw new AppError('Staff photo must be no larger than 5 MB.', 400, 'STAFF_PHOTO_TOO_LARGE');
      const isJpeg = photoMime === 'image/jpeg' && photoBytes[0] === 0xff && photoBytes[1] === 0xd8 && photoBytes[2] === 0xff;
      const isPng = photoMime === 'image/png' && photoBytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (!isJpeg && !isPng) throw new AppError('The photo contents do not match a supported image format.', 400, 'INVALID_STAFF_PHOTO');
      photoName = path.basename(payload.photo.originalName || 'staff-photo').slice(0, 255);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check unique employeeNo
      const [empCheck] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM staff WHERE employee_no = ?`,
        [payload.employeeNo]
      );
      if (empCheck.length > 0) {
        throw new AppError(`Employee number '${payload.employeeNo}' is already taken.`, 409, 'DUPLICATE_EMPLOYEE_NO');
      }

      let userId: number | null = null;

      // Create linked user account if requested
      if (payload.createAccount && payload.username && payload.password) {
        const [userCheck] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1`,
          [payload.username, payload.email || null]
        );
        if (userCheck.length > 0) {
          throw new AppError(`Username '${payload.username}' is already in use.`, 409, 'DUPLICATE_USERNAME');
        }

        const passwordHash = await bcrypt.hash(payload.password, 10);
        const [uRes] = await conn.query<ResultSetHeader>(
          `INSERT INTO users (username, email, phone, password_hash, status, must_change_password)
           VALUES (?, ?, ?, ?, 'active', 1)`,
          [payload.username, payload.email || null, payload.phone || null, passwordHash]
        );
        userId = uRes.insertId;

        // Assign role
        let targetRole = payload.roleCode!;
        if (targetRole === 'administrator' || targetRole === 'admin') {
          targetRole = 'system_admin';
        }
        const [roleRows] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM roles WHERE code = ? LIMIT 1`,
          [targetRole]
        );
        if (roleRows.length === 0) throw new AppError('Selected account role does not exist.', 400, 'INVALID_ROLE');
        await conn.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
          [userId, roleRows[0].id]
        );
      }

      // Insert staff
      const [stRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO staff (employee_no, first_name, father_name, grandfather_name, gender, phone, email, job_title, department, staff_type, hire_date, user_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [
          payload.employeeNo,
          payload.firstName,
          payload.fatherName,
          payload.grandfatherName || null,
          payload.gender,
          payload.phone || null,
          payload.email || null,
          payload.jobTitle,
          payload.department,
          payload.staffType,
          payload.hireDate || new Date().toISOString().split('T')[0],
          userId
        ]
      );
      const staffId = stRes.insertId;

      // Attach the profile photo after the staff row exists, so owner_id is known.
      let photoDocumentId: number | null = null;
      if (photoBytes) {
        const storageName = `${randomUUID()}.${photoMime === 'image/jpeg' ? 'jpg' : 'png'}`;
        const storageDir = path.resolve(process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads'), 'staff_photos');
        await mkdir(storageDir, { recursive: true });
        photoFilePath = path.join(storageDir, storageName);
        await writeFile(photoFilePath, photoBytes, { flag: 'wx', mode: 0o600 });
        const [docResult] = await conn.query<ResultSetHeader>(
          `INSERT INTO documents (owner_type, owner_id, doc_type, original_name, storage_key, mime_type, size_bytes, checksum_sha256, scan_status, uploaded_by)
           VALUES ('staff', ?, 'staff_profile_photo', ?, ?, ?, ?, ?, 'skipped', ?)`,
          [
            staffId,
            photoName,
            `staff_photos/${storageName}`,
            photoMime,
            photoBytes.length,
            createHash('sha256').update(photoBytes).digest('hex'),
            payload.adminUserId
          ]
        );
        photoDocumentId = docResult.insertId;
        await conn.query(`UPDATE staff SET photo_document_id = ? WHERE id = ?`, [photoDocumentId, staffId]);
      }

      // Audit log
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(), ?, ?, 'STAFF_CREATE', 'staff', ?, 'success', ?, 'New staff member registered by admin')`,
        [
          payload.adminUserId,
          payload.adminUsername,
          String(staffId),
          JSON.stringify({ employeeNo: payload.employeeNo, staffType: payload.staffType, userId, hasPhoto: Boolean(photoDocumentId) })
        ]
      );

      await conn.commit();
      return { id: staffId, employeeNo: payload.employeeNo, userId, photoDocumentId };
    } catch (err) {
      await conn.rollback();
      if (photoFilePath) await unlink(photoFilePath).catch(() => undefined);
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateStaff(id: number, payload: {
    employeeNo?: string;
    firstName?: string;
    fatherName?: string;
    grandfatherName?: string;
    gender?: 'female' | 'male';
    dateOfBirth?: string;
    phone?: string;
    email?: string;
    address?: string;
    jobTitle?: string;
    department?: string;
    staffType?: 'teacher' | 'administrator' | 'support' | 'librarian' | 'accountant' | 'other';
    hireDate?: string;
    status?: 'active' | 'on_leave' | 'terminated';
    adminUserId: number;
    adminUsername: string;
  }) {
    const fields: string[] = [];
    const params: any[] = [];

    if (payload.employeeNo !== undefined) { fields.push('employee_no = ?'); params.push(payload.employeeNo.trim()); }
    if (payload.firstName !== undefined) { fields.push('first_name = ?'); params.push(payload.firstName.trim()); }
    if (payload.fatherName !== undefined) { fields.push('father_name = ?'); params.push(payload.fatherName.trim()); }
    if (payload.grandfatherName !== undefined) { fields.push('grandfather_name = ?'); params.push(payload.grandfatherName.trim() || null); }
    if (payload.gender !== undefined) { fields.push('gender = ?'); params.push(payload.gender); }
    if (payload.dateOfBirth !== undefined) { fields.push('date_of_birth = ?'); params.push(payload.dateOfBirth || null); }
    if (payload.phone !== undefined) { fields.push('phone = ?'); params.push(payload.phone || null); }
    if (payload.email !== undefined) { fields.push('email = ?'); params.push(payload.email || null); }
    if (payload.address !== undefined) { fields.push('address = ?'); params.push(payload.address || null); }
    if (payload.jobTitle !== undefined) { fields.push('job_title = ?'); params.push(payload.jobTitle.trim()); }
    if (payload.department !== undefined) { fields.push('department = ?'); params.push(payload.department || null); }
    if (payload.staffType !== undefined) { fields.push('staff_type = ?'); params.push(payload.staffType); }
    if (payload.hireDate !== undefined) { fields.push('hire_date = ?'); params.push(payload.hireDate || null); }
    if (payload.status) { fields.push('status = ?'); params.push(payload.status); }
    if (payload.status === 'terminated') { fields.push('end_date = COALESCE(end_date, CURRENT_DATE)'); }
    else if (payload.status === 'active') { fields.push('end_date = NULL'); }

    if (fields.length === 0) throw new AppError('Provide at least one staff field to update.', 400, 'EMPTY_UPDATE');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [staffRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM staff WHERE id = ? FOR UPDATE`, [id]);
      if (!staffRows.length) throw new AppError('Staff record not found.', 404, 'STAFF_NOT_FOUND');
      params.push(id);
      await conn.query(`UPDATE staff SET ${fields.join(', ')} WHERE id = ?`, params);
      const accountFields: string[] = [];
      const accountParams: any[] = [];
      if (payload.phone !== undefined) { accountFields.push('u.phone = ?'); accountParams.push(payload.phone || null); }
      if (payload.email !== undefined) { accountFields.push('u.email = ?'); accountParams.push(payload.email || null); }
      if (accountFields.length) {
        accountParams.push(id);
        await conn.query(`UPDATE users u JOIN staff st ON st.user_id = u.id SET ${accountFields.join(', ')} WHERE st.id = ?`, accountParams);
      }
      if (payload.status === 'terminated') {
        await conn.query(
          `UPDATE users u JOIN staff st ON st.user_id = u.id SET u.status = 'disabled' WHERE st.id = ?`, [id]
        );
      }
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(), ?, ?, 'STAFF_UPDATE', 'staff', ?, 'success', ?, 'Staff profile updated')`,
        [payload.adminUserId, payload.adminUsername, String(id), JSON.stringify(payload)]
      );
      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      if ((err as any)?.code === 'ER_DUP_ENTRY') throw new AppError('That employee number or staff account email is already assigned to another record.', 409, 'DUPLICATE_STAFF_RECORD');
      throw err;
    } finally {
      conn.release();
    }
  }

  async createUser(payload: {
    username: string;
    email: string;
    phone?: string;
    password: string;
    roleCode: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [exist] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM users WHERE username = ? OR email = ?`,
        [payload.username, payload.email]
      );
      if (exist.length > 0) {
        throw new AppError('Username or email is already registered.', 409, 'DUPLICATE_USER');
      }

      const passwordHash = await bcrypt.hash(payload.password, 10);
      const [uRes] = await conn.query<ResultSetHeader>(
        `INSERT INTO users (username, email, phone, password_hash, status, must_change_password)
         VALUES (?, ?, ?, ?, 'active', 1)`,
        [payload.username, payload.email, payload.phone || null, passwordHash]
      );
      const userId = uRes.insertId;

      // Assign role
      let targetRole = payload.roleCode;
      if (targetRole === 'administrator' || targetRole === 'admin') {
        targetRole = 'system_admin';
      }
      const [roleRows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM roles WHERE code = ? LIMIT 1`,
        [targetRole]
      );
      if (roleRows.length === 0) throw new AppError('Selected account role does not exist.', 400, 'INVALID_ROLE');
      await conn.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
        [userId, roleRows[0].id]
      );

      // Audit log
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(), ?, ?, 'USER_CREATE', 'users', ?, 'success', ?, 'User account created by admin')`,
        [
          payload.adminUserId,
          payload.adminUsername,
          String(userId),
          JSON.stringify({ username: payload.username, role: payload.roleCode })
        ]
      );

      await conn.commit();
      return { id: userId, username: payload.username };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async resetUserPassword(payload: {
    userId: number;
    newPassword: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    const passwordHash = await bcrypt.hash(payload.newPassword, 10);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [users] = await conn.query<RowDataPacket[]>(`SELECT id FROM users WHERE id = ? FOR UPDATE`, [payload.userId]);
      if (!users.length) throw new AppError('User account not found.', 404, 'USER_NOT_FOUND');
      await conn.query(
        `UPDATE users SET password_hash = ?, password_changed_at = NOW(), failed_login_count = 0, must_change_password = 1 WHERE id = ?`,
        [passwordHash, payload.userId]
      );
      await conn.query(
        `UPDATE refresh_sessions SET revoked_at = NOW(3), revoked_reason = 'password_change' WHERE user_id = ? AND revoked_at IS NULL`,
        [payload.userId]
      );
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
         VALUES (NOW(), ?, ?, 'USER_PASSWORD_RESET', 'users', ?, 'success', 'Password reset initiated by administrator')`,
        [payload.adminUserId, payload.adminUsername, String(payload.userId)]
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

  async isLastActiveAdmin(userId: number): Promise<boolean> {
    const [userRole] = await pool.query<RowDataPacket[]>(
      `SELECT ur.user_id FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = ? AND r.code = 'system_admin'`,
      [userId]
    );
    if (userRole.length === 0) {
      return false;
    }

    const [adminCount] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT u.id) as active_admin_count
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = 'system_admin' AND u.status = 'active'`
    );
    const count = Number(adminCount[0]?.active_admin_count || 0);
    return count <= 1;
  }

  async updateUserRoles(payload: {
    userId: number;
    roleCodes: string[];
    adminUserId: number;
    adminUsername: string;
  }) {
    const normalizedRoles = payload.roleCodes.map(r => (r === 'administrator' || r === 'admin') ? 'system_admin' : r);
    if (!normalizedRoles.includes('system_admin')) {
      const isLast = await this.isLastActiveAdmin(payload.userId);
      if (isLast) {
        throw new AppError('Cannot remove system_admin role from the last active administrator.', 403, 'LAST_ACTIVE_ADMIN_PROTECTED');
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(`DELETE FROM user_roles WHERE user_id = ?`, [payload.userId]);

      for (const code of payload.roleCodes) {
        const [roleRows] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM roles WHERE code = ? LIMIT 1`,
          [code]
        );
        if (roleRows.length > 0) {
          await conn.query(`INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`, [payload.userId, roleRows[0].id]);
        }
      }

      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(), ?, ?, 'USER_ROLES_UPDATE', 'users', ?, 'success', ?, 'User role permissions updated')`,
        [
          payload.adminUserId,
          payload.adminUsername,
          String(payload.userId),
          JSON.stringify({ roles: payload.roleCodes })
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

  async getAllRoles() {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id, code, name, description FROM roles ORDER BY id');
    return rows;
  }

  async getAllUsers(search?: string, roleFilter?: string) {
    let sql = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.phone,
        u.status,
        u.last_login_at,
        u.created_at,
        GROUP_CONCAT(DISTINCT r.name SEPARATOR ', ') as roles_display,
        GROUP_CONCAT(DISTINCT r.code SEPARATOR ',') as role_codes,
        CONCAT_WS(' ', s.first_name, s.father_name) as staff_name,
        CONCAT_WS(' ', st.first_name, st.father_name) as student_name,
        CONCAT_WS(' ', g.first_name, g.father_name) as guardian_name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN staff s ON u.id = s.user_id
      LEFT JOIN students st ON u.id = st.user_id
      LEFT JOIN guardians g ON u.id = g.user_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      sql += ` AND (u.username LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (roleFilter) {
      sql += ` AND r.code = ?`;
      params.push(roleFilter);
    }

    sql += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`;

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      phone: r.phone,
      status: r.status,
      lastLoginAt: r.last_login_at,
      createdAt: r.created_at,
      roles: r.roles_display || 'No Role',
      roleCodes: r.role_codes ? r.role_codes.split(',') : [],
      displayName: r.staff_name || r.student_name || r.guardian_name || r.username
    }));
  }

  async updateUserStatus(userId: number, status: 'active' | 'disabled') {
    if (status === 'disabled') {
      const isLast = await this.isLastActiveAdmin(userId);
      if (isLast) {
        throw new AppError('Cannot deactivate the last active system administrator.', 403, 'LAST_ACTIVE_ADMIN_PROTECTED');
      }
    }
    const [res] = await pool.query<ResultSetHeader>(
      `UPDATE users SET status = ? WHERE id = ?`,
      [status, userId]
    );
    return res.affectedRows > 0;
  }

  // =========================================================================
  // PAGE 4: ACADEMIC STRUCTURE AND CONFIGURATION
  // =========================================================================
  async getAcademicStructure() {
    const [academicYears] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM academic_years ORDER BY start_date DESC`
    );

    const [terms] = await pool.query<RowDataPacket[]>(
      `SELECT t.*, ay.name as academic_year_name 
       FROM terms t 
       JOIN academic_years ay ON t.academic_year_id = ay.id 
       ORDER BY t.start_date DESC`
    );

    const [grades] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM grades ORDER BY grade_level ASC`
    );

    const [sections] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id,
         s.name,
         s.stream,
         s.capacity,
         s.status,
         g.id as grade_id,
         g.grade_level,
         g.display_name as grade_name,
         ay.id as academic_year_id,
         ay.name as academic_year_name,
         cr.id as classroom_id,
         cr.name as classroom_name,
         st.id as homeroom_staff_id,
         CONCAT_WS(' ', st.first_name, st.father_name) as homeroom_teacher,
         (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') as enrolled_count
       FROM sections s
       JOIN grades g ON s.grade_id = g.id
       JOIN academic_years ay ON s.academic_year_id = ay.id
       LEFT JOIN classrooms cr ON s.classroom_id = cr.id
       LEFT JOIN staff st ON s.homeroom_staff_id = st.id
       WHERE s.deleted_at IS NULL
       ORDER BY g.grade_level ASC, s.name ASC`
    );

    const [classrooms] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM classrooms ORDER BY building, name`
    );

    const [subjects] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM subjects WHERE deleted_at IS NULL ORDER BY code ASC`
    );

    const [gradeSubjects] = await pool.query<RowDataPacket[]>(
      `SELECT gs.*, g.display_name as grade_name, s.code as subject_code, s.name as subject_name, ay.name as academic_year_name
       FROM grade_subjects gs
       JOIN grades g ON gs.grade_id = g.id
       JOIN subjects s ON gs.subject_id = s.id
       LEFT JOIN academic_years ay ON ay.id = gs.academic_year_id
       ORDER BY g.grade_level ASC, s.name ASC`
    );

    return {
      academicYears,
      terms,
      grades,
      sections,
      classrooms,
      subjects,
      gradeSubjects
    };
  }

  async getGradeById(id: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, grade_level, display_name, is_active FROM grades WHERE id = ? LIMIT 1`, [id]
    );
    return rows[0] || null;
  }

  async createGrade(payload: { gradeLevel: number; displayName: string; adminUserId: number; adminUsername: string }) {
    let res: ResultSetHeader;
    try {
      [res] = await pool.query<ResultSetHeader>(
        `INSERT INTO grades (grade_level, display_name, has_streams, is_active)
         VALUES (?, ?, ?, 1)`,
        [payload.gradeLevel, payload.displayName, payload.gradeLevel >= 11 ? 1 : 0]
      );
    } catch (err) {
      if ((err as any)?.code === 'ER_DUP_ENTRY') throw new AppError('That grade is already configured.', 409, 'DUPLICATE_GRADE');
      throw err;
    }
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
       VALUES (NOW(), ?, ?, 'GRADE_CREATE', 'grades', ?, 'success', ?, 'Academic grade created by administrator')`,
      [payload.adminUserId, payload.adminUsername, String(res.insertId), JSON.stringify({ gradeLevel: payload.gradeLevel, displayName: payload.displayName })]
    );
    return res.insertId;
  }

  async updateGrade(id: number, payload: { displayName?: string; isActive?: boolean; adminUserId: number; adminUsername: string }) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, grade_level, display_name, is_active FROM grades WHERE id = ? LIMIT 1`, [id]
    );
    if (!rows.length) throw new AppError('Grade was not found.', 404, 'GRADE_NOT_FOUND');
    const before = rows[0];
    const displayName = payload.displayName ?? String(before.display_name);
    const isActive = payload.isActive ?? Boolean(before.is_active);
    await pool.query(`UPDATE grades SET display_name = ?, is_active = ? WHERE id = ?`, [displayName, isActive ? 1 : 0, id]);
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
       VALUES (NOW(), ?, ?, 'GRADE_UPDATE', 'grades', ?, 'success', ?, 'Academic grade updated by administrator')`,
      [payload.adminUserId, payload.adminUsername, String(id), JSON.stringify({ before: { displayName: before.display_name, isActive: Boolean(before.is_active) }, after: { displayName, isActive } })]
    );
    return true;
  }

  async createAcademicYear(payload: {
    name: string;
    labelEc?: string;
    startDate: string;
    endDate: string;
  }) {
    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO academic_years (name, label_ec, start_date, end_date, status, is_current)
       VALUES (?, ?, ?, ?, 'planned', 0)`,
      [payload.name, payload.labelEc || null, payload.startDate, payload.endDate]
    );
    return res.insertId;
  }

  async setActiveAcademicYear(id: number) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(`UPDATE academic_years SET is_current = 0, current_key = NULL, status = 'planned' WHERE id != ?`, [id]);
      await conn.query(`UPDATE academic_years SET is_current = 1, current_key = 1, status = 'active' WHERE id = ?`, [id]);
      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async createTerm(payload: {
    academicYearId: number;
    termNo: number;
    name: string;
    startDate: string;
    endDate: string;
  }) {
    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO terms (academic_year_id, term_no, name, start_date, end_date, status, is_current)
       VALUES (?, ?, ?, ?, ?, 'planned', 0)`,
      [payload.academicYearId, payload.termNo, payload.name, payload.startDate, payload.endDate]
    );
    return res.insertId;
  }

  async setActiveTerm(id: number) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(`UPDATE terms SET is_current = 0, current_key = NULL, status = 'planned' WHERE id != ?`, [id]);
      await conn.query(`UPDATE terms SET is_current = 1, current_key = 1, status = 'active' WHERE id = ?`, [id]);
      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async createSection(payload: {
    gradeId: number;
    academicYearId: number;
    name: string;
    stream: 'none' | 'natural_science' | 'social_science';
    capacity: number;
    homeroomStaffId?: number;
    classroomId?: number;
  }) {
    const [gradeRows] = await pool.query<RowDataPacket[]>(
      `SELECT g.id, g.grade_level, g.is_active, ay.status AS year_status
       FROM grades g CROSS JOIN academic_years ay
       WHERE g.id = ? AND ay.id = ? LIMIT 1`,
      [payload.gradeId, payload.academicYearId]
    );
    const grade = gradeRows[0];
    if (!grade) throw new AppError('Selected grade or academic year was not found.', 404, 'ACADEMIC_REFERENCE_NOT_FOUND');
    if (!Number(grade.is_active)) throw new AppError('Selected grade is inactive.', 409, 'GRADE_INACTIVE');
    if (grade.year_status === 'closed') throw new AppError('Sections cannot be added to a closed academic year.', 409, 'ACADEMIC_YEAR_CLOSED');
    try {
      const [res] = await pool.query<ResultSetHeader>(
        `INSERT INTO sections (grade_id, academic_year_id, name, stream, capacity, homeroom_staff_id, classroom_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
        [payload.gradeId, payload.academicYearId, payload.name, payload.stream || 'none', payload.capacity, payload.homeroomStaffId || null, payload.classroomId || null]
      );
      return res.insertId;
    } catch (err) {
      if ((err as any)?.code === 'ER_DUP_ENTRY') throw new AppError('That section name already exists for this grade and academic year.', 409, 'DUPLICATE_SECTION');
      throw err;
    }
  }

  async updateSection(id: number, payload: {
    name?: string;
    capacity?: number;
    homeroomStaffId?: number;
    classroomId?: number;
    status?: string;
  }) {
    const fields: string[] = [];
    const values: any[] = [];
    if (payload.name !== undefined) { fields.push('name = ?'); values.push(payload.name); }
    if (payload.capacity !== undefined) { fields.push('capacity = ?'); values.push(payload.capacity); }
    if (payload.homeroomStaffId !== undefined) { fields.push('homeroom_staff_id = ?'); values.push(payload.homeroomStaffId || null); }
    if (payload.classroomId !== undefined) { fields.push('classroom_id = ?'); values.push(payload.classroomId || null); }
    if (payload.status !== undefined) { fields.push('status = ?'); values.push(payload.status); }
    if (!fields.length) throw new AppError('No section changes were provided.', 400, 'EMPTY_SECTION_UPDATE');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [sectionRows] = await conn.query<RowDataPacket[]>(
        `SELECT sec.id, sec.capacity, sec.grade_id, sec.academic_year_id, g.is_active AS grade_active, ay.status AS year_status
         FROM sections sec JOIN grades g ON g.id = sec.grade_id JOIN academic_years ay ON ay.id = sec.academic_year_id
         WHERE sec.id = ? AND sec.deleted_at IS NULL FOR UPDATE`, [id]
      );
      if (!sectionRows.length) throw new AppError('Section was not found.', 404, 'SECTION_NOT_FOUND');
      if (payload.status === 'active' && (!Number(sectionRows[0].grade_active) || sectionRows[0].year_status === 'closed')) {
        throw new AppError('A section can only be activated when its grade and academic year are active.', 409, 'SECTION_PARENT_INACTIVE');
      }
      const [countRows] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS active_count FROM enrollments WHERE section_id = ? AND status = 'active'`, [id]
      );
      if (payload.capacity !== undefined && Number(payload.capacity) < Number(countRows[0]?.active_count || 0)) {
        throw new AppError(`Capacity cannot be lower than the ${Number(countRows[0]?.active_count || 0)} active enrollments.`, 409, 'CAPACITY_BELOW_ENROLLMENT');
      }
      values.push(id);
      await conn.query(`UPDATE sections SET ${fields.join(', ')} WHERE id = ?`, values);
      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      if ((err as any)?.code === 'ER_DUP_ENTRY') throw new AppError('That section name already exists for this grade and academic year.', 409, 'DUPLICATE_SECTION');
      throw err;
    } finally {
      conn.release();
    }
  }

  async createSubject(payload: {
    code: string;
    name: string;
    nameAm?: string;
    description?: string;
  }) {
    try {
      const [res] = await pool.query<ResultSetHeader>(
        `INSERT INTO subjects (code, name, name_am, description, status) VALUES (?, ?, ?, ?, 'active')`,
        [payload.code, payload.name, payload.nameAm || null, payload.description || null]
      );
      return res.insertId;
    } catch (err) {
      if ((err as any)?.code === 'ER_DUP_ENTRY') throw new AppError('Subject code already exists.', 409, 'DUPLICATE_SUBJECT_CODE');
      throw err;
    }
  }

  async updateSubject(id: number, payload: {
    code?: string;
    name?: string;
    nameAm?: string;
    description?: string;
    status?: string;
  }) {
    const fields: string[] = [];
    const params: any[] = [];
    if (payload.code) { fields.push('code = ?'); params.push(payload.code); }
    if (payload.name) { fields.push('name = ?'); params.push(payload.name); }
    if (payload.nameAm !== undefined) { fields.push('name_am = ?'); params.push(payload.nameAm || null); }
    if (payload.description !== undefined) { fields.push('description = ?'); params.push(payload.description || null); }
    if (payload.status) { fields.push('status = ?'); params.push(payload.status); }
    if (fields.length === 0) return true;
    params.push(id);
    try {
      const [result] = await pool.query<ResultSetHeader>(`UPDATE subjects SET ${fields.join(', ')} WHERE id = ?`, params);
      if (!result.affectedRows) throw new AppError('Subject was not found.', 404, 'SUBJECT_NOT_FOUND');
    } catch (err) {
      if ((err as any)?.code === 'ER_DUP_ENTRY') throw new AppError('Subject code already exists.', 409, 'DUPLICATE_SUBJECT_CODE');
      throw err;
    }
    return true;
  }

  async addGradeSubject(payload: {
    gradeId: number;
    subjectId: number;
    stream: 'all' | 'natural_science' | 'social_science';
    isCompulsory?: boolean;
    periodsPerWeek?: number;
    academicYearId?: number;
  }) {
    const [gradeRows] = await pool.query<RowDataPacket[]>(`SELECT id, grade_level FROM grades WHERE id = ? AND is_active = 1`, [payload.gradeId]);
    if (!gradeRows.length) throw new AppError('Selected grade is inactive or unavailable.', 409, 'GRADE_INACTIVE');
    if (Number(gradeRows[0].grade_level) <= 10 && payload.stream !== 'all') throw new AppError('Grades 9 and 10 use the common curriculum.', 400, 'GRADE_STREAM_MISMATCH');
    const [subjectRows] = await pool.query<RowDataPacket[]>(`SELECT id FROM subjects WHERE id = ? AND status = 'active' AND deleted_at IS NULL`, [payload.subjectId]);
    if (!subjectRows.length) throw new AppError('Selected subject is inactive or unavailable.', 409, 'SUBJECT_INACTIVE');
    if (payload.academicYearId) {
      const [yearRows] = await pool.query<RowDataPacket[]>(`SELECT id FROM academic_years WHERE id = ?`, [payload.academicYearId]);
      if (!yearRows.length) throw new AppError('Selected academic year was not found.', 404, 'ACADEMIC_YEAR_NOT_FOUND');
    }
    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO grade_subjects (grade_id, subject_id, stream, academic_year_id, is_compulsory, periods_per_week)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [payload.gradeId, payload.subjectId, payload.stream || 'all', payload.academicYearId || null, payload.isCompulsory ? 1 : 0, payload.periodsPerWeek || 4]
    );
    return res.insertId;
  }

  async removeGradeSubject(id: number) {
    const [mappingRows] = await pool.query<RowDataPacket[]>(`SELECT grade_id, subject_id FROM grade_subjects WHERE id = ?`, [id]);
    if (!mappingRows.length) throw new AppError('Curriculum mapping was not found.', 404, 'GRADE_SUBJECT_NOT_FOUND');
    const [usedRows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 AS used FROM teaching_assignments ta JOIN sections sec ON sec.id = ta.section_id
       WHERE sec.grade_id = ? AND ta.subject_id = ? LIMIT 1`,
      [mappingRows[0].grade_id, mappingRows[0].subject_id]
    );
    if (usedRows.length) throw new AppError('This curriculum mapping has teaching history; deactivate or update the subject instead of deleting it.', 409, 'GRADE_SUBJECT_IN_USE');
    await pool.query(`DELETE FROM grade_subjects WHERE id = ?`, [id]);
    return true;
  }

  async getSystemSettings() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT setting_key, value_json, description, version, updated_at FROM system_settings ORDER BY setting_key`
    );
    return rows;
  }

  async updateSystemSetting(key: string, value: any, adminUserId: number, adminUsername: string) {
    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT setting_key FROM system_settings WHERE setting_key = ?`,
      [key]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE system_settings 
         SET value_json = ?, version = version + 1, updated_by = ?, updated_at = NOW() 
         WHERE setting_key = ?`,
        [JSON.stringify(value), adminUserId, key]
      );
    } else {
      await pool.query(
        `INSERT INTO system_settings (setting_key, value_json, description, version, updated_by, updated_at)
         VALUES (?, ?, ?, 1, ?, NOW())`,
        [key, JSON.stringify(value), `System configuration parameter for ${key}`, adminUserId]
      );
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
       VALUES (NOW(), ?, ?, 'SYSTEM_SETTING_UPDATE', 'system_settings', ?, 'success', ?, 'Setting updated by admin')`,
      [adminUserId, adminUsername, key, JSON.stringify({ key, value })]
    );

    return true;
  }

  // =========================================================================
  // PAGE 5: TEACHING ASSIGNMENTS AND TIMETABLE
  // =========================================================================
  async getTeachingAssignments(academicYearId?: number, sectionId?: number, subjectId?: number) {
    let sql = `
      SELECT 
        ta.id,
        ta.is_active,
        ta.valid_from,
        ta.valid_to,
        st.id as staff_id,
        st.employee_no,
        CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
        sub.id as subject_id,
        sub.code as subject_code,
        sub.name as subject_name,
        sec.id as section_id,
        sec.name as section_name,
        sec.stream as section_stream,
        g.grade_level,
        g.display_name as grade_name,
        ay.id as academic_year_id,
        ay.name as academic_year_name
      FROM teaching_assignments ta
      JOIN staff st ON ta.staff_id = st.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN sections sec ON ta.section_id = sec.id
      JOIN grades g ON sec.grade_id = g.id
      JOIN academic_years ay ON ta.academic_year_id = ay.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (academicYearId) {
      sql += ` AND ta.academic_year_id = ?`;
      params.push(academicYearId);
    }
    if (sectionId) {
      sql += ` AND ta.section_id = ?`;
      params.push(sectionId);
    }
    if (subjectId) {
      sql += ` AND ta.subject_id = ?`;
      params.push(subjectId);
    }

    sql += ` ORDER BY g.grade_level ASC, sec.name ASC, sub.name ASC`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async getUnassignedClasses() {
    // Classes/sections missing teacher for subjects in their grade curriculum
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         sec.id as section_id,
         sec.name as section_name,
         sec.stream as section_stream,
         g.grade_level,
         g.display_name as grade_name,
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name
       FROM sections sec
       JOIN grades g ON sec.grade_id = g.id
       JOIN grade_subjects gs ON g.id = gs.grade_id AND (gs.stream = 'all' OR gs.stream = sec.stream)
         AND (gs.academic_year_id IS NULL OR gs.academic_year_id = sec.academic_year_id)
       JOIN subjects sub ON gs.subject_id = sub.id
       WHERE sec.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM teaching_assignments ta 
         WHERE ta.section_id = sec.id AND ta.subject_id = sub.id AND ta.is_active = 1
       )
       ORDER BY g.grade_level ASC, sec.name ASC, sub.name ASC`
    );
    return rows;
  }

  async createTeachingAssignment(payload: {
    staffId: number;
    subjectId: number;
    sectionId: number;
    academicYearId: number;
  }) {
    const [scopeRows] = await pool.query<RowDataPacket[]>(
      `SELECT sec.id, sec.academic_year_id, sec.stream, g.id AS grade_id, g.is_active AS grade_active,
              sub.status AS subject_status, sub.deleted_at AS subject_deleted
       FROM sections sec
       JOIN grades g ON g.id = sec.grade_id
       JOIN subjects sub ON sub.id = ?
       WHERE sec.id = ? AND sec.status = 'active' AND sec.deleted_at IS NULL`,
      [payload.subjectId, payload.sectionId]
    );
    if (!scopeRows.length) throw new AppError('Active section and subject are required.', 404, 'ASSIGNMENT_SCOPE_NOT_FOUND');
    const scope = scopeRows[0];
    if (Number(scope.academic_year_id) !== Number(payload.academicYearId)) throw new AppError('Assignment academic year must match its section.', 400, 'ACADEMIC_YEAR_MISMATCH');
    if (!Number(scope.grade_active)) throw new AppError('The section grade is inactive.', 409, 'GRADE_INACTIVE');
    if (scope.subject_status !== 'active' || scope.subject_deleted) throw new AppError('Subject is inactive.', 409, 'SUBJECT_INACTIVE');
    const [mappingRows] = await pool.query<RowDataPacket[]>(
      `SELECT gs.id FROM grade_subjects gs
       WHERE gs.grade_id = ? AND gs.subject_id = ?
         AND (gs.stream = 'all' OR gs.stream = ?)
         AND (gs.academic_year_id IS NULL OR gs.academic_year_id = ?)
       LIMIT 1`,
      [scope.grade_id, payload.subjectId, scope.stream, payload.academicYearId]
    );
    if (!mappingRows.length) throw new AppError('Subject is not mapped to this grade, stream, and academic year.', 409, 'SUBJECT_NOT_IN_CURRICULUM');
    // Check if duplicate exists
    const [exist] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM teaching_assignments 
       WHERE staff_id = ? AND subject_id = ? AND section_id = ? AND academic_year_id = ? AND is_active = 1`,
      [payload.staffId, payload.subjectId, payload.sectionId, payload.academicYearId]
    );
    if (exist.length > 0) {
      throw new AppError('This teaching assignment already exists.', 409, 'DUPLICATE_ASSIGNMENT');
    }

    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO teaching_assignments (staff_id, subject_id, section_id, academic_year_id, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, NOW())`,
      [payload.staffId, payload.subjectId, payload.sectionId, payload.academicYearId]
    );
    return res.insertId;
  }

  async deleteTeachingAssignment(id: number) {
    await pool.query(`DELETE FROM teaching_assignments WHERE id = ?`, [id]);
    return true;
  }

  async getTimetable(termId?: number, sectionId?: number, staffId?: number, roomId?: number) {
    let sql = `
      SELECT 
        te.id,
        te.term_id,
        te.section_id,
        te.subject_id,
        te.staff_id,
        te.room_id,
        te.time_slot_id,
        sec.name as section_name,
        g.grade_level,
        sub.code as subject_code,
        sub.name as subject_name,
        CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
        cr.name as room_name,
        cr.building,
        ts.day_of_week,
        ts.start_time,
        ts.end_time,
        ts.label as slot_label
      FROM timetable_entries te
      JOIN sections sec ON te.section_id = sec.id
      JOIN grades g ON sec.grade_id = g.id
      JOIN subjects sub ON te.subject_id = sub.id
      JOIN staff st ON te.staff_id = st.id
      JOIN classrooms cr ON te.room_id = cr.id
      JOIN time_slots ts ON te.time_slot_id = ts.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (termId) { sql += ` AND te.term_id = ?`; params.push(termId); }
    if (sectionId) { sql += ` AND te.section_id = ?`; params.push(sectionId); }
    if (staffId) { sql += ` AND te.staff_id = ?`; params.push(staffId); }
    if (roomId) { sql += ` AND te.room_id = ?`; params.push(roomId); }

    sql += ` ORDER BY ts.day_of_week ASC, ts.start_time ASC`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async createTimetableEntry(payload: {
    termId: number;
    sectionId: number;
    subjectId: number;
    staffId: number;
    roomId: number;
    timeSlotId: number;
  }) {
    // 1. Conflict Check: Teacher overlap
    const [staffConflict] = await pool.query<RowDataPacket[]>(
      `SELECT te.id, sec.name as section_name, ts.label as slot_label
       FROM timetable_entries te
       JOIN sections sec ON te.section_id = sec.id
       JOIN time_slots ts ON te.time_slot_id = ts.id
       WHERE te.term_id = ? AND te.staff_id = ? AND te.time_slot_id = ?`,
      [payload.termId, payload.staffId, payload.timeSlotId]
    );
    if (staffConflict.length > 0) {
      throw new AppError(
        `Teacher schedule conflict: This teacher is already scheduled for Section ${staffConflict[0].section_name} during ${staffConflict[0].slot_label}.`,
        409,
        'TEACHER_TIMETABLE_CONFLICT'
      );
    }

    // 2. Conflict Check: Room overlap
    const [roomConflict] = await pool.query<RowDataPacket[]>(
      `SELECT te.id, sec.name as section_name, cr.name as room_name, ts.label as slot_label
       FROM timetable_entries te
       JOIN sections sec ON te.section_id = sec.id
       JOIN classrooms cr ON te.room_id = cr.id
       JOIN time_slots ts ON te.time_slot_id = ts.id
       WHERE te.term_id = ? AND te.room_id = ? AND te.time_slot_id = ?`,
      [payload.termId, payload.roomId, payload.timeSlotId]
    );
    if (roomConflict.length > 0) {
      throw new AppError(
        `Classroom conflict: Room ${roomConflict[0].room_name} is already booked by Section ${roomConflict[0].section_name} during ${roomConflict[0].slot_label}.`,
        409,
        'ROOM_TIMETABLE_CONFLICT'
      );
    }

    // 3. Conflict Check: Section overlap
    const [secConflict] = await pool.query<RowDataPacket[]>(
      `SELECT te.id, sub.name as subject_name, ts.label as slot_label
       FROM timetable_entries te
       JOIN subjects sub ON te.subject_id = sub.id
       JOIN time_slots ts ON te.time_slot_id = ts.id
       WHERE te.term_id = ? AND te.section_id = ? AND te.time_slot_id = ?`,
      [payload.termId, payload.sectionId, payload.timeSlotId]
    );
    if (secConflict.length > 0) {
      throw new AppError(
        `Section schedule conflict: This section is already taking ${secConflict[0].subject_name} during ${secConflict[0].slot_label}.`,
        409,
        'SECTION_TIMETABLE_CONFLICT'
      );
    }

    // Insert entry
    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO timetable_entries (term_id, section_id, subject_id, staff_id, room_id, time_slot_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [payload.termId, payload.sectionId, payload.subjectId, payload.staffId, payload.roomId, payload.timeSlotId]
    );
    return res.insertId;
  }

  async deleteTimetableEntry(id: number) {
    await pool.query(`DELETE FROM timetable_entries WHERE id = ?`, [id]);
    return true;
  }

  async getTimeSlots() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM time_slots ORDER BY day_of_week ASC, start_time ASC`
    );
    return rows;
  }

  async createTimeSlot(payload: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    label: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [overlaps] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM time_slots WHERE day_of_week = ? AND start_time < ? AND end_time > ? LIMIT 1 FOR UPDATE`,
        [payload.dayOfWeek, payload.endTime, payload.startTime]
      );
      if (overlaps.length) throw new AppError('This period overlaps an existing lesson period on that day.', 409, 'TIME_SLOT_OVERLAP');
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO time_slots (day_of_week, start_time, end_time, label) VALUES (?, ?, ?, ?)`,
        [payload.dayOfWeek, payload.startTime, payload.endTime, payload.label.trim()]
      );
      await conn.commit();
      return res.insertId;
    } catch (err: any) {
      await conn.rollback();
      if (err?.code === 'ER_DUP_ENTRY') throw new AppError('A period with this day and start time already exists.', 409, 'DUPLICATE_TIME_SLOT');
      throw err;
    } finally { conn.release(); }
  }

  // =========================================================================
  // PAGE 6: ATTENDANCE AND ACADEMIC RESULTS
  // =========================================================================
  async getAttendanceSummary(date?: string, sectionId?: number, gradeId?: number) {
    const targetDate = date || new Date().toISOString().split('T')[0];

    let sql = `
      SELECT 
        s.id as session_id,
        s.attendance_date,
        s.status as session_status,
        sec.id as section_id,
        sec.name as section_name,
        g.grade_level,
        g.display_name as grade_name,
        sub.name as subject_name,
        CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
        COUNT(r.id) as total_recorded,
        SUM(CASE WHEN r.status_code = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN r.status_code = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN r.status_code = 'late' THEN 1 ELSE 0 END) as late_count,
        SUM(CASE WHEN r.status_code = 'excused' THEN 1 ELSE 0 END) as excused_count
      FROM attendance_sessions s
      JOIN sections sec ON s.section_id = sec.id
      JOIN grades g ON sec.grade_id = g.id
      LEFT JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN staff st ON s.recorded_by_staff_id = st.id
      LEFT JOIN attendance_records r ON s.id = r.session_id
      WHERE s.attendance_date = ?
    `;
    const params: any[] = [targetDate];

    if (sectionId) {
      sql += ` AND sec.id = ?`;
      params.push(sectionId);
    }
    if (gradeId) {
      sql += ` AND g.id = ?`;
      params.push(gradeId);
    }

    sql += ` GROUP BY s.id ORDER BY g.grade_level ASC, sec.name ASC`;
    const [sessions] = await pool.query<RowDataPacket[]>(sql, params);

    // Sections missing attendance for this date
    const [missingSections] = await pool.query<RowDataPacket[]>(
      `SELECT sec.id, sec.name as section_name, g.display_name as grade_name,
              CONCAT_WS(' ', st.first_name, st.father_name) as homeroom_teacher
       FROM sections sec
       JOIN grades g ON sec.grade_id = g.id
       LEFT JOIN staff st ON sec.homeroom_staff_id = st.id
       WHERE sec.status = 'active'
       AND sec.id NOT IN (SELECT section_id FROM attendance_sessions WHERE attendance_date = ?)
       ORDER BY g.grade_level, sec.name`,
      [targetDate]
    );

    // Totals for this date
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLate = 0;
    let totalExcused = 0;

    for (const row of sessions) {
      totalPresent += Number(row.present_count || 0);
      totalAbsent += Number(row.absent_count || 0);
      totalLate += Number(row.late_count || 0);
      totalExcused += Number(row.excused_count || 0);
    }

    const totalStudents = totalPresent + totalAbsent + totalLate + totalExcused;
    const rate = totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : 0;

    return {
      date: targetDate,
      metrics: {
        totalPresent,
        totalAbsent,
        totalLate,
        totalExcused,
        totalStudents,
        attendanceRate: rate
      },
      sessions,
      missingSections
    };
  }

  async getAssessmentsOverview(academicYearId?: number, termId?: number, sectionId?: number, subjectId?: number) {
    let sql = `
      SELECT 
        a.id,
        a.term_id,
        a.title,
        a.max_score,
        a.weight,
        a.assessment_date,
        a.status as assessment_status,
        at.name as assessment_type_name,
        t.name as term_name,
        sub.name as subject_name,
        sub.code as subject_code,
        sec.id as section_id,
        sec.name as section_name,
        g.grade_level,
        g.display_name as grade_name,
        CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
        (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = sec.id AND e.status = 'active') as total_enrolled,
        (SELECT COUNT(*) FROM marks m WHERE m.assessment_id = a.id) as marks_entered_count,
        (SELECT COUNT(*) FROM marks m WHERE m.assessment_id = a.id AND m.status = 'locked') as approved_marks_count,
        (SELECT COUNT(*) FROM marks m WHERE m.assessment_id = a.id AND m.status = 'submitted') as submitted_marks_count,
        (SELECT COUNT(*) FROM marks m WHERE m.assessment_id = a.id AND m.status = 'draft') as draft_marks_count,
        (SELECT ROUND(AVG(m.score), 2) FROM marks m WHERE m.assessment_id = a.id AND m.mark_status = 'scored') as average_score
      FROM assessments a
      JOIN assessment_types at ON a.assessment_type_id = at.id
      JOIN terms t ON a.term_id = t.id
      JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN sections sec ON ta.section_id = sec.id
      JOIN grades g ON sec.grade_id = g.id
      JOIN staff st ON ta.staff_id = st.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (academicYearId) { sql += ` AND ta.academic_year_id = ?`; params.push(academicYearId); }
    if (termId) { sql += ` AND a.term_id = ?`; params.push(termId); }
    if (sectionId) { sql += ` AND sec.id = ?`; params.push(sectionId); }
    if (subjectId) { sql += ` AND sub.id = ?`; params.push(subjectId); }

    sql += ` ORDER BY a.assessment_date DESC, g.grade_level ASC`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async getAssessmentConfigurationOptions() {
    const [assignments] = await pool.query<RowDataPacket[]>(
      `SELECT ta.id AS teaching_assignment_id, ta.academic_year_id, ay.name AS academic_year_name,
              sec.id AS section_id, sec.name AS section_name, sec.stream,
              g.grade_level, g.display_name AS grade_name, sub.id AS subject_id, sub.code AS subject_code,
              sub.name AS subject_name, CONCAT_WS(' ', st.first_name, st.father_name) AS teacher_name
       FROM teaching_assignments ta
       JOIN sections sec ON sec.id = ta.section_id AND sec.status = 'active' AND sec.deleted_at IS NULL
       JOIN grades g ON g.id = sec.grade_id AND g.is_active = 1
       JOIN subjects sub ON sub.id = ta.subject_id AND sub.status = 'active' AND sub.deleted_at IS NULL
       JOIN staff st ON st.id = ta.staff_id AND st.status = 'active'
       JOIN academic_years ay ON ay.id = ta.academic_year_id AND ay.status <> 'closed'
       WHERE ta.is_active = 1
       ORDER BY ay.start_date DESC, g.grade_level, sec.name, sub.name, teacher_name`
    );
    const [terms] = await pool.query<RowDataPacket[]>(
      `SELECT t.id, t.name, t.academic_year_id, t.start_date, t.end_date, t.status,
              ay.name AS academic_year_name
       FROM terms t JOIN academic_years ay ON ay.id = t.academic_year_id
       WHERE t.status <> 'closed' AND ay.status <> 'closed'
       ORDER BY ay.start_date DESC, t.term_no`
    );
    const [types] = await pool.query<RowDataPacket[]>(
      `SELECT id, code, name FROM assessment_types WHERE is_active = 1 ORDER BY id`
    );
    return { assignments, terms, types };
  }

  async createAdminAssessment(payload: {
    teachingAssignmentId: number; termId: number; assessmentTypeId: number; title: string;
    maxScore: number; weight: number; assessmentDate: string; userId: number; username: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [scopeRows] = await conn.query<RowDataPacket[]>(
        `SELECT ta.id, ta.academic_year_id, sec.id AS section_id, sec.name AS section_name,
                sec.status AS section_status, sec.deleted_at AS section_deleted, g.is_active AS grade_active,
                sub.status AS subject_status, sub.deleted_at AS subject_deleted,
                t.id AS term_id, t.academic_year_id AS term_year_id, t.start_date, t.end_date, t.status AS term_status,
                ay.status AS year_status, at.name AS assessment_type_name
         FROM teaching_assignments ta
         JOIN sections sec ON sec.id = ta.section_id
         JOIN grades g ON g.id = sec.grade_id
         JOIN subjects sub ON sub.id = ta.subject_id
         JOIN terms t ON t.id = ?
         JOIN academic_years ay ON ay.id = t.academic_year_id
         JOIN assessment_types at ON at.id = ? AND at.is_active = 1
         WHERE ta.id = ? AND ta.is_active = 1 FOR UPDATE`,
        [payload.termId, payload.assessmentTypeId, payload.teachingAssignmentId]
      );
      const scope = scopeRows[0];
      if (!scope) throw new AppError('Choose an active teaching assignment, term, and assessment type.', 404, 'ASSESSMENT_SCOPE_NOT_FOUND');
      if (Number(scope.academic_year_id) !== Number(scope.term_year_id)) throw new AppError('Assessment term must belong to the teaching assignment academic year.', 400, 'ACADEMIC_YEAR_MISMATCH');
      if (scope.section_status !== 'active' || scope.section_deleted || !Number(scope.grade_active) || scope.subject_status !== 'active' || scope.subject_deleted || scope.term_status === 'closed' || scope.year_status === 'closed') {
        throw new AppError('Assessment scope includes an inactive academic record.', 409, 'ASSESSMENT_SCOPE_INACTIVE');
      }
      if (payload.assessmentDate < String(scope.start_date).slice(0, 10) || payload.assessmentDate > String(scope.end_date).slice(0, 10)) {
        throw new AppError('Assessment date must fall within the selected term.', 400, 'ASSESSMENT_DATE_OUTSIDE_TERM');
      }
      const [settingRows] = await conn.query<RowDataPacket[]>(`SELECT value_json FROM system_settings WHERE setting_key = 'grading.weights_must_total_100' LIMIT 1`);
      let mustTotal = settingRows[0]?.value_json;
      if (typeof mustTotal === 'string') { try { mustTotal = JSON.parse(mustTotal); } catch { mustTotal = mustTotal === 'true'; } }
      if (mustTotal) {
        const [weightRows] = await conn.query<RowDataPacket[]>(
          `SELECT COALESCE(SUM(weight), 0) AS assigned_weight FROM assessments WHERE teaching_assignment_id = ? AND term_id = ?`,
          [payload.teachingAssignmentId, payload.termId]
        );
        if (Number(weightRows[0]?.assigned_weight || 0) + payload.weight > 100.0001) {
          throw new AppError('Assessment weights for this class and term cannot exceed 100%.', 409, 'ASSESSMENT_WEIGHT_LIMIT');
        }
      }
      const [inserted] = await conn.query<ResultSetHeader>(
        `INSERT INTO assessments (teaching_assignment_id, term_id, assessment_type_id, title, max_score, weight, assessment_date, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [payload.teachingAssignmentId, payload.termId, payload.assessmentTypeId, payload.title, payload.maxScore, payload.weight, payload.assessmentDate, payload.userId]
      );
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (?, ?, 'assessment.configure', 'assessments', ?, 'success', ?, 'Assessment configured by administrator')`,
        [payload.userId, payload.username, String(inserted.insertId), JSON.stringify({ ...payload, userId: undefined, username: undefined, status: 'draft' })]
      );
      await conn.commit();
      return inserted.insertId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateAdminAssessment(id: number, payload: { title?: string; maxScore?: number; weight?: number; assessmentDate?: string; status?: 'draft' | 'open' | 'closed'; userId: number; username: string }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(`SELECT * FROM assessments WHERE id = ? FOR UPDATE`, [id]);
      const current = rows[0];
      if (!current) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');
      const [markRows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS mark_count FROM marks WHERE assessment_id = ?`, [id]);
      const hasMarks = Number(markRows[0]?.mark_count || 0) > 0;
      if (hasMarks && ['title', 'maxScore', 'weight', 'assessmentDate'].some((key) => (payload as any)[key] !== undefined)) {
        throw new AppError('Assessment details cannot be edited after marks have been entered.', 409, 'ASSESSMENT_HAS_MARKS');
      }
      if (payload.assessmentDate !== undefined || payload.weight !== undefined) {
        const [scopeRows] = await conn.query<RowDataPacket[]>(
          `SELECT a.teaching_assignment_id, a.term_id, t.start_date, t.end_date
           FROM assessments a JOIN terms t ON t.id = a.term_id WHERE a.id = ?`, [id]
        );
        const scope = scopeRows[0];
        if (payload.assessmentDate !== undefined && (payload.assessmentDate < String(scope.start_date).slice(0, 10) || payload.assessmentDate > String(scope.end_date).slice(0, 10))) {
          throw new AppError('Assessment date must fall within the selected term.', 400, 'ASSESSMENT_DATE_OUTSIDE_TERM');
        }
        if (payload.weight !== undefined) {
          const [settingRows] = await conn.query<RowDataPacket[]>(`SELECT value_json FROM system_settings WHERE setting_key = 'grading.weights_must_total_100' LIMIT 1`);
          let mustTotal = settingRows[0]?.value_json;
          if (typeof mustTotal === 'string') { try { mustTotal = JSON.parse(mustTotal); } catch { mustTotal = mustTotal === 'true'; } }
          if (mustTotal) {
            const [weightRows] = await conn.query<RowDataPacket[]>(
              `SELECT COALESCE(SUM(weight), 0) AS assigned_weight FROM assessments WHERE teaching_assignment_id = ? AND term_id = ? AND id <> ?`,
              [scope.teaching_assignment_id, scope.term_id, id]
            );
            if (Number(weightRows[0]?.assigned_weight || 0) + payload.weight > 100.0001) throw new AppError('Assessment weights for this class and term cannot exceed 100%.', 409, 'ASSESSMENT_WEIGHT_LIMIT');
          }
        }
      }
      const changes: string[] = [];
      const values: any[] = [];
      if (payload.title !== undefined) { changes.push('title = ?'); values.push(payload.title); }
      if (payload.maxScore !== undefined) { changes.push('max_score = ?'); values.push(payload.maxScore); }
      if (payload.weight !== undefined) { changes.push('weight = ?'); values.push(payload.weight); }
      if (payload.assessmentDate !== undefined) { changes.push('assessment_date = ?'); values.push(payload.assessmentDate); }
      if (payload.status !== undefined) { changes.push('status = ?'); values.push(payload.status); }
      if (!changes.length) throw new AppError('No assessment changes were provided.', 400, 'EMPTY_ASSESSMENT_UPDATE');
      values.push(id);
      await conn.query(`UPDATE assessments SET ${changes.join(', ')} WHERE id = ?`, values);
      await conn.query(
        `INSERT INTO audit_logs (actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (?, ?, 'assessment.update', 'assessments', ?, 'success', ?, 'Assessment configuration updated by administrator')`,
        [payload.userId, payload.username, String(id), JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([key]) => !['userId', 'username'].includes(key))))]
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

  async approveAssessmentMarks(assessmentId: number, adminUserId: number, adminUsername: string) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE marks SET status = 'locked' WHERE assessment_id = ? AND status = 'submitted'`,
        [assessmentId]
      );

      await conn.query(
        `UPDATE assessments SET status = 'closed' WHERE id = ?`,
        [assessmentId]
      );

      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
         VALUES (NOW(), ?, ?, 'ASSESSMENT_MARKS_APPROVE', 'assessments', ?, 'success', 'Assessment marks approved by administrator')`,
        [adminUserId, adminUsername, String(assessmentId)]
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

  async getGradingScales() {
    const [scales] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM grading_scales WHERE status = 'active'`
    );

    const result = [];
    for (const scale of scales) {
      const [bands] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM grading_scale_bands WHERE scale_id = ? ORDER BY min_score DESC`,
        [scale.id]
      );
      result.push({ ...scale, bands });
    }
    return result;
  }

  // =========================================================================
  // PAGE 7: REPORTS, ANALYTICS, AND LIBRARY OVERVIEW
  // =========================================================================
  async getEnrollmentReport(academicYearId?: number) {
    const [byGrade] = await pool.query<RowDataPacket[]>(
      `SELECT 
         g.grade_level,
         g.display_name as grade_name,
         COUNT(e.id) as total_students,
         SUM(CASE WHEN s.gender = 'female' THEN 1 ELSE 0 END) as female_count,
         SUM(CASE WHEN s.gender = 'male' THEN 1 ELSE 0 END) as male_count,
         SUM(CASE WHEN sec.stream = 'natural_science' THEN 1 ELSE 0 END) as natural_science_count,
         SUM(CASE WHEN sec.stream = 'social_science' THEN 1 ELSE 0 END) as social_science_count,
         SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) as active_count
       FROM grades g
       JOIN sections sec ON g.id = sec.grade_id AND sec.status = 'active'
       JOIN enrollments e ON sec.id = e.section_id AND e.status = 'active'
       JOIN students s ON e.student_id = s.id
       GROUP BY g.id, g.grade_level, g.display_name
       ORDER BY g.grade_level ASC`
    );

    const [bySection] = await pool.query<RowDataPacket[]>(
      `SELECT 
         sec.id,
         sec.name as section_name,
         g.display_name as grade_name,
         sec.stream,
         sec.capacity,
         COUNT(e.id) as enrolled_count,
         (sec.capacity - COUNT(e.id)) as available_seats,
         CONCAT_WS(' ', st.first_name, st.father_name) as homeroom_teacher
       FROM sections sec
       JOIN grades g ON sec.grade_id = g.id
       LEFT JOIN staff st ON sec.homeroom_staff_id = st.id
       LEFT JOIN enrollments e ON sec.id = e.section_id AND e.status = 'active'
       WHERE sec.status = 'active'
       GROUP BY sec.id
       ORDER BY g.grade_level ASC, sec.name ASC`
    );

    return { byGrade, bySection };
  }

  async getAttendanceReport(startDate?: string, endDate?: string, sectionId?: number) {
    let sql = `
      SELECT 
        sec.id as section_id,
        sec.name as section_name,
        g.display_name as grade_name,
        COUNT(r.id) as total_records,
        SUM(CASE WHEN r.status_code = 'present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN r.status_code = 'absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN r.status_code = 'late' THEN 1 ELSE 0 END) as late_count,
        ROUND(SUM(CASE WHEN r.status_code = 'present' THEN 1 ELSE 0 END) / COUNT(r.id) * 100, 1) as attendance_rate
      FROM sections sec
      JOIN grades g ON sec.grade_id = g.id
      JOIN attendance_sessions s ON sec.id = s.section_id
      JOIN attendance_records r ON s.id = r.session_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (startDate) { sql += ` AND s.attendance_date >= ?`; params.push(startDate); }
    if (endDate) { sql += ` AND s.attendance_date <= ?`; params.push(endDate); }
    if (sectionId) { sql += ` AND sec.id = ?`; params.push(sectionId); }

    sql += ` GROUP BY sec.id ORDER BY g.grade_level ASC, sec.name ASC`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async getAcademicPerformanceReport(termId?: number, sectionId?: number) {
    let sql = `
      SELECT 
        sub.id as subject_id,
        sub.name as subject_name,
        sub.code as subject_code,
        sec.name as section_name,
        g.display_name as grade_name,
        COUNT(m.id) as scored_students,
        ROUND(AVG(m.score), 2) as average_score,
        MAX(m.score) as highest_score,
        MIN(m.score) as lowest_score,
        SUM(CASE WHEN m.score >= 50 THEN 1 ELSE 0 END) as passing_count,
        ROUND(SUM(CASE WHEN m.score >= 50 THEN 1 ELSE 0 END) / COUNT(m.id) * 100, 1) as pass_rate
      FROM marks m
      JOIN assessments a ON m.assessment_id = a.id
      JOIN teaching_assignments ta ON a.teaching_assignment_id = ta.id
      JOIN subjects sub ON ta.subject_id = sub.id
      JOIN sections sec ON ta.section_id = sec.id
      JOIN grades g ON sec.grade_id = g.id
      WHERE m.mark_status = 'scored'
    `;
    const params: any[] = [];

    if (termId) { sql += ` AND a.term_id = ?`; params.push(termId); }
    if (sectionId) { sql += ` AND sec.id = ?`; params.push(sectionId); }

    sql += ` GROUP BY sub.id, sec.id ORDER BY g.grade_level ASC, sub.name ASC`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async getStaffWorkloadReport() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         st.id,
         st.employee_no,
         CONCAT_WS(' ', st.first_name, st.father_name) as teacher_name,
         st.job_title,
         st.department,
         COUNT(DISTINCT ta.section_id) as total_sections,
         COUNT(DISTINCT ta.subject_id) as total_subjects,
         GROUP_CONCAT(DISTINCT sub.code SEPARATOR ', ') as subjects_list,
         (SELECT COUNT(*) FROM timetable_entries te WHERE te.staff_id = st.id) as weekly_periods
       FROM staff st
       LEFT JOIN teaching_assignments ta ON st.id = ta.staff_id AND ta.is_active = 1
       LEFT JOIN subjects sub ON ta.subject_id = sub.id
       WHERE st.status = 'active' AND st.staff_type = 'teacher'
       GROUP BY st.id
       ORDER BY weekly_periods DESC, st.first_name ASC`
    );
    return rows;
  }

  async getLibraryOverview() {
    const [counts] = await pool.query<RowDataPacket[]>(
      `SELECT 
         (SELECT COUNT(*) FROM books) as totalBooks,
         (SELECT COUNT(*) FROM book_copies) as totalCopies,
         (SELECT COUNT(*) FROM book_copies WHERE status = 'available') as availableCopies,
         (SELECT COUNT(*) FROM library_loans WHERE returned_at IS NULL) as activeLoans,
         (SELECT COUNT(*) FROM library_loans WHERE returned_at IS NULL AND due_at < NOW()) as overdueLoans,
         (SELECT COUNT(*) FROM library_reservations WHERE status = 'active') as activeReservations`
    );

    const [books] = await pool.query<RowDataPacket[]>(
      `SELECT 
         b.id, b.isbn, b.title, b.author, b.publisher, b.publication_year,
         c.name as category_name,
         COUNT(cp.id) as total_copies,
         SUM(CASE WHEN cp.status = 'available' THEN 1 ELSE 0 END) as available_copies
       FROM books b
       JOIN book_categories c ON b.category_id = c.id
       LEFT JOIN book_copies cp ON b.id = cp.book_id
       GROUP BY b.id
       ORDER BY b.title ASC LIMIT 50`
    );

    const [loans] = await pool.query<RowDataPacket[]>(
      `SELECT 
         l.id, l.checkout_at as issued_at, l.due_at, l.returned_at,
         b.title as book_title,
         b.author as book_author,
         cp.barcode,
         s.admission_no,
         CONCAT_WS(' ', s.first_name, s.father_name) as student_name,
         CASE WHEN l.returned_at IS NULL AND l.due_at < NOW() THEN 1 ELSE 0 END as is_overdue
       FROM library_loans l
       JOIN book_copies cp ON l.copy_id = cp.id
       JOIN books b ON cp.book_id = b.id
       JOIN students s ON l.student_id = s.id
       WHERE l.returned_at IS NULL
       ORDER BY l.due_at ASC LIMIT 50`
    );

    return {
      metrics: {
        totalBooks: Number(counts[0]?.totalBooks || 0),
        totalCopies: Number(counts[0]?.totalCopies || 0),
        availableCopies: Number(counts[0]?.availableCopies || 0),
        activeLoans: Number(counts[0]?.activeLoans || 0),
        overdueLoans: Number(counts[0]?.overdueLoans || 0),
        activeReservations: Number(counts[0]?.activeReservations || 0)
      },
      books,
      activeLoans: loans
    };
  }

  // =========================================================================
  // PAGE 8: COMMUNICATIONS, AUDIT LOGS, AND PROFILE
  // =========================================================================
  async getAnnouncements(limit = 20) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         a.id,
         a.title,
         a.body,
         a.body as content,
         a.status,
         a.created_at,
         a.published_at,
         a.expires_at,
         COALESCE(u.username, 'Administrator') as author_name,
         COALESCE(t.target_type, 'all') as target_role
       FROM announcements a
       LEFT JOIN users u ON a.created_by = u.id
       LEFT JOIN announcement_targets t ON a.id = t.announcement_id
       WHERE a.deleted_at IS NULL
       ORDER BY a.created_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  }

  async createAnnouncement(payload: {
    title: string;
    body: string;
    userId: number;
    username: string;
    status?: 'draft' | 'published';
    targetRole?: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const status = payload.status || 'published';

      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO announcements (title, body, status, created_by, published_by, published_at)
         VALUES (?, ?, ?, ?, IF(? = 'published', ?, NULL), IF(? = 'published', NOW(3), NULL))`,
        [payload.title, payload.body, status, payload.userId, status, payload.userId, status]
      );
      const annId = res.insertId;

      if (payload.targetRole) {
        if (payload.targetRole === 'all') {
          await conn.query(
            `INSERT INTO announcement_targets (announcement_id, target_type, target_id) VALUES (?, 'all', NULL)`,
            [annId]
          );
        } else {
          const [roleRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM roles WHERE code = ? LIMIT 1`, [payload.targetRole]);
          if (!roleRows.length) throw new AppError('The selected announcement audience role does not exist.', 400, 'INVALID_ANNOUNCEMENT_AUDIENCE');
          await conn.query(
            `INSERT INTO announcement_targets (announcement_id, target_type, target_id) VALUES (?, 'role', ?)`,
            [annId, roleRows[0].id]
          );
        }
      }

      let delivery = { recipients: 0, emailsQueued: 0 };
      if (status === 'published') {
        delivery = await this.enqueueAnnouncementNotifications(conn, annId, payload.userId);
      }
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, ?, 'ANNOUNCEMENT_CREATE', 'announcements', ?, 'success', ?, 'Administrator created an announcement')`,
        [payload.userId, payload.username, String(annId), JSON.stringify({ status, targetRole: payload.targetRole || 'all', ...delivery })]
      );

      await conn.commit();
      return { id: annId, ...delivery };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateAnnouncementStatus(id: number, status: 'draft' | 'published' | 'archived', publisherId: number, publisherUsername: string) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(`SELECT id, status, published_by FROM announcements WHERE id = ? AND deleted_at IS NULL FOR UPDATE`, [id]);
      if (!rows.length) throw new AppError('Announcement was not found.', 404, 'ANNOUNCEMENT_NOT_FOUND');
      const wasPublished = rows[0].status === 'published';
      await conn.query(
        `UPDATE announcements SET status = ?, published_by = IF(? = 'published', COALESCE(published_by, ?), published_by),
         published_at = IF(? = 'published' AND published_at IS NULL, NOW(3), published_at) WHERE id = ?`,
        [status, status, publisherId, status, id]
      );
      const delivery = status === 'published' && !wasPublished
        ? await this.enqueueAnnouncementNotifications(conn, id, publisherId)
        : { recipients: 0, emailsQueued: 0 };
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(3), ?, ?, 'ANNOUNCEMENT_STATUS_UPDATE', 'announcements', ?, 'success', ?, 'Administrator changed announcement status')`,
        [publisherId, publisherUsername, String(id), JSON.stringify({ from: rows[0].status, to: status, ...delivery })]
      );
      await conn.commit();
      return { success: true, ...delivery };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  private async enqueueAnnouncementNotifications(conn: PoolConnection, announcementId: number, publisherId: number) {
    const [announcementRows] = await conn.query<RowDataPacket[]>(`SELECT title, body FROM announcements WHERE id = ?`, [announcementId]);
    const [targetRows] = await conn.query<RowDataPacket[]>(
      `SELECT target.target_type, r.code AS role_code
       FROM announcement_targets target LEFT JOIN roles r ON r.id = target.target_id
       WHERE target.announcement_id = ?`, [announcementId]
    );
    if (!targetRows.length) {
      await conn.query(`INSERT INTO announcement_targets (announcement_id, target_type, target_id) VALUES (?, 'all', NULL)`, [announcementId]);
      targetRows.push({ target_type: 'all', role_code: null } as RowDataPacket);
    }
    const [recipients] = await conn.query<RowDataPacket[]>(
      `SELECT DISTINCT u.id, u.email
       FROM announcement_targets target
       JOIN users u ON u.status = 'active'
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE target.announcement_id = ? AND (
         target.target_type = 'all' OR (target.target_type = 'role' AND target.target_id = r.id)
       )`, [announcementId]
    );
    const title = String(announcementRows[0]?.title || 'School announcement');
    const body = String(announcementRows[0]?.body || '');
    let emailsQueued = 0;
    const noticePayload = JSON.stringify({ entity: 'announcements', announcementId });
    const emailPayload = JSON.stringify({ text: `${body}\n\nSign in to your school account to view this announcement.` });
    for (let offset = 0; offset < recipients.length; offset += 200) {
      const batch = recipients.slice(offset, offset + 200);
      const noticeValues = batch.flatMap((recipient) => [recipient.id, title, body.slice(0, 1000), noticePayload]);
      const noticePlaceholders = batch.map(() => `(?,'announcement',?,?,?)`).join(',');
      await conn.query(
        `INSERT INTO notifications (user_id, type, title, body, payload_json) VALUES ${noticePlaceholders}`,
        noticeValues
      );
      const emailBatch = batch.filter((recipient) => Boolean(recipient.email));
      if (emailBatch.length) {
        const emailValues = emailBatch.flatMap((recipient) => [recipient.id, recipient.email, title.slice(0, 190), emailPayload]);
        const emailPlaceholders = emailBatch.map(() => `(?,'email',?,?,?,'pending',NOW(3))`).join(',');
        await conn.query(
          `INSERT INTO notification_outbox (user_id, channel, recipient, subject, payload_json, status, next_attempt_at)
           VALUES ${emailPlaceholders}`,
          emailValues
        );
        emailsQueued += emailBatch.length;
      }
    }
    const includesGuardians = targetRows.some((target) => target.target_type === 'all' || (target.target_type === 'role' && target.role_code === 'guardian'));
    if (recipients.length && includesGuardians) {
      const [prefRows] = await conn.query<RowDataPacket[]>(`SELECT value_json FROM system_settings WHERE setting_key = ? LIMIT 1`, [`user.notifications.${publisherId}`]);
      let preferences: any = prefRows[0]?.value_json;
      if (typeof preferences === 'string') { try { preferences = JSON.parse(preferences); } catch { preferences = null; } }
      if (preferences?.guardianBroadcasts === true) {
        await conn.query(
          `INSERT INTO notifications (user_id, type, title, body, payload_json)
           VALUES (?, 'announcement_dispatch', 'Announcement dispatch queued', ?, ?)`,
          [publisherId, `${recipients.length} recipient inbox notices and ${emailsQueued} email messages were queued.`, JSON.stringify({ entity: 'announcements', announcementId, recipients: recipients.length, emailsQueued })]
        );
      }
    }
    return { recipients: recipients.length, emailsQueued };
  }

  async deleteAnnouncement(id: number, userId: number, username: string) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query<ResultSetHeader>(`UPDATE announcements SET deleted_at = NOW(3) WHERE id = ? AND deleted_at IS NULL`, [id]);
      if (!result.affectedRows) throw new AppError('Announcement was not found.', 404, 'ANNOUNCEMENT_NOT_FOUND');
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
         VALUES (NOW(3), ?, ?, 'ANNOUNCEMENT_DELETE', 'announcements', ?, 'success', 'Administrator deleted an announcement')`,
        [userId, username, String(id)]
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

  async getRecentAuditLogs(limit = 50, filters?: { actor?: string; action?: string; outcome?: string }) {
    let sql = `
      SELECT 
        id,
        occurred_at,
        actor_user_id,
        actor_username,
        action,
        entity_type,
        entity_id,
        outcome,
        changes,
        reason,
        ip_address
      FROM audit_logs
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.actor) {
      sql += ` AND actor_username LIKE ?`;
      params.push(`%${filters.actor}%`);
    }
    if (filters?.action) {
      sql += ` AND action = ?`;
      params.push(filters.action);
    }
    if (filters?.outcome) {
      sql += ` AND outcome = ?`;
      params.push(filters.outcome);
    }

    sql += ` ORDER BY occurred_at DESC LIMIT ?`;
    params.push(limit);

    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async getAdminProfile(userId: number) {
    const [uRows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.username, u.email, u.phone, u.status, u.created_at, u.last_login_at,
              st.employee_no, st.first_name, st.father_name, st.job_title, st.department,
              (SELECT d.id FROM documents d WHERE d.owner_type = 'user' AND d.owner_id = u.id
               AND d.doc_type = 'admin_profile_photo' AND d.deleted_at IS NULL ORDER BY d.id DESC LIMIT 1) AS photo_document_id
       FROM users u
       LEFT JOIN staff st ON u.id = st.user_id
       WHERE u.id = ?`,
      [userId]
    );
    return uRows[0] || null;
  }

  async updateAdminProfile(userId: number, payload: { phone?: string; email?: string; photo?: { originalName?: string; mimeType?: string; dataBase64?: string } }, adminUserId = userId) {
    const fields: string[] = [];
    const params: any[] = [];
    if (payload.phone !== undefined) { fields.push('phone = ?'); params.push(payload.phone || null); }
    if (payload.email) { fields.push('email = ?'); params.push(payload.email); }
    if (fields.length > 0) {
      params.push(userId);
      await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    }

    // Also update staff record if linked
    const [staffCheck] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM staff WHERE user_id = ?`,
      [userId]
    );
    if (staffCheck.length > 0 && (payload.phone !== undefined || payload.email)) {
      const sFields: string[] = [];
      const sParams: any[] = [];
      if (payload.phone !== undefined) { sFields.push('phone = ?'); sParams.push(payload.phone || null); }
      if (payload.email) { sFields.push('email = ?'); sParams.push(payload.email); }
      if (sFields.length > 0) {
        sParams.push(staffCheck[0].id);
        await pool.query(`UPDATE staff SET ${sFields.join(', ')} WHERE id = ?`, sParams);
      }
    }

    if (payload.photo) await this.saveAdminProfilePhoto(userId, adminUserId, payload.photo);

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
       VALUES (NOW(), ?, 'admin', 'PROFILE_UPDATE', 'users', ?, 'success', ?, 'Administrator profile details updated')`,
      [userId, String(userId), JSON.stringify({ ...payload, photo: payload.photo ? 'uploaded' : undefined })]
    );

    return true;
  }

  async changeAdminPassword(userId: number, currentPass: string, newPass: string) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT password_hash FROM users WHERE id = ?`,
      [userId]
    );
    if (rows.length === 0) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const matches = await bcrypt.compare(currentPass, rows[0].password_hash);
    if (!matches) {
      throw new AppError('Current password is incorrect.', 400, 'INVALID_PASSWORD');
    }

    const newHash = await bcrypt.hash(newPass, 10);
    await pool.query(
      `UPDATE users SET password_hash = ?, password_changed_at = NOW(), must_change_password = 0 WHERE id = ?`,
      [newHash, userId]
    );

    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
       VALUES (NOW(), ?, 'admin', 'PASSWORD_CHANGE', 'users', ?, 'success', 'Administrator self password change')`,
      [userId, String(userId)]
    );

    return true;
  }

  async getClassesSummary() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id,
         s.name as section_name,
         s.stream,
         s.capacity,
         g.grade_level,
         g.display_name as grade_name,
         ay.name as academic_year_name,
         cr.name as classroom_name,
         cr.building,
         CONCAT_WS(' ', st.first_name, st.father_name) as homeroom_teacher,
         (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = s.id AND e.status = 'active') as enrolled_count
       FROM sections s
       JOIN grades g ON s.grade_id = g.id
       JOIN academic_years ay ON s.academic_year_id = ay.id
       LEFT JOIN classrooms cr ON s.classroom_id = cr.id
       LEFT JOIN staff st ON s.homeroom_staff_id = st.id
       ORDER BY g.grade_level, s.name`
    );
    return rows;
  }
}
