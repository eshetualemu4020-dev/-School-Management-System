import { Request, Response, NextFunction } from 'express';
import { ParentService } from './parent.service';

export class ParentController {
  private service = new ParentService();

  getDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getDashboardData(req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getChildDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const studentId = Number(req.params.studentId);
      const data = await this.service.getChildDetails(req.user!.id, studentId);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };
}
