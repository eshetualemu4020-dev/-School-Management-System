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

async function runPage5AssessmentTests() {
  console.log('\n======================================================');
  console.log('🧪 PAGE 5: ASSIGNMENTS & ASSESSMENTS TEST SUITE');
  console.log('======================================================\n');

  // Start test server on port 5007
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(5007, () => resolve(s));
  });
  const baseUrl = 'http://localhost:5007/api/v1';

  let testSubmissionId: number | null = null;

  try {
    // ---------------------------------------------------------
    // 1. Authentication & RBAC Security Verification
    // ---------------------------------------------------------
    console.log('--- 1. Authentication & Security Verification ---');
    const unauthRes = await fetch(`${baseUrl}/student/assessments`);
    await assert('Unauthenticated GET /student/assessments returns 401', unauthRes.status === 401);

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student.hana', password: 'StudentPass#2026' })
    });
    const hanaCookie = extractCookie(loginRes);
    await assert('Hana Bekele login succeeds (200)', loginRes.status === 200 && !!hanaCookie);

    const authHeaders = { Cookie: `hspsms_session=${hanaCookie}` };

    // ---------------------------------------------------------
    // 2. Tab 5.1: Upcoming Assignments (GET /student/assessments/upcoming)
    // ---------------------------------------------------------
    console.log('\n--- 2. Tab 5.1: Upcoming Assignments Endpoints ---');
    const rootRes = await fetch(`${baseUrl}/student/assessments`, { headers: authHeaders });
    const rootJson = await rootRes.json();
    await assert('GET /student/assessments defaults to upcoming and returns 200', rootRes.status === 200);
    await assert('Root endpoint returns assignments array', Array.isArray(rootJson?.data?.assignments));
    await assert('Root endpoint returns total count', typeof rootJson?.data?.count === 'number');

    const upcomingRes = await fetch(`${baseUrl}/student/assessments/upcoming`, { headers: authHeaders });
    const upcomingJson = await upcomingRes.json();
    await assert('GET /student/assessments/upcoming returns 200', upcomingRes.status === 200);
    await assert('Upcoming response contains assignments array', Array.isArray(upcomingJson?.data?.assignments));
    await assert('Upcoming assignments count matches array length', upcomingJson?.data?.count === upcomingJson?.data?.assignments?.length);

    if (upcomingJson?.data?.assignments?.length > 0) {
      const first = upcomingJson.data.assignments[0];
      await assert('Upcoming item has numeric id', typeof first.id === 'number');
      await assert('Upcoming item has title', typeof first.title === 'string' && first.title.length > 0);
      await assert('Upcoming item has due_at date string', typeof first.due_at === 'string');
      await assert('Upcoming item has max_score', typeof first.max_score === 'number');
      await assert('Upcoming item has subject_name and subject_code', !!first.subject_name && !!first.subject_code);
      await assert('Upcoming item has teacher_name', typeof first.teacher_name === 'string');
      await assert('Upcoming item has time_remaining calculated', typeof first.time_remaining === 'string');
      await assert('Upcoming item has is_submitted boolean flag', typeof first.is_submitted === 'boolean');
      await assert('Upcoming item has submission_status string', typeof first.submission_status === 'string');
    }

    // Filter by subjectId = 1 (Physics)
    const physRes = await fetch(`${baseUrl}/student/assessments/upcoming?subjectId=1`, { headers: authHeaders });
    const physJson = await physRes.json();
    await assert('GET /student/assessments/upcoming?subjectId=1 returns 200', physRes.status === 200);
    const allPhysics = physJson?.data?.assignments?.every((a: any) => a.subject_id === 1);
    await assert('All returned items belong to subjectId=1', allPhysics);

    // ---------------------------------------------------------
    // 3. Tab 5.2: Submitted & Graded Assignments
    // ---------------------------------------------------------
    console.log('\n--- 3. Tab 5.2: Submitted & Graded Endpoints ---');
    const submittedRes = await fetch(`${baseUrl}/student/assessments/submitted`, { headers: authHeaders });
    const submittedJson = await submittedRes.json();
    await assert('GET /student/assessments/submitted returns 200', submittedRes.status === 200);
    await assert('Submitted endpoint returns submissions array', Array.isArray(submittedJson?.data?.submissions));

    const aliasSubmissionsRes = await fetch(`${baseUrl}/student/submissions`, { headers: authHeaders });
    const aliasSubmissionsJson = await aliasSubmissionsRes.json();
    await assert('GET /student/submissions alias returns 200', aliasSubmissionsRes.status === 200);
    await assert('Alias submissions array matches /assessments/submitted', 
      aliasSubmissionsJson?.data?.submissions?.length === submittedJson?.data?.submissions?.length
    );

    // ---------------------------------------------------------
    // 4. Tab 5.3: Past Assessments & Tests (UNION Endpoint)
    // ---------------------------------------------------------
    console.log('\n--- 4. Tab 5.3: Past Assessments Endpoint ---');
    const pastRes = await fetch(`${baseUrl}/student/assessments/past`, { headers: authHeaders });
    const pastJson = await pastRes.json();
    await assert('GET /student/assessments/past returns 200', pastRes.status === 200);
    await assert('Past assessments endpoint returns array', Array.isArray(pastJson?.data?.assessments));
    await assert('Past assessments count matches array length', pastJson?.data?.count === pastJson?.data?.assessments?.length);

    // Dispatcher status=past verification
    const dispatchPastRes = await fetch(`${baseUrl}/student/assessments?status=past`, { headers: authHeaders });
    const dispatchPastJson = await dispatchPastRes.json();
    await assert('GET /student/assessments?status=past returns 200', dispatchPastRes.status === 200);
    await assert('Dispatcher status=past returns identical assessments count',
      dispatchPastJson?.data?.count === pastJson?.data?.count
    );

    if (pastJson?.data?.assessments?.length > 0) {
      const pastFirst = pastJson.data.assessments[0];
      await assert('Past assessment has id and title', typeof pastFirst.id === 'number' && typeof pastFirst.title === 'string');
      await assert('Past assessment has type_code (quiz/test/exam/assignment)', typeof pastFirst.type_code === 'string');
      await assert('Past assessment has max_score', typeof pastFirst.max_score === 'number');
      await assert('Past assessment has subject_name', typeof pastFirst.subject_name === 'string');
      await assert('Past assessment has is_published indicator', typeof pastFirst.is_published === 'number' || typeof pastFirst.is_published === 'boolean');
    }

    // Filter by termId = 3
    const termPastRes = await fetch(`${baseUrl}/student/assessments/past?termId=3`, { headers: authHeaders });
    const termPastJson = await termPastRes.json();
    await assert('GET /student/assessments/past?termId=3 returns 200', termPastRes.status === 200);

    // Filter by subjectId = 1
    const subPastRes = await fetch(`${baseUrl}/student/assessments/past?subjectId=1`, { headers: authHeaders });
    const subPastJson = await subPastRes.json();
    await assert('GET /student/assessments/past?subjectId=1 returns 200', subPastRes.status === 200);

    // ---------------------------------------------------------
    // 5. Tab 5.4: Assessment Detail & Workspace
    // ---------------------------------------------------------
    console.log('\n--- 5. Tab 5.4: Assessment Detail Endpoint ---');
    // Valid assignment ID 1 for Hana's section 1
    const detailRes = await fetch(`${baseUrl}/student/assessments/1`, { headers: authHeaders });
    const detailJson = await detailRes.json();
    await assert('GET /student/assessments/1 returns 200 for enrolled section', detailRes.status === 200);

    const d = detailJson?.data;
    await assert('Detail has assignment id=1', d?.id === 1);
    await assert('Detail has instructions text', typeof d?.instructions === 'string');
    await assert('Detail has due_at ISO timestamp', typeof d?.due_at === 'string');
    await assert('Detail has subject_code and subject_name', (d?.subject_code === 'PHY' || d?.subject_code === 'PHYS10') && !!d?.subject_name);
    await assert('Detail has teacher contact email or null', d?.teacher_email === null || typeof d?.teacher_email === 'string');
    await assert('Detail includes attachments array from learning resources', Array.isArray(d?.attachments));
    await assert('Detail calculates is_overdue boolean', typeof d?.is_overdue === 'boolean');
    await assert('Detail calculates can_submit boolean', typeof d?.can_submit === 'boolean');

    // Cross-Section Security Protection
    console.log('\n--- 6. Cross-Section Security & Validation ---');
    // Assignment 3 belongs to section 3 (Hana is enrolled in section 1)
    const crossSecRes = await fetch(`${baseUrl}/student/assessments/3`, { headers: authHeaders });
    const crossSecJson = await crossSecRes.json();
    await assert('Foreign section assignment GET /student/assessments/3 returns 404 (Forbidden / Not found in section)', 
      crossSecRes.status === 404
    );
    await assert('Cross-section returns ASSIGNMENT_NOT_FOUND code', 
      crossSecJson?.code === 'ASSIGNMENT_NOT_FOUND' || crossSecJson?.error?.code === 'ASSIGNMENT_NOT_FOUND'
    );

    // Non-existent ID returns 404
    const nonExistRes = await fetch(`${baseUrl}/student/assessments/999999`, { headers: authHeaders });
    await assert('Non-existent assignment GET /student/assessments/999999 returns 404', nonExistRes.status === 404);

    // ---------------------------------------------------------
    // 7. Interactive Submission Workflow & File Uploads
    // ---------------------------------------------------------
    console.log('\n--- 7. Interactive Submission Workflow & File Uploads ---');
    // Empty submission validation
    const emptySubRes = await fetch(`${baseUrl}/student/assessments/1/submit`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    await assert('Empty submission body returns 400 (Validation Error)', emptySubRes.status === 400);

    // Cross-section submission rejected
    const foreignSubRes = await fetch(`${baseUrl}/student/assessments/3/submit`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentText: 'Unauthorized submission attempt' })
    });
    await assert('Cross-section POST /student/assessments/3/submit returns 404', foreignSubRes.status === 404);

    // Valid submission to assignment 1 with text and attached PDF solution
    const samplePdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Student Solution) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF').toString('base64');
    const validSubRes = await fetch(`${baseUrl}/student/assessments/1/submit`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contentText: 'Test submission by Hana Bekele: Newton Law of Universal Gravitation derivations complete.',
        file: {
          originalName: 'hana_physics_solution.pdf',
          mimeType: 'application/pdf',
          dataBase64: samplePdfBase64
        }
      })
    });
    const validSubJson = await validSubRes.json();
    await assert('Valid submission with file attachment returns 201 (Created)', validSubRes.status === 201 || validSubRes.status === 200);
    await assert('Submission response contains submission_id', typeof validSubJson?.data?.submission_id === 'number');
    testSubmissionId = validSubJson?.data?.submission_id;

    // Verify detail endpoint now reflects submitted status and attached file
    const updatedDetailRes = await fetch(`${baseUrl}/student/assessments/1`, { headers: authHeaders });
    const updatedDetailJson = await updatedDetailRes.json();
    await assert('Updated detail reflects submission_id', updatedDetailJson?.data?.submission_id === testSubmissionId);
    await assert('Updated detail reflects submission_status', !!updatedDetailJson?.data?.submission_status);
    await assert('Updated detail includes submission_file_name', updatedDetailJson?.data?.submission_file_name === 'hana_physics_solution.pdf');

    // Verify submitted list includes assignment 1 with file metadata
    const verifySubmittedRes = await fetch(`${baseUrl}/student/assessments/submitted`, { headers: authHeaders });
    const verifySubmittedJson = await verifySubmittedRes.json();
    const subItem = verifySubmittedJson?.data?.submissions?.find((s: any) => s.assignment_id === 1);
    await assert('Submitted tab list contains assignment 1', !!subItem);
    await assert('Submitted item contains file_name', subItem?.file_name === 'hana_physics_solution.pdf');

    // ---------------------------------------------------------
    // 8. Download Own Submitted File Endpoint
    // ---------------------------------------------------------
    console.log('\n--- 8. Download Own Submitted File Endpoint ---');
    const downloadRes = await fetch(`${baseUrl}/student/submissions/${testSubmissionId}/download`, { headers: authHeaders });
    await assert('GET /student/submissions/:id/download returns 200', downloadRes.status === 200);
    await assert('Download response has application/pdf content type', downloadRes.headers.get('content-type') === 'application/pdf');
    await assert('Download response has Content-Disposition attachment', 
      (downloadRes.headers.get('content-disposition') || '').includes('attachment')
    );

    const downloadByAssignRes = await fetch(`${baseUrl}/student/assessments/1/submission/download`, { headers: authHeaders });
    await assert('GET /student/assessments/:id/submission/download alias returns 200', downloadByAssignRes.status === 200);

    // Unauthenticated download rejected
    const unauthDownloadRes = await fetch(`${baseUrl}/student/submissions/${testSubmissionId}/download`);
    await assert('Unauthenticated download returns 401', unauthDownloadRes.status === 401);

    // ---------------------------------------------------------
    // 9. Type Filter on Tab 5.1 Verification
    // ---------------------------------------------------------
    console.log('\n--- 9. Type Filter on Tab 5.1 Verification ---');
    const typeAssignRes = await fetch(`${baseUrl}/student/assessments/upcoming?type=assignment`, { headers: authHeaders });
    const typeAssignJson = await typeAssignRes.json();
    await assert('GET /student/assessments/upcoming?type=assignment returns 200', typeAssignRes.status === 200);
    const allAssignments = (typeAssignJson?.data?.assignments || []).every((a: any) => a.type === 'assignment');
    await assert('All returned items have type="assignment"', allAssignments);

  } catch (err: any) {
    console.error('Unexpected test runner exception:', err);
    await assert('Test runner completed without fatal exception', false, err.message);
  } finally {
    // Teardown: Clean up test submission to keep tests idempotent
    if (testSubmissionId) {
      try {
        await pool.query('DELETE FROM submissions WHERE id = ?', [testSubmissionId]);
        console.log(`\n🧹 Cleaned up test submission ID: ${testSubmissionId}`);
      } catch (cleanErr) {
        console.warn('Failed to clean up test submission:', cleanErr);
      }
    }

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

runPage5AssessmentTests();
