import { Request, Response, NextFunction } from 'express';
import { pool } from '../../config/database';
import { RowDataPacket } from 'mysql2/promise';

export type ChildPermissionFlag =
  | 'can_view_results'
  | 'can_view_attendance'
  | 'can_view_fees'
  | 'can_message_staff';

export interface GuardianRecord {
  id: number;
  userId: number;
  firstName: string;
  fatherName: string;
  phone: string;
  email?: string;
  verificationStatus: 'pending' | 'verified' | 'suspended';
  preferredLanguage: string;
}

export interface ChildContext {
  studentId: number;
  admissionNo: string;
  firstName: string;
  fatherName: string;
  enrollmentId: number;
  sectionId: number;
  sectionName: string;
  gradeId: number;
  gradeLevel: number;
  gradeName: string;
  academicYearId: number;
  academicYearName: string;
  stream?: string;
  relationship: string;
  isPrimary: boolean;
  canViewResults: boolean;
  canViewAttendance: boolean;
  canViewFees: boolean;
  canMessageStaff: boolean;
}

declare global {
  namespace Express {
    interface Request {
      guardian?: GuardianRecord;
      childContext?: ChildContext;
    }
  }
}

/**
 * Ensures the parent portal master switch is enabled in system_settings.
 */
export async function assertPortalEnabled(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT value_json FROM system_settings WHERE setting_key = 'parent_portal.enabled' LIMIT 1`
    );
    const enabled = rows.length === 0 || rows[0].value_json === true || rows[0].value_json === 'true';
    if (!enabled) {
      res.status(503).json({
        error: {
          code: 'PARENT_PORTAL_DISABLED',
          message: 'The Parent Portal is currently disabled by school administration.'
        }
      });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Resolves the authenticated guardian profile from req.user.id.
 */
export async function resolveGuardianProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'User is not authenticated.' }
    });
    return;
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, first_name, father_name, phone, email, verification_status, preferred_language
       FROM guardians
       WHERE user_id = ?
       LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      res.status(404).json({
        error: {
          code: 'GUARDIAN_PROFILE_NOT_FOUND',
          message: 'No guardian profile is linked to this account.'
        }
      });
      return;
    }

    const g = rows[0];
    if (g.verification_status === 'suspended') {
      res.status(403).json({
        error: {
          code: 'GUARDIAN_SUSPENDED',
          message: 'Your guardian portal access is currently suspended. Please contact the registrar.'
        }
      });
      return;
    }

    req.guardian = {
      id: Number(g.id),
      userId: Number(g.user_id),
      firstName: g.first_name,
      fatherName: g.father_name,
      phone: g.phone,
      email: g.email || undefined,
      verificationStatus: g.verification_status,
      preferredLanguage: g.preferred_language || 'en'
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Verifies that the authenticated guardian has authorized, active access to a specific student.
 * If permissionFlag is specified, ensures that the specific flag is enabled (can_view_results, etc.).
 * Returns HTTP 404 on both not-found and unauthorized to prevent ID enumeration.
 */
export function assertChildAccess(permissionFlag?: ChildPermissionFlag) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawStudentId = req.params.studentId || req.params.id || req.query.childId;
    const studentId = Number(rawStudentId);

    if (!studentId || isNaN(studentId) || !req.guardian) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Student record not found.' }
      });
      return;
    }

    if (req.guardian.verificationStatus !== 'verified') {
      res.status(403).json({
        error: {
          code: 'GUARDIAN_NOT_VERIFIED',
          message: 'Your guardian profile verification is pending. Access to student records is not authorized.'
        }
      });
      return;
    }

    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           s.id as student_id,
           s.admission_no,
           s.first_name,
           s.father_name,
           s.status as student_status,
           sg.relationship,
           sg.is_primary,
           sg.can_view_results,
           sg.can_view_attendance,
           sg.can_view_fees,
           sg.can_message_staff,
           sg.status as link_status,
           e.id as enrollment_id,
           sec.id as section_id,
           sec.name as section_name,
           sec.stream,
           g.id as grade_id,
           g.grade_level,
           g.display_name as grade_name,
           ay.id as academic_year_id,
           ay.name as academic_year_name
         FROM student_guardians sg
         JOIN students s ON sg.student_id = s.id
         LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
         LEFT JOIN sections sec ON e.section_id = sec.id
         LEFT JOIN grades g ON sec.grade_id = g.id
         LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
         WHERE sg.guardian_id = ? AND sg.student_id = ? AND s.deleted_at IS NULL AND sg.ended_at IS NULL
         LIMIT 1`,
        [req.guardian.id, studentId]
      );

      if (rows.length === 0) {
        // Return 404 to avoid leaking existence of student IDs
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Student record not found.' }
        });
        return;
      }

      const r = rows[0];

      // Check link status
      if (r.link_status !== 'active') {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Student record not found.' }
        });
        return;
      }

      // Check specific granular permission flag if required
      if (permissionFlag && !Boolean(r[permissionFlag])) {
        res.status(403).json({
          error: { code: 'FORBIDDEN_PERMISSION', message: 'Access to this record has been restricted by school administration.' }
        });
        return;
      }

      req.childContext = {
        studentId: Number(r.student_id),
        admissionNo: r.admission_no,
        firstName: r.first_name,
        fatherName: r.father_name,
        enrollmentId: Number(r.enrollment_id || 0),
        sectionId: Number(r.section_id || 0),
        sectionName: r.section_name || '',
        gradeId: Number(r.grade_id || 0),
        gradeLevel: Number(r.grade_level || 0),
        gradeName: r.grade_name || '',
        academicYearId: Number(r.academic_year_id || 0),
        academicYearName: r.academic_year_name || '',
        stream: r.stream || undefined,
        relationship: r.relationship,
        isPrimary: Boolean(r.is_primary),
        canViewResults: Boolean(r.can_view_results),
        canViewAttendance: Boolean(r.can_view_attendance),
        canViewFees: Boolean(r.can_view_fees),
        canMessageStaff: Boolean(r.can_message_staff)
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
