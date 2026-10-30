export interface StudentProfile {
  id: number;
  user_id: number;
  admission_no: string;
  first_name: string;
  father_name: string;
  grandfather_name?: string | null;
  name_am?: string | null;
  gender: 'female' | 'male';
  date_of_birth: string;
  nationality?: string | null;
  phone?: string | null;
  email?: string | null;
  region?: string | null;
  city?: string | null;
  address?: string | null;
  previous_school?: string | null;
  admission_date: string;
  status: 'applicant' | 'active' | 'transferred' | 'withdrawn' | 'graduated';
  photo_document_id?: number | null;
}

export interface StudentEnrollment {
  id: number;
  student_id: number;
  section_id: number;
  academic_year_id: number;
  status: 'active' | 'completed' | 'transferred' | 'withdrawn' | 'promoted' | 'repeated';
  roll_no?: number | null;
  enrolled_on: string;
  section_name: string;
  stream: string;
  grade_id: number;
  grade_level: number;
  grade_name: string;
  academic_year_name: string;
}

export interface StudentContext {
  student: StudentProfile;
  enrollment: StudentEnrollment;
}

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number;
  thresholdWarning: boolean;
}

export interface LetterGradeBand {
  minScore: number;
  maxScore: number;
  letter: string;
  gradePoint: number;
  description: string;
}

export interface StudentPreference {
  notifications: {
    results: boolean;
    assignments: boolean;
    timetable: boolean;
    announcements: boolean;
    attendance: boolean;
    fees: boolean;
  };
  language: 'en';
  display: {
    highContrast: boolean;
    fontSize: 'normal' | 'compact' | 'large';
  };
}

export interface ActiveSessionItem {
  id: number;
  tokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  issuedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
}
