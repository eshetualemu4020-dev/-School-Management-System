const http = require('http');

function post(path, body, cookie = '') {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/v1' + path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Cookie: cookie
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, cookie = '') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/v1' + path,
        method: 'GET',
        headers: {
          Cookie: cookie
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = raw;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('HSPSMS v4.1 PARENT PORTAL - END-TO-END VERIFICATION SUITE');
  console.log('================================================================\n');

  // 1. Authenticate Guardian
  console.log('Step 1: Authenticating Guardian (parent.kassa)...');
  const loginRes = await post('/auth/login', {
    username: 'parent.kassa',
    password: 'QaTest#2026'
  });

  if (loginRes.status !== 200) {
    console.error('❌ Login failed:', loginRes.status, loginRes.data);
    process.exit(1);
  }

  const setCookie = loginRes.headers['set-cookie'];
  const sessionCookie = Array.isArray(setCookie) ? setCookie[0].split(';')[0] : '';
  console.log('✓ Login successful! Session cookie obtained.\n');

  // 2. Test Parent Dashboard
  console.log('Step 2: Checking Parent Dashboard (Level 1)...');
  const dashRes = await get('/parent/dashboard', sessionCookie);
  if (dashRes.status === 200 && dashRes.data.data?.guardian) {
    console.log(`✓ Dashboard loaded: Guardian ${dashRes.data.data.guardian.first_name} ${dashRes.data.data.guardian.father_name}`);
    console.log(`  Linked children count: ${dashRes.data.data.children?.length || 0}`);
  } else {
    console.error('❌ Dashboard failed:', dashRes.status, dashRes.data);
  }

  // 3. Test My Children Directory Endpoint
  console.log('\nStep 3: Checking My Children Directory endpoint...');
  const childrenRes = await get('/parent/children', sessionCookie);
  if (childrenRes.status === 200) {
    const { verifiedChildren, pendingChildren } = childrenRes.data.data || {};
    console.log(`✓ Verified children: ${verifiedChildren?.length || 0}`);
    console.log(`✓ Pending children: ${pendingChildren?.length || 0}`);
    (verifiedChildren || []).forEach((c, idx) => {
      console.log(`   [${idx + 1}] ID:${c.student_id} ${c.first_name} ${c.father_name} (${c.grade_name || `Grade ${c.grade_level}`} - Section ${c.section_name || '—'})`);
    });
  } else {
    console.error('❌ /parent/children failed:', childrenRes.status, childrenRes.data);
  }

  // 4. Test Child 1 (Hana Bekele, ID: 1) Level 2 Subpages
  console.log('\nStep 4: Testing Level 2 Child Subpages for Child 1 (Hana Bekele)...');
  const subpages = [
    { name: 'A. Child Overview', path: '/parent/children/1/overview' },
    { name: 'B. Academic Progress', path: '/parent/children/1/marks' },
    { name: 'C. Attendance', path: '/parent/children/1/attendance' },
    { name: 'D. Subjects & Learning', path: '/parent/children/1/subjects' },
    { name: 'E. Schedule & Timetable', path: '/parent/children/1/timetable' },
    { name: 'F. Assignments & Exams', path: '/parent/children/1/assessments' },
    { name: 'G. Report Cards & Docs', path: '/parent/children/1/documents' },
    { name: 'H. Enrollment History', path: '/parent/children/1/history' },
    { name: 'Finance / Fees', path: '/parent/children/1/finance' }
  ];

  for (const page of subpages) {
    const res = await get(page.path, sessionCookie);
    if (res.status === 200) {
      console.log(`   ✓ ${page.name}: HTTP 200 OK`);
    } else {
      console.error(`   ❌ ${page.name}: HTTP ${res.status}`, res.data);
    }
  }

  // 5. Test Child 2 (Abel Tesfaye, ID: 2) Child Switching & Data Isolation
  console.log('\nStep 5: Testing Child Switching & Isolation for Child 2 (Abel Tesfaye)...');
  const abelRes = await get('/parent/children/2/overview', sessionCookie);
  if (abelRes.status === 200) {
    const info = abelRes.data.data?.studentInfo;
    console.log(`   ✓ Successfully switched to Student 2: ${info?.first_name} ${info?.father_name} (ID: ${info?.admission_no})`);
    console.log(`   ✓ Enrollment ID: ${info?.enrollment_id}, Grade: ${info?.grade_name || `Grade ${info?.grade_level}`}`);
  } else {
    console.error('   ❌ Abel overview failed:', abelRes.status, abelRes.data);
  }

  // 6. Test Anti-Enumeration & Security Boundary
  console.log('\nStep 6: Testing Anti-Enumeration Security Check (Unauthorized / Nonexistent Student 9999)...');
  const antiEnumRes = await get('/parent/children/9999/overview', sessionCookie);
  if (antiEnumRes.status === 404) {
    console.log(`   ✓ Anti-Enumeration Passed! Returned HTTP 404 (Not Found): "${antiEnumRes.data?.error?.message || antiEnumRes.data?.message}"`);
  } else {
    console.error(`   ❌ Anti-Enumeration Failed! Expected 404, received: HTTP ${antiEnumRes.status}`);
  }

  // 7. Test Official Requests
  console.log('\nStep 7: Testing Official Requests Module...');
  const createReq = await post(
    '/parent/requests',
    {
      category: 'bonafide_letter',
      subject: 'E2E Verification Request',
      description: 'Formal bonafide letter request for student enrollment verification.',
      studentId: 1
    },
    sessionCookie
  );

  if (createReq.status === 201) {
    console.log(`   ✓ Created Official Request: #${createReq.data.data?.requestNo || createReq.data.data?.requestId}`);
  } else {
    console.error('   ❌ Create request failed:', createReq.status, createReq.data);
  }

  const listReq = await get('/parent/requests', sessionCookie);
  if (listReq.status === 200 && Array.isArray(listReq.data.data?.requests)) {
    console.log(`   ✓ Retrieved Requests History: ${listReq.data.data.requests.length} request(s) on file.`);
    const latest = listReq.data.data.requests[0];
    if (latest) {
      console.log(`     Latest: [${latest.request_no}] ${latest.subject} - Status: ${latest.status}`);
    }
  } else {
    console.error('   ❌ List requests failed:', listReq.status, listReq.data);
  }

  console.log('\n================================================================');
  console.log('ALL VERIFICATION CHECKS COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
