import { Router } from 'express';
import { LibrarianController } from './librarian.controller';
import { authenticateToken } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';

const router = Router();
const controller = new LibrarianController();

// Protected by librarian role (system_admin also permitted)
router.use(authenticateToken);
router.use(requireRole('librarian'));

router.get('/dashboard', controller.getDashboard);
router.get('/books', controller.getBooks);
router.post('/books', controller.addBook);
router.get('/loans', controller.getLoans);
router.post('/loans/issue', controller.issueLoan);
router.post('/loans/:id/return', controller.returnLoan);
router.get('/reservations', controller.getReservations);

export default router;
