import { Router } from 'express';
import { AdminController } from './admin.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';

const router = Router();
const controller = new AdminController();

// All admin routes require authentication and system_admin role
router.use(authenticateToken);
router.use(requireRole('system_admin'));

// ---------------------------------------------------------------------------
// PAGE 1: DASHBOARD OVERVIEW
// ---------------------------------------------------------------------------
router.get('/dashboard', controller.getDashboard);

// ---------------------------------------------------------------------------
// PAGE 2: STUDENT MANAGEMENT
// ---------------------------------------------------------------------------
router.get('/students', controller.getStudents);
router.get('/students/transfers', controller.getTransfers);
router.get('/students/options', controller.getStudentOptions);
router.get('/students/:id/photo', controller.getStudentPhoto);
router.get('/students/:id', controller.getStudent);
router.post('/students', controller.registerStudent);
router.put('/students/:id', controller.updateStudent);
router.post('/students/:id/status', controller.setStudentStatus);
router.post('/students/:id/reassign-section', controller.reassignStudentSection);

// ---------------------------------------------------------------------------
// PAGE 3: STAFF AND USER MANAGEMENT
// ---------------------------------------------------------------------------
router.get('/staff', controller.getStaff);
router.post('/staff', controller.createStaff);
router.get('/staff/:id/profile', controller.getTeacherProfile);
router.get('/staff/:id/photo', controller.getStaffPhoto);
router.post('/staff/:id/photo', controller.uploadStaffPhoto);
router.get('/staff/:id/assignments', controller.getTeacherAssignments);
router.get('/staff/:id/qualifications', controller.getStaffQualifications);
router.get('/staff/:id/qualification-history', controller.getQualificationHistory);
router.post('/staff/:id/qualifications', controller.createQualification);
router.put('/staff/:id/qualifications/:qualificationId', controller.updateQualification);
router.delete('/staff/:id/qualifications/:qualificationId', controller.deleteQualification);
router.post('/staff/:id/qualifications/:qualificationId/document', controller.uploadQualificationDocument);
router.post('/staff/:id/qualification-documents/:documentId/verify', controller.verifyQualificationDocument);
router.get('/staff/:id/qualification-documents/:documentId/download', controller.downloadQualificationDocument);
router.put('/staff/:id', controller.updateStaff);
router.get('/users', controller.getUsers);
router.post('/users', controller.createUser);
router.patch('/users/:id/status', controller.setUserStatus);
router.put('/users/:id/status', controller.setUserStatus);
router.post('/users/:id/reset-password', controller.resetPassword);
router.put('/users/:id/roles', controller.setUserRoles);
router.get('/roles', controller.getRoles);

// ---------------------------------------------------------------------------
// PAGE 4: ACADEMIC STRUCTURE AND CONFIGURATION
// ---------------------------------------------------------------------------
router.get('/classes', controller.getClasses);
router.get('/academic-structure', controller.getAcademicStructure);
router.post('/grades', controller.createGrade);
router.put('/grades/:id', controller.updateGrade);
router.post('/academic-years', controller.createAcademicYear);
router.post('/academic-years/:id/activate', controller.activateAcademicYear);
router.post('/terms', controller.createTerm);
router.post('/terms/:id/activate', controller.activateTerm);
router.post('/sections', controller.createSection);
router.put('/sections/:id', controller.updateSection);
router.post('/subjects', controller.createSubject);
router.put('/subjects/:id', controller.updateSubject);
router.post('/grade-subjects', controller.addGradeSubject);
router.delete('/grade-subjects/:id', controller.removeGradeSubject);
router.get('/settings', controller.getSettings);
router.put('/settings', controller.updateSetting);

// ---------------------------------------------------------------------------
// PAGE 5: TEACHING ASSIGNMENTS AND TIMETABLE
// ---------------------------------------------------------------------------
router.get('/assignments', controller.getAssignments);
router.post('/assignments', controller.createAssignment);
router.delete('/assignments/:id', controller.deleteAssignment);
router.get('/timetable', controller.getTimetable);
router.post('/timetable', controller.createTimetableEntry);
router.delete('/timetable/:id', controller.deleteTimetableEntry);
router.get('/time-slots', controller.getTimeSlots);
router.post('/time-slots', controller.createTimeSlot);

