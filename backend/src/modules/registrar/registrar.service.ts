import { RegistrarRepository } from './registrar.repository';
import { AppError } from '../../middleware/errorHandler';
import { randomUUID } from 'crypto';

const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

async function withDatabaseErrors<T>(operation: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (error instanceof AppError) throw error;
    const databaseCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    console.error('Registrar operation failed.', { operation, databaseCode });
    throw new AppError(
      'Unable to complete the requested Registrar operation. Please try again or contact support.',
      500,
      'REGISTRAR_OPERATION_FAILED'
    );
  }
}

export class RegistrarService {
  private repo = new RegistrarRepository();

  async getDashboardData() {
    return withDatabaseErrors('dashboard.read', async () => {
      const metrics = await this.repo.getDashboardMetrics();
      const sections = await this.repo.getSectionsWithAvailability();
      return { metrics, sections, recentAdmissions: metrics.recentAdmissions };
    });
  }

  async listStudents(search?: string, sectionId?: number, status?: string) {
    if (sectionId !== undefined && (!Number.isSafeInteger(sectionId) || sectionId < 1)) {
      throw new AppError('Section ID must be a positive integer.', 400, 'VALIDATION_ERROR');
    }
    const statuses = ['applicant', 'active', 'transferred', 'withdrawn', 'graduated'];
    if (status && !statuses.includes(status)) {
      throw new AppError('Student status is not valid.', 400, 'VALIDATION_ERROR');
    }
    return withDatabaseErrors('students.read', () =>
      this.repo.getStudents(search?.trim().slice(0, 100), sectionId, status)
    );
  }

  async listAdmissionApplications(filters: {
    search?: string;
    status?: string;
    page: number;
    pageSize: number;
  }) {
    const statuses = ['pending_review', 'approved', 'rejected', 'registered', 'withdrawn'];
    if (filters.status && !statuses.includes(filters.status)) {
      throw new AppError('Application status is not valid.', 400, 'VALIDATION_ERROR');
    }
    return withDatabaseErrors('admissions.read', async () => {
      const result = await this.repo.getAdmissionApplications({
        search: filters.search?.trim().slice(0, 100),
        status: filters.status,
        limit: filters.pageSize,
        offset: (filters.page - 1) * filters.pageSize
      });
      return { ...result, page: filters.page, pageSize: filters.pageSize };
    });
  }

  async createAdmissionApplication(payload: {
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    dateOfBirth: string;
    phone?: string;
    email?: string;
    address?: string;
    guardianName?: string;
    guardianPhone?: string;
    previousSchool?: string;
    userId: number;
    username: string;
  }) {
    if (typeof payload.firstName !== 'string' ||
        typeof payload.fatherName !== 'string' ||
        typeof payload.dateOfBirth !== 'string') {
      throw new AppError('Applicant names and date of birth are required.', 400, 'VALIDATION_ERROR');
    }
    const textFields: Array<[string, unknown, number]> = [
      ['First name', payload.firstName, 60],
      ['Father name', payload.fatherName, 60],
      ['Grandfather name', payload.grandfatherName, 60],
      ['Phone', payload.phone, 30],
      ['Email', payload.email, 190],
      ['Address', payload.address, 255],
      ['Guardian name', payload.guardianName, 190],
      ['Guardian phone', payload.guardianPhone, 30],
      ['Previous school', payload.previousSchool, 190]
    ];
    for (const [label, value, maxLength] of textFields) {
      if (value !== undefined && (typeof value !== 'string' || value.trim().length > maxLength)) {
        throw new AppError(`${label} must be text of at most ${maxLength} characters.`, 400, 'VALIDATION_ERROR');
      }
    }
    const firstName = payload.firstName.trim();
    const fatherName = payload.fatherName.trim();
    if (!firstName || !fatherName) {
      throw new AppError('Applicant first and father names are required.', 400, 'VALIDATION_ERROR');
    }
    if (payload.gender !== 'female' && payload.gender !== 'male') {
      throw new AppError('Gender must be female or male.', 400, 'VALIDATION_ERROR');
    }
    if (!validDate(payload.dateOfBirth) || payload.dateOfBirth >= new Date().toISOString().slice(0, 10)) {
      throw new AppError('Date of birth must be a valid date before today.', 400, 'VALIDATION_ERROR');
    }
    const email = payload.email?.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError('Email address is not valid.', 400, 'VALIDATION_ERROR');
    }

