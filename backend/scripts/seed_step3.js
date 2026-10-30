const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function seedStep3() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_SERVER || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DB || 'school_erp'
  });

  console.log('--- SEEDING CALENDAR EVENTS ---');
  const [existingEvents] = await conn.query('SELECT COUNT(*) as count FROM calendar_events WHERE academic_year_id = 3');
  if (existingEvents[0].count === 0) {
    const events = [
      [3, 'Ethiopian New Year (Enkutatash)', 'holiday', '2026-09-11', '2026-09-11', 'First day of the Ethiopian New Year 2019 E.C.', 30],
      [3, 'Meskel (Finding of True Cross)', 'holiday', '2026-09-27', '2026-09-27', 'National religious holiday and Demera celebration', 30],
      [3, 'Semester 1 Classes Begin', 'event', '2026-09-15', '2026-09-15', 'Official start of academic classes for all grade levels', 30],
      [3, 'Semester 1 Midterm Exam Week', 'exam', '2026-11-16', '2026-11-20', 'Midterm assessments for Grades 9-12 across all subjects', 30],
      [3, 'Ethiopian Christmas (Genna)', 'holiday', '2027-01-07', '2027-01-07', 'National holiday celebration of Genna', 30],
      [3, 'Timket (Ethiopian Epiphany)', 'holiday', '2027-01-19', '2027-01-20', 'National public and religious holiday', 30],
      [3, 'Semester 1 Final Examinations', 'exam', '2027-01-25', '2027-01-30', 'Comprehensive semester 1 exams and mark finalization', 30],
      [3, 'Inter-Semester Student Break', 'break', '2027-02-01', '2027-02-08', 'Mid-year recess for students and teacher grading period', 30],
      [3, 'Semester 2 Classes Resume', 'event', '2027-02-09', '2027-02-09', 'First day of instruction for Semester 2', 30],
      [3, 'Adwa Victory Commemoration', 'holiday', '2027-03-02', '2027-03-02', 'National victory anniversary of the Battle of Adwa', 30],
      [3, 'Ethiopian Good Friday (Siklet)', 'holiday', '2027-04-30', '2027-04-30', 'Religious holiday', 30],
      [3, 'Ethiopian Easter (Fasika)', 'holiday', '2027-05-02', '2027-05-02', 'National religious holiday', 30],
      [3, 'Semester 2 Final Examinations', 'exam', '2027-06-21', '2027-06-26', 'End-of-year promotional examinations', 30]
    ];

    for (const ev of events) {
      await conn.query(
        `INSERT INTO calendar_events (academic_year_id, title, event_type, start_date, end_date, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ev
      );
    }
    console.log(`Seeded ${events.length} calendar events for 2026/2027.`);
  } else {
    console.log(`Calendar events already present: ${existingEvents[0].count}`);
  }

  console.log('--- ENSURING TIMETABLE ENTRIES FOR SECTION 1 ---');
  // Check section 1 timetable entries
  const [existingTt] = await conn.query('SELECT COUNT(*) as count FROM timetable_entries WHERE section_id = 1');
  console.log(`Current Section 1 timetable entries: ${existingTt[0].count}`);

  // Add timetable entries for slots 2, 4, 5, 6 if missing
  const slotsToPopulate = [
    { term_id: 3, section_id: 1, subject_id: 2, staff_id: 183, room_id: 2, time_slot_id: 2 }, // Chemistry - Mon Period 2
    { term_id: 3, section_id: 1, subject_id: 1, staff_id: 5, room_id: 1, time_slot_id: 4 },   // Physics - Wed Period 3
    { term_id: 3, section_id: 1, subject_id: 2, staff_id: 183, room_id: 2, time_slot_id: 5 }, // Chemistry - Thu Period 1
    { term_id: 3, section_id: 1, subject_id: 1, staff_id: 5, room_id: 1, time_slot_id: 6 }    // Physics - Fri Period 2
  ];

  for (const s of slotsToPopulate) {
    try {
      const [exists] = await conn.query(
        'SELECT id FROM timetable_entries WHERE section_id = ? AND time_slot_id = ?',
        [s.section_id, s.time_slot_id]
      );
      if (exists.length === 0) {
        await conn.query(
          `INSERT INTO timetable_entries (term_id, section_id, subject_id, staff_id, room_id, time_slot_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [s.term_id, s.section_id, s.subject_id, s.staff_id, s.room_id, s.time_slot_id]
        );
        console.log(`Added timetable entry for slot ${s.time_slot_id}`);
      }
    } catch (e) {
      console.log(`Slot ${s.time_slot_id} skipped: ${e.message}`);
    }
  }

  // Also ensure student 82 (lijshet.ferede) has realistic attendance records matching student 1
  console.log('--- ENSURING ATTENDANCE RECORDS FOR ENROLLMENT 17 ---');
  const [stud82Att] = await conn.query('SELECT COUNT(*) as count FROM attendance_records WHERE enrollment_id = 17');
  if (stud82Att[0].count === 0) {
    const [hanaRecords] = await conn.query('SELECT * FROM attendance_records WHERE enrollment_id = 1 LIMIT 10');
    for (const r of hanaRecords) {
      await conn.query(
        `INSERT INTO attendance_records (session_id, enrollment_id, status_code, note, marked_by)
         VALUES (?, 17, ?, ?, ?)`,
        [r.session_id, r.status_code, r.note, r.marked_by]
      );
    }
    console.log(`Copied ${hanaRecords.length} attendance sessions for student 82 (enrollment 17).`);
  }

  await conn.end();
  console.log('Step 3 Seed complete.');
}

seedStep3().catch(console.error);
