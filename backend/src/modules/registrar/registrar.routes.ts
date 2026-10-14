import { Router } from 'express';
import { RegistrarController } from './registrar.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';

const router = Router();
const controller = new RegistrarController();

// Protected by registrar role (system_admin also permitted)
router.use(authenticateToken);
router.use(requireRole('registrar'));

router.get('/dashboard', controller.getDashboard);
router.get('/students', controller.getStudents);
router.post('/students', controller.registerStudent);
router.get('/sections', controller.getSections);
router.patch('/students/:id/reassign-section', controller.reassignSection);
router.get('/transfers', controller.getTransfers);
router.post('/transfers', controller.recordTransfer);
router.get('/documents', controller.getDocuments);

export default router;
