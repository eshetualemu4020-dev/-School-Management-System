import { pool } from '../src/config/database';
import bcrypt from 'bcrypt';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

async function seedStakeholders() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('This seed script is disabled in production. Use a non-production environment only.');
  }

  console.log('🌱 Seeding stakeholder accounts and operational records in MySQL...');
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Roles Check
    const [roles] = await conn.query<RowDataPacket[]>('SELECT id, code FROM roles');
    const roleMap = new Map<string, number>();
    for (const r of roles) {
      roleMap.set(r.code, r.id);
    }

    // 2. Academic Year & Term
    const [ayRows] = await conn.query<RowDataPacket[]>("SELECT id FROM academic_years WHERE status = 'active' LIMIT 1");
    const academicYearId = ayRows[0]?.id || 1;
    const [tRows] = await conn.query<RowDataPacket[]>('SELECT id FROM terms WHERE academic_year_id = ? LIMIT 1', [academicYearId]);
    const termId = tRows[0]?.id || 1;

    // 3. User Accounts
    const adminUsername = process.env.SEED_ADMIN_USERNAME || 'dev.admin';
    const registrarUsername = process.env.SEED_REGISTRAR_USERNAME || 'dev.registrar';
    const librarianUsername = process.env.SEED_LIBRARIAN_USERNAME || 'dev.librarian';
    const parentUsername = process.env.SEED_PARENT_USERNAME || 'dev.parent';

    const usersToCreate = [
      {
        username: adminUsername,
        email: process.env.SEED_ADMIN_EMAIL || 'admin@localhost',
        phone: process.env.SEED_ADMIN_PHONE || '+000000000000',
        password: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe#123',
        roleCode: 'system_admin'
      },
      {
        username: registrarUsername,
        email: process.env.SEED_REGISTRAR_EMAIL || 'registrar@localhost',
        phone: process.env.SEED_REGISTRAR_PHONE || '+000000000000',
        password: process.env.SEED_REGISTRAR_PASSWORD || 'ChangeMe#123',
        roleCode: 'registrar'
      },
      {
        username: librarianUsername,
        email: process.env.SEED_LIBRARIAN_EMAIL || 'librarian@localhost',
        phone: process.env.SEED_LIBRARIAN_PHONE || '+000000000000',
        password: process.env.SEED_LIBRARIAN_PASSWORD || 'ChangeMe#123',
        roleCode: 'librarian'
      },
      {
        username: parentUsername,
        email: process.env.SEED_PARENT_EMAIL || 'parent@localhost',
        phone: process.env.SEED_PARENT_PHONE || '+000000000000',
        password: process.env.SEED_PARENT_PASSWORD || 'ChangeMe#123',
        roleCode: 'guardian'
      }
    ];

    const userMap = new Map<string, number>();

    for (const u of usersToCreate) {
      const hash = await bcrypt.hash(u.password, 10);
      const [existing] = await conn.query<RowDataPacket[]>('SELECT id FROM users WHERE username = ?', [u.username]);
      let userId: number;

      if (existing.length > 0) {
        userId = existing[0].id;
        await conn.query('UPDATE users SET password_hash = ?, status = "active" WHERE id = ?', [hash, userId]);
      } else {
        const [res] = await conn.query<ResultSetHeader>(
          'INSERT INTO users (username, email, phone, password_hash, status) VALUES (?, ?, ?, ?, "active")',
          [u.username, u.email, u.phone, hash]
        );
        userId = res.insertId;
      }
      userMap.set(u.username, userId);

      // Assign Role
      const roleId = roleMap.get(u.roleCode);
      if (roleId) {
        await conn.query(
          'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)',
          [userId, roleId]
        );
      }
    }

    const adminUserId = userMap.get(adminUsername)!;
    const registrarUserId = userMap.get(registrarUsername)!;
    const librarianUserId = userMap.get(librarianUsername)!;
    const parentUserId = userMap.get(parentUsername)!;

    const teacherUsername = process.env.SEED_TEACHER_USERNAME || 'dev.teacher';
    const [tUserRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM users WHERE username = ?`, [teacherUsername]);
    const teacherUserId = tUserRows[0]?.id || adminUserId;

    // 4. Staff Profiles for Registrar and Librarian
    // Registrar Staff
    let [regStaff] = await conn.query<RowDataPacket[]>('SELECT id FROM staff WHERE user_id = ?', [registrarUserId]);
    let regStaffId: number;
    if (regStaff.length > 0) {
      regStaffId = regStaff[0].id;
    } else {
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO staff (user_id, employee_no, first_name, father_name, gender, job_title, department, staff_type, hire_date, status)
         VALUES (?, 'EMP-2001', 'Solomon', 'Desta', 'male', 'Chief Registrar Officer', 'Admissions & Records', 'administrator', '2020-08-15', 'active')`,
        [registrarUserId]
      );
      regStaffId = res.insertId;
    }

    // Librarian Staff
    let [libStaff] = await conn.query<RowDataPacket[]>('SELECT id FROM staff WHERE user_id = ?', [librarianUserId]);
    let libStaffId: number;
    if (libStaff.length > 0) {
      libStaffId = libStaff[0].id;
    } else {
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO staff (user_id, employee_no, first_name, father_name, gender, job_title, department, staff_type, hire_date, status)
         VALUES (?, 'EMP-3001', 'Marta', 'Haile', 'female', 'Head Librarian', 'Library & Learning Resource Center', 'librarian', '2021-01-10', 'active')`,
        [librarianUserId]
      );
      libStaffId = res.insertId;
    }

    // 5. Guardian Profile for parent.kassa & link to Students 1 (Hana) and 2 (Abel)
    let [guardianRows] = await conn.query<RowDataPacket[]>('SELECT id FROM guardians WHERE user_id = ?', [parentUserId]);
    let guardianId: number;
    if (guardianRows.length > 0) {
      guardianId = guardianRows[0].id;
    } else {
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT INTO guardians (user_id, first_name, father_name, phone, email, verification_status, verified_by, verified_at, verification_method)
         VALUES (?, 'Kassa', 'Bekele', '+251911445566', 'kassa.parent@school.et', 'verified', ?, NOW(), 'kebele_id')`,
        [parentUserId, registrarUserId]
      );
      guardianId = res.insertId;
    }

    // Link Guardian to Student 1 (Hana Bekele) and Student 2 (Abel Tesfaye)
    await conn.query(
      `INSERT INTO student_guardians (student_id, guardian_id, relationship, is_primary, is_emergency_contact)
       VALUES (1, ?, 'father', 1, 1), (2, ?, 'father', 1, 1)
       ON DUPLICATE KEY UPDATE relationship = VALUES(relationship), is_primary = VALUES(is_primary)`,
      [guardianId, guardianId]
    );

    // 6. Library Categories & Books
    const categories = [
      { id: 1, name: 'Science & Nature' },
      { id: 2, name: 'Mathematics' },
      { id: 3, name: 'Literature & Languages' },
      { id: 4, name: 'Social Studies & History' },
      { id: 5, name: 'Technology & Computing' }
    ];

    for (const c of categories) {
      await conn.query(
        'INSERT INTO book_categories (id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
        [c.id, c.name]
      );
    }

    const books = [
      {
        id: 1,
        isbn: '978-99944-1-101-2',
        title: 'Secondary Physics for Ethiopian Schools (Grade 11)',
        author: 'Mekonnen Tesfaye, M.Sc.',
        publisher: 'MoE Educational Press',
        publication_year: 2024,
        category_id: 1,
        language: 'English'
      },
      {
        id: 2,
        isbn: '978-99944-1-102-9',
        title: 'Modern Chemistry Principles & Laboratory Guide',
        author: 'Dr. Almaz Bekele',
        publisher: 'Addis Ababa University Press',
        publication_year: 2023,
        category_id: 1,
        language: 'English'
      },
      {
        id: 3,
        isbn: '978-99944-1-103-6',
        title: 'Advanced Pure Mathematics for Preparatory Students',
        author: 'Tadesse Woldie',
        publisher: 'Aster Nega Publishing',
        publication_year: 2022,
        category_id: 2,
        language: 'English'
      },
      {
        id: 4,
        isbn: '978-99944-1-104-3',
        title: 'Oromay (ኦሮማይ)',
        author: 'Baalu Girma',
        publisher: 'Kuraz Publishing Agency',
        publication_year: 2018,
        category_id: 3,
        language: 'Amharic'
      },
      {
        id: 5,
        isbn: '978-99944-1-105-0',
        title: 'A History of Modern Ethiopia (1855–1991)',
        author: 'Prof. Bahru Zewde',
        publisher: 'James Currey / AAU Press',
        publication_year: 2021,
        category_id: 4,
        language: 'English'
      },
      {
        id: 6,
        isbn: '978-99944-1-106-7',
        title: 'Introduction to Computer Science & Python Programming',
        author: 'Eleni Hailu',
        publisher: 'TechEd Books',
        publication_year: 2025,
        category_id: 5,
        language: 'English'
      }
    ];

    for (const b of books) {
      await conn.query(
        `INSERT INTO books (id, isbn, title, author, publisher, publication_year, category_id, language)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), author = VALUES(author), category_id = VALUES(category_id)`,
        [b.id, b.isbn, b.title, b.author, b.publisher, b.publication_year, b.category_id, b.language]
      );
    }

    // 7. Book Copies
    const copies = [
      { id: 1, book_id: 1, barcode: 'LIB-PHY-1001', location: 'Science Lab Shelf 1', status: 'available' },
      { id: 2, book_id: 1, barcode: 'LIB-PHY-1002', location: 'Shelf S-1', status: 'on_loan' },
      { id: 3, book_id: 2, barcode: 'LIB-CHM-1001', location: 'Shelf S-2', status: 'available' },
      { id: 4, book_id: 3, barcode: 'LIB-MTH-1001', location: 'Shelf M-1', status: 'on_loan' },
      { id: 5, book_id: 3, barcode: 'LIB-MTH-1002', location: 'Shelf M-2', status: 'available' },
      { id: 6, book_id: 4, barcode: 'LIB-LIT-1001', location: 'Shelf L-1', status: 'available' },
      { id: 7, book_id: 5, barcode: 'LIB-HST-1001', location: 'Shelf H-1', status: 'available' },
      { id: 8, book_id: 6, barcode: 'LIB-TEC-1001', location: 'Computer Lab Shelf', status: 'available' }
    ];

    for (const cp of copies) {
      await conn.query(
        `INSERT INTO book_copies (id, book_id, barcode, status, location, acquired_on)
         VALUES (?, ?, ?, ?, ?, '2026-08-15')
         ON DUPLICATE KEY UPDATE status = VALUES(status), location = VALUES(location)`,
        [cp.id, cp.book_id, cp.barcode, cp.status, cp.location]
      );
    }

    // 8. Library Loans & Reservations
    // Loan 1: Issued to Student 1 (Hana Bekele) - active on loan
    await conn.query(
      `INSERT INTO library_loans (id, copy_id, student_id, checkout_at, due_at, issued_by)
       VALUES (1, 2, 1, '2026-10-01 09:30:00', '2026-10-22 17:00:00', ?)
       ON DUPLICATE KEY UPDATE due_at = VALUES(due_at)`,
      [librarianUserId]
    );

    // Loan 2: Issued to Student 2 (Abel Tesfaye) - overdue
    await conn.query(
      `INSERT INTO library_loans (id, copy_id, student_id, checkout_at, due_at, issued_by)
       VALUES (2, 4, 2, '2026-09-18 10:00:00', '2026-10-02 17:00:00', ?)
       ON DUPLICATE KEY UPDATE due_at = VALUES(due_at)`,
      [librarianUserId]
    );

    // Reservation for Student 4 (Dawit Alemu) on Book 1
    await conn.query(
      `INSERT INTO library_reservations (id, book_id, student_id, status, reserved_at, expires_at)
       VALUES (1, 1, 4, 'active', '2026-10-10 11:00:00', '2026-10-24 17:00:00')
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      []
    );

    // 9. Registrar Documents
    const documents = [
      {
        id: 1,
        owner_type: 'student',
        owner_id: 1,
        doc_type: 'birth_certificate',
        original_name: 'Hana_Bekele_Birth_Certificate.pdf',
        storage_key: 'docs/students/1/birth_cert.pdf',
        mime_type: 'application/pdf',
        size_bytes: 524288
      },
      {
        id: 2,
        owner_type: 'student',
        owner_id: 1,
        doc_type: 'grade_8_certificate',
        original_name: 'Hana_Grade8_National_Exam_Card.pdf',
        storage_key: 'docs/students/1/grade8_cert.pdf',
        mime_type: 'application/pdf',
        size_bytes: 412900
      },
      {
        id: 3,
        owner_type: 'student',
        owner_id: 2,
        doc_type: 'transcript',
        original_name: 'Abel_Previous_School_Transcript.pdf',
        storage_key: 'docs/students/2/transcript.pdf',
        mime_type: 'application/pdf',
        size_bytes: 614000
      },
      {
        id: 4,
        owner_type: 'student',
        owner_id: 2,
        doc_type: 'kebele_id',
        original_name: 'Abel_Kebele_Identification.pdf',
        storage_key: 'docs/students/2/kebele_id.pdf',
        mime_type: 'application/pdf',
        size_bytes: 310200
      }
    ];

    for (const d of documents) {
      await conn.query(
        `INSERT INTO documents (id, owner_type, owner_id, doc_type, original_name, storage_key, mime_type, size_bytes, checksum_sha256, scan_status, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'clean', ?)
         ON DUPLICATE KEY UPDATE original_name = VALUES(original_name), scan_status = VALUES(scan_status)`,
        [d.id, d.owner_type, d.owner_id, d.doc_type, d.original_name, d.storage_key, d.mime_type, d.size_bytes, registrarUserId]
      );
    }

    // 10. Transfers & Withdrawals
    await conn.query(
      `INSERT INTO transfers_withdrawals (id, student_id, enrollment_id, type, destination_school, effective_date, reason, approved_by)
       VALUES (1, 15, 15, 'transfer', 'Hawassa Comprehensive Secondary School', '2026-10-01', 'Family relocated to Hawassa city administration.', ?)
       ON DUPLICATE KEY UPDATE destination_school = VALUES(destination_school), reason = VALUES(reason)`,
      [registrarUserId]
    );

    // 11. Student Assignments & Submissions
    await conn.query(
      `INSERT INTO assignments (id, teaching_assignment_id, term_id, title, instructions, due_at, allow_late, max_score, status, published_at, created_by)
       VALUES 
       (1, 1, ?, 'Newtonian Mechanics & Gravitation Problem Set', 'Complete problems 1 through 15 from Chapter 3 textbook and show all derivations.', '2026-10-25 23:59:00', 1, 20.00, 'published', NOW(), ?),
       (2, 1, ?, 'Thermodynamics Heat Engine Analysis', 'Write a 2-page laboratory summary evaluating Carnot cycle thermal efficiency.', '2026-11-05 23:59:00', 0, 20.00, 'published', NOW(), ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), status = VALUES(status)`,
      [termId, teacherUserId, termId, teacherUserId]
    );

    await conn.query(
      `INSERT INTO submissions (id, assignment_id, enrollment_id, submitted_at, is_late, status, content_text, score, graded_by, graded_at, feedback)
       VALUES (1, 1, 1, '2026-10-10 14:20:00', 0, 'graded', 'Completed derivations and graphical solution attached.', 18.50, ?, NOW(), 'Excellent mathematical derivations and clear force diagram.')
       ON DUPLICATE KEY UPDATE score = VALUES(score), status = VALUES(status)`,
      [teacherUserId]
    );

    // 12. Finance: Fee structures, Invoices & Payments
    const [fcRows] = await conn.query<RowDataPacket[]>('SELECT id FROM fee_categories LIMIT 1');
    const feeCatId = fcRows[0]?.id || 1;

    // Invoice 1: Student 1 (Hana Bekele) - Paid
    await conn.query(
      `INSERT INTO invoices (id, invoice_no, student_id, academic_year_id, enrollment_id, issue_date, due_date, currency, status, notes, created_by)
       VALUES (1, 'INV-2026-0001', 1, ?, 1, '2026-09-15', '2026-10-15', 'ETB', 'paid', 'Term 1 Tuition & Registration Fee', ?)
       ON DUPLICATE KEY UPDATE status = 'paid'`,
      [academicYearId, adminUserId]
    );

    await conn.query(
      `INSERT INTO invoice_items (id, invoice_id, fee_category_id, description, quantity, unit_amount, discount_amount)
       VALUES 
       (1, 1, ?, 'Semester 1 Tuition Fee', 1.00, 3000.00, 0.00),
       (2, 1, ?, 'Annual Registration & Student ID Fee', 1.00, 500.00, 0.00)
       ON DUPLICATE KEY UPDATE unit_amount = VALUES(unit_amount)`,
      [feeCatId, feeCatId]
    );

    // Invoice 2: Student 2 (Abel Tesfaye) - Issued (Pending)
    await conn.query(
      `INSERT INTO invoices (id, invoice_no, student_id, academic_year_id, enrollment_id, issue_date, due_date, currency, status, notes, created_by)
       VALUES (2, 'INV-2026-0002', 2, ?, 2, '2026-09-15', '2026-10-31', 'ETB', 'issued', 'Term 1 Tuition Fee', ?)
       ON DUPLICATE KEY UPDATE status = 'issued'`,
      [academicYearId, adminUserId]
    );

    await conn.query(
      `INSERT INTO invoice_items (id, invoice_id, fee_category_id, description, quantity, unit_amount, discount_amount)
       VALUES (3, 2, ?, 'Semester 1 Tuition Fee', 1.00, 3000.00, 0.00)
       ON DUPLICATE KEY UPDATE unit_amount = VALUES(unit_amount)`,
      [feeCatId]
    );

    // Payment for Invoice 1
    await conn.query(
      `INSERT INTO payments (id, receipt_no, student_id, amount, currency, method, reference, payer_name, received_at, received_by, status, idempotency_key)
       VALUES (1, 'RCT-2026-0001', 1, 3500.00, 'ETB', 'telebirr', 'TB-2026-992211', 'Kassa Bekele', '2026-09-25 10:15:00', ?, 'posted', 'idem-seed-001')
       ON DUPLICATE KEY UPDATE status = 'posted'`,
      [adminUserId]
    );

    await conn.query(
      `INSERT INTO payment_allocations (payment_id, invoice_id, allocated_amount, allocated_by)
       VALUES (1, 1, 3500.00, ?)
       ON DUPLICATE KEY UPDATE allocated_amount = VALUES(allocated_amount)`,
      [adminUserId]
    );

    // 13. System Audit Logs
    const auditLogs = [
      {
        user: 'admin',
        userId: adminUserId,
        action: 'system.configure',
        entity: 'academic_years',
        entityId: '1',
        outcome: 'success',
        changes: JSON.stringify({ academic_year: '2026/27', status: 'active' })
      },
      {
        user: 'registrar',
        userId: registrarUserId,
        action: 'student.enroll',
        entity: 'students',
        entityId: '1',
        outcome: 'success',
        changes: JSON.stringify({ student: 'Hana Bekele', section: 'Grade 11 - Natural Science - A' })
      },
      {
        user: 'librarian',
        userId: librarianUserId,
        action: 'library.loan.issue',
        entity: 'library_loans',
        entityId: '1',
        outcome: 'success',
        changes: JSON.stringify({ copy: 'LIB-PHY-1002', student: 'Hana Bekele' })
      },
      {
        user: 't.elias',
        userId: 7,
        action: 'marks.submit',
        entity: 'assessments',
        entityId: '1',
        outcome: 'success',
        changes: JSON.stringify({ assessment: 'Midterm Examination - Physics', status: 'submitted' })
      }
    ];

    for (const log of auditLogs) {
      await conn.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_username, action, entity_type, entity_id, outcome, changes, ip_address)
         VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, '127.0.0.1')`,
        [log.userId, log.user, log.action, log.entity, log.entityId, log.outcome, log.changes]
      );
    }

    // 14. Result Publication & Report Card Snapshot for Student 1
    await conn.query(
      `INSERT INTO result_publications (id, section_id, term_id, version, status, submitted_by, submitted_at, approved_by, approved_at, published_by, published_at)
       VALUES (1, 1, ?, 1, 'published', ?, NOW(), ?, NOW(), ?, NOW())
       ON DUPLICATE KEY UPDATE status = 'published'`,
      [termId, teacherUserId, adminUserId, adminUserId]
    );

    await conn.query(
      `INSERT INTO report_card_snapshots (id, publication_id, term_id, version, enrollment_id, class_rank, class_size, average_percent, payload_json, generated_by, generated_at)
       VALUES (1, 1, ?, 1, 1, 1, 15, 91.67, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE average_percent = VALUES(average_percent)`,
      [
        termId,
        JSON.stringify({
          studentName: 'Hana Bekele',
          admissionNo: 'HS-2026-0001',
          gradeLevel: 11,
          sectionName: 'Grade 11 - Natural Science - A',
          termName: 'Semester 1',
          subjects: [
            { name: 'Physics', code: 'PHY', score: 27.5, maxScore: 30, letter: 'A', remark: 'Excellent' },
            { name: 'Chemistry', code: 'CHEM', score: 26.0, maxScore: 30, letter: 'A', remark: 'Very Good' },
            { name: 'Mathematics', code: 'MATH', score: 28.0, maxScore: 30, letter: 'A', remark: 'Outstanding' }
          ],
          totalScore: 81.5,
          maxTotal: 90,
          averagePercent: 90.56,
          rank: 1,
          attendanceRate: 95.5
        }),
        adminUserId
      ]
    );

    await conn.commit();
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe#123';
    const registrarPassword = process.env.SEED_REGISTRAR_PASSWORD || 'ChangeMe#123';
    const librarianPassword = process.env.SEED_LIBRARIAN_PASSWORD || 'ChangeMe#123';
    const parentPassword = process.env.SEED_PARENT_PASSWORD || 'ChangeMe#123';
    const studentUsername = process.env.SEED_STUDENT_USERNAME || 'dev.student';
    const studentPassword = process.env.SEED_STUDENT_PASSWORD || 'ChangeMe#123';

    console.log('✅ All stakeholder baseline records and accounts successfully seeded in MySQL!');
    console.log(`  👑 Administrator: username="${adminUsername}", password="${adminPassword}"`);
    console.log(`  📋 Registrar:     username="${registrarUsername}", password="${registrarPassword}"`);
    console.log(`  📚 Librarian:     username="${librarianUsername}", password="${librarianPassword}"`);
    console.log(`  👨‍👧 Parent:        username="${parentUsername}", password="${parentPassword}"`);
    console.log(`  🎓 Student:       username="${studentUsername}", password="${studentPassword}"`);
    console.log(`  🧑‍🏫 Teacher:       username="${teacherUsername}", password="${process.env.SEED_TEACHER_PASSWORD || 'ChangeMe#123'}"`);
  } catch (err) {
    await conn.rollback();
    console.error('❌ Stakeholder seed failed:', err);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

seedStakeholders().catch((e) => {
  console.error(e);
  process.exit(1);
});
