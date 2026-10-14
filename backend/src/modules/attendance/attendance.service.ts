import { AttendanceRepository, AttendanceRecordInput } from './attendance.repository';
import { TeacherRepository } from '../teacher/teacher.repository';
import { AppError } from '../../middleware/errorHandler';

export class AttendanceService {
  private repo = new AttendanceRepository();
  private teacherRepo = new TeacherRepository();

  async getSession(sectionId: number, date: string, subjectId?: number) {
    const existing = await this.repo.findSession(sectionId, date, subjectId);
    if (!existing) {
      return null;
    }
    return this.repo.getSessionWithRecords(existing.id);
  }

  async getHistory(sectionId: number, startDate?: string, endDate?: string) {
    return this.repo.getAttendanceHistory(sectionId, startDate, endDate);
  }

  async recordAttendance(
    staffId: number,
    userId: number,
    username: string,
    sectionId: number,
    attendanceDate: string,
    subjectId: number | null,
    status: 'submitted' | 'locked',
    records: AttendanceRecordInput[]
  ) {
    // 1. Verify teacher is assigned to this section
    const isAssigned = await this.teacherRepo.verifyTeacherAssignment(staffId, sectionId, subjectId || undefined);
    if (!isAssigned) {
      throw new AppError(
        'Unauthorized: You are not assigned to record attendance for this section or subject.',
        403,
        'FORBIDDEN_TEACHER_ASSIGNMENT'
      );
    }

    if (!records || records.length === 0) {
      throw new AppError('No student attendance records provided.', 400, 'EMPTY_ROSTER');
    }

    // 2. Reject duplicate student entries in the payload
    const enrollmentIds = records.map((r) => r.enrollmentId);
    const uniqueIds = new Set(enrollmentIds);
    if (uniqueIds.size !== enrollmentIds.length) {
      throw new AppError(
        'Duplicate enrollment IDs found in attendance submission.',
        422,
        'DUPLICATE_STUDENT_ENTRIES'
      );
    }

    // 3. Verify students actually belong to the active roster of this section
    const activeStudents = await this.teacherRepo.getStudentsForSection(sectionId);
    const activeEnrollmentSet = new Set(activeStudents.map((s: any) => s.enrollment_id));

    for (const rec of records) {
      if (!activeEnrollmentSet.has(rec.enrollmentId)) {
        throw new AppError(
          `Enrollment ID ${rec.enrollmentId} does not belong to active students of section ${sectionId}.`,
          422,
          'INVALID_STUDENT_ENROLLMENT'
        );
      }
    }

    // 4. Execute atomic transaction
    const sessionId = await this.repo.saveAttendanceTransaction(
      staffId,
      userId,
      username,
      sectionId,
      attendanceDate,
      subjectId,
      status,
      records
    );

    return this.repo.getSessionWithRecords(sessionId);
  }
}
