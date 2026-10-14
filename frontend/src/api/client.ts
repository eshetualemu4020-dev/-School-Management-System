const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '');

class ApiClient {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include'
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg = data?.error?.message || response.statusText || 'Request failed';
        const error = new Error(errorMsg) as any;
        error.code = data?.error?.code || 'API_ERROR';
        error.status = response.status;
        error.details = data?.error?.details;
        throw error;
      }

      return data.data;
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message?.toLowerCase().includes('fetch')) {
        throw new Error('Cannot connect to backend server at http://localhost:5000. Please start the backend server (run "npm run dev").');
      }
      throw err;
    }
  }

  // Auth
  async register(data: {
    role: 'student' | 'guardian' | 'teacher' | 'registrar' | 'librarian' | 'administrator';
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    password: string;
    idNumber?: string;
  }) {
    return this.request<{ user: { id: number; username: string; email: string; role: string } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async login(username: string, password: string, rememberMe: boolean) {
    return this.request<{
      user: {
        id: number;
        username: string;
        email: string;
        roles: string[];
        permissions: string[];
        staff?: {
          id: number;
          employeeNo: string;
          fullName: string;
          staffType: string;
          department: string;
          jobTitle: string;
        };
      };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, rememberMe })
    });
  }

  async registerPublic(data: {
    firstName?: string;
    lastName?: string;
    username?: string;
    email: string;
    phone?: string;
    password: string;
    role?: string;
    idNumber?: string;
  }) {
    const fn = data.firstName || data.username?.split('.')[0] || 'User';
    const ln = data.lastName || data.username?.split('.')[1] || 'Account';
    return this.request<{
      pendingApproval: boolean;
      user: any;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        firstName: fn,
        lastName: ln,
        role: data.role || 'student'
      })
    });
  }

  async getMe() {
    return this.request<any>('/auth/me');
  }

  async logout() {
    return this.request<{ message: string }>('/auth/logout', { method: 'POST' });
  }

  async getPublicHome() {
    return this.request<{
      school: {
        name: string;
        tagline: string;
        motto: string;
        address: string;
        phone: string;
        email: string;
        heroTitle: string;
        heroSubtitle: string;
        ctaLabel: string;
      };
      stats: {
        students: number;
        teachers: number;
        programs: number;
        community: number;
      };
      highlights: Array<{ title: string; description: string }>;
      announcements: Array<{
        id: number;
        title: string;
        body: string;
        publishedAt: string | null;
      }>;
    }>('/public/home');
  }

  async requestPasswordReset(email: string) {
    return this.request<{
      deliveryConfigured: boolean;
      message: string;
    }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  async resetPassword(token: string, password: string) {
    return this.request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password })
    });
  }

  // Teacher Module
  async getDashboard() {
    return this.request<{
      overview: {
        assignedSections: number;
        assignedClasses: number;
        todayAttendanceRecorded: number;
        totalAssessments: number;
        draftAssessments: number;
      };
      assignedClasses: any[];
      timetable: any[];
      announcements: any[];
      teacher: {
        staffId: number;
        fullName: string;
        username: string;
      };
    }>('/teacher/dashboard');
  }

  async getAssignedClasses() {
    return this.request<any[]>('/teacher/classes');
  }

  async getSectionStudents(sectionId: number) {
    return this.request<any[]>(`/teacher/classes/${sectionId}/students`);
  }

  async getTimetable() {
    return this.request<any[]>('/teacher/timetable');
  }

  async getAnnouncements() {
    return this.request<any[]>('/teacher/announcements');
  }

  // Attendance
  async getAttendanceSession(sectionId: number, date: string, subjectId?: number) {
    let url = `/attendance/session?sectionId=${sectionId}&date=${date}`;
    if (subjectId) url += `&subjectId=${subjectId}`;
    return this.request<{
      session: any;
      records: any[];
    } | null>(url);
  }

  async getAttendanceHistory(sectionId: number) {
    return this.request<any[]>(`/attendance/history/${sectionId}`);
  }

  async recordAttendance(payload: {
    sectionId: number;
    attendanceDate: string;
    subjectId: number | null;
    status: 'submitted' | 'locked';
    records: Array<{
      enrollmentId: number;
      statusCode: 'present' | 'absent' | 'late' | 'excused';
      note?: string;
    }>;
  }) {
    return this.request<{ session: any; records: any[] }>('/attendance/record', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Subjects, Years & Terms
  async getTeacherSubjects() {
    return this.request<any[]>('/teacher/subjects');
  }

  async getAcademicYears() {
    return this.request<any[]>('/teacher/academic-years');
  }

  async getTerms(academicYearId?: number) {
    const url = academicYearId ? `/teacher/terms?academicYearId=${academicYearId}` : '/teacher/terms';
    return this.request<any[]>(url);
  }

  // Assessments & Marks
  async getAssessmentTypes() {
    return this.request<any[]>('/assessments/types');
  }

  async getAssessments(filters?: {
    sectionId?: number;
    subjectId?: number;
    termId?: number;
    academicYearId?: number;
  } | number) {
    let url = '/assessments';
    if (typeof filters === 'number') {
      url += `?sectionId=${filters}`;
    } else if (filters) {
      const q = new URLSearchParams();
      if (filters.sectionId) q.append('sectionId', String(filters.sectionId));
      if (filters.subjectId) q.append('subjectId', String(filters.subjectId));
      if (filters.termId) q.append('termId', String(filters.termId));
      if (filters.academicYearId) q.append('academicYearId', String(filters.academicYearId));
      const str = q.toString();
      if (str) url += `?${str}`;
    }
    return this.request<any[]>(url);
  }

  async getAssessmentDetails(assessmentId: number) {
    return this.request<{
      assessment: any;
      marks: any[];
    }>(`/assessments/${assessmentId}`);
  }

  async createAssessment(payload: {
    teachingAssignmentId: number;
    termId: number;
    assessmentTypeId: number;
    title: string;
    maxScore: number;
    weight: number;
    assessmentDate: string;
  }) {
    return this.request<any>('/assessments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async saveMarks(
    assessmentId: number,
    status: 'draft' | 'submitted',
    marks: Array<{
      enrollmentId: number;
      score: number;
      feedback?: string;
      markStatus?: 'scored' | 'absent' | 'excused' | 'exempt';
    }>
  ) {
    return this.request<any[]>(`/assessments/${assessmentId}/marks`, {
      method: 'PUT',
      body: JSON.stringify({ status, marks })
    });
  }

  // Teacher Reports
  async getAttendanceReport(params: {
    sectionId: number;
    subjectId?: number;
    termId?: number;
    academicYearId?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const q = new URLSearchParams();
    q.append('sectionId', String(params.sectionId));
    if (params.subjectId) q.append('subjectId', String(params.subjectId));
    if (params.termId) q.append('termId', String(params.termId));
    if (params.academicYearId) q.append('academicYearId', String(params.academicYearId));
    if (params.startDate) q.append('startDate', params.startDate);
    if (params.endDate) q.append('endDate', params.endDate);
    return this.request<any>(`/teacher/reports/attendance?${q.toString()}`);
  }

  async getMarksReport(params: {
    sectionId: number;
    subjectId?: number;
    termId?: number;
    assessmentId?: number;
    academicYearId?: number;
  }) {
    const q = new URLSearchParams();
    q.append('sectionId', String(params.sectionId));
    if (params.subjectId) q.append('subjectId', String(params.subjectId));
    if (params.termId) q.append('termId', String(params.termId));
    if (params.assessmentId) q.append('assessmentId', String(params.assessmentId));
    if (params.academicYearId) q.append('academicYearId', String(params.academicYearId));
    return this.request<any>(`/teacher/reports/marks?${q.toString()}`);
  }

  async getClassPerformanceReport(params: {
    sectionId: number;
    subjectId?: number;
    termId?: number;
    assessmentId?: number;
  }) {
    const q = new URLSearchParams();
    q.append('sectionId', String(params.sectionId));
    if (params.subjectId) q.append('subjectId', String(params.subjectId));
    if (params.termId) q.append('termId', String(params.termId));
    if (params.assessmentId) q.append('assessmentId', String(params.assessmentId));
    return this.request<any>(`/teacher/reports/class-performance?${q.toString()}`);
  }

  async getStudentPerformanceReport(params: {
    sectionId: number;
    studentId?: number;
    subjectId?: number;
    termId?: number;
  }) {
    const q = new URLSearchParams();
    q.append('sectionId', String(params.sectionId));
    if (params.studentId) q.append('studentId', String(params.studentId));
    if (params.subjectId) q.append('subjectId', String(params.subjectId));
    if (params.termId) q.append('termId', String(params.termId));
    return this.request<any>(`/teacher/reports/student-performance?${q.toString()}`);
  }

  async getAssessmentSummaryReport(params: {
    subjectId?: number;
    sectionId?: number;
    termId?: number;
    academicYearId?: number;
  }) {
    const q = new URLSearchParams();
    if (params.subjectId) q.append('subjectId', String(params.subjectId));
    if (params.sectionId) q.append('sectionId', String(params.sectionId));
    if (params.termId) q.append('termId', String(params.termId));
    if (params.academicYearId) q.append('academicYearId', String(params.academicYearId));
    return this.request<any>(`/teacher/reports/assessment-summary?${q.toString()}`);
  }

  // Administrator Module - Page 1: Dashboard Overview
  async getAdminDashboard() {
    return this.request<any>('/admin/dashboard');
  }

  // Administrator Module - Page 2: Student Management
  async getAdminStudentOptions() {
    return this.request<{ statuses: string[]; genders: string[]; streams: string[]; guardianRelationships: string[] }>('/admin/students/options');
  }

  async getAdminStudents(filters?: {
    search?: string;
    gradeId?: number;
    sectionId?: number;
    status?: string;
    stream?: string;
    gender?: string;
    limit?: number;
    offset?: number;
    incompleteOnly?: boolean;
  }) {
    const q = new URLSearchParams();
    if (filters?.search) q.append('search', filters.search);
    if (filters?.gradeId) q.append('gradeId', String(filters.gradeId));
    if (filters?.sectionId) q.append('sectionId', String(filters.sectionId));
    if (filters?.status) q.append('status', filters.status);
    if (filters?.stream) q.append('stream', filters.stream);
    if (filters?.gender) q.append('gender', filters.gender);
    if (filters?.limit) q.append('limit', String(filters.limit));
    if (filters?.offset !== undefined) q.append('offset', String(filters.offset));
    if (filters?.incompleteOnly) q.append('incompleteOnly', 'true');
    const str = q.toString();
    return this.request<{ items: any[]; total: number }>(str ? `/admin/students?${str}` : '/admin/students');
  }

  async getAdminStudentDetails(id: number) {
    return this.request<any>(`/admin/students/${id}`);
  }

  async registerAdminStudent(data: {
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    dateOfBirth: string;
    phone?: string;
    address?: string;
    sectionId: number;
    guardianName?: string;
    guardianPhone?: string;
    guardianRelation?: string;
    photo?: { originalName: string; mimeType: string; dataBase64: string };
  }) {
    return this.request<any>('/admin/students', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateAdminStudent(id: number, data: any) {
    return this.request<any>(`/admin/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async setAdminStudentStatus(id: number, data: { status: string; reason: string; destinationSchool?: string; effectiveDate: string; sectionId?: number }) {
    return this.request<any>(`/admin/students/${id}/status`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async reassignAdminStudentSection(studentId: number, sectionId: number) {
    return this.request<any>(`/admin/students/${studentId}/reassign-section`, {
      method: 'POST',
      body: JSON.stringify({ sectionId })
    });
  }

  async getAdminTransfers() {
    return this.request<any[]>('/admin/students/transfers');
  }

  // Administrator Module - Page 3: Staff and User Management
  async getAdminStaff(search?: string, staffType?: string, status?: string) {
    const q = new URLSearchParams();
    if (search) q.append('search', search);
    if (staffType) q.append('staffType', staffType);
    if (status) q.append('status', status);
    const str = q.toString();
    return this.request<any[]>(str ? `/admin/staff?${str}` : '/admin/staff');
  }

  async createAdminStaff(data: any) {
    return this.request<any>('/admin/staff', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateAdminStaff(id: number, data: any) {
    return this.request<any>(`/admin/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async getAdminUsers(search?: string, role?: string) {
    const q = new URLSearchParams();
    if (search) q.append('search', search);
    if (role) q.append('role', role);
    const str = q.toString();
    return this.request<any[]>(str ? `/admin/users?${str}` : '/admin/users');
  }

  async createAdminUser(data: { username: string; email: string; phone?: string; password: string; roleCode: string }) {
    return this.request<any>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateAdminUserStatus(userId: number, status: string) {
    return this.request<any>(`/admin/users/${userId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  }

  async resetAdminUserPassword(userId: number, password: string) {
    return this.request<any>(`/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }

  async updateAdminUserRoles(userId: number, roleCodes: string[]) {
    return this.request<any>(`/admin/users/${userId}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roleCodes })
    });
  }

  async getAdminRoles() {
    return this.request<any[]>('/admin/roles');
  }

  // Administrator Module - Page 4: Academic Structure and Configuration
  async getAdminClasses() {
    return this.request<any[]>('/admin/classes');
  }

  async getAdminAcademicStructure() {
    return this.request<any>('/admin/academic-structure');
  }

  async createAdminAcademicYear(data: { name: string; labelEc?: string; startDate: string; endDate: string }) {
    return this.request<any>('/admin/academic-years', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async activateAdminAcademicYear(id: number) {
    return this.request<any>(`/admin/academic-years/${id}/activate`, {
      method: 'POST'
    });
  }

  async createAdminTerm(data: { academicYearId: number; termNo: number; name: string; startDate: string; endDate: string }) {
    return this.request<any>('/admin/terms', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async activateAdminTerm(id: number) {
    return this.request<any>(`/admin/terms/${id}/activate`, {
      method: 'POST'
    });
  }

  async createAdminSection(data: any) {
    return this.request<any>('/admin/sections', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateAdminSection(id: number, data: any) {
    return this.request<any>(`/admin/sections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async createAdminSubject(data: { code: string; name: string; nameAm?: string }) {
    return this.request<any>('/admin/subjects', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateAdminSubject(id: number, data: any) {
    return this.request<any>(`/admin/subjects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async addAdminGradeSubject(data: { gradeId: number; subjectId: number; stream: string; isCompulsory?: boolean; periodsPerWeek?: number }) {
    return this.request<any>('/admin/grade-subjects', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async removeAdminGradeSubject(id: number) {
    return this.request<any>(`/admin/grade-subjects/${id}`, {
      method: 'DELETE'
    });
  }

  async getAdminSettings() {
    return this.request<any[]>('/admin/settings');
  }

  async updateAdminSetting(key: string, value: any) {
    return this.request<any>('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ key, value })
    });
  }

  // Administrator Module - Page 5: Teaching Assignments and Timetable
  async getAdminAssignments(academicYearId?: number, sectionId?: number, subjectId?: number) {
    const q = new URLSearchParams();
    if (academicYearId) q.append('academicYearId', String(academicYearId));
    if (sectionId) q.append('sectionId', String(sectionId));
    if (subjectId) q.append('subjectId', String(subjectId));
    const str = q.toString();
    return this.request<any>(str ? `/admin/assignments?${str}` : '/admin/assignments');
  }

  async createAdminAssignment(data: { staffId: number; subjectId: number; sectionId: number; academicYearId: number }) {
    return this.request<any>('/admin/assignments', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteAdminAssignment(id: number) {
    return this.request<any>(`/admin/assignments/${id}`, {
      method: 'DELETE'
    });
  }

  async getAdminTimetable(termId?: number, sectionId?: number, staffId?: number, roomId?: number) {
    const q = new URLSearchParams();
    if (termId) q.append('termId', String(termId));
    if (sectionId) q.append('sectionId', String(sectionId));
    if (staffId) q.append('staffId', String(staffId));
    if (roomId) q.append('roomId', String(roomId));
    const str = q.toString();
    return this.request<any[]>(str ? `/admin/timetable?${str}` : '/admin/timetable');
  }

  async createAdminTimetableEntry(data: {
    termId: number;
    sectionId: number;
    subjectId: number;
    staffId: number;
    roomId: number;
    timeSlotId: number;
  }) {
    return this.request<any>('/admin/timetable', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteAdminTimetableEntry(id: number) {
    return this.request<any>(`/admin/timetable/${id}`, {
      method: 'DELETE'
    });
  }

  async getAdminTimeSlots() {
    return this.request<any[]>('/admin/time-slots');
  }

  async createAdminTimeSlot(data: { dayOfWeek: number; startTime: string; endTime: string; label: string }) {
    return this.request<any>('/admin/time-slots', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Administrator Module - Page 6: Attendance and Academic Results
  async getAdminAttendanceSummary(date?: string, sectionId?: number, gradeId?: number) {
    const q = new URLSearchParams();
    if (date) q.append('date', date);
    if (sectionId) q.append('sectionId', String(sectionId));
    if (gradeId) q.append('gradeId', String(gradeId));
    const str = q.toString();
    return this.request<any>(str ? `/admin/attendance-summary?${str}` : '/admin/attendance-summary');
  }

  async getAdminAssessmentsOverview(academicYearId?: number, termId?: number, sectionId?: number, subjectId?: number) {
    const q = new URLSearchParams();
    if (academicYearId) q.append('academicYearId', String(academicYearId));
    if (termId) q.append('termId', String(termId));
    if (sectionId) q.append('sectionId', String(sectionId));
    if (subjectId) q.append('subjectId', String(subjectId));
    const str = q.toString();
    return this.request<any[]>(str ? `/admin/assessments-overview?${str}` : '/admin/assessments-overview');
  }

  async approveAdminMarks(assessmentId: number) {
    return this.request<any>(`/admin/assessments/${assessmentId}/approve`, {
      method: 'POST'
    });
  }

  async getAdminGradingScales() {
    return this.request<any[]>('/admin/grading-scales');
  }

  // Administrator Module - Page 7: Reports, Analytics, and Library Overview
  async getAdminEnrollmentReport(academicYearId?: number) {
    const url = academicYearId ? `/admin/reports/enrollment?academicYearId=${academicYearId}` : '/admin/reports/enrollment';
    return this.request<any>(url);
  }

  async getAdminAttendanceReport(startDate?: string, endDate?: string, sectionId?: number) {
    const q = new URLSearchParams();
    if (startDate) q.append('startDate', startDate);
    if (endDate) q.append('endDate', endDate);
    if (sectionId) q.append('sectionId', String(sectionId));
    const str = q.toString();
    return this.request<any[]>(str ? `/admin/reports/attendance?${str}` : '/admin/reports/attendance');
  }

  async getAdminPerformanceReport(termId?: number, sectionId?: number) {
    const q = new URLSearchParams();
    if (termId) q.append('termId', String(termId));
    if (sectionId) q.append('sectionId', String(sectionId));
    const str = q.toString();
    return this.request<any[]>(str ? `/admin/reports/academic?${str}` : '/admin/reports/academic');
  }

  async getAdminStaffWorkloadReport() {
    return this.request<any[]>('/admin/reports/staff-workload');
  }

  async getAdminLibraryOverview() {
    return this.request<any>('/admin/library-overview');
  }

  // Administrator Module - Page 8: Communications, Audit Logs, and Profile
  async getAdminAnnouncements(limit = 20) {
    return this.request<any[]>(`/admin/announcements?limit=${limit}`);
  }

  async createAdminAnnouncement(data: {
    title: string;
    content?: string;
    body?: string;
    targetRole?: string;
    priority?: string;
    status?: string;
  }) {
    return this.request<any>('/admin/announcements', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async setAdminAnnouncementStatus(id: number, status: string) {
    return this.request<any>(`/admin/announcements/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  }

  async deleteAdminAnnouncement(id: number) {
    return this.request<any>(`/admin/announcements/${id}`, {
      method: 'DELETE'
    });
  }

  async getAdminAuditLogs(filters?: { actor?: string; action?: string; outcome?: string; limit?: number }) {
    const q = new URLSearchParams();
    if (filters?.actor) q.append('actor', filters.actor);
    if (filters?.action) q.append('action', filters.action);
    if (filters?.outcome) q.append('outcome', filters.outcome);
    if (filters?.limit) q.append('limit', String(filters.limit));
    const str = q.toString();
    return this.request<any[]>(str ? `/admin/audit-logs?${str}` : '/admin/audit-logs');
  }

  async getAdminProfile() {
    return this.request<any>('/admin/profile');
  }

  async updateAdminProfile(data: { phone?: string; email?: string }) {
    return this.request<any>('/admin/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async changeAdminPassword(currentPassword: string, newPassword: string) {
    return this.request<any>('/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  // Student Module
  async getStudentDashboard() {
    return this.request<any>('/student/dashboard');
  }

  async getStudentProfile() {
    return this.request<any>('/student/profile');
  }

  // Librarian Module
  async getLibrarianDashboard() {
    return this.request<any>('/librarian/dashboard');
  }

  async getLibrarianBooks(search?: string, categoryId?: number) {
    const q = new URLSearchParams();
    if (search) q.append('search', search);
    if (categoryId) q.append('categoryId', String(categoryId));
    return this.request<any[]>(`/librarian/books?${q.toString()}`);
  }

  async addLibrarianBook(bookData: {
    isbn?: string;
    title: string;
    author: string;
    categoryId: number;
    publisher?: string;
    publicationYear?: number;
    edition?: string;
    totalCopies?: number;
    shelfLocation?: string;
  }) {
    return this.request<any>('/librarian/books', {
      method: 'POST',
      body: JSON.stringify(bookData)
    });
  }

  async getLibrarianLoans(status?: string) {
    const q = new URLSearchParams();
    if (status) q.append('status', status);
    return this.request<any[]>(`/librarian/loans?${q.toString()}`);
  }

  async issueBookLoan(data: { bookCopyId: number; studentId: number; dueDate: string }) {
    return this.request<any>('/librarian/loans/issue', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async returnBookLoan(loanId: number) {
    return this.request<any>(`/librarian/loans/${loanId}/return`, {
      method: 'POST'
    });
  }

  async getLibrarianReservations() {
    return this.request<any[]>('/librarian/reservations');
  }

  // Registrar Module
  async getRegistrarDashboard() {
    return this.request<any>('/registrar/dashboard');
  }

  async getRegistrarStudents(search?: string, sectionId?: number, status?: string) {
    const q = new URLSearchParams();
    if (search) q.append('search', search);
    if (sectionId) q.append('sectionId', String(sectionId));
    if (status) q.append('status', status);
    return this.request<any[]>(`/registrar/students?${q.toString()}`);
  }

  async getRegistrarSections() {
    return this.request<any[]>('/registrar/sections');
  }

  async registerStudent(studentData: {
    firstName: string;
    fatherName: string;
    grandfatherName: string;
    gender: string;
    dateOfBirth: string;
    gradeLevel: number;
    sectionId: number;
    stream?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
  }) {
    return this.request<any>('/registrar/students/register', {
      method: 'POST',
      body: JSON.stringify(studentData)
    });
  }

  async reassignStudentSection(studentId: number, newSectionId: number) {
    return this.request<any>(`/registrar/students/${studentId}/reassign-section`, {
      method: 'POST',
      body: JSON.stringify({ sectionId: newSectionId })
    });
  }

  async getRegistrarTransfers() {
    return this.request<any[]>('/registrar/transfers');
  }

  async recordStudentTransfer(transferData: {
    studentId: number;
    transferType: string;
    reason: string;
    destinationSchool?: string;
    effectiveDate: string;
  }) {
    return this.request<any>('/registrar/transfers', {
      method: 'POST',
      body: JSON.stringify(transferData)
    });
  }

  async getRegistrarDocuments() {
    return this.request<any[]>('/registrar/documents');
  }

  // Parent Module
  async getParentDashboard() {
    return this.request<any>('/parent/dashboard');
  }

  async getParentChildDetails(studentId: number) {
    return this.request<any>(`/parent/children/${studentId}`);
  }
}

export const api = new ApiClient();
