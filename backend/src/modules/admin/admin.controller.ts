import { Request, Response, NextFunction } from 'express';
import { AdminService } from './admin.service';
import { AcademicLifecycleService } from './academicLifecycle.service';

export class AdminController {
  private service = new AdminService();
  private academicLifecycle = new AcademicLifecycleService();

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
      const { search, staffType, status, limit, offset, sort } = req.query;
      const data = await this.service.listStaff(search as string, staffType as string, status as string, {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
        sort: sort as string
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStaffPhoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const photo = await this.service.getStaffPhoto(Number(req.params.id));
      res.setHeader('Cache-Control', 'private, no-store');
      res.type(photo.mimeType).send(photo.bytes);
    } catch (err) { next(err); }
  };

  uploadStaffPhoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { originalName, mimeType, dataBase64 } = req.body;
      const data = await this.service.saveStaffPhoto({
        staffId: Number(req.params.id),
        originalName,
        mimeType,
        dataBase64,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.status(201).json({ data });
    } catch (err) { next(err); }
  };

  getTeacherProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getTeacherProfile(Number(req.params.id));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getTeacherAssignments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getTeacherAssignments(Number(req.params.id));
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // ---------------------------------------------------------------------------
  // STAFF QUALIFICATIONS & SUPPORTING DOCUMENTS
  // ---------------------------------------------------------------------------
  getStaffQualifications = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.service.listStaffQualifications(Number(req.params.id)) });
    } catch (err) { next(err); }
  };

  createQualification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.createQualification({
        ...req.body,
        staffId: Number(req.params.id),
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.status(201).json({ data });
    } catch (err) { next(err); }
  };

  updateQualification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.updateQualification(Number(req.params.qualificationId), {
        ...req.body,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.json({ data: { success: true } });
    } catch (err) { next(err); }
  };

  deleteQualification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.deleteQualification(Number(req.params.qualificationId), req.user!.id, req.user!.username);
      res.json({ data: { success: true } });
    } catch (err) { next(err); }
  };

  uploadQualificationDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { originalName, mimeType, dataBase64 } = req.body;
      const data = await this.service.uploadQualificationDocument({
        qualificationId: Number(req.params.qualificationId),
        originalName,
        mimeType,
        dataBase64,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.status(201).json({ data });
    } catch (err) { next(err); }
  };

  verifyQualificationDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, note } = req.body;
      await this.service.setQualificationDocumentVerification({
        linkId: Number(req.params.documentId),
        status,
        note,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.json({ data: { success: true } });
    } catch (err) { next(err); }
  };

  downloadQualificationDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = await this.service.downloadQualificationDocument(Number(req.params.documentId));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Disposition', `attachment; filename="${file.originalName.replace(/[^\w.\- ]/g, '_')}"`);
      res.type(file.mimeType).send(file.bytes);
    } catch (err) { next(err); }
  };

  getQualificationHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 50;
      res.json({ data: await this.service.getQualificationAuditHistory(Number(req.params.id), limit) });
    } catch (err) { next(err); }
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

  createGrade = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = await this.service.createGrade({
        gradeLevel: Number(req.body.gradeLevel),
        displayName: req.body.displayName,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.status(201).json({ data: { id } });
    } catch (err) {
      next(err);
    }
  };

  updateGrade = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.updateGrade(Number(req.params.id), {
        displayName: req.body.displayName,
        isActive: req.body.isActive,
        adminUserId: req.user!.id,
        adminUsername: req.user!.username
      });
      res.json({ data: { success: true } });
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

  getAssessmentConfigurationOptions = async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await this.service.getAssessmentConfigurationOptions() }); } catch (err) { next(err); }
  };

  createAdminAssessment = async (req: Request, res: Response, next: NextFunction) => {
    try { const id = await this.service.createAdminAssessment({ ...req.body, userId: req.user!.id, username: req.user!.username }); res.status(201).json({ data: { id } }); } catch (err) { next(err); }
  };

  updateAdminAssessment = async (req: Request, res: Response, next: NextFunction) => {
    try { await this.service.updateAdminAssessment(Number(req.params.id), { ...req.body, userId: req.user!.id, username: req.user!.username }); res.json({ data: { success: true } }); } catch (err) { next(err); }
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

  getAcademicLifecycleOptions = async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await this.academicLifecycle.getOptions() }); } catch (err) { next(err); }
  };

  getAcademicPolicies = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const yearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;
      res.json({ data: await this.academicLifecycle.listPolicies(yearId) });
    } catch (err) { next(err); }
  };

  saveAcademicPolicy = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.academicLifecycle.savePolicy(req.body, { userId: req.user!.id, username: req.user!.username }) });
    } catch (err) { next(err); }
  };

  getAcademicSubjectPrerequisites = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const gradeId = req.query.gradeId ? Number(req.query.gradeId) : undefined;
      res.json({ data: await this.academicLifecycle.listSubjectPrerequisites(gradeId) });
    } catch (err) { next(err); }
  };

  addAcademicSubjectPrerequisite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json({ data: await this.academicLifecycle.addSubjectPrerequisite(
        req.body, { userId: req.user!.id, username: req.user!.username }
      ) });
    } catch (err) { next(err); }
  };

  removeAcademicSubjectPrerequisite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.academicLifecycle.removeSubjectPrerequisite(
        req.params.id, { userId: req.user!.id, username: req.user!.username }
      ) });
    } catch (err) { next(err); }
  };

  getAcademicExamSchedules = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
      res.json({ data: await this.academicLifecycle.listExamSchedules(termId, sectionId) });
    } catch (err) { next(err); }
  };

  saveAcademicExamSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(req.params.id ? 200 : 201).json({
        data: await this.academicLifecycle.saveExamSchedule(
          { ...req.body, id: req.params.id ? Number(req.params.id) : undefined },
          { userId: req.user!.id, username: req.user!.username }
        )
      });
    } catch (err) { next(err); }
  };

  setAcademicExamScheduleStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.academicLifecycle.setExamScheduleStatus(
        req.params.id, req.body.status, { userId: req.user!.id, username: req.user!.username }
      ) });
    } catch (err) { next(err); }
  };

  getAcademicCourseEnrollments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      res.json({ data: await this.academicLifecycle.listCourseEnrollments(sectionId, termId) });
    } catch (err) { next(err); }
  };

  createAcademicCourseEnrollment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.academicLifecycle.enrollCourse(req.body, { userId: req.user!.id, username: req.user!.username });
      res.status(201).json({ data });
    } catch (err) { next(err); }
  };

  dropAcademicCourseEnrollment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.academicLifecycle.dropCourseEnrollment(
        req.params.id, req.body.reason, { userId: req.user!.id, username: req.user!.username }
      ) });
    } catch (err) { next(err); }
  };

  getAcademicTranscript = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await this.academicLifecycle.getTranscript(req.params.studentId) }); } catch (err) { next(err); }
  };

  issueAcademicTranscript = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json({ data: await this.academicLifecycle.issueTranscript(
        req.body.studentId, { userId: req.user!.id, username: req.user!.username }
      ) });
    } catch (err) { next(err); }
  };

  getIssuedAcademicTranscripts = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await this.academicLifecycle.getIssuedTranscripts(req.params.studentId) }); } catch (err) { next(err); }
  };

  getAcademicRankings = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await this.academicLifecycle.getRankings(req.query.termId, req.query.sectionId) }); } catch (err) { next(err); }
  };

  evaluateAcademicPromotions = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await this.academicLifecycle.evaluatePromotions(req.body.academicYearId) }); } catch (err) { next(err); }
  };

  recordAcademicPromotion = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json({ data: await this.academicLifecycle.recordPromotion(
        req.body, { userId: req.user!.id, username: req.user!.username }
      ) });
    } catch (err) { next(err); }
  };

  getAcademicProbations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const yearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;
      res.json({ data: await this.academicLifecycle.listProbations(yearId) });
    } catch (err) { next(err); }
  };

  getAcademicProbationCandidates = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await this.academicLifecycle.listProbationCandidates(req.query.termId) }); } catch (err) { next(err); }
  };

  createAcademicProbation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json({ data: await this.academicLifecycle.createProbation(
        req.body, { userId: req.user!.id, username: req.user!.username }
      ) });
    } catch (err) { next(err); }
  };

  updateAcademicProbation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.academicLifecycle.updateProbation(
        req.params.id, req.body.status, { userId: req.user!.id, username: req.user!.username }
      ) });
    } catch (err) { next(err); }
  };

  evaluateAcademicGraduation = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await this.academicLifecycle.evaluateGraduation(req.body.academicYearId) }); } catch (err) { next(err); }
  };

  getAcademicGraduationReviews = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const yearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;
      res.json({ data: await this.academicLifecycle.listGraduationReviews(yearId) });
    } catch (err) { next(err); }
  };

  saveAcademicGraduationReview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.academicLifecycle.saveGraduationReview(
        req.body, { userId: req.user!.id, username: req.user!.username }
      ) });
    } catch (err) { next(err); }
  };

  issueAcademicGraduationCertificate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.academicLifecycle.issueGraduationCertificate(
        req.params.enrollmentId, req.body.certificateNumber, { userId: req.user!.id, username: req.user!.username }
      ) });
    } catch (err) { next(err); }
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
      const result = await this.service.postAnnouncement(title, text, req.user!.id, req.user!.username, status, targetRole);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  setAnnouncementStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;
      const result = await this.service.setAnnouncementStatus(id, status, req.user!.id, req.user!.username);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  deleteAnnouncement = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.service.deleteAnnouncement(id, req.user!.id, req.user!.username);
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

  getNotificationPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await this.service.getNotificationPreferences(req.user!.id) });
    } catch (err) { next(err); }
  };

  saveNotificationPreferences = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.saveNotificationPreferences(req.user!.id, req.user!.username, req.body);
      res.json({ data });
    } catch (err) { next(err); }
  };

  getAdminProfilePhoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const photo = await this.service.getAdminProfilePhoto(req.user!.id);
      res.setHeader('Cache-Control', 'private, no-store');
      res.type(photo.mimeType).send(photo.bytes);
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

  // =========================================================================
  // SECURITY ADMINISTRATION
  // =========================================================================
  getSecuritySessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.query.userId ? Number(req.query.userId) : undefined;
      const data = await this.service.getSecuritySessions(userId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  revokeSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sessionId = Number(req.params.id);
      const success = await this.service.revokeSession(sessionId);
      res.json({ data: { success } });
    } catch (err) {
      next(err);
    }
  };

  revokeUserSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const count = await this.service.revokeUserSessions(userId);
      res.json({ data: { success: true, revokedCount: count } });
    } catch (err) {
      next(err);
    }
  };

  getLoginAttempts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, username, success, startDate, endDate } = req.query;
      const data = await this.service.getLoginAttempts({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        username: username as string,
        success: success !== undefined ? (success === 'true' || success === '1') : undefined,
        startDate: startDate as string,
        endDate: endDate as string
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  unlockUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number(req.params.id);
      const data = await this.service.unlockUser(userId, req.user!.id, req.user!.username);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getRolePermissionsMatrix = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getRolePermissionsMatrix();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  updateRolePermissions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roleId = Number(req.params.roleId);
      const { permissionIds } = req.body;
      if (!Array.isArray(permissionIds)) {
        res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'permissionIds must be an array of numbers.' } });
        return;
      }
      await this.service.updateRolePermissions(roleId, permissionIds, req.user!.id, req.user!.username);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // PACKAGE 5: BACKUP, RESTORE, RECYCLE BIN, SYSTEM HEALTH
  // =========================================================================
  getBackups = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getBackups();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, notes } = req.body || {};
      const data = await this.service.createBackup(req.user!.id, type, notes);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  downloadBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const backup = await this.service.getBackupById(id);
      res.download(backup.file_path, backup.file_name);
    } catch (err) {
      next(err);
    }
  };

  verifyBackupChecksum = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const data = await this.service.verifyBackupChecksum(id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  restoreBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const { confirmationWord, adminPassword } = req.body || {};
      const data = await this.service.restoreBackup(id, req.user!.id, confirmationWord, adminPassword);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  deleteBackup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      await this.service.deleteBackup(id, req.user!.id);
      res.json({ data: { success: true } });
    } catch (err) {
      next(err);
    }
  };

  getRecycleBin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityType, page, limit } = req.query;
      const data = await this.service.getRecycleBinItems(
        entityType as string,
        page ? Number(page) : 1,
        limit ? Number(limit) : 25
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  restoreRecycleBinItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityType, id } = req.body || {};
      if (!entityType || !id) {
        res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'entityType and id are required.' } });
        return;
      }
      const data = await this.service.restoreRecycleBinItem(entityType, Number(id), req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  purgeRecycleBinItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { entityType, id, adminPassword } = req.body || {};
      if (!entityType || !id) {
        res.status(400).json({ error: { code: 'INVALID_PARAMS', message: 'entityType and id are required.' } });
        return;
      }
      const data = await this.service.purgeRecycleBinItem(entityType, Number(id), req.user!.id, adminPassword);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  purgeAllExpiredRecycleBin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { adminPassword } = req.body || {};
      const data = await this.service.purgeAllExpiredRecycleBin(req.user!.id, adminPassword);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getDiagnostics = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getSystemDiagnostics();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // PACKAGE 3: APPROVALS QUEUE
  // =========================================================================
  getApprovals = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, type, requestedBy, page, limit } = req.query;
      const data = await this.service.listApprovals({
        status: status ? String(status) : undefined,
        type: type ? String(type) : undefined,
        requestedBy: requestedBy ? Number(requestedBy) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getApprovalsSummary = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getApprovalsSummary();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getApprovalById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const data = await this.service.getApprovalById(id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createApproval = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, entityType, entityId, oldValue, newValue, reason } = req.body;
      const data = await this.service.createApproval({
        type,
        entity_type: entityType || 'generic',
        entity_id: entityId ? Number(entityId) : null,
        requested_by: req.user!.id,
        requester_username: req.user!.username,
        old_value_json: oldValue,
        new_value_json: newValue,
        reason
      });
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  decideApproval = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const { action, decisionNote } = req.body;
      const data = await this.service.decideApproval(
        id,
        { action, decisionNote },
        req.user!.id,
        req.user!.username
      );
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  cancelApproval = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const data = await this.service.cancelApproval(id, req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // PACKAGE 1: FINANCE & FEES
  // =========================================================================
  getFinanceOverview = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getFinanceOverview();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getFeeCategories = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getFeeCategories();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createFeeCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.createFeeCategory(req.body, req.user!.id, req.user!.username);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getFeeStructures = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;
      const data = await this.service.getFeeStructures(academicYearId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createFeeStructure = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.createFeeStructure(req.body, req.user!.id);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getInvoices = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, search, studentId, page, limit } = req.query;
      const data = await this.service.getInvoices({
        status: status ? String(status) : undefined,
        search: search ? String(search) : undefined,
        studentId: studentId ? Number(studentId) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getInvoiceById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const data = await this.service.getInvoiceById(id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createInvoice = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.createInvoice(req.body, req.user!.id);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  voidInvoice = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const { reason } = req.body;
      const data = await this.service.voidInvoice(id, reason, req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getPayments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { method, search, studentId, page, limit } = req.query;
      const data = await this.service.getPayments({
        method: method ? String(method) : undefined,
        search: search ? String(search) : undefined,
        studentId: studentId ? Number(studentId) : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  recordPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.recordPayment(req.body, req.user!.id);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  getScholarships = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getScholarships();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  createScholarship = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.createScholarship(req.body, req.user!.id);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  // =========================================================================
  // PACKAGE 4: RESULTS PUBLISHING & REPORT CARDS
  // =========================================================================
  getPublications = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { termId, sectionId, status } = req.query;
      const data = await this.service.getPublications({
        termId: termId ? Number(termId) : undefined,
        sectionId: sectionId ? Number(sectionId) : undefined,
        status: status ? String(status) : undefined
      });
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  generateResultsDraft = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.generateDraft(req.body, req.user!.id);
      res.status(201).json({ data });
    } catch (err) {
      next(err);
    }
  };

  submitPublication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const data = await this.service.submitPublication(id, req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  approvePublication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const data = await this.service.approvePublication(id, req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  publishPublication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const data = await this.service.publishPublication(id, req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  withdrawPublication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const { reason } = req.body;
      const data = await this.service.withdrawPublication(id, reason, req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getSectionReportCards = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const data = await this.service.getSectionReportCards(id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStudentReportCard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const enrollmentId = Number(req.params.enrollmentId);
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const data = await this.service.getStudentReportCard(enrollmentId, termId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };
}
