import { Router } from 'express';
import { AssessmentController } from './assessment.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireTeacher, requirePermission } from '../../middleware/rbac';

const router = Router();
const controller = new AssessmentController();

router.use(authenticateToken);
router.use(requireTeacher);

router.get('/types', controller.getAssessmentTypes);
router.get('/', controller.getAssessments);
router.post('/', requirePermission('assessment.configure'), controller.createAssessment);
router.get('/:id', controller.getAssessmentDetails);
router.put('/:id/marks', requirePermission('marks.enter'), controller.saveMarks);

export default router;
