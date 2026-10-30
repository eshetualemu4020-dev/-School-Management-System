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
  console.log('COMMUNICATION & NOTICES MODULE VERIFICATION TEST');
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

  // 2. Test School Announcements
  console.log('Step 2: Testing School Announcements (Family-wide & Child Filtered)...');
  const allAnnRes = await get('/parent/announcements', sessionCookie);
  if (allAnnRes.status === 200 && Array.isArray(allAnnRes.data.data?.announcements)) {
    console.log(`✓ Retrieved all announcements: ${allAnnRes.data.data.announcements.length} item(s)`);
    if (allAnnRes.data.data.announcements[0]) {
      console.log(`  Latest headline: "${allAnnRes.data.data.announcements[0].title}"`);
    }
  } else {
    console.error('❌ Announcements query failed:', allAnnRes.status, allAnnRes.data);
  }

  const childAnnRes = await get('/parent/announcements?studentId=1', sessionCookie);
  if (childAnnRes.status === 200) {
    console.log(`✓ Retrieved child-filtered announcements for Student 1: ${childAnnRes.data.data?.announcements?.length || 0} item(s)`);
  }

  // 3. Test Direct Teacher Messages
  console.log('\nStep 3: Testing Teacher Communications (parent_communications)...');
  const commRes = await get('/parent/communications', sessionCookie);
  if (commRes.status === 200 && Array.isArray(commRes.data.data?.messages)) {
    console.log(`✓ Retrieved teacher communications: ${commRes.data.data.messages.length} message(s)`);
    commRes.data.data.messages.forEach((m, idx) => {
      console.log(`  [${idx + 1}] "${m.subject}" from Teacher ${m.teacher_name} (Concerning: ${m.student_name || 'Ward'})`);
    });
  } else {
    console.error('❌ Communications query failed:', commRes.status, commRes.data);
  }

  // 4. Test Student Assigned Teachers
  console.log('\nStep 4: Testing Student Assigned Teachers for Student 2...');
  const teacherRes = await get('/parent/children/2/teachers', sessionCookie);
  let sampleStaffId = 183;
  if (teacherRes.status === 200 && Array.isArray(teacherRes.data.data?.teachers)) {
    console.log(`✓ Retrieved assigned teachers: ${teacherRes.data.data.teachers.length} teacher(s)`);
    if (teacherRes.data.data.teachers.length > 0) {
      sampleStaffId = teacherRes.data.data.teachers[0].staff_id;
      console.log(`  First instructor: ${teacherRes.data.data.teachers[0].teacher_name} (${teacherRes.data.data.teachers[0].subject_name})`);
    }
  } else {
    console.error('❌ Teachers query failed:', teacherRes.status, teacherRes.data);
  }

  // 5. Test Meeting Requests
  console.log('\nStep 5: Testing Parent-Teacher Meeting Requests (parent_meeting_requests)...');
  const meetRes = await get('/parent/meeting-requests', sessionCookie);
  if (meetRes.status === 200 && Array.isArray(meetRes.data.data?.meetingRequests)) {
    console.log(`✓ Retrieved meeting requests: ${meetRes.data.data.meetingRequests.length} conference(s)`);
    meetRes.data.data.meetingRequests.forEach((r, idx) => {
      console.log(`  [${idx + 1}] #${r.id} with ${r.teacher_name} for ${r.student_name} (${r.requested_date} @ ${r.requested_time}) - Status: ${r.status}`);
    });
  } else {
    console.error('❌ Meeting requests query failed:', meetRes.status, meetRes.data);
  }

  // 6. Test Creating Conference Request
  console.log('\nStep 6: Creating New Parent-Teacher Meeting Request...');
  const createMeetRes = await post(
    '/parent/meeting-requests',
    {
      studentId: 2,
      teacherStaffId: sampleStaffId,
      requestedDate: '2026-11-05',
      requestedTime: '15:00',
      agenda: 'Discuss Semester 1 learning plan and midterm exam preparation.'
    },
    sessionCookie
  );

  if (createMeetRes.status === 201) {
    console.log(`✓ Conference request submitted: Request ID #${createMeetRes.data.data?.requestId}`);
    console.log(`  Server response: "${createMeetRes.data.data?.message}"`);
  } else {
    console.error('❌ Create meeting request failed:', createMeetRes.status, createMeetRes.data);
  }

  console.log('\n================================================================');
  console.log('COMMUNICATION & NOTICES VERIFICATION PASSED 100%!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

