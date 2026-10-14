import { Router } from 'express';
import { StudentController } from './student.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';

const router = Router();
const controller = new StudentController();

// Protected by student authentication
router.use(authenticateToken);
router.use(requireRole('student'));

router.get('/dashboard', controller.getDashboard);
router.get('/profile', controller.getProfile);

export default router;
