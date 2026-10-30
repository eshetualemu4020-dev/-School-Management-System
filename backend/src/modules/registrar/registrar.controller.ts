import { Request, Response, NextFunction } from 'express';
import { RegistrarService } from './registrar.service';
import { AppError } from '../../middleware/errorHandler';

const positiveInteger = (value: unknown, field: string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new AppError(`${field} must be a positive integer.`, 400, 'VALIDATION_ERROR');
  }
  return parsed;
};

const queryInteger = (
  value: unknown,
  field: string,
  defaultValue: number,
  maximum: number
): number => {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new AppError(`${field} must be a positive integer.`, 400, 'VALIDATION_ERROR');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new AppError(`${field} must be between 1 and ${maximum}.`, 400, 'VALIDATION_ERROR');
  }
  return parsed;
};

const optionalQueryInteger = (value: unknown, field: string): number | undefined =>
  value === undefined ? undefined : queryInteger(value, field, 1, 2147483647);

const queryText = (value: unknown, field: string, maximumLength: number): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length > maximumLength) {
    throw new AppError(`${field} must be text of at most ${maximumLength} characters.`, 400, 'VALIDATION_ERROR');
  }
  const normalized = value.trim();
  return normalized || undefined;
};

const queryPagination = (req: Request) => ({
  page: queryInteger(req.query.page, 'Page', 1, 10000),
  pageSize: queryInteger(req.query.pageSize, 'Page size', 25, 100)
});

export class RegistrarController {
  private service = new RegistrarService();

  getDashboard = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getDashboardData();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStudents = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const sectionId = req.query.sectionId === undefined
        ? undefined
        : positiveInteger(req.query.sectionId, 'Section ID');
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const students = await this.service.listStudents(search, sectionId, status);
      res.json({ data: students });
    } catch (err) {
      next(err);
    }
  };

  getStudentPhoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const photo = await this.service.getStudentPhoto(positiveInteger(req.params.id, 'Student ID'));
      res.setHeader('Cache-Control', 'private, no-store');
      res.type(photo.mimeType).send(photo.bytes);
    } catch (err) {
      next(err);
    }
  };

  getAdmissionApplications = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.listAdmissionApplications({
        search: queryText(req.query.search, 'Search', 100),
        status: queryText(req.query.status, 'Status', 30),
        ...queryPagination(req)
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createAdmissionApplication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.createAdmissionApplication({
        firstName: req.body?.firstName,
        fatherName: req.body?.fatherName,
        grandfatherName: req.body?.grandfatherName,
        gender: req.body?.gender,
        dateOfBirth: req.body?.dateOfBirth,
        phone: req.body?.phone,
        email: req.body?.email,
        address: req.body?.address,
        guardianName: req.body?.guardianName,
        guardianPhone: req.body?.guardianPhone,
        previousSchool: req.body?.previousSchool,
        userId: req.user!.id,
        username: req.user!.username
      });
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getSections = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sections = await this.service.listSections();
      res.json({ data: sections });
    } catch (err) {
      next(err);
    }
  };

  registerStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.registerStudent({
        firstName: req.body?.firstName,
        fatherName: req.body?.fatherName,
        grandfatherName: req.body?.grandfatherName,
        gender: req.body?.gender,
        dateOfBirth: req.body?.dateOfBirth,
        sectionId: positiveInteger(req.body?.sectionId, 'Section ID'),
        phone: req.body?.phone,
        email: req.body?.email,
        address: req.body?.address,
        previousSchool: req.body?.previousSchool,
        photo: req.body?.photo,
        applicationId: req.body?.applicationId === undefined
          ? undefined
          : positiveInteger(req.body.applicationId, 'Application ID'),
        userId: req.user!.id,
        username: req.user!.username
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  reassignSection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = positiveInteger(req.params.id, 'Student ID');
      const sectionId = positiveInteger(req.body?.sectionId, 'Section ID');
      const result = await this.service.reassignSection(studentId, sectionId, {
        userId: req.user!.id,
        username: req.user!.username,
        reason: req.body?.reason
      });
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getTransfers = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const transfers = await this.service.listTransfers();
      res.json({ data: transfers });
    } catch (err) {
      next(err);
    }
  };

  recordTransfer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.recordTransfer({
        studentId: positiveInteger(req.body?.studentId, 'Student ID'),
        type: req.body?.type,
        destinationSchool: req.body?.destinationSchool,
        effectiveDate: req.body?.effectiveDate,
        reason: req.body?.reason,
        userId: req.user!.id,
        username: req.user!.username
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getDocuments = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const documents = await this.service.listDocuments();
      res.json({ data: documents });
    } catch (err) {
      next(err);
    }
  };

  getGuardians = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.listGuardians({
        search: queryText(req.query.search, 'Search', 100),
        verificationStatus: queryText(req.query.verificationStatus, 'Verification status', 20),
        ...queryPagination(req)
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAttendanceSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getAttendanceSummary({
        sectionId: optionalQueryInteger(req.query.sectionId, 'Section ID'),
        startDate: queryText(req.query.startDate, 'Start date', 10),
        endDate: queryText(req.query.endDate, 'End date', 10),
        ...queryPagination(req)
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAssessmentCompleteness = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.listAssessmentCompleteness({
        academicYearId: optionalQueryInteger(req.query.academicYearId, 'Academic year ID'),
        sectionId: optionalQueryInteger(req.query.sectionId, 'Section ID'),
        termId: optionalQueryInteger(req.query.termId, 'Term ID'),
        ...queryPagination(req)
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getApprovedAcademicRecords = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.listApprovedAcademicRecords({
        academicYearId: optionalQueryInteger(req.query.academicYearId, 'Academic year ID'),
        sectionId: optionalQueryInteger(req.query.sectionId, 'Section ID'),
        termId: optionalQueryInteger(req.query.termId, 'Term ID'),
        search: queryText(req.query.search, 'Search', 100),
        ...queryPagination(req)
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getPromotionRecords = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.listPromotionRecords({
        academicYearId: optionalQueryInteger(req.query.academicYearId, 'Academic year ID'),
        decision: queryText(req.query.decision, 'Decision', 20),
        search: queryText(req.query.search, 'Search', 100),
        ...queryPagination(req)
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getDataQualitySummary = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getDataQualitySummary();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getRegistrationByYear = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mode = req.query.mode === 'academic' ? 'academic' : 'calendar';
      const data = await this.service.getRegistrationByYear(mode);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getDataQualityDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const indicator = String(req.query.indicator || '');
      const page = req.query.page ? Math.max(1, Number(req.query.page) || 1) : 1;
      const pageSize = req.query.pageSize ? Math.min(100, Math.max(1, Number(req.query.pageSize) || 25)) : 25;
      const data = await this.service.getDataQualityDetails(indicator, page, pageSize);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getProfile(req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getProfilePhoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const photo = await this.service.getProfilePhoto(req.user!.id);
      res.setHeader('Cache-Control', 'private, no-store');
      res.type(photo.mimeType).send(photo.bytes);
    } catch (err) {
      next(err);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.updateProfile(req.user!.id, req.body);
      res.json({ data: { success: true, message: 'Profile updated successfully.' } });
    } catch (err) {
      next(err);
    }
  };
}
