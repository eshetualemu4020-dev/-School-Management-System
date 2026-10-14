import { LibrarianRepository } from './librarian.repository';
import { AppError } from '../../middleware/errorHandler';

export class LibrarianService {
  private repo = new LibrarianRepository();

  async getDashboardData() {
    const metrics = await this.repo.getDashboardMetrics();
    const categories = await this.repo.getBookCategories();
    return { metrics, categories };
  }

  async listBooks(search?: string, categoryId?: number) {
    return this.repo.getBooks(search, categoryId);
  }

  async addBook(payload: {
    isbn?: string;
    title: string;
    author: string;
    publisher?: string;
    publicationYear?: number;
    categoryId: number;
    language?: string;
    barcode: string;
    location?: string;
  }) {
    if (!payload.title || !payload.author || !payload.categoryId || !payload.barcode) {
      throw new AppError('Title, author, category, and initial copy barcode are required.', 400, 'VALIDATION_ERROR');
    }
    const bookId = await this.repo.createBook(payload);
    return { bookId, message: 'Book title and copy added to catalog successfully.' };
  }

  async listLoans(filter?: 'all' | 'active' | 'overdue' | 'returned') {
    return this.repo.getLoans(filter);
  }

  async issueBook(copyBarcode: string, studentAdmissionNo: string, dueDate: string, userId: number) {
    if (!copyBarcode || !studentAdmissionNo || !dueDate) {
      throw new AppError('Barcode, student admission number, and due date are required.', 400, 'VALIDATION_ERROR');
    }
    try {
      const loanId = await this.repo.issueLoan(copyBarcode, studentAdmissionNo, dueDate, userId);
      return { loanId, message: `Book copy '${copyBarcode}' successfully issued to student '${studentAdmissionNo}'.` };
    } catch (err: any) {
      throw new AppError(err.message, 400, 'LOAN_ISSUE_FAILED');
    }
  }

  async returnBook(loanId: number, userId: number) {
    try {
      await this.repo.returnLoan(loanId, userId);
      return { success: true, message: 'Book copy successfully returned and restored to available inventory.' };
    } catch (err: any) {
      throw new AppError(err.message, 400, 'LOAN_RETURN_FAILED');
    }
  }

  async listReservations() {
    return this.repo.getReservations();
  }
}
