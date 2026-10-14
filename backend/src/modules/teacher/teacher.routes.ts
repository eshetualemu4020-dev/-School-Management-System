import { Router } from 'express';
import { TeacherController } from './teacher.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireTeacher } from '../../middleware/rbac';

const router = Router();
const controller = new TeacherController();

router.use(authenticateToken);
router.use(requireTeacher);

router.get('/dashboard', controller.getDashboard);
router.get('/classes', controller.getClasses);
router.get('/classes/:sectionId/students', controller.getSectionStudents);
router.get('/timetable', controller.getTimetable);
router.get('/announcements', controller.getAnnouncements);

// Subjects, Years & Terms
router.get('/subjects', controller.getSubjects);
router.get('/academic-years', controller.getAcademicYears);
router.get('/terms', controller.getTerms);

// Teacher Reports
router.get('/reports/attendance', controller.getAttendanceReport);
router.get('/reports/marks', controller.getMarksReport);
router.get('/reports/class-performance', controller.getClassPerformanceReport);
router.get('/reports/student-performance', controller.getStudentPerformanceReport);
router.get('/reports/assessment-summary', controller.getAssessmentSummaryReport);

export default router;
