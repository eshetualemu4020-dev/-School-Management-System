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
      const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
      const timetable = await this.service.getTimetable(staffId, sectionId);
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

  // =========================================================================
  // EXTENDED TEACHER PORTAL CONTROLLERS
  // =========================================================================

  getDashboardExtended = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const data = await this.service.getDashboardExtended(staffId, userId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAttendanceHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const sectionId = Number(req.params.sectionId);
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      const history = await this.service.getAttendanceHistory(staffId, sectionId, startDate, endDate);
      res.status(200).json({ data: history });
    } catch (err) {
      next(err);
    }
  };

  requestAttendanceCorrection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const { sessionId, sectionId, attendanceDate, reason, oldRecords, newRecords } = req.body;

      if (!sessionId || !sectionId || !reason || !oldRecords || !newRecords) {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required correction fields.' } });
        return;
      }

      const result = await this.service.requestAttendanceCorrection(staffId, userId, {
        sessionId: Number(sessionId),
        sectionId: Number(sectionId),
        attendanceDate,
        reason,
        oldRecords,
        newRecords
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getRepeatedAbsences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const sectionId = Number(req.params.sectionId);
      const data = await this.service.getRepeatedAbsences(staffId, sectionId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStudentAttendanceDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const sectionId = Number(req.params.sectionId);
      const studentId = Number(req.params.studentId);
      const data = await this.service.getStudentAttendanceDetail(staffId, sectionId, studentId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  requestMarkCorrection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const { assessmentId, reason, oldMarks, newMarks } = req.body;

      if (!assessmentId || !reason || !oldMarks || !newMarks) {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required mark correction fields.' } });
        return;
      }

      const result = await this.service.requestMarkCorrection(staffId, userId, {
        assessmentId: Number(assessmentId),
        reason,
        oldMarks,
        newMarks
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getMarksHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const assessmentId = Number(req.params.assessmentId);
      const data = await this.service.getMarksHistory(staffId, assessmentId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getMissingMarks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const assessmentId = Number(req.params.assessmentId);
      const data = await this.service.getMissingMarks(staffId, assessmentId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getClassDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const sectionId = Number(req.params.sectionId);
      const data = await this.service.getClassDetail(staffId, sectionId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStudentProfileScoped = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const studentId = Number(req.params.studentId);
      const data = await this.service.getStudentProfileScoped(staffId, studentId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getHomeroomSection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const data = await this.service.getHomeroomSection(staffId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getSubjectsDetailed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const data = await this.service.getSubjectsDetailed(staffId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAssignments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const data = await this.service.getAssignmentsList(staffId, { sectionId, termId });
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  createAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const data = await this.service.createAssignment(staffId, userId, req.body);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAssignmentSubmissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const assignmentId = Number(req.params.assignmentId);
      const data = await this.service.getAssignmentSubmissions(staffId, assignmentId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  gradeSubmission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const submissionId = Number(req.params.submissionId);
      const data = await this.service.gradeSubmission(staffId, userId, submissionId, req.body);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getLearningResources = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const data = await this.service.getLearningResources(staffId, { sectionId, subjectId, search });
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  createLearningResource = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const data = await this.service.createLearningResource(staffId, userId, req.body);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  downloadLearningResourceFile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const resourceId = Number(req.params.id);
      const fileData = await this.service.getLearningResourceFile(staffId, resourceId);

      res.setHeader('Content-Type', fileData.mimeType);
      res.setHeader('Content-Length', fileData.sizeBytes);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(fileData.originalName)}"`
      );
      res.status(200).send(fileData.bytes);
    } catch (err) {
      next(err);
    }
  };

  updateLearningResource = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const resourceId = Number(req.params.id);
      const data = await this.service.updateLearningResource(staffId, userId, resourceId, req.body);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  deleteLearningResource = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const resourceId = Number(req.params.id);
      const data = await this.service.deleteLearningResource(staffId, resourceId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getDisciplineRecords = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
      const severity = req.query.severity ? String(req.query.severity) : undefined;
      const category = req.query.category ? String(req.query.category) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const data = await this.service.getDisciplineRecords(userId, { sectionId, severity, category, search });
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  reportDisciplineIncident = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const data = await this.service.reportDisciplineIncident(staffId, userId, req.body);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  updateDisciplineRecord = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const recordId = Number(req.params.id);
      const data = await this.service.updateDisciplineRecord(staffId, userId, recordId, req.body);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  deleteDisciplineRecord = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const recordId = Number(req.params.id);
      const data = await this.service.deleteDisciplineRecord(staffId, userId, recordId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getContactableParents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const data = await this.service.getContactableParents(staffId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getCommunications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const search = req.query.search ? String(req.query.search) : undefined;
      const recipientRole = req.query.recipientRole ? String(req.query.recipientRole) : undefined;
      const data = await this.service.getCommunications(staffId, { search, recipientRole });
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  sendCommunication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const data = await this.service.sendCommunication(staffId, userId, req.body);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  deleteCommunication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const messageId = Number(req.params.id);
      const data = await this.service.deleteCommunication(staffId, messageId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getMeetingRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const status = req.query.status ? String(req.query.status) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const data = await this.service.getMeetingRequests(staffId, { status, search });
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  createMeetingRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const data = await this.service.createMeetingRequest(staffId, req.body);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  updateMeetingRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const meetingId = Number(req.params.id);
      const data = await this.service.updateMeetingRequest(staffId, meetingId, req.body);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  deleteMeetingRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const meetingId = Number(req.params.id);
      const data = await this.service.deleteMeetingRequest(staffId, meetingId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getMyRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const status = req.query.status ? String(req.query.status) : undefined;
      const type = req.query.type ? String(req.query.type) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const data = await this.service.getMyRequests(userId, { status, type, search });
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  createTeacherRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const staffId = req.user!.staffId!;
      const data = await this.service.createTeacherRequest(userId, staffId, req.body);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  cancelMyRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const requestId = Number(req.params.id);
      const data = await this.service.cancelMyRequest(userId, requestId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStaffAttendanceHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const status = req.query.status ? String(req.query.status) : undefined;
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
      const data = await this.service.getStaffAttendanceHistory(staffId, { status, startDate, endDate });
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getMyLeaveApplications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const data = await this.service.getMyLeaveApplications(userId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  applyForLeave = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const data = await this.service.applyForLeave(staffId, userId, req.body);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  cancelLeaveApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const requestId = Number(req.params.id);
      const data = await this.service.cancelLeaveApplication(userId, requestId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getTeacherProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const data = await this.service.getTeacherProfile(staffId, userId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  revokeSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const sessionId = Number(req.params.id);
      const data = await this.service.revokeSession(userId, sessionId);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };
}

