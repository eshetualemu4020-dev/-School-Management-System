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

  async getTimetable(staffId: number, sectionId?: number) {
    return this.repo.getTimetable(staffId, sectionId);
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

  // Extended Teacher Portal Services
  async getDashboardExtended(staffId: number, userId: number) {
    return this.repo.getDashboardExtended(staffId, userId);
  }

  async getAttendanceHistory(staffId: number, sectionId: number, startDate?: string, endDate?: string) {
    return this.repo.getAttendanceHistory(staffId, sectionId, startDate, endDate);
  }

  async requestAttendanceCorrection(staffId: number, userId: number, payload: any) {
    return this.repo.requestAttendanceCorrection(staffId, userId, payload);
  }

  async getRepeatedAbsences(staffId: number, sectionId: number) {
    return this.repo.getRepeatedAbsences(staffId, sectionId);
  }

  async getStudentAttendanceDetail(staffId: number, sectionId: number, studentId: number) {
    return this.repo.getStudentAttendanceDetail(staffId, sectionId, studentId);
  }

  async requestMarkCorrection(staffId: number, userId: number, payload: any) {
    return this.repo.requestMarkCorrection(staffId, userId, payload);
  }

  async getMarksHistory(staffId: number, assessmentId: number) {
    return this.repo.getMarksHistory(staffId, assessmentId);
  }

  async getMissingMarks(staffId: number, assessmentId: number) {
    return this.repo.getMissingMarks(staffId, assessmentId);
  }

  async getClassDetail(staffId: number, sectionId: number) {
    return this.repo.getClassDetail(staffId, sectionId);
  }

  async getStudentProfileScoped(staffId: number, studentId: number) {
    return this.repo.getStudentProfileScoped(staffId, studentId);
  }

  async getHomeroomSection(staffId: number) {
    return this.repo.getHomeroomSection(staffId);
  }

  async getSubjectsDetailed(staffId: number) {
    return this.repo.getSubjectsDetailed(staffId);
  }

  async getAssignmentsList(staffId: number, filters?: any) {
    return this.repo.getAssignmentsList(staffId, filters);
  }

  async createAssignment(staffId: number, userId: number, payload: any) {
    return this.repo.createAssignment(staffId, userId, payload);
  }

  async getAssignmentSubmissions(staffId: number, assignmentId: number) {
    return this.repo.getAssignmentSubmissions(staffId, assignmentId);
  }

  async gradeSubmission(staffId: number, userId: number, submissionId: number, payload: any) {
    return this.repo.gradeSubmission(staffId, userId, submissionId, payload);
  }

  async getLearningResources(
    staffId: number,
    filters?: { sectionId?: number; subjectId?: number; search?: string }
  ) {
    return this.repo.getLearningResources(staffId, filters);
  }

  async createLearningResource(staffId: number, userId: number, payload: any) {
    return this.repo.createLearningResource(staffId, userId, payload);
  }

  async getLearningResourceFile(staffId: number, resourceId: number) {
    return this.repo.getLearningResourceFile(staffId, resourceId);
  }

  async updateLearningResource(staffId: number, userId: number, resourceId: number, payload: any) {
    return this.repo.updateLearningResource(staffId, userId, resourceId, payload);
  }

  async deleteLearningResource(staffId: number, resourceId: number) {
    return this.repo.deleteLearningResource(staffId, resourceId);
  }

  async getDisciplineRecords(
    userId: number,
    filters?: {
      sectionId?: number;
      severity?: string;
      category?: string;
      search?: string;
    }
  ) {
    return this.repo.getDisciplineRecords(userId, filters);
  }

  async reportDisciplineIncident(staffId: number, userId: number, payload: any) {
    return this.repo.reportDisciplineIncident(staffId, userId, payload);
  }

  async updateDisciplineRecord(staffId: number, userId: number, recordId: number, payload: any) {
    return this.repo.updateDisciplineRecord(staffId, userId, recordId, payload);
  }

  async deleteDisciplineRecord(staffId: number, userId: number, recordId: number) {
    return this.repo.deleteDisciplineRecord(staffId, userId, recordId);
  }

  async getContactableParents(staffId: number) {
    return this.repo.getContactableParents(staffId);
  }

  async getCommunications(
    staffId: number,
    filters?: {
      search?: string;
      recipientRole?: string;
    }
  ) {
    return this.repo.getCommunications(staffId, filters);
  }

  async sendCommunication(staffId: number, userId: number, payload: any) {
    return this.repo.sendCommunication(staffId, userId, payload);
  }

  async deleteCommunication(staffId: number, messageId: number) {
    return this.repo.deleteCommunication(staffId, messageId);
  }

  async getMeetingRequests(
    staffId: number,
    filters?: {
      status?: string;
      search?: string;
    }
  ) {
    return this.repo.getMeetingRequests(staffId, filters);
  }

  async createMeetingRequest(staffId: number, payload: any) {
    return this.repo.createMeetingRequest(staffId, payload);
  }

  async updateMeetingRequest(staffId: number, meetingId: number, payload: any) {
    return this.repo.updateMeetingRequest(staffId, meetingId, payload);
  }

  async deleteMeetingRequest(staffId: number, meetingId: number) {
    return this.repo.deleteMeetingRequest(staffId, meetingId);
  }

  async getMyRequests(
    userId: number,
    filters?: {
      status?: string;
      type?: string;
      search?: string;
    }
  ) {
    return this.repo.getMyRequests(userId, filters);
  }

  async createTeacherRequest(userId: number, staffId: number, payload: any) {
    return this.repo.createTeacherRequest(userId, staffId, payload);
  }

  async cancelMyRequest(userId: number, requestId: number) {
    return this.repo.cancelMyRequest(userId, requestId);
  }

  async getStaffAttendanceHistory(
    staffId: number,
    filters?: {
      status?: string;
      startDate?: string;
      endDate?: string;
    }
  ) {
    return this.repo.getStaffAttendanceHistory(staffId, filters);
  }

  async getMyLeaveApplications(userId: number) {
    return this.repo.getMyLeaveApplications(userId);
  }

  async applyForLeave(staffId: number, userId: number, payload: any) {
    return this.repo.applyForLeave(staffId, userId, payload);
  }

  async cancelLeaveApplication(userId: number, requestId: number) {
    return this.repo.cancelMyRequest(userId, requestId);
  }

  async getTeacherProfile(staffId: number, userId: number) {
    return this.repo.getTeacherProfile(staffId, userId);
  }

  async revokeSession(userId: number, sessionId: number) {
    return this.repo.revokeSession(userId, sessionId);
  }
}

