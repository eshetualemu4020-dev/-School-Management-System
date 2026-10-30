import { Router } from 'express';
import { ParentController } from './parent.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { assertPortalEnabled, resolveGuardianProfile, assertChildAccess } from './parent.middleware';

const router = Router();
const controller = new ParentController();

// All parent routes require authentication and guardian role
router.use(authenticateToken);
router.use(requireRole('guardian'));
router.use(assertPortalEnabled);
router.use(resolveGuardianProfile);

// ============================================================================
// LEVEL 1: FAMILY-WIDE & PERSISTENT SIDEBAR ROUTES
// ============================================================================
router.get('/dashboard', controller.getDashboard);
router.get('/children', controller.getChildren);
router.get('/requests', controller.getRequests);
router.post('/requests', controller.createRequest);
router.get('/finance', controller.getFinanceSummary);
router.get('/announcements', controller.getAnnouncements);
router.get('/communications', controller.getCommunications);
router.get('/meeting-requests', controller.getMeetingRequests);
router.post('/meeting-requests', controller.createMeetingRequest);

// ============================================================================
// LEVEL 2: CONTEXTUAL CHILD-SPECIFIC ROUTES (GUARDED BY CHILD ACCESS)
// ============================================================================
router.get('/children/:studentId/overview', assertChildAccess(), controller.getChildOverview);
router.get('/children/:studentId/marks', assertChildAccess('can_view_results'), controller.getChildMarks);
router.get('/children/:studentId/attendance', assertChildAccess('can_view_attendance'), controller.getChildAttendance);
router.get('/children/:studentId/subjects', assertChildAccess(), controller.getChildSubjects);
router.get('/children/:studentId/teachers', assertChildAccess(), controller.getStudentTeachers);
router.get('/children/:studentId/timetable', assertChildAccess(), controller.getChildTimetable);
router.get('/children/:studentId/assessments', assertChildAccess(), controller.getChildAssessments);
router.get('/children/:studentId/documents', assertChildAccess('can_view_results'), controller.getChildDocuments);
router.get('/children/:studentId/history', assertChildAccess(), controller.getChildHistory);
router.get('/children/:studentId/finance', assertChildAccess('can_view_fees'), controller.getChildFinance);

// Legacy backward compatibility route
router.get('/children/:studentId', assertChildAccess(), controller.getChildDetails);

export default router;
