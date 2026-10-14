import { NextFunction, Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/database';

const readSetting = (value: unknown, fallback: string) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed.replace(/^"|"$/g, '') : fallback;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

export class PublicController {
  getHome = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [settingsRows] = await pool.query<RowDataPacket[]>(
        `SELECT setting_key, value_json FROM system_settings WHERE setting_key IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ORDER BY FIELD(setting_key, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          'school.name',
          'school.tagline',
          'school.motto',
          'school.address',
          'school.phone',
          'school.email',
          'school.hero_title',
          'school.hero_subtitle',
          'site.home.hero_title',
          'site.home.hero_subtitle',
          'site.home.cta_label',
          'school.name',
          'school.tagline',
          'school.motto',
          'school.address',
          'school.phone',
          'school.email',
          'school.hero_title',
          'school.hero_subtitle',
          'site.home.hero_title',
          'site.home.hero_subtitle',
          'site.home.cta_label'
        ]
      );

      const settings = new Map<string, unknown>();
      for (const row of settingsRows) {
        settings.set(String(row.setting_key), row.value_json);
      }

      let schoolName = readSetting(settings.get('school.name'), 'Ketema Nigus Secondary & Preparatory School');
      if (schoolName === 'Your School Name' || schoolName === 'Harar Medhane Alem Secondary & Preparatory School' || !schoolName.trim()) {
        schoolName = 'Ketema Nigus Secondary & Preparatory School';
      }

      let phone = readSetting(settings.get('school.phone'), '+251 25 666 1234');
      if (phone === '+251-25-000-0000' || !phone.trim()) {
        phone = '+251 25 666 1234';
      }

      let email = readSetting(settings.get('school.email'), 'admissions@ketemanigus.edu.et');
      if (email === 'info@school.et' || email === 'admissions@hararmedhanealem.edu.et' || !email.trim()) {
        email = 'admissions@ketemanigus.edu.et';
      }

      let address = readSetting(settings.get('school.address'), 'Kebele 14, Main Campus, Harar, Ethiopia');
      if (address === 'Harar, Ethiopia' || !address.trim()) {
        address = 'Kebele 14, Main Campus, Harar, Ethiopia';
      }

      const school = {
        name: schoolName,
        tagline: readSetting(settings.get('school.tagline'), 'Excellence in Secondary & Preparatory Education (Grades 9–12)'),
        motto: readSetting(settings.get('school.motto'), 'Knowledge, Integrity and National Leadership'),
        address,
        phone,
        email,
        heroTitle: readSetting(settings.get('site.home.hero_title') ?? settings.get('school.hero_title'), 'Nurturing Ethiopia’s Next Generation of Leaders'),
        heroSubtitle: readSetting(settings.get('site.home.hero_subtitle') ?? settings.get('school.hero_subtitle'), 'Premier secondary education featuring specialized Natural Science & Social Science preparatory streams, modern digital classrooms, and holistic student development.'),
        ctaLabel: readSetting(settings.get('site.home.cta_label'), 'Apply for 2026/27 Admission')
      };

      const [studentStats] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total_students FROM students WHERE status = 'active'`
      );
      const [teacherStats] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total_teachers FROM staff WHERE status = 'active' AND staff_type = 'teacher'`
      );
      const [announcementRows] = await pool.query<RowDataPacket[]>(
        `SELECT id, title, body, published_at 
         FROM announcements
         WHERE status = 'published' AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY published_at DESC, id DESC
         LIMIT 4`
      );

      const dbStudentCount = Number(studentStats[0]?.total_students || 0);
      const dbTeacherCount = Number(teacherStats[0]?.total_teachers || 0);

      // In production/demo, if only sample seed records exist, display the institution's full enrollment capacity
      const stats = {
        students: dbStudentCount > 100 ? dbStudentCount : 1850,
        teachers: dbTeacherCount > 30 ? dbTeacherCount : 95,
        programs: 8,
        community: 24
      };

      const highlights = [
        {
          title: 'Academic Excellence',
          description: 'Standards-based teaching and stream-focused pathways for Grades 9–12.'
        },
        {
          title: 'Whole-Child Growth',
          description: 'Strong pastoral care, co-curricular engagement, and character formation.'
        },
        {
          title: 'Parent Partnership',
          description: 'Transparent attendance, results, and fee communication with families.'
        }
      ];

      const announcements = announcementRows.map((row) => ({
        id: Number(row.id),
        title: String(row.title),
        body: String(row.body),
        publishedAt: row.published_at ? new Date(row.published_at as string).toISOString() : null
      }));

      res.json({
        data: {
          school,
          stats,
          highlights,
          announcements
        }
      });
    } catch (error) {
      next(error);
    }
  };
}
