import { ParentRepository } from './parent.repository';
import { AppError } from '../../middleware/errorHandler';

export class ParentService {
  private repo = new ParentRepository();

  private async getGuardian(userId: number) {
    const guardian = await this.repo.getGuardianByUserId(userId);
    if (!guardian) {
      throw new AppError('Guardian profile not found for this user account.', 404, 'GUARDIAN_NOT_FOUND');
    }
    return guardian;
  }

  async getDashboardData(userId: number) {
    const guardian = await this.getGuardian(userId);
    const children = await this.repo.getLinkedChildren(guardian.id);
    const announcements = await this.repo.getAnnouncements();

    const verifiedChildren = children.filter(
      (c) => guardian.verification_status === 'verified' && c.link_status === 'active'
    );
    const pendingChildren = children.filter(
      (c) => guardian.verification_status !== 'verified' || c.link_status === 'pending'
    );

    let initialChildOverview = null;
    if (verifiedChildren.length > 0) {
      initialChildOverview = await this.repo.getChildOverview(
        verifiedChildren[0].student_id,
        verifiedChildren[0].enrollment_id,
        verifiedChildren[0].section_id
      );
    }

    return {
      guardian,
      children,
      verifiedChildren,
      pendingChildren,
      selectedChildOverview: initialChildOverview,
      announcements
    };
  }

  async getChildren(userId: number) {
    const guardian = await this.getGuardian(userId);
    const children = await this.repo.getLinkedChildren(guardian.id);

    const verified = children.filter(
      (c) => guardian.verification_status === 'verified' && c.link_status === 'active'
    );
    const pending = children.filter(
      (c) => guardian.verification_status !== 'verified' || c.link_status === 'pending'
    );

    return {
      guardianVerificationStatus: guardian.verification_status,
      allChildren: children,
      verifiedChildren: verified,
      pendingChildren: pending
    };
  }

  async getChildOverview(userId: number, studentId: number, context?: any) {
    const enrollmentId = context?.enrollmentId;
    const sectionId = context?.sectionId;
    const overview = await this.repo.getChildOverview(studentId, enrollmentId, sectionId);
    if (!overview) {
      throw new AppError('Student profile record not found.', 404, 'STUDENT_NOT_FOUND');
    }
    return overview;
  }

  async getChildMarks(userId: number, studentId: number, context?: any) {
    const enrollmentId = context?.enrollmentId;
    const marks = await this.repo.getChildMarks(enrollmentId);
    return { studentId, enrollmentId, marks };
  }

  async getChildAttendance(userId: number, studentId: number, context?: any) {
    const enrollmentId = context?.enrollmentId;
    const attendance = await this.repo.getChildAttendance(enrollmentId);
    const total = attendance.length;
    const present = attendance.filter((a) => a.status_code === 'present').length;
    const absent = attendance.filter((a) => a.status_code === 'absent').length;
    const late = attendance.filter((a) => a.status_code === 'late').length;
    const excused = attendance.filter((a) => a.status_code === 'excused').length;
    const rate = total > 0 ? Number(((present / total) * 100).toFixed(1)) : 100.0;

    return {
      studentId,
      enrollmentId,
      summary: { total, present, absent, late, excused, rate },
      records: attendance
    };
  }

  async getChildSubjects(userId: number, studentId: number, context?: any) {
    const sectionId = context?.sectionId;
    const subjects = await this.repo.getChildSubjects(sectionId);
    return { studentId, sectionId, subjects };
  }

  async getChildTimetable(userId: number, studentId: number, context?: any) {
    const sectionId = context?.sectionId;
    const timetable = await this.repo.getChildTimetable(sectionId);

    // Group timetable by day
    const byDay: Record<string, any[]> = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: []
    };
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    timetable.forEach((entry: any) => {
      const name = dayNames[Number(entry.day_of_week)] || entry.day_of_week;
      if (byDay[name]) {
        byDay[name].push(entry);
      }
    });

