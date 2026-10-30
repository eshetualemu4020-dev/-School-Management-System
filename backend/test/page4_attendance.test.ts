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

async function runPage4AttendanceTests() {
  console.log('\n======================================================');
  console.log('🧪 PAGE 4: ATTENDANCE & ROLL CALL TEST SUITE');
  console.log('======================================================\n');

  // Start test server on port 5006
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(5006, () => resolve(s));
  });
  const baseUrl = 'http://localhost:5006/api/v1';

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

    // 2. Tab 4.1: Attendance Summary (GET /api/v1/student/attendance/summary)
    console.log('\n--- 2. Tab 4.1: Attendance Summary Endpoint ---');
    const summaryRes = await fetch(`${baseUrl}/student/attendance/summary`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const summaryJson = await summaryRes.json();
    await assert('GET /student/attendance/summary returns 200', summaryRes.status === 200);

    const summary = summaryJson?.data?.summary;
    await assert('Summary object has numeric counts', 
      typeof summary?.total === 'number' &&
      typeof summary?.present === 'number' &&
      typeof summary?.late === 'number' &&
      typeof summary?.absent === 'number' &&
      typeof summary?.excused === 'number'
    );

    // Validate Formula: rate = ((present + late) / total) * 100
    const expectedRate = summary?.total > 0
      ? Number((((summary.present + summary.late) / summary.total) * 100).toFixed(1))
      : 100.0;
    await assert(
      `Attendance rate (${summary?.rate}%) matches formula ((present + late) / total * 100 = ${expectedRate}%)`,
      summary?.rate === expectedRate
    );

    await assert('Includes monthlyBreakdown array', Array.isArray(summaryJson?.data?.monthlyBreakdown));
    await assert('Includes subjectBreakdown array', Array.isArray(summaryJson?.data?.subjectBreakdown));
    await assert('Includes terms array for filtering', Array.isArray(summaryJson?.data?.terms) && summaryJson?.data?.terms?.length > 0);
    await assert('Includes ministryWarning boolean', typeof summaryJson?.data?.ministryWarning === 'boolean');

    // 3. Tab 4.1: Term-Filtered Summary
    console.log('\n--- 3. Tab 4.1: Term-Filtered Attendance Summary ---');
    const termId = summaryJson?.data?.terms?.[0]?.id;
    const termSummaryRes = await fetch(`${baseUrl}/student/attendance/summary?termId=${termId}`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const termSummaryJson = await termSummaryRes.json();
    await assert(`GET /student/attendance/summary?termId=${termId} returns 200`, termSummaryRes.status === 200);
    await assert('Term-filtered summary reflects selectedTermId', termSummaryJson?.data?.selectedTermId === termId);
    await assert('Term-filtered summary totals are valid numbers', typeof termSummaryJson?.data?.summary?.total === 'number');

    // 4. Tab 4.2: Daily History (Primary Endpoint: GET /api/v1/student/attendance)
    console.log('\n--- 4. Tab 4.2: Daily History (Primary Endpoint) ---');
    const historyRes = await fetch(`${baseUrl}/student/attendance`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const historyJson = await historyRes.json();
    await assert('GET /student/attendance (primary endpoint) returns 200', historyRes.status === 200);
    await assert('Returns records array', Array.isArray(historyJson?.data?.records));
    await assert('Returns pagination totalCount', typeof historyJson?.data?.totalCount === 'number');
    await assert('Returns pagination totalPages', typeof historyJson?.data?.totalPages === 'number');

    if (historyJson?.data?.records?.length > 0) {
      const rec = historyJson.data.records[0];
      await assert('Record contains attendance_date', !!rec.attendance_date);
      await assert('Record contains status_code', !!rec.status_code);
      await assert('Record contains status_name', !!rec.status_name);
      await assert('Record contains marked_by_name', !!rec.marked_by_name);
      await assert('Record has counts_as_present flag', typeof rec.counts_as_present === 'number');
      await assert('Record has is_excused flag', typeof rec.is_excused === 'number');
      await assert('Record has is_corrected flag', rec.is_corrected !== undefined);
    }

    // 5. Tab 4.2: Alias Endpoint (GET /api/v1/student/attendance/records)
    console.log('\n--- 5. Tab 4.2: Alias Endpoint Compatibility ---');
    const aliasRes = await fetch(`${baseUrl}/student/attendance/records`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    await assert('GET /student/attendance/records alias returns 200', aliasRes.status === 200);

    // 6. Tab 4.2: Status Filtering (?status=late, ?status=present, ?status=excused)
    console.log('\n--- 6. Tab 4.2: Status Filtering ---');
    const lateRes = await fetch(`${baseUrl}/student/attendance?status=late`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const lateJson = await lateRes.json();
    await assert('GET /student/attendance?status=late returns 200', lateRes.status === 200);
    const allLate = lateJson?.data?.records?.every((r: any) => r.status_code === 'late');
    await assert('All records in ?status=late have status_code="late"', allLate);

    const presentRes = await fetch(`${baseUrl}/student/attendance?status=present`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const presentJson = await presentRes.json();
    await assert('GET /student/attendance?status=present returns 200', presentRes.status === 200);
    const allPresent = presentJson?.data?.records?.every((r: any) => r.status_code === 'present');
    await assert('All records in ?status=present have status_code="present"', allPresent);

    // 7. Tab 4.2: Date Range and Term Filtering
    console.log('\n--- 7. Tab 4.2: Date Range and Term Filtering ---');
    const dateRangeRes = await fetch(`${baseUrl}/student/attendance?fromDate=2026-09-01&toDate=2026-10-31`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const dateRangeJson = await dateRangeRes.json();
    await assert('GET /student/attendance?fromDate=2026-09-01&toDate=2026-10-31 returns 200', dateRangeRes.status === 200);
    const inRange = dateRangeJson?.data?.records?.every((r: any) => {
      const d = r.attendance_date.substring(0, 10);
      return d >= '2026-09-01' && d <= '2026-10-31';
    });
    await assert('All records fall within the requested date range', inRange);

    // 8. Tab 4.2: Server-Side Pagination
    console.log('\n--- 8. Tab 4.2: Pagination Limits ---');
    const pageRes = await fetch(`${baseUrl}/student/attendance?page=1&limit=5`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const pageJson = await pageRes.json();
    await assert('GET /student/attendance?page=1&limit=5 returns 200', pageRes.status === 200);
    await assert('Returned record count <= requested limit (5)', pageJson?.data?.records?.length <= 5);
    await assert('Pagination metadata page = 1', pageJson?.data?.page === 1);
    await assert('Pagination metadata limit = 5', pageJson?.data?.limit === 5);

    // 9. Security & RBAC Enforcement
    console.log('\n--- 9. Security & RBAC Controls ---');
    const unauthSummaryRes = await fetch(`${baseUrl}/student/attendance/summary`);
    await assert('Unauthenticated /student/attendance/summary returns 401', unauthSummaryRes.status === 401);

    const unauthHistoryRes = await fetch(`${baseUrl}/student/attendance`);
    await assert('Unauthenticated /student/attendance returns 401', unauthHistoryRes.status === 401);

    // Rule: Students NEVER create, edit or delete official records (attendance)
    const writeAttemptRes = await fetch(`${baseUrl}/student/attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `hspsms_session=${hanaCookie}`
      },
      body: JSON.stringify({ status_code: 'present' })
    });
    await assert('Student POST /student/attendance write attempt is blocked (404/405)', writeAttemptRes.status === 404 || writeAttemptRes.status === 405);

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

runPage4AttendanceTests();
