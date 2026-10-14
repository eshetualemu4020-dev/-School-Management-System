import { TeacherRepository } from './teacher.repository';
import { AppError } from '../../middleware/errorHandler';

export class TeacherService {
  private repo = new TeacherRepository();

  async getAssignedClasses(staffId: number, academicYearId?: number) {
    return this.repo.getAssignedClasses(staffId, academicYearId);
  }

  async getStudentsForSection(staffId: number, sectionId: number, isAdmin = false) {
    if (!isAdmin) {
      const isAssigned = await this.repo.verifyTeacherAssignment(staffId, sectionId);
      if (!isAssigned) {
        throw new AppError(
          'Unauthorized: You are not assigned to teach this section.',
          403,
          'FORBIDDEN_SECTION_ACCESS'
        );
      }
    }
    return this.repo.getStudentsForSection(sectionId);
  }

  async getTimetable(staffId: number) {
    return this.repo.getTimetable(staffId);
  }

  async getAnnouncements() {
    return this.repo.getAnnouncements();
  }

  async getDashboardOverview(staffId: number) {
    return this.repo.getDashboardOverview(staffId);
  }

  async getTeacherSubjects(staffId: number) {
    return this.repo.getTeacherSubjects(staffId);
  }

  async getAcademicYears() {
    return this.repo.getAcademicYears();
  }

  async getTerms(academicYearId?: number) {
    return this.repo.getTerms(academicYearId);
  }

  async getAttendanceReport(
    staffId: number,
    params: {
      sectionId: number;
      subjectId?: number;
      termId?: number;
      academicYearId?: number;
      startDate?: string;
      endDate?: string;
    },
    isAdmin = false
  ) {
    if (!isAdmin) {
      const isAssigned = await this.repo.verifyTeacherAssignment(staffId, params.sectionId, params.subjectId);
      if (!isAssigned) {
        throw new AppError(
          'Unauthorized: You are not assigned to this section/subject.',
          403,
          'FORBIDDEN_REPORT_ACCESS'
        );
      }
    }
    return this.repo.getAttendanceReport(staffId, params);
  }

  async getMarksReport(
    staffId: number,
    params: {
      sectionId: number;
      subjectId?: number;
      termId?: number;
      assessmentId?: number;
      academicYearId?: number;
    },
    isAdmin = false
  ) {
    if (!isAdmin) {
      const isAssigned = await this.repo.verifyTeacherAssignment(staffId, params.sectionId, params.subjectId);
      if (!isAssigned) {
        throw new AppError(
          'Unauthorized: You are not assigned to this section/subject.',
          403,
          'FORBIDDEN_REPORT_ACCESS'
        );
      }
    }
    return this.repo.getMarksReport(staffId, params);
  }

  async getClassPerformanceReport(
    staffId: number,
    params: {
      sectionId: number;
      subjectId?: number;
      termId?: number;
      assessmentId?: number;
    },
    isAdmin = false
  ) {
    if (!isAdmin) {
      const isAssigned = await this.repo.verifyTeacherAssignment(staffId, params.sectionId, params.subjectId);
      if (!isAssigned) {
        throw new AppError(
          'Unauthorized: You are not assigned to this section/subject.',
          403,
          'FORBIDDEN_REPORT_ACCESS'
        );
      }
    }
    return this.repo.getClassPerformanceReport(staffId, params);
  }

  async getStudentPerformanceReport(
    staffId: number,
    params: {
      sectionId: number;
      studentId?: number;
      subjectId?: number;
      termId?: number;
    },
    isAdmin = false
  ) {
    if (!isAdmin) {
      const isAssigned = await this.repo.verifyTeacherAssignment(staffId, params.sectionId, params.subjectId);
      if (!isAssigned) {
        throw new AppError(
          'Unauthorized: You are not assigned to this section/subject.',
          403,
          'FORBIDDEN_REPORT_ACCESS'
        );
      }
    }
    return this.repo.getStudentPerformanceReport(staffId, params);
  }

  async getAssessmentSummaryReport(
    staffId: number,
    params: {
      subjectId?: number;
      sectionId?: number;
      termId?: number;
      academicYearId?: number;
    }
  ) {
    return this.repo.getAssessmentSummaryReport(staffId, params);
  }
}
