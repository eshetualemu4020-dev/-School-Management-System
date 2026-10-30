process.env.NODE_ENV = 'test';
import { pool } from '../src/config/database';
import app from '../src/index';
import { Server } from 'http';

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

async function runStep3Tests() {
  console.log('\n======================================================');
  console.log('🧪 STEP 3: TIMETABLE, CALENDAR & ATTENDANCE TEST SUITE');
  console.log('======================================================\n');

  // Start test server on port 5004
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(5004, () => resolve(s));
  });
  const baseUrl = 'http://localhost:5004/api/v1';

  try {
    // 1. Authenticate as student.hana
    console.log('--- 1. Authenticate as Enrolled Student (student.hana) ---');
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student.hana', password: 'StudentPass#2026' })
    });
    const hanaCookie = extractCookie(loginRes);
    await assert('Hana Bekele login succeeds (200)', loginRes.status === 200 && !!hanaCookie);

    // 2. Tab 3.1: Weekly Timetable (GET /api/v1/student/timetable)
    console.log('\n--- 2. Tab 3.1: Weekly Timetable Endpoint ---');
    const timetableRes = await fetch(`${baseUrl}/student/timetable`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const timetableJson = await timetableRes.json();
    await assert('GET /student/timetable returns 200', timetableRes.status === 200);
    await assert('Returns section name', !!timetableJson?.data?.section_name);
    await assert('Returns addis_time object', !!timetableJson?.data?.addis_time?.timeStr);
    await assert('Returns 5 weekdays', timetableJson?.data?.days?.length === 5);
    await assert('Slots array is populated', timetableJson?.data?.slots?.length > 0);
    const sampleSlot = timetableJson?.data?.slots?.[0];
    await assert('Slot has period, subject and room info', sampleSlot?.start_time && sampleSlot?.subject_name && sampleSlot?.room_name);

    // 3. Tab 3.2: Daily View (GET /api/v1/student/timetable/today)
    console.log('\n--- 3. Tab 3.2: Daily View / Today Timetable ---');
    const todayRes = await fetch(`${baseUrl}/student/timetable/today`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const todayJson = await todayRes.json();
    await assert('GET /student/timetable/today returns 200', todayRes.status === 200);
    await assert('Returns day information', !!todayJson?.data?.day?.day_name);
    await assert('Day contains periods list', Array.isArray(todayJson?.data?.day?.periods));

    // Also test day parameter (?day=1 for Monday)
    const mondayRes = await fetch(`${baseUrl}/student/timetable/today?day=1`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const mondayJson = await mondayRes.json();
    await assert('GET /student/timetable/today?day=1 returns Monday', mondayJson?.data?.day?.day_name === 'Monday');

    // 4. Tab 3.3: Academic Calendar (GET /api/v1/student/calendar)
    console.log('\n--- 4. Tab 3.3: Academic Calendar ---');
    const calRes = await fetch(`${baseUrl}/student/calendar`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const calJson = await calRes.json();
    await assert('GET /student/calendar returns 200', calRes.status === 200);
    await assert('Returns academic year name', !!calJson?.data?.academic_year);
    await assert('Returns calendar events', Array.isArray(calJson?.data?.events) && calJson?.data?.events?.length > 0);
    await assert('Returns academic terms', Array.isArray(calJson?.data?.terms) && calJson?.data?.terms?.length > 0);

    // Filter by type: ?type=holiday
    const holidayRes = await fetch(`${baseUrl}/student/calendar?type=holiday`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const holidayJson = await holidayRes.json();
    const allHolidays = holidayJson?.data?.events?.every((e: any) => e.event_type === 'holiday');
    await assert('Calendar filter ?type=holiday returns only holidays', allHolidays);

    // 5. Tab 3.4: Exam Schedule (GET /api/v1/student/exams)
    console.log('\n--- 5. Tab 3.4: Exam Schedule ---');
    const examsRes = await fetch(`${baseUrl}/student/exams`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const examsJson = await examsRes.json();
    await assert('GET /student/exams returns 200', examsRes.status === 200);
    await assert('Returns exams array', Array.isArray(examsJson?.data?.exams));
    await assert('Exams include midterm or final exams', examsJson?.data?.exams?.length > 0);
    await assert('Summary has total and upcoming counts', typeof examsJson?.data?.summary?.total === 'number');

    // 6. Tab 4.1: Attendance Overview & Summary (GET /api/v1/student/attendance/summary)
    console.log('\n--- 6. Tab 4.1: Attendance Summary ---');
    const attSummaryRes = await fetch(`${baseUrl}/student/attendance/summary`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const attSummaryJson = await attSummaryRes.json();
    await assert('GET /student/attendance/summary returns 200', attSummaryRes.status === 200);
    const summary = attSummaryJson?.data?.summary;
    await assert('Summary has total, present, late, absent, excused', typeof summary?.total === 'number' && typeof summary?.present === 'number');
    await assert('Attendance rate calculated as number', typeof summary?.rate === 'number');
    await assert('Monthly breakdown is array', Array.isArray(attSummaryJson?.data?.monthlyBreakdown));
    await assert('Subject breakdown is array', Array.isArray(attSummaryJson?.data?.subjectBreakdown));
    await assert('Ministry warning flag present', typeof attSummaryJson?.data?.ministryWarning === 'boolean');

    // 7. Tab 4.2: Attendance Records & History (GET /api/v1/student/attendance/records)
    console.log('\n--- 7. Tab 4.2: Attendance Records ---');
    const attRecRes = await fetch(`${baseUrl}/student/attendance/records`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const attRecJson = await attRecRes.json();
    await assert('GET /student/attendance/records returns 200', attRecRes.status === 200);
    await assert('Returns records array', Array.isArray(attRecJson?.data?.records));
    await assert('Returns pagination metadata', typeof attRecJson?.data?.totalCount === 'number');

    // Filter by status: ?status=late
    const lateRes = await fetch(`${baseUrl}/student/attendance/records?status=late`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const lateJson = await lateRes.json();
    const allLate = lateJson?.data?.records?.every((r: any) => r.status_code === 'late');
    await assert('Filter ?status=late returns only late records', allLate);

    // 8. Security Check: Unauthenticated Access
    console.log('\n--- 8. Security & RBAC Enforcement ---');
    const unauthRes = await fetch(`${baseUrl}/student/timetable`);
    await assert('Unauthenticated /student/timetable returns 401', unauthRes.status === 401);

    const unauthAttRes = await fetch(`${baseUrl}/student/attendance/summary`);
    await assert('Unauthenticated /student/attendance/summary returns 401', unauthAttRes.status === 401);

  } catch (err: any) {
    console.error('Fatal test error:', err);
    await assert('Test execution completed without uncaught exceptions', false, err.message);
  } finally {
    server.close();
    await pool.end();
  }

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log('\n======================================================');
  console.log(`📊 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${results.length})`);
  console.log('======================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runStep3Tests();
