import { Request, Response, NextFunction } from 'express';
import { RegistrarService } from './registrar.service';

export class RegistrarController {
  private service = new RegistrarService();

  getDashboard = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getDashboardData();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getStudents = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const search = req.query.search as string | undefined;
      const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
      const status = req.query.status as string | undefined;
      const students = await this.service.listStudents(search, sectionId, status);
      res.json({ data: students });
    } catch (err) {
      next(err);
    }
  };

  getSections = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sections = await this.service.listSections();
      res.json({ data: sections });
    } catch (err) {
      next(err);
    }
  };

  registerStudent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.registerStudent({
        ...req.body,
        userId: req.user!.id
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  reassignSection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.id);
      const { sectionId } = req.body;
      const result = await this.service.reassignSection(studentId, Number(sectionId));
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getTransfers = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const transfers = await this.service.listTransfers();
      res.json({ data: transfers });
    } catch (err) {
      next(err);
    }
  };

  recordTransfer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.recordTransfer({
        ...req.body,
        userId: req.user!.id
      });
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  };

  getDocuments = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const documents = await this.service.listDocuments();
      res.json({ data: documents });
    } catch (err) {
      next(err);
    }
  };
}
