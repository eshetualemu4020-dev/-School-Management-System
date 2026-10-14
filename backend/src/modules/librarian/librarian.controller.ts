import { Request, Response, NextFunction } from 'express';
import { LibrarianService } from './librarian.service';

export class LibrarianController {
  private service = new LibrarianService();

  getDashboard = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getDashboardData();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getBooks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const search = req.query.search as string | undefined;
      const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
      const books = await this.service.listBooks(search, categoryId);
      res.json({ data: books });
    } catch (err) {
      next(err);
    }
  };

  addBook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.addBook(req.body);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getLoans = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter = req.query.filter as 'all' | 'active' | 'overdue' | 'returned' | undefined;
      const loans = await this.service.listLoans(filter);
      res.json({ data: loans });
    } catch (err) {
      next(err);
    }
  };

  issueLoan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { barcode, studentAdmissionNo, dueDate } = req.body;
      const result = await this.service.issueBook(barcode, studentAdmissionNo, dueDate, req.user!.id);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  returnLoan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const loanId = Number(req.params.id);
      const result = await this.service.returnBook(loanId, req.user!.id);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getReservations = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const reservations = await this.service.listReservations();
      res.json({ data: reservations });
    } catch (err) {
      next(err);
    }
  };
}