// ---------------------------------------------------------------------------
// PAGE 6: ATTENDANCE AND ACADEMIC RESULTS
// ---------------------------------------------------------------------------
router.get('/attendance-summary', controller.getAttendanceSummary);
router.get('/assessments-overview', controller.getAssessmentsOverview);
router.get('/assessment-configuration-options', controller.getAssessmentConfigurationOptions);
router.post('/assessments', controller.createAdminAssessment);
router.put('/assessments/:id', controller.updateAdminAssessment);
router.post('/assessments/:id/approve', controller.approveMarks);
router.get('/grading-scales', controller.getGradingScales);

// ---------------------------------------------------------------------------
// PAGE 7: REPORTS, ANALYTICS, AND LIBRARY OVERVIEW
// ---------------------------------------------------------------------------
router.get('/reports/enrollment', controller.getEnrollmentReport);
router.get('/reports/attendance', controller.getAttendanceReport);
router.get('/reports/academic', controller.getPerformanceReport);
router.get('/reports/staff-workload', controller.getStaffWorkloadReport);
router.get('/library-overview', controller.getLibraryOverview);

// ---------------------------------------------------------------------------
// PAGE 8: COMMUNICATIONS, AUDIT LOGS, AND PROFILE
// ---------------------------------------------------------------------------
router.get('/announcements', controller.getAnnouncements);
router.post('/announcements', controller.createAnnouncement);
router.put('/announcements/:id/status', controller.setAnnouncementStatus);
router.delete('/announcements/:id', controller.deleteAnnouncement);
router.get('/audit-logs', controller.getAuditLogs);
router.get('/profile', controller.getProfile);
router.get('/profile/notification-preferences', controller.getNotificationPreferences);
router.put('/profile/notification-preferences', controller.saveNotificationPreferences);
router.get('/profile/photo', controller.getAdminProfilePhoto);
router.put('/profile', controller.updateProfile);
router.post('/change-password', controller.changePassword);

// ---------------------------------------------------------------------------
// SECURITY ADMINISTRATION (PACKAGE 6)
// ---------------------------------------------------------------------------
router.get('/security/sessions', controller.getSecuritySessions);
router.post('/security/sessions/:id/revoke', controller.revokeSession);
router.post('/security/users/:id/revoke-sessions', controller.revokeUserSessions);
router.get('/security/login-attempts', controller.getLoginAttempts);
router.post('/security/users/:id/unlock', controller.unlockUser);
router.get('/security/role-permissions', controller.getRolePermissionsMatrix);
router.put('/security/roles/:roleId/permissions', controller.updateRolePermissions);

// ---------------------------------------------------------------------------
// PACKAGE 5: DISASTER RECOVERY, RECYCLE BIN, AND SYSTEM HEALTH
// ---------------------------------------------------------------------------
router.get('/backups', controller.getBackups);
router.post('/backups', controller.createBackup);
router.get('/backups/:id/download', controller.downloadBackup);
router.post('/backups/:id/verify', controller.verifyBackupChecksum);
router.post('/backups/:id/restore', controller.restoreBackup);
router.delete('/backups/:id', controller.deleteBackup);

router.get('/recycle-bin', controller.getRecycleBin);
router.post('/recycle-bin/restore', controller.restoreRecycleBinItem);
router.post('/recycle-bin/purge', controller.purgeRecycleBinItem);
router.post('/recycle-bin/purge-all', controller.purgeAllExpiredRecycleBin);

router.get('/health/diagnostics', controller.getDiagnostics);

// ---------------------------------------------------------------------------
// PACKAGE 3: APPROVALS QUEUE
// ---------------------------------------------------------------------------
router.get('/approvals', controller.getApprovals);
router.get('/approvals/summary', controller.getApprovalsSummary);
router.get('/approvals/:id', controller.getApprovalById);
router.post('/approvals', controller.createApproval);
router.post('/approvals/:id/decide', controller.decideApproval);
router.post('/approvals/:id/cancel', controller.cancelApproval);

