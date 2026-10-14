import { pool } from '../../config/database';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { AppError } from '../../middleware/errorHandler';
import { createHash, randomUUID } from 'crypto';
import { mkdir, writeFile, unlink, readFile } from 'fs/promises';
import path from 'path';

export class AdminRepository {
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
      WHERE 1=1
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
  async getStaff(search?: string, staffType?: string, status?: string) {
    let sql = `
      SELECT 
        st.id,
        st.employee_no,
        st.first_name,
        st.father_name,
        st.grandfather_name,
        st.gender,
        st.phone,
        st.email,
        st.job_title,
        st.department,
        st.staff_type,
        st.hire_date,
        st.status,
        st.user_id,
        u.username as linked_username,
        u.status as user_account_status,
        (SELECT COUNT(*) FROM teaching_assignments ta WHERE ta.staff_id = st.id AND ta.is_active = 1) as active_assignments_count
      FROM staff st
      LEFT JOIN users u ON st.user_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search) {
      sql += ` AND (st.employee_no LIKE ? OR st.first_name LIKE ? OR st.father_name LIKE ? OR st.department LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (staffType) {
      sql += ` AND st.staff_type = ?`;
      params.push(staffType);
    }

    if (status) {
      sql += ` AND st.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY st.staff_type ASC, st.first_name ASC`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    return rows;
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
  }) {
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
          `SELECT id FROM users WHERE username = ?`,
          [payload.username]
        );
        if (userCheck.length > 0) {
          throw new AppError(`Username '${payload.username}' is already in use.`, 409, 'DUPLICATE_USERNAME');
        }

        const passwordHash = await bcrypt.hash(payload.password, 10);
        const [uRes] = await conn.query<ResultSetHeader>(
          `INSERT INTO users (username, email, phone, password_hash, status, must_change_password)
           VALUES (?, ?, ?, ?, 'active', 0)`,
          [payload.username, payload.email || `${payload.username}@school.et`, payload.phone || null, passwordHash]
        );
        userId = uRes.insertId;

        // Assign role
        let targetRole = payload.roleCode || (payload.staffType === 'teacher' ? 'teacher' : payload.staffType === 'librarian' ? 'librarian' : payload.staffType === 'accountant' ? 'accountant' : 'system_admin');
        if (targetRole === 'administrator' || targetRole === 'admin') {
          targetRole = 'system_admin';
        }
        const [roleRows] = await conn.query<RowDataPacket[]>(
          `SELECT id FROM roles WHERE code = ? LIMIT 1`,
          [targetRole]
        );
        if (roleRows.length > 0) {
          await conn.query(
            `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
            [userId, roleRows[0].id]
          );
        }
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

      // Audit log
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
         VALUES (NOW(), ?, ?, 'STAFF_CREATE', 'staff', ?, 'success', ?, 'New staff member registered by admin')`,
        [
          payload.adminUserId,
          payload.adminUsername,
          String(staffId),
          JSON.stringify({ employeeNo: payload.employeeNo, staffType: payload.staffType, userId })
        ]
      );

      await conn.commit();
      return { id: staffId, employeeNo: payload.employeeNo, userId };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateStaff(id: number, payload: {
    phone?: string;
    email?: string;
    jobTitle?: string;
    department?: string;
    status?: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    const fields: string[] = [];
    const params: any[] = [];

    if (payload.phone !== undefined) { fields.push('phone = ?'); params.push(payload.phone || null); }
    if (payload.email !== undefined) { fields.push('email = ?'); params.push(payload.email || null); }
    if (payload.jobTitle) { fields.push('job_title = ?'); params.push(payload.jobTitle); }
    if (payload.department) { fields.push('department = ?'); params.push(payload.department); }
    if (payload.status) { fields.push('status = ?'); params.push(payload.status); }

    if (fields.length === 0) return true;

    params.push(id);
    await pool.query(`UPDATE staff SET ${fields.join(', ')} WHERE id = ?`, params);

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
       VALUES (NOW(), ?, ?, 'STAFF_UPDATE', 'staff', ?, 'success', ?, 'Staff profile updated')`,
      [payload.adminUserId, payload.adminUsername, String(id), JSON.stringify(payload)]
    );

    return true;
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
        `INSERT INTO users (username, email, phone, password_hash, status)
         VALUES (?, ?, ?, ?, 'active')`,
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
      if (roleRows.length > 0) {
        await conn.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
          [userId, roleRows[0].id]
        );
      }

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
    await pool.query(
      `UPDATE users SET password_hash = ?, password_changed_at = NOW(), failed_login_count = 0 WHERE id = ?`,
      [passwordHash, payload.userId]
    );

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, reason)
       VALUES (NOW(), ?, ?, 'USER_PASSWORD_RESET', 'users', ?, 'success', 'Password reset initiated by administrator')`,
      [payload.adminUserId, payload.adminUsername, String(payload.userId)]
    );

    return true;
  }

  async updateUserRoles(payload: {
    userId: number;
    roleCodes: string[];
    adminUserId: number;
    adminUsername: string;
  }) {
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
       ORDER BY g.grade_level ASC, s.name ASC`
    );

    const [classrooms] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM classrooms ORDER BY building, name`
    );

    const [subjects] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM subjects ORDER BY code ASC`
    );

    const [gradeSubjects] = await pool.query<RowDataPacket[]>(
      `SELECT gs.*, g.display_name as grade_name, s.code as subject_code, s.name as subject_name
       FROM grade_subjects gs
       JOIN grades g ON gs.grade_id = g.id
       JOIN subjects s ON gs.subject_id = s.id
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
    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO sections (grade_id, academic_year_id, name, stream, capacity, homeroom_staff_id, classroom_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        payload.gradeId,
        payload.academicYearId,
        payload.name,
        payload.stream || 'none',
        payload.capacity || 40,
        payload.homeroomStaffId || null,
        payload.classroomId || null
      ]
    );
    return res.insertId;
  }

