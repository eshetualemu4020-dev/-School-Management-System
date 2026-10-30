import { StudentRepository } from '../src/modules/student/student.repository';
import { StudentService } from '../src/modules/student/student.service';

async function test() {
  const repo = new StudentRepository();
  const service = new StudentService();

  console.log('Testing student 325 (lijshet.ferede):');
  const student = await repo.getStudentByUserId(325);
  console.log('Student record:', student);

  const dash = await service.getDashboardData(325);
  console.log('Dashboard data for 325:', {
    profile: dash.profile.first_name,
    admission_no: dash.profile.admission_no,
    enrollment_id: dash.profile.enrollment_id,
    timetable_count: dash.timetable.length,
    attendance_rate: dash.attendance.summary.rate,
    announcements_count: dash.announcements.length
  });

  console.log('\nTesting student 9 (student.hana):');
  const hanaDash = await service.getDashboardData(9);
  console.log('Dashboard data for Hana:', {
    profile: hanaDash.profile.first_name,
    admission_no: hanaDash.profile.admission_no,
    enrollment_id: hanaDash.profile.enrollment_id,
    timetable_count: hanaDash.timetable.length,
    attendance_rate: hanaDash.attendance.summary.rate,
    announcements_count: hanaDash.announcements.length
  });

  process.exit(0);
}

test().catch((err) => {
  console.error(err);
  process.exit(1);
});
