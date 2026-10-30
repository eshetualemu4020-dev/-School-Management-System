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

  async login(username: string, password: string, rememberMe: boolean, role?: string) {
    return this.request<{
      mfaRequired?: boolean;
      tempToken?: string;
      mustChangePassword?: boolean;
      /** Set when the account's real role differs from the one chosen on the form. */
      roleWarning?: string;
      user: {
        id: number;
        username: string;
        email: string;
        mustChangePassword?: boolean;
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
      body: JSON.stringify({ username, password, rememberMe, role })
    });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ success: boolean; message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  async getNotifications() {
    return this.request<any[]>('/auth/notifications');
  }

  async markNotificationRead(id: number) {
    return this.request<{ success: boolean }>(`/auth/notifications/${id}/read`, { method: 'PATCH' });
  }

  async markAllNotificationsRead() {
    return this.request<{ updatedCount: number }>('/auth/notifications/read-all', { method: 'POST' });
  }

  // ---------------------------------------------------------------------------
  // Two-Factor Authentication (TOTP)
  // ---------------------------------------------------------------------------
  async setup2FA() {
    return this.request<{
      secret: string;
      otpauthUri: string;
      backupCodes: string[];
    }>('/auth/2fa/setup', { method: 'POST' });
  }

  async verify2FA(code: string) {
    return this.request<{ success: boolean; message: string }>('/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  }

  async disable2FA(password: string) {
    return this.request<{ success: boolean; message: string }>('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }

  async authenticate2FA(tempToken: string, code: string, rememberMe?: boolean) {
    return this.request<{
      user: {
        id: number;
        username: string;
        email: string;
        roles: string[];
        permissions: string[];
        staff?: any;
      };
    }>('/auth/2fa/authenticate', {
      method: 'POST',
      body: JSON.stringify({ tempToken, code, rememberMe })
    });
  }

  // ---------------------------------------------------------------------------
  // Security Administration (Sessions, Lockout, Matrix)
  // ---------------------------------------------------------------------------
  async getSecuritySessions(userId?: number) {
    const q = userId ? `?userId=${userId}` : '';
    return this.request<any[]>(`/admin/security/sessions${q}`);
  }

  async revokeSession(sessionId: number) {
    return this.request<{ success: boolean }>(`/admin/security/sessions/${sessionId}/revoke`, { method: 'POST' });
  }

  async revokeUserSessions(userId: number) {
    return this.request<{ success: boolean; revokedCount: number }>(`/admin/security/users/${userId}/revoke-sessions`, { method: 'POST' });
  }

  async getLoginAttempts(params: {
    page?: number;
    limit?: number;
    username?: string;
    success?: boolean;
    startDate?: string;
    endDate?: string;
  } = {}) {
    const query = new URLSearchParams();
    if (params.page) query.append('page', String(params.page));
    if (params.limit) query.append('limit', String(params.limit));
    if (params.username) query.append('username', params.username);
    if (params.success !== undefined) query.append('success', String(params.success));
    if (params.startDate) query.append('startDate', params.startDate);
    if (params.endDate) query.append('endDate', params.endDate);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<{ attempts: any[]; total: number; page: number; limit: number }>(`/admin/security/login-attempts${qs}`);
  }

  async unlockUser(userId: number) {
    return this.request<{ success: boolean }>(`/admin/security/users/${userId}/unlock`, { method: 'POST' });
  }

  async getRolePermissionsMatrix() {
    return this.request<{
      roles: Array<{ id: number; code: string; name: string; description: string }>;
      permissions: Array<{ id: number; code: string; name: string; description: string; module_name: string }>;
      matrix: Record<number, number[]>;
    }>('/admin/security/role-permissions');
  }

  async updateRolePermissions(roleId: number, permissionIds: number[]) {
    return this.request<{ success: boolean }>(`/admin/security/roles/${roleId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissionIds })
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

  // =========================================================================
  // Extended Teacher Portal API Methods (Pages 1 to 15)
  // =========================================================================

  async getTeacherTimetable(sectionId?: number) {
    const q = sectionId ? `?sectionId=${sectionId}` : '';
    return this.request<any[]>(`/teacher/timetable${q}`);
  }

  async getTeacherDashboardExtended() {
    return this.request<any>('/teacher/dashboard/extended');
  }

  async getTeacherAttendanceHistory(sectionId: number, startDate?: string, endDate?: string) {
    let url = `/teacher/attendance/history/${sectionId}`;
    const q = new URLSearchParams();
    if (startDate) q.append('startDate', startDate);
    if (endDate) q.append('endDate', endDate);
    const str = q.toString();
    if (str) url += `?${str}`;
    return this.request<any[]>(url);
  }

  async requestAttendanceCorrection(payload: {
    sessionId: number;
    sectionId: number;
    attendanceDate: string;
    reason: string;
    oldRecords: any[];
    newRecords: any[];
  }) {
    return this.request<{ approvalId: number; status: string }>('/teacher/attendance/correction-request', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getRepeatedAbsences(sectionId: number) {
    return this.request<any[]>(`/teacher/attendance/repeated-absences/${sectionId}`);
  }

  async getStudentAttendanceDetail(sectionId: number, studentId: number) {
    return this.request<any[]>(`/teacher/attendance/student-detail/${sectionId}/${studentId}`);
  }

  async requestMarkCorrection(payload: {
    assessmentId: number;
    reason: string;
    oldMarks: any[];
    newMarks: any[];
  }) {
    return this.request<{ approvalId: number; status: string }>('/teacher/marks/correction-request', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getMarksHistory(assessmentId: number) {
    return this.request<any[]>(`/teacher/marks/history/${assessmentId}`);
  }

  async getMissingMarks(assessmentId: number) {
    return this.request<any[]>(`/teacher/marks/missing/${assessmentId}`);
  }

  async getClassDetail(sectionId: number) {
    return this.request<{ section: any; totalStudents: number; roster: any[] }>(`/teacher/classes/${sectionId}/detail`);
  }

  async getTeacherStudentProfile(studentId: number) {
    return this.request<{ student: any; mySubjectMarks: any[]; attendanceSummary: any[] }>(`/teacher/classes/student-profile/${studentId}`);
  }

  async getHomeroomSection() {
    return this.request<any | null>('/teacher/classes/homeroom');
  }

  async getSubjectsDetailed() {
    return this.request<any[]>('/teacher/subjects/detailed');
  }

  async getTeacherAssignments(filters?: { sectionId?: number; termId?: number }) {
    let url = '/teacher/assignments';
    if (filters) {
      const q = new URLSearchParams();
      if (filters.sectionId) q.append('sectionId', String(filters.sectionId));
      if (filters.termId) q.append('termId', String(filters.termId));
      const str = q.toString();
      if (str) url += `?${str}`;
    }
    return this.request<any[]>(url);
  }

  async createTeacherAssignment(payload: {
    teachingAssignmentId: number;
    termId?: number;
    title: string;
    instructions?: string;
    dueAt: string;
    allowLate?: boolean;
    maxScore?: number;
    status?: 'draft' | 'published';
  }) {
    return this.request<any>('/teacher/assignments', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getAssignmentSubmissions(assignmentId: number) {
    return this.request<{ assignment: any; submissions: any[] }>(`/teacher/assignments/${assignmentId}/submissions`);
  }

  async gradeSubmission(submissionId: number, payload: { score: number; feedback?: string }) {
    return this.request<any>(`/teacher/assignments/submissions/${submissionId}/grade`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async getLearningResources(filters?: { sectionId?: number; subjectId?: number; search?: string }) {
    const q = new URLSearchParams();
    if (filters?.sectionId) q.append('sectionId', String(filters.sectionId));
    if (filters?.subjectId) q.append('subjectId', String(filters.subjectId));
    if (filters?.search) q.append('search', filters.search);
    const qs = q.toString();
    return this.request<any[]>(qs ? `/teacher/lessons/resources?${qs}` : '/teacher/lessons/resources');
  }

  async createLearningResource(payload: {
    teachingAssignmentId: number;
    title: string;
    description?: string;
    url?: string;
    visibility?: 'section' | 'staff_only';
    file?: {
      originalName: string;
      mimeType: string;
      dataBase64: string;
    };
  }) {
    return this.request<any>('/teacher/lessons/resources', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateLearningResource(id: number, payload: {
    title?: string;
    description?: string;
    url?: string;
    visibility?: 'section' | 'staff_only';
    file?: {
      originalName: string;
      mimeType: string;
      dataBase64: string;
    };
  }) {
    return this.request<any>(`/teacher/lessons/resources/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  getLearningResourceDownloadUrl(id: number) {
    return `${BASE_URL}/teacher/lessons/resources/${id}/download`;
  }

  async deleteLearningResource(id: number) {
    return this.request<{ success: boolean }>(`/teacher/lessons/resources/${id}`, {
      method: 'DELETE'
    });
  }

  async getDisciplineRecords(filters?: {
    sectionId?: number;
    severity?: string;
    category?: string;
    search?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.sectionId) params.append('sectionId', String(filters.sectionId));
    if (filters?.severity && filters.severity !== 'all') params.append('severity', filters.severity);
    if (filters?.category && filters.category !== 'all') params.append('category', filters.category);
    if (filters?.search && filters.search.trim()) params.append('search', filters.search.trim());
    const qs = params.toString();
    return this.request<any[]>(`/teacher/welfare/incidents${qs ? `?${qs}` : ''}`);
  }

  async reportDisciplineIncident(payload: {
    studentId: number;
    incidentDate: string;
    category: string;
    severity: 'minor' | 'moderate' | 'serious';
    description: string;
    actionTaken?: string;
  }) {
    return this.request<any>('/teacher/welfare/incidents', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateDisciplineRecord(id: number, payload: {
    incidentDate?: string;
    category?: string;
    severity?: 'minor' | 'moderate' | 'serious';
    description?: string;
    actionTaken?: string;
  }) {
    return this.request<any>(`/teacher/welfare/incidents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async deleteDisciplineRecord(id: number) {
    return this.request<{ success: boolean; id: number }>(`/teacher/welfare/incidents/${id}`, {
      method: 'DELETE'
    });
  }

  async getContactableParents() {
    return this.request<any[]>('/teacher/communication/parents');
  }

  async getTeacherCommunications(filters?: {
    search?: string;
    recipientRole?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.recipientRole && filters.recipientRole !== 'all') {
      params.append('recipientRole', filters.recipientRole);
    }
    if (filters?.search && filters.search.trim()) {
      params.append('search', filters.search.trim());
    }
    const qs = params.toString();
    return this.request<any[]>(`/teacher/communication/messages${qs ? `?${qs}` : ''}`);
  }

  async sendTeacherCommunication(payload: {
    guardianId?: number;
    studentId?: number;
    recipientRole: 'guardian' | 'administration' | 'colleague';
    subject: string;
    message: string;
  }) {
    return this.request<any>('/teacher/communication/messages', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async deleteTeacherCommunication(id: number) {
    return this.request<{ success: boolean; id: number }>(`/teacher/communication/messages/${id}`, {
      method: 'DELETE'
    });
  }

  async getTeacherMeetingRequests(filters?: {
    status?: string;
    search?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') {
      params.append('status', filters.status);
    }
    if (filters?.search && filters.search.trim()) {
      params.append('search', filters.search.trim());
    }
    const qs = params.toString();
    return this.request<any[]>(`/teacher/communication/meetings${qs ? `?${qs}` : ''}`);
  }

  async createTeacherMeetingRequest(payload: {
    guardianId: number;
    studentId: number;
    requestedDate: string;
    requestedTime: string;
    agenda: string;
  }) {
    return this.request<any>('/teacher/communication/meetings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateTeacherMeetingRequest(
    id: number,
    payload: {
      status?: 'pending' | 'confirmed' | 'completed' | 'cancelled';
      meetingNotes?: string;
      requestedDate?: string;
      requestedTime?: string;
      agenda?: string;
    }
  ) {
    return this.request<any>(`/teacher/communication/meetings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async deleteTeacherMeetingRequest(id: number) {
    return this.request<{ success: boolean; id: number }>(`/teacher/communication/meetings/${id}`, {
      method: 'DELETE'
    });
  }

  async getMyTeacherRequests(filters?: {
    status?: string;
    type?: string;
    search?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') {
      params.append('status', filters.status);
    }
    if (filters?.type && filters.type !== 'all') {
      params.append('type', filters.type);
    }
    if (filters?.search && filters.search.trim()) {
      params.append('search', filters.search.trim());
    }
    const qs = params.toString();
    return this.request<any[]>(`/teacher/requests${qs ? `?${qs}` : ''}`);
  }

  async createTeacherRequest(payload: {
    type: 'leave_request' | 'attendance_edit_after_lock' | 'result_unlock' | 'timetable_change';
    entityType?: string;
    entityId?: number;
    reason: string;
    oldValueJson?: any;
    newValueJson: any;
  }) {
    return this.request<any>('/teacher/requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async cancelMyTeacherRequest(id: number) {
    return this.request<any>(`/teacher/requests/${id}/cancel`, {
      method: 'POST'
    });
  }

  async getStaffAttendanceHistory(filters?: { status?: string; startDate?: string; endDate?: string }) {
    const params = new URLSearchParams();
    if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ staff: any; records: any[]; summary: any }>(`/teacher/leave/attendance-history${qs}`);
  }

  async getMyLeaveApplications() {
    return this.request<any[]>('/teacher/leave/applications');
  }

  async applyForTeacherLeave(payload: {
    startDate: string;
    endDate: string;
    leaveType: string;
    reason: string;
    coverTeacher?: string;
    contactPhone?: string;
  }) {
    return this.request<any>('/teacher/leave/apply', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async cancelMyLeaveApplication(id: number) {
    return this.request<any>(`/teacher/leave/applications/${id}/cancel`, {
      method: 'POST'
    });
  }

  async getTeacherSelfProfile() {
    return this.request<{
      profile: any;
      qualifications: any[];
      activeSessions: any[];
      activityTrail: any[];
    }>('/teacher/profile');
  }

  async revokeTeacherSession(sessionId: number) {
    return this.request<{ success: boolean }>(`/teacher/profile/sessions/${sessionId}`, {
      method: 'DELETE'
    });
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
  async getAdminStaff(search?: string, staffType?: string, status?: string, options?: { limit?: number; offset?: number; sort?: string }) {
    const q = new URLSearchParams();
    if (search) q.append('search', search);
    if (staffType) q.append('staffType', staffType);
    if (status) q.append('status', status);
    if (options?.limit) q.append('limit', String(options.limit));
    if (options?.offset !== undefined) q.append('offset', String(options.offset));
    if (options?.sort) q.append('sort', options.sort);
    const str = q.toString();
    return this.request<any[]>(str ? `/admin/staff?${str}` : '/admin/staff');
  }

  async getAdminTeacherProfile(staffId: number) {
    return this.request<{
      staff: any;
      assignments: any[];
      homeroom: any[];
      timetable: any[];
      attendanceSummary: { total: number; present: number; absent: number; late: number; on_leave: number };
    }>(`/admin/staff/${staffId}/profile`);
  }

  async getAdminTeacherAssignments(staffId: number) {
    return this.request<any[]>(`/admin/staff/${staffId}/assignments`);
  }

  // Staff qualifications & supporting documents
  async getStaffQualifications(staffId: number) {
    return this.request<any[]>(`/admin/staff/${staffId}/qualifications`);
  }

  async createStaffQualification(staffId: number, data: {
    qualificationLevel: string;
    title: string;
    institution: string;
    fieldOfStudy?: string;
    awardDate?: string;
    gradeOrClass?: string;
    registrationNo?: string;
    notes?: string;
  }) {
    return this.request<{ id: number }>(`/admin/staff/${staffId}/qualifications`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateStaffQualification(staffId: number, qualificationId: number, data: Record<string, any>) {
    return this.request<{ success: boolean }>(`/admin/staff/${staffId}/qualifications/${qualificationId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteStaffQualification(staffId: number, qualificationId: number) {
    return this.request<{ success: boolean }>(`/admin/staff/${staffId}/qualifications/${qualificationId}`, {
      method: 'DELETE'
    });
  }

  async uploadQualificationDocument(staffId: number, qualificationId: number, data: {
    originalName: string;
    mimeType: string;
    dataBase64: string;
  }) {
    return this.request<{ linkId: number; documentId: number }>(
      `/admin/staff/${staffId}/qualifications/${qualificationId}/document`,
      { method: 'POST', body: JSON.stringify(data) }
    );
  }

  async verifyQualificationDocument(staffId: number, documentLinkId: number, data: { status: 'verified' | 'rejected'; note?: string }) {
    return this.request<{ success: boolean }>(
      `/admin/staff/${staffId}/qualification-documents/${documentLinkId}/verify`,
      { method: 'POST', body: JSON.stringify(data) }
    );
  }

  getQualificationDocumentDownloadUrl(staffId: number, documentLinkId: number) {
    return `${BASE_URL}/admin/staff/${staffId}/qualification-documents/${documentLinkId}/download`;
  }

  async getQualificationHistory(staffId: number, limit = 50) {
    return this.request<any[]>(`/admin/staff/${staffId}/qualification-history?limit=${limit}`);
  }

  async createAdminStaff(data: any) {
    return this.request<any>('/admin/staff', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async uploadStaffPhoto(staffId: number, data: { originalName: string; mimeType: string; dataBase64: string }) {
    return this.request<{ documentId: number }>(`/admin/staff/${staffId}/photo`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  getStaffPhotoUrl(staffId: number, cacheKey?: string | number) {
    const suffix = cacheKey !== undefined ? `?v=${encodeURIComponent(String(cacheKey))}` : '';
    return `${BASE_URL}/admin/staff/${staffId}/photo${suffix}`;
  }

  async updateAdminStaff(id: number, data: {
    employeeNo?: string;
    firstName?: string;
    fatherName?: string;
    grandfatherName?: string;
    gender?: 'female' | 'male';
    dateOfBirth?: string;
    phone?: string;
    email?: string;
    address?: string;
    jobTitle?: string;
    department?: string;
    staffType?: 'teacher' | 'administrator' | 'support' | 'librarian' | 'accountant' | 'other';
    hireDate?: string;
    endDate?: string;
    status?: 'active' | 'on_leave' | 'terminated';
  }) {
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

  async createAdminGrade(data: { gradeLevel: number; displayName?: string }) {
    return this.request<any>('/admin/grades', { method: 'POST', body: JSON.stringify(data) });
  }

  async updateAdminGrade(id: number, data: { displayName?: string; isActive?: boolean }) {
    return this.request<any>(`/admin/grades/${id}`, { method: 'PUT', body: JSON.stringify(data) });
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

  async createAdminSubject(data: { code: string; name: string; nameAm?: string; description?: string }) {
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

  async addAdminGradeSubject(data: { gradeId: number; subjectId: number; stream: string; isCompulsory?: boolean; periodsPerWeek?: number; academicYearId?: number }) {
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

  async getAdminAssessmentConfigurationOptions() { return this.request<any>('/admin/assessment-configuration-options'); }
  async createAdminAssessment(data: any) { return this.request<any>('/admin/assessments', { method: 'POST', body: JSON.stringify(data) }); }
  async updateAdminAssessment(id: number, data: any) { return this.request<any>(`/admin/assessments/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }

  async getAdminGradingScales() {
    return this.request<any[]>('/admin/grading-scales');
  }

  async getAcademicLifecycleOptions() {
    return this.request<any>('/admin/academic-lifecycle/options');
  }

  async getAcademicPolicies(academicYearId?: number) {
    const query = academicYearId ? `?academicYearId=${academicYearId}` : '';
    return this.request<any[]>(`/admin/academic-lifecycle/policies${query}`);
  }

  async saveAcademicPolicy(data: any) {
    return this.request<any>('/admin/academic-lifecycle/policies', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async getAcademicSubjectPrerequisites(gradeId?: number) {
    const query = gradeId ? `?gradeId=${gradeId}` : '';
    return this.request<any[]>(`/admin/academic-lifecycle/prerequisites${query}`);
  }

  async addAcademicSubjectPrerequisite(data: { gradeId: number; subjectId: number; prerequisiteSubjectId: number }) {
    return this.request<any>('/admin/academic-lifecycle/prerequisites', { method: 'POST', body: JSON.stringify(data) });
  }

  async removeAcademicSubjectPrerequisite(id: number) {
    return this.request<any>(`/admin/academic-lifecycle/prerequisites/${id}`, { method: 'DELETE' });
  }

  async getAcademicExamSchedules(termId?: number, sectionId?: number) {
    const query = new URLSearchParams();
    if (termId) query.set('termId', String(termId));
    if (sectionId) query.set('sectionId', String(sectionId));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<any[]>(`/admin/academic-lifecycle/exams${suffix}`);
  }

  async saveAcademicExamSchedule(data: any, id?: number) {
    return this.request<any>(`/admin/academic-lifecycle/exams${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data)
    });
  }

  async setAcademicExamScheduleStatus(id: number, status: 'published' | 'locked') {
    return this.request<any>(`/admin/academic-lifecycle/exams/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  async getAcademicCourseEnrollments(sectionId?: number, termId?: number) {
    const query = new URLSearchParams();
    if (sectionId) query.set('sectionId', String(sectionId));
    if (termId) query.set('termId', String(termId));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request<any[]>(`/admin/academic-lifecycle/course-enrollments${suffix}`);
  }

  async enrollAcademicCourse(data: { enrollmentId: number; teachingAssignmentId: number; termId: number }) {
    return this.request<any>('/admin/academic-lifecycle/course-enrollments', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async dropAcademicCourseEnrollment(id: number, reason: string) {
    return this.request<any>(`/admin/academic-lifecycle/course-enrollments/${id}/drop`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async getAcademicTranscript(studentId: number) {
    return this.request<any>(`/admin/academic-lifecycle/transcripts/${studentId}`);
  }

  async issueAcademicTranscript(studentId: number) {
    return this.request<any>('/admin/academic-lifecycle/transcripts/issue', {
      method: 'POST',
      body: JSON.stringify({ studentId })
    });
  }

  async getIssuedAcademicTranscripts(studentId: number) {
    return this.request<any[]>(`/admin/academic-lifecycle/transcripts/${studentId}/issues`);
  }

  async getAcademicRankings(termId: number, sectionId: number) {
    const query = new URLSearchParams({ termId: String(termId), sectionId: String(sectionId) });
    return this.request<any[]>(`/admin/academic-lifecycle/rankings?${query.toString()}`);
  }

  async evaluateAcademicPromotions(academicYearId: number) {
    return this.request<any[]>('/admin/academic-lifecycle/promotions/evaluate', {
      method: 'POST',
      body: JSON.stringify({ academicYearId })
    });
  }

  async recordAcademicPromotion(data: any) {
    return this.request<any>('/admin/academic-lifecycle/promotions', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getAcademicProbations(academicYearId?: number) {
    const query = academicYearId ? `?academicYearId=${academicYearId}` : '';
    return this.request<any[]>(`/admin/academic-lifecycle/probations${query}`);
  }

  async getAcademicProbationCandidates(termId: number) {
    return this.request<any[]>(`/admin/academic-lifecycle/probations/candidates?termId=${termId}`);
  }

  async createAcademicProbation(data: any) {
    return this.request<any>('/admin/academic-lifecycle/probations', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateAcademicProbation(id: number, status: 'cleared' | 'escalated') {
    return this.request<any>(`/admin/academic-lifecycle/probations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  async evaluateAcademicGraduation(academicYearId: number) {
    return this.request<any[]>('/admin/academic-lifecycle/graduation/evaluate', {
      method: 'POST',
      body: JSON.stringify({ academicYearId })
    });
  }

  async getAcademicGraduationReviews(academicYearId?: number) {
    const query = academicYearId ? `?academicYearId=${academicYearId}` : '';
    return this.request<any[]>(`/admin/academic-lifecycle/graduation/reviews${query}`);
  }

  async saveAcademicGraduationReview(data: { enrollmentId: number; decision: 'approved' | 'rejected'; note?: string }) {
    return this.request<any>('/admin/academic-lifecycle/graduation/reviews', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async issueAcademicGraduationCertificate(enrollmentId: number, certificateNumber: string) {
    return this.request<any>(`/admin/academic-lifecycle/graduation/${enrollmentId}/issue`, {
      method: 'POST',
      body: JSON.stringify({ certificateNumber })
    });
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

  getAdminProfilePhotoUrl(cacheKey?: string | number) {
    const suffix = cacheKey !== undefined ? `?v=${encodeURIComponent(String(cacheKey))}` : '';
    return `${BASE_URL}/admin/profile/photo${suffix}`;
  }

  getAdminStudentPhotoUrl(studentId: number, cacheKey?: string | number) {
    const suffix = cacheKey !== undefined ? `?v=${encodeURIComponent(String(cacheKey))}` : '';
    return `${BASE_URL}/admin/students/${studentId}/photo${suffix}`;
  }

  async getAdminNotificationPreferences() {
    return this.request<{ securityAlerts: boolean; guardianBroadcasts: boolean; attendanceDigest: boolean; systemErrors: boolean }>('/admin/profile/notification-preferences');
  }

  async saveAdminNotificationPreferences(data: { securityAlerts: boolean; guardianBroadcasts: boolean; attendanceDigest: boolean; systemErrors: boolean }) {
    return this.request<any>('/admin/profile/notification-preferences', { method: 'PUT', body: JSON.stringify(data) });
  }

  async updateAdminProfile(data: { phone?: string; email?: string; photo?: { originalName: string; mimeType: string; dataBase64: string } }) {
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

  // --- Page 12: My Profile ---
  async updateStudentProfile(payload: {
    phone?: string | null;
    email?: string | null;
    region?: string | null;
    city?: string | null;
    address?: string | null;
  }) {
    return this.request<{ success: boolean; changedFields: string[]; message: string }>('/student/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
  }

  async getStudentGuardians() {
    return this.request<{
      guardians: Array<{
        name: string;
        relationship: string;
        is_primary: boolean;
        is_emergency_contact: boolean;
        phone: string | null;
        email: string | null;
        verified: boolean;
      }>;
      count: number;
      policy: { showsContactForEmergencyOnly: boolean; editableByStudent: boolean };
    }>('/student/profile/guardians');
  }

  getStudentProfilePhotoUrl(cacheKey?: string | number) {
    const suffix = cacheKey !== undefined ? `?v=${encodeURIComponent(String(cacheKey))}` : '';
    return `${BASE_URL}/student/profile/photo${suffix}`;
  }

  async uploadStudentProfilePhoto(photo: { originalName: string; mimeType: string; dataBase64: string }) {
    return this.request<{ success: boolean; photoDocumentId: number; message: string }>('/student/profile/photo', {
      method: 'POST',
      body: JSON.stringify({ photo })
    });
  }

  async removeStudentProfilePhoto() {
    return this.request<{ success: boolean; message: string }>('/student/profile/photo', {
      method: 'DELETE'
    });
  }

  async changeStudentPassword(currentPassword: string, newPassword: string) {
    return this.request<any>('/student/settings/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  async getStudentSessions() {
    return this.request<any[]>('/student/settings/sessions');
  }

  async revokeStudentSession(id: number) {
    return this.request<any>(`/student/settings/sessions/${id}`, {
      method: 'DELETE'
    });
  }

  async revokeOtherStudentSessions() {
    return this.request<any>('/student/settings/sessions/revoke-others', {
      method: 'POST'
    });
  }

  async getStudentPreferences() {
    return this.request<any>('/student/settings/preferences');
  }

  async saveStudentPreferences(preferences: any) {
    return this.request<any>('/student/settings/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences)
    });
  }

  // Student Portal - Page 2: Subjects & Materials
  async getStudentSubjects() {
    return this.request<{
      subjects: any[];
      summary: {
        total_subjects: number;
        total_periods: number;
        section_name: string;
        stream: string;
        grade_name?: string;
      };
    }>('/student/subjects');
  }

  async getStudentSubjectDetail(subjectId: number) {
    return this.request<any>(`/student/subjects/${subjectId}`);
  }

  async getStudentMaterials(params?: { subjectId?: number; search?: string }) {
    const q = new URLSearchParams();
    if (params?.subjectId) q.append('subjectId', String(params.subjectId));
    if (params?.search) q.append('search', params.search);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<any[]>(`/student/materials${qs}`);
  }

  getStudentMaterialDownloadUrl(materialId: number) {
    return `${BASE_URL}/student/materials/${materialId}/download`;
  }

  // Student Portal - Page 3: Timetable & Calendar
  async getStudentWeeklyTimetable() {
    return this.request<{
      section_name: string;
      grade_name: string;
      academic_year: string;
      addis_time: {
        dayOfWeek: number;
        dayName: string;
        timeStr: string;
        dateStr: string;
        isoString: string;
      };
      current_period: any | null;
      slots: any[];
      days: Array<{
        day_number: number;
        day_name: string;
        is_today: boolean;
        periods: any[];
      }>;
    }>('/student/timetable');
  }

  async getStudentTodayTimetable(day?: number) {
    const q = day ? `?day=${day}` : '';
    return this.request<{
      section_name: string;
      grade_name: string;
      academic_year: string;
      addis_time: any;
      day: {
        day_number: number;
        day_name: string;
        is_today: boolean;
        periods: any[];
      };
      active_period: any | null;
    }>(`/student/timetable/today${q}`);
  }

  async getStudentCalendar(type?: string) {
    const q = type && type !== 'all' ? `?type=${type}` : '';
    return this.request<{
      academic_year: string;
      events: any[];
      terms: any[];
    }>(`/student/calendar${q}`);
  }

  async getStudentExams() {
    return this.request<{
      exams: any[];
      summary: {
        total: number;
        upcoming: number;
        completed: number;
      };
    }>('/student/exams');
  }

  // Student Portal - Page 4: Attendance
  async getStudentAttendanceSummary(termId?: number) {
    const qs = termId ? `?termId=${termId}` : '';
    return this.request<{
      summary: {
        total: number;
        present: number;
        late: number;
        absent: number;
        excused: number;
        rate: number;
        thresholdWarning: boolean;
      };
      monthlyBreakdown: Array<{
        month: string;
        monthLabel: string;
        total: number;
        present: number;
        late: number;
        absent: number;
        excused: number;
        rate: number;
      }>;
      subjectBreakdown: Array<{
        subjectId: number;
        subjectCode: string;
        subjectName: string;
        total: number;
        present: number;
        late: number;
        absent: number;
        excused: number;
        rate: number;
      }>;
      terms?: Array<{
        id: number;
        term_no: number;
        name: string;
        is_current: number;
        start_date: string;
        end_date: string;
      }>;
      selectedTermId?: number | null;
      ministryWarning: boolean;
      ministryMessage: string | null;
      cautionMessage: string | null;
    }>(`/student/attendance/summary${qs}`);
  }

  async getStudentAttendanceRecords(params?: {
    status?: string;
    month?: string;
    termId?: number;
    subjectId?: number;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    const q = new URLSearchParams();
    if (params?.status && params.status !== 'all') q.append('status', params.status);
    if (params?.month) q.append('month', params.month);
    if (params?.termId) q.append('termId', String(params.termId));
    if (params?.subjectId) q.append('subjectId', String(params.subjectId));
    if (params?.fromDate) q.append('fromDate', params.fromDate);
    if (params?.toDate) q.append('toDate', params.toDate);
    if (params?.page) q.append('page', String(params.page));
    if (params?.limit) q.append('limit', String(params.limit));
    const qs = q.toString() ? `?${q.toString()}` : '';

    return this.request<{
      records: Array<{
        id: number;
        status_code: 'present' | 'late' | 'absent' | 'excused';
        status_name: string;
        note?: string;
        counts_as_present: number;
        is_excused: number;
        is_corrected?: boolean | number;
        session_id: number;
        attendance_date: string;
        time_slot_id?: number | null;
        period_label?: string | null;
        period_start?: string | null;
        period_end?: string | null;
        subject_id?: number | null;
        subject_name?: string;
        subject_code?: string;
        marked_by_name: string;
      }>;
      totalCount: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/student/attendance${qs}`);
  }

  // Student Portal - Page 5: Assignments & Assessments
  async getStudentAssessments(status?: 'upcoming' | 'past', filters?: { subjectId?: number; termId?: number; type?: string }) {
    const q = new URLSearchParams();
    if (status) q.append('status', status);
    if (filters?.subjectId) q.append('subjectId', String(filters.subjectId));
    if (filters?.termId) q.append('termId', String(filters.termId));
    if (filters?.type) q.append('type', filters.type);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<any>(`/student/assessments${qs}`);
  }

  async getStudentUpcomingAssignments(filters?: { subjectId?: number; type?: string }) {
    const q = new URLSearchParams();
    if (filters?.subjectId) q.append('subjectId', String(filters.subjectId));
    if (filters?.type) q.append('type', filters.type);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<{
      assignments: Array<{
        id: number;
        title: string;
        instructions?: string;
        due_at: string;
        allow_late: boolean;
        max_score: number;
        subject_id: number;
        subject_code: string;
        subject_name: string;
        teacher_name: string;
        type?: string;
        is_overdue: boolean;
        days_remaining: number;
        submission_id?: number;
        submitted_at?: string;
        submission_status?: string;
        obtained_score?: number | null;
        feedback?: string;
        status: 'pending' | 'submitted' | 'graded' | 'overdue';
      }>;
      summary: {
        total: number;
        pending: number;
        submitted: number;
        overdue: number;
      };
    }>(`/student/assessments/upcoming${qs}`);
  }

  async getStudentPastAssessments(filters?: { termId?: number; subjectId?: number }) {
    const q = new URLSearchParams();
    if (filters?.termId) q.append('termId', String(filters.termId));
    if (filters?.subjectId) q.append('subjectId', String(filters.subjectId));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<{
      assessments: Array<{
        id: number;
        title: string;
        type_code: string;
        type_name: string;
        due_at: string;
        assessment_date?: string;
        max_score: number;
        weight?: number | null;
        term_id?: number;
        term_name?: string;
        subject_id: number;
        subject_code: string;
        subject_name: string;
        teacher_name: string;
        submission_id?: number;
        submitted_at?: string;
        is_submitted: boolean;
        obtained_score?: number | null;
        percentage?: number | null;
        feedback?: string;
        is_published: boolean;
      }>;
      terms: Array<{
        id: number;
        term_no: number;
        name: string;
        is_current: number;
        start_date: string;
        end_date: string;
      }>;
      count: number;
    }>(`/student/assessments/past${qs}`);
  }

  async getStudentSubmittedAssignments(filters?: { subjectId?: number; status?: string }) {
    const q = new URLSearchParams();
    if (filters?.subjectId) q.append('subjectId', String(filters.subjectId));
    if (filters?.status) q.append('status', filters.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<{
      submissions: Array<{
        id: number;
        assignment_id: number;
        assignment_title: string;
        assignment_instructions?: string;
        max_score: number;
        due_at: string;
        subject_id: number;
        subject_code: string;
        subject_name: string;
        teacher_name: string;
        submitted_at: string;
        is_late: boolean;
        submission_status: string;
        content_text?: string;
        obtained_score?: number | null;
        percentage?: number | null;
        feedback?: string;
        graded_at?: string;
      }>;
      count: number;
    }>(`/student/assessments/submitted${qs}`);
  }

  async getStudentSubmissions(filters?: { subjectId?: number; status?: string }) {
    return this.getStudentSubmittedAssignments(filters);
  }

  async getStudentAssessmentDetail(id: number) {
    return this.request<{
      id: number;
      title: string;
      instructions: string;
      due_at: string;
      allow_late: boolean;
      max_score: number;
      assignment_status: string;
      subject_id: number;
      subject_code: string;
      subject_name: string;
      subject_name_am?: string;
      teacher_name: string;
      teacher_email?: string;
      term_name?: string;
      submission_id?: number;
      submitted_at?: string;
      is_late?: boolean;
      submission_status?: string;
      content_text?: string;
      score?: number | null;
      obtained_score?: number | null;
      feedback?: string;
      graded_at?: string;
      attachments: Array<{
        id: number;
        title: string;
        description?: string;
        url?: string;
        document_id?: number;
        original_name?: string;
        mime_type?: string;
        size_bytes?: number;
      }>;
      is_overdue: boolean;
      can_submit: boolean;
    }>(`/student/assessments/${id}`);
  }

  async getStudentQuizzes() {
    return this.request<{
      quizzes: Array<{
        id: number;
        title: string;
        type_code: string;
        type_name: string;
        max_score: number;
        weight: number;
        assessment_date?: string;
        subject_id: number;
        subject_code: string;
        subject_name: string;
        teacher_name: string;
        obtained_score?: number | null;
        percentage?: number | null;
        feedback?: string;
        is_completed: boolean;
      }>;
      count: number;
    }>('/student/assessments/quizzes');
  }

  async submitStudentAssignment(
    assignmentId: number,
    payload: string | { contentText?: string; file?: { originalName: string; mimeType: string; dataBase64: string } }
  ) {
    const body = typeof payload === 'string' ? { contentText: payload } : payload;
    return this.request<{
      message: string;
      submission: any;
    }>(`/student/assessments/${assignmentId}/submit`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  getStudentSubmissionDownloadUrl(submissionOrAssignmentId: number) {
    return `${BASE_URL}/student/submissions/${submissionOrAssignmentId}/download`;
  }

  async downloadStudentSubmissionFile(submissionOrAssignmentId: number, filename?: string): Promise<void> {
    const url = this.getStudentSubmissionDownloadUrl(submissionOrAssignmentId);
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include'
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message || 'Failed to download submission file');
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename || 'submitted_solution';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }

  // Student Portal - Page 6: Results & Academic Progress
  async getStudentMyResults(filters?: { termId?: number; subjectId?: number }) {
    const params = new URLSearchParams();
    if (filters?.termId) params.append('termId', String(filters.termId));
    if (filters?.subjectId) params.append('subjectId', String(filters.subjectId));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      terms: Array<{ id: number; name: string; is_current: boolean }>;
      selectedTermId?: number;
      subjects: Array<{
        subject_id: number;
        subject_code: string;
        subject_name: string;
        credit_hours: number;
        letter_grade: string | null;
        total_score: number | null;
        is_pass: boolean | null;
        subject_rank: number | null;
        components_count: number;
        weighted_total: number;
        components: Array<{
          mark_id: number;
          assessment_id: number;
          title: string;
          type_code: string;
          type_name: string;
          max_score: number;
          weight: number;
          score: number | null;
          percentage: number | null;
          feedback?: string | null;
          assessment_date?: string;
          is_corrected: boolean;
          old_score?: number | null;
          correction_reason?: string | null;
          corrected_at?: string | null;
        }>;
      }>;
    }>(`/student/results${qs}`);
  }

  async getStudentTermSummary(filters?: { termId?: number; academicYearId?: number }) {
    const params = new URLSearchParams();
    if (filters?.termId) params.append('termId', String(filters.termId));
    if (filters?.academicYearId) params.append('academicYearId', String(filters.academicYearId));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      academicYears: Array<{ id: number; name: string; label_ec?: string; is_current: boolean }>;
      selectedAcademicYearId: number;
      terms: Array<{ id: number; name: string; is_current: boolean }>;
      selectedTermId: number;
      termGpa: number;
      termAverage: number;
      annualAverage: number;
      rank: number;
      classSize: number;
      attendanceRate: number;
      standing: string;
      totalSubjects: number;
      passedSubjects: number;
      academicYearName: string;
      results: Array<{
        id: number;
        subject_id: number;
        subject_code: string;
        subject_name: string;
        subject_name_am?: string;
        credit_hours: number;
        total_score: number;
        letter_grade: string;
        grade_points: number;
        is_pass: boolean;
        subject_rank?: number;
      }>;
    }>(`/student/results/summary${qs}`);
  }

  async getStudentProgressAndTrends(filters?: { academicYearId?: number }) {
    const params = new URLSearchParams();
    if (filters?.academicYearId) params.append('academicYearId', String(filters.academicYearId));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{
      hasSufficientTrendData: boolean;
      trendDataNotice?: string | null;
      termByTerm: Array<{
        term_id: number;
        term_name: string;
        term_no: number;
        average_score: number;
        gpa: number;
      }>;
      perSubjectTrend: Array<{
        subject_id: number;
        subject_code: string;
        subject_name: string;
        latestScore: number;
        previousScore?: number | null;
        delta: number;
        trend: 'improving' | 'steady' | 'declining';
        terms: Array<{ term_name: string; score: number }>;
      }>;
      strongestSubjects: any[];
      subjectsNeedingAttention: any[];
      attendanceTrend: Array<{ period: string; rate: number }>;
    }>(`/student/progress${qs}`);
  }

  async getStudentTermResults(termId?: number) {
    const q = termId ? `?termId=${termId}` : '';
    return this.request<{
      results: Array<{
        id: number;
        term_id: number;
        term_name: string;
        subject_id: number;
        subject_code: string;
        subject_name: string;
        subject_name_am?: string;
        credit_hours: number;
        total_score: number;
        letter_grade: string;
        grade_points: number;
        is_pass: boolean;
        subject_rank?: number;
        published_at: string;
      }>;
      terms: Array<{
        id: number;
        name: string;
        is_current: boolean;
      }>;
      selectedTermId?: number;
      termGpa: number;
      averageScore: number;
      totalSubjects: number;
      passedSubjects: number;
      standing: string;
      academicYear: string;
    }>(`/student/results/term${q}`);
  }

  async getStudentContinuousBreakdown() {
    return this.request<{
      subjects: Array<{
        subject_id: number;
        subject_code: string;
        subject_name: string;
        components_count: number;
        weighted_total: number;
        components: Array<{
          mark_id: number;
          assessment_id: number;
          title: string;
          type_code: string;
          type_name: string;
          max_score: number;
          weight: number;
          score: number | null;
          percentage: number | null;
          feedback?: string;
          assessment_date?: string;
        }>;
      }>;
    }>('/student/results/breakdown');
  }

  async getStudentAcademicAnalytics(termId?: number) {
    const q = termId ? `?termId=${termId}` : '';
    return this.request<{
      rank: number;
      classSize: number;
      gpa: number;
      averageScore: number;
      standing: string;
      totalSubjects: number;
      passedSubjects: number;
      topSubject?: any;
      lowestSubject?: any;
      results: any[];
    }>(`/student/results/analytics${q}`);
  }

  // ==============================================================
  // Student Portal - Page 7: Report Cards & Documents
  // ==============================================================

  async getStudentReportCards() {
    return this.request<{
      reportCards: Array<{
        id: number;
        reference_no: string;
        publication_id: number;
        term_id: number;
        term_name: string;
        term_no: number;
        academic_year_id: number;
        academic_year_name: string;
        version: number;
        class_rank: number;
        class_size: number;
        average_percent: number | string;
        payload: {
          studentName: string;
          admissionNo: string;
          sectionName: string;
          gradeLevel: number;
          termName: string;
          averagePercent: number;
          rank: number;
          classSize?: number;
          attendanceRate?: number;
          totalScore?: number;
          maxTotal?: number;
          subjects: Array<{
            code: string;
            name: string;
            score: number;
            maxScore: number;
            letter: string;
            remark?: string;
          }>;
        };
        publication_status: string;
        publication_date: string;
      }>;
      count: number;
    }>('/student/report-cards');
  }

  getStudentReportCardDownloadUrl(snapshotId: number): string {
    return `${BASE_URL}/student/report-cards/${snapshotId}/download`;
  }

  async downloadStudentReportCard(snapshotId: number, filename?: string): Promise<void> {
    const url = this.getStudentReportCardDownloadUrl(snapshotId);
    const res = await fetch(url, { method: 'GET', credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message || 'Failed to download report card PDF');
    }
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename || `Report_Card_${snapshotId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }

  async getStudentTranscripts() {
    return this.request<{
      transcripts: Array<{
        id: number;
        reference_no: string;
        issue_date: string;
        purpose: string;
        status: string;
        document_id?: number | null;
        original_name?: string;
        size_bytes?: number;
        mime_type?: string;
      }>;
      totalIssued: number;
      academicHistorySummary: {
        enrolledYears: number;
        hasCompletedYears: boolean;
        activeYear: string;
      };
    }>('/student/transcripts');
  }

  getStudentTranscriptDownloadUrl(transcriptId: number): string {
    return `${BASE_URL}/student/transcripts/${transcriptId}/download`;
  }

  async downloadStudentTranscript(transcriptId: number, filename?: string): Promise<void> {
    const url = this.getStudentTranscriptDownloadUrl(transcriptId);
    const res = await fetch(url, { method: 'GET', credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message || 'Failed to download transcript PDF');
    }
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename || `Official_Transcript_${transcriptId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }

  async getStudentIssuedDocuments() {
    return this.request<{
      documents: Array<{
        id: number;
        doc_type: string;
        original_name: string;
        storage_key: string;
        mime_type: string;
        size_bytes: number;
        issue_date: string;
        issued_by_role: string;
        issued_by_name: string;
        reference_no: string;
        validity: string;
      }>;
      annualCertificates: Array<{
        id: number;
        doc_type: string;
        title: string;
        academic_year_name: string;
        grade_name: string;
        grade_level: number;
        section_name: string;
        annual_average: number | null;
        outcome: string;
        reference_no: string;
        is_completed: boolean;
        terms_completed: number;
        issue_date: string;
        issued_by_role: string;
        validity: string;
      }>;
      currentYearProgress: {
        academicYearName: string;
        semester1Status: string;
        semester2Status: string;
        annualCertificateStatus: string;
      };
    }>('/student/documents');
  }

  getStudentDocumentDownloadUrl(documentId: number): string {
    return `${BASE_URL}/student/documents/${documentId}/download`;
  }

  async downloadStudentDocument(documentId: number, filename?: string): Promise<void> {
    const url = this.getStudentDocumentDownloadUrl(documentId);
    const res = await fetch(url, { method: 'GET', credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message || 'Failed to download document');
    }
    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename || `Document_${documentId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  }

  async getStudentRequestTypes() {
    return this.request<Array<{
      id: string;
      name: string;
      description: string;
      deliveryOptions: Array<'download' | 'collect'>;
      estimatedDays: number;
      copiesLimit: number;
      feeDescription: string;
    }>>('/student/request-types');
  }

  async getStudentRequests() {
    return this.request<{
      requests: Array<{
        id: number;
        request_no: string;
        student_id: number;
        request_type: string;
        purpose: string;
        reason?: string | null;
        copies_requested: number;
        delivery_method: 'download' | 'collect';
        status: 'submitted' | 'in_review' | 'approved' | 'rejected' | 'ready' | 'cancelled';
        decision_note?: string | null;
        decided_by_name?: string | null;
        decided_at?: string | null;
        document_id?: number | null;
        document_name?: string | null;
        document_size?: number | null;
        created_at: string;
        updated_at: string;
      }>;
      count: number;
    }>('/student/requests');
  }

  async getStudentRequestDetail(requestId: number) {
    return this.request<{
      id: number;
      request_no: string;
      student_id: number;
      request_type: string;
      purpose: string;
      reason?: string | null;
      copies_requested: number;
      delivery_method: 'download' | 'collect';
      status: 'submitted' | 'in_review' | 'approved' | 'rejected' | 'ready' | 'cancelled';
      decision_note?: string | null;
      decided_by_name?: string | null;
      decided_at?: string | null;
      document_id?: number | null;
      created_at: string;
      updated_at: string;
    }>(`/student/requests/${requestId}`);
  }

  async submitStudentRequest(payload: {
    requestType: string;
    purpose: string;
    reason?: string;
    copiesRequested?: number;
    deliveryMethod: 'download' | 'collect';
  }) {
    return this.request<{
      id: number;
      requestNo: string;
      requestType: string;
      status: string;
      copiesRequested: number;
      deliveryMethod: string;
      message: string;
    }>('/student/requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async cancelStudentRequest(requestId: number) {
    return this.request<{ success: boolean; message: string }>(`/student/requests/${requestId}/cancel`, {
      method: 'PATCH'
    });
  }

  // Help & Support (student support tickets)
  async getStudentSupportTickets() {
    return this.request<{
      tickets: Array<{
        id: number;
        category: string;
        subject: string;
        message: string;
        status: 'open' | 'answered' | 'closed';
        created_at: string;
        updated_at: string;
        reply_count: number;
        is_answered: boolean;
        last_staff_reply_at: string | null;
      }>;
      summary: { total: number; open: number; answered: number; closed: number };
    }>('/student/support/tickets');
  }

  async getStudentSupportTicket(ticketId: number) {
    return this.request<{
      id: number;
      category: string;
      subject: string;
      message: string;
      status: string;
      created_at: string;
      updated_at: string;
      replies: Array<{
        id: number;
        sender_role: string;
        sender_username: string | null;
        reply_text: string;
        created_at: string;
      }>;
    }>(`/student/support/tickets/${ticketId}`);
  }

  async createStudentSupportTicket(payload: { category: string; subject: string; message: string }) {
    return this.request<{ success: boolean; message: string; ticket: any }>('/student/support/tickets', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async closeStudentSupportTicket(ticketId: number) {
    return this.request<{ success: boolean; message: string }>(`/student/support/tickets/${ticketId}/close`, {
      method: 'PATCH'
    });
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

  async getRegistrarAdmissionApplications(search?: string, status?: string, page = 1, pageSize = 25) {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) q.set('search', search);
    if (status) q.set('status', status);
    return this.request<{ items: any[]; total: number; page: number; pageSize: number }>(`/registrar/admissions?${q}`);
  }

  async createRegistrarAdmissionApplication(application: {
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    dateOfBirth: string;
    phone?: string;
    email?: string;
    address?: string;
    guardianName?: string;
    guardianPhone?: string;
    previousSchool?: string;
  }) {
    return this.request<{ id: number; applicationRef: string; status: string; message: string }>('/registrar/admissions', {
      method: 'POST',
      body: JSON.stringify(application)
    });
  }

  async getRegistrarSections() {
    return this.request<any[]>('/registrar/sections');
  }

  async registerStudent(studentData: {
    firstName: string;
    fatherName: string;
    grandfatherName?: string;
    gender: 'female' | 'male';
    dateOfBirth: string;
    sectionId: number;
    phone?: string;
    email?: string;
    address?: string;
    previousSchool?: string;
    applicationId?: number;
    photo?: { originalName: string; mimeType: string; dataBase64: string };
  }) {
    return this.request<{ studentId: number; admissionNo: string; message: string }>('/registrar/students', {
      method: 'POST',
      body: JSON.stringify(studentData)
    });
  }

  async reassignStudentSection(studentId: number, newSectionId: number, reason: string) {
    return this.request<{ success: boolean; message: string }>(`/registrar/students/${studentId}/reassign-section`, {
      method: 'PATCH',
      body: JSON.stringify({ sectionId: newSectionId, reason })
    });
  }

  async getRegistrarTransfers() {
    return this.request<any[]>('/registrar/transfers');
  }

  async recordStudentTransfer(transferData: {
    studentId: number;
    type: 'transfer' | 'withdrawal';
    reason: string;
    destinationSchool?: string;
    effectiveDate: string;
  }) {
    return this.request<{ success: boolean; message: string }>('/registrar/transfers', {
      method: 'POST',
      body: JSON.stringify(transferData)
    });
  }

  async getRegistrarDocuments() {
    return this.request<any[]>('/registrar/documents');
  }

  getRegistrarStudentPhotoUrl(studentId: number) {
    return `${BASE_URL}/registrar/students/${studentId}/photo`;
  }

  async getRegistrarGuardians(search?: string, verificationStatus?: string, page = 1, pageSize = 25) {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) q.set('search', search);
    if (verificationStatus) q.set('verificationStatus', verificationStatus);
    return this.request<{ items: any[]; total: number; page: number; pageSize: number }>(`/registrar/guardians?${q}`);
  }

  async getRegistrarAttendanceSummary(sectionId?: number, startDate?: string, endDate?: string, page = 1, pageSize = 25) {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (sectionId) q.set('sectionId', String(sectionId));
    if (startDate) q.set('startDate', startDate);
    if (endDate) q.set('endDate', endDate);
    return this.request<{ items: any[]; total: number; page: number; pageSize: number }>(`/registrar/attendance/summary?${q}`);
  }

  async getRegistrarAssessmentCompleteness(sectionId?: number, academicYearId?: number, termId?: number, page = 1, pageSize = 25) {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (sectionId) q.set('sectionId', String(sectionId));
    if (academicYearId) q.set('academicYearId', String(academicYearId));
    if (termId) q.set('termId', String(termId));
    return this.request<{ items: any[]; total: number; page: number; pageSize: number }>(`/registrar/examinations/completeness?${q}`);
  }

  async getRegistrarAcademicRecords(search?: string, sectionId?: number, academicYearId?: number, termId?: number, page = 1, pageSize = 25) {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) q.set('search', search);
    if (sectionId) q.set('sectionId', String(sectionId));
    if (academicYearId) q.set('academicYearId', String(academicYearId));
    if (termId) q.set('termId', String(termId));
    return this.request<{ items: any[]; total: number; page: number; pageSize: number }>(`/registrar/results/academic-records?${q}`);
  }

  async getRegistrarPromotions(decision?: string, search?: string, academicYearId?: number, page = 1, pageSize = 25) {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (decision) q.set('decision', decision);
    if (search) q.set('search', search);
    if (academicYearId) q.set('academicYearId', String(academicYearId));
    return this.request<{ items: any[]; total: number; page: number; pageSize: number }>(`/registrar/promotions?${q}`);
  }

  async getRegistrarDataQuality() {
    return this.request<{
      students_without_guardians: number;
      guardians_pending_verification: number;
      active_students_without_current_enrollment: number;
      current_assessments_without_finalized_marks: number;
    }>('/registrar/reports/data-quality');
  }

  async getRegistrarRegistrationByYear(mode: 'calendar' | 'academic' = 'calendar') {
    return this.request<Array<{
      year: string;
      label: string;
      count: number;
      isCurrent?: boolean;
      mode: 'calendar' | 'academic';
    }>>(`/registrar/reports/registration-by-year?mode=${encodeURIComponent(mode)}`);
  }

  async getRegistrarDataQualityDetails(indicator: string, page = 1, pageSize = 25) {
    const q = new URLSearchParams({
      indicator,
      page: String(page),
      pageSize: String(pageSize)
    });
    return this.request<{
      indicator: string;
      items: any[];
      total: number;
      page: number;
      pageSize: number;
    }>(`/registrar/reports/data-quality/details?${q.toString()}`);
  }

  async getRegistrarProfile() {
    return this.request<any>('/registrar/profile');
  }

  async updateRegistrarProfile(data: {
    email?: string;
    phone?: string;
    address?: string;
    photo?: { originalName: string; mimeType: string; dataBase64: string };
    removePhoto?: boolean;
  }) {
    return this.request<{ success: boolean; message: string }>('/registrar/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  getRegistrarProfilePhotoUrl(cacheKey?: string | number) {
    const suffix = cacheKey !== undefined ? `?v=${encodeURIComponent(String(cacheKey))}` : '';
    return `${BASE_URL}/registrar/profile/photo${suffix}`;
  }

  // Parent Module
  async getParentDashboard() {
    return this.request<any>('/parent/dashboard');
  }

  async getParentChildren() {
    return this.request<{
      guardianVerificationStatus: string;
      allChildren: any[];
      verifiedChildren: any[];
      pendingChildren: any[];
    }>('/parent/children');
  }

  async getParentChildOverview(studentId: number) {
    return this.request<any>('/parent/children/' + studentId + '/overview');
  }

  async getParentChildMarks(studentId: number) {
    return this.request<{ studentId: number; enrollmentId: number; marks: any[] }>('/parent/children/' + studentId + '/marks');
  }

  async getParentChildAttendance(studentId: number) {
    return this.request<{
      studentId: number;
      enrollmentId: number;
      summary: { total: number; present: number; absent: number; late: number; excused: number; rate: number };
      records: any[];
    }>('/parent/children/' + studentId + '/attendance');
  }

  async getParentChildSubjects(studentId: number) {
    return this.request<{ studentId: number; sectionId: number; subjects: any[] }>('/parent/children/' + studentId + '/subjects');
  }

  async getParentChildTimetable(studentId: number) {
    return this.request<{
      studentId: number;
      sectionId: number;
      timetable: any[];
      byDay: Record<string, any[]>;
    }>('/parent/children/' + studentId + '/timetable');
  }

  async getParentChildAssessments(studentId: number) {
    return this.request<{
      studentId: number;
      sectionId: number;
      upcoming: any[];
      past: any[];
    }>('/parent/children/' + studentId + '/assessments');
  }

  async getParentChildDocuments(studentId: number) {
    return this.request<{
      studentId: number;
      enrollmentId: number;
      reportCards: any[];
      transcripts: any[];
    }>('/parent/children/' + studentId + '/documents');
  }

  async getParentChildHistory(studentId: number) {
    return this.request<{ studentId: number; history: any[] }>('/parent/children/' + studentId + '/history');
  }

  async getParentChildDetails(studentId: number) {
    return this.request<any>('/parent/children/' + studentId);
  }

  async getParentRequests() {
    return this.request<{ requests: any[] }>('/parent/requests');
  }

  async createParentRequest(payload: { category: string; subject: string; description: string; studentId?: number }) {
    return this.request<any>('/parent/requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getParentChildFinance(studentId: number) {
    return this.request<any>('/parent/children/' + studentId + '/finance');
  }

  async getParentAnnouncements(studentId?: number) {
    const q = studentId ? '?studentId=' + studentId : '';
    return this.request<{ announcements: any[] }>('/parent/announcements' + q);
  }

  async getParentCommunications(studentId?: number) {
    const q = studentId ? '?studentId=' + studentId : '';
    return this.request<{ messages: any[] }>('/parent/communications' + q);
  }

  async getParentMeetingRequests(studentId?: number) {
    const q = studentId ? '?studentId=' + studentId : '';
    return this.request<{ meetingRequests: any[] }>('/parent/meeting-requests' + q);
  }

  async createParentMeetingRequest(payload: {
    teacherStaffId: number;
    studentId: number;
    requestedDate: string;
    requestedTime: string;
    agenda: string;
  }) {
    return this.request<{ requestId: number; status: string; message: string }>('/parent/meeting-requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getParentChildTeachers(studentId: number) {
    return this.request<{ teachers: any[] }>('/parent/children/' + studentId + '/teachers');
  }

  async getParentFinanceSummary() {
    return this.request<{
      familySummary: {
        totalBilled: number;
        totalPaid: number;
        outstandingBalance: number;
        studentsCount: number;
      };
      students: any[];
    }>('/parent/finance');
  }

  // Package 5: Disaster Recovery, Backups, Recycle Bin, and Diagnostics
  async getBackups() {
    return this.request<any[]>('/admin/backups');
  }

  async createBackup(data?: { type?: string; notes?: string }) {
    return this.request<any>('/admin/backups', {
      method: 'POST',
      body: JSON.stringify(data || {})
    });
  }

  async verifyBackupChecksum(id: number) {
    return this.request<{ valid: boolean; storedChecksum: string; calculatedChecksum: string; sizeBytes: number; verifiedAt: string }>(
      `/admin/backups/${id}/verify`,
      { method: 'POST' }
    );
  }

  async restoreBackup(id: number, data: { confirmationWord: string; adminPassword?: string }) {
    return this.request<{ success: boolean; message: string }>(`/admin/backups/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async deleteBackup(id: number) {
    return this.request<{ success: boolean }>(`/admin/backups/${id}`, {
      method: 'DELETE'
    });
  }

  async getRecycleBin(filters?: { entityType?: string; page?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (filters?.entityType) q.append('entityType', filters.entityType);
    if (filters?.page) q.append('page', String(filters.page));
    if (filters?.limit) q.append('limit', String(filters.limit));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<{ items: any[]; total: number; page: number; limit: number }>(`/admin/recycle-bin${qs}`);
  }

  async restoreRecycleBinItem(entityType: string, id: number) {
    return this.request<{ success: boolean; message: string }>('/admin/recycle-bin/restore', {
      method: 'POST',
      body: JSON.stringify({ entityType, id })
    });
  }

  async purgeRecycleBinItem(entityType: string, id: number, adminPassword?: string) {
    return this.request<{ success: boolean; message: string }>('/admin/recycle-bin/purge', {
      method: 'POST',
      body: JSON.stringify({ entityType, id, adminPassword })
    });
  }

  async purgeAllExpiredRecycleBin(adminPassword?: string) {
    return this.request<{ purgedCount: number }>('/admin/recycle-bin/purge-all', {
      method: 'POST',
      body: JSON.stringify({ adminPassword })
    });
  }

  async getSystemDiagnostics() {
    return this.request<any>('/admin/health/diagnostics');
  }

  // =========================================================================
  // PACKAGE 3: APPROVALS QUEUE
  // =========================================================================
  async getApprovals(filters?: { status?: string; type?: string; requestedBy?: number; page?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (filters?.status) q.append('status', filters.status);
    if (filters?.type) q.append('type', filters.type);
    if (filters?.requestedBy) q.append('requestedBy', String(filters.requestedBy));
    if (filters?.page) q.append('page', String(filters.page));
    if (filters?.limit) q.append('limit', String(filters.limit));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<{ items: any[]; total: number; page: number; limit: number; totalPages: number }>(`/admin/approvals${qs}`);
  }

  async getApprovalsSummary() {
    return this.request<{ totalPending: number; byType: Record<string, number> }>('/admin/approvals/summary');
  }

  async getApprovalById(id: number) {
    return this.request<any>(`/admin/approvals/${id}`);
  }

  async createApproval(data: { type: string; entityType?: string; entityId?: number | null; oldValue?: any; newValue: any; reason: string }) {
    return this.request<{ id: number; message: string }>('/admin/approvals', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async decideApproval(id: number, data: { action: 'approve' | 'reject'; decisionNote?: string }) {
    return this.request<{ success: boolean; message: string; approval: any }>(`/admin/approvals/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async cancelApproval(id: number) {
    return this.request<{ success: boolean; message: string }>(`/admin/approvals/${id}/cancel`, {
      method: 'POST'
    });
  }

  // =========================================================================
  // PACKAGE 1: FINANCE & FEES
  // =========================================================================
  async getFinanceOverview() {
    return this.request<{
      totalInvoiced: number;
      totalCollected: number;
      outstandingBalance: number;
      collectionRate: number;
      byMethod: Array<{ method: string; total: number; count: number }>;
      byStatus: Array<{ status: string; total: number; count: number }>;
      recentPayments: any[];
    }>('/admin/finance/overview');
  }

  async getFeeCategories() {
    return this.request<any[]>('/admin/finance/fee-categories');
  }

  async createFeeCategory(data: { code: string; name: string; isRecurring?: boolean }) {
    return this.request<{ id: number; message: string }>('/admin/finance/fee-categories', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getFeeStructures(academicYearId?: number) {
    const qs = academicYearId ? `?academicYearId=${academicYearId}` : '';
    return this.request<any[]>(`/admin/finance/fee-structures${qs}`);
  }

  async createFeeStructure(data: {
    academic_year_id: number;
    grade_id?: number | null;
    fee_category_id: number;
    amount: number;
    due_date?: string;
  }) {
    return this.request<{ id: number; message: string }>('/admin/finance/fee-structures', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async getInvoices(filters?: {
    status?: string;
    search?: string;
    studentId?: number;
    page?: number;
    limit?: number;
  }) {
    const q = new URLSearchParams();
    if (filters?.status) q.append('status', filters.status);
    if (filters?.search) q.append('search', filters.search);
    if (filters?.studentId) q.append('studentId', String(filters.studentId));
    if (filters?.page) q.append('page', String(filters.page));
    if (filters?.limit) q.append('limit', String(filters.limit));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<{ items: any[]; total: number; page: number; limit: number; totalPages: number }>(`/admin/finance/invoices${qs}`);
  }

  async getInvoiceById(id: number) {
    return this.request<any>(`/admin/finance/invoices/${id}`);
  }

  async createInvoice(data: {
    student_id: number;
    academic_year_id: number;
    due_date: string;
    notes?: string;
    items: Array<{
      fee_category_id: number;
      description: string;
      quantity: number;
      unit_amount: number;
      discount_amount?: number;
    }>;
  }) {
    return this.request<{ id: number; invoice_no: string; total: number; message: string }>('/admin/finance/invoices', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async voidInvoice(id: number, reason: string) {
    return this.request<{ success: boolean; message: string }>(`/admin/finance/invoices/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async getPayments(filters?: {
    method?: string;
    studentId?: number;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const q = new URLSearchParams();
    if (filters?.method) q.append('method', filters.method);
    if (filters?.studentId) q.append('studentId', String(filters.studentId));
    if (filters?.search) q.append('search', filters.search);
    if (filters?.page) q.append('page', String(filters.page));
    if (filters?.limit) q.append('limit', String(filters.limit));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<{ items: any[]; total: number; page: number; limit: number; totalPages: number }>(`/admin/finance/payments${qs}`);
  }

  async recordPayment(data: {
    student_id: number;
    invoice_id?: number | null;
    amount: number;
    method: string;
    reference?: string;
    payer_name?: string;
    notes?: string;
  }) {
    return this.request<{ id: number; receipt_no: string; amount: number; method: string; message: string }>(
      '/admin/finance/payments',
      {
        method: 'POST',
        body: JSON.stringify(data)
      }
    );
  }

  async getScholarships() {
    return this.request<any[]>('/admin/finance/scholarships');
  }

  async createScholarship(data: {
    student_id: number;
    fee_category_id?: number | null;
    award_type: 'percentage' | 'fixed_amount';
    value: number;
    reason: string;
    valid_from?: string;
    valid_to?: string;
  }) {
    return this.request<{ id: number; message: string }>('/admin/finance/scholarships', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  // Package 4: Results Publishing & Report Cards
  async getAdminPublications(filters?: { termId?: number; sectionId?: number; status?: string }) {
    const q = new URLSearchParams();
    if (filters?.termId) q.append('termId', String(filters.termId));
    if (filters?.sectionId) q.append('sectionId', String(filters.sectionId));
    if (filters?.status) q.append('status', filters.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<any[]>(`/admin/results/publications${qs}`);
  }

  async generateResultsDraft(data: { termId: number; sectionId: number }) {
    return this.request<any>('/admin/results/publications/generate', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async submitPublication(id: number) {
    return this.request<any>(`/admin/results/publications/${id}/submit`, {
      method: 'POST'
    });
  }

  async approvePublication(id: number) {
    return this.request<any>(`/admin/results/publications/${id}/approve`, {
      method: 'POST'
    });
  }

  async publishPublication(id: number) {
    return this.request<any>(`/admin/results/publications/${id}/publish`, {
      method: 'POST'
    });
  }

  async withdrawPublication(id: number, reason: string) {
    return this.request<any>(`/admin/results/publications/${id}/withdraw`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  }

  async getSectionReportCards(publicationId: number) {
    return this.request<any>(`/admin/results/publications/${publicationId}/report-cards`);
  }

  async getStudentReportCard(enrollmentId: number, termId?: number) {
    const qs = termId ? `?termId=${termId}` : '';
    return this.request<any>(`/admin/results/report-cards/student/${enrollmentId}${qs}`);
  }
}


export const api = new ApiClient();
