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
    console.error(`  ❌ FAIL: ${name} - ${message || 'assertion failed'}`);
    results.push({ name, passed: false, error: message });
  }
}

function extractCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/hspsms_session=([^;]+)/);
  return match ? match[1] : '';
}

async function runPage7Tests() {
  console.log('\n======================================================');
  console.log('🧪 PAGE 7: REPORT CARDS & DOCUMENTS TEST SUITE');
  console.log('======================================================\n');

  // Start dedicated test server on port 5009
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(5009, () => resolve(s));
  });
  const baseUrl = 'http://localhost:5009/api/v1';

  try {
    // --- 1. Security & Authentication ---
    console.log('--- 1. Authentication & Security Enforcement ---');
    const unauthRC = await fetch(`${baseUrl}/student/report-cards`);
    await assert('Unauthenticated GET /student/report-cards returns 401', unauthRC.status === 401);

    const unauthDocs = await fetch(`${baseUrl}/student/documents`);
    await assert('Unauthenticated GET /student/documents returns 401', unauthDocs.status === 401);

    const unauthReqs = await fetch(`${baseUrl}/student/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestType: 'transcript', purpose: 'Scholarship' })
    });
    await assert('Unauthenticated POST /student/requests returns 401', unauthReqs.status === 401);

    // Clean up any test requests from prior runs
    await pool.query('DELETE FROM student_requests WHERE student_id = 1');

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student.hana', password: 'StudentPass#2026' })
    });
    const hanaCookie = extractCookie(loginRes);
    await assert('Hana Bekele login succeeds (200)', loginRes.status === 200 && !!hanaCookie);

    const authHeaders = {
      Cookie: `hspsms_session=${hanaCookie}`,
      'Content-Type': 'application/json'
    };

    // --- 2. Tab: Report Cards ---
    console.log('\n--- 2. Tab: Report Cards (Certified & Published Cards) ---');
    let firstReportCardId = 0;
    const rcRes = await fetch(`${baseUrl}/student/report-cards`, { headers: authHeaders });
    await assert('GET /student/report-cards returns 200', rcRes.status === 200);
    const rcJson = await rcRes.json();
    await assert('Response contains reportCards array', Array.isArray(rcJson.data?.reportCards));
    await assert('Count matches reportCards length', rcJson.data?.count === rcJson.data?.reportCards.length);

    if (rcJson.data?.reportCards.length > 0) {
      const rc = rcJson.data.reportCards[0];
      firstReportCardId = rc.id;
      await assert('Report card has reference_no', !!rc.reference_no);
      await assert('Report card has term_name', !!rc.term_name);
      await assert('Report card has academic_year_name', !!rc.academic_year_name);
      await assert('Report card has publication_status "published"', rc.publication_status === 'published');
      await assert('Report card has average_percent', typeof rc.average_percent === 'string' || typeof rc.average_percent === 'number');
      await assert('Report card has payload with subjects array', Array.isArray(rc.payload?.subjects));
    }

    if (firstReportCardId > 0) {
      const dlRes = await fetch(`${baseUrl}/student/report-cards/${firstReportCardId}/download`, {
        headers: { Cookie: `hspsms_session=${hanaCookie}` }
      });
      await assert('GET /student/report-cards/:id/download returns 200', dlRes.status === 200);
      await assert('Content-Type is application/pdf', dlRes.headers.get('content-type') === 'application/pdf');
      await assert('Content-Disposition is attachment', !!dlRes.headers.get('content-disposition')?.includes('attachment'));
      const buf = Buffer.from(await dlRes.arrayBuffer());
      await assert('PDF has standard %PDF- header', buf.subarray(0, 5).toString('latin1') === '%PDF-');
      await assert('PDF contains %%EOF terminator', buf.toString('latin1').includes('%%EOF'));
    }

    // --- 3. Tab: Transcripts ---
    console.log('\n--- 3. Tab: Transcripts (Official Registrar Records) ---');
    const trRes = await fetch(`${baseUrl}/student/transcripts`, { headers: authHeaders });
    await assert('GET /student/transcripts returns 200', trRes.status === 200);
    const trJson = await trRes.json();
    await assert('Response contains transcripts array', Array.isArray(trJson.data?.transcripts));
    await assert('Response contains academicHistorySummary', !!trJson.data?.academicHistorySummary);
    await assert('History summary includes enrolledYears count', typeof trJson.data?.academicHistorySummary?.enrolledYears === 'number');

    // Test transcript download endpoint
    const trDlRes = await fetch(`${baseUrl}/student/transcripts/1/download`, {
      headers: { Cookie: `hspsms_session=${hanaCookie}` }
    });
    await assert('GET /student/transcripts/:id/download returns 200', trDlRes.status === 200);
    await assert('Transcript download is application/pdf', trDlRes.headers.get('content-type') === 'application/pdf');
    const trBuf = Buffer.from(await trDlRes.arrayBuffer());
    await assert('Transcript PDF has %PDF- header', trBuf.subarray(0, 5).toString('latin1') === '%PDF-');
    await assert('Transcript content mentions MULTI-YEAR ACADEMIC TRANSCRIPT', trBuf.toString('latin1').includes('MULTI-YEAR ACADEMIC TRANSCRIPT'));

    // --- 4. Tab: Issued Documents & Annual Certificates (Semesters 1 & 2) ---
    console.log('\n--- 4. Tab: Issued Documents & Annual Certificates ---');
    let firstDocId = 0;
    let annualCertId = 0;
    const docRes = await fetch(`${baseUrl}/student/documents`, { headers: authHeaders });
    await assert('GET /student/documents returns 200', docRes.status === 200);
    const docJson = await docRes.json();
    await assert('Response contains documents array', Array.isArray(docJson.data?.documents));
    await assert('Response contains annualCertificates array', Array.isArray(docJson.data?.annualCertificates));
    await assert('Response contains currentYearProgress tracker', !!docJson.data?.currentYearProgress);
    await assert('Annual certificate tracker includes status text', !!docJson.data?.currentYearProgress?.annualCertificateStatus);

    if (docJson.data?.documents.length > 0) {
      firstDocId = docJson.data.documents[0].id;
      const d = docJson.data.documents[0];
      await assert('Document has original_name', !!d.original_name);
      await assert('Document has reference_no', !!d.reference_no);
      await assert('Document has doc_type', !!d.doc_type);
    }

    if (docJson.data?.annualCertificates.length > 0) {
      const ac = docJson.data.annualCertificates[0];
      annualCertId = ac.id;
      await assert('Annual certificate has title', !!ac.title);
      await assert('Annual certificate has reference_no', !!ac.reference_no);
      await assert('Annual certificate has outcome', !!ac.outcome);
      await assert('Annual certificate has grade_name', !!ac.grade_name);
      await assert('Annual certificate has academic_year_name', !!ac.academic_year_name);
    }

    if (firstDocId > 0) {
      const ddlRes = await fetch(`${baseUrl}/student/documents/${firstDocId}/download`, {
        headers: { Cookie: `hspsms_session=${hanaCookie}` }
      });
      await assert('GET /student/documents/:id/download returns 200', ddlRes.status === 200);
      await assert('Document download is application/pdf', ddlRes.headers.get('content-type') === 'application/pdf');
      const buf = Buffer.from(await ddlRes.arrayBuffer());
      await assert('Document PDF has %PDF- header', buf.subarray(0, 5).toString('latin1') === '%PDF-');
    }

    if (annualCertId > 0) {
      const acdlRes = await fetch(`${baseUrl}/student/documents/${annualCertId}/download`, {
        headers: { Cookie: `hspsms_session=${hanaCookie}` }
      });
      await assert('GET /student/documents/:annualCertId/download returns 200', acdlRes.status === 200);
      await assert('Annual Certificate download is application/pdf', acdlRes.headers.get('content-type') === 'application/pdf');
      const buf = Buffer.from(await acdlRes.arrayBuffer());
      await assert('Annual Certificate PDF has %PDF- header', buf.subarray(0, 5).toString('latin1') === '%PDF-');
      await assert('PDF content text contains ANNUAL CERTIFICATE', buf.toString('latin1').includes('ANNUAL CERTIFICATE'));
    }

    // --- 5. Tab: Request a Document & Duplicate Prevention ---
    console.log('\n--- 5. Tab: Request a Document & Duplicate Prevention Rule ---');
    const rtRes = await fetch(`${baseUrl}/student/request-types`, { headers: authHeaders });
    await assert('GET /student/request-types returns 200', rtRes.status === 200);
    const rtJson = await rtRes.json();
    await assert('Request types returns an array', Array.isArray(rtJson.data));
    await assert('Includes transcript option', rtJson.data.some((t: any) => t.id === 'transcript'));
    await assert('Includes certificate option', rtJson.data.some((t: any) => t.id === 'certificate'));
    await assert('Includes enrollment_verification option', rtJson.data.some((t: any) => t.id === 'enrollment_verification'));
    await assert('Includes id_replacement option', rtJson.data.some((t: any) => t.id === 'id_replacement'));

    // Create a request
    let createdRequestId = 0;
    const createRes = await fetch(`${baseUrl}/student/requests`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        requestType: 'enrollment_verification',
        purpose: 'Visa / Embassy Application',
        reason: 'Proof of student status requested by consular office.',
        copiesRequested: 2,
        deliveryMethod: 'download'
      })
    });
    await assert('POST /student/requests returns 201 Created', createRes.status === 201);
    const createJson = await createRes.json();
    await assert('Response contains created request id', !!createJson.data?.id);
    await assert('Response contains generated requestNo', !!createJson.data?.requestNo);
    await assert('Created request status is "submitted"', createJson.data?.status === 'submitted');
    createdRequestId = createJson.data?.id;

    // Duplicate submission attempt
    const dupRes = await fetch(`${baseUrl}/student/requests`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        requestType: 'enrollment_verification',
        purpose: 'Duplicate attempt to check 409 conflict',
        deliveryMethod: 'download'
      })
    });
    await assert('Duplicate open request returns 409 Conflict', dupRes.status === 409);
    const dupJson = await dupRes.json();
    const errCode = dupJson.error?.code || dupJson.code;
    const errMsg = dupJson.error?.message || dupJson.message;
    await assert('Error code is DUPLICATE_OPEN_REQUEST', errCode === 'DUPLICATE_OPEN_REQUEST');
    await assert('Error message mentions existing request', errMsg?.includes('already exists'));

    // --- 6. Tab: My Requests & Cancellation Lifecycle ---
    console.log('\n--- 6. Tab: My Requests & Cancellation Lifecycle ---');
    const myReqsRes = await fetch(`${baseUrl}/student/requests`, { headers: authHeaders });
    await assert('GET /student/requests returns 200', myReqsRes.status === 200);
    const myReqsJson = await myReqsRes.json();
    await assert('Response contains requests array', Array.isArray(myReqsJson.data?.requests));
    await assert('Submitted request appears in My Requests list', myReqsJson.data?.requests.some((r: any) => r.id === createdRequestId));

    const singleReqRes = await fetch(`${baseUrl}/student/requests/${createdRequestId}`, { headers: authHeaders });
    await assert('GET /student/requests/:id returns 200', singleReqRes.status === 200);
    const singleReqJson = await singleReqRes.json();
    await assert('Fetched request has matching id', singleReqJson.data?.id === createdRequestId);
    await assert('Fetched request has matching status', singleReqJson.data?.status === 'submitted');

    // Cancel request
    const cancelRes = await fetch(`${baseUrl}/student/requests/${createdRequestId}/cancel`, {
      method: 'PATCH',
      headers: authHeaders
    });
    await assert('PATCH /student/requests/:id/cancel returns 200', cancelRes.status === 200);
    const cancelJson = await cancelRes.json();
    await assert('Cancellation success flag is true', cancelJson.data?.success === true);

    // Verify status is now cancelled
    const checkCancelRes = await fetch(`${baseUrl}/student/requests/${createdRequestId}`, { headers: authHeaders });
    const checkCancelJson = await checkCancelRes.json();
    await assert('Request status is now "cancelled"', checkCancelJson.data?.status === 'cancelled');

    // After cancellation, student is unblocked and can submit again
    const reSubmitRes = await fetch(`${baseUrl}/student/requests`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        requestType: 'enrollment_verification',
        purpose: 'Re-submitted verification request',
        deliveryMethod: 'download'
      })
    });
    await assert('Re-submitting same type after cancellation succeeds (201)', reSubmitRes.status === 201);

  } finally {
    server.close();
  }

  console.log('\n======================================================');
  console.log('📊 TEST EXECUTION SUMMARY');
  console.log('======================================================');
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  console.log(`Total Tests Run : ${results.length}`);
  console.log(`Passed          : ${totalPassed} ✅`);
  console.log(`Failed          : ${totalFailed} ❌`);
  console.log('======================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runPage7Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
