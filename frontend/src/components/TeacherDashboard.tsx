import { useState, useEffect, useId, useMemo, type FormEvent } from 'react';
import '../TeacherDashboard.css';
import { api } from '../api/client';
import TeacherReports from './TeacherReports';
import TeacherNotFound from './teacher/TeacherNotFound';
import TeacherSubjects from './teacher/TeacherSubjects';
import TeacherAssessments from './teacher/TeacherAssessments';
import TeacherLessons from './teacher/TeacherLessons';
import TeacherWelfare from './teacher/TeacherWelfare';
import TeacherCommunication from './teacher/TeacherCommunication';
import TeacherRequests from './teacher/TeacherRequests';
import TeacherNotifications from './teacher/TeacherNotifications';
import TeacherLeave from './teacher/TeacherLeave';
import TeacherProfile from './teacher/TeacherProfile';

export type TeacherTab =
  | 'dashboard'
  | 'attendance'
  | 'marks'
  | 'reports'
  | 'classes'
  | 'timetable'
  | 'subjects'
  | 'assessments'
  | 'lessons'
  | 'welfare'
  | 'communication'
  | 'requests'
  | 'notifications'
  | 'leave'
  | 'profile'
  | 'not_found';

interface TeacherDashboardProps {
  teacherName?: string;
  teacherUsername?: string;
  onLogout: () => void;
}

interface AssignedClass {
  teaching_assignment_id: number;
  section_id: number;
  section_name: string;
  grade_level: number;
  grade_name: string;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  stream: string;
  student_count: number;
  capacity: number;
}

interface StudentAttendanceRecord {
  enrollmentId: number;
  studentId: number;
  admissionNo: string;
  studentName: string;
  rollNo: number;
  statusCode: 'present' | 'absent' | 'late' | 'excused';
  note: string;
}

interface AssessmentItem {
  id: number;
  title: string;
  max_score: number;
  weight: number;
  assessment_date: string;
  status: 'draft' | 'open' | 'closed';
  section_id: number;
  section_name: string;
  subject_id?: number;
  subject_name: string;
  assessment_type_name: string;
  term_name?: string;
  marks_submission_status?: 'draft' | 'submitted' | 'locked';
  submission_count?: number;
}

interface StudentMarkRecord {
  enrollmentId: number;
  studentId: number;
  admissionNo: string;
  studentName: string;
  rollNo: number;
  score: string;
  feedback: string;
  status: 'draft' | 'submitted' | 'locked';
}

const getTabFromPath = (path: string): TeacherTab => {
  const clean = path.replace(/\/$/, '');
  if (clean === '/teacher' || clean === '/teacher/dashboard' || clean === '') return 'dashboard';
  if (clean === '/teacher/attendance') return 'attendance';
  if (clean === '/teacher/marks') return 'marks';
  if (clean === '/teacher/reports') return 'reports';
  if (clean === '/teacher/classes') return 'classes';
  if (clean === '/teacher/timetable') return 'timetable';
  if (clean === '/teacher/subjects') return 'subjects';
  if (clean === '/teacher/assessments') return 'assessments';
  if (clean === '/teacher/lessons') return 'lessons';
  if (clean === '/teacher/welfare') return 'welfare';
  if (clean === '/teacher/communication') return 'communication';
  if (clean === '/teacher/requests') return 'requests';
  if (clean === '/teacher/notifications') return 'notifications';
  if (clean === '/teacher/leave') return 'leave';
  if (clean === '/teacher/profile') return 'profile';
  if (clean.startsWith('/teacher/')) return 'not_found';
  return 'dashboard';
};

