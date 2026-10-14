import { Router } from 'express';
import { ParentController } from './parent.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';

const router = Router();
const controller = new ParentController();

// Protected by guardian role (system_admin also permitted)
router.use(authenticateToken);
router.use(requireRole('guardian'));

router.get('/dashboard', controller.getDashboard);
router.get('/children/:studentId', controller.getChildDetails);

export default router;
