import { Router } from 'express';
import { AttendanceController } from './attendance.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireTeacher, requirePermission } from '../../middleware/rbac';

const router = Router();
const controller = new AttendanceController();

router.use(authenticateToken);
router.use(requireTeacher);

router.get('/session', controller.getSession);
router.get('/history/:sectionId', controller.getHistory);
router.post('/record', requirePermission('attendance.record'), controller.recordAttendance);

export default router;