export default function TeacherDashboard({
  teacherName = 'Teacher',
  teacherUsername = '',
  onLogout
}: TeacherDashboardProps) {
  // ROUTING & NAVIGATION
  const [activeTab, setActiveTab] = useState<TeacherTab>(() => getTabFromPath(window.location.pathname));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // CORE DATA FROM MYSQL
  const [assignedClasses, setAssignedClasses] = useState<AssignedClass[]>([]);
  const [teacherSubjects, setTeacherSubjects] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [extendedData, setExtendedData] = useState<any | null>(null);
  const [communicationContext, setCommunicationContext] = useState<{ studentId?: number; studentName?: string } | null>(null);

  // ATTENDANCE SUBVIEWS & WORKFLOW
  const [attSubView, setAttSubView] = useState<'record' | 'history' | 'repeated'>('record');
  const [attSubjectId, setAttSubjectId] = useState<number | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [attDate, setAttDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [attendanceList, setAttendanceList] = useState<StudentAttendanceRecord[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [attIsLocked, setAttIsLocked] = useState<boolean>(false);
  const [attIsSaving, setAttIsSaving] = useState<boolean>(false);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [repeatedAbsences, setRepeatedAbsences] = useState<any[]>([]);
  const [showCorrectionModal, setShowCorrectionModal] = useState<boolean>(false);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [isRequestingCorrection, setIsRequestingCorrection] = useState<boolean>(false);
  const [studentDetailModal, setStudentDetailModal] = useState<{ studentId: number; name: string } | null>(null);
  const [studentDetailRecords, setStudentDetailRecords] = useState<any[]>([]);

  // MARKS ENTRY STATE
  const [marksFilterSubjectId, setMarksFilterSubjectId] = useState<number | null>(null);
  const [marksFilterSectionId, setMarksFilterSectionId] = useState<number | null>(null);
  const [marksFilterTermId, setMarksFilterTermId] = useState<number | null>(null);
  const [marksViewMode, setMarksViewMode] = useState<'list' | 'entry'>('list');
  const [isAssessmentsLoading, setIsAssessmentsLoading] = useState<boolean>(false);
  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<number | null>(null);
  const [activeAssessment, setActiveAssessment] = useState<AssessmentItem | null>(null);
  const [marksList, setMarksList] = useState<StudentMarkRecord[]>([]);
  const [marksIsSaving, setMarksIsSaving] = useState<boolean>(false);
  const [isDirtyMarks, setIsDirtyMarks] = useState<boolean>(false);
  const [showMarkCorrectionModal, setShowMarkCorrectionModal] = useState<boolean>(false);
  const [markCorrectionReason, setMarkCorrectionReason] = useState<string>('');
  const [isRequestingMarkCorrection, setIsRequestingMarkCorrection] = useState<boolean>(false);
  const [showMarksHistoryModal, setShowMarksHistoryModal] = useState<boolean>(false);
  const [marksHistoryList, setMarksHistoryList] = useState<any[]>([]);
  const [missingMarksList, setMissingMarksList] = useState<any[]>([]);
  const [showMissingModal, setShowMissingModal] = useState<boolean>(false);

  // CLASSES SUBVIEWS & STUDENT PROFILE
  const [selectedClassDetail, setSelectedClassDetail] = useState<any | null>(null);
  const [scopedStudentProfile, setScopedStudentProfile] = useState<any | null>(null);
  const [homeroomSection, setHomeroomSection] = useState<any | null>(null);

  // TIMETABLE VIEW
  const [timetableMode, setTimetableMode] = useState<'daily' | 'weekly'>('weekly');
  const [fullTimetable, setFullTimetable] = useState<any[]>([]);
  const [timetableClassFilter, setTimetableClassFilter] = useState<number | null>(null);

  // DYNAMIC DASHBOARD COMMAND CENTER STATE
  const [currentDateTime, setCurrentDateTime] = useState<Date>(() => new Date());
  const [dashboardPerspective, setDashboardPerspective] = useState<'today' | 'pulse' | 'homeroom' | 'scratchpad'>('today');
  const [scratchpadText, setScratchpadText] = useState<string>(() => localStorage.getItem('teacher_scratchpad_notes') || '');
  const [scratchpadSaved, setScratchpadSaved] = useState<boolean>(false);

  // CREATE ASSESSMENT MODAL
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [assessmentTypes, setAssessmentTypes] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newAssignmentId, setNewAssignmentId] = useState<number | null>(null);
  const [newTermId, setNewTermId] = useState<number | null>(null);
  const [newMaxScore, setNewMaxScore] = useState('30');
  const [newWeight, setNewWeight] = useState('30');
  const [newTypeId, setNewTypeId] = useState<number>(4);

  // Accessibility IDs
  const searchInputId = useId();
  const attSubSelectId = useId();
  const attSectionId = useId();
  const attDateId = useId();
  const marksSubjectFilterId = useId();
  const marksSectionFilterId = useId();
  const marksTermFilterId = useId();

  // SINGLE NOTIFICATION CENTER (ICON-ONLY TOPBAR BELL)
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const res = await api.getNotifications();
      setNotificationsList(res || []);
    } catch {
      // Non-critical: keep cached notifications
    } finally {
      setNotificationsLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
    const interval = setInterval(() => {
      void loadNotifications();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!notificationsOpen) return;
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-teacher-notifications]')) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, [notificationsOpen]);

  const handleMarkNotificationRead = async (notification: any) => {
    if (notification.read_at) return;
    try {
      await api.markNotificationRead(notification.id);
      setNotificationsList((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
    } catch (err: any) {
      showToast(err.message || 'Could not mark notification as read.');
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotificationsList((current) =>
        current.map((item) => (item.read_at ? item : { ...item, read_at: now }))
      );
      showToast('All notifications marked as read.');
    } catch (err: any) {
      showToast(err.message || 'Could not mark notifications as read.');
    }
  };

  const unreadNotifications = notificationsList.filter((item) => !item.read_at);
  const notificationCount = unreadNotifications.length;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Synchronize URL changes
  const navigateTo = (tab: TeacherTab) => {
    setActiveTab(tab);
    if (tab === 'not_found') return;
    const targetPath = `/teacher/${tab}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Ensure /teacher redirects cleanly to /teacher/dashboard
  useEffect(() => {
    if (window.location.pathname === '/teacher' || window.location.pathname === '/teacher/') {
      window.history.replaceState(null, '', '/teacher/dashboard');
    }
  }, []);

  // Load initial teacher datasets from MySQL
  const loadInitialData = async () => {
    setIsLoading(true);
    setApiError(null);
    try {
      const [classes, subjectsList, termsList, types, extData, hrSec, fullTt] = await Promise.all([
        api.getAssignedClasses().catch(() => []),
        api.getTeacherSubjects().catch(() => []),
        api.getTerms().catch(() => []),
        api.getAssessmentTypes().catch(() => []),
        api.getTeacherDashboardExtended().catch(() => null),
        api.getHomeroomSection().catch(() => null),
        api.getTeacherTimetable().catch(() => [])
      ]);

      const resolvedClasses = (classes && classes.length > 0)
        ? classes
        : (extData?.assignedClasses || []);

      setAssignedClasses(resolvedClasses);
      setTeacherSubjects(subjectsList || []);
      setTerms(termsList || []);
      setAssessmentTypes(types || []);
      setExtendedData(extData);
      setHomeroomSection(hrSec);
      setFullTimetable(fullTt || []);

      if (extData) {
        setTimetable(extData.todayTimetable || []);
        setAnnouncements(extData.announcements || []);
      }

      if (resolvedClasses && resolvedClasses.length > 0) {
        setSelectedSectionId((prev) => prev || resolvedClasses[0].section_id);
        setNewAssignmentId((prev) => prev || resolvedClasses[0].teaching_assignment_id);
      }
      if (termsList && termsList.length > 0) {
        const activeTerm = termsList.find((t: any) => t.is_active) || termsList[0];
        setNewTermId((prev) => prev || activeTerm.id);
      }
    } catch (err: any) {
      setApiError(err.message || 'Failed to connect to backend server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (showCreateModal && assignedClasses.length > 0) {
      if (!newAssignmentId || !assignedClasses.some((c) => c.teaching_assignment_id === newAssignmentId)) {
        setNewAssignmentId(assignedClasses[0].teaching_assignment_id);
      }
    }
  }, [showCreateModal, assignedClasses, newAssignmentId]);

  useEffect(() => {
    loadInitialData();
  }, []);

  // REAL-TIME PERIOD ENGINE & CLOCK TICKER
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const totalEnrolledStudents = useMemo(() => {
    return assignedClasses.reduce((acc, c) => acc + (c.student_count || 0), 0);
  }, [assignedClasses]);

  const livePeriodStatus = useMemo(() => {
    const slots = extendedData?.todayTimetable || timetable || [];
    if (!slots || slots.length === 0) return { type: 'none' as const };

    const now = currentDateTime;
    const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    const parseTimeSec = (tStr: string) => {
      if (!tStr) return 0;
      const parts = tStr.split(':').map(Number);
      return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    };

    for (const s of slots) {
      const sStart = parseTimeSec(s.start_time);
      const sEnd = parseTimeSec(s.end_time);
      if (currentSec >= sStart && currentSec < sEnd) {
        const minsLeft = Math.max(1, Math.ceil((sEnd - currentSec) / 60));
        return { type: 'active' as const, slot: s, minsLeft };
      }
    }

    // Find next upcoming
    const upcoming = slots
      .filter((s: any) => parseTimeSec(s.start_time) > currentSec)
      .sort((a: any, b: any) => parseTimeSec(a.start_time) - parseTimeSec(b.start_time));

    if (upcoming.length > 0) {
      const next = upcoming[0];
      const minsUntil = Math.max(1, Math.ceil((parseTimeSec(next.start_time) - currentSec) / 60));
      return { type: 'upcoming' as const, nextSlot: next, minsUntil };
    }

    return { type: 'completed' as const };
  }, [extendedData?.todayTimetable, timetable, currentDateTime]);

  const handleScratchpadChange = (val: string) => {
    setScratchpadText(val);
    localStorage.setItem('teacher_scratchpad_notes', val);
    setScratchpadSaved(true);
    setTimeout(() => setScratchpadSaved(false), 2000);
  };

  // ATTENDANCE: Filter available sections based on selected Subject
  const availableAttSections = useMemo(() => {
    if (!attSubjectId) return assignedClasses;
    return assignedClasses.filter((c) => c.subject_id === attSubjectId);
  }, [assignedClasses, attSubjectId]);

  useEffect(() => {
    if (availableAttSections.length > 0) {
      const exists = availableAttSections.some((c) => c.section_id === selectedSectionId);
      if (!exists) {
        setSelectedSectionId(availableAttSections[0].section_id);
      }
    }
  }, [availableAttSections, selectedSectionId]);

  // Load attendance session & roster
  useEffect(() => {
    if (!selectedSectionId) return;

    const loadAttendance = async () => {
      try {
        const activeClass = assignedClasses.find(
          (c) => c.section_id === selectedSectionId && (!attSubjectId || c.subject_id === attSubjectId)
        ) || assignedClasses.find((c) => c.section_id === selectedSectionId);
        const subId = attSubjectId || (activeClass ? activeClass.subject_id : undefined);

        const sessionData = await api.getAttendanceSession(selectedSectionId, attDate, subId);

        if (sessionData && sessionData.records && sessionData.records.length > 0) {
          setCurrentSessionId(sessionData.session.id);
          setAttIsLocked(sessionData.session.status === 'locked' || sessionData.session.status === 'submitted');
          setAttendanceList(
            sessionData.records.map((r: any) => ({
              enrollmentId: r.enrollment_id,
              studentId: r.student_id,
              admissionNo: r.admission_no,
              studentName: r.student_name,
              rollNo: r.roll_no || 0,
              statusCode: r.status_code || 'present',
              note: r.note || ''
            }))
          );
        } else {
          setCurrentSessionId(null);
          const students = await api.getSectionStudents(selectedSectionId);
          setAttIsLocked(false);
          setAttendanceList(
            students.map((s: any, idx: number) => ({
              enrollmentId: s.enrollment_id,
              studentId: s.student_id,
              admissionNo: s.admission_no,
              studentName: s.full_name,
              rollNo: s.roll_no || idx + 1,
              statusCode: 'present',
              note: ''
            }))
          );
        }
      } catch (err: any) {
        showToast(`Error loading attendance: ${err.message}`);
      }
    };

    loadAttendance();
  }, [selectedSectionId, attDate, attSubjectId, assignedClasses]);

  // Load attendance history & repeated absences when toggled
  useEffect(() => {
    if (!selectedSectionId) return;
    if (attSubView === 'history') {
      api.getTeacherAttendanceHistory(selectedSectionId).then(setAttendanceHistory).catch(() => []);
    } else if (attSubView === 'repeated') {
      api.getRepeatedAbsences(selectedSectionId).then(setRepeatedAbsences).catch(() => []);
    }
  }, [attSubView, selectedSectionId]);

  // MARKS: Filter sections
  const availableMarksSections = useMemo(() => {
    if (!marksFilterSubjectId) return assignedClasses;
    return assignedClasses.filter((c) => c.subject_id === marksFilterSubjectId);
  }, [assignedClasses, marksFilterSubjectId]);

  const fetchAssessmentsList = async () => {
    setIsAssessmentsLoading(true);
    try {
      const list = await api.getAssessments({
        subjectId: marksFilterSubjectId || undefined,
        sectionId: marksFilterSectionId || undefined,
        termId: marksFilterTermId || undefined
      });
      setAssessments(list || []);
    } catch (err: any) {
      showToast(`Failed to load assessments: ${err.message}`);
    } finally {
      setIsAssessmentsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'marks' || activeTab === 'dashboard') {
      fetchAssessmentsList();
    }
  }, [activeTab, marksFilterSubjectId, marksFilterSectionId, marksFilterTermId]);

  const handleOpenAssessment = async (assessment: AssessmentItem) => {
    if (isDirtyMarks) {
      const confirmLeave = window.confirm('You have unsaved marks changes. Discard them and proceed?');
      if (!confirmLeave) return;
    }
    setSelectedAssessmentId(assessment.id);
    setActiveAssessment(assessment);
    setMarksViewMode('entry');
    setIsDirtyMarks(false);

    try {
      const data = await api.getAssessmentDetails(assessment.id);
      if (data && data.marks) {
        setMarksList(
          data.marks.map((m: any) => ({
            enrollmentId: m.enrollment_id,
            studentId: m.student_id,
            admissionNo: m.admission_no,
            studentName: m.student_name,
            rollNo: m.roll_no || 0,
            score: m.score !== null && m.score !== undefined ? String(m.score) : '',
            feedback: m.feedback || '',
            status: m.status || 'draft'
          }))
        );
      }
    } catch (err: any) {
      showToast(`Error loading assessment marks: ${err.message}`);
    }
  };

  // ATTENDANCE ACTIONS
  const markAllPresent = () => {
    if (attIsLocked) return;
    setAttendanceList((prev) => prev.map((item) => ({ ...item, statusCode: 'present' })));
    showToast('All students marked present.');
  };

  const handleStatusChange = (enrollmentId: number, status: 'present' | 'absent' | 'late' | 'excused') => {
    if (attIsLocked) return;
    setAttendanceList((prev) =>
      prev.map((item) => (item.enrollmentId === enrollmentId ? { ...item, statusCode: status } : item))
    );
  };

  const handleRemarkChange = (enrollmentId: number, note: string) => {
    if (attIsLocked) return;
    setAttendanceList((prev) =>
      prev.map((item) => (item.enrollmentId === enrollmentId ? { ...item, note } : item))
    );
  };

  const handleSaveAttendance = async () => {
    if (!selectedSectionId || attendanceList.length === 0) return;
    setAttIsSaving(true);
    try {
      const activeClass = assignedClasses.find((c) => c.section_id === selectedSectionId);
      const subId = attSubjectId || (activeClass ? activeClass.subject_id : null);

      const res = await api.recordAttendance({
        sectionId: selectedSectionId,
        attendanceDate: attDate,
        subjectId: subId,
        status: 'locked',
        records: attendanceList.map((r) => ({
          enrollmentId: r.enrollmentId,
          statusCode: r.statusCode,
          note: r.note || undefined
        }))
      });
      if (res && res.session) {
        setCurrentSessionId(res.session.id);
      }
      setAttIsLocked(true);
      showToast('Attendance recorded and locked in MySQL.');
      loadInitialData();
    } catch (err: any) {
      showToast(`Save failed: ${err.message}`);
    } finally {
      setAttIsSaving(false);
    }
  };

  // SUBMIT ATTENDANCE CORRECTION REQUEST TO APPROVALS QUEUE
  const handleRequestCorrectionSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentSessionId || !selectedSectionId || !correctionReason.trim()) {
      alert('Please state a valid mandatory reason for correction.');
      return;
    }
    setIsRequestingCorrection(true);
    try {
      await api.requestAttendanceCorrection({
        sessionId: currentSessionId,
        sectionId: selectedSectionId,
        attendanceDate: attDate,
        reason: correctionReason.trim(),
        oldRecords: attendanceList.map((r) => ({ enrollmentId: r.enrollmentId, statusCode: r.statusCode })),
        newRecords: attendanceList.map((r) => ({ enrollmentId: r.enrollmentId, statusCode: r.statusCode, note: r.note }))
      });
      showToast('Correction request submitted to Administrator Approvals Queue!');
      setShowCorrectionModal(false);
      setCorrectionReason('');
    } catch (err: any) {
      alert(`Request failed: ${err.message}`);
    } finally {
      setIsRequestingCorrection(false);
    }
  };

  // OPEN STUDENT DETAIL MODAL
  const handleOpenStudentDetail = async (studentId: number, name: string) => {
    if (!selectedSectionId) return;
    setStudentDetailModal({ studentId, name });
    try {
      const records = await api.getStudentAttendanceDetail(selectedSectionId, studentId);
      setStudentDetailRecords(records || []);
    } catch (err: any) {
      console.error(err);
    }
  };

  // MARKS ACTIONS
  const handleScoreChange = (enrollmentId: number, score: string) => {
    setIsDirtyMarks(true);
    setMarksList((prev) =>
      prev.map((item) => (item.enrollmentId === enrollmentId ? { ...item, score } : item))
    );
  };

  const handleFeedbackChange = (enrollmentId: number, feedback: string) => {
    setIsDirtyMarks(true);
    setMarksList((prev) =>
      prev.map((item) => (item.enrollmentId === enrollmentId ? { ...item, feedback } : item))
    );
  };

  const handleSaveMarks = async (status: 'draft' | 'submitted') => {
    if (!selectedAssessmentId) return;
    const maxScore = activeAssessment ? activeAssessment.max_score : 100;
    const invalidMark = marksList.find(
      (m) => m.score !== '' && (isNaN(Number(m.score)) || Number(m.score) < 0 || Number(m.score) > maxScore)
    );
    if (invalidMark) {
      alert(`Score for ${invalidMark.studentName} must be between 0 and ${maxScore}.`);
      return;
    }

    setMarksIsSaving(true);
    try {
      const marksPayload = marksList
        .filter((m) => m.score !== '')
        .map((m) => ({
          enrollmentId: m.enrollmentId,
          score: Number(m.score),
          feedback: m.feedback || undefined,
          markStatus: 'scored' as const
        }));

      await api.saveMarks(selectedAssessmentId, status, marksPayload);
      setIsDirtyMarks(false);
      showToast(status === 'submitted' ? 'Marks submitted for administrative approval!' : 'Draft marks saved in MySQL.');
      fetchAssessmentsList();
      if (status === 'submitted') {
        setMarksViewMode('list');
      }
    } catch (err: any) {
      showToast(`Failed to save marks: ${err.message}`);
    } finally {
      setMarksIsSaving(false);
    }
  };

  // SUBMIT MARK CORRECTION REQUEST
  const handleMarkCorrectionSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedAssessmentId || !markCorrectionReason.trim()) {
      alert('Please enter a mandatory justification for mark correction.');
      return;
    }
    setIsRequestingMarkCorrection(true);
    try {
      await api.requestMarkCorrection({
        assessmentId: selectedAssessmentId,
        reason: markCorrectionReason.trim(),
        oldMarks: marksList.map((m) => ({ enrollmentId: m.enrollmentId, score: m.score })),
        newMarks: marksList.map((m) => ({ enrollmentId: m.enrollmentId, score: m.score, feedback: m.feedback }))
      });
      showToast('Mark correction request dispatched to Principal!');
      setShowMarkCorrectionModal(false);
      setMarkCorrectionReason('');
    } catch (err: any) {
      alert(`Request failed: ${err.message}`);
    } finally {
      setIsRequestingMarkCorrection(false);
    }
  };

  // INSPECT MARKS HISTORY
  const handleOpenMarksHistory = async (assessmentId: number) => {
    setShowMarksHistoryModal(true);
    try {
      const history = await api.getMarksHistory(assessmentId);
      setMarksHistoryList(history || []);
    } catch (err: any) {
      showToast(`History error: ${err.message}`);
    }
  };

  // INSPECT MISSING MARKS
  const handleOpenMissingMarks = async (assessmentId: number) => {
    setShowMissingModal(true);
    try {
      const missing = await api.getMissingMarks(assessmentId);
      setMissingMarksList(missing || []);
    } catch (err: any) {
      showToast(`Missing marks error: ${err.message}`);
    }
  };

  // OPEN CLASS DETAIL & ROSTER
  const handleOpenClassDetail = async (sectionId: number) => {
    try {
      const detail = await api.getClassDetail(sectionId);
      setSelectedClassDetail(detail);
    } catch (err: any) {
      showToast(`Failed to load class roster: ${err.message}`);
    }
  };

  // OPEN TEACHER-SCOPED STUDENT PROFILE
  const handleOpenStudentProfile = async (studentId: number) => {
    try {
      const profile = await api.getTeacherStudentProfile(studentId);
      setScopedStudentProfile(profile);
    } catch (err: any) {
      showToast(`Failed to load student profile: ${err.message}`);
    }
  };

  // CREATE ASSESSMENT
  const handleCreateAssessment = async (e: FormEvent) => {
    e.preventDefault();
    if (!newAssignmentId || !newTermId || !newTitle.trim()) {
      alert('Please fill out all required assessment fields.');
      return;
    }
    try {
      await api.createAssessment({
        teachingAssignmentId: newAssignmentId,
        termId: newTermId,
        assessmentTypeId: newTypeId,
        title: newTitle.trim(),
        maxScore: Number(newMaxScore),
        weight: Number(newWeight),
        assessmentDate: new Date().toISOString().split('T')[0]
      });
      setShowCreateModal(false);
      setNewTitle('');
      showToast('Assessment created successfully!');
      fetchAssessmentsList();
    } catch (err: any) {
      alert(`Failed to create assessment: ${err.message}`);
    }
  };

  // COUNTERS
  const counts = useMemo(() => {
    const res = { present: 0, absent: 0, late: 0, excused: 0 };
    attendanceList.forEach((r) => {
      if (r.statusCode in res) res[r.statusCode]++;
    });
    return res;
  }, [attendanceList]);

  const currentClassInfo = assignedClasses.find((c) => c.section_id === selectedSectionId);

  return (
    <div className="teacher-shell">
      {/* 1. TOP BAR */}
      <header className="teacher-topbar">
        <div className="topbar-brand">
          <div className="topbar-logo-box">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>
          <div className="topbar-title">
            <h1>HSPSMS PORTAL</h1>
            <span>Teacher &amp; Faculty Services</span>
          </div>
        </div>

        <div className="topbar-search">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id={searchInputId}
            name="topbarSearch"
            type="text"
            placeholder="Search students, classes, exams..."
            aria-label="Global search students, classes, exams"
          />
        </div>

        <div className="topbar-actions">
          <div style={{ position: 'relative' }} data-teacher-notifications>
            <button
              type="button"
              className="topbar-icon-btn"
              aria-label={`Notifications${notificationCount > 0 ? ` (${notificationCount} unread)` : ''}`}
              title="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => {
                setNotificationsOpen((open) => !open);
                if (!notificationsOpen) void loadNotifications();
              }}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notificationCount > 0 && (
                <span className="topbar-icon-badge" aria-hidden="true">
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div
                role="menu"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 10px)',
                  width: '350px',
                  maxHeight: '440px',
                  overflowY: 'auto',
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  boxShadow: '0 14px 36px rgba(15, 23, 42, 0.22)',
                  zIndex: 999,
                  padding: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px solid #F1F5F9' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px', color: '#1F3A5F' }}>
                    Notifications {notificationCount > 0 ? `(${notificationCount})` : ''}
                  </span>
                  {unreadNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleMarkAllNotificationsRead()}
                      style={{ border: 0, background: 'transparent', color: '#2563EB', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {notificationsLoading && notificationsList.length === 0 && (
                  <div style={{ padding: '16px', fontSize: '12px', color: '#64748B', textAlign: 'center' }}>
                    Loading notifications…
                  </div>
                )}

                {unreadNotifications.length > 0 && (
                  <div style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94A3B8', padding: '4px 4px 6px' }}>
                      Unread
                    </div>
                    {unreadNotifications.slice(0, 6).map((item) => (
                      <button
                        key={`notif-${item.id}`}
                        type="button"
                        role="menuitem"
                        onClick={() => void handleMarkNotificationRead(item)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          border: 0,
                          background: '#EFF6FF',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          marginBottom: '6px',
                          cursor: 'pointer'
                        }}
                        title="Click to mark as read"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
                          <span style={{ fontWeight: 700, fontSize: '12px', color: '#1E293B' }}>{item.title}</span>
                          <span style={{ fontSize: '10px', color: '#64748B', whiteSpace: 'nowrap' }}>
                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                          </span>
                        </div>
                        {item.body && <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px', lineHeight: 1.4 }}>{item.body}</div>}
                      </button>
                    ))}
                  </div>
                )}

                {!notificationsLoading && notificationsList.length === 0 && (
                  <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '12px', color: '#64748B' }}>
                    You have no notifications right now.
                  </div>
                )}

                {!notificationsLoading && notificationsList.length > 0 && unreadNotifications.length === 0 && (
                  <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#64748B' }}>
                    You're all caught up!
                  </div>
                )}

                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '8px', marginTop: '4px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setNotificationsOpen(false);
                      navigateTo('notifications');
                    }}
                    style={{
                      border: 0,
                      background: 'transparent',
                      color: '#2563EB',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '4px 8px'
                    }}
                  >
                    View All Notifications &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            className="user-profile-badge"
            style={{ cursor: 'pointer' }}
            onClick={() => navigateTo('profile')}
            title="Open Profile"
          >
            <div className="user-avatar">{teacherName.charAt(0).toUpperCase()}</div>
            <div className="user-details">
              <div className="user-name">{teacherName}</div>
              <div className="user-role-label">Teacher ({teacherUsername})</div>
            </div>
          </div>

          <button type="button" className="topbar-logout-btn" onClick={onLogout}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      {/* 2. BODY LAYOUT */}
      <div className="teacher-layout">
        {/* SIDEBAR NAVIGATION - 6 EXISTING IN ORDER, THEN 9 NEW IN ORDER */}
        <aside className="teacher-sidebar">
          <nav className="sidebar-nav">
            <div className="sidebar-nav-title">Teacher Navigation</div>

            {/* 1. Dashboard */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => navigateTo('dashboard')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span>1. Dashboard</span>
            </button>

            {/* 2. Attendance */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
              onClick={() => navigateTo('attendance')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span>2. Attendance</span>
            </button>

            {/* 3. Marks Entry */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'marks' ? 'active' : ''}`}
              onClick={() => navigateTo('marks')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>3. Marks Entry</span>
            </button>

            {/* 4. Teacher Reports */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => navigateTo('reports')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>4. Teacher Reports</span>
            </button>

            {/* 5. My Classes */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'classes' ? 'active' : ''}`}
              onClick={() => navigateTo('classes')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>5. My Classes ({assignedClasses.length})</span>
            </button>

            {/* 6. Timetable */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'timetable' ? 'active' : ''}`}
              onClick={() => navigateTo('timetable')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>6. Timetable</span>
            </button>

            <div className="sidebar-nav-title" style={{ marginTop: '16px' }}>Extended Services</div>

            {/* 7. My Subjects */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'subjects' ? 'active' : ''}`}
              onClick={() => navigateTo('subjects')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>7. My Subjects</span>
            </button>

            {/* 8. Assignments & Assessments */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'assessments' ? 'active' : ''}`}
              onClick={() => navigateTo('assessments')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>8. Assignments &amp; Tests</span>
            </button>

            {/* 9. Lessons & Materials */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'lessons' ? 'active' : ''}`}
              onClick={() => navigateTo('lessons')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>9. Lessons &amp; Materials</span>
            </button>

            {/* 10. Student Welfare */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'welfare' ? 'active' : ''}`}
              onClick={() => navigateTo('welfare')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>10. Welfare &amp; Behavior</span>
            </button>

            {/* 11. Communication */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'communication' ? 'active' : ''}`}
              onClick={() => navigateTo('communication')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>11. Communication</span>
            </button>

            {/* 12. Requests & Approvals */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'requests' ? 'active' : ''}`}
              onClick={() => navigateTo('requests')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>12. Requests &amp; Approvals</span>
            </button>

            {/* 13. Leave & Staff Services */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'leave' ? 'active' : ''}`}
              onClick={() => navigateTo('leave')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>13. Leave &amp; Staff (v2)</span>
            </button>

            {/* 14. My Profile */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => navigateTo('profile')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>14. My Profile</span>
            </button>
          </nav>

          <div className="sidebar-footer-card">
            <h4>Assigned Stream</h4>
            <p>{currentClassInfo ? `${currentClassInfo.grade_name} ${currentClassInfo.stream !== 'none' ? currentClassInfo.stream.replace('_', ' ') : ''}` : 'General Curriculum'}</p>
            <p style={{ marginTop: '4px', color: '#1F3A5F', fontWeight: 600 }}>
              {currentClassInfo ? `${currentClassInfo.subject_name} (${currentClassInfo.subject_code})` : 'Faculty Department'}
            </p>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="teacher-content">
          {apiError && (
            <div className="alert-banner alert-danger" style={{ marginBottom: '20px' }}>
              <span>⚠️ {apiError}</span>
            </div>
          )}

          {toastMessage && (
            <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#1F3A5F', color: '#FFFFFF', padding: '12px 20px', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 9999, fontWeight: 600 }}>
              {toastMessage}
            </div>
          )}

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
              <div className="spinner" style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '28px', height: '28px' }}></div>
              <p>Fetching real database records from MySQL...</p>
            </div>
          ) : activeTab === 'not_found' ? (
            /* 404 NOT FOUND SHARED VIEW */
            <TeacherNotFound onGoHome={() => navigateTo('dashboard')} />
          ) : (
            <>
              {/* ============================================================== */}
              {/* 1. DASHBOARD OVERVIEW (/teacher/dashboard) */}
              {/* ============================================================== */}
              {activeTab === 'dashboard' && (
                <div>
                  {/* TOP HEADER WITH LIVE CLOCK */}
                  <div className="page-header-row" style={{ alignItems: 'center' }}>
                    <div>
                      <div className="page-breadcrumb">
                        <span>Teacher Portal</span> / <span>Command Center</span>
                      </div>
                      <h2 className="page-title">Welcome back, {teacherName}</h2>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#1F3A5F',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}>
                        <span>📅 {currentDateTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <span style={{ color: '#CBD5E1' }}>•</span>
                        <span style={{ color: '#2A7F62', fontWeight: 700 }}>
                          ⏰ {currentDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={loadInitialData}
                        title="Sync with live database"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        🔄 Refresh Data
                      </button>
                    </div>
                  </div>

                  {/* 1. REAL-TIME LIVE CLASSROOM & PERIOD TRACKER BANNER */}
                  <div className="live-class-banner">
                    {livePeriodStatus.type === 'active' ? (
                      <>
                        <div style={{ flex: '1 1 300px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span className="live-beacon-green"></span>
                            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#4ADE80' }}>
                              CURRENTLY IN SESSION • ENDS IN {livePeriodStatus.minsLeft} MIN
                            </span>
                          </div>
                          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.3px' }}>
                            {livePeriodStatus.slot.subject_name} — {livePeriodStatus.slot.section_name} ({livePeriodStatus.slot.grade_name})
                          </h3>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '8px', fontSize: '13px', color: '#94A3B8' }}>
                            <span>📍 <strong>Room {livePeriodStatus.slot.room_name}</strong> ({livePeriodStatus.slot.building || 'Main Campus'})</span>
                            <span>⏱ Slot: <strong>{livePeriodStatus.slot.slot_label}</strong> ({livePeriodStatus.slot.start_time?.substring(0, 5)} - {livePeriodStatus.slot.end_time?.substring(0, 5)})</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ background: '#22C55E', color: '#0F172A', fontWeight: 700, borderColor: '#22C55E' }}
                            onClick={() => {
                              setSelectedSectionId(livePeriodStatus.slot.section_id);
                              setAttSubjectId(livePeriodStatus.slot.subject_id);
                              navigateTo('attendance');
                            }}
                          >
                            ⚡ Instant Roll Call &rarr;
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.25)' }}
                            onClick={() => {
                              setSelectedSectionId(livePeriodStatus.slot.section_id);
                              navigateTo('classes');
                            }}
                          >
                            👥 Class Roster
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.25)' }}
                            onClick={() => setDashboardPerspective('scratchpad')}
                          >
                            📝 Lesson Notes
                          </button>
                        </div>
                      </>
                    ) : livePeriodStatus.type === 'upcoming' ? (
                      <>
                        <div style={{ flex: '1 1 300px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span className="live-beacon-amber"></span>
                            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#FBBF24' }}>
                              PASSING / PREP PERIOD • NEXT CLASS IN {livePeriodStatus.minsUntil} MIN
                            </span>
                          </div>
                          <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#FFFFFF' }}>
                            Next: {livePeriodStatus.nextSlot.subject_name} — {livePeriodStatus.nextSlot.section_name} ({livePeriodStatus.nextSlot.grade_name})
                          </h3>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '8px', fontSize: '13px', color: '#94A3B8' }}>
                            <span>📍 <strong>Room {livePeriodStatus.nextSlot.room_name}</strong></span>
                            <span>⏱ Starts at: <strong>{livePeriodStatus.nextSlot.start_time?.substring(0, 5)}</strong> (Slot: {livePeriodStatus.nextSlot.slot_label})</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ background: 'rgba(255,255,255,0.15)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.3)' }}
                            onClick={() => {
                              setSelectedSectionId(livePeriodStatus.nextSlot.section_id);
                              setAttSubjectId(livePeriodStatus.nextSlot.subject_id);
                              navigateTo('attendance');
                            }}
                          >
                            📋 Prep Attendance Sheet
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ background: 'rgba(255,255,255,0.15)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.3)' }}
                            onClick={() => navigateTo('lessons')}
                          >
                            📖 Teaching Materials
                          </button>
                        </div>
                      </>
                    ) : livePeriodStatus.type === 'completed' ? (
                      <>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#38BDF8' }}>
                            ✓ DAILY TEACHING PERIODS COMPLETE
                          </span>
                          <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: '#FFFFFF' }}>
                            All classroom periods finished for today
                          </h3>
                          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94A3B8' }}>
                            You have completed today's scheduled classes. Great job! Use this time for marks entry and parent communication.
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ background: 'rgba(255,255,255,0.15)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.3)' }}
                            onClick={() => navigateTo('marks')}
                          >
                            📊 Input &amp; Grade Marks
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ background: 'rgba(255,255,255,0.15)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.3)' }}
                            onClick={() => navigateTo('timetable')}
                          >
                            📅 Full Week Timetable
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#94A3B8' }}>
                            NO CLASS PERIODS SCHEDULED FOR TODAY
                          </span>
                          <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: '#FFFFFF' }}>
                            Dedicated Planning &amp; Preparation Day
                          </h3>
                          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#94A3B8' }}>
                            No classroom teaching slots in timetable for today. Prepare curriculum or review assessments.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ background: 'rgba(255,255,255,0.15)', color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.3)' }}
                          onClick={() => navigateTo('timetable')}
                        >
                          📅 View Timetable &rarr;
                        </button>
                      </>
                    )}
                  </div>

                  {/* 2. PERSPECTIVE SWITCHER TABS */}
                  <div className="dash-perspective-nav">
                    <button
                      type="button"
                      className={`dash-perspective-btn ${dashboardPerspective === 'today' ? 'active' : ''}`}
                      onClick={() => setDashboardPerspective('today')}
                    >
                      <span>📋 1. Today's Command Hub</span>
                    </button>

                    <button
                      type="button"
                      className={`dash-perspective-btn ${dashboardPerspective === 'pulse' ? 'active' : ''}`}
                      onClick={() => setDashboardPerspective('pulse')}
                    >
                      <span>📊 2. Class Pulse &amp; Comparison ({assignedClasses.length} Classes)</span>
                    </button>

                    <button
                      type="button"
                      className={`dash-perspective-btn ${dashboardPerspective === 'homeroom' ? 'active' : ''}`}
                      onClick={() => setDashboardPerspective('homeroom')}
                    >
                      <span>🏫 3. Homeroom Hub {homeroomSection ? `(${homeroomSection.name})` : ''}</span>
                    </button>

                    <button
                      type="button"
                      className={`dash-perspective-btn ${dashboardPerspective === 'scratchpad' ? 'active' : ''}`}
                      onClick={() => setDashboardPerspective('scratchpad')}
                    >
                      <span>📝 4. Daily Lesson Scratchpad</span>
                    </button>
                  </div>

                  {/* 3. PERSPECTIVE TAB 1: TODAY'S COMMAND HUB */}
                  {dashboardPerspective === 'today' && (
                    <>
                      {/* ENHANCED PRO STAT CARDS */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <div className="stat-card-pro">
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Assigned Teaching Load</span>
                              <span className="badge-solid badge-blue">{assignedClasses.length} Active</span>
                            </div>
                            <div style={{ fontSize: '26px', fontWeight: 800, color: '#1F3A5F', margin: '6px 0 2px' }}>
                              {totalEnrolledStudents} Students
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                              Across {extendedData?.overview?.assignedSections || assignedClasses.length} class sections
                            </div>
                          </div>
                          <div className="stat-progress-bar-bg">
                            <div className="stat-progress-bar-fill" style={{ width: '100%', background: '#2E6DA4' }}></div>
                          </div>
                        </div>

                        <div className="stat-card-pro">
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Today's Attendance</span>
                              <span className={`badge-solid ${(extendedData?.overview?.attendanceTasksDueCount || 0) > 0 ? 'badge-amber' : 'badge-emerald'}`}>
                                {(extendedData?.overview?.attendanceTasksDueCount || 0) > 0 ? `${extendedData?.overview?.attendanceTasksDueCount} Due` : 'All Done'}
                              </span>
                            </div>
                            <div style={{ fontSize: '26px', fontWeight: 800, color: (extendedData?.overview?.attendanceTasksDueCount || 0) > 0 ? '#B7791F' : '#2A7F62', margin: '6px 0 2px' }}>
                              {(extendedData?.overview?.attendanceTasksDueCount || 0) > 0 ? `${extendedData?.overview?.attendanceTasksDueCount} Classes Pending` : '100% Recorded'}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                              {extendedData?.overview?.todayAttendanceRecorded || 0} session(s) logged in database
                            </div>
                          </div>
                          <div className="stat-progress-bar-bg">
                            <div
                              className="stat-progress-bar-fill"
                              style={{
                                width: (extendedData?.overview?.attendanceTasksDueCount || 0) > 0 ? '50%' : '100%',
                                background: (extendedData?.overview?.attendanceTasksDueCount || 0) > 0 ? '#F59E0B' : '#10B981'
                              }}
                            ></div>
                          </div>
                        </div>

                        <div className="stat-card-pro">
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Marks &amp; Grading Queue</span>
                              <span className="badge-solid badge-purple">Tests</span>
                            </div>
                            <div style={{ fontSize: '26px', fontWeight: 800, color: '#1F3A5F', margin: '6px 0 2px' }}>
                              {extendedData?.overview?.marksAwaitingCount || 0} Awaiting
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                              Draft assessments or unsubmitted grades
                            </div>
                          </div>
                          <div className="stat-progress-bar-bg">
                            <div className="stat-progress-bar-fill" style={{ width: '65%', background: '#8B5CF6' }}></div>
                          </div>
                        </div>

                        <div className="stat-card-pro">
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Approvals &amp; Requests</span>
                              <span className={`badge-solid ${(extendedData?.overview?.returnedCorrectionsCount || 0) > 0 ? 'badge-rose' : 'badge-slate'}`}>
                                {(extendedData?.overview?.returnedCorrectionsCount || 0) > 0 ? 'Action Needed' : 'Normal'}
                              </span>
                            </div>
                            <div style={{ fontSize: '26px', fontWeight: 800, color: (extendedData?.overview?.returnedCorrectionsCount || 0) > 0 ? '#C0392B' : '#1F3A5F', margin: '6px 0 2px' }}>
                              {extendedData?.overview?.returnedCorrectionsCount || 0} Returned
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                              Marks corrections &amp; attendance reviews
                            </div>
                          </div>
                          <div className="stat-progress-bar-bg">
                            <div
                              className="stat-progress-bar-fill"
                              style={{
                                width: (extendedData?.overview?.returnedCorrectionsCount || 0) > 0 ? '100%' : '20%',
                                background: (extendedData?.overview?.returnedCorrectionsCount || 0) > 0 ? '#EF4444' : '#64748B'
                              }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* TWO-COLUMN COMMAND CENTER LAYOUT */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(280px, 1fr)', gap: '20px', marginBottom: '24px' }}>
                        {/* LEFT COLUMN: INTERACTIVE TIMELINE & ALERTS */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          {/* TIMELINE WITH DYNAMIC HIGHLIGHTS */}
                          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1F3A5F' }}>
                                Today's Period Timeline &amp; Lessons
                              </h3>
                              <button type="button" className="btn-secondary btn-sm" onClick={() => navigateTo('timetable')}>
                                Full Week View &rarr;
                              </button>
                            </div>

                            {!extendedData?.todayTimetable || extendedData.todayTimetable.length === 0 ? (
                              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748B' }}>
                                <p style={{ margin: 0, fontSize: '14px' }}>No teaching periods scheduled for today.</p>
                                <span style={{ fontSize: '12px', color: '#94A3B8' }}>Check your full weekly schedule in the Timetable tab.</span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {extendedData.todayTimetable.map((t: any) => {
                                  const now = currentDateTime;
                                  const currentSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
                                  const parseSec = (str: string) => {
                                    if (!str) return 0;
                                    const p = str.split(':').map(Number);
                                    return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
                                  };
                                  const sSec = parseSec(t.start_time);
                                  const eSec = parseSec(t.end_time);
                                  const isCurrent = currentSec >= sSec && currentSec < eSec;
                                  const isPast = currentSec >= eSec;

                                  return (
                                    <div
                                      key={t.id}
                                      className={`timeline-slot-card ${isCurrent ? 'active-slot' : isPast ? 'past-slot' : ''}`}
                                    >
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <div style={{ fontWeight: 700, color: isCurrent ? '#166534' : '#1F3A5F', fontSize: '14px' }}>
                                            {t.subject_name} • {t.section_name} ({t.grade_name})
                                          </div>
                                          {isCurrent && (
                                            <span className="badge-solid badge-emerald" style={{ fontSize: '10px' }}>
                                              🟢 Live Now
                                            </span>
                                          )}
                                          {isPast && (
                                            <span style={{ fontSize: '11px', color: '#64748B' }}>✓ Done</span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                                          Room {t.room_name} ({t.building || 'Main'}) • Period: {t.slot_label}
                                        </div>
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className="counter-pill counter-present" style={{ fontSize: '12px', fontWeight: 600 }}>
                                          {t.start_time?.substring(0, 5)} - {t.end_time?.substring(0, 5)}
                                        </span>
                                        <button
                                          type="button"
                                          className="btn-secondary btn-sm"
                                          onClick={() => {
                                            setSelectedSectionId(t.section_id);
                                            setAttSubjectId(t.subject_id);
                                            navigateTo('attendance');
                                          }}
                                          title="Open attendance for this section"
                                        >
                                          Roll Call
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* ATTENDANCE TASKS DUE ALERT */}
                          {extendedData?.attendanceTasksDue && extendedData.attendanceTasksDue.length > 0 && (
                            <div style={{ background: '#FEF7EC', border: '1px solid #FBD38D', borderRadius: '12px', padding: '18px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <h4 style={{ margin: 0, color: '#B7791F', fontSize: '15px', fontWeight: 700 }}>
                                  ⚠️ Attendance Due for Today
                                </h4>
                                <span className="badge-solid badge-amber">{extendedData.attendanceTasksDue.length} Classes</span>
                              </div>
                              <p style={{ fontSize: '13px', color: '#744210', margin: '0 0 12px' }}>
                                Attendance records have not been finalized for these assigned sections today:
                              </p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {extendedData.attendanceTasksDue.map((task: any) => (
                                  <button
                                    key={`${task.section_id}-${task.subject_id}`}
                                    type="button"
                                    className="btn-primary btn-sm"
                                    onClick={() => {
                                      setSelectedSectionId(task.section_id);
                                      setAttSubjectId(task.subject_id);
                                      navigateTo('attendance');
                                    }}
                                  >
                                    Take {task.section_name} ({task.subject_name}) &rarr;
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* RETURNED CORRECTIONS ALERT */}
                          {extendedData?.returnedCorrections && extendedData.returnedCorrections.length > 0 && (
                            <div style={{ background: '#FDF0EE', border: '1px solid #FECACA', borderRadius: '12px', padding: '18px' }}>
                              <h4 style={{ margin: '0 0 8px', color: '#C0392B', fontSize: '15px', fontWeight: 700 }}>
                                ⚠️ Returned / Rejected Approval Requests
                              </h4>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {extendedData.returnedCorrections.map((r: any) => (
                                  <div key={r.id} style={{ fontSize: '13px', color: '#7F1D1D' }}>
                                    <strong>{r.type.replace(/_/g, ' ')}:</strong> {r.decision_note || r.reason}
                                  </div>
                                ))}
                              </div>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                style={{ marginTop: '12px' }}
                                onClick={() => navigateTo('requests')}
                              >
                                Review All Requests &rarr;
                              </button>
                            </div>
                          )}
                        </div>

                        {/* RIGHT COLUMN: SPEED DIAL & NOTICES */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          {/* FACULTY RAPID SPEED DIAL */}
                          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                            <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 700, color: '#1F3A5F' }}>
                              ⚡ Faculty Quick Actions
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <button type="button" className="quick-dial-btn" onClick={() => navigateTo('attendance')}>
                                <span>📝</span>
                                <span>Record Daily Attendance</span>
                              </button>
                              <button type="button" className="quick-dial-btn" onClick={() => navigateTo('marks')}>
                                <span>📊</span>
                                <span>Input &amp; Submit Assessment Marks</span>
                              </button>
                              <button type="button" className="quick-dial-btn" onClick={() => navigateTo('assessments')}>
                                <span>✏️</span>
                                <span>Publish Homework Assignment</span>
                              </button>
                              <button type="button" className="quick-dial-btn" onClick={() => navigateTo('communication')}>
                                <span>💬</span>
                                <span>Contact Student Guardians</span>
                              </button>
                              <button type="button" className="quick-dial-btn" onClick={() => navigateTo('welfare')}>
                                <span>🚨</span>
                                <span>Log Student Behavior Incident</span>
                              </button>
                              <button type="button" className="quick-dial-btn" onClick={() => navigateTo('leave')}>
                                <span>🏖️</span>
                                <span>Submit Staff Leave Request</span>
                              </button>
                            </div>
                          </div>

                          {/* UPCOMING ACADEMIC DEADLINES */}
                          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 700, color: '#1F3A5F' }}>
                              Academic Deadlines &amp; Events
                            </h3>
                            {(!extendedData?.calendarEvents || extendedData.calendarEvents.length === 0) &&
                             (!extendedData?.upcomingDeadlines || extendedData.upcomingDeadlines.length === 0) ? (
                              <p style={{ color: '#64748B', fontSize: '13px', margin: 0 }}>No upcoming deadlines or school holidays logged.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {extendedData?.upcomingDeadlines?.map((d: any) => (
                                  <div key={d.id} style={{ borderLeft: '3px solid #2E6DA4', paddingLeft: '10px' }}>
                                    <div style={{ fontWeight: 600, color: '#1F3A5F', fontSize: '13px' }}>
                                      Homework Due: {d.title} ({d.section_name})
                                    </div>
                                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                                      Due: {new Date(d.due_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                ))}
                                {extendedData?.calendarEvents?.map((ev: any) => (
                                  <div key={ev.id} style={{ borderLeft: '3px solid #B7791F', paddingLeft: '10px' }}>
                                    <div style={{ fontWeight: 600, color: '#1F3A5F', fontSize: '13px' }}>
                                      {ev.title} ({ev.event_type?.toUpperCase()})
                                    </div>
                                    <span style={{ fontSize: '11px', color: '#64748B' }}>
                                      {new Date(ev.start_date).toLocaleDateString()} - {new Date(ev.end_date).toLocaleDateString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* SCHOOL ANNOUNCEMENTS FEED */}
                          {announcements && announcements.length > 0 && (
                            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1F3A5F' }}>
                                  📢 School Notices &amp; Circulars
                                </h3>
                                <button type="button" className="btn-secondary btn-sm" onClick={() => navigateTo('notifications')}>
                                  All &rarr;
                                </button>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {announcements.slice(0, 3).map((a: any) => (
                                  <div key={a.id} style={{ padding: '8px 10px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#1F3A5F' }}>{a.title}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                                      {new Date(a.created_at).toLocaleDateString()}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* 4. PERSPECTIVE TAB 2: CLASS PULSE & COMPARISON */}
                  {dashboardPerspective === 'pulse' && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1F3A5F' }}>
                            Class Performance &amp; Roster Pulse
                          </h3>
                          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748B' }}>
                            Live overview across all your {assignedClasses.length} assigned sections and enrolled students.
                          </p>
                        </div>
                        <button type="button" className="btn-secondary btn-sm" onClick={() => navigateTo('classes')}>
                          Inspect Detailed Rosters &rarr;
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        {assignedClasses.map((c) => {
                          const cap = c.capacity || 40;
                          const ratio = Math.min(100, Math.round(((c.student_count || 0) / cap) * 100));

                          return (
                            <div key={`${c.section_id}-${c.subject_id}`} className="class-pulse-card">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  <span className="badge-solid badge-blue" style={{ marginBottom: '4px' }}>
                                    {c.grade_name} • {c.stream !== 'none' ? c.stream.toUpperCase() : 'GENERAL'}
                                  </span>
                                  <h4 style={{ margin: '4px 0 2px', fontSize: '16px', fontWeight: 700, color: '#1F3A5F' }}>
                                    {c.section_name}
                                  </h4>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#2E6DA4' }}>
                                    {c.subject_name} ({c.subject_code})
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#1F3A5F' }}>
                                    {c.student_count || 0}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#64748B' }}>Enrolled</div>
                                </div>
                              </div>

                              <div style={{ marginTop: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
                                  <span>Room Capacity</span>
                                  <span>{c.student_count} / {cap} ({ratio}%)</span>
                                </div>
                                <div className="stat-progress-bar-bg" style={{ marginTop: 0 }}>
                                  <div
                                    className="stat-progress-bar-fill"
                                    style={{
                                      width: `${ratio}%`,
                                      background: ratio > 90 ? '#E11D48' : '#2A7F62'
                                    }}
                                  ></div>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' }}>
                                <button
                                  type="button"
                                  className="btn-primary btn-sm"
                                  onClick={() => {
                                    setSelectedSectionId(c.section_id);
                                    setAttSubjectId(c.subject_id);
                                    navigateTo('attendance');
                                  }}
                                >
                                  Roll Call
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => {
                                    setMarksFilterSectionId(c.section_id);
                                    setMarksFilterSubjectId(c.subject_id);
                                    navigateTo('marks');
                                  }}
                                >
                                  Marks
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => {
                                    setSelectedSectionId(c.section_id);
                                    navigateTo('classes');
                                  }}
                                >
                                  Roster
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => navigateTo('assessments')}
                                >
                                  Homework
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 5. PERSPECTIVE TAB 3: HOMEROOM COMMAND CENTER */}
                  {dashboardPerspective === 'homeroom' && (
                    <div>
                      {homeroomSection ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                              <div>
                                <span className="badge-solid badge-purple" style={{ marginBottom: '6px' }}>
                                  Official Class Master / Form Tutor
                                </span>
                                <h3 style={{ margin: '4px 0', fontSize: '22px', fontWeight: 800, color: '#1F3A5F' }}>
                                  Homeroom Section: {homeroomSection.name} ({homeroomSection.grade_name || 'Standard'})
                                </h3>
                                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
                                  You are designated as the primary welfare and administrative custodian for this classroom cohort.
                                </p>
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={() => {
                                    setSelectedSectionId(homeroomSection.id);
                                    navigateTo('attendance');
                                  }}
                                >
                                  📝 Morning Roll Call
                                </button>
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => {
                                    setSelectedSectionId(homeroomSection.id);
                                    navigateTo('classes');
                                  }}
                                >
                                  👥 Homeroom Cohort Roster
                                </button>
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginTop: '20px' }}>
                              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '12px', color: '#64748B' }}>Homeroom Room</div>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1F3A5F' }}>
                                  {homeroomSection.room_name || 'Building Classroom'}
                                </div>
                              </div>
                              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '12px', color: '#64748B' }}>Curriculum Stream</div>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1F3A5F', textTransform: 'capitalize' }}>
                                  {homeroomSection.stream || 'Standard'}
                                </div>
                              </div>
                              <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <div style={{ fontSize: '12px', color: '#64748B' }}>Designated Capacity</div>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: '#1F3A5F' }}>
                                  {homeroomSection.capacity || 40} Desk Seats
                                </div>
                              </div>
                            </div>
                          </div>

                          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                            <h4 style={{ margin: '0 0 12px', fontSize: '15px', fontWeight: 700, color: '#1F3A5F' }}>
                              Class Master Pastoral Duties
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#F8FAFC', borderRadius: '8px' }}>
                                <div>
                                  <strong>Morning Attendance Registration</strong>
                                  <div style={{ fontSize: '12px', color: '#64748B' }}>Verify all homeroom students are accounted for before period 1 starts.</div>
                                </div>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => {
                                    setSelectedSectionId(homeroomSection.id);
                                    navigateTo('attendance');
                                  }}
                                >
                                  Open Sheet
                                </button>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#F8FAFC', borderRadius: '8px' }}>
                                <div>
                                  <strong>Broadcast Notice to Homeroom Guardians</strong>
                                  <div style={{ fontSize: '12px', color: '#64748B' }}>Notify parents regarding upcoming class events, excursions, or uniform guidelines.</div>
                                </div>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => navigateTo('communication')}
                                >
                                  Compose Notice
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '36px', textAlign: 'center' }}>
                          <span style={{ fontSize: '42px', display: 'block', marginBottom: '12px' }}>🏫</span>
                          <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#1F3A5F' }}>
                            No Homeroom Currently Assigned
                          </h3>
                          <p style={{ margin: '0 auto 18px', fontSize: '13px', color: '#64748B', maxWidth: '480px' }}>
                            You are currently serving as a Subject Specialist Teacher across your assigned classes. Form Tutor / Homeroom Master assignments are designated by the Academic Dean and Administration.
                          </p>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setDashboardPerspective('today')}
                          >
                            Return to Today's Hub &rarr;
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 6. PERSPECTIVE TAB 4: TEACHER'S DAILY SCRATCHPAD */}
                  {dashboardPerspective === 'scratchpad' && (
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1F3A5F' }}>
                            Teacher's Daily Lesson Scratchpad &amp; Notepad
                          </h3>
                          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#64748B' }}>
                            Instant auto-saving notepad for lesson thoughts, lab preparation, homework collection reminders, and quick notes.
                          </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {scratchpadSaved && (
                            <span style={{ fontSize: '12px', color: '#2A7F62', fontWeight: 600 }}>
                              ✓ Auto-saved to local browser storage
                            </span>
                          )}
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => handleScratchpadChange('')}
                          >
                            Clear Notes
                          </button>
                        </div>
                      </div>

                      <textarea
                        className="form-textarea"
                        style={{
                          width: '100%',
                          minHeight: '260px',
                          fontFamily: 'monospace',
                          fontSize: '14px',
                          lineHeight: '1.6',
                          padding: '16px',
                          borderRadius: '10px',
                          borderColor: '#CBD5E1',
                          background: '#F8FAFC'
                        }}
                        placeholder={`• Period 1: Remember to collect Grade 10 Math worksheet...\n• Period 3: Prepare lab experiment apparatus for Physics...\n• Call student's guardian regarding upcoming science fair...`}
                        value={scratchpadText}
                        onChange={(e) => handleScratchpadChange(e.target.value)}
                      />

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '12px', color: '#64748B' }}>
                        <span>Characters: {scratchpadText.length} • Lines: {scratchpadText.split('\n').length}</span>
                        <span>Auto-persisted in local device storage</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================== */}
              {/* 2. ATTENDANCE (/teacher/attendance) */}
              {/* ============================================================== */}
              {activeTab === 'attendance' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Teacher Portal</span> / <span>Classroom Management</span> / <span>Attendance</span>
                      </div>
                      <h2 className="page-title">Attendance Tracking &amp; History</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        className={`btn-${attSubView === 'record' ? 'primary' : 'secondary'}`}
                        onClick={() => setAttSubView('record')}
                      >
                        Record Today's Attendance
                      </button>
                      <button
                        type="button"
                        className={`btn-${attSubView === 'history' ? 'primary' : 'secondary'}`}
                        onClick={() => setAttSubView('history')}
                      >
                        Attendance History
                      </button>
                      <button
                        type="button"
                        className={`btn-${attSubView === 'repeated' ? 'primary' : 'secondary'}`}
                        onClick={() => setAttSubView('repeated')}
                      >
                        Chronic Absenteeism List
                      </button>
                    </div>
                  </div>

                  {attSubView === 'record' ? (
                    <div>
                      {/* TOOLBAR CONTROLS */}
                      <div className="filter-toolbar-card">
                        <div className="filter-group-row">
                          <div className="filter-item">
                            <label className="filter-label" htmlFor={attSubSelectId}>Subject:</label>
                            <select
                              id={attSubSelectId}
                              className="filter-select"
                              value={attSubjectId || ''}
                              onChange={(e) => setAttSubjectId(e.target.value ? Number(e.target.value) : null)}
                            >
                              <option value="">All Assigned Subjects</option>
                              {teacherSubjects.map((s) => (
                                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                              ))}
                            </select>
                          </div>

                          <div className="filter-item">
                            <label className="filter-label" htmlFor={attSectionId}>Section:</label>
                            <select
                              id={attSectionId}
                              className="filter-select"
                              value={selectedSectionId || ''}
                              onChange={(e) => setSelectedSectionId(Number(e.target.value))}
                            >
                              {availableAttSections.map((c) => (
                                <option key={`${c.section_id}-${c.subject_id}`} value={c.section_id}>
                                  {c.section_name} ({c.subject_name})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="filter-item">
                            <label className="filter-label" htmlFor={attDateId}>Date:</label>
                            <input
                              id={attDateId}
                              type="date"
                              className="filter-date-input"
                              value={attDate}
                              onChange={(e) => setAttDate(e.target.value)}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={markAllPresent}
                            disabled={attIsLocked}
                          >
                            Mark All Present
                          </button>
                          {attIsLocked && (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ borderColor: '#B7791F', color: '#B7791F' }}
                              onClick={() => setShowCorrectionModal(true)}
                            >
                              Request Correction &rarr;
                            </button>
                          )}
                        </div>
                      </div>

                      {/* ATTENDANCE TABLE */}
                      <div className="data-table-container">
                        <table className="spec-table">
                          <thead>
                            <tr>
                              <th style={{ width: '40px' }}>#</th>
                              <th style={{ width: '220px' }}>Student Name</th>
                              <th style={{ width: '80px', textAlign: 'center' }}>Present</th>
                              <th style={{ width: '80px', textAlign: 'center' }}>Absent</th>
                              <th style={{ width: '80px', textAlign: 'center' }}>Late</th>
                              <th style={{ width: '80px', textAlign: 'center' }}>Excused</th>
                              <th>Remarks</th>
                              <th style={{ width: '80px', textAlign: 'right' }}>Detail</th>
                            </tr>
                          </thead>
                          <tbody>
                            {attendanceList.length === 0 ? (
                              <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                                  No enrolled students found for this section.
                                </td>
                              </tr>
                            ) : (
                              attendanceList.map((student, idx) => (
                                <tr key={student.enrollmentId}>
                                  <td style={{ color: '#64748B', fontWeight: 600 }}>{idx + 1}</td>
                                  <td style={{ fontWeight: 600, color: '#1F3A5F' }}>
                                    {student.studentName}
                                    <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 400 }}>
                                      {student.admissionNo} • Roll: {student.rollNo}
                                    </span>
                                  </td>
                                  <td className="radio-cell">
                                    <input
                                      type="radio"
                                      name={`att_${student.enrollmentId}`}
                                      checked={student.statusCode === 'present'}
                                      onChange={() => handleStatusChange(student.enrollmentId, 'present')}
                                      disabled={attIsLocked}
                                      aria-label={`Mark ${student.studentName} as Present`}
                                    />
                                  </td>
                                  <td className="radio-cell">
                                    <input
                                      type="radio"
                                      name={`att_${student.enrollmentId}`}
                                      checked={student.statusCode === 'absent'}
                                      onChange={() => handleStatusChange(student.enrollmentId, 'absent')}
                                      disabled={attIsLocked}
                                      aria-label={`Mark ${student.studentName} as Absent`}
                                    />
                                  </td>
                                  <td className="radio-cell">
                                    <input
                                      type="radio"
                                      name={`att_${student.enrollmentId}`}
                                      checked={student.statusCode === 'late'}
                                      onChange={() => handleStatusChange(student.enrollmentId, 'late')}
                                      disabled={attIsLocked}
                                      aria-label={`Mark ${student.studentName} as Late`}
                                    />
                                  </td>
                                  <td className="radio-cell">
                                    <input
                                      type="radio"
                                      name={`att_${student.enrollmentId}`}
                                      checked={student.statusCode === 'excused'}
                                      onChange={() => handleStatusChange(student.enrollmentId, 'excused')}
                                      disabled={attIsLocked}
                                      aria-label={`Mark ${student.studentName} as Excused`}
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="text"
                                      className="table-input"
                                      placeholder="Add reason or remark..."
                                      value={student.note}
                                      onChange={(e) => handleRemarkChange(student.enrollmentId, e.target.value)}
                                      disabled={attIsLocked}
                                      aria-label={`Remarks for ${student.studentName}`}
                                    />
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <button
                                      type="button"
                                      className="btn-secondary btn-sm"
                                      onClick={() => handleOpenStudentDetail(student.studentId, student.studentName)}
                                    >
                                      History
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* SUMMARY BAR & SAVE BUTTON */}
                      <div className="table-summary-bar">
                        <div className="summary-counters">
                          <span>Summary:</span>
                          <span className="counter-pill counter-present">Present {counts.present}</span>
                          <span className="counter-pill counter-absent">Absent {counts.absent}</span>
                          <span className="counter-pill counter-late">Late {counts.late}</span>
                          <span className="counter-pill counter-excused">Excused {counts.excused}</span>
                        </div>

                        <div>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={handleSaveAttendance}
                            disabled={attIsLocked || attIsSaving || attendanceList.length === 0}
                          >
                            {attIsSaving ? 'Saving...' : attIsLocked ? '🔒 Session Locked' : 'Save Attendance to MySQL'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : attSubView === 'history' ? (
                    /* ATTENDANCE HISTORY VIEW */
                    <div className="data-table-container">
                      <table className="spec-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Date</th>
                            <th>Subject</th>
                            <th>Status</th>
                            <th>Total Enrolled</th>
                            <th>Present</th>
                            <th>Absent</th>
                            <th>Late</th>
                            <th>Excused</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendanceHistory.length === 0 ? (
                            <tr>
                              <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                                No historical sessions logged for this section.
                              </td>
                            </tr>
                          ) : (
                            attendanceHistory.map((s, idx) => (
                              <tr key={s.session_id}>
                                <td style={{ color: '#64748B' }}>{idx + 1}</td>
                                <td style={{ fontWeight: 700, color: '#1F3A5F' }}>
                                  {new Date(s.attendance_date).toLocaleDateString()}
                                </td>
                                <td>{s.subject_name || 'General Attendance'}</td>
                                <td>
                                  <span className={`status-badge status-${s.session_status}`}>
                                    {s.session_status?.toUpperCase()}
                                  </span>
                                </td>
                                <td>{s.total_records}</td>
                                <td style={{ color: '#2A7F62', fontWeight: 600 }}>{s.present_count}</td>
                                <td style={{ color: '#C0392B', fontWeight: 600 }}>{s.absent_count}</td>
                                <td>{s.late_count}</td>
                                <td>{s.excused_count}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* REPEATED ABSENCES LIST */
                    <div className="data-table-container">
                      <table className="spec-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Admission #</th>
                            <th>Student Full Name</th>
                            <th>Roll #</th>
                            <th>Total Absences</th>
                            <th>Latest Absence Date</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {repeatedAbsences.length === 0 ? (
                            <tr>
                              <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                                Excellent! No students in this section have accumulated 3 or more chronic absences.
                              </td>
                            </tr>
                          ) : (
                            repeatedAbsences.map((st, idx) => (
                              <tr key={st.student_id}>
                                <td style={{ color: '#64748B' }}>{idx + 1}</td>
                                <td style={{ fontWeight: 600 }}>{st.admission_no}</td>
                                <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{st.student_name}</td>
                                <td>{st.roll_no}</td>
                                <td>
                                  <span className="badge-solid badge-rose">
                                    {st.total_absences} ABSENCES
                                  </span>
                                </td>
                                <td>{new Date(st.last_absence_date).toLocaleDateString()}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    type="button"
                                    className="btn-secondary btn-sm"
                                    onClick={() => handleOpenStudentDetail(st.student_id, st.student_name)}
                                  >
                                    View Log &rarr;
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* CORRECTION REQUEST MODAL (TO APPROVALS QUEUE) */}
                  {showCorrectionModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
                      <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '500px', width: '95%', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 800, color: '#1F3A5F' }}>
                          Request Attendance Correction After Lock
                        </h3>
                        <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
                          Locked attendance records cannot be silently overwritten. Your request will be forwarded to the Principal / Administrator Approvals Queue with mandatory audit tracking.
                        </p>
                        <form onSubmit={handleRequestCorrectionSubmit}>
                          <label className="input-label" htmlFor="attReasonInput">Mandatory Reason / Justification</label>
                          <textarea
                            id="attReasonInput"
                            className="form-input"
                            rows={3}
                            placeholder="e.g. Student Elias brought official doctor's note for absence on this date..."
                            value={correctionReason}
                            onChange={(e) => setCorrectionReason(e.target.value)}
                            required
                          />
                          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowCorrectionModal(false)}>
                              Cancel
                            </button>
                            <button type="submit" className="btn-primary" disabled={isRequestingCorrection}>
                              {isRequestingCorrection ? 'Submitting...' : 'Submit to Approvals'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* STUDENT ATTENDANCE DETAIL DRILLDOWN MODAL */}
                  {studentDetailModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
                      <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '600px', width: '95%', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <h3 style={{ margin: 0, color: '#1F3A5F' }}>
                            Attendance Breakdown: {studentDetailModal.name}
                          </h3>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setStudentDetailModal(null)}>
                            Close
                          </button>
                        </div>
                        <table className="spec-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Status</th>
                              <th>Subject</th>
                              <th>Note</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentDetailRecords.length === 0 ? (
                              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px' }}>No records found.</td></tr>
                            ) : (
                              studentDetailRecords.map((r, i) => (
                                <tr key={i}>
                                  <td>{new Date(r.attendance_date).toLocaleDateString()}</td>
                                  <td>
                                    <span className={`badge-solid ${r.status_code === 'present' ? 'badge-emerald' : r.status_code === 'absent' ? 'badge-rose' : 'badge-amber'}`}>
                                      {r.status_code?.toUpperCase()}
                                    </span>
                                  </td>
                                  <td>{r.subject_name || 'General'}</td>
                                  <td style={{ fontSize: '12px' }}>{r.note || '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================== */}
              {/* 3. MARKS ENTRY (/teacher/marks) */}
              {/* ============================================================== */}
              {activeTab === 'marks' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Teacher Portal</span> / <span>Examinations</span> / <span>Marks Entry</span>
                      </div>
                      <h2 className="page-title">
                        {marksViewMode === 'entry' ? `Scoring Matrix: ${activeAssessment?.title}` : 'Marks Entry Matrix'}
                      </h2>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {marksViewMode === 'entry' ? (
                        <>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                              if (isDirtyMarks && !window.confirm('Discard unsaved marks?')) return;
                              setMarksViewMode('list');
                            }}
                          >
                            &larr; Back to Assessment List
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => selectedAssessmentId && handleOpenMissingMarks(selectedAssessmentId)}
                          >
                            Missing Marks Checker
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => selectedAssessmentId && handleOpenMarksHistory(selectedAssessmentId)}
                          >
                            Change Audit History
                          </button>
                        </>
                      ) : (
                        <button type="button" className="btn-primary" onClick={() => setShowCreateModal(true)}>
                          + Create Assessment
                        </button>
                      )}
                    </div>
                  </div>

                  {marksViewMode === 'list' ? (
                    <div>
                      {/* FILTER TOOLBAR */}
                      <div className="filter-toolbar-card" style={{ marginBottom: '20px' }}>
                        <div className="filter-group-row">
                          <div className="filter-item">
                            <label className="filter-label" htmlFor={marksSubjectFilterId}>Subject:</label>
                            <select
                              id={marksSubjectFilterId}
                              className="filter-select"
                              value={marksFilterSubjectId || ''}
                              onChange={(e) => setMarksFilterSubjectId(e.target.value ? Number(e.target.value) : null)}
                            >
                              <option value="">All Assigned Subjects</option>
                              {teacherSubjects.map((s) => (
                                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                              ))}
                            </select>
                          </div>

                          <div className="filter-item">
                            <label className="filter-label" htmlFor={marksSectionFilterId}>Section:</label>
                            <select
                              id={marksSectionFilterId}
                              className="filter-select"
                              value={marksFilterSectionId || ''}
                              onChange={(e) => setMarksFilterSectionId(e.target.value ? Number(e.target.value) : null)}
                            >
                              <option value="">All Assigned Sections</option>
                              {availableMarksSections.map((c) => (
                                <option key={`${c.section_id}-${c.subject_id}`} value={c.section_id}>
                                  {c.section_name} ({c.subject_name})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="filter-item">
                            <label className="filter-label" htmlFor={marksTermFilterId}>Term:</label>
                            <select
                              id={marksTermFilterId}
                              className="filter-select"
                              value={marksFilterTermId || ''}
                              onChange={(e) => setMarksFilterTermId(e.target.value ? Number(e.target.value) : null)}
                            >
                              <option value="">All Terms</option>
                              {terms.map((t) => (
                                <option key={t.id} value={t.id}>{t.name} {t.is_active ? '(Active)' : ''}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* ASSESSMENT TABLE */}
                      <div className="data-table-container">
                        <table className="spec-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Assessment Title</th>
                              <th>Subject</th>
                              <th>Section</th>
                              <th>Term</th>
                              <th style={{ textAlign: 'center' }}>Max Score</th>
                              <th style={{ textAlign: 'center' }}>Weight</th>
                              <th>Date</th>
                              <th style={{ textAlign: 'center' }}>Submission Status</th>
                              <th style={{ textAlign: 'right' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {isAssessmentsLoading ? (
                              <tr>
                                <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                                  Loading assessments from database...
                                </td>
                              </tr>
                            ) : assessments.length === 0 ? (
                              <tr>
                                <td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                                  No assessments found. Click "+ Create Assessment" to register a test for your students.
                                </td>
                              </tr>
                            ) : (
                              assessments.map((a, idx) => {
                                const status = a.marks_submission_status || a.status || 'draft';
                                return (
                                  <tr key={a.id}>
                                    <td style={{ color: '#64748B' }}>{idx + 1}</td>
                                    <td>
                                      <div style={{ fontWeight: 700, color: '#1F3A5F' }}>{a.title}</div>
                                      <span style={{ fontSize: '11px', color: '#64748B' }}>{a.assessment_type_name || 'Test'}</span>
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{a.subject_name}</td>
                                    <td>{a.section_name}</td>
                                    <td>{a.term_name || 'Active Term'}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#1F3A5F' }}>{a.max_score}</td>
                                    <td style={{ textAlign: 'center' }}>{a.weight}%</td>
                                    <td style={{ fontSize: '12px', color: '#64748B' }}>
                                      {a.assessment_date ? new Date(a.assessment_date).toLocaleDateString() : '—'}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      <span className={`status-badge status-${status}`}>
                                        {status.toUpperCase()}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      <button
                                        type="button"
                                        className="btn-primary btn-sm"
                                        onClick={() => handleOpenAssessment(a)}
                                      >
                                        Enter Marks &rarr;
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    /* SCORING ENTRY GRID */
                    <div>
                      <div className="filter-toolbar-card" style={{ marginBottom: '16px' }}>
                        <div>
                          <strong>{activeAssessment?.subject_name}</strong> • {activeAssessment?.section_name} • Max Mark: <strong>{activeAssessment?.max_score}</strong>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleSaveMarks('draft')}
                            disabled={marksIsSaving}
                          >
                            Save Draft
                          </button>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => handleSaveMarks('submitted')}
                            disabled={marksIsSaving}
                          >
                            Submit for Approval
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ borderColor: '#B7791F', color: '#B7791F' }}
                            onClick={() => setShowMarkCorrectionModal(true)}
                          >
                            Request Mark Correction
                          </button>
                        </div>
                      </div>

                      <div className="data-table-container">
                        <table className="spec-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Student Name</th>
                              <th>Score (0–{activeAssessment?.max_score || 100})</th>
                              <th>Feedback</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {marksList.map((st, idx) => (
                              <tr key={st.enrollmentId}>
                                <td style={{ color: '#64748B' }}>{idx + 1}</td>
                                <td style={{ fontWeight: 600, color: '#1F3A5F' }}>
                                  {st.studentName}
                                  <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 400 }}>
                                    {st.admissionNo} • Roll: {st.rollNo}
                                  </span>
                                </td>
                                <td style={{ width: '140px' }}>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max={activeAssessment?.max_score || 100}
                                    className="form-input"
                                    value={st.score}
                                    onChange={(e) => handleScoreChange(st.enrollmentId, e.target.value)}
                                    placeholder="Enter score"
                                  />
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Qualitative remark..."
                                    value={st.feedback}
                                    onChange={(e) => handleFeedbackChange(st.enrollmentId, e.target.value)}
                                  />
                                </td>
                                <td>
                                  <span className={`status-badge status-${st.status}`}>
                                    {st.status.toUpperCase()}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* MARK CORRECTION MODAL */}
                  {showMarkCorrectionModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
                      <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '500px', width: '95%' }}>
                        <h3 style={{ margin: '0 0 12px', fontSize: '18px', fontWeight: 800, color: '#1F3A5F' }}>
                          Submit Mark Correction Request
                        </h3>
                        <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
                          Post-submission or locked grade adjustments require Principal / Head of Department authorization.
                        </p>
                        <form onSubmit={handleMarkCorrectionSubmit}>
                          <label className="input-label" htmlFor="markReasonInput">Justification / Reason for Score Change</label>
                          <textarea
                            id="markReasonInput"
                            className="form-input"
                            rows={3}
                            placeholder="e.g. Recount of Question 4 marks indicated additional 3 marks awarded..."
                            value={markCorrectionReason}
                            onChange={(e) => setMarkCorrectionReason(e.target.value)}
                            required
                          />
                          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setShowMarkCorrectionModal(false)}>
                              Cancel
                            </button>
                            <button type="submit" className="btn-primary" disabled={isRequestingMarkCorrection}>
                              {isRequestingMarkCorrection ? 'Submitting...' : 'Send Request'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* MARKS AUDIT HISTORY MODAL */}
                  {showMarksHistoryModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
                      <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '700px', width: '95%', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <h3 style={{ margin: 0, color: '#1F3A5F' }}>Assessment Marks Change History (Read-Only)</h3>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowMarksHistoryModal(false)}>
                            Close
                          </button>
                        </div>
                        <table className="spec-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Student</th>
                              <th>Old Score</th>
                              <th>New Score</th>
                              <th>Reason</th>
                              <th>Approver</th>
                            </tr>
                          </thead>
                          <tbody>
                            {marksHistoryList.length === 0 ? (
                              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px' }}>No revision records in marks_history.</td></tr>
                            ) : (
                              marksHistoryList.map((h, i) => (
                                <tr key={i}>
                                  <td style={{ fontSize: '12px' }}>{new Date(h.changed_at).toLocaleDateString()}</td>
                                  <td>{h.student_name}</td>
                                  <td style={{ color: '#C0392B' }}>{h.old_score ?? '—'}</td>
                                  <td style={{ color: '#2A7F62', fontWeight: 700 }}>{h.new_score}</td>
                                  <td style={{ fontSize: '12px' }}>{h.reason}</td>
                                  <td style={{ fontSize: '12px' }}>{h.approved_by_user || 'Pending'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* MISSING MARKS CHECKER MODAL */}
                  {showMissingModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
                      <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '500px', width: '95%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <h3 style={{ margin: 0, color: '#1F3A5F' }}>Students with Missing Marks</h3>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowMissingModal(false)}>
                            Close
                          </button>
                        </div>
                        {missingMarksList.length === 0 ? (
                          <p style={{ color: '#2A7F62', fontWeight: 600 }}>All enrolled students have scores recorded!</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {missingMarksList.map((st) => (
                              <div key={st.student_id} style={{ padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>{st.student_name} ({st.admission_no})</span>
                                <span style={{ color: '#C0392B', fontWeight: 600 }}>Missing Score</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================== */}
              {/* 4. TEACHER REPORTS (/teacher/reports) */}
              {/* ============================================================== */}
              {activeTab === 'reports' && (
                <TeacherReports
                  teacherSubjects={teacherSubjects}
                  assignedClasses={assignedClasses}
                  onShowToast={showToast}
                />
              )}

              {/* ============================================================== */}
              {/* 5. MY CLASSES (/teacher/classes) */}
              {/* ============================================================== */}
              {activeTab === 'classes' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Teacher Portal</span> / <span>Academics</span> / <span>My Classes</span>
                      </div>
                      <h2 className="page-title">Authorized Classes &amp; Rosters</h2>
                    </div>
                  </div>

                  {/* HOMEROOM BANNER & DUTIES */}
                  {homeroomSection && (
                    <div style={{ background: '#EAF1F8', border: '1px solid #BFDBFE', borderRadius: '12px', padding: '18px 22px', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#1F3A5F', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            ★ Assigned Homeroom Class (Class Teacher)
                          </div>
                          <h3 style={{ margin: '4px 0 0', color: '#1F3A5F', fontSize: '17px', fontWeight: 800 }}>
                            {homeroomSection.grade_name} — Section {homeroomSection.section_name} ({homeroomSection.active_students} Enrolled Students)
                          </h3>
                        </div>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => handleOpenClassDetail(homeroomSection.id)}
                        >
                          Inspect Homeroom Roster &rarr;
                        </button>
                      </div>
                      <div style={{ fontSize: '12px', color: '#334155', background: 'rgba(255, 255, 255, 0.7)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(191, 219, 254, 0.6)' }}>
                        <strong>Homeroom Duties:</strong> ① Conduct morning student roll-call &amp; follow up chronic absences (&ge;3), ② Pastoral welfare monitoring &amp; primary guardian consultations, ③ Composite term progress review sign-off.
                      </div>
                    </div>
                  )}

                  <div className="data-table-container">
                    <table className="spec-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Class / Section</th>
                          <th>Grade</th>
                          <th>Subject</th>
                          <th>Role</th>
                          <th>Stream</th>
                          <th>Enrolled Students</th>
                          <th>Room Capacity</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignedClasses.map((c, idx) => (
                          <tr key={c.teaching_assignment_id}>
                            <td style={{ color: '#64748B' }}>{idx + 1}</td>
                            <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{c.section_name}</td>
                            <td>{c.grade_name}</td>
                            <td style={{ fontWeight: 600 }}>{c.subject_name} ({c.subject_code})</td>
                            <td>
                              {c.section_id === homeroomSection?.id ? (
                                <span className="counter-pill counter-present" style={{ fontSize: '11px', fontWeight: 700 }}>
                                  ★ Class Teacher
                                </span>
                              ) : (
                                <span className="counter-pill counter-late" style={{ fontSize: '11px' }}>
                                  Subject Teacher
                                </span>
                              )}
                            </td>
                            <td>
                              <span style={{ textTransform: 'capitalize' }}>
                                {c.stream !== 'none' ? c.stream.replace('_', ' ') : 'General'}
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: '#2A7F62' }}>{c.student_count}</strong> active
                            </td>
                            <td>{c.capacity}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => handleOpenClassDetail(c.section_id)}
                              >
                                View Roster &rarr;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* CLASS DETAIL & ROSTER MODAL */}
                  {selectedClassDetail && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
                      <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '850px', width: '95%', maxHeight: '85vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <div>
                            <h3 style={{ margin: 0, color: '#1F3A5F' }}>
                              {selectedClassDetail.section?.grade_name} — Section {selectedClassDetail.section?.section_name}
                            </h3>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>
                              Homeroom Teacher: {selectedClassDetail.section?.homeroom_teacher_name || 'Unassigned'} • Capacity: {selectedClassDetail.section?.capacity}
                            </span>
                          </div>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setSelectedClassDetail(null)}>
                            Close
                          </button>
                        </div>

                        <div className="data-table-container">
                          <table className="spec-table">
                            <thead>
                              <tr>
                                <th>Roll #</th>
                                <th>Student Full Name</th>
                                <th>Admission #</th>
                                <th>Gender</th>
                                <th>Guardian &amp; Phone</th>
                                <th>Attendance Log</th>
                                <th style={{ textAlign: 'right' }}>Privacy-Scoped Profile</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedClassDetail.roster?.map((st: any) => (
                                <tr key={st.enrollment_id}>
                                  <td style={{ fontWeight: 600 }}>{st.roll_no}</td>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        background: '#E0E7FF',
                                        color: '#3730A3',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        flexShrink: 0
                                      }}>
                                        {st.full_name?.charAt(0)?.toUpperCase() || 'S'}
                                      </div>
                                      <span>{st.full_name}</span>
                                    </div>
                                  </td>
                                  <td>{st.admission_no}</td>
                                  <td style={{ textTransform: 'capitalize' }}>{st.gender}</td>
                                  <td>
                                    <div>{st.guardian_name || '—'}</div>
                                    <span style={{ fontSize: '11px', color: '#64748B' }}>{st.guardian_phone || ''}</span>
                                  </td>
                                  <td style={{ fontSize: '12px' }}>
                                    <span style={{ color: '#2A7F62' }}>{st.present_sessions}P</span> / <span style={{ color: '#C0392B' }}>{st.absent_sessions}A</span>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <button
                                      type="button"
                                      className="btn-primary btn-sm"
                                      onClick={() => handleOpenStudentProfile(st.student_id)}
                                    >
                                      Teacher View &rarr;
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TEACHER-SCOPED STUDENT PROFILE MODAL (STRICT PRIVACY ENFORCEMENT) */}
                  {scopedStudentProfile && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 130 }}>
                      <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '640px', width: '95%', maxHeight: '85vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
                          <div>
                            <h3 style={{ margin: 0, color: '#1F3A5F' }}>
                              {scopedStudentProfile.student?.full_name}
                            </h3>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>
                              Admission: {scopedStudentProfile.student?.admission_no} • {scopedStudentProfile.student?.grade_name} ({scopedStudentProfile.student?.section_name})
                            </span>
                          </div>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setScopedStudentProfile(null)}>
                            Close
                          </button>
                        </div>

                        <div className="rules-hint-box" style={{ marginBottom: '16px' }}>
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <span>
                            <strong>Record-Level Authorization Rule:</strong> You are viewing marks and attendance recorded strictly for the subjects you teach this student. Marks in other departments are confidential.
                          </span>
                        </div>

                        <h4 style={{ margin: '0 0 10px', color: '#1F3A5F' }}>Performance in Your Subjects</h4>
                        <table className="spec-table" style={{ marginBottom: '20px' }}>
                          <thead>
                            <tr>
                              <th>Subject</th>
                              <th>Assessment</th>
                              <th>Max</th>
                              <th>Score</th>
                              <th>Feedback</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scopedStudentProfile.mySubjectMarks?.length === 0 ? (
                              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '16px' }}>No marks entered yet.</td></tr>
                            ) : (
                              scopedStudentProfile.mySubjectMarks?.map((m: any, i: number) => (
                                <tr key={i}>
                                  <td style={{ fontWeight: 600 }}>{m.subject_name}</td>
                                  <td>{m.assessment_title}</td>
                                  <td>{m.max_score}</td>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{m.score ?? '—'}</td>
                                  <td style={{ fontSize: '12px' }}>{m.feedback || '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================== */}
              {/* 6. TIMETABLE (/teacher/timetable) */}
              {/* ============================================================== */}
              {activeTab === 'timetable' && (() => {
                const todayDow = new Date().getDay(); // 0 is Sunday, 1 is Monday...
                const currentDbDay = todayDow === 0 ? 7 : todayDow; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun

                const displayedTimetable = (fullTimetable.length > 0 ? fullTimetable : timetable).filter((t) => {
                  if (timetableMode === 'daily' && t.day_of_week !== currentDbDay) return false;
                  if (timetableClassFilter && t.section_id !== timetableClassFilter) return false;
                  return true;
                });

                // Conflict detection algorithm
                const conflicts: string[] = [];
                const allEntries = fullTimetable.length > 0 ? fullTimetable : timetable;
                for (let i = 0; i < allEntries.length; i++) {
                  for (let j = i + 1; j < allEntries.length; j++) {
                    const a = allEntries[i];
                    const b = allEntries[j];
                    if (a.day_of_week === b.day_of_week && a.id !== b.id) {
                      if (a.start_time < b.end_time && b.start_time < a.end_time) {
                        conflicts.push(`Slot conflict: ${a.subject_name} (${a.section_name}) overlaps with ${b.subject_name} (${b.section_name})`);
                      }
                    }
                  }
                }

                const totalPeriodsWeek = 40; // 8 periods x 5 weekdays standard
                const activeTeachingCount = allEntries.length;
                const freePlanningCount = Math.max(0, totalPeriodsWeek - activeTeachingCount);

                return (
                  <div>
                    <div className="page-header-row">
                      <div>
                        <div className="page-breadcrumb">
                          <span>Teacher Portal</span> / <span>Schedule</span> / <span>Timetable</span>
                        </div>
                        <h2 className="page-title">Teaching Timetable &amp; Cover Duties</h2>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => window.print()}
                          title="Print or save as PDF"
                        >
                          🖨️ Print / Download
                        </button>
                        <button
                          type="button"
                          className={`btn-${timetableMode === 'weekly' ? 'primary' : 'secondary'}`}
                          onClick={() => setTimetableMode('weekly')}
                        >
                          Weekly Schedule
                        </button>
                        <button
                          type="button"
                          className={`btn-${timetableMode === 'daily' ? 'primary' : 'secondary'}`}
                          onClick={() => setTimetableMode('daily')}
                        >
                          Today's Agenda
                        </button>
                      </div>
                    </div>

                    {/* STATUS & FILTER STRIP */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC', padding: '12px 18px', borderRadius: '10px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <span className="counter-pill counter-present" style={{ fontSize: '12px' }}>
                          📅 {activeTeachingCount} Teaching Periods / Week
                        </span>
                        <span className="counter-pill counter-late" style={{ fontSize: '12px' }}>
                          ☕ {freePlanningCount} Free / Prep Periods
                        </span>
                        {conflicts.length === 0 ? (
                          <span className="counter-pill counter-present" style={{ fontSize: '12px' }}>
                            ✅ 0 Scheduling Conflicts (Clean)
                          </span>
                        ) : (
                          <span className="counter-pill counter-absent" style={{ fontSize: '12px' }}>
                            ⚠️ {conflicts.length} Conflict(s) Detected
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <label htmlFor="timetableClassFilterSelect" style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                          Class Timetable View:
                        </label>
                        <select
                          id="timetableClassFilterSelect"
                          className="form-select"
                          style={{ padding: '6px 12px', fontSize: '13px', width: 'auto' }}
                          value={timetableClassFilter || ''}
                          onChange={(e) => setTimetableClassFilter(e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">All Assigned Classes</option>
                          {assignedClasses.map((c) => (
                            <option key={c.section_id} value={c.section_id}>
                              {c.section_name} ({c.grade_name}) — {c.subject_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* CONFLICT DETAILS WARNING IF ANY */}
                    {conflicts.length > 0 && (
                      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                        <div style={{ fontWeight: 700, color: '#991B1B', fontSize: '13px', marginBottom: '4px' }}>
                          ⚠️ Scheduling Overlap Warning
                        </div>
                        {conflicts.map((msg, i) => (
                          <div key={i} style={{ fontSize: '12px', color: '#B91C1C' }}>• {msg}</div>
                        ))}
                      </div>
                    )}

                    <div className="data-table-container">
                      <table className="spec-table">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th>Time</th>
                            <th>Period Slot</th>
                            <th>Class &amp; Section</th>
                            <th>Subject</th>
                            <th>Classroom Location</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedTimetable.length === 0 ? (
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                                No scheduled lessons found for {timetableMode === 'daily' ? "today's agenda" : 'this view'}.
                              </td>
                            </tr>
                          ) : (
                            displayedTimetable.map((t) => {
                              const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                              const dayName = days[t.day_of_week - 1] || `Day ${t.day_of_week}`;
                              return (
                                <tr key={t.id}>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{dayName}</td>
                                  <td>{t.start_time?.substring(0, 5)} - {t.end_time?.substring(0, 5)}</td>
                                  <td><span className="counter-pill counter-present" style={{ fontSize: '11px' }}>{t.slot_label}</span></td>
                                  <td style={{ fontWeight: 600 }}>{t.section_name} ({t.grade_name})</td>
                                  <td>{t.subject_name} ({t.subject_code})</td>
                                  <td>
                                    <strong style={{ color: '#1F3A5F' }}>Room {t.room_name || 'TBA'}</strong>
                                    <span style={{ fontSize: '12px', color: '#64748B' }}> ({t.building || 'Main Campus'})</span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* ============================================================== */}
              {/* 7. MY SUBJECTS (/teacher/subjects) */}
              {/* ============================================================== */}
              {activeTab === 'subjects' && (
                <TeacherSubjects
                  onShowToast={showToast}
                  onNavigate={(tab, params) => {
                    if (params?.sectionId) {
                      setSelectedSectionId(params.sectionId);
                      setMarksFilterSectionId(params.sectionId);
                    }
                    if (params?.subjectId) {
                      setAttSubjectId(params.subjectId);
                      setMarksFilterSubjectId(params.subjectId);
                    }
                    if (params?.openCreateModal) {
                      setShowCreateModal(true);
                      return;
                    }
                    navigateTo(tab as any);
                  }}
                />
              )}

              {/* ============================================================== */}
              {/* 8. ASSIGNMENTS & ASSESSMENTS (/teacher/assessments) */}
              {/* ============================================================== */}
              {activeTab === 'assessments' && (
                <TeacherAssessments
                  assignedClasses={assignedClasses}
                  terms={terms}
                  onNavigateToMarks={(id) => {
                    const found = assessments.find((a) => a.id === id);
                    if (found) {
                      handleOpenAssessment(found);
                    }
                    navigateTo('marks');
                  }}
                  onShowToast={showToast}
                />
              )}

              {/* ============================================================== */}
              {/* 9. LESSONS & TEACHING MATERIALS (/teacher/lessons) */}
              {/* ============================================================== */}
              {activeTab === 'lessons' && (
                <TeacherLessons
                  assignedClasses={assignedClasses}
                  onShowToast={showToast}
                />
              )}

              {/* ============================================================== */}
              {/* 10. STUDENT WELFARE & BEHAVIOR (/teacher/welfare) */}
              {/* ============================================================== */}
              {activeTab === 'welfare' && (
                <TeacherWelfare
                  assignedClasses={assignedClasses}
                  onShowToast={showToast}
                  onNavigate={(tab, params) => {
                    if (tab === 'communication' && params) {
                      setCommunicationContext(params);
                    }
                    setActiveTab(tab as any);
                  }}
                />
              )}

              {/* ============================================================== */}
              {/* 11. COMMUNICATION (/teacher/communication) */}
              {/* ============================================================== */}
              {activeTab === 'communication' && (
                <TeacherCommunication
                  assignedClasses={assignedClasses}
                  onShowToast={showToast}
                  initialContext={communicationContext}
                  onClearContext={() => setCommunicationContext(null)}
                />
              )}

              {/* ============================================================== */}
              {/* 12. REQUESTS & APPROVALS (/teacher/requests) */}
              {/* ============================================================== */}
              {activeTab === 'requests' && (
                <TeacherRequests
                  assignedClasses={assignedClasses}
                  onShowToast={showToast}
                />
              )}

              {/* ============================================================== */}
              {/* 13. NOTIFICATIONS (/teacher/notifications) */}
              {/* ============================================================== */}
              {activeTab === 'notifications' && (
                <TeacherNotifications onShowToast={showToast} />
              )}

              {/* ============================================================== */}
              {/* 14. LEAVE & STAFF SERVICES (/teacher/leave) */}
              {/* ============================================================== */}
              {activeTab === 'leave' && (
                <TeacherLeave onShowToast={showToast} />
              )}

              {/* ============================================================== */}
              {/* 15. MY PROFILE (/teacher/profile) */}
              {/* ============================================================== */}
              {activeTab === 'profile' && (
                <TeacherProfile onShowToast={showToast} />
              )}
            </>
          )}
        </main>
      </div>

      {/* CREATE ASSESSMENT MODAL */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '480px', width: '95%', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1F3A5F', marginBottom: '16px' }}>Create New Assessment</h3>
            <form onSubmit={handleCreateAssessment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="input-label" htmlFor="newAssignmentSelect">Class &amp; Subject Assignment</label>
                <select
                  id="newAssignmentSelect"
                  className="form-select"
                  value={newAssignmentId || ''}
                  onChange={(e) => setNewAssignmentId(Number(e.target.value))}
                  required
                  disabled={assignedClasses.length === 0}
                >
                  {assignedClasses.length === 0 ? (
                    <option value="" disabled>⚠️ No class assignments found for your teacher account</option>
                  ) : (
                    <>
                      <option value="" disabled>-- Select Class &amp; Subject Assignment --</option>
                      {assignedClasses.map((c) => (
                        <option key={c.teaching_assignment_id} value={c.teaching_assignment_id}>
                          {c.section_name} — {c.subject_name} ({c.grade_name})
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {assignedClasses.length === 0 && (
                  <div style={{ marginTop: '8px', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#991B1B', fontSize: '12px', lineHeight: 1.5 }}>
                    ⚠️ <strong>No Teaching Assignments Found:</strong> Your teacher account does not have any classes or subjects assigned yet by the administration.
                  </div>
                )}
              </div>

              <div>
                <label className="input-label" htmlFor="newTermSelect">Academic Term</label>
                <select
                  id="newTermSelect"
                  className="form-select"
                  value={newTermId || ''}
                  onChange={(e) => setNewTermId(Number(e.target.value))}
                  required
                >
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label" htmlFor="newTitleInput">Assessment Title</label>
                <input
                  id="newTitleInput"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Midterm Physics Examination"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="input-label" htmlFor="newTypeSelect">Assessment Type</label>
                <select
                  id="newTypeSelect"
                  className="form-select"
                  value={newTypeId}
                  onChange={(e) => setNewTypeId(Number(e.target.value))}
                >
                  {assessmentTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="input-label" htmlFor="newMaxScoreInput">Max Score</label>
                  <input
                    id="newMaxScoreInput"
                    type="number"
                    min="1"
                    className="form-input"
                    value={newMaxScore}
                    onChange={(e) => setNewMaxScore(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="newWeightInput">Weight (%)</label>
                  <input
                    id="newWeightInput"
                    type="number"
                    min="0"
                    max="100"
                    className="form-input"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={assignedClasses.length === 0}>
                  Create Assessment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
