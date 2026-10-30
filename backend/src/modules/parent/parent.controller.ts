import { Request, Response, NextFunction } from 'express';
import { ParentService } from './parent.service';

export class ParentController {
  private service = new ParentService();

  getDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getDashboardData(req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildren = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getChildren(req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getChildOverview(req.user!.id, studentId, req.childContext);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildMarks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getChildMarks(req.user!.id, studentId, req.childContext);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildAttendance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getChildAttendance(req.user!.id, studentId, req.childContext);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildSubjects = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getChildSubjects(req.user!.id, studentId, req.childContext);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildTimetable = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getChildTimetable(req.user!.id, studentId, req.childContext);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildAssessments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getChildAssessments(req.user!.id, studentId, req.childContext);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildDocuments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getChildDocuments(req.user!.id, studentId, req.childContext);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getChildHistory(req.user!.id, studentId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getChildDetails(req.user!.id, studentId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getRequests(req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category, subject, description, studentId } = req.body;
      const data = await this.service.createRequest(req.user!.id, {
        category,
        subject,
        description,
        studentId
      });
      res.status(201).json({ data, message: 'Parent request submitted successfully.' });
    } catch (err) {
      next(err);
    }
  };

  getFinanceSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getFinanceSummary(req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildFinance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getChildFinance(req.user!.id, studentId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAnnouncements = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
      const data = await this.service.getAnnouncements(req.user!.id, studentId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getCommunications = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
      const data = await this.service.getCommunications(req.user!.id, studentId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getMeetingRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;
      const data = await this.service.getMeetingRequests(req.user!.id, studentId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createMeetingRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { teacherStaffId, studentId, requestedDate, requestedTime, agenda } = req.body;
      const data = await this.service.createMeetingRequest(req.user!.id, {
        teacherStaffId: Number(teacherStaffId),
        studentId: Number(studentId),
        requestedDate,
        requestedTime,
        agenda
      });
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStudentTeachers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getStudentTeachers(req.user!.id, studentId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };
}
