import { Router } from 'express';
import { StudentController } from './student.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { resolveStudentContext } from './student.middleware';

const router = Router();
const controller = new StudentController();

// Protected by student authentication and role authorization
router.use(authenticateToken);
router.use(requireRole('student'));
router.use(resolveStudentContext);

// Base Profile & Dashboard
router.get('/dashboard', controller.getDashboard);

// Page 12: My Profile
router.get('/profile', controller.getProfile);
router.patch('/profile', controller.updateProfile);
router.get('/profile/guardians', controller.getProfileGuardians);
router.get('/profile/photo', controller.getProfilePhoto);
router.post('/profile/photo', controller.uploadProfilePhoto);
router.delete('/profile/photo', controller.removeProfilePhoto);

// Page 2: Subjects & Materials
router.get('/subjects', controller.getMySubjects);
router.get('/subjects/:subjectId', controller.getSubjectDetail);
router.get('/materials', controller.getLearningMaterials);
router.get('/materials/:id/download', controller.downloadMaterial);

// Page 3: Timetable & Calendar
router.get('/timetable', controller.getWeeklyTimetable);
router.get('/timetable/today', controller.getTodayTimetable);
router.get('/calendar', controller.getAcademicCalendar);
router.get('/exams', controller.getExamSchedule);

// Page 4: Attendance
router.get('/attendance/summary', controller.getAttendanceSummary);
router.get('/attendance', controller.getAttendanceRecords);
router.get('/attendance/records', controller.getAttendanceRecords);

// Page 5: Assignments & Assessments
router.get('/assessments', controller.getAssessments);
router.get('/assessments/upcoming', controller.getUpcomingAssignments);
router.get('/assessments/past', controller.getPastAssessments);
router.get('/assessments/submitted', controller.getSubmittedAssignments);
router.get('/submissions', controller.getSubmittedAssignments);
router.get('/assessments/quizzes', controller.getQuizzesAndTests);
router.get('/assessments/:id', controller.getAssessmentDetail);
router.post('/assessments/:assignmentId/submit', controller.submitAssignment);
router.post('/assessments/:assignmentId/submission', controller.submitAssignment);
router.get('/submissions/:id/download', controller.downloadSubmissionFile);
router.get('/assessments/:id/submission/download', controller.downloadSubmissionFile);

// Page 6: Results & Academic Progress
router.get('/results', controller.getMyResults);
router.get('/results/my-results', controller.getMyResults);
router.get('/results/summary', controller.getTermSummary);
router.get('/results/term', controller.getPublishedTermResults);
router.get('/results/breakdown', controller.getContinuousBreakdown);
router.get('/results/analytics', controller.getAcademicAnalytics);
router.get('/progress', controller.getProgressAndTrends);
router.get('/results/progress', controller.getProgressAndTrends);

// Page 7: Report Cards & Documents
router.get('/report-cards', controller.getReportCards);
router.get('/report-cards/:id/download', controller.downloadReportCard);
router.get('/transcripts', controller.getTranscripts);
router.get('/transcripts/:id/download', controller.downloadTranscript);
router.get('/documents', controller.getIssuedDocuments);
router.get('/documents/:id/download', controller.downloadDocument);
router.get('/request-types', controller.getRequestTypes);
router.get('/requests', controller.getRequests);
router.get('/requests/:id', controller.getRequestDetail);
router.post('/requests', controller.submitRequest);
router.patch('/requests/:id/cancel', controller.cancelRequest);

// Page 9: Help & Support (support tickets)
router.get('/support/tickets', controller.getSupportTickets);
router.get('/support/tickets/:id', controller.getSupportTicket);
router.post('/support/tickets', controller.createSupportTicket);
router.patch('/support/tickets/:id/close', controller.closeSupportTicket);

// Page 11: Settings & Security
router.post('/settings/password', controller.changePassword);
router.get('/settings/sessions', controller.getSessions);
router.delete('/settings/sessions/:id', controller.revokeSession);
router.post('/settings/sessions/revoke-others', controller.revokeOtherSessions);
router.get('/settings/preferences', controller.getPreferences);
router.put('/settings/preferences', controller.savePreferences);

export default router;
