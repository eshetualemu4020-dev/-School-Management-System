import { Request, Response, NextFunction } from 'express';
import { pool } from '../../config/database';
import { RowDataPacket } from 'mysql2/promise';
import { AppError } from '../../middleware/errorHandler';
import { StudentProfile, StudentEnrollment } from './student.types';

declare global {
  namespace Express {
    interface Request {
      student?: StudentProfile;
      enrollment?: StudentEnrollment;
    }
  }
}

export const resolveStudentContext = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError('Authentication required.', 401, 'UNAUTHENTICATED');
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         s.id as student_id,
         s.user_id,
         s.admission_no,
         s.first_name,
         s.father_name,
         s.grandfather_name,
         s.name_am,
         s.gender,
         s.date_of_birth,
         s.nationality,
         s.phone,
         s.email,
         s.region,
         s.city,
         s.address,
         s.previous_school,
         s.admission_date,
         s.status as student_status,
         s.photo_document_id,
         e.id as enrollment_id,
         e.roll_no,
         e.status as enrollment_status,
         e.enrolled_on,
         sec.id as section_id,
         sec.name as section_name,
         sec.stream,
         g.id as grade_id,
         g.grade_level,
         g.display_name as grade_name,
         ay.id as academic_year_id,
         ay.name as academic_year_name
       FROM students s
       LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
       LEFT JOIN sections sec ON e.section_id = sec.id
       LEFT JOIN grades g ON sec.grade_id = g.id
       LEFT JOIN academic_years ay ON sec.academic_year_id = ay.id
       WHERE s.user_id = ?
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      throw new AppError('Student profile record not found for this user account.', 404, 'STUDENT_NOT_FOUND');
    }

    const row = rows[0];

    req.student = {
      id: row.student_id,
      user_id: row.user_id,
      admission_no: row.admission_no,
      first_name: row.first_name,
      father_name: row.father_name,
      grandfather_name: row.grandfather_name,
      name_am: row.name_am,
      gender: row.gender,
      date_of_birth: row.date_of_birth,
      nationality: row.nationality,
      phone: row.phone,
      email: row.email,
      region: row.region,
      city: row.city,
      address: row.address,
      previous_school: row.previous_school,
      admission_date: row.admission_date,
      status: row.student_status,
      photo_document_id: row.photo_document_id
    };

    if (row.enrollment_id) {
      req.enrollment = {
        id: row.enrollment_id,
        student_id: row.student_id,
        section_id: row.section_id,
        academic_year_id: row.academic_year_id,
        status: row.enrollment_status,
        roll_no: row.roll_no,
        enrolled_on: row.enrolled_on,
        section_name: row.section_name,
        stream: row.stream,
        grade_id: row.grade_id,
        grade_level: row.grade_level,
        grade_name: row.grade_name,
        academic_year_name: row.academic_year_name
      };
    }

    next();
  } catch (err) {
    next(err);
  }
};