    const year = new Date().getUTCFullYear();
    const applicationRef = `ADM-${year}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    const application = await withDatabaseErrors('admissions.create', () =>
      this.repo.createAdmissionApplication({
        ...payload,
        applicationRef,
        firstName,
        fatherName,
        grandfatherName: payload.grandfatherName?.trim(),
        phone: payload.phone?.trim(),
        email,
        address: payload.address?.trim(),
        guardianName: payload.guardianName?.trim(),
        guardianPhone: payload.guardianPhone?.trim(),
        previousSchool: payload.previousSchool?.trim()
      })
    );
    return { ...application, message: 'Admission application submitted for authorized review.' };
  }

  async listSections() {
    return withDatabaseErrors('sections.read', () => this.repo.getSectionsWithAvailability());
  }

  async getStudentPhoto(studentId: number) {
    if (!Number.isSafeInteger(studentId) || studentId < 1) {
      throw new AppError('Student ID must be a positive integer.', 400, 'VALIDATION_ERROR');
    }
    return withDatabaseErrors('student.photo.read', () => this.repo.getStudentPhoto(studentId));
  }

  async registerStudent(payload: {
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    dateOfBirth: string;
    sectionId: number;
    phone?: string;
    email?: string;
    address?: string;
    previousSchool?: string;
    applicationId?: number;
    photo?: { originalName: string; mimeType: string; dataBase64: string };
    userId: number;
    username: string;
  }) {
    if (typeof payload.firstName !== 'string' || typeof payload.fatherName !== 'string' ||
        (payload.grandfatherName !== undefined && typeof payload.grandfatherName !== 'string') ||
        typeof payload.dateOfBirth !== 'string' ||
        (payload.phone !== undefined && typeof payload.phone !== 'string') ||
        (payload.email !== undefined && typeof payload.email !== 'string') ||
        (payload.previousSchool !== undefined && typeof payload.previousSchool !== 'string') ||
        (payload.address !== undefined && typeof payload.address !== 'string') ||
        (payload.photo !== undefined && (
          !payload.photo || typeof payload.photo !== 'object' ||
          typeof payload.photo.originalName !== 'string' ||
          typeof payload.photo.mimeType !== 'string' ||
          typeof payload.photo.dataBase64 !== 'string'
        ))) {
      throw new AppError('Student registration fields have invalid types.', 400, 'VALIDATION_ERROR');
    }
    const firstName = payload.firstName.trim();
    const fatherName = payload.fatherName.trim();
    const grandfatherName = payload.grandfatherName?.trim();
    if (!firstName || !fatherName || !payload.dateOfBirth || !payload.sectionId) {
      throw new AppError('First name, father name, date of birth, and section are required.', 400, 'VALIDATION_ERROR');
    }
    if (firstName.length > 60 || fatherName.length > 60 || (grandfatherName && grandfatherName.length > 60)) {
      throw new AppError('Student names must not exceed 60 characters.', 400, 'VALIDATION_ERROR');
    }
    if (payload.gender !== 'female' && payload.gender !== 'male') {
      throw new AppError('Gender must be female or male.', 400, 'VALIDATION_ERROR');
    }
    if (!validDate(payload.dateOfBirth) || payload.dateOfBirth >= new Date().toISOString().slice(0, 10)) {
      throw new AppError('Date of birth must be a valid date before today.', 400, 'VALIDATION_ERROR');
    }
    if (!Number.isSafeInteger(payload.sectionId) || payload.sectionId < 1) {
      throw new AppError('Section ID must be a positive integer.', 400, 'VALIDATION_ERROR');
    }
    if (payload.applicationId !== undefined && (!Number.isSafeInteger(payload.applicationId) || payload.applicationId < 1)) {
      throw new AppError('Application ID must be a positive integer.', 400, 'VALIDATION_ERROR');
    }
    if (payload.phone && payload.phone.trim().length > 30) {
      throw new AppError('Phone must not exceed 30 characters.', 400, 'VALIDATION_ERROR');
    }
    if (payload.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim()) || payload.email.trim().length > 190)) {
      throw new AppError('Email must be valid and not exceed 190 characters.', 400, 'VALIDATION_ERROR');
    }
    if (payload.address && payload.address.trim().length > 255) {
      throw new AppError('Address must not exceed 255 characters.', 400, 'VALIDATION_ERROR');
    }
    if (payload.previousSchool && payload.previousSchool.trim().length > 190) {
      throw new AppError('Previous school must not exceed 190 characters.', 400, 'VALIDATION_ERROR');
    }

    const result = await withDatabaseErrors('student.register', () =>
      this.repo.registerStudent({
        firstName,
        fatherName,
        grandfatherName,
        gender: payload.gender,
        dateOfBirth: payload.dateOfBirth,
        sectionId: payload.sectionId,
        phone: payload.phone?.trim(),
        email: payload.email?.trim(),
        address: payload.address?.trim(),
        previousSchool: payload.previousSchool?.trim(),
        applicationId: payload.applicationId,
        photo: payload.photo,
        registeredByUserId: payload.userId,
        registeredByUsername: payload.username
      })
    );
    return {
      ...result,
      message: `Student '${firstName} ${fatherName}' successfully registered and enrolled${result.photoUploaded ? ' with photo' : ''}.`
    };
  }

  async reassignSection(
    studentId: number,
    sectionId: number,
    actor: { userId: number; username: string; reason: string }
  ) {
    if (!Number.isSafeInteger(studentId) || studentId < 1 ||
        !Number.isSafeInteger(sectionId) || sectionId < 1) {
      throw new AppError('Student and section IDs must be positive integers.', 400, 'VALIDATION_ERROR');
    }
    const reason = actor.reason?.trim();
    if (!reason || reason.length > 500) {
      throw new AppError('A placement-change reason of up to 500 characters is required.', 400, 'VALIDATION_ERROR');
    }

    await withDatabaseErrors('student.placement_change', () =>
      this.repo.reassignSection(studentId, sectionId, { ...actor, reason })
    );
    return { success: true, message: 'Student placement updated; the previous enrollment was preserved.' };
  }

  async listTransfers() {
    return withDatabaseErrors('transfers.read', () => this.repo.getTransfersWithdrawals());
  }

  async recordTransfer(payload: {
    studentId: number;
    type: 'transfer' | 'withdrawal';
    destinationSchool?: string;
    effectiveDate: string;
    reason: string;
    userId: number;
    username: string;
  }) {
    if (!Number.isSafeInteger(payload.studentId) || payload.studentId < 1 ||
        (payload.type !== 'transfer' && payload.type !== 'withdrawal') ||
        typeof payload.effectiveDate !== 'string' || !validDate(payload.effectiveDate) ||
        typeof payload.reason !== 'string' || !payload.reason.trim()) {
      throw new AppError('Student, valid transfer or withdrawal type, effective date, and reason are required.', 400, 'VALIDATION_ERROR');
    }
    if (payload.effectiveDate > new Date().toISOString().slice(0, 10)) {
      throw new AppError('The effective date cannot be in the future.', 400, 'VALIDATION_ERROR');
    }
    if ((payload.destinationSchool !== undefined && typeof payload.destinationSchool !== 'string') ||
        payload.reason.trim().length > 500 ||
        (payload.destinationSchool && payload.destinationSchool.trim().length > 190)) {
      throw new AppError('Reason or destination school exceeds the allowed length.', 400, 'VALIDATION_ERROR');
    }

    await withDatabaseErrors('student.exit_record', () =>
      this.repo.recordTransferWithdrawal({
        studentId: payload.studentId,
        type: payload.type,
        destinationSchool: payload.destinationSchool?.trim(),
        effectiveDate: payload.effectiveDate,
        reason: payload.reason.trim(),
        approvedByUserId: payload.userId,
        approvedByUsername: payload.username
      })
    );
    return { success: true, message: `Student ${payload.type} was recorded and the active enrollment ended.` };
  }

  async listDocuments() {
    return withDatabaseErrors('documents.read', () => this.repo.getStudentDocuments());
  }

  async listGuardians(filters: {
    search?: string;
    verificationStatus?: string;
    page: number;
    pageSize: number;
  }) {
    const verificationStatuses = ['pending', 'verified', 'suspended'];
    if (filters.verificationStatus && !verificationStatuses.includes(filters.verificationStatus)) {
      throw new AppError('Guardian verification status is not valid.', 400, 'VALIDATION_ERROR');
    }
    return withDatabaseErrors('guardians.read', async () => {
      const result = await this.repo.getGuardians({
        search: filters.search?.trim(),
        verificationStatus: filters.verificationStatus as 'pending' | 'verified' | 'suspended' | undefined,
        limit: filters.pageSize,
        offset: (filters.page - 1) * filters.pageSize
      });
      return { ...result, page: filters.page, pageSize: filters.pageSize };
    });
  }

  async getAttendanceSummary(filters: {
    sectionId?: number;
    startDate?: string;
    endDate?: string;
    page: number;
    pageSize: number;
  }) {
    if ((filters.startDate && !validDate(filters.startDate)) ||
        (filters.endDate && !validDate(filters.endDate)) ||
        (filters.startDate && filters.endDate && filters.startDate > filters.endDate)) {
      throw new AppError('Attendance date range must contain valid dates in ascending order.', 400, 'VALIDATION_ERROR');
    }
    return withDatabaseErrors('attendance.summary.read', async () => {
      const result = await this.repo.getAttendanceSummary({
        sectionId: filters.sectionId,
        startDate: filters.startDate,
        endDate: filters.endDate,
        limit: filters.pageSize,
        offset: (filters.page - 1) * filters.pageSize
      });
      return { ...result, page: filters.page, pageSize: filters.pageSize };
    });
  }

  async listAssessmentCompleteness(filters: {
    academicYearId?: number;
    sectionId?: number;
    termId?: number;
    page: number;
    pageSize: number;
  }) {
    return withDatabaseErrors('assessments.completeness.read', async () => {
      const result = await this.repo.getAssessmentCompleteness({
        ...filters,
        limit: filters.pageSize,
        offset: (filters.page - 1) * filters.pageSize
      });
      return { ...result, page: filters.page, pageSize: filters.pageSize };
    });
  }

  async listApprovedAcademicRecords(filters: {
    academicYearId?: number;
    sectionId?: number;
    termId?: number;
    search?: string;
    page: number;
    pageSize: number;
  }) {
    return withDatabaseErrors('academic_records.read', async () => {
      const result = await this.repo.getApprovedAcademicRecords({
        ...filters,
        search: filters.search?.trim(),
        limit: filters.pageSize,
        offset: (filters.page - 1) * filters.pageSize
      });
      return { ...result, page: filters.page, pageSize: filters.pageSize };
    });
  }

  async listPromotionRecords(filters: {
    academicYearId?: number;
    decision?: string;
    search?: string;
    page: number;
    pageSize: number;
  }) {
    const decisions = ['promoted', 'repeat', 'graduated'];
    if (filters.decision && !decisions.includes(filters.decision)) {
      throw new AppError('Promotion decision is not valid.', 400, 'VALIDATION_ERROR');
    }
    return withDatabaseErrors('promotions.read', async () => {
      const result = await this.repo.getPromotionRecords({
        academicYearId: filters.academicYearId,
        decision: filters.decision as 'promoted' | 'repeat' | 'graduated' | undefined,
        search: filters.search?.trim(),
        limit: filters.pageSize,
        offset: (filters.page - 1) * filters.pageSize
      });
      return { ...result, page: filters.page, pageSize: filters.pageSize };
    });
  }

  async getDataQualitySummary() {
    return withDatabaseErrors('reports.data_quality.read', () => this.repo.getDataQualitySummary());
  }

  async getRegistrationByYear(mode: 'calendar' | 'academic' = 'calendar') {
    if (mode !== 'calendar' && mode !== 'academic') {
      throw new AppError('Registration year mode must be calendar or academic.', 400, 'VALIDATION_ERROR');
    }
    return withDatabaseErrors('reports.registration_by_year.read', () => this.repo.getRegistrationByYear(mode));
  }

  async getDataQualityDetails(indicator: string, page: number = 1, pageSize: number = 25) {
    const validIndicators = [
      'students_without_guardians',
      'guardians_pending_verification',
      'active_students_without_current_enrollment',
      'current_assessments_without_finalized_marks'
    ];
    if (!validIndicators.includes(indicator)) {
      throw new AppError('Requested data quality indicator is invalid.', 400, 'VALIDATION_ERROR');
    }
    const limit = Math.min(100, Math.max(1, pageSize));
    const offset = Math.max(0, (page - 1) * limit);

    return withDatabaseErrors('reports.data_quality_details.read', async () => {
      const result = await this.repo.getDataQualityDetails(indicator, limit, offset);
      return {
        indicator,
        ...result,
        page,
        pageSize: limit
      };
    });
  }

  async getProfile(userId: number) {
    return withDatabaseErrors('profile.read', () => this.repo.getRegistrarProfile(userId));
  }

  async getProfilePhoto(userId: number) {
    return this.repo.getRegistrarProfilePhoto(userId);
  }

  async updateProfile(
    userId: number,
    payload: {
      email?: string;
      phone?: string;
      address?: string;
      photo?: { originalName?: string; mimeType?: string; dataBase64?: string };
      removePhoto?: boolean;
    }
  ) {
    if (payload.email !== undefined && payload.email !== '') {
      const email = payload.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) {
        throw new AppError('A valid email address of up to 190 characters is required.', 400, 'VALIDATION_ERROR');
      }
    }
    if (payload.phone !== undefined && payload.phone !== '') {
      const phone = payload.phone.trim();
      if (phone.length > 30) {
        throw new AppError('Phone number must not exceed 30 characters.', 400, 'VALIDATION_ERROR');
      }
    }
    if (payload.address !== undefined && payload.address !== '') {
      const address = payload.address.trim();
      if (address.length > 255) {
        throw new AppError('Address must not exceed 255 characters.', 400, 'VALIDATION_ERROR');
      }
    }

    return withDatabaseErrors('profile.update', () => this.repo.updateRegistrarProfile(userId, payload));
  }
}