  async updateSection(id: number, payload: {
    name?: string;
    capacity?: number;
    homeroomStaffId?: number;
    classroomId?: number;
    status?: string;
  }) {
    const fields: string[] = [];
    const params: any[] = [];

    if (payload.name) { fields.push('name = ?'); params.push(payload.name); }
    if (payload.capacity) { fields.push('capacity = ?'); params.push(payload.capacity); }
    if (payload.homeroomStaffId !== undefined) { fields.push('homeroom_staff_id = ?'); params.push(payload.homeroomStaffId || null); }
    if (payload.classroomId !== undefined) { fields.push('classroom_id = ?'); params.push(payload.classroomId || null); }
    if (payload.status) { fields.push('status = ?'); params.push(payload.status); }

    if (fields.length === 0) return true;
    params.push(id);

    await pool.query(`UPDATE sections SET ${fields.join(', ')} WHERE id = ?`, params);
    return true;
  }

  async createSubject(payload: {
    code: string;
    name: string;
    nameAm?: string;
  }) {
    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO subjects (code, name, name_am, status) VALUES (?, ?, ?, 'active')`,
      [payload.code, payload.name, payload.nameAm || null]
    );
    return res.insertId;
  }

  async updateSubject(id: number, payload: {
    name?: string;
    nameAm?: string;
    status?: string;
  }) {
    const fields: string[] = [];
    const params: any[] = [];
    if (payload.name) { fields.push('name = ?'); params.push(payload.name); }
    if (payload.nameAm !== undefined) { fields.push('name_am = ?'); params.push(payload.nameAm || null); }
    if (payload.status) { fields.push('status = ?'); params.push(payload.status); }
    if (fields.length === 0) return true;
    params.push(id);
    await pool.query(`UPDATE subjects SET ${fields.join(', ')} WHERE id = ?`, params);
    return true;
  }

  async addGradeSubject(payload: {
    gradeId: number;
    subjectId: number;
    stream: 'all' | 'natural_science' | 'social_science';
    isCompulsory?: boolean;
    periodsPerWeek?: number;
  }) {
    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO grade_subjects (grade_id, subject_id, stream, is_compulsory, periods_per_week)
       VALUES (?, ?, ?, ?, ?)`,
      [payload.gradeId, payload.subjectId, payload.stream || 'all', payload.isCompulsory ? 1 : 0, payload.periodsPerWeek || 4]
    );
    return res.insertId;
  }

  async removeGradeSubject(id: number) {
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
    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO time_slots (day_of_week, start_time, end_time, label)
       VALUES (?, ?, ?, ?)`,
      [payload.dayOfWeek, payload.startTime, payload.endTime, payload.label]
    );
    return res.insertId;
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
         l.id, l.issued_at, l.due_at, l.returned_at,
         b.title as book_title,
         b.author as book_author,
         cp.barcode,
         s.admission_no,
         CONCAT_WS(' ', s.first_name, s.father_name) as student_name,
         CASE WHEN l.returned_at IS NULL AND l.due_at < NOW() THEN 1 ELSE 0 END as is_overdue
       FROM library_loans l
       JOIN book_copies cp ON l.book_copy_id = cp.id
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
    status?: 'draft' | 'published';
    targetRole?: string;
  }) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const status = payload.status || 'published';

      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO announcements (title, body, status, created_by, published_by, published_at)
         VALUES (?, ?, ?, ?, ?, IF(? = 'published', NOW(), NULL))`,
        [payload.title, payload.body, status, payload.userId, payload.userId, status]
      );
      const annId = res.insertId;

      if (payload.targetRole) {
        await conn.query(
          `INSERT INTO announcement_targets (announcement_id, target_type)
           VALUES (?, ?)`,
          [annId, payload.targetRole === 'all' ? 'all' : 'role']
        );
      }

      await conn.commit();
      return annId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateAnnouncementStatus(id: number, status: 'draft' | 'published' | 'archived') {
    await pool.query(
      `UPDATE announcements 
       SET status = ?, published_at = IF(? = 'published' AND published_at IS NULL, NOW(), published_at) 
       WHERE id = ?`,
      [status, status, id]
    );
    return true;
  }

  async deleteAnnouncement(id: number) {
    await pool.query(`DELETE FROM announcement_targets WHERE announcement_id = ?`, [id]);
    await pool.query(`DELETE FROM announcements WHERE id = ?`, [id]);
    return true;
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
              st.employee_no, st.first_name, st.father_name, st.job_title, st.department
       FROM users u
       LEFT JOIN staff st ON u.id = st.user_id
       WHERE u.id = ?`,
      [userId]
    );
    return uRows[0] || null;
  }

  async updateAdminProfile(userId: number, payload: { phone?: string; email?: string }) {
    const fields: string[] = [];
    const params: any[] = [];
    if (payload.phone !== undefined) { fields.push('phone = ?'); params.push(payload.phone || null); }
    if (payload.email) { fields.push('email = ?'); params.push(payload.email); }
    if (fields.length === 0) return true;
    params.push(userId);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);

    // Also update staff record if linked
    const [staffCheck] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM staff WHERE user_id = ?`,
      [userId]
    );
    if (staffCheck.length > 0) {
      const sFields: string[] = [];
      const sParams: any[] = [];
      if (payload.phone !== undefined) { sFields.push('phone = ?'); sParams.push(payload.phone || null); }
      if (payload.email) { sFields.push('email = ?'); sParams.push(payload.email); }
      if (sFields.length > 0) {
        sParams.push(staffCheck[0].id);
        await pool.query(`UPDATE staff SET ${sFields.join(', ')} WHERE id = ?`, sParams);
      }
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, reason)
       VALUES (NOW(), ?, 'admin', 'PROFILE_UPDATE', 'users', ?, 'success', ?, 'Administrator profile details updated')`,
      [userId, String(userId), JSON.stringify(payload)]
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
      `UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?`,
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
