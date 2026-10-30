import bcrypt from 'bcrypt';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../config/database';
import { AdminRepository } from './admin.repository';
import { AuthRepository } from '../auth/auth.repository';
import { AppError } from '../../middleware/errorHandler';
import { validatePasswordPolicy } from '../auth/security.utils';
import { BackupService } from './backup.service';
import { RecycleBinService } from './recycleBin.service';
import { DiagnosticsService } from './diagnostics.service';
import { approvalsService, ApprovalsFilter } from './approvals.service';
import { financeService } from './finance.service';
import { resultsPublishingService } from './resultsPublishing.service';

export class AdminService {
  private repo = new AdminRepository();
  private authRepo = new AuthRepository();
  private backupService = new BackupService();
  private recycleBinService = new RecycleBinService();
  private diagnosticsService = new DiagnosticsService();
  private approvalsService = approvalsService;
  private financeService = financeService;
  private resultsPublishingService = resultsPublishingService;

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
    if (payload.newStatus === 'transferred') {
      const destinationSchool = payload.destinationSchool?.trim() || '';
      if (!destinationSchool) throw new AppError('Destination school is required for a student transfer.', 400, 'DESTINATION_SCHOOL_REQUIRED');
      if (destinationSchool.length > 190) throw new AppError('Destination school must be 190 characters or fewer.', 400, 'DESTINATION_SCHOOL_TOO_LONG');
      payload.destinationSchool = destinationSchool;
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
  async listStaff(search?: string, staffType?: string, status?: string, options?: { limit?: number; offset?: number; sort?: string }) {
    return this.repo.getStaff(search, staffType, status, options);
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
    photo?: { originalName: string; mimeType: string; dataBase64: string };
  }) {
    if (!payload.employeeNo?.trim() || !payload.firstName?.trim() || !payload.fatherName?.trim() || !payload.staffType || !payload.jobTitle?.trim()) {
      throw new AppError('Employee number, first name, father name, staff type, and job title are required.', 400, 'VALIDATION_ERROR');
    }
    if (payload.createAccount) {
      if (!payload.username?.trim() || !payload.password || !payload.roleCode) {
        throw new AppError('Username, temporary password, and account role are required when provisioning a login.', 400, 'STAFF_LOGIN_FIELDS_REQUIRED');
      }
      const policy = validatePasswordPolicy(payload.password);
      if (!policy.valid) throw new AppError(policy.error || 'Choose a stronger temporary password.', 400, 'INVALID_PASSWORD_POLICY');
    }
    if (payload.photo) {
      const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(payload.photo.dataBase64 || '');
      if (!match || match[1] !== payload.photo.mimeType) {
        throw new AppError('Upload a valid JPEG or PNG staff photo.', 400, 'INVALID_STAFF_PHOTO');
      }
      const bytes = Buffer.from(match[2], 'base64');
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
        throw new AppError('Staff photo must be no larger than 5 MB.', 400, 'STAFF_PHOTO_TOO_LARGE');
      }
    }
    return this.repo.createStaff(payload);
  }

  async getStaffPhoto(staffId: number) {
    if (!Number.isSafeInteger(staffId) || staffId <= 0) {
      throw new AppError('A valid staff record is required.', 400, 'INVALID_STAFF_ID');
    }
    return this.repo.getStaffPhoto(staffId);
  }

  async saveStaffPhoto(payload: {
    staffId: number;
    originalName: string;
    mimeType: string;
    dataBase64: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    if (!Number.isSafeInteger(payload.staffId) || payload.staffId <= 0) {
      throw new AppError('A valid staff record is required.', 400, 'INVALID_STAFF_ID');
    }
    if (!['image/jpeg', 'image/png'].includes(payload.mimeType)) {
      throw new AppError('Upload a JPEG or PNG photo.', 400, 'INVALID_STAFF_PHOTO');
    }
    return this.repo.saveStaffPhoto(payload);
  }

  async updateStaff(id: number, payload: {
    employeeNo?: string;
    firstName?: string;
    fatherName?: string;
    grandfatherName?: string;
    gender?: 'female' | 'male';
    dateOfBirth?: string;
    phone?: string;
    email?: string;
    address?: string;
    jobTitle?: string;
    department?: string;
    staffType?: 'teacher' | 'administrator' | 'support' | 'librarian' | 'accountant' | 'other';
    hireDate?: string;
    endDate?: string;
    status?: 'active' | 'on_leave' | 'terminated';
    adminUserId: number;
    adminUsername: string;
  }) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('A valid staff record is required.', 400, 'INVALID_STAFF_ID');
    if (payload.status && !['active', 'on_leave', 'terminated'].includes(payload.status)) {
      throw new AppError('Select a valid employment status.', 400, 'INVALID_STAFF_STATUS');
    }
    for (const [field, value] of Object.entries({ employeeNo: payload.employeeNo, firstName: payload.firstName, fatherName: payload.fatherName, grandfatherName: payload.grandfatherName })) {
      if (value !== undefined && (value.trim().length > (field === 'employeeNo' ? 30 : 60) || (field !== 'grandfatherName' && !value.trim()))) {
        throw new AppError(`${field} is required and must be within the allowed length.`, 400, 'INVALID_STAFF_FIELD');
      }
    }
    if (payload.gender && !['female', 'male'].includes(payload.gender)) throw new AppError('Select a valid gender.', 400, 'INVALID_STAFF_GENDER');
    if (payload.staffType && !['teacher', 'administrator', 'support', 'librarian', 'accountant', 'other'].includes(payload.staffType)) throw new AppError('Select a valid staff category.', 400, 'INVALID_STAFF_TYPE');
    for (const [field, value] of Object.entries({ address: payload.address, dateOfBirth: payload.dateOfBirth, hireDate: payload.hireDate })) {
      if (value !== undefined && value.length > (field === 'address' ? 255 : 10)) throw new AppError(`Invalid ${field}.`, 400, 'INVALID_STAFF_FIELD');
    }
    for (const [field, value] of Object.entries({ dateOfBirth: payload.dateOfBirth, hireDate: payload.hireDate, endDate: payload.endDate })) {
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(`Enter ${field} as a valid date.`, 400, 'INVALID_STAFF_DATE');
    }
    if (payload.hireDate && payload.endDate && payload.endDate < payload.hireDate) {
      throw new AppError('End date cannot be earlier than the hire date.', 400, 'INVALID_STAFF_DATE_RANGE');
    }
    if (payload.phone !== undefined && payload.phone.length > 30) throw new AppError('Phone number must be 30 characters or fewer.', 400, 'INVALID_STAFF_PHONE');
    if (payload.email !== undefined && payload.email.length > 190) throw new AppError('Email must be 190 characters or fewer.', 400, 'INVALID_STAFF_EMAIL');
    if (payload.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) throw new AppError('Enter a valid staff email address.', 400, 'INVALID_STAFF_EMAIL');
    if (payload.jobTitle !== undefined && (!payload.jobTitle.trim() || payload.jobTitle.length > 100)) throw new AppError('Job title is required and must be 100 characters or fewer.', 400, 'INVALID_STAFF_JOB_TITLE');
    if (payload.department !== undefined && payload.department.length > 100) throw new AppError('Department must be 100 characters or fewer.', 400, 'INVALID_STAFF_DEPARTMENT');
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
    const username = payload.username.trim();
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
      throw new AppError('Username must be 3-32 characters and may only contain letters, numbers, dots, underscores, and hyphens.', 400, 'INVALID_USERNAME');
    }
    const email = (payload.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('A valid email address is required.', 400, 'INVALID_EMAIL');
    }
    const phone = payload.phone ? payload.phone.trim() : undefined;
    if (phone && !/^[0-9+\-\s()]{7,20}$/.test(phone)) {
      throw new AppError('Phone number must be 7-20 characters and may only contain digits, spaces, +, -, and parentheses.', 400, 'INVALID_PHONE');
    }
    const policy = validatePasswordPolicy(payload.password);
    if (!policy.valid) {
      throw new AppError(policy.error || 'Password must be at least 8 characters long and contain uppercase, lowercase, and numbers.', 400, 'INVALID_PASSWORD_POLICY');
    }
    return this.repo.createUser({ ...payload, username, email, phone });
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
    const policy = validatePasswordPolicy(payload.newPassword);
    if (!policy.valid) {
      throw new AppError(policy.error || 'Password must be at least 8 characters long and contain uppercase, lowercase, and numbers.', 400, 'INVALID_PASSWORD_POLICY');
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
    const uniqueRoleCodes = Array.from(new Set(payload.roleCodes.map((code) => code.trim()))).filter(Boolean);
    if (uniqueRoleCodes.length === 0) {
      throw new AppError('At least one valid role code must be specified.', 400, 'ROLE_REQUIRED');
    }
    const availableRoles = await this.repo.getAllRoles();
    const availableCodes = new Set(availableRoles.map((role) => role.code));
    const unknownRoles = uniqueRoleCodes.filter((code) => !availableCodes.has(code));
    if (unknownRoles.length > 0) {
      throw new AppError(`Unknown role code(s): ${unknownRoles.join(', ')}`, 400, 'UNKNOWN_ROLE_CODE');
    }
    return this.repo.updateUserRoles({ ...payload, roleCodes: uniqueRoleCodes });
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

  async createGrade(payload: { gradeLevel: number; displayName?: string; adminUserId: number; adminUsername: string }) {
    if (!Number.isInteger(payload.gradeLevel) || payload.gradeLevel < 9 || payload.gradeLevel > 12) {
      throw new AppError('Only Grades 9 through 12 may be configured.', 400, 'INVALID_GRADE_LEVEL');
    }
    const displayName = (payload.displayName || `Grade ${payload.gradeLevel}`).trim();
    if (!displayName || displayName.length > 40) {
      throw new AppError('Grade name must be between 1 and 40 characters.', 400, 'INVALID_GRADE_NAME');
    }
    return this.repo.createGrade({ ...payload, displayName });
  }

  async updateGrade(id: number, payload: { displayName?: string; isActive?: boolean; adminUserId: number; adminUsername: string }) {
    if (!Number.isSafeInteger(id) || id < 1) throw new AppError('Grade ID is invalid.', 400, 'INVALID_GRADE_ID');
    if (payload.displayName !== undefined && (typeof payload.displayName !== 'string' || !payload.displayName.trim() || payload.displayName.trim().length > 40)) {
      throw new AppError('Grade name must be between 1 and 40 characters.', 400, 'INVALID_GRADE_NAME');
    }
    if (payload.isActive !== undefined && typeof payload.isActive !== 'boolean') {
      throw new AppError('Grade active state must be true or false.', 400, 'INVALID_GRADE_STATUS');
    }
    if (payload.displayName === undefined && payload.isActive === undefined) {
      throw new AppError('Provide a grade name or active state to update.', 400, 'EMPTY_GRADE_UPDATE');
    }
    return this.repo.updateGrade(id, { ...payload, displayName: payload.displayName?.trim() });
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
    if (!Number.isSafeInteger(payload.gradeId) || payload.gradeId < 1 || !Number.isSafeInteger(payload.academicYearId) || payload.academicYearId < 1) {
      throw new AppError('Choose a valid grade and academic year.', 400, 'VALIDATION_ERROR');
    }
    if (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 40) {
      throw new AppError('Section name must be between 1 and 40 characters.', 400, 'VALIDATION_ERROR');
    }
    if (!Number.isInteger(payload.capacity) || payload.capacity < 1 || payload.capacity > 65535) {
      throw new AppError('Section capacity must be a positive whole number.', 400, 'VALIDATION_ERROR');
    }
    if (!['none', 'natural_science', 'social_science'].includes(payload.stream)) {
      throw new AppError('Choose a valid section stream.', 400, 'VALIDATION_ERROR');
    }
    const grade = (await this.repo.getGradeById(payload.gradeId)) as any;
    if (!grade || !grade.is_active) throw new AppError('Selected grade is not active.', 409, 'GRADE_INACTIVE');
    if ((Number(grade.grade_level) <= 10 && payload.stream !== 'none') || (Number(grade.grade_level) >= 11 && payload.stream === 'none')) {
      throw new AppError('Grades 9–10 use the common curriculum; Grades 11–12 require a Natural or Social stream.', 400, 'GRADE_STREAM_MISMATCH');
    }
    return this.repo.createSection({ ...payload, name: payload.name.trim() });
  }

  async updateSection(id: number, payload: any) {
    if (!Number.isSafeInteger(id) || id < 1) throw new AppError('Section ID is invalid.', 400, 'INVALID_SECTION_ID');
    if (payload.name !== undefined && (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 40)) {
      throw new AppError('Section name must be between 1 and 40 characters.', 400, 'INVALID_SECTION_NAME');
    }
    if (payload.capacity !== undefined && (!Number.isInteger(payload.capacity) || payload.capacity < 1 || payload.capacity > 65535)) {
      throw new AppError('Section capacity must be a positive whole number.', 400, 'INVALID_SECTION_CAPACITY');
    }
    if (payload.status !== undefined && !['active', 'closed'].includes(payload.status)) {
      throw new AppError('Section status must be active or closed.', 400, 'INVALID_SECTION_STATUS');
    }
    if (payload.name !== undefined) payload.name = payload.name.trim();
    return this.repo.updateSection(id, payload);
  }

  async createSubject(payload: {
    code: string;
    name: string;
    nameAm?: string;
    description?: string;
  }) {
    const code = typeof payload.code === 'string' ? payload.code.trim().toUpperCase() : '';
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!/^[A-Z0-9_-]{2,20}$/.test(code) || !name || name.length > 100) {
      throw new AppError('Subject code must be 2–20 letters, numbers, underscores or hyphens; name is required (up to 100 characters).', 400, 'VALIDATION_ERROR');
    }
    if (payload.nameAm !== undefined && (typeof payload.nameAm !== 'string' || payload.nameAm.length > 100)) {
      throw new AppError('Amharic subject name must not exceed 100 characters.', 400, 'VALIDATION_ERROR');
    }
    if (payload.description !== undefined && (typeof payload.description !== 'string' || payload.description.length > 500)) {
      throw new AppError('Subject description must not exceed 500 characters.', 400, 'VALIDATION_ERROR');
    }
    return this.repo.createSubject({ ...payload, code, name, description: payload.description?.trim() });
  }

  async updateSubject(id: number, payload: any) {
    if (!Number.isSafeInteger(id) || id < 1) throw new AppError('Subject ID is invalid.', 400, 'INVALID_SUBJECT_ID');
    if (payload.code !== undefined) {
      if (typeof payload.code !== 'string' || !/^[A-Za-z0-9_-]{2,20}$/.test(payload.code.trim())) throw new AppError('Subject code must be 2–20 letters, numbers, underscores or hyphens.', 400, 'INVALID_SUBJECT_CODE');
      payload.code = payload.code.trim().toUpperCase();
    }
    if (payload.name !== undefined && (typeof payload.name !== 'string' || !payload.name.trim() || payload.name.trim().length > 100)) throw new AppError('Subject name is required and must not exceed 100 characters.', 400, 'INVALID_SUBJECT_NAME');
    if (payload.nameAm !== undefined && (typeof payload.nameAm !== 'string' || payload.nameAm.length > 100)) throw new AppError('Amharic subject name must not exceed 100 characters.', 400, 'INVALID_SUBJECT_NAME_AM');
    if (payload.description !== undefined && (typeof payload.description !== 'string' || payload.description.length > 500)) throw new AppError('Subject description must not exceed 500 characters.', 400, 'INVALID_SUBJECT_DESCRIPTION');
    if (payload.status !== undefined && !['active', 'inactive'].includes(payload.status)) throw new AppError('Subject status must be active or inactive.', 400, 'INVALID_SUBJECT_STATUS');
    if (!['code', 'name', 'nameAm', 'description', 'status'].some((key) => payload[key] !== undefined)) throw new AppError('Provide at least one subject field to update.', 400, 'EMPTY_SUBJECT_UPDATE');
    if (payload.name !== undefined) payload.name = payload.name.trim();
    if (payload.description !== undefined) payload.description = payload.description.trim();
    return this.repo.updateSubject(id, payload);
  }

  async addGradeSubject(payload: {
    gradeId: number;
    subjectId: number;
    stream: 'all' | 'natural_science' | 'social_science';
    isCompulsory?: boolean;
    periodsPerWeek?: number;
    academicYearId?: number;
  }) {
    if (!Number.isSafeInteger(payload.gradeId) || payload.gradeId < 1 || !Number.isSafeInteger(payload.subjectId) || payload.subjectId < 1) throw new AppError('Choose a valid grade and subject.', 400, 'VALIDATION_ERROR');
    if (!['all', 'natural_science', 'social_science'].includes(payload.stream)) throw new AppError('Choose a valid curriculum stream.', 400, 'VALIDATION_ERROR');
    if (payload.periodsPerWeek !== undefined && (!Number.isInteger(payload.periodsPerWeek) || payload.periodsPerWeek < 1 || payload.periodsPerWeek > 10)) throw new AppError('Periods per week must be a whole number from 1 to 10.', 400, 'VALIDATION_ERROR');
    if (payload.academicYearId !== undefined && (!Number.isSafeInteger(payload.academicYearId) || payload.academicYearId < 1)) throw new AppError('Academic year ID is invalid.', 400, 'VALIDATION_ERROR');
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
    if (!Number.isInteger(Number(payload.dayOfWeek)) || Number(payload.dayOfWeek) < 1 || Number(payload.dayOfWeek) > 7 ||
        !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(payload.startTime) ||
        !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(payload.endTime) || payload.startTime >= payload.endTime ||
        typeof payload.label !== 'string' || !payload.label.trim() || payload.label.trim().length > 80) {
      throw new AppError('Provide a valid school day, label, and increasing start/end times.', 400, 'INVALID_TIME_SLOT');
    }
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

  async getAssessmentConfigurationOptions() { return this.repo.getAssessmentConfigurationOptions(); }

  async createAdminAssessment(payload: any) {
    if (!Number.isInteger(Number(payload.teachingAssignmentId)) || !Number.isInteger(Number(payload.termId)) || !Number.isInteger(Number(payload.assessmentTypeId)) ||
        typeof payload.title !== 'string' || !payload.title.trim() || payload.title.trim().length > 150 ||
        !Number.isFinite(Number(payload.maxScore)) || Number(payload.maxScore) <= 0 || !Number.isFinite(Number(payload.weight)) || Number(payload.weight) < 0 || Number(payload.weight) > 100 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(payload.assessmentDate)) throw new AppError('Assessment fields are invalid.', 400, 'INVALID_ASSESSMENT');
    return this.repo.createAdminAssessment({ ...payload, title: payload.title.trim(), maxScore: Number(payload.maxScore), weight: Number(payload.weight) });
  }

  async updateAdminAssessment(id: number, payload: any) {
    if (!Number.isInteger(id) || id < 1 || (payload.status && !['draft', 'open', 'closed'].includes(payload.status)) ||
        (payload.title !== undefined && (typeof payload.title !== 'string' || !payload.title.trim() || payload.title.trim().length > 150)) ||
        (payload.maxScore !== undefined && (!Number.isFinite(Number(payload.maxScore)) || Number(payload.maxScore) <= 0)) ||
        (payload.weight !== undefined && (!Number.isFinite(Number(payload.weight)) || Number(payload.weight) < 0 || Number(payload.weight) > 100)) ||
        (payload.assessmentDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(payload.assessmentDate))) throw new AppError('Assessment changes are invalid.', 400, 'INVALID_ASSESSMENT_UPDATE');
    return this.repo.updateAdminAssessment(id, payload);
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

  /**
   * Full teaching profile for the Teacher Management page: staff record, active
   * class/subject assignments, homeroom duties, timetable and a 30-day
   * staff-attendance summary.
   */
  async getTeacherProfile(staffId: number) {
    if (!Number.isSafeInteger(staffId) || staffId <= 0) {
      throw new AppError('A valid teacher record is required.', 400, 'INVALID_STAFF_ID');
    }
    const profile = await this.repo.getTeacherProfile(staffId);
    if (!profile) {
      throw new AppError('Teacher record not found.', 404, 'STAFF_NOT_FOUND');
    }
    if (profile.staff.staff_type !== 'teacher') {
      throw new AppError('This record is not a teaching staff member.', 400, 'NOT_A_TEACHER');
    }
    return profile;
  }

  async getTeacherAssignments(staffId: number) {
    if (!Number.isSafeInteger(staffId) || staffId <= 0) {
      throw new AppError('A valid teacher record is required.', 400, 'INVALID_STAFF_ID');
    }
    return this.repo.getTeacherAssignments(staffId);
  }

  // =========================================================================
  // STAFF QUALIFICATIONS & SUPPORTING DOCUMENTS
  // =========================================================================
  private static readonly QUALIFICATION_LEVELS = ['phd', 'masters', 'bachelors', 'diploma', 'certificate', 'high_school', 'other'];
  private static readonly DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
  private static readonly MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

  private assertQualificationFields(payload: {
    qualificationLevel?: string;
    title?: string;
    institution?: string;
    fieldOfStudy?: string;
    awardDate?: string;
    gradeOrClass?: string;
    registrationNo?: string;
    notes?: string;
  }, { requireCore }: { requireCore: boolean }) {
    const has = (value?: string) => value !== undefined;
    if (requireCore) {
      if (!payload.qualificationLevel || !payload.title?.trim() || !payload.institution?.trim()) {
        throw new AppError('Qualification level, title, and institution are required.', 400, 'VALIDATION_ERROR');
      }
    }
    if (has(payload.qualificationLevel) && !AdminService.QUALIFICATION_LEVELS.includes(payload.qualificationLevel as string)) {
      throw new AppError('Select a valid qualification level.', 400, 'INVALID_QUALIFICATION_LEVEL');
    }
    if (has(payload.title) && (!payload.title!.trim() || payload.title!.trim().length > 190)) {
      throw new AppError('Qualification title is required and must be 190 characters or fewer.', 400, 'INVALID_QUALIFICATION_TITLE');
    }
    if (has(payload.institution) && (!payload.institution!.trim() || payload.institution!.trim().length > 190)) {
      throw new AppError('Institution is required and must be 190 characters or fewer.', 400, 'INVALID_QUALIFICATION_INSTITUTION');
    }
    if (has(payload.fieldOfStudy) && payload.fieldOfStudy && payload.fieldOfStudy.length > 190) {
      throw new AppError('Field of study must be 190 characters or fewer.', 400, 'INVALID_QUALIFICATION_FIELD');
    }
    if (has(payload.gradeOrClass) && payload.gradeOrClass && payload.gradeOrClass.length > 60) {
      throw new AppError('Grade or class must be 60 characters or fewer.', 400, 'INVALID_QUALIFICATION_GRADE');
    }
    if (has(payload.registrationNo) && payload.registrationNo && payload.registrationNo.length > 80) {
      throw new AppError('Registration number must be 80 characters or fewer.', 400, 'INVALID_QUALIFICATION_REGISTRATION');
    }
    if (has(payload.notes) && payload.notes && payload.notes.length > 500) {
      throw new AppError('Notes must be 500 characters or fewer.', 400, 'INVALID_QUALIFICATION_NOTES');
    }
    if (payload.awardDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.awardDate)) {
        throw new AppError('Award date must use the YYYY-MM-DD format.', 400, 'INVALID_QUALIFICATION_AWARD_DATE');
      }
      if (payload.awardDate > new Date().toISOString().slice(0, 10)) {
        throw new AppError('Award date cannot be in the future.', 400, 'QUALIFICATION_AWARD_DATE_IN_FUTURE');
      }
    }
  }

  async listStaffQualifications(staffId: number) {
    if (!Number.isSafeInteger(staffId) || staffId <= 0) {
      throw new AppError('A valid staff record is required.', 400, 'INVALID_STAFF_ID');
    }
    const staff = await this.repo.getTeacherProfile(staffId);
    if (!staff) throw new AppError('Staff record not found.', 404, 'STAFF_NOT_FOUND');
    return this.repo.getStaffQualifications(staffId);
  }

  async createQualification(payload: {
    staffId: number;
    qualificationLevel: string;
    title: string;
    institution: string;
    fieldOfStudy?: string;
    awardDate?: string;
    gradeOrClass?: string;
    registrationNo?: string;
    notes?: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    if (!Number.isSafeInteger(payload.staffId) || payload.staffId <= 0) {
      throw new AppError('A valid staff record is required.', 400, 'INVALID_STAFF_ID');
    }
    this.assertQualificationFields(payload, { requireCore: true });
    return this.repo.createQualification(payload);
  }

  async updateQualification(id: number, payload: {
    qualificationLevel?: string;
    title?: string;
    institution?: string;
    fieldOfStudy?: string;
    awardDate?: string;
    gradeOrClass?: string;
    registrationNo?: string;
    notes?: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new AppError('A valid qualification is required.', 400, 'INVALID_QUALIFICATION_ID');
    }
    this.assertQualificationFields(payload, { requireCore: false });
    return this.repo.updateQualification(id, payload);
  }

  async deleteQualification(id: number, adminUserId: number, adminUsername: string) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new AppError('A valid qualification is required.', 400, 'INVALID_QUALIFICATION_ID');
    }
    return this.repo.deleteQualification(id, adminUserId, adminUsername);
  }

  async uploadQualificationDocument(payload: {
    qualificationId: number;
    originalName: string;
    mimeType: string;
    dataBase64: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    if (!Number.isSafeInteger(payload.qualificationId) || payload.qualificationId <= 0) {
      throw new AppError('A valid qualification is required.', 400, 'INVALID_QUALIFICATION_ID');
    }
    if (!AdminService.DOCUMENT_MIME_TYPES.includes(payload.mimeType)) {
      throw new AppError('Upload a PDF, JPEG, or PNG document.', 400, 'UNSUPPORTED_DOCUMENT_TYPE');
    }
    const match = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(payload.dataBase64 || ''));
    if (!match || match[1] !== payload.mimeType) {
      throw new AppError('The uploaded file contents do not match its declared type.', 400, 'INVALID_DOCUMENT_CONTENT');
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > AdminService.MAX_DOCUMENT_BYTES) {
      throw new AppError('The document must be no larger than 10 MB.', 400, 'DOCUMENT_TOO_LARGE');
    }
    // Signature checks so a renamed file cannot masquerade as a certificate.
    const isPdf = payload.mimeType === 'application/pdf' && bytes.subarray(0, 5).toString('latin1') === '%PDF-';
    const isJpeg = payload.mimeType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = payload.mimeType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!isPdf && !isJpeg && !isPng) {
      throw new AppError('The document contents do not match a supported PDF or image format.', 400, 'INVALID_DOCUMENT_CONTENT');
    }
    return this.repo.attachQualificationDocument({
      qualificationId: payload.qualificationId,
      originalName: payload.originalName || 'qualification-document',
      mimeType: payload.mimeType,
      bytes,
      adminUserId: payload.adminUserId,
      adminUsername: payload.adminUsername
    });
  }

  async setQualificationDocumentVerification(payload: {
    linkId: number;
    status: 'verified' | 'rejected';
    note?: string;
    adminUserId: number;
    adminUsername: string;
  }) {
    if (!Number.isSafeInteger(payload.linkId) || payload.linkId <= 0) {
      throw new AppError('A valid qualification document is required.', 400, 'INVALID_DOCUMENT_ID');
    }
    if (!['verified', 'rejected'].includes(payload.status)) {
      throw new AppError('Verification status must be verified or rejected.', 400, 'INVALID_VERIFICATION_STATUS');
    }
    if (payload.status === 'rejected' && !payload.note?.trim()) {
      throw new AppError('Provide a reason when rejecting a document.', 400, 'REJECTION_REASON_REQUIRED');
    }
    if (payload.note && payload.note.length > 255) {
      throw new AppError('Verification note must be 255 characters or fewer.', 400, 'INVALID_VERIFICATION_NOTE');
    }
    return this.repo.setQualificationDocumentVerification(payload);
  }

  async downloadQualificationDocument(linkId: number) {
    if (!Number.isSafeInteger(linkId) || linkId <= 0) {
      throw new AppError('A valid qualification document is required.', 400, 'INVALID_DOCUMENT_ID');
    }
    return this.repo.readQualificationDocumentFile(linkId);
  }

  async getQualificationAuditHistory(staffId: number, limit = 50) {
    if (!Number.isSafeInteger(staffId) || staffId <= 0) {
      throw new AppError('A valid staff record is required.', 400, 'INVALID_STAFF_ID');
    }
    return this.repo.getQualificationAuditHistory(staffId, Math.min(Math.max(limit, 1), 200));
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

  async postAnnouncement(title: string, body: string, userId: number, username: string, status?: 'draft' | 'published', targetRole?: string) {
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 190 || typeof body !== 'string' || !body.trim()) {
      throw new AppError('Title and body are required for an announcement', 400, 'VALIDATION_ERROR');
    }
    if (status !== undefined && !['draft', 'published'].includes(status)) throw new AppError('Announcement status must be draft or published.', 400, 'INVALID_ANNOUNCEMENT_STATUS');
    if (targetRole !== undefined && !['all', 'teacher', 'student', 'guardian'].includes(targetRole)) throw new AppError('Choose a valid announcement audience.', 400, 'INVALID_ANNOUNCEMENT_AUDIENCE');
    const created = await this.repo.createAnnouncement({
      title: title.trim(),
      body: body.trim(),
      userId,
      username,
      status: status || 'published',
      targetRole: targetRole || 'all'
    });
    return { ...created, title, body, status: status || 'published' };
  }

  async setAnnouncementStatus(id: number, status: 'draft' | 'published' | 'archived', publisherId: number, publisherUsername: string) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('A valid announcement is required.', 400, 'INVALID_ANNOUNCEMENT_ID');
    if (!['draft', 'published', 'archived'].includes(status)) throw new AppError('Select a valid announcement status.', 400, 'INVALID_ANNOUNCEMENT_STATUS');
    return this.repo.updateAnnouncementStatus(id, status, publisherId, publisherUsername);
  }

  async deleteAnnouncement(id: number, userId: number, username: string) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError('A valid announcement is required.', 400, 'INVALID_ANNOUNCEMENT_ID');
    return this.repo.deleteAnnouncement(id, userId, username);
  }

  async getAuditLogs(limit?: number, filters?: { actor?: string; action?: string; outcome?: string }) {
    return this.repo.getRecentAuditLogs(limit || 50, filters);
  }

  async getProfile(userId: number) {
    return this.repo.getAdminProfile(userId);
  }

  async getNotificationPreferences(userId: number) {
    return this.repo.getAdminNotificationPreferences(userId);
  }

  async saveNotificationPreferences(userId: number, username: string, input: any) {
    const keys = ['securityAlerts', 'guardianBroadcasts', 'attendanceDigest', 'systemErrors'];
    if (!input || keys.some((key) => typeof input[key] !== 'boolean')) {
      throw new AppError('Provide a boolean value for each notification preference.', 400, 'INVALID_NOTIFICATION_PREFERENCES');
    }
    return this.repo.saveAdminNotificationPreferences(userId, username, {
      securityAlerts: input.securityAlerts,
      guardianBroadcasts: input.guardianBroadcasts,
      attendanceDigest: input.attendanceDigest,
      systemErrors: input.systemErrors
    });
  }

  async getAdminProfilePhoto(userId: number) {
    return this.repo.getAdminProfilePhoto(userId);
  }

  async updateProfile(userId: number, payload: { phone?: string; email?: string; photo?: { originalName?: string; mimeType?: string; dataBase64?: string } }) {
    return this.repo.updateAdminProfile(userId, payload, userId);
  }

  async changePassword(userId: number, currentPass: string, newPass: string) {
    if (!currentPass || !newPass) {
      throw new AppError('Current and new password are required.', 400, 'PASSWORD_REQUIRED');
    }
    const policy = validatePasswordPolicy(newPass);
    if (!policy.valid) {
      throw new AppError(policy.error || 'Password must be at least 8 characters long and contain uppercase, lowercase, and numbers.', 400, 'INVALID_PASSWORD_POLICY');
    }
    return this.repo.changeAdminPassword(userId, currentPass, newPass);
  }

  // =========================================================================
  // SECURITY ADMINISTRATION
  // =========================================================================
  async getSecuritySessions(userId?: number) {
    return this.authRepo.getUserSessions(userId, true);
  }

  async revokeSession(sessionId: number) {
    return this.authRepo.revokeSessionById(sessionId, 'admin_revoked');
  }

  async revokeUserSessions(userId: number) {
    return this.authRepo.revokeAllUserSessions(userId, undefined, 'admin_revoked_all');
  }

  async getLoginAttempts(params: {
    page?: number;
    limit?: number;
    username?: string;
    success?: boolean;
    startDate?: string;
    endDate?: string;
  }) {
    return this.authRepo.getLoginAttempts(params);
  }

  async unlockUser(userId: number, adminUserId: number, adminUsername: string) {
    const unlocked = await this.authRepo.unlockUser(userId);
    return { success: unlocked };
  }

  async getRolePermissionsMatrix() {
    return this.authRepo.getRolePermissionsMatrix();
  }

  async updateRolePermissions(
    roleId: number,
    permissionIds: number[],
    adminUserId: number,
    adminUsername: string
  ) {
    return this.authRepo.updateRolePermissions(roleId, permissionIds, adminUserId, adminUsername);
  }

  // =========================================================================
  // PACKAGE 5: BACKUP, RESTORE, RECYCLE BIN, SYSTEM HEALTH
  // =========================================================================
  async verifyAdminPassword(userId: number, password: string): Promise<boolean> {
    const [userRows] = await pool.query<RowDataPacket[]>(
      `SELECT password_hash FROM users WHERE id = ?`,
      [userId]
    );
    if (userRows.length === 0) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }
    const isValid = await bcrypt.compare(password, userRows[0].password_hash);
    if (!isValid) {
      throw new AppError('Incorrect administrator password.', 401, 'INVALID_ADMIN_PASSWORD');
    }
    return true;
  }

  // Backups
  async getBackups() {
    return this.backupService.getBackups();
  }

  async createBackup(userId: number, type?: 'manual' | 'scheduled' | 'pre_close', notes?: string) {
    return this.backupService.createBackup(userId, type, notes);
  }

  async getBackupById(id: number) {
    return this.backupService.getBackupById(id);
  }

  async verifyBackupChecksum(id: number) {
    return this.backupService.verifyChecksum(id);
  }

  async restoreBackup(id: number, userId: number, confirmationWord: string, adminPassword?: string) {
    if (adminPassword) {
      await this.verifyAdminPassword(userId, adminPassword);
    }
    return this.backupService.restoreBackup(id, userId, confirmationWord);
  }

  async deleteBackup(id: number, userId: number) {
    return this.backupService.deleteBackup(id, userId);
  }

  // Recycle Bin
  async getRecycleBinItems(entityType?: string, page = 1, limit = 25) {
    return this.recycleBinService.getRecycleBinItems(entityType, page, limit);
  }

  async restoreRecycleBinItem(entityType: string, id: number, userId: number) {
    return this.recycleBinService.restoreItem(entityType, id, userId);
  }

  async purgeRecycleBinItem(entityType: string, id: number, userId: number, adminPassword?: string) {
    if (adminPassword) {
      await this.verifyAdminPassword(userId, adminPassword);
    }
    return this.recycleBinService.purgeItem(entityType, id, userId);
  }

  async purgeAllExpiredRecycleBin(userId: number, adminPassword?: string) {
    if (adminPassword) {
      await this.verifyAdminPassword(userId, adminPassword);
    }
    return this.recycleBinService.purgeAllExpired(userId);
  }

  // System Diagnostics
  async getSystemDiagnostics() {
    return this.diagnosticsService.getDiagnostics();
  }

  // Package 3: Approvals Queue
  async listApprovals(filters: ApprovalsFilter) {
    return this.approvalsService.listApprovals(filters);
  }

  async getApprovalsSummary() {
    return this.approvalsService.getSummary();
  }

  async getApprovalById(id: number) {
    return this.approvalsService.getApprovalById(id);
  }

  async createApproval(data: any) {
    return this.approvalsService.createApproval(data);
  }

  async decideApproval(id: number, decision: { action: 'approve' | 'reject'; decisionNote?: string }, deciderUserId: number, deciderUsername: string) {
    return this.approvalsService.decideApproval(id, decision, deciderUserId, deciderUsername);
  }

  async cancelApproval(id: number, userId: number) {
    return this.approvalsService.cancelApproval(id, userId);
  }

  // =========================================================================
  // PACKAGE 1: FINANCE & FEES
  // =========================================================================
  async getFinanceOverview() {
    return this.financeService.getOverview();
  }

  async getFeeCategories() {
    return this.financeService.getFeeCategories();
  }

  async createFeeCategory(data: any, userId: number, username: string) {
    return this.financeService.createFeeCategory(data, userId, username);
  }

  async getFeeStructures(academicYearId?: number) {
    return this.financeService.getFeeStructures(academicYearId);
  }

  async createFeeStructure(data: any, userId: number) {
    return this.financeService.createFeeStructure(data, userId);
  }

  async getInvoices(filters: any) {
    return this.financeService.getInvoices(filters);
  }

  async getInvoiceById(id: number) {
    return this.financeService.getInvoiceById(id);
  }

  async createInvoice(data: any, userId: number) {
    return this.financeService.createInvoice(data, userId);
  }

  async voidInvoice(id: number, reason: string, userId: number) {
    return this.financeService.voidInvoice(id, reason, userId);
  }

  async getPayments(filters: any) {
    return this.financeService.getPayments(filters);
  }

  async recordPayment(data: any, userId: number) {
    return this.financeService.recordPayment(data, userId);
  }

  async getScholarships() {
    return this.financeService.getScholarships();
  }

  async createScholarship(data: any, userId: number) {
    return this.financeService.createScholarship(data, userId);
  }

  // =========================================================================
  // PACKAGE 4: RESULTS PUBLISHING & REPORT CARDS
  // =========================================================================
  async getPublications(filters: any) {
    return this.resultsPublishingService.getPublications(filters);
  }

  async generateDraft(data: any, userId: number) {
    return this.resultsPublishingService.generateDraft(data, userId);
  }

  async submitPublication(id: number, userId: number) {
    return this.resultsPublishingService.submitPublication(id, userId);
  }

  async approvePublication(id: number, userId: number) {
    return this.resultsPublishingService.approvePublication(id, userId);
  }

  async publishPublication(id: number, userId: number) {
    return this.resultsPublishingService.publishPublication(id, userId);
  }

  async withdrawPublication(id: number, reason: string, userId: number) {
    return this.resultsPublishingService.withdrawPublication(id, reason, userId);
  }

  async getSectionReportCards(publicationId: number) {
    return this.resultsPublishingService.getSectionReportCards(publicationId);
  }

  async getStudentReportCard(enrollmentId: number, termId?: number) {
    return this.resultsPublishingService.getStudentReportCard(enrollmentId, termId);
  }
}



