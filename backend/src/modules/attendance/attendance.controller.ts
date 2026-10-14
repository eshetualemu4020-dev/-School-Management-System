import { Request, Response, NextFunction } from 'express';
import { AttendanceService } from './attendance.service';
import { z } from 'zod';

const recordAttendanceSchema = z.object({
  sectionId: z.number().int().positive(),
  attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format must be YYYY-MM-DD'),
  subjectId: z.number().int().positive().nullable().optional(),
  status: z.enum(['submitted', 'locked']).default('submitted'),
  records: z.array(
    z.object({
      enrollmentId: z.number().int().positive(),
      statusCode: z.enum(['present', 'absent', 'late', 'excused']),
      note: z.string().max(255).optional()
    })
  ).min(1, 'At least one student record is required.')
});

export class AttendanceController {
  private service = new AttendanceService();

  getSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sectionId = Number(req.query.sectionId);
      const date = String(req.query.date || new Date().toISOString().split('T')[0]);
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;

      if (!sectionId) {
        res.status(400).json({ error: { code: 'INVALID_QUERY', message: 'sectionId query parameter is required.' } });
        return;
      }

      const session = await this.service.getSession(sectionId, date, subjectId);
      res.status(200).json({ data: session });
    } catch (err) {
      next(err);
    }
  };

  getHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sectionId = Number(req.params.sectionId);
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

      const history = await this.service.getHistory(sectionId, startDate, endDate);
      res.status(200).json({ data: history });
    } catch (err) {
      next(err);
    }
  };

  recordAttendance = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = recordAttendanceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid attendance submission.',
            details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
          }
        });
        return;
      }

      const { sectionId, attendanceDate, subjectId, status, records } = parsed.data;
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const username = req.user!.username;

      const result = await this.service.recordAttendance(
        staffId,
        userId,
        username,
        sectionId,
        attendanceDate,
        subjectId || null,
        status,
        records
      );

      res.status(200).json({
        data: result,
        message: 'Attendance recorded and persisted successfully.'
      });
    } catch (err) {
      next(err);
    }
  };
}
