export interface AuthUser {
  id: number;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  staffId?: number;
  staffName?: string;
  staffType?: string;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    totalItems?: number;
    totalPages?: number;
  };
}

export interface ApiErrorDetail {
  field?: string;
  rule?: string;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: ApiErrorDetail[];
  };
}

export interface TeachingAssignment {
  id: number;
  staff_id: number;
  subject_id: number;
  section_id: number;
  academic_year_id: number;
  subject_name: string;
  subject_code: string;
  section_name: string;
  grade_level: number;
  grade_name: string;
  stream: string;
  academic_year_name: string;
  student_count?: number;
}
