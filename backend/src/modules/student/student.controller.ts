import { Request, Response, NextFunction } from 'express';
import { StudentService } from './student.service';

export class StudentController {
  private service = new StudentService();

  getDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getDashboardData(req.user!.id);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  };

  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await this.service.getProfile(req.user!.id);
      res.json({ data: profile });
    } catch (err) {
      next(err);
    }
  };
}
