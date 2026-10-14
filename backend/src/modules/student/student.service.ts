import { StudentRepository } from './student.repository';
import { AppError } from '../../middleware/errorHandler';

export class StudentService {
  private repo = new StudentRepository();

  async getDashboardData(userId: number) {
    const student = await this.repo.getStudentByUserId(userId);
    if (!student) {
      throw new AppError('Student profile not found for this user account.', 404, 'STUDENT_NOT_FOUND');
    }

    const [timetable, attendance, marks, assignments, reportCard, announcements] = await Promise.all([
      this.repo.getTimetableForSection(student.section_id),
      this.repo.getAttendanceHistory(student.enrollment_id),
      this.repo.getStudentMarks(student.enrollment_id),
      this.repo.getAssignments(student.section_id, student.enrollment_id),
      this.repo.getReportCardSnapshot(student.enrollment_id),
      this.repo.getAnnouncements()
    ]);

    return {
      profile: student,
      timetable,
      attendance,
      marks,
      assignments,
      reportCard,
      announcements
    };
  }

  async getProfile(userId: number) {
    const student = await this.repo.getStudentByUserId(userId);
    if (!student) {
      throw new AppError('Student record not found.', 404, 'STUDENT_NOT_FOUND');
    }
    return student;
  }
}
