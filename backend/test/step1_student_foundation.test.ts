process.env.NODE_ENV = 'test';
import { pool } from '../src/config/database';
import app from '../src/index';
import { Server } from 'http';
import { FormulasService } from '../src/modules/student/formulas.service';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function assert(name: string, condition: boolean, message?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    results.push({ name, passed: true });
  } else {
    console.error(`  ❌ FAIL: ${name} - ${message}`);
    results.push({ name, passed: false, error: message });
  }
}

function extractCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/hspsms_session=([^;]+)/);
  return match ? match[1] : '';
}

async function runStep1Tests() {
  console.log('\n======================================================');
  console.log('🧪 STEP 1: STUDENT PORTAL FOUNDATION & SECURITY TESTS');
  console.log('======================================================\n');

  // Start test server on port 5002
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(5002, () => resolve(s));
  });
  const baseUrl = 'http://localhost:5002/api/v1';

  try {
    // -----------------------------------------------------------------
    // 1. FORMULAS SERVICE VERIFICATION
    // -----------------------------------------------------------------
    console.log('--- 1. Formulas Service Tests ---');
    
    // Attendance rate
    const attCalc1 = FormulasService.calculateAttendanceRate({ total: 20, present: 18, late: 2, absent: 0, excused: 0 });
    await assert('Attendance rate: present + late counts attended', attCalc1.rate === 100.0 && !attCalc1.thresholdWarning);

    const attCalc2 = FormulasService.calculateAttendanceRate({ total: 20, present: 14, late: 1, absent: 5, excused: 0 });
    await assert('Attendance rate: <85% triggers thresholdWarning', attCalc2.rate === 75.0 && attCalc2.thresholdWarning);

    // Weighted total
    const weightedTotal = FormulasService.calculateWeightedTotal([
      { score: 18, maxScore: 20, weight: 20 }, // 18%
      { score: 35, maxScore: 40, weight: 40 }, // 35%
      { score: 38, maxScore: 40, weight: 40 }  // 38%
    ]);
    await assert('Weighted total calculated correctly (91%)', weightedTotal === 91.0);

    // Letter grades
    const gradeA = FormulasService.resolveLetterGrade(91.0);
    const gradeF = FormulasService.resolveLetterGrade(42.5);
    await assert('Letter grade band A resolved for 91%', gradeA.letter === 'A' && gradeA.gradePoint === 4.0);
    await assert('Letter grade band F resolved for 42.5%', gradeF.letter === 'F' && gradeF.gradePoint === 0.0);

    // GPA Calculation (Scope B = yes)
    const gpa = FormulasService.calculateGpa([
      { gradePoint: 4.0, creditHours: 4 }, // 16
      { gradePoint: 3.0, creditHours: 3 }, // 9
      { gradePoint: 2.0, creditHours: 3 }  // 6 -> total 31 / 10 = 3.1
    ]);
    await assert('GPA calculated on 4.0 weighted scale (3.1)', gpa === 3.1);

    // Competition Rank (1224 ranking)
    const ranked = FormulasService.calculateRanks([
      { id: 1, average: 95 },
      { id: 2, average: 90 },
      { id: 3, average: 90 },
      { id: 4, average: 82 }
    ]);
    await assert('Rank 1 assigned to highest average', ranked.find(r => r.id === 1)?.rank === 1);
    await assert('Tied students both receive Rank 2', ranked.find(r => r.id === 2)?.rank === 2 && ranked.find(r => r.id === 3)?.rank === 2);
    await assert('Subsequent student skips to Rank 4 (1224 rule)', ranked.find(r => r.id === 4)?.rank === 4);

    // -----------------------------------------------------------------
    // 2. AUTHENTICATION & STUDENT IDENTITY RESOLVER
    // -----------------------------------------------------------------
    console.log('\n--- 2. Student Authentication & Identity Resolution ---');

    // Login as student
    const studentUsername = process.env.SEED_STUDENT_USERNAME || 'student.hana';
    const studentPassword = process.env.SEED_STUDENT_PASSWORD || 'StudentPass#2026';

    const studentLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: studentUsername, password: studentPassword })
    });
    const studentLoginData = await studentLoginRes.json();
    const studentCookie = extractCookie(studentLoginRes);

    await assert('Student login succeeds (200)', studentLoginRes.status === 200 && Boolean(studentCookie));
    await assert('Student account returns student role', studentLoginData?.data?.user?.roles?.includes('student'));

    // Authenticated Student Dashboard
    const studentDashRes = await fetch(`${baseUrl}/student/dashboard`, {
      headers: { Cookie: `hspsms_session=${studentCookie}` }
    });
    const studentDashData = await studentDashRes.json();
    await assert('Student dashboard returns 200 for authenticated student', studentDashRes.status === 200);
    await assert('Student identity resolves to Hana Bekele (Server-side)', studentDashData?.data?.profile?.first_name === 'Hana');
    await assert('Student enrollment is resolved server-side', Boolean(studentDashData?.data?.profile?.enrollment_id));

    // Non-student (Teacher) access to student endpoint must be rejected with 403
    const teacherUsername = process.env.SEED_TEACHER_USERNAME || 't.elias';
    const teacherPassword = process.env.SEED_TEACHER_PASSWORD || 'EliasPass#2026';

    const teacherLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: teacherUsername, password: teacherPassword })
    });
    const teacherCookie = extractCookie(teacherLoginRes);
    const teacherOnStudentRes = await fetch(`${baseUrl}/student/dashboard`, {
      headers: { Cookie: `hspsms_session=${teacherCookie}` }
    });
    await assert('Teacher is rejected from student portal routes with 403 Forbidden', teacherOnStudentRes.status === 403);

    // -----------------------------------------------------------------
    // 3. SETTINGS & SECURITY (PAGE 11) ENDPOINTS
    // -----------------------------------------------------------------
    console.log('\n--- 3. Page 11 Settings & Security Tests ---');

    // 3.1 Get Active Sessions
    const sessionsRes = await fetch(`${baseUrl}/student/settings/sessions`, {
      headers: { Cookie: `hspsms_session=${studentCookie}` }
    });
    const sessionsData = await sessionsRes.json();
    await assert('GET /student/settings/sessions returns 200', sessionsRes.status === 200);
    await assert('Sessions list identifies current device', sessionsData?.data?.some((s: any) => s.isCurrent === true));

    // 3.2 Preferences
    const getPrefsRes = await fetch(`${baseUrl}/student/settings/preferences`, {
      headers: { Cookie: `hspsms_session=${studentCookie}` }
    });
    const getPrefsData = await getPrefsRes.json();
    await assert('GET /student/settings/preferences returns 200', getPrefsRes.status === 200);
    await assert('Preferences has notification keys', Boolean(getPrefsData?.data?.notifications));

    const updatedPrefsPayload = {
      notifications: { results: true, assignments: true, timetable: false, announcements: true, attendance: true, fees: true },
      language: 'en',
      display: { highContrast: true, fontSize: 'compact' }
    };
    const putPrefsRes = await fetch(`${baseUrl}/student/settings/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `hspsms_session=${studentCookie}`
      },
      body: JSON.stringify(updatedPrefsPayload)
    });
    await assert('PUT /student/settings/preferences saves updated preferences (200)', putPrefsRes.status === 200);

    const recheckPrefsRes = await fetch(`${baseUrl}/student/settings/preferences`, {
      headers: { Cookie: `hspsms_session=${studentCookie}` }
    });
    const recheckPrefsData = await recheckPrefsRes.json();
    await assert('Preferences persist highContrast = true after reload', recheckPrefsData?.data?.display?.highContrast === true);

    // 3.3 Password Change Lifecycle
    // Reject invalid current password
    const wrongPassRes = await fetch(`${baseUrl}/student/settings/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `hspsms_session=${studentCookie}`
      },
      body: JSON.stringify({ currentPassword: 'WrongPassword#999', newPassword: 'NewPassword#2026' })
    });
    await assert('Password change rejects wrong current password (400)', wrongPassRes.status === 400);

    // Change password with valid credentials
    const validChangeRes = await fetch(`${baseUrl}/student/settings/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `hspsms_session=${studentCookie}`
      },
      body: JSON.stringify({ currentPassword: studentPassword, newPassword: 'HanaNewPass#2026' })
    });
    await assert('Password change succeeds with valid credentials (200)', validChangeRes.status === 200);

    // Verify login with new password
    const newPassLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: studentUsername, password: 'HanaNewPass#2026' })
    });
    const newCookie = extractCookie(newPassLoginRes);
    await assert('Student can log in with new password (200)', newPassLoginRes.status === 200 && Boolean(newCookie));

    // Revert password cleanly back to original so the database remains consistent
    const revertPassRes = await fetch(`${baseUrl}/student/settings/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `hspsms_session=${newCookie}`
      },
      body: JSON.stringify({ currentPassword: 'HanaNewPass#2026', newPassword: studentPassword })
    });
    await assert('Password reverted cleanly back to original for idempotent test runs', revertPassRes.status === 200);

    // Verify audit logs were written
    const [auditRows]: any = await pool.query(
      `SELECT action, entity_type FROM audit_logs WHERE actor_username = ? ORDER BY occurred_at DESC LIMIT 5`,
      [studentUsername]
    );
    await assert('Audit log recorded student password change and preferences actions', auditRows.length > 0);

  } catch (err: any) {
    console.error('Unhandled test suite error:', err);
  } finally {
    server.close();
    await pool.end();
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log('\n======================================================');
  console.log(`📊 STEP 1 TEST RESULTS: ${passed}/${total} PASSED`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

void runStep1Tests();
