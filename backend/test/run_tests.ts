process.env.NODE_ENV = 'test';
import { pool } from '../src/config/database';
import app from '../src/index';
import { Server } from 'http';
import { createHash } from 'crypto';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];
const issuedTokens: string[] = [];

function sessionToken(response: Response): string {
  const cookie = response.headers.get('set-cookie') || '';
  const token = cookie.match(/hspsms_session=([^;]+)/)?.[1] || '';
  if (token) issuedTokens.push(token);
  return token;
}

async function assert(name: string, condition: boolean, message?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    results.push({ name, passed: true });
  } else {
    console.error(`  ❌ FAIL: ${name} - ${message}`);
    results.push({ name, passed: false, error: message });
  }
}

async function run() {
  console.log('\n======================================================');
  console.log('🧪 HSPSMS TEACHER MODULE VERIFICATION TEST SUITE');
  console.log('======================================================\n');

  // Start test server on port 5001
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(5001, () => resolve(s));
  });
  const baseUrl = 'http://localhost:5001/api/v1';

  try {
    // -----------------------------------------------------------------
    // TEST 0: Public account registration from login page
    // -----------------------------------------------------------------
    console.log('\n--- 0. Self Registration ---');
    // Use a unique email/admission no. per run and clean up afterwards, so the
    // suite stays idempotent (a fixed email would collide on the second run).
    const signupStamp = Date.now();
    const signupEmail = `aster.tesfaye.${signupStamp}@example.com`;
    const signupAdmissionNo = `APP-NEW-${signupStamp}`;
    const signupPayload = {
      role: 'student',
      firstName: 'Aster',
      lastName: 'Tesfaye',
      email: signupEmail,
      phone: '+251911100011',
      password: 'AsterPass#2026',
      idNumber: signupAdmissionNo
    };

    const registerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signupPayload)
    });
    const registerData = await registerRes.json();
    await assert('User can register from the login page (201)', registerRes.status === 201 && !!registerData?.data?.user?.username);

    // Verify the newly registered account can immediately log in.
    const newUserLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: signupEmail, password: signupPayload.password })
    });
    const newUserLoginData = await newUserLoginRes.json();
    const newUserToken = sessionToken(newUserLoginRes);
    await assert('Newly registered account can log in (200)', newUserLoginRes.status === 200 && !!newUserToken && !newUserLoginData?.data?.token);
    await assert('Login sets an HttpOnly SameSite cookie', /HttpOnly/i.test(newUserLoginRes.headers.get('set-cookie') || '') && /SameSite=Lax/i.test(newUserLoginRes.headers.get('set-cookie') || ''));
    await assert('Newly registered account has student role', newUserLoginData?.data?.user?.roles?.includes('student'));
    const meWithCookie = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: `hspsms_session=${newUserToken}` } });
    await assert('HttpOnly session cookie authenticates protected identity route', meWithCookie.status === 200);

    const [signupUsers]: any = await pool.query('SELECT id FROM users WHERE email = ?', [signupEmail]);
    const signupUserId = signupUsers[0].id;
    await pool.query('UPDATE refresh_sessions SET expires_at = DATE_SUB(NOW(3), INTERVAL 1 MINUTE) WHERE token_hash = ?', [createHash('sha256').update(newUserToken).digest('hex')]);
    const expiredSessionRes = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: `hspsms_session=${newUserToken}` } });
    await assert('Expired database-backed session is rejected', expiredSessionRes.status === 401);

    await pool.query('UPDATE users SET status = \'disabled\' WHERE id = ?', [signupUserId]);
    const disabledLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: signupEmail, password: signupPayload.password })
    });
    await pool.query('UPDATE users SET status = \'active\' WHERE id = ?', [signupUserId]);
    await assert('Disabled accounts are rejected', disabledLoginRes.status === 403);

    const injectionRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: "' OR 1=1 --", password: 'not-a-password' })
    });
    const injectionData = await injectionRes.json();
    await assert('SQL injection login input is rejected generically', injectionRes.status === 401 && injectionData?.error?.code === 'INVALID_CREDENTIALS');

    const resetToken = 'test-single-use-reset-token';
    const resetHash = createHash('sha256').update(resetToken).digest('hex');
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL 15 MINUTE))`,
      [signupUserId, resetHash]
    );
    const resetRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password: 'UpdatedStudentPass#2026' })
    });
    const resetAgainRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password: 'UpdatedStudentPass#2026' })
    });
    await assert('Password reset token is single-use', resetRes.status === 200 && resetAgainRes.status === 400);

    const expiredResetToken = 'test-expired-reset-token';
    const expiredResetHash = createHash('sha256').update(expiredResetToken).digest('hex');
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_SUB(NOW(3), INTERVAL 1 MINUTE))`,
      [signupUserId, expiredResetHash]
    );
    const expiredResetRes = await fetch(`${baseUrl}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: expiredResetToken, password: 'UpdatedStudentPass#2026' })
    });
    await assert('Expired password reset token is rejected', expiredResetRes.status === 400);

    // Duplicate registration of the same email must be rejected.
    const duplicateRegisterRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...signupPayload, idNumber: `${signupAdmissionNo}-DUP` })
    });
    await assert('Duplicate email registration rejected (409)', duplicateRegisterRes.status === 409);

    // Clean up the self-registered student account
    await pool.query('DELETE FROM audit_logs WHERE actor_user_id = ?', [signupUserId]);
    await pool.query('DELETE FROM refresh_sessions WHERE user_id = ?', [signupUserId]);
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = ?', [signupUserId]);
    await pool.query('DELETE FROM students WHERE admission_no = ?', [signupAdmissionNo]);
    await pool.query('DELETE ur FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE u.email = ?', [signupEmail]);
    await pool.query('DELETE FROM users WHERE email = ?', [signupEmail]);

    for (const role of ['teacher', 'registrar', 'librarian', 'administrator'] as const) {
      const roleEmail = `${role}.signup.${signupStamp}@example.com`;
      const employeeNo = `EMP-${role.slice(0, 3)}-${String(signupStamp).slice(-6)}`;
      const staffSignupRes = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          firstName: 'Dawit',
          lastName: role,
          email: roleEmail,
          phone: '+251911100099',
          password: 'StaffSignupPass#2026',
          idNumber: employeeNo
        })
      });
      const staffSignupData = await staffSignupRes.json();
      const roleCode = role === 'administrator' ? 'system_admin' : role;
      await assert(`${role} registration is active immediately without pending approval`, staffSignupRes.status === 201 && staffSignupData?.data?.pendingApproval === false);

      const [accountRows]: any = await pool.query(
        `SELECT u.id, u.status, r.code FROM users u
         JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
         WHERE u.email = ?`,
        [roleEmail]
      );
      await assert(`${role} account is created active with the requested role`, accountRows[0]?.status === 'active' && accountRows[0]?.code === roleCode);

      const activeLoginRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: roleEmail, password: 'StaffSignupPass#2026' })
      });
      const activeLoginData = await activeLoginRes.json();
      await assert(`${role} can sign in immediately`, activeLoginRes.status === 200 && !!activeLoginData?.data?.user);

      await pool.query('DELETE FROM audit_logs WHERE actor_user_id = ?', [accountRows[0].id]);
      await pool.query('DELETE FROM refresh_sessions WHERE user_id = ?', [accountRows[0].id]);
      await pool.query('DELETE FROM staff WHERE user_id = ?', [accountRows[0].id]);
      await pool.query('DELETE FROM user_roles WHERE user_id = ?', [accountRows[0].id]);
      await pool.query('DELETE FROM users WHERE id = ?', [accountRows[0].id]);
    }

    // Public school homepage content should be available to visitors before sign-in.
    const publicHomeRes = await fetch(`${baseUrl}/public/home`);
    const publicHomeData = await publicHomeRes.json();
    await assert('Public home page is available to anonymous visitors (200)', publicHomeRes.status === 200 && !!publicHomeData?.data?.school?.name);

    // Pre-flight test idempotency: ensure assessment 1 marks are in draft and section 1 has timetable entry

    // -----------------------------------------------------------------
    // TEST 1: Health check
    // -----------------------------------------------------------------
    console.log('--- 1. Health & Database Connectivity ---');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    await assert('Backend and MySQL are healthy', healthRes.status === 200 && healthData.status === 'healthy');

    const teacherUsername = process.env.SEED_TEACHER_USERNAME || 't.elias';
    const teacherPassword = process.env.SEED_TEACHER_PASSWORD || 'EliasPass#2026';
    const studentUsername = process.env.SEED_STUDENT_USERNAME || 'student.hana';
    const studentPassword = process.env.SEED_STUDENT_PASSWORD || 'StudentPass#2026';
    const otherTeacherUsername = process.env.SEED_OTHER_TEACHER_USERNAME || 't.other';
    const otherTeacherPassword = process.env.SEED_OTHER_TEACHER_PASSWORD || 'OtherPass#2026';
    const adminUsername = process.env.SEED_ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'AdminPass#2026';
    const librarianUsername = process.env.SEED_LIBRARIAN_USERNAME || 'librarian';
    const librarianPassword = process.env.SEED_LIBRARIAN_PASSWORD || 'LibrarianPass#2026';
    const registrarUsername = process.env.SEED_REGISTRAR_USERNAME || 'registrar';
    const registrarPassword = process.env.SEED_REGISTRAR_PASSWORD || 'RegistrarPass#2026';
    const parentUsername = process.env.SEED_PARENT_USERNAME || 'parent.kassa';
    const parentPassword = process.env.SEED_PARENT_PASSWORD || 'ParentPass#2026';

    await pool.query(`UPDATE marks SET status = 'draft' WHERE assessment_id = 1`);
    const [tt1]: any = await pool.query(`SELECT id FROM timetable_entries WHERE section_id = 1 LIMIT 1`);
    if (tt1.length === 0) {
      await pool.query(`INSERT INTO timetable_entries (term_id, section_id, subject_id, staff_id, room_id, time_slot_id) VALUES (3, 1, 1, 5, 1, 1)`);
    }
    await pool.query(`INSERT INTO teaching_assignments (id, staff_id, subject_id, section_id, academic_year_id, is_active) VALUES (3, 5, 1, 3, 3, 1) ON DUPLICATE KEY UPDATE is_active = 1`);

    // -----------------------------------------------------------------
    // TEST 2: Unauthenticated requests rejected
    // -----------------------------------------------------------------
    console.log('\n--- 2. Authentication & Authorization Guards ---');
    const unauthRes = await fetch(`${baseUrl}/teacher/dashboard`);
    await assert('Unauthenticated teacher request rejected (401)', unauthRes.status === 401);

    // -----------------------------------------------------------------
    // TEST 3: Login as Teacher
    // -----------------------------------------------------------------
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: teacherUsername, password: teacherPassword })
    });
    const loginData = await loginRes.json();
    await assert('Teacher login succeeds (200)', loginRes.status === 200);
    const teacherToken = sessionToken(loginRes);
    await assert('Login credential is issued only in an HttpOnly cookie', !!teacherToken && !loginData?.data?.token);
    await assert('User has teacher role', loginData?.data?.user?.roles?.includes('teacher'));
    await assert('Teacher profile resolved', loginData?.data?.user?.staff?.fullName === 'Elias Kebede');


    const [teacherUserRows]: any = await pool.query('SELECT email FROM users WHERE username = ?', [teacherUsername]);
    const knownTeacherEmail = teacherUserRows?.[0]?.email || `${teacherUsername}@school.et`;
    const forgotPasswordRes = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: knownTeacherEmail })
    });
    const forgotPasswordData = await forgotPasswordRes.json();
    const unknownForgotRes = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `missing.${Date.now()}@example.com` })
    });
    const unknownForgotData = await unknownForgotRes.json();
    await assert('Recovery does not return a reset token and reports SMTP availability', forgotPasswordRes.status === 200 && !forgotPasswordData?.data?.resetToken && forgotPasswordData?.data?.deliveryConfigured === false);
    await assert('Recovery response is generic for known and unknown addresses', JSON.stringify(forgotPasswordData?.data) === JSON.stringify(unknownForgotData?.data));

    // -----------------------------------------------------------------
    // TEST 4: Login as Non-Teacher Student & Verify 403
    // -----------------------------------------------------------------
    const studLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: studentUsername, password: studentPassword })
    });
    const studLoginData = await studLoginRes.json();
    const studentToken = sessionToken(studLoginRes);

    const studentForbiddenRes = await fetch(`${baseUrl}/teacher/dashboard`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    await assert('Student forbidden from accessing teacher dashboard (403)', studentForbiddenRes.status === 403);

    // -----------------------------------------------------------------
    // TEST 5: Teacher Dashboard Metrics from real DB
    // -----------------------------------------------------------------
    console.log('\n--- 3. Teacher Dashboard & Classes ---');
    const dashRes = await fetch(`${baseUrl}/teacher/dashboard`, {
      headers: { Cookie: `hspsms_session=${teacherToken}` }
    });
    const dashData = await dashRes.json();
    await assert('Dashboard returns 200', dashRes.status === 200);
    await assert('Dashboard assignedSections >= 1', dashData?.data?.overview?.assignedSections >= 1);
    await assert('Dashboard assignedClasses >= 4', dashData?.data?.overview?.assignedClasses >= 4);
    await assert('Assigned classes list populated from DB', dashData?.data?.assignedClasses?.length >= 4);
    await assert('Timetable entries loaded from DB', dashData?.data?.timetable?.length >= 1);
    await assert('Announcements loaded from DB', dashData?.data?.announcements?.length >= 1);

    // -----------------------------------------------------------------
    // TEST 6: Get Section Students (Roster)
    // -----------------------------------------------------------------
    const rosterRes = await fetch(`${baseUrl}/teacher/classes/1/students`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const rosterData = await rosterRes.json();
    await assert('Roster for Section 1 returns 200', rosterRes.status === 200);
    await assert('15 enrolled students returned', rosterData?.data?.length === 15);
    await assert('First student is Hana Bekele', rosterData?.data[0]?.first_name === 'Hana');

    // -----------------------------------------------------------------
    // TEST 7: Cross-Teacher Record-Level Security Check
    // -----------------------------------------------------------------
    console.log('\n--- 4. Record-Level Scope & Isolation ---');
    const otherLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: otherTeacherUsername, password: otherTeacherPassword })
    });
    const otherLoginData = await otherLoginRes.json();
    const otherTeacherToken = sessionToken(otherLoginRes);

    // t.other tries to access Section 1 (assigned to Elias, not Abebe)
    const crossAccessRes = await fetch(`${baseUrl}/teacher/classes/1/students`, {
      headers: { Authorization: `Bearer ${otherTeacherToken}` }
    });
    await assert('Teacher forbidden from accessing unassigned section (403)', crossAccessRes.status === 403);

    // -----------------------------------------------------------------
    // TEST 8: Attendance Recording (Transaction, DB Persistence)
    // -----------------------------------------------------------------
    console.log('\n--- 5. Attendance Recording Workflow ---');
    const today = new Date().toISOString().split('T')[0];

    // Submit attendance for Section 1
    const attPayload = {
      sectionId: 1,
      attendanceDate: today,
      subjectId: 1,
      status: 'submitted',
      records: [
        { enrollmentId: 1, statusCode: 'present' },
        { enrollmentId: 2, statusCode: 'absent', note: 'Sick' },
        { enrollmentId: 3, statusCode: 'late', note: 'Bus delay' },
        { enrollmentId: 4, statusCode: 'excused', note: 'Permission' },
        { enrollmentId: 5, statusCode: 'present' }
      ]
    };

    const attRecordRes = await fetch(`${baseUrl}/attendance/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify(attPayload)
    });
    const attRecordData = await attRecordRes.json();
    await assert('Attendance record persists to MySQL (200)', attRecordRes.status === 200);
    await assert('Session created and records linked', attRecordData?.data?.records?.length >= 5);

    // Retrieve attendance session from DB
    const getAttRes = await fetch(`${baseUrl}/attendance/session?sectionId=1&date=${today}`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const getAttData = await getAttRes.json();
    await assert('Retrieve saved attendance session from DB (200)', getAttRes.status === 200);
    await assert('Student 1 marked present in DB', getAttData?.data?.records?.find((r: any) => r.enrollment_id === 1)?.status_code === 'present');
    await assert('Student 2 marked absent in DB', getAttData?.data?.records?.find((r: any) => r.enrollment_id === 2)?.status_code === 'absent');

    // Reject invalid enrollment
    const badAttRes = await fetch(`${baseUrl}/attendance/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        sectionId: 1,
        attendanceDate: today,
        status: 'submitted',
        records: [{ enrollmentId: 99999, statusCode: 'present' }]
      })
    });
    await assert('Attendance rejected for invalid student enrollment (422)', badAttRes.status === 422);

    // -----------------------------------------------------------------
    // TEST 9: Assessment & Marks Lifecycle
    // -----------------------------------------------------------------
    console.log('\n--- 6. Assessment & Marks Validation Lifecycle ---');
    const assTypesRes = await fetch(`${baseUrl}/assessments/types`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const assTypesData = await assTypesRes.json();
    await assert('Assessment types retrieved from DB (200)', assTypesRes.status === 200 && assTypesData?.data?.length > 0);

    const assessmentsRes = await fetch(`${baseUrl}/assessments`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const assessmentsData = await assessmentsRes.json();
    await assert('Teacher assessments retrieved from DB', assessmentsRes.status === 200 && assessmentsData?.data?.length >= 1);
    const targetAssessment = assessmentsData.data.find((a: any) => a.id === 1) || assessmentsData.data[0];
    const assessmentId = targetAssessment.id;
    const maxScore = Number(targetAssessment.max_score); // 30.00

    // Reject mark exceeding max score (> 30)
    const exceedMarkRes = await fetch(`${baseUrl}/assessments/${assessmentId}/marks`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        status: 'draft',
        marks: [{ enrollmentId: 1, score: 35.0, feedback: 'Too high' }]
      })
    });
    const exceedData = await exceedMarkRes.json();
    await assert('Reject mark exceeding max_score (422 MARK_OUT_OF_RANGE)', exceedMarkRes.status === 422 && exceedData?.error?.code === 'MARK_OUT_OF_RANGE');

    // Reject negative mark (< 0)
    const negativeMarkRes = await fetch(`${baseUrl}/assessments/${assessmentId}/marks`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        status: 'draft',
        marks: [{ enrollmentId: 1, score: -5.0 }]
      })
    });
    await assert('Reject negative mark (422 NEGATIVE_SCORE)', negativeMarkRes.status === 422);

    // Save valid marks as Draft
    const validMarks = [
      { enrollmentId: 1, score: 27.5, feedback: 'Excellent grasp of mechanics' },
      { enrollmentId: 2, score: 24.0, feedback: 'Good conceptual grasp' },
      { enrollmentId: 3, score: 18.0, feedback: 'Needs revision' }
    ];

    const saveMarksRes = await fetch(`${baseUrl}/assessments/${assessmentId}/marks`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        status: 'draft',
        marks: validMarks
      })
    });
    await assert('Save marks draft successfully (200)', saveMarksRes.status === 200);

    // Verify marks retrieved from MySQL
    const getMarksRes = await fetch(`${baseUrl}/assessments/${assessmentId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const getMarksData = await getMarksRes.json();
    await assert('Retrieve saved marks from DB', getMarksRes.status === 200);
    const m1 = getMarksData.data.marks.find((m: any) => m.enrollment_id === 1);
    await assert('Mark score matches saved value (27.50)', parseFloat(m1?.score) === 27.5);
    await assert('Feedback matches saved value', m1?.feedback === 'Excellent grasp of mechanics');

    // Submit marks for approval
    const submitMarksRes = await fetch(`${baseUrl}/assessments/${assessmentId}/marks`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`
      },
      body: JSON.stringify({
        status: 'submitted',
        marks: validMarks
      })
    });
    await assert('Submit marks for approval workflow (200)', submitMarksRes.status === 200);

    // -----------------------------------------------------------------
    // TEST 9: Teacher Subjects & Academic Years & Terms
    // -----------------------------------------------------------------
    console.log('\n--- 7. Teacher Subjects, Academic Years & Terms ---');
    const subjRes = await fetch(`${baseUrl}/teacher/subjects`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const subjData = await subjRes.json();
    await assert('Teacher subjects fetched successfully (200)', subjRes.status === 200);
    await assert('Teacher assigned Physics subject', subjData?.data?.some((s: any) => s.code === 'PHY' && s.name === 'Physics'));

    const ayRes = await fetch(`${baseUrl}/teacher/academic-years`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const ayData = await ayRes.json();
    await assert('Academic years retrieved from DB', ayRes.status === 200 && ayData?.data?.length >= 1);
    const currentAyId = ayData.data[0].id;

    const termsRes = await fetch(`${baseUrl}/teacher/terms?academicYearId=${currentAyId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const termsData = await termsRes.json();
    await assert('Terms retrieved for academic year', termsRes.status === 200 && termsData?.data?.length >= 1);

    // -----------------------------------------------------------------
    // TEST 10: Filter Assessments by Subject & Section
    // -----------------------------------------------------------------
    console.log('\n--- 8. Assessment List Filtering ---');
    const filterAssRes = await fetch(`${baseUrl}/assessments?subjectId=1&sectionId=1`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const filterAssData = await filterAssRes.json();
    await assert('Filtered assessments query returns 200', filterAssRes.status === 200);
    await assert('Assessments returned for Subject 1 & Section 1', filterAssData?.data?.length >= 1);
    await assert('Returned assessment is Physics in Section 1', filterAssData?.data[0]?.subject_id === 1 && filterAssData?.data[0]?.section_id === 1);

    // -----------------------------------------------------------------
    // TEST 11: Teacher Reports Generation
    // -----------------------------------------------------------------
    console.log('\n--- 9. Teacher Reports Generation ---');

    // A. Student Attendance Report
    const attRepRes = await fetch(`${baseUrl}/teacher/reports/attendance?sectionId=1`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const attRepData = await attRepRes.json();
    await assert('Attendance Report returns 200', attRepRes.status === 200);
    await assert('Attendance Report contains enrolled students', attRepData?.data?.records?.length === 15);
    await assert('Attendance Report calculates attendance percentage', typeof attRepData?.data?.records[0]?.attendancePercentage === 'number');

    // B. Assessment Marks Report
    const marksRepRes = await fetch(`${baseUrl}/teacher/reports/marks?sectionId=1&subjectId=1`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const marksRepData = await marksRepRes.json();
    await assert('Marks Report returns 200', marksRepRes.status === 200);
    await assert('Marks Report contains records', marksRepData?.data?.records?.length >= 1);
    await assert('Marks Report has percentage calculation', typeof marksRepData?.data?.records[0]?.percentage === 'number');

    // C. Class Performance Report
    const classPerfRes = await fetch(`${baseUrl}/teacher/reports/class-performance?sectionId=1&subjectId=1`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const classPerfData = await classPerfRes.json();
    await assert('Class Performance Report returns 200', classPerfRes.status === 200);
    await assert('Class Performance Report has average score & grade distribution', 
      classPerfData?.data?.assessments?.length >= 1 && 
      typeof classPerfData?.data?.assessments[0]?.gradeDistribution?.excellent === 'number'
    );

    // D. Student Performance Report
    const studPerfRes = await fetch(`${baseUrl}/teacher/reports/student-performance?sectionId=1&studentId=1`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const studPerfData = await studPerfRes.json();
    await assert('Student Performance Report returns 200', studPerfRes.status === 200);
    await assert('Student Performance Report returns student profile & assessments', studPerfData?.data?.student?.admission_no === 'HS-2026-0001');

    // E. Assessment Summary Report
    const assSummRes = await fetch(`${baseUrl}/teacher/reports/assessment-summary?sectionId=1`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    const assSummData = await assSummRes.json();
    await assert('Assessment Summary Report returns 200', assSummRes.status === 200);
    await assert('Assessment Summary Report contains assessments list', assSummData?.data?.assessments?.length >= 1);

    // -----------------------------------------------------------------
    // TEST 12: Security - Other Teacher cannot access Section 1 reports
    // -----------------------------------------------------------------
    console.log('\n--- 10. Report Security Authorization ---');
    const unauthorizedRepRes = await fetch(`${baseUrl}/teacher/reports/attendance?sectionId=1`, {
      headers: { Authorization: `Bearer ${otherTeacherToken}` }
    });
    await assert('Unauthorized teacher rejected from section report (403)', unauthorizedRepRes.status === 403);

    // -----------------------------------------------------------------
    // TEST 13: Administrator Dashboard & Operations
    // -----------------------------------------------------------------
    console.log('\n--- 11. Administrator Module Tests ---');
    const adminLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUsername, password: adminPassword })
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = sessionToken(adminLoginRes);
    await assert('Admin login succeeds (200)', adminLoginRes.status === 200 && !!adminToken);

    const adminDashRes = await fetch(`${baseUrl}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminDashData = await adminDashRes.json();
    await assert('Admin dashboard returns 200', adminDashRes.status === 200);
    await assert('Admin dashboard has student metrics', adminDashData?.data?.overview?.students?.total >= 15);
    await assert('Admin dashboard has staff metrics', adminDashData?.data?.overview?.staff?.total >= 2);
    await assert('Admin dashboard has academic overview', adminDashData?.data?.overview?.academic?.totalSections >= 4);

    // Academic configuration pages: Grade 9–10 common curriculum, admin access,
    // and server-side validation for lesson periods and assessment activities.
    const academicStructureRes = await fetch(`${baseUrl}/admin/academic-structure`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const academicStructureData = await academicStructureRes.json();
    const grades9and10 = (academicStructureData?.data?.grades || []).filter((grade: any) => [9, 10].includes(Number(grade.grade_level)));
    await assert('Admin academic structure returns Grades 9–10 as non-streamed common grades',
      academicStructureRes.status === 200 && grades9and10.length === 2 && grades9and10.every((grade: any) => Number(grade.has_streams) === 0));

    const assessmentOptionsRes = await fetch(`${baseUrl}/admin/assessment-configuration-options`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const assessmentOptionsData = await assessmentOptionsRes.json();
    await assert('Admin assessment configuration options are database-backed',
      assessmentOptionsRes.status === 200 && Array.isArray(assessmentOptionsData?.data?.assignments) && Array.isArray(assessmentOptionsData?.data?.terms) && Array.isArray(assessmentOptionsData?.data?.types));

    const nonAdminAcademicRes = await fetch(`${baseUrl}/admin/academic-structure`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    await assert('Student cannot access administrator academic configuration (403)', nonAdminAcademicRes.status === 403);

    const invalidGrade9StreamRes = await fetch(`${baseUrl}/admin/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        gradeId: grades9and10.find((grade: any) => Number(grade.grade_level) === 9)?.id,
        academicYearId: academicStructureData?.data?.academicYears?.[0]?.id,
        name: 'Validation Only', stream: 'natural_science', capacity: 40
      })
    });
    const invalidGrade9StreamData = await invalidGrade9StreamRes.json();
    await assert('Grade 9 rejects Natural/Social section stream (400)', invalidGrade9StreamRes.status === 400 && invalidGrade9StreamData?.error?.code === 'GRADE_STREAM_MISMATCH');

    const invalidTimeSlotRes = await fetch(`${baseUrl}/admin/time-slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ dayOfWeek: 1, label: 'Invalid validation period', startTime: '10:00', endTime: '09:00' })
    });
    await assert('Administrator lesson period rejects reversed times (400)', invalidTimeSlotRes.status === 400);

    const invalidAssessmentRes = await fetch(`${baseUrl}/admin/assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({})
    });
    await assert('Administrator assessment endpoint validates required configuration (400)', invalidAssessmentRes.status === 400);

    const adminUsersRes = await fetch(`${baseUrl}/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminUsersData = await adminUsersRes.json();
    await assert('Admin users list returns 200', adminUsersRes.status === 200 && adminUsersData?.data?.length >= 4);

    // Admin registers new user account
    const uniqueUserSuffix = Math.floor(1000 + Math.random() * 9000);
    const newAdminUserRes = await fetch(`${baseUrl}/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        username: `new.staff.${uniqueUserSuffix}`,
        email: `new.staff.${uniqueUserSuffix}@school.et`,
        phone: '+251911000111',
        password: 'SecurePass#2026',
        roleCode: 'teacher'
      })
    });
    const newAdminUserData = await newAdminUserRes.json();
    await assert('Admin creates new user account (201)', newAdminUserRes.status === 201 && newAdminUserData?.data?.id > 0);

    const newLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `new.staff.${uniqueUserSuffix}`, password: 'SecurePass#2026' })
    });
    const newAdminUserToken = sessionToken(newLoginRes);
    await assert('Newly created account authenticates through a session cookie (200)', newLoginRes.status === 200 && !!newAdminUserToken);

    const adminAuditRes = await fetch(`${baseUrl}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminAuditData = await adminAuditRes.json();
    await assert('Admin audit logs return 200', adminAuditRes.status === 200 && Array.isArray(adminAuditData?.data));

    // Admin Page 9: School Settings
    const getSettingsRes = await fetch(`${baseUrl}/admin/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const settingsData = await getSettingsRes.json();
    await assert('Admin GET /settings returns 200', getSettingsRes.status === 200 && Array.isArray(settingsData?.data));

    const updateSettingRes = await fetch(`${baseUrl}/admin/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ key: 'test.verification_marker', value: 'verified_active_2026' })
    });
    await assert('Admin PUT /settings persists setting (200)', updateSettingRes.status === 200);

    const recheckSettingsRes = await fetch(`${baseUrl}/admin/settings`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const recheckSettingsData = await recheckSettingsRes.json();
    const foundMarker = recheckSettingsData?.data?.some((s: any) => s.setting_key === 'test.verification_marker');
    await assert('Admin updated setting is readable in DB', foundMarker);

    // Admin Page 10: Profile & Security
    const getProfileRes = await fetch(`${baseUrl}/admin/profile`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const profileData = await getProfileRes.json();
    await assert('Admin GET /profile returns 200', getProfileRes.status === 200 && profileData?.data?.username === adminUsername);

    const updateProfileRes = await fetch(`${baseUrl}/admin/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ phone: '+251911999888', email: 'admin@school.edu.et' })
    });
    await assert('Admin PUT /profile updates contact info (200)', updateProfileRes.status === 200);

    // Password change validation
    const badPassRes = await fetch(`${baseUrl}/admin/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ currentPassword: 'WrongPassword!', newPassword: 'NewSecurePass#2026' })
    });
    await assert('Password change fails with wrong current password (400)', badPassRes.status === 400);

    const shortPassRes = await fetch(`${baseUrl}/admin/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ currentPassword: adminPassword, newPassword: '123' })
    });
    await assert('Password change fails with password shorter than 6 chars (400)', shortPassRes.status === 400);

    const goodPassRes = await fetch(`${baseUrl}/admin/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ currentPassword: adminPassword, newPassword: 'TempAdminPass#2026' })
    });
    await assert('Password change succeeds with valid credentials (200)', goodPassRes.status === 200);

    // Revert password back so system tests continue to be fully idempotent
    const revertPassRes = await fetch(`${baseUrl}/admin/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ currentPassword: 'TempAdminPass#2026', newPassword: adminPassword })
    });
    await assert('Password reverted cleanly back to AdminPass#2026 (200)', revertPassRes.status === 200);

    // --- Package 6: Security Administration Tests ---
    const sessionsRes = await fetch(`${baseUrl}/admin/security/sessions`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sessionsData = await sessionsRes.json();
    await assert('Admin GET /security/sessions returns 200', sessionsRes.status === 200 && Array.isArray(sessionsData?.data));

    const loginAttemptsRes = await fetch(`${baseUrl}/admin/security/login-attempts`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const loginAttemptsData = await loginAttemptsRes.json();
    await assert('Admin GET /security/login-attempts returns 200', loginAttemptsRes.status === 200 && Array.isArray(loginAttemptsData?.data?.attempts));

    const roleMatrixRes = await fetch(`${baseUrl}/admin/security/role-permissions`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const roleMatrixData = await roleMatrixRes.json();
    await assert('Admin GET /security/role-permissions returns 200', roleMatrixRes.status === 200 && !!roleMatrixData?.data?.matrix);

    const modifyAdminRoleRes = await fetch(`${baseUrl}/admin/security/roles/1/permissions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ permissionIds: [] })
    });
    await assert('System Administrator role permissions are immutable (403)', modifyAdminRoleRes.status === 403);

    const adminUserId = adminLoginData?.data?.user?.id;
    // Temporarily isolate adminUserId as the sole active system_admin to test last-admin protection
    const [otherActiveAdmins]: any = await pool.query(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = 'system_admin' AND u.status = 'active' AND u.id != ?`,
      [adminUserId]
    );
    const otherAdminIds = otherActiveAdmins.map((r: any) => r.id);
    if (otherAdminIds.length > 0) {
      await pool.query(`UPDATE users SET status = 'disabled' WHERE id IN (?)`, [otherAdminIds]);
    }

    const deactivateLastAdminRes = await fetch(`${baseUrl}/admin/users/${adminUserId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'disabled' })
    });
    await assert('Last active administrator cannot be deactivated (403)', deactivateLastAdminRes.status === 403);

    const demoteLastAdminRes = await fetch(`${baseUrl}/admin/users/${adminUserId}/roles`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ roleCodes: ['teacher'] })
    });
    await assert('Last active administrator role cannot be demoted (403)', demoteLastAdminRes.status === 403);

    // Restore other active admins
    if (otherAdminIds.length > 0) {
      await pool.query(`UPDATE users SET status = 'active' WHERE id IN (?)`, [otherAdminIds]);
    }

    // Auth endpoint: change-password for authenticated user
    const userChangePassRes = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${newAdminUserToken}` },
      body: JSON.stringify({ currentPassword: 'SecurePass#2026', newPassword: 'UpdatedUserPass#2026' })
    });
    await assert('User can update password and clear must_change_password via /auth/change-password (200)', userChangePassRes.status === 200);

    // Admin Page 8: Communications
    const commsRes = await fetch(`${baseUrl}/admin/announcements`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const commsData = await commsRes.json();
    await assert('Admin GET /announcements returns 200', commsRes.status === 200 && Array.isArray(commsData?.data));

    const publishAnnouncementRes = await fetch(`${baseUrl}/admin/announcements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ title: `Publish test ${Date.now()}`, content: 'Announcement publication integration check.', targetRole: 'student', status: 'published' })
    });
    const publishAnnouncementData = await publishAnnouncementRes.json();
    await assert('Admin publishes a targeted student announcement (201)', publishAnnouncementRes.status === 201 && publishAnnouncementData?.data?.status === 'published');
    const [announcementAudienceRows]: any = await pool.query(
      `SELECT r.code FROM announcement_targets t JOIN roles r ON r.id = t.target_id
       WHERE t.announcement_id = ? AND t.target_type = 'role'`,
      [publishAnnouncementData?.data?.id]
    );
    await assert('Published announcement persists its selected audience role', announcementAudienceRows?.[0]?.code === 'student');

    // -----------------------------------------------------------------
    // PACKAGE 5: DISASTER RECOVERY, RECYCLE BIN, & SYSTEM HEALTH
    // -----------------------------------------------------------------
    const createBackupRes = await fetch(`${baseUrl}/admin/backups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ type: 'manual', notes: 'Automated test suite snapshot' })
    });
    const createBackupData = await createBackupRes.json();
    await assert('Admin POST /backups creates snapshot with SHA-256 checksum (201)', createBackupRes.status === 201 && !!createBackupData?.data?.checksum);

    const backupId = createBackupData?.data?.id;
    const listBackupsRes = await fetch(`${baseUrl}/admin/backups`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const listBackupsData = await listBackupsRes.json();
    await assert('Admin GET /backups returns backup archives (200)', listBackupsRes.status === 200 && Array.isArray(listBackupsData?.data) && listBackupsData?.data?.some((b: any) => b.id === backupId));

    const verifyChecksumRes = await fetch(`${baseUrl}/admin/backups/${backupId}/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const verifyChecksumData = await verifyChecksumRes.json();
    await assert('Admin POST /backups/:id/verify verifies file integrity (200)', verifyChecksumRes.status === 200 && verifyChecksumData?.data?.valid === true);

    const recycleBinRes = await fetch(`${baseUrl}/admin/recycle-bin`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const recycleBinData = await recycleBinRes.json();
    await assert('Admin GET /recycle-bin returns soft-deleted items (200)', recycleBinRes.status === 200 && Array.isArray(recycleBinData?.data?.items));

    const diagRes = await fetch(`${baseUrl}/admin/health/diagnostics`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const diagData = await diagRes.json();
    await assert('Admin GET /health/diagnostics returns telemetry (200)', diagRes.status === 200 && diagData?.data?.database?.status === 'connected');

    const studentBackupRes = await fetch(`${baseUrl}/admin/backups`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    await assert('Student rejected from backups archive (403)', studentBackupRes.status === 403);

    // RBAC: Non-admin users forbidden from administrative operations
    const studentUnauthAdmin = await fetch(`${baseUrl}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    await assert('Student rejected from admin dashboard (403)', studentUnauthAdmin.status === 403);

    const studentUnauthSettings = await fetch(`${baseUrl}/admin/settings`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    await assert('Student rejected from admin settings (403)', studentUnauthSettings.status === 403);

    const teacherUnauthProfile = await fetch(`${baseUrl}/admin/profile`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    await assert('Teacher rejected from admin profile (403)', teacherUnauthProfile.status === 403);

    // -----------------------------------------------------------------
    // PACKAGE 3: APPROVALS QUEUE TESTS
    // -----------------------------------------------------------------
    console.log('\n--- Package 3: Approvals Queue Tests ---');
    // 1. Summary
    const approvalsSummaryRes = await fetch(`${baseUrl}/admin/approvals/summary`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const approvalsSummaryData = await approvalsSummaryRes.json();
    await assert('GET /admin/approvals/summary returns 200', approvalsSummaryRes.status === 200 && typeof approvalsSummaryData?.data?.totalPending === 'number');

    // 2. Create approval request
    const createApprovalRes = await fetch(`${baseUrl}/admin/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        type: 'result_unlock',
        entityType: 'assessment',
        entityId: 1,
        oldValue: { is_locked: 1, status: 'locked' },
        newValue: { is_locked: 0, status: 'draft' },
        reason: 'Teacher submitted wrong score for Midterm Exam'
      })
    });
    const createApprovalData = await createApprovalRes.json();
    const newApprovalId = createApprovalData?.data?.id;
    await assert('POST /admin/approvals creates request (201)', createApprovalRes.status === 201 && !!newApprovalId);

    // 3. List approvals
    const listApprovalsRes = await fetch(`${baseUrl}/admin/approvals?status=pending`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const listApprovalsData = await listApprovalsRes.json();
    await assert('GET /admin/approvals returns list (200)', listApprovalsRes.status === 200 && Array.isArray(listApprovalsData?.data?.items));

    // 4. Get approval by ID
    const getApprovalRes = await fetch(`${baseUrl}/admin/approvals/${newApprovalId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const getApprovalData = await getApprovalRes.json();
    await assert('GET /admin/approvals/:id returns detail (200)', getApprovalRes.status === 200 && getApprovalData?.data?.id === newApprovalId && getApprovalData?.data?.reason.includes('Teacher submitted wrong score'));

    // 5. Decide approval (approve)
    const approveRes = await fetch(`${baseUrl}/admin/approvals/${newApprovalId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        action: 'approve',
        decisionNote: 'Granted unlock for 24 hours to correct assessment marks.'
      })
    });
    const approveData = await approveRes.json();
    await assert('POST /admin/approvals/:id/decide approves request (200)', approveRes.status === 200 && approveData?.data?.approval?.status === 'approved');

    // 6. Create another approval and reject it
    const createRejectRes = await fetch(`${baseUrl}/admin/approvals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        type: 'fee_waiver',
        entityType: 'invoice',
        entityId: 1,
        oldValue: { discount_percent: 0 },
        newValue: { discount_percent: 100 },
        reason: 'Requested full scholarship waiver'
      })
    });
    const rejectApprovalId = (await createRejectRes.json())?.data?.id;
    const decideRejectRes = await fetch(`${baseUrl}/admin/approvals/${rejectApprovalId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        action: 'reject',
        decisionNote: 'Insufficient documentation provided for full fee waiver.'
      })
    });
    const decideRejectData = await decideRejectRes.json();
    await assert('POST /admin/approvals/:id/decide rejects request (200)', decideRejectRes.status === 200 && decideRejectData?.data?.approval?.status === 'rejected');

    // 7. RBAC: Student cannot decide approvals
    const studentUnauthDecide = await fetch(`${baseUrl}/admin/approvals/${newApprovalId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${studentToken}` },
      body: JSON.stringify({ action: 'approve' })
    });
    await assert('Student forbidden from deciding approvals (403)', studentUnauthDecide.status === 403);

    // -----------------------------------------------------------------
    // PACKAGE 1: FINANCE & FEES TESTS
    // -----------------------------------------------------------------
    console.log('\n--- Package 1: Finance & Fees Tests ---');
    // 1. Overview & Metrics
    const finOverviewRes = await fetch(`${baseUrl}/admin/finance/overview`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const finOverviewData = await finOverviewRes.json();
    await assert('GET /admin/finance/overview returns 200', finOverviewRes.status === 200 && typeof finOverviewData?.data?.totalInvoiced === 'number');
    await assert('Finance metrics include collection rate', typeof finOverviewData?.data?.collectionRate === 'number');

    // 2. Fee Categories
    const feeCatRes = await fetch(`${baseUrl}/admin/finance/fee-categories`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const feeCatData = await feeCatRes.json();
    await assert('GET /admin/finance/fee-categories returns 200', feeCatRes.status === 200 && Array.isArray(feeCatData?.data));

    // 3. Fee Structure Creation & Listing
    await pool.query('DELETE FROM fee_structures WHERE academic_year_id = 3 AND grade_id = 1 AND fee_category_id = 1');
    const createFeeStructRes = await fetch(`${baseUrl}/admin/finance/fee-structures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        academic_year_id: 3,
        grade_id: 1,
        fee_category_id: 1,
        amount: 4500,
        due_date: '2026-12-31'
      })
    });
    const createFeeStructData = await createFeeStructRes.json();
    await assert('POST /admin/finance/fee-structures creates structure (201)', createFeeStructRes.status === 201 && !!createFeeStructData?.data?.id);

    const feeStructRes = await fetch(`${baseUrl}/admin/finance/fee-structures`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const feeStructData = await feeStructRes.json();
    await assert('GET /admin/finance/fee-structures returns 200', feeStructRes.status === 200 && Array.isArray(feeStructData?.data));

    // 4. Invoices: Create Invoice
    const createInvRes = await fetch(`${baseUrl}/admin/finance/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        student_id: 1,
        academic_year_id: 3,
        due_date: '2026-11-30',
        notes: 'Semester 1 Tuition & Lab Fees',
        items: [
          { fee_category_id: 1, description: 'Semester 1 Tuition', quantity: 1, unit_amount: 3500 },
          { fee_category_id: 2, description: 'Science Lab Fee', quantity: 1, unit_amount: 500 }
        ]
      })
    });
    const createInvData = await createInvRes.json();
    const testInvoiceId = createInvData?.data?.id;
    await assert('POST /admin/finance/invoices creates invoice (201)', createInvRes.status === 201 && !!testInvoiceId && String(createInvData?.data?.invoice_no).startsWith('INV-'));

    // 5. Invoices: List & Details
    const listInvRes = await fetch(`${baseUrl}/admin/finance/invoices?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const listInvData = await listInvRes.json();
    await assert('GET /admin/finance/invoices returns paginated list (200)', listInvRes.status === 200 && Array.isArray(listInvData?.data?.items));

    const getInvRes = await fetch(`${baseUrl}/admin/finance/invoices/${testInvoiceId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const getInvData = await getInvRes.json();
    await assert('GET /admin/finance/invoices/:id returns invoice details (200)', getInvRes.status === 200 && getInvData?.data?.items?.length === 2 && Number(getInvData?.data?.total_amount) === 4000);

    // 6. Payments: Record Payment and Auto-Allocate
    const finStamp = Date.now();
    const createPayRes = await fetch(`${baseUrl}/admin/finance/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        student_id: 1,
        invoice_id: testInvoiceId,
        amount: 2000,
        method: 'telebirr',
        reference: `TB-TEST-${finStamp}`,
        payer_name: 'Ato Bekele (Guardian)',
        notes: 'Partial payment via Telebirr'
      })
    });
    const createPayData = await createPayRes.json();
    await assert('POST /admin/finance/payments records transaction (201)', createPayRes.status === 201 && String(createPayData?.data?.receipt_no).startsWith('RCT-'));

    // Verify invoice is now partially paid
    const updatedInvRes = await fetch(`${baseUrl}/admin/finance/invoices/${testInvoiceId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const updatedInvData = await updatedInvRes.json();
    await assert('Invoice status is partially_paid with ETB 2000 balance', updatedInvRes.status === 200 && updatedInvData?.data?.status === 'partially_paid' && Number(updatedInvData?.data?.balance) === 2000);

    // Settle the remainder (ETB 2000)
    const settlePayRes = await fetch(`${baseUrl}/admin/finance/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        student_id: 1,
        invoice_id: testInvoiceId,
        amount: 2000,
        method: 'cbe_birr',
        reference: `CBE-TEST-${finStamp}`,
        payer_name: 'Ato Bekele'
      })
    });
    await assert('Second payment recorded successfully (201)', settlePayRes.status === 201);

    const paidInvRes = await fetch(`${baseUrl}/admin/finance/invoices/${testInvoiceId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const paidInvData = await paidInvRes.json();
    await assert('Invoice status transitions to paid when fully settled', paidInvRes.status === 200 && paidInvData?.data?.status === 'paid' && Number(paidInvData?.data?.balance) === 0);

    // 7. Scholarships & Waivers
    const createScholarshipRes = await fetch(`${baseUrl}/admin/finance/scholarships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        student_id: 2,
        fee_category_id: 1,
        award_type: 'percentage',
        value: 50,
        reason: 'Academic Merit Scholarship Top 1%'
      })
    });
    const createScholarshipData = await createScholarshipRes.json();
    await assert('POST /admin/finance/scholarships awards waiver (201)', createScholarshipRes.status === 201 && !!createScholarshipData?.data?.id);

    const listScholarshipsRes = await fetch(`${baseUrl}/admin/finance/scholarships`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const listScholarshipsData = await listScholarshipsRes.json();
    await assert('GET /admin/finance/scholarships returns list (200)', listScholarshipsRes.status === 200 && Array.isArray(listScholarshipsData?.data));

    // 8. Void Invoice Workflow
    const voidInvToCancelRes = await fetch(`${baseUrl}/admin/finance/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        student_id: 2,
        academic_year_id: 1,
        due_date: '2026-12-15',
        notes: 'Invoice to be cancelled',
        items: [{ fee_category_id: 1, description: 'Test Item', quantity: 1, unit_amount: 1000 }]
      })
    });
    const voidInvId = (await voidInvToCancelRes.json())?.data?.id;
    const voidActionRes = await fetch(`${baseUrl}/admin/finance/invoices/${voidInvId}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ reason: 'Issued in error by registrar' })
    });
    const voidActionData = await voidActionRes.json();
    await assert('POST /admin/finance/invoices/:id/void cancels invoice (200)', voidActionRes.status === 200 && voidActionData?.data?.invoice?.status === 'voided');

    // 9. RBAC: Student cannot access finance overview
    const studentUnauthFinance = await fetch(`${baseUrl}/admin/finance/overview`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    await assert('Student forbidden from accessing finance overview (403)', studentUnauthFinance.status === 403);

    // -----------------------------------------------------------------
    // TEST 14: Student Dashboard & Records
    // -----------------------------------------------------------------
    console.log('\n--- 12. Student Module Tests ---');
    const studentDashRes = await fetch(`${baseUrl}/student/dashboard`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const studentDashData = await studentDashRes.json();
    await assert('Student dashboard returns 200', studentDashRes.status === 200);
    await assert('Student profile belongs to Hana Bekele', studentDashData?.data?.profile?.admission_no === 'HS-2026-0001');
    await assert('Student timetable loaded', studentDashData?.data?.timetable?.length >= 1);
    await assert('Student attendance summary loaded', typeof studentDashData?.data?.attendance?.summary?.rate === 'number');

    // RBAC: Teacher cannot access Student dashboard
    const teacherUnauthStudent = await fetch(`${baseUrl}/student/dashboard`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    await assert('Teacher rejected from student dashboard (403)', teacherUnauthStudent.status === 403);

    // -----------------------------------------------------------------
    // TEST 15: Librarian Dashboard & Operations
    // -----------------------------------------------------------------
    console.log('\n--- 13. Librarian Module Tests ---');
    const libLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: librarianUsername, password: librarianPassword })
    });
    const libLoginData = await libLoginRes.json();
    const libToken = sessionToken(libLoginRes);
    await assert('Librarian login succeeds (200)', libLoginRes.status === 200 && !!libToken);

    const libDashRes = await fetch(`${baseUrl}/librarian/dashboard`, {
      headers: { Authorization: `Bearer ${libToken}` }
    });
    const libDashData = await libDashRes.json();
    await assert('Librarian dashboard returns 200', libDashRes.status === 200);
    await assert('Librarian catalog has books', libDashData?.data?.metrics?.totalBooks >= 5);
    await assert('Librarian has copies tracked', libDashData?.data?.metrics?.totalCopies >= 5);

    const libBooksRes = await fetch(`${baseUrl}/librarian/books`, {
      headers: { Authorization: `Bearer ${libToken}` }
    });
    const libBooksData = await libBooksRes.json();
    await assert('Librarian books list returns 200', libBooksRes.status === 200 && libBooksData?.data?.length >= 5);

    const libLoansRes = await fetch(`${baseUrl}/librarian/loans`, {
      headers: { Authorization: `Bearer ${libToken}` }
    });
    const libLoansData = await libLoansRes.json();
    await assert('Librarian loans list returns 200', libLoansRes.status === 200 && libLoansData?.data?.length >= 1);

    // RBAC: Student cannot access Librarian dashboard
    const studentUnauthLib = await fetch(`${baseUrl}/librarian/dashboard`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    await assert('Student rejected from librarian dashboard (403)', studentUnauthLib.status === 403);

    // -----------------------------------------------------------------
    // TEST 16: Registrar Dashboard & Operations
    // -----------------------------------------------------------------
    console.log('\n--- 14. Registrar Module Tests ---');
    const regLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: registrarUsername, password: registrarPassword })
    });
    const regLoginData = await regLoginRes.json();
    const regToken = sessionToken(regLoginRes);
    await assert('Registrar login succeeds (200)', regLoginRes.status === 200 && !!regToken);

    const regDashRes = await fetch(`${baseUrl}/registrar/dashboard`, {
      headers: { Authorization: `Bearer ${regToken}` }
    });
    const regDashData = await regDashRes.json();
    await assert('Registrar dashboard returns 200', regDashRes.status === 200);
    await assert('Registrar total enrolled students >= 15', regDashData?.data?.metrics?.totalStudents >= 15);

    const regStudentsRes = await fetch(`${baseUrl}/registrar/students`, {
      headers: { Authorization: `Bearer ${regToken}` }
    });
    const regStudentsData = await regStudentsRes.json();
    await assert('Registrar students directory returns 200', regStudentsRes.status === 200 && regStudentsData?.data?.length >= 15);

    const regSectionsRes = await fetch(`${baseUrl}/registrar/sections`, {
      headers: { Authorization: `Bearer ${regToken}` }
    });
    const regSectionsData = await regSectionsRes.json();
    await assert('Registrar sections list returns 200', regSectionsRes.status === 200 && regSectionsData?.data?.length >= 4);

    const regTransfersRes = await fetch(`${baseUrl}/registrar/transfers`, {
      headers: { Authorization: `Bearer ${regToken}` }
    });
    await assert('Registrar transfers list returns 200', regTransfersRes.status === 200);

    const regDocsRes = await fetch(`${baseUrl}/registrar/documents`, {
      headers: { Authorization: `Bearer ${regToken}` }
    });
    await assert('Registrar student documents return 200', regDocsRes.status === 200);

    // RBAC: Teacher cannot access Registrar dashboard
    const teacherUnauthReg = await fetch(`${baseUrl}/registrar/dashboard`, {
      headers: { Authorization: `Bearer ${teacherToken}` }
    });
    await assert('Teacher rejected from registrar dashboard (403)', teacherUnauthReg.status === 403);

    // -----------------------------------------------------------------
    // TEST 17: Parent Dashboard & Linked Children
    // -----------------------------------------------------------------
    console.log('\n--- 15. Parent Module Tests ---');
    const parentLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: parentUsername, password: parentPassword })
    });
    const parentLoginData = await parentLoginRes.json();
    const parentToken = sessionToken(parentLoginRes);
    await assert('Parent login succeeds (200)', parentLoginRes.status === 200 && !!parentToken);

    const parentDashRes = await fetch(`${baseUrl}/parent/dashboard`, {
      headers: { Authorization: `Bearer ${parentToken}` }
    });
    const parentDashData = await parentDashRes.json();
    await assert('Parent dashboard returns 200', parentDashRes.status === 200);
    await assert('Parent has linked children', parentDashData?.data?.children?.length >= 2);
    await assert('Hana Bekele is among linked children', parentDashData?.data?.children?.some((c: any) => c.admission_no === 'HS-2026-0001'));

    const childDetailsRes = await fetch(`${baseUrl}/parent/children/1`, {
      headers: { Authorization: `Bearer ${parentToken}` }
    });
    const childDetailsData = await childDetailsRes.json();
    await assert('Parent can access linked child 1 details', childDetailsRes.status === 200);
    await assert('Child overview contains attendance rate', typeof childDetailsData?.data?.overview?.attendance?.rate === 'number');

    // Security: Parent cannot access unlinked student (e.g. Student 10)
    const unlinkedChildRes = await fetch(`${baseUrl}/parent/children/10`, {
      headers: { Authorization: `Bearer ${parentToken}` }
    });
    await assert('Parent rejected from unlinked child records (403)', unlinkedChildRes.status === 403);

    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `hspsms_session=${teacherToken}` }
    });
    const revokedSessionRes = await fetch(`${baseUrl}/teacher/dashboard`, {
      headers: { Cookie: `hspsms_session=${teacherToken}` }
    });
    await assert('Logout revokes the server-side session', logoutRes.status === 200 && revokedSessionRes.status === 401);

    let loginRateLimitObserved = false;
    for (let attempt = 0; attempt < 15 && !loginRateLimitObserved; attempt += 1) {
      const limitedLoginRes = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: `unknown-rate-limit-${attempt}`, password: 'invalid' })
      });
      loginRateLimitObserved = limitedLoginRes.status === 429;
    }
    await assert('Repeated failed logins are rate limited', loginRateLimitObserved);
  } catch (err: any) {
    console.error('Fatal test error:', err);
  } finally {
    if (issuedTokens.length > 0) {
      const hashes = issuedTokens.map((token) => createHash('sha256').update(token).digest('hex'));
      await pool.query('DELETE FROM refresh_sessions WHERE token_hash IN (?)', [hashes]);
    }
    server.close();
    await pool.end();
  }

  // Summary
  console.log('\n======================================================');
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`📊 TEST RESULTS: ${passedCount}/${totalCount} PASSED`);
  console.log('======================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
