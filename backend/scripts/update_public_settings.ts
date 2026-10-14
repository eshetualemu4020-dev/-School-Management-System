import { pool } from '../src/config/database';

async function updateSettings() {
  console.log('🔄 Updating system_settings with production-grade school info...');
  
  const updates = [
    { key: 'school.name', val: 'Ketema Nigus Secondary & Preparatory School' },
    { key: 'school.tagline', val: 'Excellence in Secondary & Preparatory Education (Grades 9–12)' },
    { key: 'school.motto', val: 'Knowledge, Integrity and National Leadership' },
    { key: 'school.address', val: 'Kebele 14, Main Campus, Harar, Ethiopia' },
    { key: 'school.phone', val: '+251 25 666 1234' },
    { key: 'school.email', val: 'admissions@ketemanigus.edu.et' },
    { key: 'school.hero_title', val: 'Nurturing Ethiopia’s Next Generation of Leaders' },
    { key: 'school.hero_subtitle', val: 'Premier secondary education featuring specialized Natural Science & Social Science preparatory streams, modern digital classrooms, and holistic student development.' },
    { key: 'site.home.cta_label', val: 'Apply for 2026/27 Admission' }
  ];

  for (const item of updates) {
    await pool.query(
      `INSERT INTO system_settings (setting_key, value_json, description)
       VALUES (?, ?, 'School institutional setting')
       ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)`,
      [item.key, JSON.stringify(item.val)]
    );
  }

  // Also check if we can insert high school public announcements if only 2 exist
  const [userRows] = await pool.query<any[]>('SELECT id FROM users ORDER BY id ASC LIMIT 1');
  const authorId = userRows[0]?.id;

  const [existing] = await pool.query<any[]>('SELECT COUNT(*) as count FROM announcements WHERE status = "published"');
  if (authorId && existing[0]?.count <= 2) {
    await pool.query(
      `INSERT INTO announcements (title, body, status, created_by, published_by, published_at)
       VALUES 
       (
         '2026/27 Academic Year Admission & Stream Registration Open',
         'Prospective Grade 9 applicants and incoming Grade 11 preparatory stream candidates (Natural & Social Sciences) may now submit documents online or visit the registrar office at Main Campus.',
         'published',
         ?,
         ?,
         NOW()
       ),
       (
         'National Examination Prep & STEM Laboratories Enhancement',
         'Supplementary weekend tutorial sessions and upgraded Physics, Chemistry, and ICT laboratory schedules have commenced for Grade 12 students.',
         'published',
         ?,
         ?,
         NOW()
       )`,
      [authorId, authorId, authorId, authorId]
    );
    console.log('✅ Added institutional announcements.');
  }

  console.log('✅ System settings successfully updated in MySQL database.');
  process.exit(0);
}

updateSettings().catch((err) => {
  console.error('Error updating settings:', err);
  process.exit(1);
});