    return { studentId, sectionId, timetable, byDay };
  }

  async getChildAssessments(userId: number, studentId: number, context?: any) {
    const sectionId = context?.sectionId;
    const enrollmentId = context?.enrollmentId;
    const data = await this.repo.getChildAssessments(sectionId, enrollmentId);
    return { studentId, sectionId, ...data };
  }

  async getChildDocuments(userId: number, studentId: number, context?: any) {
    const enrollmentId = context?.enrollmentId;
    const data = await this.repo.getChildDocuments(studentId, enrollmentId);
    return { studentId, enrollmentId, ...data };
  }

  async getChildHistory(userId: number, studentId: number) {
    const history = await this.repo.getChildEnrollmentHistory(studentId);
    return { studentId, history };
  }

  async getChildDetails(userId: number, studentId: number) {
    const guardian = await this.getGuardian(userId);
    const hasAccess = await this.repo.verifyChildAccess(guardian.id, studentId);
    if (!hasAccess) {
      throw new AppError('Access denied: You are not authorized to access records for this student.', 403, 'FORBIDDEN_CHILD_ACCESS');
    }

    const overview = await this.repo.getChildOverview(studentId);
    if (!overview) {
      throw new AppError('Child records not found.', 404, 'CHILD_NOT_FOUND');
    }

    const [attendance, marks, finance, subjects, timetable, assessments, documents, history] = await Promise.all([
      this.repo.getChildAttendance(overview.studentInfo.enrollment_id),
      this.repo.getChildMarks(overview.studentInfo.enrollment_id),
      this.repo.getChildFinance(studentId),
      this.repo.getChildSubjects(overview.studentInfo.section_id),
      this.repo.getChildTimetable(overview.studentInfo.section_id),
      this.repo.getChildAssessments(overview.studentInfo.section_id, overview.studentInfo.enrollment_id),
      this.repo.getChildDocuments(studentId, overview.studentInfo.enrollment_id),
      this.repo.getChildEnrollmentHistory(studentId)
    ]);

    return {
      overview,
      attendance,
      marks,
      subjects,
      timetable,
      assessments,
      documents,
      history,
      finance: this.buildFinanceView(finance)
    };
  }

  async getRequests(userId: number) {
    const guardian = await this.getGuardian(userId);
    const requests = await this.repo.getParentRequests(guardian.id);
    return { requests };
  }

  async createRequest(
    userId: number,
    data: { category: string; subject: string; description: string; studentId?: number }
  ) {
    const guardian = await this.getGuardian(userId);
    let studentId = data.studentId ? Number(data.studentId) : null;

    if (studentId) {
      const hasAccess = await this.repo.verifyChildAccess(guardian.id, studentId);
      if (!hasAccess) {
        throw new AppError('Unauthorized: Specified student does not belong to your account.', 403, 'UNAUTHORIZED_STUDENT_REQUEST');
      }
    }

    const request = await this.repo.createParentRequest(guardian.id, studentId, {
      category: data.category,
      subject: data.subject,
      description: data.description
    });

    return request;
  }

  async getFinanceSummary(userId: number) {
    const guardian = await this.getGuardian(userId);
    const children = await this.repo.getLinkedChildren(guardian.id);
    const feePermittedChildren = children.filter((c) => Boolean(c.can_view_fees));

    const studentFinances = await Promise.all(
      feePermittedChildren.map(async (child) => {
        const raw = await this.repo.getChildFinance(child.student_id);
        const built = this.buildFinanceView(raw);
        return {
          studentId: child.student_id,
          studentName: `${child.first_name} ${child.father_name}`,
          admissionNo: child.admission_no,
          gradeName: child.grade_name,
          sectionName: child.section_name,
          ...built
        };
      })
    );

    const familyTotalBilled = studentFinances.reduce((acc, s) => acc + s.summary.totalBilled, 0);
    const familyTotalPaid = studentFinances.reduce((acc, s) => acc + s.summary.totalPaid, 0);
    const familyOutstanding = Math.max(0, familyTotalBilled - familyTotalPaid);

    return {
      familySummary: {
        totalBilled: familyTotalBilled,
        totalPaid: familyTotalPaid,
        outstandingBalance: familyOutstanding,
        studentsCount: studentFinances.length
      },
      students: studentFinances
    };
  }

  async getChildFinance(userId: number, studentId: number) {
    const raw = await this.repo.getChildFinance(studentId);
    return this.buildFinanceView(raw);
  }

  private buildFinanceView(finance: { invoices: any[]; payments: any[] }) {
    const invoices = (finance.invoices || []).map((inv) => {
      const totalAmount = Number(inv.total_amount || 0);
      const paidAmount = Number(inv.paid_amount || 0);
      return {
        ...inv,
        invoice_number: inv.invoice_no,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        balance: Math.max(0, totalAmount - paidAmount)
      };
    });

    const totalBilled = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + inv.paid_amount, 0);

    return {
      summary: {
        totalBilled,
        totalPaid,
        outstandingBalance: Math.max(0, totalBilled - totalPaid)
      },
      invoices,
      payments: finance.payments || []
    };
  }

  async getAnnouncements(userId: number, studentId?: number) {
    const guardian = await this.getGuardian(userId);
    if (studentId) {
      const hasAccess = await this.repo.verifyChildAccess(guardian.id, studentId);
      if (!hasAccess) {
        throw new AppError('Unauthorized: Student does not belong to your account.', 404, 'STUDENT_NOT_FOUND');
      }
    }
    const announcements = await this.repo.getAnnouncements(guardian.id, studentId);
    return { announcements };
  }

  async getCommunications(userId: number, studentId?: number) {
    const guardian = await this.getGuardian(userId);
    if (studentId) {
      const hasAccess = await this.repo.verifyChildAccess(guardian.id, studentId);
      if (!hasAccess) {
        throw new AppError('Unauthorized: Student does not belong to your account.', 404, 'STUDENT_NOT_FOUND');
      }
    }
    const messages = await this.repo.getTeacherCommunications(guardian.id, studentId);
    return { messages };
  }

  async getMeetingRequests(userId: number, studentId?: number) {
    const guardian = await this.getGuardian(userId);
    if (studentId) {
      const hasAccess = await this.repo.verifyChildAccess(guardian.id, studentId);
      if (!hasAccess) {
        throw new AppError('Unauthorized: Student does not belong to your account.', 404, 'STUDENT_NOT_FOUND');
      }
    }
    const meetingRequests = await this.repo.getMeetingRequests(guardian.id, studentId);
    return { meetingRequests };
  }

  async createMeetingRequest(
    userId: number,
    data: { teacherStaffId: number; studentId: number; requestedDate: string; requestedTime: string; agenda: string }
  ) {
    const guardian = await this.getGuardian(userId);
    const hasAccess = await this.repo.verifyChildAccess(guardian.id, data.studentId);
    if (!hasAccess) {
      throw new AppError('Unauthorized: Student does not belong to your account.', 404, 'STUDENT_NOT_FOUND');
    }
    const requestId = await this.repo.createMeetingRequest(guardian.id, data);
    return {
      requestId,
      status: 'pending',
      message: 'Parent-teacher conference request submitted successfully. The teacher will confirm the meeting.'
    };
  }

  async getStudentTeachers(userId: number, studentId: number) {
    const guardian = await this.getGuardian(userId);
    const hasAccess = await this.repo.verifyChildAccess(guardian.id, studentId);
    if (!hasAccess) {
      throw new AppError('Unauthorized: Student does not belong to your account.', 404, 'STUDENT_NOT_FOUND');
    }
    const teachers = await this.repo.getStaffTeachingStudent(studentId);
    return { teachers };
  }
}
