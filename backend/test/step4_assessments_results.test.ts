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

async function runStep4Tests() {
  console.log('\n======================================================');
  console.log('🧪 STEP 4: ASSIGNMENTS, SUBMISSIONS & RESULTS TEST SUITE');
  console.log('======================================================\n');

  // Start test server on port 5005
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(5005, () => resolve(s));
  });
  const baseUrl = 'http://localhost:5005/api/v1';

  try {
    // 1. Authenticate as Hana Bekele
    console.log('--- 1. Authenticate as Enrolled Student (student.hana) ---');
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student.hana', password: 'StudentPass#2026' })
    });
    const hanaCookie = extractCookie(loginRes);
    await assert('Hana Bekele login succeeds (200)', loginRes.status === 200 && !!hanaCookie);

    // 2. Tab 5.1: Upcoming & Pending Assignments
    console.log('\n--- 2. Tab 5.1: Upcoming Assignments Endpoint ---');
    const upRes = await fetch(`${baseUrl}/student/assessments/upcoming`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const upJson = await upRes.json();
    await assert('GET /student/assessments/upcoming returns 200', upRes.status === 200);
    await assert('Returns assignments array', Array.isArray(upJson?.data?.assignments));
    await assert('Assignments have title, subject and due date', upJson?.data?.assignments?.length > 0 && !!upJson?.data?.assignments[0]?.title);
    await assert('Summary contains pending, submitted, overdue counts', typeof upJson?.data?.summary?.pending === 'number');

    // 3. Tab 5.4: Submit Assignment (Online Submission)
    console.log('\n--- 3. Tab 5.4: Submit Assignment Action ---');
    const targetAsg = upJson?.data?.assignments?.[0];
    const submitRes = await fetch(`${baseUrl}/student/assessments/${targetAsg?.id || 1}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `hspsms_session=${hanaCookie}`
      },
      body: JSON.stringify({
        contentText: 'Hana Bekele submission with complete step-by-step mathematical proofs and derivations.'
      })
    });
    const submitJson = await submitRes.json();
    await assert('POST /student/assessments/:id/submit returns 201', submitRes.status === 201);
    await assert('Returns submission object with status submitted', submitJson?.data?.submission?.status === 'submitted');

    // 4. Tab 5.2: Submitted Assignments Log
    console.log('\n--- 4. Tab 5.2: Submitted Assignments Endpoint ---');
    const subRes = await fetch(`${baseUrl}/student/assessments/submitted`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const subJson = await subRes.json();
    await assert('GET /student/assessments/submitted returns 200', subRes.status === 200);
    await assert('Returns submissions list with at least 1 submission', Array.isArray(subJson?.data?.submissions) && subJson?.data?.submissions?.length > 0);

    // 5. Tab 5.3: Quizzes and Online Tests
    console.log('\n--- 5. Tab 5.3: Quizzes & Tests Endpoint ---');
    const qzRes = await fetch(`${baseUrl}/student/assessments/quizzes`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const qzJson = await qzRes.json();
    await assert('GET /student/assessments/quizzes returns 200', qzRes.status === 200);
    await assert('Returns quizzes list', Array.isArray(qzJson?.data?.quizzes) && qzJson?.data?.quizzes?.length > 0);

    // 6. Tab 6.1: Published Term Results
    console.log('\n--- 6. Tab 6.1: Term Results Endpoint ---');
    const termRes = await fetch(`${baseUrl}/student/results/term`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const termJson = await termRes.json();
    await assert('GET /student/results/term returns 200', termRes.status === 200);
    await assert('Returns published results array', Array.isArray(termJson?.data?.results) && termJson?.data?.results?.length > 0);
    await assert('Calculates term GPA (4.0 scale)', typeof termJson?.data?.termGpa === 'number' && termJson?.data?.termGpa > 0);
    await assert('Calculates average score percent', typeof termJson?.data?.averageScore === 'number' && termJson?.data?.averageScore > 0);
    await assert('Returns academic standing (Distinction/Pass)', !!termJson?.data?.standing);

    // 7. Tab 6.2: Continuous Assessment Breakdown
    console.log('\n--- 7. Tab 6.2: Continuous Assessment Breakdown ---');
    const bkRes = await fetch(`${baseUrl}/student/results/breakdown`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const bkJson = await bkRes.json();
    await assert('GET /student/results/breakdown returns 200', bkRes.status === 200);
    await assert('Returns subjects breakdown array', Array.isArray(bkJson?.data?.subjects) && bkJson?.data?.subjects?.length > 0);
    const sampleSub = bkJson?.data?.subjects?.[0];
    await assert('Subject has components list and weighted total', Array.isArray(sampleSub?.components) && typeof sampleSub?.weighted_total === 'number');

    // 8. Tab 6.3: Academic Analytics & Rank
    console.log('\n--- 8. Tab 6.3: Academic Analytics & Rank ---');
    const anRes = await fetch(`${baseUrl}/student/results/analytics`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    const anJson = await anRes.json();
    await assert('GET /student/results/analytics returns 200', anRes.status === 200);
    await assert('Returns class rank (1224 competition tie rule)', typeof anJson?.data?.rank === 'number' && anJson?.data?.rank >= 1);
    await assert('Returns class size', typeof anJson?.data?.classSize === 'number' && anJson?.data?.classSize >= 1);
    await assert('Identifies top subject', !!anJson?.data?.topSubject?.subject_name);

    // 9. Security & RBAC Enforcement
    console.log('\n--- 9. Security & RBAC Enforcement ---');
    const unauthAsg = await fetch(`${baseUrl}/student/assessments/upcoming`);
    await assert('Unauthenticated /student/assessments/upcoming returns 401', unauthAsg.status === 401);

    const unauthRes = await fetch(`${baseUrl}/student/results/term`);
    await assert('Unauthenticated /student/results/term returns 401', unauthRes.status === 401);

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

runStep4Tests();
