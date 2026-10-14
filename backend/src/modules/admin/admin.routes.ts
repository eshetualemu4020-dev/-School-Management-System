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
router.put('/profile', controller.updateProfile);
router.post('/change-password', controller.changePassword);

export default router;
