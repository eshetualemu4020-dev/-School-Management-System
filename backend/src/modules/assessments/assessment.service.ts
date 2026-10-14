import { AssessmentRepository, MarkEntryInput } from './assessment.repository';
import { TeacherRepository } from '../teacher/teacher.repository';
import { AppError } from '../../middleware/errorHandler';

export class AssessmentService {
  private repo = new AssessmentRepository();
  private teacherRepo = new TeacherRepository();

  async getAssessments(
    staffId: number,
    filters?: {
      sectionId?: number;
      subjectId?: number;
      termId?: number;
      academicYearId?: number;
    } | number
  ) {
    if (typeof filters === 'number') {
      return this.repo.getAssessmentsForTeacher(staffId, { sectionId: filters });
    }
    return this.repo.getAssessmentsForTeacher(staffId, filters);
  }

  async getAssessmentDetails(staffId: number, assessmentId: number, isAdmin = false) {
    const assessment = await this.repo.getAssessmentById(assessmentId);
    if (!assessment) {
      throw new AppError('Assessment not found.', 404, 'ASSESSMENT_NOT_FOUND');
    }

    if (!isAdmin && assessment.staff_id !== staffId) {
      throw new AppError(
        'Unauthorized: You are not the assigned teacher for this assessment.',
        403,
        'FORBIDDEN_ASSESSMENT_ACCESS'
      );
    }

    const marks = await this.repo.getAssessmentMarks(assessmentId, assessment.section_id);
    return {
      assessment,
      marks
    };
  }

  async createAssessment(
    staffId: number,
    userId: number,
    teachingAssignmentId: number,
    termId: number,
    assessmentTypeId: number,
    title: string,
    maxScore: number,
    weight: number,
    assessmentDate: string
  ) {
    // 1. Verify the teacher owns this teaching assignment
    const assignedClasses = await this.teacherRepo.getAssignedClasses(staffId);
    const validAssignment = assignedClasses.find((c: any) => c.teaching_assignment_id === teachingAssignmentId);
    if (!validAssignment) {
      throw new AppError(
        'Unauthorized: Teaching assignment does not belong to your account.',
        403,
        'INVALID_ASSIGNMENT'
      );
    }

    if (maxScore <= 0) {
      throw new AppError('Maximum score must be greater than zero.', 400, 'INVALID_MAX_SCORE');
    }

    if (weight < 0 || weight > 100) {
      throw new AppError('Weight must be between 0 and 100%.', 400, 'INVALID_WEIGHT');
    }

    const id = await this.repo.createAssessment(
      teachingAssignmentId,
      termId,
      assessmentTypeId,
      title,
      maxScore,
      weight,
      assessmentDate,
      userId
    );

    return this.repo.getAssessmentById(id);
  }

  async saveMarks(
    staffId: number,
    userId: number,
    username: string,
    assessmentId: number,
    status: 'draft' | 'submitted',
    marks: MarkEntryInput[],
    isAdmin = false
  ) {
    const assessment = await this.repo.getAssessmentById(assessmentId);
    if (!assessment) {
      throw new AppError('Assessment not found.', 404, 'ASSESSMENT_NOT_FOUND');
    }

    if (!isAdmin && assessment.staff_id !== staffId) {
      throw new AppError(
        'Unauthorized: You are not the assigned teacher for this assessment.',
        403,
        'FORBIDDEN_ASSESSMENT_ACCESS'
      );
    }

    const maxScore = Number(assessment.max_score);

    // Validate each mark
    for (const m of marks) {
      const score = Number(m.score);
      if (isNaN(score)) {
        throw new AppError(
          `Invalid score value '${m.score}'. Must be a valid number.`,
          422,
          'INVALID_SCORE_FORMAT'
        );
      }

      if (score < 0) {
        throw new AppError(
          `Score cannot be negative for student enrollment ${m.enrollmentId}.`,
          422,
          'NEGATIVE_SCORE'
        );
      }

      if (score > maxScore) {
        throw new AppError(
          `Score ${score} exceeds maximum permitted score limit of ${maxScore}.`,
          422,
          'MARK_OUT_OF_RANGE',
          [{ field: `score_${m.enrollmentId}`, message: `Score ${score} > ${maxScore}` }]
        );
      }
    }

    await this.repo.saveMarksTransaction(assessmentId, userId, username, status, marks);

    return this.repo.getAssessmentMarks(assessmentId, assessment.section_id);
  }

  async getAssessmentTypes() {
    return this.repo.getAssessmentTypes();
  }
}