// ---------------------------------------------------------------------------
// PACKAGE 1: FINANCE & FEES (11th MODULE)
// ---------------------------------------------------------------------------
router.get('/finance/overview', controller.getFinanceOverview);
router.get('/finance/fee-categories', controller.getFeeCategories);
router.post('/finance/fee-categories', controller.createFeeCategory);
router.get('/finance/fee-structures', controller.getFeeStructures);
router.post('/finance/fee-structures', controller.createFeeStructure);
router.get('/finance/invoices', controller.getInvoices);
router.get('/finance/invoices/:id', controller.getInvoiceById);
router.post('/finance/invoices', controller.createInvoice);
router.post('/finance/invoices/:id/void', controller.voidInvoice);
router.get('/finance/payments', controller.getPayments);
router.post('/finance/payments', controller.recordPayment);
router.get('/finance/scholarships', controller.getScholarships);
router.post('/finance/scholarships', controller.createScholarship);

// ---------------------------------------------------------------------------
// PACKAGE 4: RESULTS PUBLISHING & REPORT CARDS
// ---------------------------------------------------------------------------
router.get('/results/publications', controller.getPublications);
router.post('/results/publications/generate', controller.generateResultsDraft);
router.post('/results/publications/:id/submit', controller.submitPublication);
router.post('/results/publications/:id/approve', controller.approvePublication);
router.post('/results/publications/:id/publish', controller.publishPublication);
router.post('/results/publications/:id/withdraw', controller.withdrawPublication);
router.get('/results/publications/:id/report-cards', controller.getSectionReportCards);
router.get('/results/report-cards/student/:enrollmentId', controller.getStudentReportCard);

// ---------------------------------------------------------------------------
// ACADEMIC LIFECYCLE
// ---------------------------------------------------------------------------
router.get('/academic-lifecycle/options', controller.getAcademicLifecycleOptions);
router.get('/academic-lifecycle/policies', controller.getAcademicPolicies);
router.put('/academic-lifecycle/policies', controller.saveAcademicPolicy);
router.get('/academic-lifecycle/prerequisites', controller.getAcademicSubjectPrerequisites);
router.post('/academic-lifecycle/prerequisites', controller.addAcademicSubjectPrerequisite);
router.delete('/academic-lifecycle/prerequisites/:id', controller.removeAcademicSubjectPrerequisite);
router.get('/academic-lifecycle/exams', controller.getAcademicExamSchedules);
router.post('/academic-lifecycle/exams', controller.saveAcademicExamSchedule);
router.put('/academic-lifecycle/exams/:id', controller.saveAcademicExamSchedule);
router.patch('/academic-lifecycle/exams/:id/status', controller.setAcademicExamScheduleStatus);
router.get('/academic-lifecycle/course-enrollments', controller.getAcademicCourseEnrollments);
router.post('/academic-lifecycle/course-enrollments', controller.createAcademicCourseEnrollment);
router.post('/academic-lifecycle/course-enrollments/:id/drop', controller.dropAcademicCourseEnrollment);
router.post('/academic-lifecycle/transcripts/issue', controller.issueAcademicTranscript);
router.get('/academic-lifecycle/transcripts/:studentId/issues', controller.getIssuedAcademicTranscripts);
router.get('/academic-lifecycle/transcripts/:studentId', controller.getAcademicTranscript);
router.get('/academic-lifecycle/rankings', controller.getAcademicRankings);
router.post('/academic-lifecycle/promotions/evaluate', controller.evaluateAcademicPromotions);
router.post('/academic-lifecycle/promotions', controller.recordAcademicPromotion);
router.get('/academic-lifecycle/probations/candidates', controller.getAcademicProbationCandidates);
router.get('/academic-lifecycle/probations', controller.getAcademicProbations);
router.post('/academic-lifecycle/probations', controller.createAcademicProbation);
router.patch('/academic-lifecycle/probations/:id', controller.updateAcademicProbation);
router.post('/academic-lifecycle/graduation/evaluate', controller.evaluateAcademicGraduation);
router.get('/academic-lifecycle/graduation/reviews', controller.getAcademicGraduationReviews);
router.post('/academic-lifecycle/graduation/reviews', controller.saveAcademicGraduationReview);
router.post('/academic-lifecycle/graduation/:enrollmentId/issue', controller.issueAcademicGraduationCertificate);

export default router;
