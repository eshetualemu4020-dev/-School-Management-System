import { Request, Response, NextFunction } from 'express';
import { TeacherService } from './teacher.service';

export class TeacherController {
  private service = new TeacherService();

  getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const overview = await this.service.getDashboardOverview(staffId);
      const classes = await this.service.getAssignedClasses(staffId);
      const timetable = await this.service.getTimetable(staffId);
      const announcements = await this.service.getAnnouncements();

      res.status(200).json({
        data: {
          overview,
          assignedClasses: classes,
          timetable,
          announcements,
          teacher: {
            staffId,
            fullName: req.user!.staffName,
            username: req.user!.username
          }
        }
      });
    } catch (err) {
      next(err);
    }
  };

  getClasses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;
      const classes = await this.service.getAssignedClasses(staffId, academicYearId);
      res.status(200).json({ data: classes });
    } catch (err) {
      next(err);
    }
  };

  getSectionStudents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const sectionId = Number(req.params.sectionId);
      const isAdmin = req.user!.roles.includes('system_admin') || req.user!.roles.includes('principal');

      const students = await this.service.getStudentsForSection(staffId, sectionId, isAdmin);
      res.status(200).json({ data: students });
    } catch (err) {
      next(err);
    }
  };

  getTimetable = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const timetable = await this.service.getTimetable(staffId);
      res.status(200).json({ data: timetable });
    } catch (err) {
      next(err);
    }
  };

  getAnnouncements = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const announcements = await this.service.getAnnouncements();
      res.status(200).json({ data: announcements });
    } catch (err) {
      next(err);
    }
  };

  getSubjects = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const subjects = await this.service.getTeacherSubjects(staffId);
      res.status(200).json({ data: subjects });
    } catch (err) {
      next(err);
    }
  };

  getAcademicYears = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const years = await this.service.getAcademicYears();
      res.status(200).json({ data: years });
    } catch (err) {
      next(err);
    }
  };

  getTerms = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;
      const terms = await this.service.getTerms(academicYearId);
      res.status(200).json({ data: terms });
    } catch (err) {
      next(err);
    }
  };

  getAttendanceReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const isAdmin = req.user!.roles.includes('system_admin') || req.user!.roles.includes('principal');
      const sectionId = Number(req.query.sectionId);
      if (!sectionId) {
        res.status(400).json({
          error: {
            code: 'MISSING_PARAM',
            message: 'sectionId is required to generate the attendance report.'
          }
        });
        return;
      }

      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const report = await this.service.getAttendanceReport(
        staffId,
        { sectionId, subjectId, termId, academicYearId, startDate, endDate },
        isAdmin
      );
      res.status(200).json({ data: report });
    } catch (err) {
      next(err);
    }
  };

  getMarksReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const isAdmin = req.user!.roles.includes('system_admin') || req.user!.roles.includes('principal');
      const sectionId = Number(req.query.sectionId);
      if (!sectionId) {
        res.status(400).json({
          error: {
            code: 'MISSING_PARAM',
            message: 'sectionId is required to generate the marks report.'
          }
        });
        return;
      }

      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const assessmentId = req.query.assessmentId ? Number(req.query.assessmentId) : undefined;
      const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;

      const report = await this.service.getMarksReport(
        staffId,
        { sectionId, subjectId, termId, assessmentId, academicYearId },
        isAdmin
      );
      res.status(200).json({ data: report });
    } catch (err) {
      next(err);
    }
  };

  getClassPerformanceReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const isAdmin = req.user!.roles.includes('system_admin') || req.user!.roles.includes('principal');
      const sectionId = Number(req.query.sectionId);
      if (!sectionId) {
        res.status(400).json({
          error: {
            code: 'MISSING_PARAM',
            message: 'sectionId is required to generate the class performance report.'
          }
        });
        return;
      }

      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const assessmentId = req.query.assessmentId ? Number(req.query.assessmentId) : undefined;

      const report = await this.service.getClassPerformanceReport(
        staffId,
        { sectionId, subjectId, termId, assessmentId },
        isAdmin
      );
      res.status(200).json({ data: report });
    } catch (err) {
      next(err);
    }
  };

  getStudentPerformanceReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const isAdmin = req.user!.roles.includes('system_admin') || req.user!.roles.includes('principal');
      const sectionId = Number(req.query.sectionId);
      if (!sectionId) {
        res.status(400).json({
          error: {
            code: 'MISSING_PARAM',
            message: 'sectionId is required to generate the student performance report.'
          }
        });
        return;
      }

      const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const termId = req.query.termId ? Number(req.query.termId) : undefined;

      const report = await this.service.getStudentPerformanceReport(
        staffId,
        { sectionId, studentId, subjectId, termId },
        isAdmin
      );
      res.status(200).json({ data: report });
    } catch (err) {
      next(err);
    }
  };

  getAssessmentSummaryReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;

      const report = await this.service.getAssessmentSummaryReport(staffId, {
        subjectId,
        sectionId,
        termId,
        academicYearId
      });
      res.status(200).json({ data: report });
    } catch (err) {
      next(err);
    }
  };
}
