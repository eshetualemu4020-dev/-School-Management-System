import { AdminRepository } from './admin.repository';
import { AppError } from '../../middleware/errorHandler';

export class AdminService {
  private repo = new AdminRepository();

  // =========================================================================
  // PAGE 1: OVERVIEW
  // =========================================================================
  async getDashboardData() {
    const overview = await this.repo.getSchoolOverviewMetrics();
    const auditLogs = await this.repo.getRecentAuditLogs(10);
    const announcements = await this.repo.getAnnouncements(10);
    return { overview, recentAuditLogs: auditLogs, announcements };
  }

  // =========================================================================
  // PAGE 2: STUDENT MANAGEMENT
  // =========================================================================
  async getStudentOptions() {
    return this.repo.getStudentOptions();
  }

  async getStudentPhoto(id: number) {
    return this.repo.getStudentPhoto(id);
  }

  async listStudents(filters: {
    search?: string;
    gradeId?: number;
    sectionId?: number;
    status?: string;
    stream?: string;
    gender?: string;
    limit?: number;
    offset?: number;
    incompleteOnly?: boolean;
  }) {
    return this.repo.getStudents(filters);
  }

  async getStudentDetails(id: number) {
    const student = await this.repo.getStudentById(id);
    if (!student) {
      throw new AppError('Student record not found', 404, 'STUDENT_NOT_FOUND');
    }
    return student;
  }

  async registerStudent(payload: {
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    dateOfBirth: string;
    phone?: string;
    address?: string;
    sectionId: number;
    guardianName?: string;
    guardianPhone?: string;
    guardianRelation?: string;
    adminUserId: number;
    adminUsername: string;
    photo?: { originalName: string; mimeType: string; dataBase64: string };
  }) {
    if (!payload.firstName || !payload.fatherName || !payload.gender || !payload.dateOfBirth || !payload.sectionId) {
      throw new AppError('Missing required student admission fields.', 400, 'VALIDATION_ERROR');
    }
    if (Boolean(payload.guardianName?.trim()) !== Boolean(payload.guardianPhone?.trim())) {
      throw new AppError('Provide both the guardian name and phone number.', 400, 'GUARDIAN_CONTACT_INCOMPLETE');
    }
    if (payload.guardianName?.trim() && !payload.guardianRelation) {
      throw new AppError('Select the guardian relationship.', 400, 'GUARDIAN_RELATIONSHIP_REQUIRED');
    }
    const validRelationships = ['mother', 'father', 'guardian', 'sibling', 'relative', 'other'];
    if (payload.guardianName && payload.guardianRelation && !validRelationships.includes(payload.guardianRelation)) {
      throw new AppError('Select a valid guardian relationship.', 400, 'INVALID_GUARDIAN_RELATIONSHIP');
    }
    return this.repo.registerStudent(payload);
  }

