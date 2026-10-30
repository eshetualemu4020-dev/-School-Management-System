import { pool } from '../../config/database';
import { RowDataPacket } from 'mysql2/promise';
import { LetterGradeBand } from './student.types';

export const DEFAULT_GRADING_BANDS: LetterGradeBand[] = [
  { minScore: 90.0, maxScore: 100.0, letter: 'A', gradePoint: 4.0, description: 'Excellent' },
  { minScore: 80.0, maxScore: 89.99, letter: 'B', gradePoint: 3.0, description: 'Very Good' },
  { minScore: 60.0, maxScore: 79.99, letter: 'C', gradePoint: 2.0, description: 'Satisfactory' },
  { minScore: 50.0, maxScore: 59.99, letter: 'D', gradePoint: 1.0, description: 'Pass' },
  { minScore: 0.0, maxScore: 49.99, letter: 'F', gradePoint: 0.0, description: 'Fail' }
];

export class FormulasService {
  /**
   * ATTENDANCE FORMULA:
   * Late counts as present (student was physically in class).
   * Excused absences do not count against disciplinary standing, but official attendance rate
   * computes: ((present + late) / total) * 100.
   * Threshold for 'needs attention': < 85.0%.
   */
  static calculateAttendanceRate(counts: {
    total: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
  }): { rate: number; thresholdWarning: boolean } {
    const { total, present, late } = counts;
    if (!total || total <= 0) {
      return { rate: 100.0, thresholdWarning: false };
    }
    const attended = present + late;
    const rate = Number(((attended / total) * 100).toFixed(1));
    const thresholdWarning = rate < 85.0;
    return { rate, thresholdWarning };
  }

  /**
   * WEIGHTED TOTAL FORMULA:
   * sum((score / maxScore) * weight) for all published assessments.
   */
  static calculateWeightedTotal(assessments: Array<{ score: number | null; maxScore: number; weight: number }>): number {
    let total = 0;
    for (const item of assessments) {
      if (item.score !== null && item.maxScore > 0) {
        total += (Number(item.score) / Number(item.maxScore)) * Number(item.weight);
      }
    }
    return Number(total.toFixed(2));
  }

  /**
   * LETTER GRADE & GRADE POINTS:
   * Resolved from grading_scale_bands or system defaults.
   */
  static resolveLetterGrade(totalScore: number, bands: LetterGradeBand[] = DEFAULT_GRADING_BANDS): LetterGradeBand {
    const score = Number(totalScore);
    for (const band of bands) {
      if (score >= band.minScore && score <= band.maxScore) {
        return band;
      }
    }
    return score >= 50.0
      ? { minScore: 50, maxScore: 100, letter: 'D', gradePoint: 1.0, description: 'Pass' }
      : { minScore: 0, maxScore: 49.99, letter: 'F', gradePoint: 0.0, description: 'Fail' };
  }

  /**
   * PASS / FAIL DETERMINATION:
   * Configurable pass mark threshold (default 50.00).
   */
  static isPass(totalScore: number, passMark = 50.0): boolean {
    return Number(totalScore) >= passMark;
  }

  /**
   * GPA FORMULA (4.0 Scale, Scope B = yes):
   * sum(gradePoint * creditHours) / sum(creditHours)
   * If credits are unassigned, simple average of grade points.
   */
  static calculateGpa(items: Array<{ gradePoint: number; creditHours?: number }>): number {
    if (!items || items.length === 0) return 0.0;
    let totalPoints = 0;
    let totalCredits = 0;
    for (const item of items) {
      const credits = item.creditHours && item.creditHours > 0 ? item.creditHours : 1;
      totalPoints += item.gradePoint * credits;
      totalCredits += credits;
    }
    return totalCredits > 0 ? Number((totalPoints / totalCredits).toFixed(2)) : 0.0;
  }

  /**
   * RANK WITH COMPETITION TIE RULE (1224 Ranking):
   * Equal scores receive the exact same rank.
   * Subsequent rank skips by the count of tied students.
   */
  static calculateRanks<T extends { average: number }>(students: T[]): Array<T & { rank: number; classSize: number }> {
    const sorted = [...students].sort((a, b) => b.average - a.average);
    const classSize = sorted.length;
    let currentRank = 1;

    return sorted.map((student, index) => {
      if (index > 0 && student.average === sorted[index - 1].average) {
        // Tied with previous student
        return { ...student, rank: currentRank, classSize };
      }
      currentRank = index + 1;
      return { ...student, rank: currentRank, classSize };
    });
  }

  /**
   * "UPCOMING" WINDOW:
   * Next 7 calendar days from server time.
   */
  static isUpcoming(dueDateIso: string, daysWindow = 7): boolean {
    const due = new Date(dueDateIso).getTime();
    const now = Date.now();
    const windowEnd = now + daysWindow * 24 * 60 * 60 * 1000;
    return due >= now && due <= windowEnd;
  }

  /**
   * "NEEDS ATTENTION" THRESHOLD:
   * Below 50.0% academic score or below 85.0% attendance.
   */
  static needsAttention(scoreOrRate: number, threshold = 50.0): boolean {
    return Number(scoreOrRate) < threshold;
  }

  /**
   * Fetch active grading bands from database if configured.
   */
  static async getActiveGradingBands(): Promise<LetterGradeBand[]> {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT min_score, max_score, letter_grade, grade_point, description
         FROM grading_scale_bands
         ORDER BY min_score DESC`
      );
      if (rows && rows.length > 0) {
        return rows.map((r) => ({
          minScore: Number(r.min_score),
          maxScore: Number(r.max_score),
          letter: r.letter_grade,
          gradePoint: Number(r.grade_point),
          description: r.description || ''
        }));
      }
    } catch {
      // Fallback to defaults
    }
    return DEFAULT_GRADING_BANDS;
  }
}
