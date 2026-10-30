import { Router } from 'express';
import { TeacherController } from './teacher.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireTeacher } from '../../middleware/rbac';

const router = Router();
const controller = new TeacherController();

router.use(authenticateToken);
router.use(requireTeacher);

// 1. Dashboard
router.get('/dashboard', controller.getDashboard);
router.get('/dashboard/extended', controller.getDashboardExtended);

// 2. Attendance Extensions
router.get('/attendance/history/:sectionId', controller.getAttendanceHistory);
router.post('/attendance/correction-request', controller.requestAttendanceCorrection);
router.get('/attendance/repeated-absences/:sectionId', controller.getRepeatedAbsences);
router.get('/attendance/student-detail/:sectionId/:studentId', controller.getStudentAttendanceDetail);

// 3. Marks Extensions
router.post('/marks/correction-request', controller.requestMarkCorrection);
router.get('/marks/history/:assessmentId', controller.getMarksHistory);
router.get('/marks/missing/:assessmentId', controller.getMissingMarks);

// 4. Teacher Reports
router.get('/reports/attendance', controller.getAttendanceReport);
router.get('/reports/marks', controller.getMarksReport);
router.get('/reports/class-performance', controller.getClassPerformanceReport);
router.get('/reports/student-performance', controller.getStudentPerformanceReport);
router.get('/reports/assessment-summary', controller.getAssessmentSummaryReport);

// 5. My Classes
router.get('/classes', controller.getClasses);
router.get('/classes/:sectionId/students', controller.getSectionStudents);
router.get('/classes/:sectionId/detail', controller.getClassDetail);
router.get('/classes/student-profile/:studentId', controller.getStudentProfileScoped);
router.get('/classes/homeroom', controller.getHomeroomSection);

// 6. Timetable
router.get('/timetable', controller.getTimetable);

// 7. My Subjects
router.get('/subjects', controller.getSubjects);
router.get('/subjects/detailed', controller.getSubjectsDetailed);

// 8. Assignments & Homework
router.get('/assignments', controller.getAssignments);
router.post('/assignments', controller.createAssignment);
router.get('/assignments/:assignmentId/submissions', controller.getAssignmentSubmissions);
router.put('/assignments/submissions/:submissionId/grade', controller.gradeSubmission);

// 9. Lessons & Teaching Materials
router.get('/lessons/resources', controller.getLearningResources);
router.post('/lessons/resources', controller.createLearningResource);
router.get('/lessons/resources/:id/download', controller.downloadLearningResourceFile);
router.put('/lessons/resources/:id', controller.updateLearningResource);
router.delete('/lessons/resources/:id', controller.deleteLearningResource);

// 10. Student Welfare & Behavior
router.get('/welfare/incidents', controller.getDisciplineRecords);
router.post('/welfare/incidents', controller.reportDisciplineIncident);
router.put('/welfare/incidents/:id', controller.updateDisciplineRecord);
router.delete('/welfare/incidents/:id', controller.deleteDisciplineRecord);

// 11. Communication & Meetings
router.get('/communication/parents', controller.getContactableParents);
router.get('/communication/messages', controller.getCommunications);
router.post('/communication/messages', controller.sendCommunication);
router.delete('/communication/messages/:id', controller.deleteCommunication);
router.get('/communication/meetings', controller.getMeetingRequests);
router.post('/communication/meetings', controller.createMeetingRequest);
router.put('/communication/meetings/:id', controller.updateMeetingRequest);
router.delete('/communication/meetings/:id', controller.deleteMeetingRequest);

// 12. Requests & Approvals
router.get('/requests', controller.getMyRequests);
router.post('/requests', controller.createTeacherRequest);
router.post('/requests/:id/cancel', controller.cancelMyRequest);

// 13. Notifications & Announcements
router.get('/announcements', controller.getAnnouncements);

// 14. Leave & Staff Attendance
router.get('/leave/attendance-history', controller.getStaffAttendanceHistory);
router.get('/leave/applications', controller.getMyLeaveApplications);
router.post('/leave/apply', controller.applyForLeave);
router.post('/leave/applications/:id/cancel', controller.cancelLeaveApplication);

// 15. My Profile
router.get('/profile', controller.getTeacherProfile);
router.delete('/profile/sessions/:id', controller.revokeSession);

// Reference data
router.get('/academic-years', controller.getAcademicYears);
router.get('/terms', controller.getTerms);

export default router;
