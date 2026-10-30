import { Router } from 'express';
import { RegistrarController } from './registrar.controller';
import { authenticateToken } from '../../middleware/auth';
import { requirePermission, requireRole } from '../../middleware/rbac';

const router = Router();
const controller = new RegistrarController();

// Protected by registrar role (system_admin also permitted)
router.use(authenticateToken);
router.use(requireRole('registrar'));

router.get('/dashboard', requirePermission('student.read'), controller.getDashboard);
router.get('/admissions', requirePermission('student.read'), controller.getAdmissionApplications);
router.post('/admissions', requirePermission('student.create'), controller.createAdmissionApplication);
router.get('/students', requirePermission('student.read'), controller.getStudents);
router.get('/students/:id/photo', requirePermission('student.read'), controller.getStudentPhoto);
router.post('/students', requirePermission('student.create'), controller.registerStudent);
router.get('/sections', requirePermission('student.read'), controller.getSections);
router.patch(
  '/students/:id/reassign-section',
  requirePermission('student.update'),
  requirePermission('enrollment.manage'),
  controller.reassignSection
);
router.get('/transfers', requirePermission('enrollment.manage'), controller.getTransfers);
router.post('/transfers', requirePermission('enrollment.manage'), controller.recordTransfer);
router.get('/documents', requirePermission('student.read'), controller.getDocuments);
router.get('/guardians', requirePermission('guardian.verify'), controller.getGuardians);
router.get('/attendance/summary', requirePermission('attendance.read'), controller.getAttendanceSummary);
router.get('/examinations/completeness', requirePermission('results.read'), controller.getAssessmentCompleteness);
router.get('/results/academic-records', requirePermission('results.read'), controller.getApprovedAcademicRecords);
router.get('/promotions', requirePermission('promotion.manage'), controller.getPromotionRecords);
router.get('/reports/data-quality', requirePermission('report.read'), controller.getDataQualitySummary);
router.get('/reports/registration-by-year', requirePermission('report.read'), controller.getRegistrationByYear);
router.get('/reports/data-quality/details', requirePermission('report.read'), controller.getDataQualityDetails);
router.get('/profile', controller.getProfile);
router.put('/profile', controller.updateProfile);
router.get('/profile/photo', controller.getProfilePhoto);

export default router;
