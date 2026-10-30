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

async function runPage6ResultsTests() {
  console.log('\n======================================================');
  console.log('🧪 PAGE 6: RESULTS & ACADEMIC PROGRESS TEST SUITE');
  console.log('======================================================\n');

  // Start test server on port 5008
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(5008, () => resolve(s));
  });
  const baseUrl = 'http://localhost:5008/api/v1';

  try {
    // ---------------------------------------------------------
    // 1. Authentication & Security Verification
    // ---------------------------------------------------------
    console.log('--- 1. Authentication & Security Verification ---');
    const unauthTerm = await fetch(`${baseUrl}/student/results/term`);
    await assert('Unauthenticated GET /student/results/term returns 401', unauthTerm.status === 401);

    const unauthBreakdown = await fetch(`${baseUrl}/student/results/breakdown`);
    await assert('Unauthenticated GET /student/results/breakdown returns 401', unauthBreakdown.status === 401);

    const unauthAnalytics = await fetch(`${baseUrl}/student/results/analytics`);
    await assert('Unauthenticated GET /student/results/analytics returns 401', unauthAnalytics.status === 401);

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student.hana', password: 'StudentPass#2026' })
    });
    const hanaCookie = extractCookie(loginRes);
    await assert('Hana Bekele login succeeds (200)', loginRes.status === 200 && !!hanaCookie);

    const authHeaders = { Cookie: `hspsms_session=${hanaCookie}` };

    // ---------------------------------------------------------
    // 2. Tab 6.1: Published Term Results (GET /student/results/term)
    // ---------------------------------------------------------
    console.log('\n--- 2. Tab 6.1: Published Term Results Endpoint ---');
    const termRes = await fetch(`${baseUrl}/student/results/term`, { headers: authHeaders });
    const termJson = await termRes.json();
    await assert('GET /student/results/term returns 200', termRes.status === 200);

    const termData = termJson?.data;
    await assert('Response contains results array', Array.isArray(termData?.results));
    await assert('Response contains terms array for filtering', Array.isArray(termData?.terms) && termData?.terms?.length > 0);
    await assert('Response contains selectedTermId', typeof termData?.selectedTermId === 'number');
    await assert('Response contains termGpa number', typeof termData?.termGpa === 'number');
    await assert('Response contains averageScore number', typeof termData?.averageScore === 'number');
    await assert('Response contains totalSubjects count', typeof termData?.totalSubjects === 'number');
    await assert('Response contains passedSubjects count', typeof termData?.passedSubjects === 'number');
    await assert('Response contains standing string', typeof termData?.standing === 'string');
    await assert('Response contains academicYear string', typeof termData?.academicYear === 'string');

    // Validate Subject Rows
    const rows = termData?.results || [];
    await assert('Hana has published results (> 0 subjects)', rows.length > 0);

    if (rows.length > 0) {
      const first = rows[0];
      await assert('Result item has numeric id', typeof first.id === 'number');
      await assert('Result item has subject_code and subject_name', !!first.subject_code && !!first.subject_name);
      await assert('Result item has credit_hours >= 1', typeof first.credit_hours === 'number' && first.credit_hours >= 1);
      await assert('Result item has total_score', typeof first.total_score === 'number' && first.total_score >= 0);
      await assert('Result item has letter_grade (A/B/C/D/F)', ['A', 'B', 'C', 'D', 'F'].includes(first.letter_grade));
      await assert('Result item has grade_points (0 to 4)', typeof first.grade_points === 'number' && first.grade_points >= 0 && first.grade_points <= 4);
      await assert('Result item has is_pass boolean', typeof first.is_pass === 'boolean');
      await assert('Result item has subject_rank', typeof first.subject_rank === 'number');

      // GPA Formula Verification
      let totalQualityPoints = 0;
      let totalCreditHours = 0;
      for (const r of rows) {
        totalQualityPoints += r.grade_points * r.credit_hours;
        totalCreditHours += r.credit_hours;
      }
      const expectedGpa = totalCreditHours > 0 ? Number((totalQualityPoints / totalCreditHours).toFixed(2)) : 0;
      await assert(
        `Term GPA (${termData.termGpa}) matches formula (sum(grade_points * credits) / sum(credits) = ${expectedGpa})`,
        Math.abs(termData.termGpa - expectedGpa) <= 0.05
      );

      // Average Score Formula Verification
      const sumScores = rows.reduce((acc: number, curr: any) => acc + curr.total_score, 0);
      const expectedAvg = rows.length > 0 ? Number((sumScores / rows.length).toFixed(1)) : 0;
      await assert(
        `Average score (${termData.averageScore}%) matches formula (sum(scores) / count = ${expectedAvg}%)`,
        Math.abs(termData.averageScore - expectedAvg) <= 0.1
      );

      // Standing Verification
      if (termData.termGpa >= 3.5) {
        await assert('Standing is Great Distinction for GPA >= 3.5', termData.standing === 'Great Distinction');
      } else if (termData.termGpa >= 3.0) {
        await assert('Standing is Distinction for GPA >= 3.0', termData.standing === 'Distinction');
      }
    }

    // Term-Filtered Request
    console.log('\n--- 3. Tab 6.1: Term-Filtered Published Results ---');
    const term3Res = await fetch(`${baseUrl}/student/results/term?termId=3`, { headers: authHeaders });
    const term3Json = await term3Res.json();
    await assert('GET /student/results/term?termId=3 returns 200', term3Res.status === 200);
    await assert('Term 3 results match unfiltered term results count', 
      term3Json?.data?.results?.length === termData?.results?.length
    );

    // Non-existent / Unseeded Term
    const unseededTermRes = await fetch(`${baseUrl}/student/results/term?termId=99999`, { headers: authHeaders });
    const unseededTermJson = await unseededTermRes.json();
    await assert('GET /student/results/term?termId=99999 returns 200 with empty results', unseededTermRes.status === 200);
    await assert('Empty term results array has length 0', unseededTermJson?.data?.results?.length === 0);
    await assert('Empty term has standing "No Published Results"', unseededTermJson?.data?.standing === 'No Published Results');

    // ---------------------------------------------------------
    // 4. Tab 6.2: Continuous Assessment Breakdown
    // ---------------------------------------------------------
    console.log('\n--- 4. Tab 6.2: Continuous Assessment Breakdown ---');
    const breakdownRes = await fetch(`${baseUrl}/student/results/breakdown`, { headers: authHeaders });
    const breakdownJson = await breakdownRes.json();
    await assert('GET /student/results/breakdown returns 200', breakdownRes.status === 200);
    await assert('Breakdown response contains subjects array', Array.isArray(breakdownJson?.data?.subjects));

    const subjects = breakdownJson?.data?.subjects || [];
    await assert('Continuous breakdown subjects count > 0', subjects.length > 0);

    if (subjects.length > 0) {
      const s = subjects[0];
      await assert('Subject has subject_id', typeof s.subject_id === 'number');
      await assert('Subject has subject_code and subject_name', !!s.subject_code && !!s.subject_name);
      await assert('Subject has components_count number', typeof s.components_count === 'number');
      await assert('Subject has weighted_total number', typeof s.weighted_total === 'number');
      await assert('Subject has components array', Array.isArray(s.components));

      if (s.components.length > 0) {
        const comp = s.components[0];
        await assert('Component has assessment title', typeof comp.title === 'string' && comp.title.length > 0);
        await assert('Component has type_code and type_name', !!comp.type_code && !!comp.type_name);
        await assert('Component has max_score', typeof comp.max_score === 'number');
        await assert('Component has weight', typeof comp.weight === 'number');
        await assert('Component has score or null', comp.score === null || typeof comp.score === 'number');
        if (comp.score !== null && comp.max_score > 0) {
          const expectedPct = Number(((comp.score / comp.max_score) * 100).toFixed(1));
          await assert(
            `Component percentage (${comp.percentage}%) matches formula (${comp.score}/${comp.max_score} * 100 = ${expectedPct}%)`,
            comp.percentage === expectedPct
          );
        }
      }
    }

    // ---------------------------------------------------------
    // 5. Tab 6.3: Multi-Year Academic Progress & Analytics
    // ---------------------------------------------------------
    console.log('\n--- 5. Tab 6.3: Academic Analytics & Ranking ---');
    const analyticsRes = await fetch(`${baseUrl}/student/results/analytics`, { headers: authHeaders });
    const analyticsJson = await analyticsRes.json();
    await assert('GET /student/results/analytics returns 200', analyticsRes.status === 200);

    const analytics = analyticsJson?.data;
    await assert('Analytics contains rank number', typeof analytics?.rank === 'number' && analytics.rank >= 1);
    await assert('Analytics contains classSize number', typeof analytics?.classSize === 'number' && analytics.classSize >= analytics.rank);
    await assert('Analytics contains gpa number', typeof analytics?.gpa === 'number');
    await assert('Analytics contains averageScore number', typeof analytics?.averageScore === 'number');
    await assert('Analytics contains standing string', typeof analytics?.standing === 'string');
    await assert('Analytics contains topSubject object', typeof analytics?.topSubject === 'object' && analytics.topSubject !== null);
    await assert('Analytics contains lowestSubject object', typeof analytics?.lowestSubject === 'object' && analytics.lowestSubject !== null);
    await assert('Analytics contains results array for score visualization', Array.isArray(analytics?.results));

    // Verify topSubject has score >= lowestSubject
    if (analytics?.topSubject && analytics?.lowestSubject) {
      await assert(
        `Top subject score (${analytics.topSubject.total_score}%) >= lowest subject score (${analytics.lowestSubject.total_score}%)`,
        analytics.topSubject.total_score >= analytics.lowestSubject.total_score
      );
    }

    // ---------------------------------------------------------
    // 6. Master Prompt 6.1: GET /student/results (My Results)
    // ---------------------------------------------------------
    console.log('\n--- 6. Master Prompt 6.1: GET /student/results (My Results) ---');
    const myResultsRes = await fetch(`${baseUrl}/student/results?termId=3`, { headers: authHeaders });
    const myResultsJson = await myResultsRes.json();
    await assert('GET /student/results?termId=3 returns 200', myResultsRes.status === 200);
    const myResultsData = myResultsJson?.data;
    await assert('My Results contains subjects array', Array.isArray(myResultsData?.subjects));
    await assert('My Results contains terms array', Array.isArray(myResultsData?.terms));
    await assert('Subject has components array with assessments', myResultsData?.subjects?.[0]?.components !== undefined);
    if (myResultsData?.subjects?.[0]?.components?.length > 0) {
      const comp = myResultsData.subjects[0].components[0];
      await assert('Component has is_corrected boolean flag', typeof comp.is_corrected === 'boolean');
      await assert('Component has max_score and weight', typeof comp.max_score === 'number' && typeof comp.weight === 'number');
    }

    // ---------------------------------------------------------
    // 7. Master Prompt 6.2: GET /student/results/summary (Term Summary)
    // ---------------------------------------------------------
    console.log('\n--- 7. Master Prompt 6.2: GET /student/results/summary (Term Summary) ---');
    const summaryRes = await fetch(`${baseUrl}/student/results/summary?termId=3`, { headers: authHeaders });
    const summaryJson = await summaryRes.json();
    await assert('GET /student/results/summary?termId=3 returns 200', summaryRes.status === 200);
    const sumData = summaryJson?.data;
    await assert('Summary contains termAverage number', typeof sumData?.termAverage === 'number');
    await assert('Summary contains annualAverage number', typeof sumData?.annualAverage === 'number');
    await assert('Summary contains attendanceRate number', typeof sumData?.attendanceRate === 'number');
    await assert('Summary contains rank and classSize', typeof sumData?.rank === 'number' && typeof sumData?.classSize === 'number');
    await assert('Summary contains GPA (Scope B)', typeof sumData?.termGpa === 'number');
    await assert('Summary contains subjects results table', Array.isArray(sumData?.results) && sumData.results.length > 0);

    // ---------------------------------------------------------
    // 8. Master Prompt 6.3: GET /student/progress (Progress & Trends)
    // ---------------------------------------------------------
    console.log('\n--- 8. Master Prompt 6.3: GET /student/progress (Progress & Trends) ---');
    const progressRes = await fetch(`${baseUrl}/student/progress`, { headers: authHeaders });
    const progressJson = await progressRes.json();
    await assert('GET /student/progress returns 200', progressRes.status === 200);
    const progData = progressJson?.data;
    await assert('Progress contains termByTerm array', Array.isArray(progData?.termByTerm));
    await assert('Progress contains perSubjectTrend array', Array.isArray(progData?.perSubjectTrend));
    await assert('Progress contains strongestSubjects array', Array.isArray(progData?.strongestSubjects));
    await assert('Progress contains subjectsNeedingAttention array', Array.isArray(progData?.subjectsNeedingAttention));
    await assert('Progress contains attendanceTrend array', Array.isArray(progData?.attendanceTrend));
    await assert('Progress contains hasSufficientTrendData boolean', typeof progData?.hasSufficientTrendData === 'boolean');
    if (!progData?.hasSufficientTrendData) {
      await assert('Progress provides explanation notice below data threshold', typeof progData?.trendDataNotice === 'string' && progData.trendDataNotice.length > 0);
    }
    console.error('Unexpected test runner exception:', err);
    await assert('Test runner completed without fatal exception', false, err.message);
  } finally {
    server.close();
    await pool.end();

    console.log('\n======================================================');
    console.log('📊 TEST EXECUTION SUMMARY');
    console.log('======================================================');
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    console.log(`Total Tests Run : ${total}`);
    console.log(`Passed          : ${passed} ✅`);
    console.log(`Failed          : ${failed} ❌`);
    console.log('======================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runPage6ResultsTests();