  async updateStudent(id: number, payload: {
    firstName?: string;
    fatherName?: string;
    grandfatherName?: string;
    gender?: string;
    dateOfBirth?: string;
    phone?: string;
    address?: string;
    guardianName?: string;
    guardianPhone?: string;
    guardianRelation?: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    const validRelationships = ['mother', 'father', 'guardian', 'sibling', 'relative', 'other'];
    if (payload.guardianName?.trim() && !payload.guardianRelation) {
      throw new AppError('Select the guardian relationship.', 400, 'GUARDIAN_RELATIONSHIP_REQUIRED');
    }
    if (payload.guardianRelation && !validRelationships.includes(payload.guardianRelation)) {
      throw new AppError('Select a valid guardian relationship.', 400, 'INVALID_GUARDIAN_RELATIONSHIP');
    }
    return this.repo.updateStudent(id, payload);
  }

  async setStudentStatus(payload: {
    studentId: number;
    newStatus: 'active' | 'applicant' | 'transferred' | 'withdrawn' | 'graduated';
    reason: string;
    destinationSchool?: string;
    effectiveDate: string;
    sectionId?: number;
    adminUserId: number;
    adminUsername: string;
  }) {
    const validStatuses = ['applicant', 'active', 'transferred', 'withdrawn', 'graduated'];
    if (!validStatuses.includes(payload.newStatus)) {
      throw new AppError('Select a valid student status.', 400, 'INVALID_STUDENT_STATUS');
    }
    if (!payload.reason || !payload.reason.trim()) {
      throw new AppError('Reason is required when modifying student enrollment status.', 400, 'REASON_REQUIRED');
    }
    if (payload.newStatus === 'active' && !payload.sectionId) {
      throw new AppError('Select a section when activating a student.', 400, 'SECTION_REQUIRED');
    }
    const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(payload.effectiveDate)
      ? new Date(`${payload.effectiveDate}T00:00:00Z`)
      : null;
    if (!effectiveDate || Number.isNaN(effectiveDate.getTime()) || effectiveDate.toISOString().slice(0, 10) !== payload.effectiveDate) {
      throw new AppError('A valid effective date is required.', 400, 'INVALID_EFFECTIVE_DATE');
    }
    return this.repo.updateStudentStatus(payload);
  }

  async reassignStudentSection(payload: {
    studentId: number;
    newSectionId: number;
    adminUserId: number;
    adminUsername: string;
  }) {
    return this.repo.reassignStudentSection(payload);
  }

  async getTransfers() {
    return this.repo.getTransfersHistory();
  }

  // =========================================================================
  // PAGE 3: STAFF & USER MANAGEMENT
  // =========================================================================
  async listStaff(search?: string, staffType?: string, status?: string) {
    return this.repo.getStaff(search, staffType, status);
  }

  async createStaff(payload: {
    employeeNo: string;
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    phone?: string;
    email?: string;
    jobTitle: string;
    department: string;
    staffType: 'teacher' | 'administrator' | 'librarian' | 'accountant' | 'support' | 'other';
    hireDate?: string;
    createAccount?: boolean;
    username?: string;
    password?: string;
    roleCode?: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    if (!payload.employeeNo || !payload.firstName || !payload.fatherName || !payload.staffType) {
      throw new AppError('Employee number, first name, father name, and staff type are required.', 400, 'VALIDATION_ERROR');
    }
    return this.repo.createStaff(payload);
  }

  async updateStaff(id: number, payload: {
    phone?: string;
    email?: string;
    jobTitle?: string;
    department?: string;
    status?: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    return this.repo.updateStaff(id, payload);
  }

  async listUsers(search?: string, roleFilter?: string) {
    return this.repo.getAllUsers(search, roleFilter);
  }

  async createUser(payload: {
    username: string;
    email: string;
    phone?: string;
    password: string;
    roleCode: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    if (!payload.username || !payload.password || !payload.roleCode) {
      throw new AppError('Username, password, and role are required.', 400, 'VALIDATION_ERROR');
    }
    return this.repo.createUser(payload);
  }

  async setUserStatus(userId: number, status: 'active' | 'disabled') {
    if (status !== 'active' && status !== 'disabled') {
      throw new AppError('Invalid status value. Allowed: active, disabled', 400, 'INVALID_STATUS');
    }
    const updated = await this.repo.updateUserStatus(userId, status);
    if (!updated) {
      throw new AppError('User not found or status unchanged', 404, 'USER_NOT_FOUND');
    }
    return { success: true, userId, status };
  }

  async resetPassword(payload: {
    userId: number;
    newPassword: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    if (!payload.newPassword || payload.newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters.', 400, 'PASSWORD_TOO_SHORT');
    }
    return this.repo.resetUserPassword(payload);
  }

  async setUserRoles(payload: {
    userId: number;
    roleCodes: string[];
    adminUserId: number;
    adminUsername: string;
  }) {
    if (!payload.roleCodes || payload.roleCodes.length === 0) {
      throw new AppError('At least one role code must be specified.', 400, 'ROLE_REQUIRED');
    }
    return this.repo.updateUserRoles(payload);
  }

  async getRoles() {
    return this.repo.getAllRoles();
  }

  // =========================================================================
  // PAGE 4: ACADEMIC STRUCTURE AND CONFIGURATION
  // =========================================================================
  async getClasses() {
    return this.repo.getClassesSummary();
  }

  async getAcademicStructure() {
    return this.repo.getAcademicStructure();
  }

  async createAcademicYear(payload: {
    name: string;
    labelEc?: string;
    startDate: string;
    endDate: string;
  }) {
    if (!payload.name || !payload.startDate || !payload.endDate) {
      throw new AppError('Academic year name, start date, and end date are required.', 400, 'VALIDATION_ERROR');
    }
    return this.repo.createAcademicYear(payload);
  }

  async activateAcademicYear(id: number) {
    return this.repo.setActiveAcademicYear(id);
  }

  async createTerm(payload: {
    academicYearId: number;
    termNo: number;
    name: string;
    startDate: string;
    endDate: string;
  }) {
    return this.repo.createTerm(payload);
  }

  async activateTerm(id: number) {
    return this.repo.setActiveTerm(id);
  }

  async createSection(payload: {
    gradeId: number;
    academicYearId: number;
    name: string;
    stream: 'none' | 'natural_science' | 'social_science';
    capacity: number;
    homeroomStaffId?: number;
    classroomId?: number;
  }) {
    if (!payload.gradeId || !payload.name) {
      throw new AppError('Grade and section name are required.', 400, 'VALIDATION_ERROR');
    }
    return this.repo.createSection(payload);
  }

  async updateSection(id: number, payload: any) {
    return this.repo.updateSection(id, payload);
  }

  async createSubject(payload: {
    code: string;
    name: string;
    nameAm?: string;
  }) {
    if (!payload.code || !payload.name) {
      throw new AppError('Subject code and name are required.', 400, 'VALIDATION_ERROR');
    }
    return this.repo.createSubject(payload);
  }

  async updateSubject(id: number, payload: any) {
    return this.repo.updateSubject(id, payload);
  }

  async addGradeSubject(payload: {
    gradeId: number;
    subjectId: number;
    stream: 'all' | 'natural_science' | 'social_science';
    isCompulsory?: boolean;
    periodsPerWeek?: number;
  }) {
    return this.repo.addGradeSubject(payload);
  }

  async removeGradeSubject(id: number) {
    return this.repo.removeGradeSubject(id);
  }

  async getSettings() {
    return this.repo.getSystemSettings();
  }

  async updateSetting(key: string, value: any, adminUserId: number, adminUsername: string) {
    return this.repo.updateSystemSetting(key, value, adminUserId, adminUsername);
  }

  // =========================================================================
  // PAGE 5: TEACHING ASSIGNMENTS AND TIMETABLE
  // =========================================================================
  async getAssignments(academicYearId?: number, sectionId?: number, subjectId?: number) {
    const assignments = await this.repo.getTeachingAssignments(academicYearId, sectionId, subjectId);
    const unassigned = await this.repo.getUnassignedClasses();
    return { assignments, unassigned };
  }

  async createAssignment(payload: {
    staffId: number;
    subjectId: number;
    sectionId: number;
    academicYearId: number;
  }) {
    return this.repo.createTeachingAssignment(payload);
  }

  async deleteAssignment(id: number) {
    return this.repo.deleteTeachingAssignment(id);
  }

  async getTimetable(termId?: number, sectionId?: number, staffId?: number, roomId?: number) {
    return this.repo.getTimetable(termId, sectionId, staffId, roomId);
  }

  async createTimetableEntry(payload: {
    termId: number;
    sectionId: number;
    subjectId: number;
    staffId: number;
    roomId: number;
    timeSlotId: number;
  }) {
    return this.repo.createTimetableEntry(payload);
  }

  async deleteTimetableEntry(id: number) {
    return this.repo.deleteTimetableEntry(id);
  }

  async getTimeSlots() {
    return this.repo.getTimeSlots();
  }

  async createTimeSlot(payload: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    label: string;
  }) {
    return this.repo.createTimeSlot(payload);
  }

  // =========================================================================
  // PAGE 6: ATTENDANCE AND ACADEMIC RESULTS
  // =========================================================================
  async getAttendanceSummary(date?: string, sectionId?: number, gradeId?: number) {
    return this.repo.getAttendanceSummary(date, sectionId, gradeId);
  }

  async getAssessmentsOverview(academicYearId?: number, termId?: number, sectionId?: number, subjectId?: number) {
    return this.repo.getAssessmentsOverview(academicYearId, termId, sectionId, subjectId);
  }

  async approveMarks(assessmentId: number, adminUserId: number, adminUsername: string) {
    return this.repo.approveAssessmentMarks(assessmentId, adminUserId, adminUsername);
  }

  async getGradingScales() {
    return this.repo.getGradingScales();
  }

  // =========================================================================
  // PAGE 7: REPORTS, ANALYTICS, AND LIBRARY OVERVIEW
  // =========================================================================
  async getEnrollmentReport(academicYearId?: number) {
    return this.repo.getEnrollmentReport(academicYearId);
  }

  async getAttendanceReport(startDate?: string, endDate?: string, sectionId?: number) {
    return this.repo.getAttendanceReport(startDate, endDate, sectionId);
  }

  async getPerformanceReport(termId?: number, sectionId?: number) {
    return this.repo.getAcademicPerformanceReport(termId, sectionId);
  }

  async getStaffWorkloadReport() {
    return this.repo.getStaffWorkloadReport();
  }

  async getLibraryOverview() {
    return this.repo.getLibraryOverview();
  }

  // =========================================================================
  // PAGE 8: COMMUNICATIONS, AUDIT LOGS, AND PROFILE
  // =========================================================================
  async listAnnouncements(limit = 20) {
    return this.repo.getAnnouncements(limit);
  }

  async postAnnouncement(title: string, body: string, userId: number, status?: 'draft' | 'published', targetRole?: string) {
    if (!title || !title.trim() || !body || !body.trim()) {
      throw new AppError('Title and body are required for an announcement', 400, 'VALIDATION_ERROR');
    }
    const id = await this.repo.createAnnouncement({
      title: title.trim(),
      body: body.trim(),
      userId,
      status: status || 'published',
      targetRole: targetRole || 'all'
    });
    return { id, title, body, status: status || 'published' };
  }

  async setAnnouncementStatus(id: number, status: 'draft' | 'published' | 'archived') {
    return this.repo.updateAnnouncementStatus(id, status);
  }

  async deleteAnnouncement(id: number) {
    return this.repo.deleteAnnouncement(id);
  }

  async getAuditLogs(limit?: number, filters?: { actor?: string; action?: string; outcome?: string }) {
    return this.repo.getRecentAuditLogs(limit || 50, filters);
  }

  async getProfile(userId: number) {
    return this.repo.getAdminProfile(userId);
  }

  async updateProfile(userId: number, payload: { phone?: string; email?: string }) {
    return this.repo.updateAdminProfile(userId, payload);
  }

  async changePassword(userId: number, currentPass: string, newPass: string) {
    if (!currentPass || !newPass || newPass.length < 6) {
      throw new AppError('New password must be at least 6 characters long.', 400, 'INVALID_PASSWORD_LENGTH');
    }
    return this.repo.changeAdminPassword(userId, currentPass, newPass);
  }
}
