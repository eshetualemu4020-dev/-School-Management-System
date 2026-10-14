import { RegistrarRepository } from './registrar.repository';
import { AppError } from '../../middleware/errorHandler';

export class RegistrarService {
  private repo = new RegistrarRepository();

  async getDashboardData() {
    const metrics = await this.repo.getDashboardMetrics();
    const sections = await this.repo.getSectionsWithAvailability();
    return { metrics, sections };
  }

  async listStudents(search?: string, sectionId?: number, status?: string) {
    return this.repo.getStudents(search, sectionId, status);
  }

  async listSections() {
    return this.repo.getSectionsWithAvailability();
  }

  async registerStudent(payload: {
    admissionNo: string;
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    dateOfBirth: string;
    sectionId: number;
    phone?: string;
    address?: string;
    userId: number;
  }) {
    if (!payload.admissionNo || !payload.firstName || !payload.fatherName || !payload.sectionId || !payload.dateOfBirth) {
      throw new AppError('Admission number, first name, father name, date of birth, and section are required.', 400, 'VALIDATION_ERROR');
    }

    try {
      const studentId = await this.repo.registerStudent({
        ...payload,
        registeredByUserId: payload.userId
      });
      return { studentId, message: `Student '${payload.firstName} ${payload.fatherName}' successfully enrolled.` };
    } catch (err: any) {
      throw new AppError(err.message, 400, 'REGISTRATION_FAILED');
    }
  }

  async reassignSection(studentId: number, sectionId: number) {
    try {
      await this.repo.reassignSection(studentId, sectionId);
      return { success: true, message: 'Student successfully reassigned to new section.' };
    } catch (err: any) {
      throw new AppError(err.message, 400, 'SECTION_REASSIGNMENT_FAILED');
    }
  }

  async listTransfers() {
    return this.repo.getTransfersWithdrawals();
  }

  async recordTransfer(payload: {
    studentId: number;
    type: 'transfer' | 'withdrawal';
    destinationSchool?: string;
    effectiveDate: string;
    reason: string;
    userId: number;
  }) {
    if (!payload.studentId || !payload.type || !payload.effectiveDate || !payload.reason) {
      throw new AppError('Student, type, effective date, and reason are required.', 400, 'VALIDATION_ERROR');
    }

    try {
      await this.repo.recordTransferWithdrawal({
        ...payload,
        approvedByUserId: payload.userId
      });
      return { success: true, message: `Student ${payload.type} successfully processed and records updated.` };
    } catch (err: any) {
      throw new AppError(err.message, 400, 'TRANSFER_PROCESSING_FAILED');
    }
  }

  async listDocuments() {
    return this.repo.getStudentDocuments();
  }
}
