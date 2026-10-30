import { Request, Response, NextFunction } from 'express';
import { StudentService } from './student.service';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import path from 'path';
import fs from 'fs';

const extractToken = (req: Request): string | undefined => {
  const cookie = req.headers.cookie?.split(';').map((item) => item.trim())
    .find((item) => item.startsWith(`${AUTH_COOKIE_NAME}=`));
  const cookieToken = cookie?.slice(AUTH_COOKIE_NAME.length + 1);
  const bearerToken = req.headers['authorization']?.split(' ')[1];
  return cookieToken || bearerToken;
};

export class StudentController {
  private service = new StudentService();

  getDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getDashboardData(req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await this.service.getProfile(req.user!.id);
      res.json({ data: profile });
    } catch (err) {
      next(err);
    }
  };

  // --- PAGE 12: MY PROFILE ---

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.updateProfile(
        req.student!,
        req.user!.id,
        req.user!.username,
        req.body,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getProfileGuardians = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getGuardians(req.student!);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getProfilePhoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const photo = await this.service.getPhoto(req.student!);
      res.setHeader('Cache-Control', 'private, no-store');
      res.type(photo.mimeType).send(photo.bytes);
    } catch (err) {
      next(err);
    }
  };

  uploadProfilePhoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.uploadPhoto(
        req.student!,
        req.user!.id,
        req.user!.username,
        req.body,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  removeProfilePhoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.removePhoto(
        req.student!,
        req.user!.id,
        req.user!.username,
        { ipAddress: req.ip, userAgent: req.headers['user-agent'] }
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // --- PAGE 11: SETTINGS & SECURITY ---

  changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const result = await this.service.changePassword(
        req.user!.id,
        req.user!.username,
        currentPassword,
        newPassword,
        req.ip,
        req.get('user-agent')
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractToken(req);
      const sessions = await this.service.getActiveSessions(req.user!.id, token);
      res.json({ data: sessions });
    } catch (err) {
      next(err);
    }
  };

  revokeSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = Number(req.params.id);
      const result = await this.service.revokeSession(
        req.user!.id,
        sessionId,
        req.user!.username,
        req.ip,
        req.get('user-agent')
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  revokeOtherSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = extractToken(req);
      const result = await this.service.revokeOtherSessions(
        req.user!.id,
        token,
        req.user!.username,
        req.ip,
        req.get('user-agent')
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const preferences = await this.service.getPreferences(req.user!.id);
      res.json({ data: preferences });
    } catch (err) {
      next(err);
    }
  };

  savePreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.savePreferences(
        req.user!.id,
        req.body,
        req.user!.username,
        req.ip,
        req.get('user-agent')
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  // --- PAGE 2: SUBJECTS & MATERIALS ---

  getMySubjects = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getMySubjects(req.enrollment);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getSubjectDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subjectId = Number(req.params.subjectId);
      const data = await this.service.getSubjectDetail(req.student!.id, subjectId, req.enrollment);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getLearningMaterials = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const data = await this.service.getLearningMaterials(req.enrollment, { subjectId, search });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  downloadMaterial = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resourceId = Number(req.params.id);
      const material = await this.service.getMaterialDownload(req.student!.id, resourceId, req.enrollment);

      if (material.url && !material.document_id) {
        return res.redirect(material.url);
      }

      if (!material.storage_key) {
        return res.status(404).json({ success: false, message: 'Document file not found for this resource.' });
      }

      const uploadBase = process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads');
      const filePath = path.resolve(uploadBase, material.storage_key);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'File attachment not found on server storage.'
        });
      }

      res.setHeader('Content-Type', material.mime_type || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(material.original_name || material.title || 'document')}"`
      );
      if (material.size_bytes) {
        res.setHeader('Content-Length', material.size_bytes);
      }

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  };

  // --- PAGE 3: TIMETABLE & CALENDAR ---

  getWeeklyTimetable = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getWeeklyTimetable(req.enrollment);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getTodayTimetable = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queryDay = req.query.day ? Number(req.query.day) : undefined;
      const data = await this.service.getTodayTimetable(req.enrollment, queryDay);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAcademicCalendar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventType = req.query.type ? String(req.query.type) : undefined;
      const data = await this.service.getAcademicCalendar(req.enrollment, eventType);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getExamSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getExamSchedule(req.enrollment);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // --- PAGE 4: ATTENDANCE ---

  getAttendanceSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const data = await this.service.getAttendanceSummary(req.enrollment, termId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAttendanceRecords = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const statusCode = (req.query.status || req.query.statusCode) ? String(req.query.status || req.query.statusCode) : undefined;
      const month = req.query.month ? String(req.query.month) : undefined;
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const fromDate = req.query.fromDate ? String(req.query.fromDate) : undefined;
      const toDate = req.query.toDate ? String(req.query.toDate) : undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      const data = await this.service.getAttendanceRecords(req.enrollment, {
        statusCode,
        month,
        termId,
        subjectId,
        fromDate,
        toDate,
        page,
        limit
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // --- PAGE 5: ASSIGNMENTS & ASSESSMENTS ---

  getAssessments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      if (status === 'past') {
        const termId = req.query.termId ? Number(req.query.termId) : undefined;
        const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
        const data = await this.service.getPastAssessments(req.enrollment, { termId, subjectId });
        return res.json({ data });
      }

      // Default to upcoming / active
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const type = req.query.type ? String(req.query.type) : undefined;
      const data = await this.service.getUpcomingAssignments(req.enrollment, { subjectId, type });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getUpcomingAssignments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const type = req.query.type ? String(req.query.type) : undefined;
      const data = await this.service.getUpcomingAssignments(req.enrollment, { subjectId, type });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getPastAssessments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const data = await this.service.getPastAssessments(req.enrollment, { termId, subjectId });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getSubmittedAssignments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const data = await this.service.getSubmittedAssignments(req.enrollment, { subjectId, status });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAssessmentDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const data = await this.service.getAssessmentDetail(req.enrollment, id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getQuizzesAndTests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getQuizzesAndTests(req.enrollment);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  submitAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assignmentId = Number(req.params.assignmentId || req.params.id);
      const data = await this.service.submitAssignment(
        req.user!.id,
        req.user!.username,
        req.enrollment,
        assignmentId,
        req.body,
        req.ip,
        req.get('user-agent')
      );
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  downloadSubmissionFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const submissionOrAssignmentId = Number(req.params.id || req.params.assignmentId || req.params.submissionId);
      const fileRecord = await this.service.getSubmissionDownload(req.enrollment, submissionOrAssignmentId);

      const uploadBase = process.env.PRIVATE_UPLOAD_DIR || path.join(process.cwd(), 'private_uploads');
      const filePath = path.resolve(uploadBase, fileRecord.storage_key);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          success: false,
          message: 'Submission attachment file not found on server storage.'
        });
      }

      res.setHeader('Content-Type', fileRecord.mime_type || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(fileRecord.original_name || 'submission')}"`
      );
      if (fileRecord.size_bytes) {
        res.setHeader('Content-Length', fileRecord.size_bytes);
      }

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  };

  // --- PAGE 6: RESULTS & ACADEMIC PROGRESS ---

  getMyResults = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const data = await this.service.getMyResults(req.enrollment, { termId, subjectId });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getTermSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;
      const data = await this.service.getTermSummary(req.enrollment, { termId, academicYearId });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getProgressAndTrends = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;
      const data = await this.service.getProgressAndTrends(req.enrollment, { academicYearId });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getPublishedTermResults = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const data = await this.service.getPublishedTermResults(req.enrollment, termId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getContinuousBreakdown = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getContinuousAssessmentBreakdown(req.enrollment);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAcademicAnalytics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const termId = req.query.termId ? Number(req.query.termId) : 3;
      const data = await this.service.getAcademicAnalytics(req.enrollment, termId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // --- PAGE 7: REPORT CARDS & DOCUMENTS ---

  getReportCards = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getReportCards(req.enrollment);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  downloadReportCard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const snapshotId = Number(req.params.id);
      const fileData = await this.service.downloadReportCardPdf(req.enrollment, snapshotId);
      res.setHeader('Content-Type', fileData.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.filename)}"`);
      res.setHeader('Content-Length', fileData.buffer.length);
      res.end(fileData.buffer);
    } catch (err) {
      next(err);
    }
  };

  getTranscripts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getTranscripts(req.student!.id, req.enrollment);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  downloadTranscript = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transcriptId = Number(req.params.id);
      const fileData = await this.service.downloadTranscriptPdf(req.student!.id, transcriptId);
      res.setHeader('Content-Type', fileData.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.filename)}"`);
      res.setHeader('Content-Length', fileData.buffer.length);
      res.end(fileData.buffer);
    } catch (err) {
      next(err);
    }
  };

  getIssuedDocuments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getIssuedDocuments(req.student!.id, req.enrollment);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  downloadDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const documentId = Number(req.params.id);
      const fileData = await this.service.downloadDocument(req.student!.id, documentId, req.enrollment);
      res.setHeader('Content-Type', fileData.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileData.filename)}"`);
      res.setHeader('Content-Length', fileData.buffer.length);
      res.end(fileData.buffer);
    } catch (err) {
      next(err);
    }
  };

  getRequestTypes = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getRequestTypes();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getRequests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getRequests(req.student!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getRequestDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = Number(req.params.id);
      const data = await this.service.getRequestDetail(req.student!.id, requestId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  submitRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.submitRequest(
        req.student!.id,
        req.user!.id,
        req.user!.username,
        req.body
      );
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  cancelRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = Number(req.params.id);
      const data = await this.service.cancelRequest(
        req.student!.id,
        requestId,
        req.user!.username,
        req.user!.id
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // --- PAGE: HELP & SUPPORT ---

  getSupportTickets = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getSupportTickets(req.student!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getSupportTicket = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getSupportTicket(req.student!.id, Number(req.params.id));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createSupportTicket = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.createSupportTicket(
        req.student!,
        req.user!.id,
        req.user!.username,
        req.body,
        { ipAddress: req.ip, userAgent: req.get('user-agent') }
      );
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  closeSupportTicket = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.closeSupportTicket(
        req.student!.id,
        Number(req.params.id),
        req.user!.username,
        req.user!.id
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };
}


