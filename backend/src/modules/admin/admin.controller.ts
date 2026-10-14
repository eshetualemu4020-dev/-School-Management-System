import { Request, Response, NextFunction } from 'express';
import { AdminService } from './admin.service';

export class AdminController {
  private service = new AdminService();

  // =========================================================================
  // PAGE 1: OVERVIEW
  // =========================================================================
  getDashboard = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getDashboardData();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // PAGE 2: STUDENT MANAGEMENT
  // =========================================================================
  getStudentOptions = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getStudentOptions();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStudents = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { search, gradeId, sectionId, status, stream, gender, limit, offset, incompleteOnly } = req.query;
      const data = await this.service.listStudents({
        search: search as string,
        gradeId: gradeId ? Number(gradeId) : undefined,
        sectionId: sectionId ? Number(sectionId) : undefined,
        status: status as string,
        stream: stream as string,
        gender: gender as string,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
        incompleteOnly: incompleteOnly === 'true'
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const data = await this.service.getStudentDetails(id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStudentPhoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const photo = await this.service.getStudentPhoto(Number(req.params.id));
      res.setHeader('Cache-Control', 'private, no-store');
      res.type(photo.mimeType).send(photo.bytes);
    } catch (err) {
      next(err);
    }
  };

  registerStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.registerStudent({
        ...req.body,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  updateStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const result = await this.service.updateStudent(id, {
        ...req.body,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.json({ data: { success: result } });
    } catch (err) {
      next(err);
    }
  };

  setStudentStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.id);
      const { status, reason, destinationSchool, effectiveDate, sectionId } = req.body;
      const result = await this.service.setStudentStatus({
        studentId,
        newStatus: status,
        reason,
        destinationSchool,
        effectiveDate,
        sectionId: sectionId ? Number(sectionId) : undefined,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.json({ data: { success: result } });
    } catch (err) {
      next(err);
    }
  };

  reassignStudentSection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.id);
      const { sectionId } = req.body;
      const result = await this.service.reassignStudentSection({
        studentId,
        newSectionId: Number(sectionId),
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.json({ data: { success: result } });
    } catch (err) {
      next(err);
    }
  };

  getTransfers = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getTransfers();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // PAGE 3: STAFF & USER MANAGEMENT
  // =========================================================================
  getStaff = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { search, staffType, status } = req.query;
      const data = await this.service.listStaff(search as string, staffType as string, status as string);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createStaff = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createStaff({
        ...req.body,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  updateStaff = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const result = await this.service.updateStaff(id, {
        ...req.body,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.json({ data: { success: result } });
    } catch (err) {
      next(err);
    }
  };

  getUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const search = req.query.search as string | undefined;
      const role = req.query.role as string | undefined;
      const users = await this.service.listUsers(search, role);
      res.json({ data: users });
    } catch (err) {
      next(err);
    }
  };

  createUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createUser({
        ...req.body,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  setUserStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const { status } = req.body;
      const result = await this.service.setUserStatus(userId, status);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const { password } = req.body;
      const result = await this.service.resetPassword({
        userId,
        newPassword: password,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.json({ data: { success: result } });
    } catch (err) {
      next(err);
    }
  };

  setUserRoles = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const { roleCodes } = req.body;
      const result = await this.service.setUserRoles({
        userId,
        roleCodes,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.json({ data: { success: result } });
    } catch (err) {
      next(err);
    }
  };

  getRoles = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const roles = await this.service.getRoles();
      res.json({ data: roles });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // PAGE 4: ACADEMIC STRUCTURE AND CONFIGURATION
  // =========================================================================
  getClasses = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const classes = await this.service.getClasses();
      res.json({ data: classes });
    } catch (err) {
      next(err);
    }
  };

  getAcademicStructure = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const structure = await this.service.getAcademicStructure();
      res.json({ data: structure });
    } catch (err) {
      next(err);
    }
  };

  createAcademicYear = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = await this.service.createAcademicYear(req.body);
      res.status(201).json({ data: { id } });
    } catch (err) {
      next(err);
    }
  };

  activateAcademicYear = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.service.activateAcademicYear(id);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  createTerm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = await this.service.createTerm(req.body);
      res.status(201).json({ data: { id } });
    } catch (err) {
      next(err);
    }
  };

  activateTerm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.service.activateTerm(id);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  createSection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = await this.service.createSection(req.body);
      res.status(201).json({ data: { id } });
    } catch (err) {
      next(err);
    }
  };

  updateSection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.service.updateSection(id, req.body);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  createSubject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = await this.service.createSubject(req.body);
      res.status(201).json({ data: { id } });
    } catch (err) {
      next(err);
    }
  };

  updateSubject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.service.updateSubject(id, req.body);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  addGradeSubject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = await this.service.addGradeSubject(req.body);
      res.status(201).json({ data: { id } });
    } catch (err) {
      next(err);
    }
  };

  removeGradeSubject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.service.removeGradeSubject(id);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  getSettings = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await this.service.getSettings();
      res.json({ data: settings });
    } catch (err) {
      next(err);
    }
  };

  updateSetting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key, value } = req.body;
      await this.service.updateSetting(key, value, req.user!.id, req.user!.username);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // PAGE 5: TEACHING ASSIGNMENTS AND TIMETABLE
  // =========================================================================
  getAssignments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { academicYearId, sectionId, subjectId } = req.query;
      const data = await this.service.getAssignments(
        academicYearId ? Number(academicYearId) : undefined,
        sectionId ? Number(sectionId) : undefined,
        subjectId ? Number(subjectId) : undefined
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = await this.service.createAssignment(req.body);
      res.status(201).json({ data: { id } });
    } catch (err) {
      next(err);
    }
  };

  deleteAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.service.deleteAssignment(id);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  getTimetable = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { termId, sectionId, staffId, roomId } = req.query;
      const data = await this.service.getTimetable(
        termId ? Number(termId) : undefined,
        sectionId ? Number(sectionId) : undefined,
        staffId ? Number(staffId) : undefined,
        roomId ? Number(roomId) : undefined
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createTimetableEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = await this.service.createTimetableEntry(req.body);
      res.status(201).json({ data: { id } });
    } catch (err) {
      next(err);
    }
  };

  deleteTimetableEntry = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.service.deleteTimetableEntry(id);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  getTimeSlots = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getTimeSlots();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createTimeSlot = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = await this.service.createTimeSlot(req.body);
      res.status(201).json({ data: { id } });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // PAGE 6: ATTENDANCE AND ACADEMIC RESULTS
  // =========================================================================
  getAttendanceSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { date, sectionId, gradeId } = req.query;
      const data = await this.service.getAttendanceSummary(
        date as string,
        sectionId ? Number(sectionId) : undefined,
        gradeId ? Number(gradeId) : undefined
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAssessmentsOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { academicYearId, termId, sectionId, subjectId } = req.query;
      const data = await this.service.getAssessmentsOverview(
        academicYearId ? Number(academicYearId) : undefined,
        termId ? Number(termId) : undefined,
        sectionId ? Number(sectionId) : undefined,
        subjectId ? Number(subjectId) : undefined
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  approveMarks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const assessmentId = Number(req.params.id);
      await this.service.approveMarks(assessmentId, req.user!.id, req.user!.username);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  getGradingScales = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getGradingScales();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // PAGE 7: REPORTS, ANALYTICS, AND LIBRARY OVERVIEW
  // =========================================================================
  getEnrollmentReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;
      const data = await this.service.getEnrollmentReport(academicYearId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getAttendanceReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { startDate, endDate, sectionId } = req.query;
      const data = await this.service.getAttendanceReport(
        startDate as string,
        endDate as string,
        sectionId ? Number(sectionId) : undefined
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getPerformanceReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { termId, sectionId } = req.query;
      const data = await this.service.getPerformanceReport(
        termId ? Number(termId) : undefined,
        sectionId ? Number(sectionId) : undefined
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStaffWorkloadReport = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getStaffWorkloadReport();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getLibraryOverview = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getLibraryOverview();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // PAGE 8: COMMUNICATIONS, AUDIT LOGS, AND PROFILE
  // =========================================================================
  getAnnouncements = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const data = await this.service.listAnnouncements(limit);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, content, body, status, targetRole } = req.body;
      const text = body || content;
      const result = await this.service.postAnnouncement(title, text, req.user!.id, status, targetRole);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  setAnnouncementStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;
      await this.service.setAnnouncementStatus(id, status);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  deleteAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.service.deleteAnnouncement(id);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  getAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      const { actor, action, outcome } = req.query;
      const logs = await this.service.getAuditLogs(limit, {
        actor: actor as string,
        action: action as string,
        outcome: outcome as string
      });
      res.json({ data: logs });
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

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.updateProfile(req.user!.id, req.body);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;
      await this.service.changePassword(req.user!.id, currentPassword, newPassword);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };
}
