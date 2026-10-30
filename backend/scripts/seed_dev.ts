import { pool } from '../src/config/database';
import bcrypt from 'bcrypt';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development seed script cannot run in production.');
  }

  const teacherUsername = process.env.SEED_TEACHER_USERNAME || 'dev.teacher';
  const teacherEmail = process.env.SEED_TEACHER_EMAIL || 'teacher@localhost';
  const teacherPassword = process.env.SEED_TEACHER_PASSWORD || 'ChangeMe#123';
  const studentUsername = process.env.SEED_STUDENT_USERNAME || 'dev.student';
  const studentEmail = process.env.SEED_STUDENT_EMAIL || 'student@localhost';
  const studentPassword = process.env.SEED_STUDENT_PASSWORD || 'ChangeMe#123';
  const otherTeacherUsername = process.env.SEED_OTHER_TEACHER_USERNAME || 'dev.other.teacher';
  const otherTeacherEmail = process.env.SEED_OTHER_TEACHER_EMAIL || 'other.teacher@localhost';
  const otherTeacherPassword = process.env.SEED_OTHER_TEACHER_PASSWORD || 'ChangeMe#123';

  console.log('🌱 Starting HSPSMS Dev Seed script...');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Academic Year
    let [ayRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM academic_years WHERE name = '2026/27'`);
    let academicYearId: number;
    if (ayRows.length > 0) {
      academicYearId = ayRows[0].id;
    } else {
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO academic_years (name, label_ec, start_date, end_date, status, is_current)
         VALUES ('2026/27', '2019 E.C.', '2026-09-11', '2027-07-06', 'active', 1)`
      );
      academicYearId = res.insertId;
    }

    // 2. Term
    let [termRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM terms WHERE academic_year_id = ? AND term_no = 1`, [academicYearId]);
    let termId: number;
    if (termRows.length > 0) {
      termId = termRows[0].id;
    } else {
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO terms (academic_year_id, term_no, name, start_date, end_date, status, is_current)
         VALUES (?, 1, 'Semester 1', '2026-09-11', '2027-01-31', 'active', 1)`,
        [academicYearId]
      );
      termId = res.insertId;
    }

    // 3. Classrooms
    await conn.query(
      `INSERT IGNORE INTO classrooms (id, name, building, room_type, capacity) VALUES
       (1, 'Room 101', 'Block A', 'classroom', 40),
       (2, 'Room 102', 'Block A', 'classroom', 40),
       (3, 'Physics Lab', 'Block B', 'laboratory', 35)`
    );

    // 4. Subjects
    const subjects = [
      { id: 1, code: 'PHY', name: 'Physics', name_am: 'ፊዚክስ' },
      { id: 2, code: 'CHEM', name: 'Chemistry', name_am: 'ኬሚስትሪ' },
      { id: 3, code: 'MATH', name: 'Mathematics', name_am: 'ሒሳብ' },
      { id: 4, code: 'ENG', name: 'English', name_am: 'እንግሊዝኛ' }
    ];
    for (const sub of subjects) {
      await conn.query(
        `INSERT INTO subjects (id, code, name, name_am, status)
         VALUES (?, ?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE name = VALUES(name), name_am = VALUES(name_am)`,
        [sub.id, sub.code, sub.name, sub.name_am]
      );
    }

    // 5. Grades (Grade 9 through Grade 12)
    let [g11Rows] = await conn.query<RowDataPacket[]>(`SELECT id FROM grades WHERE grade_level = 11`);
    const grade11Id = g11Rows[0]?.id || 3;
    let [g12Rows] = await conn.query<RowDataPacket[]>(`SELECT id FROM grades WHERE grade_level = 12`);
    const grade12Id = g12Rows[0]?.id || 4;
    let [g10Rows] = await conn.query<RowDataPacket[]>(`SELECT id FROM grades WHERE grade_level = 10`);
    const grade10Id = g10Rows[0]?.id || 2;
 let [g9Rows] = await conn.query<RowDataPacket[]>(`SELECT id FROM grades WHERE grade_level = 9`);
    const grade9Id = g9Rows[0]?.id || 1;
    // 6. Sections
    const sections = [
      { id: 1, gradeId: grade11Id, name: 'Grade 11 - Natural Science - A', stream: 'natural_science', capacity: 40 },
      { id: 2, gradeId: grade11Id, name: 'Grade 11 - Natural Science - B', stream: 'natural_science', capacity: 40 },
      { id: 3, gradeId: grade12Id, name: 'Grade 12 - Natural Science - A', stream: 'natural_science', capacity: 40 },
      { id: 4, gradeId: grade10Id, name: 'Grade 10 - Section A', stream: 'none', capacity: 55 },
      { id: 5, gradeId: grade9Id, name: 'Grade 9 - Section A', stream: 'none', capacity: 60 }

    ];
    for (const sec of sections) {
      await conn.query(
        `INSERT INTO sections (id, grade_id, academic_year_id, name, stream, capacity, status)
         VALUES (?, ?, ?, ?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE name = VALUES(name), stream = VALUES(stream), capacity = VALUES(capacity)`,
        [sec.id, sec.gradeId, academicYearId, sec.name, sec.stream, sec.capacity]
      );
    }

    // 7. Time Slots
    await conn.query(
      `INSERT IGNORE INTO time_slots (id, day_of_week, start_time, end_time, label) VALUES
       (1, 1, '08:30:00', '09:15:00', 'Mon Period 1'),
       (2, 1, '09:20:00', '10:05:00', 'Mon Period 2'),
       (3, 2, '08:30:00', '09:15:00', 'Tue Period 1'),
       (4, 3, '10:15:00', '11:00:00', 'Wed Period 3'),
       (5, 4, '08:30:00', '09:15:00', 'Thu Period 1'),
       (6, 5, '09:20:00', '10:05:00', 'Fri Period 2')`
    );

    // 8. Teacher User Account
    const eliasPasswordHash = await bcrypt.hash(teacherPassword, 10);
    let [eliasUserRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM users WHERE username = ?`, [teacherUsername]);
    let eliasUserId: number;
    if (eliasUserRows.length > 0) {
      eliasUserId = eliasUserRows[0].id;
      await conn.query(`UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?`, [eliasPasswordHash, eliasUserId]);
    } else {
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO users (username, email, phone, password_hash, status)
         VALUES (?, ?, '+000000000000', ?, 'active')`,
        [teacherUsername, teacherEmail, eliasPasswordHash]
      );
      eliasUserId = res.insertId;
    }

    // Assign Teacher role
    let [teacherRoleRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM roles WHERE code = 'teacher'`);
    const teacherRoleId = teacherRoleRows[0].id;
    await conn.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, NULL)
       ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
      [eliasUserId, teacherRoleId]
    );

    // Staff Profile for Elias
    let [eliasStaffRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM staff WHERE user_id = ?`, [eliasUserId]);
    let eliasStaffId: number;
    if (eliasStaffRows.length > 0) {
      eliasStaffId = eliasStaffRows[0].id;
    } else {
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO staff (user_id, employee_no, first_name, father_name, grandfather_name, gender, job_title, department, staff_type, hire_date, status)
         VALUES (?, 'EMP-1001', 'Elias', 'Kebede', 'Hailu', 'male', 'Senior Physics Teacher', 'Physics Department', 'teacher', '2021-09-01', 'active')`,
        [eliasUserId]
      );
      eliasStaffId = res.insertId;
    }

    // 9. Teaching Assignments for Elias
    const assignments = [
      { id: 1, staffId: eliasStaffId, subjectId: 1, sectionId: 1 }, // Grade 11 NS-A Physics
      { id: 2, staffId: eliasStaffId, subjectId: 1, sectionId: 2 }, // Grade 11 NS-B Physics
      { id: 3, staffId: eliasStaffId, subjectId: 1, sectionId: 3 }, // Grade 12 NS-A Physics
      { id: 4, staffId: eliasStaffId, subjectId: 1, sectionId: 4 }  // Grade 10 Sec-A Physics
    ];
    for (const a of assignments) {
      await conn.query(
        `INSERT INTO teaching_assignments (id, staff_id, subject_id, section_id, academic_year_id, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE staff_id = VALUES(staff_id), is_active = 1`,
        [a.id, a.staffId, a.subjectId, a.sectionId, academicYearId]
      );
    }

    // 10. Secondary Teacher for testing isolation
    const otherPassHash = await bcrypt.hash(otherTeacherPassword, 10);
    let [otherUserRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM users WHERE username = ?`, [otherTeacherUsername]);
    let otherUserId: number;
    if (otherUserRows.length > 0) {
      otherUserId = otherUserRows[0].id;
      await conn.query(`UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?`, [otherPassHash, otherUserId]);
    } else {
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO users (username, email, phone, password_hash, status)
         VALUES (?, ?, '+000000000000', ?, 'active')`,
        [otherTeacherUsername, otherTeacherEmail, otherPassHash]
      );
      otherUserId = res.insertId;
    }
    await conn.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, NULL)
       ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
      [otherUserId, teacherRoleId]
    );

    let [otherStaffRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM staff WHERE user_id = ?`, [otherUserId]);
    let otherStaffId: number;
    if (otherStaffRows.length > 0) {
      otherStaffId = otherStaffRows[0].id;
    } else {
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO staff (user_id, employee_no, first_name, father_name, gender, job_title, department, staff_type, hire_date, status)
         VALUES (?, 'EMP-1002', 'Abebe', 'Balcha', 'male', 'Chemistry Teacher', 'Chemistry Department', 'teacher', '2022-09-01', 'active')`,
        [otherUserId]
      );
      otherStaffId = res.insertId;
    }

    // 11. Student User Account for testing role rejection
    const studentPassHash = await bcrypt.hash(studentPassword, 10);
    let [studUserRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM users WHERE username = ?`, [studentUsername]);
    let studUserId: number;
    if (studUserRows.length > 0) {
      studUserId = studUserRows[0].id;
      await conn.query(`UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?`, [studentPassHash, studUserId]);
    } else {
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO users (username, email, password_hash, status)
         VALUES (?, ?, ?, 'active')`,
        [studentUsername, studentEmail, studentPassHash]
      );
      studUserId = res.insertId;
    }
    let [studRoleRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM roles WHERE code = 'student'`);
    if (studRoleRows.length > 0) {
      await conn.query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, NULL)
         ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
        [studUserId, studRoleRows[0].id]
      );
    }

    // 12. 15 Enrolled Students in Grade 11 NS-A (Section 1)
    const studentList = [
      { id: 1, adm: 'HS-2026-0001', first: 'Hana', father: 'Bekele', gender: 'female' },
      { id: 2, adm: 'HS-2026-0002', first: 'Abel', father: 'Tesfaye', gender: 'male' },
      { id: 3, adm: 'HS-2026-0003', first: 'Selam', father: 'Girma', gender: 'female' },
      { id: 4, adm: 'HS-2026-0004', first: 'Dawit', father: 'Alemu', gender: 'male' },
      { id: 5, adm: 'HS-2026-0005', first: 'Rahel', father: 'Kassa', gender: 'female' },
      { id: 6, adm: 'HS-2026-0006', first: 'Eshetu', father: 'Alemu', gender: 'male' },
      { id: 7, adm: 'HS-2026-0007', first: 'Bethlehem', father: 'Tadesse', gender: 'female' },
      { id: 8, adm: 'HS-2026-0008', first: 'Natnael', father: 'Desta', gender: 'male' },
      { id: 9, adm: 'HS-2026-0009', first: 'Almaz', father: 'Haile', gender: 'female' },
      { id: 10, adm: 'HS-2026-0010', first: 'Yonatan', father: 'Kebede', gender: 'male' },
      { id: 11, adm: 'HS-2026-0011', first: 'Kalkidan', father: 'Assefa', gender: 'female' },
      { id: 12, adm: 'HS-2026-0012', first: 'Yared', father: 'Mengistu', gender: 'male' },
      { id: 13, adm: 'HS-2026-0013', first: 'Meron', father: 'Worku', gender: 'female' },
      { id: 14, adm: 'HS-2026-0014', first: 'Biniyam', father: 'Fikru', gender: 'male' },
      { id: 15, adm: 'HS-2026-0015', first: 'Tigist', father: 'Lemma', gender: 'female' }
    ];

    for (let i = 0; i < studentList.length; i++) {
      const s = studentList[i];
      await conn.query(
        `INSERT INTO students (id, user_id, admission_no, first_name, father_name, gender, date_of_birth, admission_date, status)
         VALUES (?, ?, ?, ?, ?, ?, '2009-04-12', '2026-09-01', 'active')
         ON DUPLICATE KEY UPDATE admission_no = VALUES(admission_no), first_name = VALUES(first_name), father_name = VALUES(father_name)`,
        [s.id, s.id === 1 ? studUserId : null, s.adm, s.first, s.father, s.gender]
      );

      await conn.query(
        `INSERT INTO enrollments (id, student_id, section_id, academic_year_id, status, roll_no, enrolled_on, created_by)
         VALUES (?, ?, 1, ?, 'active', ?, '2026-09-11', ?)
         ON DUPLICATE KEY UPDATE section_id = VALUES(section_id), status = 'active', roll_no = VALUES(roll_no)`,
        [s.id, s.id, academicYearId, i + 1, eliasUserId]
      );
    }

    // 13. Timetable Entries for Elias
    await conn.query(
      `INSERT IGNORE INTO timetable_entries (id, term_id, section_id, subject_id, staff_id, room_id, time_slot_id) VALUES
       (1, ?, 1, 1, ?, 3, 1),
       (2, ?, 2, 1, ?, 3, 2),
       (3, ?, 1, 1, ?, 3, 3),
       (4, ?, 3, 1, ?, 3, 4),
       (5, ?, 4, 1, ?, 1, 6)`,
      [termId, eliasStaffId, termId, eliasStaffId, termId, eliasStaffId, termId, eliasStaffId, termId, eliasStaffId]
    );

    // 14. Announcements
    await conn.query(
      `INSERT INTO announcements (id, title, body, status, created_by, published_by, published_at)
       VALUES 
       (1, 'Term 1 Midterm Examinations Schedule', 'Midterm examinations will commence on October 25, 2026. All teachers must prepare their assessments and submission keys.', 'published', ?, ?, NOW()),
       (2, 'Staff Meeting: Academic Curriculum Review', 'Mandatory general staff meeting this Friday at 3:00 PM in the Main Assembly Hall regarding Grade 11–12 stream allocations.', 'published', ?, ?, NOW())
       ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body)`,
      [eliasUserId, eliasUserId, eliasUserId, eliasUserId]
    );

    // 15. Initial Assessment for Elias: Midterm Exam (Physics)
    let [assRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM assessments WHERE id = 1`);
    if (assRows.length === 0) {
      await conn.query(
        `INSERT INTO assessments (id, teaching_assignment_id, term_id, assessment_type_id, title, max_score, weight, assessment_date, status, created_by)
         VALUES (1, 1, ?, 4, 'Midterm Examination - Physics', 30.00, 30.00, '2026-10-15', 'open', ?)`,
        [termId, eliasUserId]
      );
    }

    await conn.commit();
    console.log('✅ Dev seed data inserted successfully!');
    console.log(`👤 Teacher Account Ready: username="${teacherUsername}", password="${teacherPassword}"`);
    console.log(`👤 Test Student Account: username="${studentUsername}", password="${studentPassword}"`);
    console.log(`👤 Test Other Teacher: username="${otherTeacherUsername}", password="${otherTeacherPassword}"`);
  } catch (err) {
    await conn.rollback();
    console.error('❌ Dev Seed Failed:', err);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
