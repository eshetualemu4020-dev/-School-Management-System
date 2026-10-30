import { pool } from '../src/config/database';

async function check() {
  const [users]: any = await pool.query(`
    SELECT u.id, u.username, u.email, r.code as role, s.id as student_id, s.admission_no, s.first_name, s.user_id as student_user_id, e.id as enrollment_id, e.status as enrollment_status
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    LEFT JOIN students s ON s.user_id = u.id
    LEFT JOIN enrollments e ON e.student_id = s.id
    WHERE r.code = 'student'
  `);
  console.log('STUDENT USERS IN DB:');
  console.table(users);

  const [allStudents]: any = await pool.query('SELECT id, admission_no, first_name, father_name, user_id FROM students LIMIT 15');
  console.log('STUDENTS IN students TABLE:');
  console.table(allStudents);

  const [allUsers]: any = await pool.query(`
    SELECT u.id, u.username, u.email, r.code as role, s.id as student_id
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    LEFT JOIN students s ON s.user_id = u.id
    ORDER BY u.id DESC LIMIT 15
  `);
  console.log('RECENT USERS IN users TABLE:');
  console.table(allUsers);

  process.exit(0);
}

check().catch((err) => {
  console.error(err);
  process.exit(1);
});
