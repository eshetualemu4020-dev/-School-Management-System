import { Request, Response, NextFunction } from 'express';
import { AssessmentService } from './assessment.service';
import { z } from 'zod';

const createAssessmentSchema = z.object({
  teachingAssignmentId: z.number().int().positive(),
  termId: z.number().int().positive(),
  assessmentTypeId: z.number().int().positive(),
  title: z.string().min(2).max(190),
  maxScore: z.number().positive().max(100),
  weight: z.number().min(0).max(100),
  assessmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const saveMarksSchema = z.object({
  status: z.enum(['draft', 'submitted']).default('draft'),
  marks: z.array(
    z.object({
      enrollmentId: z.number().int().positive(),
      score: z.number(),
      feedback: z.string().max(500).optional(),
      markStatus: z.enum(['scored', 'absent', 'excused', 'exempt']).optional()
    })
  ).min(1, 'At least one mark must be provided.')
});

export class AssessmentController {
  private service = new AssessmentService();

  getAssessments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
      const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
      const termId = req.query.termId ? Number(req.query.termId) : undefined;
      const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : undefined;

      const list = await this.service.getAssessments(staffId, {
        sectionId,
        subjectId,
        termId,
        academicYearId
      });
      res.status(200).json({ data: list });
    } catch (err) {
      next(err);
    }
  };

  getAssessmentDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const staffId = req.user!.staffId!;
      const assessmentId = Number(req.params.id);
      const isAdmin = req.user!.roles.includes('system_admin') || req.user!.roles.includes('principal');

      const data = await this.service.getAssessmentDetails(staffId, assessmentId, isAdmin);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  };

  createAssessment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createAssessmentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid assessment creation data.',
            details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
          }
        });
        return;
      }

      const { teachingAssignmentId, termId, assessmentTypeId, title, maxScore, weight, assessmentDate } = parsed.data;
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;

      const created = await this.service.createAssessment(
        staffId,
        userId,
        teachingAssignmentId,
        termId,
        assessmentTypeId,
        title,
        maxScore,
        weight,
        assessmentDate
      );

      res.status(201).json({ data: created, message: 'Assessment created successfully.' });
    } catch (err) {
      next(err);
    }
  };

  saveMarks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const assessmentId = Number(req.params.id);
      const parsed = saveMarksSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid marks entry data.',
            details: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
          }
        });
        return;
      }

      const { status, marks } = parsed.data;
      const staffId = req.user!.staffId!;
      const userId = req.user!.id;
      const username = req.user!.username;
      const isAdmin = req.user!.roles.includes('system_admin') || req.user!.roles.includes('principal');

      const updatedMarks = await this.service.saveMarks(
        staffId,
        userId,
        username,
        assessmentId,
        status,
        marks,
        isAdmin
      );

      res.status(200).json({
        data: updatedMarks,
        message: status === 'submitted' ? 'Marks successfully submitted for approval.' : 'Marks saved as draft.'
      });
    } catch (err) {
      next(err);
    }
  };

  getAssessmentTypes = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const types = await this.service.getAssessmentTypes();
      res.status(200).json({ data: types });
    } catch (err) {
      next(err);
    }
  };
}
