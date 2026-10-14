import { ParentRepository } from './parent.repository';
import { AppError } from '../../middleware/errorHandler';

export class ParentService {
  private repo = new ParentRepository();

  private async getGuardian(userId: number) {
    const guardian = await this.repo.getGuardianByUserId(userId);
    if (!guardian) {
      throw new AppError('Guardian profile not found for this user account.', 404, 'GUARDIAN_NOT_FOUND');
    }
    return guardian;
  }

  async getDashboardData(userId: number) {
    const guardian = await this.getGuardian(userId);
    const children = await this.repo.getLinkedChildren(guardian.id);
    const announcements = await this.repo.getAnnouncements();

    let initialChildOverview = null;
    if (children.length > 0) {
      initialChildOverview = await this.repo.getChildOverview(children[0].student_id);
    }

    return {
      guardian,
      children,
      selectedChildOverview: initialChildOverview,
      announcements
    };
  }

  async getChildDetails(userId: number, studentId: number) {
    const guardian = await this.getGuardian(userId);
    const hasAccess = await this.repo.verifyChildAccess(guardian.id, studentId);
    if (!hasAccess) {
      throw new AppError('Access denied: You are not authorized to access records for this student.', 403, 'FORBIDDEN_CHILD_ACCESS');
    }

    const overview = await this.repo.getChildOverview(studentId);
    if (!overview) {
      throw new AppError('Child records not found.', 404, 'CHILD_NOT_FOUND');
    }

    const [attendance, marks, finance] = await Promise.all([
      this.repo.getChildAttendance(overview.studentInfo.enrollment_id),
      this.repo.getChildMarks(overview.studentInfo.enrollment_id),
      this.repo.getChildFinance(studentId)
    ]);

    return {
      overview,
      attendance,
      marks,
      finance
    };
  }
}
