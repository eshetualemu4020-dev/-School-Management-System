import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import '../TeacherDashboard.css';
import '../AdminDashboard.css';

interface AdminDashboardProps {
  user: {
    username: string;
    role: string;
    permissions: string[];
    staffName?: string;
  };
  onLogout: () => void;
}

export type AdminMainPage =
  | 'overview'
  | 'students'
  | 'staff_users'
  | 'academic_structure'
  | 'assignments_timetable'
  | 'attendance_results'
  | 'reports_library'
  | 'communications_audit'
  | 'school_settings'
  | 'admin_profile';

const getLocalDateInputValue = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
};

const formatStudentOption = (value: string) => value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

const YEAR_PRESETS = [
  { name: '2020/21', ec: '2013 E.C.', start: '2020-09-10', end: '2021-07-05' },
  { name: '2021/22', ec: '2014 E.C.', start: '2021-09-10', end: '2022-07-05' },
  { name: '2022/23', ec: '2015 E.C.', start: '2022-09-10', end: '2023-07-05' },
  { name: '2023/24', ec: '2016 E.C.', start: '2023-09-10', end: '2024-07-05' },
  { name: '2024/25', ec: '2017 E.C.', start: '2024-09-10', end: '2025-07-05' },
  { name: '2025/26', ec: '2018 E.C.', start: '2025-09-10', end: '2026-07-05' },
  { name: '2026/27', ec: '2019 E.C.', start: '2026-09-10', end: '2027-07-05' },
  { name: '2027/28', ec: '2020 E.C.', start: '2027-09-10', end: '2028-07-05' },
  { name: '2028/29', ec: '2021 E.C.', start: '2028-09-10', end: '2029-07-05' },
  { name: '2029/30', ec: '2022 E.C.', start: '2029-09-10', end: '2030-07-05' },
  { name: '2030/31', ec: '2023 E.C.', start: '2030-09-10', end: '2031-07-05' },
  { name: '2031/32', ec: '2024 E.C.', start: '2031-09-10', end: '2032-07-05' },
  { name: '2032/33', ec: '2025 E.C.', start: '2032-09-10', end: '2033-07-05' },
  { name: '2033/34', ec: '2026 E.C.', start: '2033-09-10', end: '2034-07-05' },
  { name: '2034/35', ec: '2027 E.C.', start: '2034-09-10', end: '2035-07-05' },
  { name: '2035/36', ec: '2028 E.C.', start: '2035-09-10', end: '2036-07-05' },
  { name: '2036/37', ec: '2029 E.C.', start: '2036-09-10', end: '2037-07-05' },
  { name: '2037/38', ec: '2030 E.C.', start: '2037-09-10', end: '2038-07-05' },
  { name: '2038/39', ec: '2031 E.C.', start: '2038-09-10', end: '2039-07-05' },
  { name: '2039/40', ec: '2032 E.C.', start: '2039-09-10', end: '2040-07-05' }
];

export default function AdminDashboard({ user, onLogout }: AdminDashboardProps) {
  // Main 10 navigation pages state
  const [activePage, setActivePage] = useState<AdminMainPage>('overview');

  // Sub-tab states for pages
  const [studentTab, setStudentTab] = useState<'directory' | 'register' | 'transfers' | 'incomplete'>('directory');
  const [staffTab, setStaffTab] = useState<'staff_list' | 'add_staff' | 'users_list' | 'workloads'>('staff_list');
  const [academicTab, setAcademicTab] = useState<'years_terms' | 'sections' | 'subjects'>('years_terms');
  const [assignmentTab, setAssignmentTab] = useState<'assignments' | 'timetable' | 'schedule_entry' | 'time_slots'>('assignments');
  const [resultsTab, setResultsTab] = useState<'attendance' | 'assessments' | 'performance' | 'grading_scales'>('attendance');
  const [reportsTab, setReportsTab] = useState<'reports' | 'library'>('reports');
  const [commsTab, setCommsTab] = useState<'announcements' | 'audit'>('announcements');
  const [settingsCategory, setSettingsCategory] = useState<'identity' | 'academic' | 'grading' | 'attendance' | 'preferences' | 'all'>('identity');
  const [settingsSearch, setSettingsSearch] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [customVal, setCustomVal] = useState('');
  const [notifSecurityAlerts, setNotifSecurityAlerts] = useState(true);
  const [notifGuardianBroadcasts, setNotifGuardianBroadcasts] = useState(true);
  const [notifAttendanceDigest, setNotifAttendanceDigest] = useState(false);
  const [notifSystemErrors, setNotifSystemErrors] = useState(true);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Global & Overview Data
  const [dashData, setDashData] = useState<any>(null);

  // Page 2: Student Management Data
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentDirectoryTotal, setStudentDirectoryTotal] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const studentPageSize = 50;
  const [studentAuditMode, setStudentAuditMode] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentGradeFilter, setStudentGradeFilter] = useState('');
  const [studentSectionFilter, setStudentSectionFilter] = useState('');
  const [studentStatusFilter, setStudentStatusFilter] = useState('');
  const [studentStreamFilter, setStudentStreamFilter] = useState('');
  const [studentGenderFilter, setStudentGenderFilter] = useState('');
  const [studentOptions, setStudentOptions] = useState<{ statuses: string[]; genders: string[]; streams: string[]; guardianRelationships: string[] } | null>(null);
  const [transfersList, setTransfersList] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [viewStudentModalOpen, setViewStudentModalOpen] = useState(false);
  const [studentEditModalOpen, setStudentEditModalOpen] = useState(false);
  const [studentEditForm, setStudentEditForm] = useState({ firstName: '', fatherName: '', grandfatherName: '', gender: 'female' as 'female' | 'male', dateOfBirth: '', phone: '', address: '', guardianName: '', guardianPhone: '', guardianRelation: 'guardian' });
  const [studentEditSaving, setStudentEditSaving] = useState(false);
  const [statusModalStudent, setStatusModalStudent] = useState<any>(null);
  const [newStatus, setNewStatus] = useState<string>('');
  const [statusReason, setStatusReason] = useState<string>('');
  const [destinationSchool, setDestinationSchool] = useState<string>('');
  const [statusEffectiveDate, setStatusEffectiveDate] = useState(getLocalDateInputValue());
  const [statusSectionId, setStatusSectionId] = useState<number | string>('');
  const [reassignModalStudent, setReassignModalStudent] = useState<any>(null);
  const [newSectionId, setNewSectionId] = useState<number | string>('');

  // Page 2 Form: Register Student
  const [regFirstName, setRegFirstName] = useState('');
  const [regFatherName, setRegFatherName] = useState('');
  const [regGrandfatherName, setRegGrandfatherName] = useState('');
  const [regGender, setRegGender] = useState<'' | 'female' | 'male'>('');
  const [regDob, setRegDob] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regPhoto, setRegPhoto] = useState<{ originalName: string; mimeType: string; dataBase64: string } | null>(null);
  const [regSectionId, setRegSectionId] = useState<number | string>('');
  const [regGuardianName, setRegGuardianName] = useState('');
  const [regGuardianPhone, setRegGuardianPhone] = useState('');
  const [regGuardianRelation, setRegGuardianRelation] = useState('');

  // Page 3: Staff & Users Data
  const [staffList, setStaffList] = useState<any[]>([]);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffTypeFilter, setStaffTypeFilter] = useState('');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);
  const [resetPassModalUser, setResetPassModalUser] = useState<any>(null);
  const [resetNewPass, setResetNewPass] = useState('');
  const [rolesModalUser, setRolesModalUser] = useState<any>(null);
  const [selectedRoleCodes, setSelectedRoleCodes] = useState<string[]>([]);

  // Page 3: Register User Account Modal State
  const [newUserModalOpen, setNewUserModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('Pass#2026');
  const [newUserRoleCode, setNewUserRoleCode] = useState('system_admin');

  // Page 3 Form: Register Staff
  const [staffEmpNo, setStaffEmpNo] = useState(`EMP-${Math.floor(1000 + Math.random() * 9000)}`);
  const [staffFirstName, setStaffFirstName] = useState('');
  const [staffFatherName, setStaffFatherName] = useState('');
  const [staffGrandfatherName, setStaffGrandfatherName] = useState('');
  const [staffGender, setStaffGender] = useState<'female' | 'male'>('male');
  const [staffType, setStaffType] = useState<'teacher' | 'administrator' | 'librarian' | 'accountant' | 'support'>('teacher');
  const [staffJobTitle, setStaffJobTitle] = useState('Subject Teacher');
  const [staffDept, setStaffDept] = useState('Natural Sciences');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffCreateAccount, setStaffCreateAccount] = useState(true);
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('StaffPass#2026');
  const [staffAccountRole, setStaffAccountRole] = useState('system_admin');

  // Page 4: Academic Structure & Settings Data
  const [academicStructure, setAcademicStructure] = useState<any>(null);
  const [systemSettings, setSystemSettings] = useState<any[]>([]);
  // Modals for Page 4
  const [newYearModalOpen, setNewYearModalOpen] = useState(false);
  const [newYearPreset, setNewYearPreset] = useState('custom');
  const [newYearName, setNewYearName] = useState('2027/28');
  const [newYearLabelEc, setNewYearLabelEc] = useState('2020 E.C.');
  const [newYearStart, setNewYearStart] = useState('2027-09-10');
  const [newYearEnd, setNewYearEnd] = useState('2028-07-05');
  const [newTermModalOpen, setNewTermModalOpen] = useState(false);
  const [newTermYearId, setNewTermYearId] = useState<number | string>('');
  const [termTypeOption, setTermTypeOption] = useState<'semester_1' | 'semester_2' | 'other'>('semester_1');
  const [newTermNo, setNewTermNo] = useState(1);
  const [newTermName, setNewTermName] = useState('Semester 1');
  const [customTermName, setCustomTermName] = useState('');
  const [newTermStart, setNewTermStart] = useState('2026-09-10');
  const [newTermEnd, setNewTermEnd] = useState('2027-01-30');
  const [newSecModalOpen, setNewSecModalOpen] = useState(false);
  const [newSecGradeId, setNewSecGradeId] = useState<number | string>('');
  const [newSecName, setNewSecName] = useState('');
  const [newSecStream, setNewSecStream] = useState<'none' | 'natural_science' | 'social_science'>('none');
  const [newSecCapacity, setNewSecCapacity] = useState(40);
  const [newSecHomeroom, setNewSecHomeroom] = useState<number | string>('');
  const [newSecRoom, setNewSecRoom] = useState<number | string>('');
  const [newSubjModalOpen, setNewSubjModalOpen] = useState(false);
  const [newSubjCode, setNewSubjCode] = useState('');
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjNameAm, setNewSubjNameAm] = useState('');
  const [mapSubjModalOpen, setMapSubjModalOpen] = useState(false);
  const [mapGradeId, setMapGradeId] = useState<number | string>('');
  const [mapSubjId, setMapSubjId] = useState<number | string>('');
  const [mapStream, setMapStream] = useState<'all' | 'natural_science' | 'social_science'>('all');
  const [mapPeriods, setMapPeriods] = useState(4);

  // Page 5: Teaching Assignments & Timetable Data
  const [assignmentsData, setAssignmentsData] = useState<{ assignments: any[]; unassigned: any[] }>({ assignments: [], unassigned: [] });
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignStaffId, setAssignStaffId] = useState<number | string>('');
  const [assignSubjId, setAssignSubjId] = useState<number | string>('');
  const [assignSecId, setAssignSecId] = useState<number | string>('');
  const [assignYearId, setAssignYearId] = useState<number | string>('');
  const [timetableEntries, setTimetableEntries] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [timetableFilterSection, setTimetableFilterSection] = useState<number | string>('');
  const [schedTermId, setSchedTermId] = useState<number | string>('');
  const [schedSecId, setSchedSecId] = useState<number | string>('');
  const [schedSubjId, setSchedSubjId] = useState<number | string>('');
  const [schedStaffId, setSchedStaffId] = useState<number | string>('');
  const [schedRoomId, setSchedRoomId] = useState<number | string>('');
  const [schedSlotId, setSchedSlotId] = useState<number | string>('');

  // Page 6: Attendance & Academic Results Data
  const [attSummaryDate, setAttSummaryDate] = useState(new Date().toISOString().split('T')[0]);
  const [attSummaryData, setAttSummaryData] = useState<any>(null);
  const [assessmentsOverview, setAssessmentsOverview] = useState<any[]>([]);
  const [gradingScales, setGradingScales] = useState<any[]>([]);

  // Page 7: Reports & Library Overview Data
  const [reportType, setReportType] = useState<'enrollment' | 'attendance' | 'academic' | 'workload'>('enrollment');
  const [enrollmentReport, setEnrollmentReport] = useState<any>(null);
  const [attendanceReport, setAttendanceReport] = useState<any[]>([]);
  const [performanceReport, setPerformanceReport] = useState<any[]>([]);
  const [workloadReport, setWorkloadReport] = useState<any[]>([]);
  const [libraryData, setLibraryData] = useState<any>(null);

  // Page 8: Communications, Audit Logs & Profile Data
  const [announcementsList, setAnnouncementsList] = useState<any[]>([]);
  const [annModalOpen, setAnnModalOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annContent, setAnnContent] = useState('');
  const [annTargetRole, setAnnTargetRole] = useState('all');
  const [annStatus, setAnnStatus] = useState('published');
  const [auditLogsList, setAuditLogsList] = useState<any[]>([]);
  const [auditActorFilter, setAuditActorFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState('');
  const [adminProfile, setAdminProfile] = useState<any>(null);
  const [profilePhone, setProfilePhone] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [currPassword, setCurrPassword] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [confirmAdminPassword, setConfirmAdminPassword] = useState('');

  const loadOverviewData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAdminDashboard();
      setDashData(data);
      if (data?.academic?.academicYear?.id) {
        setAssignYearId(data.academic.academicYear.id);
        setNewTermYearId(data.academic.academicYear.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load administrator dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadOverviewData();
  }, []);

  // Nav Switcher
  const handleNavPage = (page: AdminMainPage) => {
    setActivePage(page);
    setActionMessage(null);

    if (page === 'students') {
      const auditMode = studentTab === 'incomplete';
      setStudentAuditMode(auditMode);
      if (!studentOptions) void loadStudentOptions();
      if (studentTab === 'transfers') loadStudentTransfers();
      else loadStudents(1, auditMode);
      if (academicStructure === null) loadAcademicStructure();
    } else if (page === 'staff_users') {
      loadStaff();
      loadUsers();
      loadRoles();
    } else if (page === 'academic_structure') {
      loadAcademicStructure();
    } else if (page === 'assignments_timetable') {
      loadAssignments();
      loadTimetable();
      if (academicStructure === null) loadAcademicStructure();
    } else if (page === 'attendance_results') {
      loadAttendanceSummary(attSummaryDate);
      loadAssessmentsOverview();
      loadGradingScales();
    } else if (page === 'reports_library') {
      loadReports(reportType);
      loadLibraryOverview();
    } else if (page === 'communications_audit') {
      loadAnnouncements();
      loadAuditLogs();
    } else if (page === 'school_settings') {
      loadSettings();
    } else if (page === 'admin_profile') {
      loadProfile();
      loadAuditLogs();
    }
  };

  // Data Fetchers
  const loadStudentOptions = async () => {
    try {
      setStudentOptions(await api.getAdminStudentOptions());
    } catch (err: any) {
      setActionMessage({ text: 'Error loading student form options: ' + err.message, type: 'error' });
    }
  };

  const loadStudents = async (page = studentPage, auditMode = studentAuditMode) => {
    try {
      const res = await api.getAdminStudents({
        search: auditMode ? undefined : studentSearch || undefined,
        gradeId: !auditMode && studentGradeFilter ? Number(studentGradeFilter) : undefined,
        sectionId: !auditMode && studentSectionFilter ? Number(studentSectionFilter) : undefined,
        status: !auditMode ? studentStatusFilter || undefined : undefined,
        stream: !auditMode ? studentStreamFilter || undefined : undefined,
        gender: !auditMode ? studentGenderFilter || undefined : undefined,
        limit: studentPageSize,
        offset: (page - 1) * studentPageSize,
        incompleteOnly: auditMode
      });
      setStudentsList(res?.items || []);
      setStudentTotal(res?.total || 0);
      if (!auditMode) setStudentDirectoryTotal(res?.total || 0);
      setStudentPage(page);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading students: ' + err.message, type: 'error' });
    }
  };

  const loadStudentTransfers = async () => {
    try {
      const transfers = await api.getAdminTransfers();
      setTransfersList(transfers || []);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading transfer history: ' + err.message, type: 'error' });
    }
  };

  const selectStudentTab = (tab: 'directory' | 'register' | 'transfers' | 'incomplete') => {
    const auditMode = tab === 'incomplete';
    setStudentTab(tab);
    setStudentAuditMode(auditMode);
    if (tab === 'directory' || tab === 'incomplete') loadStudents(1, auditMode);
    if (tab === 'transfers') loadStudentTransfers();
  };

  const loadStaff = async () => {
    try {
      const res = await api.getAdminStaff(staffSearch || undefined, staffTypeFilter || undefined);
      setStaffList(res || []);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading faculty: ' + err.message, type: 'error' });
    }
  };

  const loadUsers = async () => {
    try {
      const res = await api.getAdminUsers(userSearch || undefined, userRoleFilter || undefined);
      setUsersList(res || []);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading users: ' + err.message, type: 'error' });
    }
  };

  const loadRoles = async () => {
    try {
      const res = await api.getAdminRoles();
      setAvailableRoles(res || []);
    } catch (_e) {
      // ignore
    }
  };

  const loadAcademicStructure = async () => {
    try {
      const res = await api.getAdminAcademicStructure();
      setAcademicStructure(res);
      if (res?.sections?.length > 0 && !regSectionId) {
        setTimetableFilterSection(res.sections[0].id);
      }
      if (res?.grades?.length > 0 && !newSecGradeId) {
        setNewSecGradeId(res.grades[0].id);
        setMapGradeId(res.grades[0].id);
      }
      if (res?.subjects?.length > 0 && !mapSubjId) {
        setMapSubjId(res.subjects[0].id);
      }
    } catch (err: any) {
      setActionMessage({ text: 'Error loading academic structure: ' + err.message, type: 'error' });
    }
  };

  const loadSettings = async () => {
    try {
      const res = await api.getAdminSettings();
      setSystemSettings(res || []);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading system settings: ' + err.message, type: 'error' });
    }
  };

  const loadAssignments = async () => {
    try {
      const res = await api.getAdminAssignments();
      setAssignmentsData(res || { assignments: [], unassigned: [] });
    } catch (err: any) {
      setActionMessage({ text: 'Error loading assignments: ' + err.message, type: 'error' });
    }
  };

  const loadTimetable = async () => {
    try {
      const entries = await api.getAdminTimetable();
      setTimetableEntries(entries || []);
      const slots = await api.getAdminTimeSlots();
      setTimeSlots(slots || []);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading timetable: ' + err.message, type: 'error' });
    }
  };

  const loadAttendanceSummary = async (dateStr: string) => {
    try {
      const res = await api.getAdminAttendanceSummary(dateStr);
      setAttSummaryData(res);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading attendance: ' + err.message, type: 'error' });
    }
  };

  const loadAssessmentsOverview = async () => {
    try {
      const res = await api.getAdminAssessmentsOverview();
      setAssessmentsOverview(res || []);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading assessments: ' + err.message, type: 'error' });
    }
  };

  const loadGradingScales = async () => {
    try {
      const res = await api.getAdminGradingScales();
      setGradingScales(res || []);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading grading scales: ' + err.message, type: 'error' });
    }
  };

  const loadReports = async (type: 'enrollment' | 'attendance' | 'academic' | 'workload') => {
    try {
      if (type === 'enrollment') {
        const res = await api.getAdminEnrollmentReport();
        setEnrollmentReport(res);
      } else if (type === 'attendance') {
        const res = await api.getAdminAttendanceReport();
        setAttendanceReport(res || []);
      } else if (type === 'academic') {
        const res = await api.getAdminPerformanceReport();
        setPerformanceReport(res || []);
      } else if (type === 'workload') {
        const res = await api.getAdminStaffWorkloadReport();
        setWorkloadReport(res || []);
      }
    } catch (err: any) {
      setActionMessage({ text: 'Error loading report: ' + err.message, type: 'error' });
    }
  };

  const loadLibraryOverview = async () => {
    try {
      const res = await api.getAdminLibraryOverview();
      setLibraryData(res);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading library: ' + err.message, type: 'error' });
    }
  };

  const loadAnnouncements = async () => {
    try {
      const res = await api.getAdminAnnouncements();
      setAnnouncementsList(res || []);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading announcements: ' + err.message, type: 'error' });
    }
  };

  const loadAuditLogs = async () => {
    try {
      const res = await api.getAdminAuditLogs({
        actor: auditActorFilter || undefined,
        action: auditActionFilter || undefined,
        outcome: auditOutcomeFilter || undefined
      });
      setAuditLogsList(res || []);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading audit logs: ' + err.message, type: 'error' });
    }
  };

  const loadProfile = async () => {
    try {
      const res = await api.getAdminProfile();
      setAdminProfile(res);
      if (res?.phone) setProfilePhone(res.phone);
      if (res?.email) setProfileEmail(res.email);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading profile: ' + err.message, type: 'error' });
    }
  };

  // CSV Export Utility
  const exportToCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportStudentRecords = async () => {
    try {
      const filters = {
        search: studentSearch || undefined,
        gradeId: studentGradeFilter ? Number(studentGradeFilter) : undefined,
        sectionId: studentSectionFilter ? Number(studentSectionFilter) : undefined,
        status: studentStatusFilter || undefined,
        stream: studentStreamFilter || undefined,
        gender: studentGenderFilter || undefined
      };
      const firstPage = await api.getAdminStudents({ ...filters, limit: 100, offset: 0 });
      const allStudents = [...(firstPage.items || [])];
      for (let offset = allStudents.length; offset < firstPage.total; offset += 100) {
        const nextPage = await api.getAdminStudents({ ...filters, limit: 100, offset });
        allStudents.push(...(nextPage.items || []));
      }
      const headers = ['Admission No', 'Full Name', 'Grade', 'Section', 'Stream', 'Gender', 'Status', 'Guardian'];
      const rows = allStudents.map((s) => [
        s.admission_no,
        `${s.first_name} ${s.father_name}`,
        s.grade_name || s.grade_level,
        s.section_name,
        s.section_stream || 'none',
        s.gender,
        s.student_status,
        s.primary_guardian || 'N/A'
      ]);
      exportToCSV('Student_Records_Export', headers, rows);
    } catch (err: any) {
      setActionMessage({ text: 'Student export failed: ' + err.message, type: 'error' });
    }
  };

  // Handlers for Page 2: Student Actions
  const handleRegisterStudent = async (e: FormEvent) => {
    e.preventDefault();
    if (!regFirstName.trim() || !regFatherName.trim() || !regSectionId || !regGender || !regDob) {
      setActionMessage({ text: 'Please fill all required student admission fields.', type: 'error' });
      return;
    }
    if (Boolean(regGuardianName.trim()) !== Boolean(regGuardianPhone.trim())) {
      setActionMessage({ text: 'Provide both the guardian name and phone number, or leave both blank.', type: 'error' });
      return;
    }
    try {
      const result = await api.registerAdminStudent({
        firstName: regFirstName.trim(),
        fatherName: regFatherName.trim(),
        grandfatherName: regGrandfatherName.trim() || undefined,
        gender: regGender as 'female' | 'male',
        dateOfBirth: regDob,
        phone: regPhone.trim() || undefined,
        address: regAddress.trim() || undefined,
        sectionId: Number(regSectionId),
        guardianName: regGuardianName.trim() || undefined,
        guardianPhone: regGuardianPhone.trim() || undefined,
        guardianRelation: regGuardianRelation,
        photo: regPhoto || undefined
      });
      setActionMessage({ text: `Student '${regFirstName} ${regFatherName}' admitted with Admission No ${result.admissionNo}.`, type: 'success' });
      setRegFirstName('');
      setRegFatherName('');
      setRegGrandfatherName('');
      setRegGender('');
      setRegDob('');
      setRegPhone('');
      setRegGuardianName('');
      setRegGuardianPhone('');
      setRegGuardianRelation('');
      setRegAddress('');
      setRegPhoto(null);
      setRegSectionId('');
      setStudentTab('directory');
      setStudentAuditMode(false);
      loadStudents(1, false);
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Admission failed: ' + err.message, type: 'error' });
    }
  };

  const handleOpenStudentDetails = async (st: any) => {
    try {
      const details = await api.getAdminStudentDetails(st.id);
      setSelectedStudent(details);
      setViewStudentModalOpen(true);
    } catch (err: any) {
      setActionMessage({ text: 'Failed to fetch student profile: ' + err.message, type: 'error' });
    }
  };

  const handleOpenStudentEdit = () => {
    if (!selectedStudent) return;
    const primaryGuardian = selectedStudent.guardians?.find((guardian: any) => guardian.is_primary) || selectedStudent.guardians?.[0];
    setStudentEditForm({
      firstName: selectedStudent.first_name || '',
      fatherName: selectedStudent.father_name || '',
      grandfatherName: selectedStudent.grandfather_name || '',
      gender: selectedStudent.gender === 'male' ? 'male' : 'female',
      dateOfBirth: selectedStudent.date_of_birth ? String(selectedStudent.date_of_birth).slice(0, 10) : '',
      phone: selectedStudent.phone || '',
      address: selectedStudent.address || '',
      guardianName: primaryGuardian ? `${primaryGuardian.first_name || ''} ${primaryGuardian.father_name || ''}`.trim() : '',
      guardianPhone: primaryGuardian?.phone || '',
      guardianRelation: primaryGuardian?.relationship || ''
    });
    setStudentEditModalOpen(true);
  };

  const handleSaveStudentEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setStudentEditSaving(true);
    try {
      await api.updateAdminStudent(selectedStudent.id, {
        firstName: studentEditForm.firstName.trim(),
        fatherName: studentEditForm.fatherName.trim(),
        grandfatherName: studentEditForm.grandfatherName.trim(),
        gender: studentEditForm.gender,
        dateOfBirth: studentEditForm.dateOfBirth,
        phone: studentEditForm.phone.trim(),
        address: studentEditForm.address.trim(),
        guardianName: studentEditForm.guardianName.trim(),
        guardianPhone: studentEditForm.guardianPhone.trim(),
        guardianRelation: studentEditForm.guardianRelation
      });
      setActionMessage({ text: 'Student profile updated successfully.', type: 'success' });
      setStudentEditModalOpen(false);
      setViewStudentModalOpen(false);
      await loadStudents();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to update student profile: ' + err.message, type: 'error' });
    } finally {
      setStudentEditSaving(false);
    }
  };

  const handleChangeStudentStatus = async () => {
    if (!newStatus) {
      setActionMessage({ text: 'Select a student status.', type: 'error' });
      return;
    }
    if (newStatus === 'transferred' && !destinationSchool.trim()) {
      setActionMessage({ text: 'Enter the destination school for this transfer.', type: 'error' });
      return;
    }
    if (newStatus === 'active' && statusModalStudent?.student_status !== 'active' && !statusSectionId) {
      setActionMessage({ text: 'Select a section placement before activating this student.', type: 'error' });
      return;
    }
    if (!statusEffectiveDate) {
      setActionMessage({ text: 'Select the effective date for this status change.', type: 'error' });
      return;
    }
    if (!statusModalStudent || !statusReason.trim()) {
      setActionMessage({ text: 'Please provide a reason for the status change.', type: 'error' });
      return;
    }
    try {
      await api.setAdminStudentStatus(statusModalStudent.id, {
        status: newStatus,
        reason: statusReason.trim(),
        destinationSchool: destinationSchool.trim() || undefined,
        effectiveDate: statusEffectiveDate,
        sectionId: newStatus === 'active' ? Number(statusSectionId) : undefined
      });
      setActionMessage({ text: `Student status changed to '${newStatus}'.`, type: 'success' });
      setStatusModalStudent(null);
      setStatusReason('');
      setDestinationSchool('');
      setStatusEffectiveDate(getLocalDateInputValue());
      loadStudents();
      if (newStatus === 'transferred' || newStatus === 'withdrawn') loadStudentTransfers();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to update student status: ' + err.message, type: 'error' });
    }
  };

  const handleReassignSection = async () => {
    if (!reassignModalStudent || !newSectionId) {
      setActionMessage({ text: 'Please select a destination section.', type: 'error' });
      return;
    }
    try {
      await api.reassignAdminStudentSection(reassignModalStudent.id, Number(newSectionId));
      setActionMessage({ text: `Student reassigned to new section successfully!`, type: 'success' });
      setReassignModalStudent(null);
      loadStudents();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Reassignment failed: ' + err.message, type: 'error' });
    }
  };

  // Handlers for Page 3: Staff & User Actions
  const handleRegisterStaff = async (e: FormEvent) => {
    e.preventDefault();
    if (!staffEmpNo || !staffFirstName || !staffFatherName) {
      setActionMessage({ text: 'Employee number and full name are required.', type: 'error' });
      return;
    }
    try {
      await api.createAdminStaff({
        employeeNo: staffEmpNo.trim(),
        firstName: staffFirstName.trim(),
        fatherName: staffFatherName.trim(),
        grandfatherName: staffGrandfatherName.trim() || undefined,
        gender: staffGender,
        staffType,
        jobTitle: staffJobTitle.trim(),
        department: staffDept.trim(),
        phone: staffPhone.trim() || undefined,
        email: staffEmail.trim() || undefined,
        createAccount: staffCreateAccount,
        username: staffUsername.trim() || undefined,
        password: staffPassword.trim() || undefined,
        roleCode: staffAccountRole || (staffType === 'teacher' ? 'teacher' : staffType === 'librarian' ? 'librarian' : staffType === 'accountant' ? 'accountant' : 'system_admin')
      });
      setActionMessage({ text: `Staff member '${staffFirstName} ${staffFatherName}' created successfully!`, type: 'success' });
      setStaffEmpNo(`EMP-${Math.floor(1000 + Math.random() * 9000)}`);
      setStaffFirstName('');
      setStaffFatherName('');
      setStaffUsername('');
      setStaffTab('staff_list');
      loadStaff();
      loadUsers();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Staff creation failed: ' + err.message, type: 'error' });
    }
  };

  const handleToggleUserStatus = async (targetUser: any) => {
    const nextStatus = targetUser.status === 'active' ? 'disabled' : 'active';
    try {
      await api.updateAdminUserStatus(targetUser.id, nextStatus);
      setActionMessage({ text: `User account '${targetUser.username}' marked as ${nextStatus}.`, type: 'success' });
      loadUsers();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to update status: ' + err.message, type: 'error' });
    }
  };

  const handleResetPassword = async () => {
    if (!resetPassModalUser || !resetNewPass || resetNewPass.length < 6) {
      setActionMessage({ text: 'Password must be at least 6 characters.', type: 'error' });
      return;
    }
    try {
      await api.resetAdminUserPassword(resetPassModalUser.id, resetNewPass);
      setActionMessage({ text: `Password reset successfully for ${resetPassModalUser.username}!`, type: 'success' });
      setResetPassModalUser(null);
      setResetNewPass('');
    } catch (err: any) {
      setActionMessage({ text: 'Password reset failed: ' + err.message, type: 'error' });
    }
  };

  const handleSaveRoles = async () => {
    if (!rolesModalUser || selectedRoleCodes.length === 0) {
      setActionMessage({ text: 'Please select at least one role.', type: 'error' });
      return;
    }
    try {
      await api.updateAdminUserRoles(rolesModalUser.id, selectedRoleCodes);
      setActionMessage({ text: `Roles updated for user '${rolesModalUser.username}'!`, type: 'success' });
      setRolesModalUser(null);
      loadUsers();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to update roles: ' + err.message, type: 'error' });
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newUserEmail.trim() || !newUserPassword || !newUserRoleCode) {
      setActionMessage({ text: 'Username, email, password, and role are required.', type: 'error' });
      return;
    }
    try {
      await api.createAdminUser({
        username: newUsername.trim(),
        email: newUserEmail.trim(),
        phone: newUserPhone.trim() || undefined,
        password: newUserPassword,
        roleCode: newUserRoleCode
      });
      setActionMessage({ text: `User account '@${newUsername.trim()}' created successfully!`, type: 'success' });
      setNewUserModalOpen(false);
      setNewUsername('');
      setNewUserEmail('');
      setNewUserPhone('');
      setNewUserPassword('Pass#2026');
      setNewUserRoleCode('teacher');
      loadUsers();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to create user: ' + (err.message || 'Unknown error'), type: 'error' });
    }
  };

  // Handlers for Page 4: Academic Structure & Settings
  const handleCreateYear = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createAdminAcademicYear({
        name: newYearName,
        labelEc: newYearLabelEc,
        startDate: newYearStart,
        endDate: newYearEnd
      });
      setActionMessage({ text: `Academic Year '${newYearName}' created!`, type: 'success' });
      setNewYearModalOpen(false);
      loadAcademicStructure();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to create academic year: ' + err.message, type: 'error' });
    }
  };

  const handleActivateYear = async (id: number) => {
    try {
      await api.activateAdminAcademicYear(id);
      setActionMessage({ text: 'Academic year set as active!', type: 'success' });
      loadAcademicStructure();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Activation failed: ' + err.message, type: 'error' });
    }
  };

  const handleCreateTerm = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTermYearId) {
      setActionMessage({ text: 'Please select an academic year.', type: 'error' });
      return;
    }
    const finalTermName = termTypeOption === 'semester_1'
      ? 'Semester 1'
      : termTypeOption === 'semester_2'
      ? 'Semester 2'
      : (customTermName.trim() || newTermName.trim() || 'Term 3');
    const finalTermNo = termTypeOption === 'semester_1'
      ? 1
      : termTypeOption === 'semester_2'
      ? 2
      : Number(newTermNo || 3);
    try {
      await api.createAdminTerm({
        academicYearId: Number(newTermYearId),
        termNo: finalTermNo,
        name: finalTermName,
        startDate: newTermStart,
        endDate: newTermEnd
      });
      setActionMessage({ text: `Term '${finalTermName}' created successfully!`, type: 'success' });
      setNewTermModalOpen(false);
      loadAcademicStructure();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to create term: ' + err.message, type: 'error' });
    }
  };

  const handleActivateTerm = async (id: number) => {
    try {
      await api.activateAdminTerm(id);
      setActionMessage({ text: 'Term set as active term!', type: 'success' });
      loadAcademicStructure();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Activation failed: ' + err.message, type: 'error' });
    }
  };

  const handleCreateSection = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSecGradeId || !newSecName.trim()) return;
    try {
      await api.createAdminSection({
        gradeId: Number(newSecGradeId),
        academicYearId: Number(dashData?.overview?.academic?.academicYear?.id || 3),
        name: newSecName.trim(),
        stream: newSecStream,
        capacity: Number(newSecCapacity),
        homeroomStaffId: newSecHomeroom ? Number(newSecHomeroom) : undefined,
        classroomId: newSecRoom ? Number(newSecRoom) : undefined
      });
      setActionMessage({ text: `Section '${newSecName}' created!`, type: 'success' });
      setNewSecModalOpen(false);
      setNewSecName('');
      loadAcademicStructure();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to create section: ' + err.message, type: 'error' });
    }
  };

  const handleCreateSubject = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSubjCode.trim() || !newSubjName.trim()) return;
    try {
      await api.createAdminSubject({
        code: newSubjCode.trim().toUpperCase(),
        name: newSubjName.trim(),
        nameAm: newSubjNameAm.trim() || undefined
      });
      setActionMessage({ text: `Subject '${newSubjName}' (${newSubjCode}) added!`, type: 'success' });
      setNewSubjModalOpen(false);
      setNewSubjCode('');
      setNewSubjName('');
      setNewSubjNameAm('');
      loadAcademicStructure();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to create subject: ' + err.message, type: 'error' });
    }
  };

  const handleMapGradeSubject = async (e: FormEvent) => {
    e.preventDefault();
    if (!mapGradeId || !mapSubjId) return;
    try {
      await api.addAdminGradeSubject({
        gradeId: Number(mapGradeId),
        subjectId: Number(mapSubjId),
        stream: mapStream,
        periodsPerWeek: Number(mapPeriods)
      });
      setActionMessage({ text: 'Subject mapped to grade curriculum!', type: 'success' });
      setMapSubjModalOpen(false);
      loadAcademicStructure();
    } catch (err: any) {
      setActionMessage({ text: 'Mapping failed: ' + err.message, type: 'error' });
    }
  };

  const handleRemoveGradeSubject = async (id: number) => {
    try {
      await api.removeAdminGradeSubject(id);
      setActionMessage({ text: 'Subject mapping removed from curriculum.', type: 'success' });
      loadAcademicStructure();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to remove mapping: ' + err.message, type: 'error' });
    }
  };

  const handleSaveSetting = async (key: string, value: any) => {
    try {
      await api.updateAdminSetting(key, value);
      setActionMessage({ text: `Setting '${key}' saved!`, type: 'success' });
      loadSettings();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Setting update failed: ' + err.message, type: 'error' });
    }
  };

  // Handlers for Page 5: Assignments & Timetable
  const handleCreateAssignment = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignStaffId || !assignSubjId || !assignSecId || !assignYearId) return;
    try {
      await api.createAdminAssignment({
        staffId: Number(assignStaffId),
        subjectId: Number(assignSubjId),
        sectionId: Number(assignSecId),
        academicYearId: Number(assignYearId)
      });
      setActionMessage({ text: 'Teacher assigned to class & subject!', type: 'success' });
      setAssignModalOpen(false);
      loadAssignments();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Assignment failed: ' + err.message, type: 'error' });
    }
  };

  const handleDeleteAssignment = async (id: number) => {
    try {
      await api.deleteAdminAssignment(id);
      setActionMessage({ text: 'Teaching assignment ended.', type: 'success' });
      loadAssignments();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to delete assignment: ' + err.message, type: 'error' });
    }
  };

  const handleScheduleEntry = async (e: FormEvent) => {
    e.preventDefault();
    if (!schedTermId || !schedSecId || !schedSubjId || !schedStaffId || !schedRoomId || !schedSlotId) {
      setActionMessage({ text: 'Please select all schedule parameters.', type: 'error' });
      return;
    }
    try {
      await api.createAdminTimetableEntry({
        termId: Number(schedTermId),
        sectionId: Number(schedSecId),
        subjectId: Number(schedSubjId),
        staffId: Number(schedStaffId),
        roomId: Number(schedRoomId),
        timeSlotId: Number(schedSlotId)
      });
      setActionMessage({ text: 'Lesson successfully scheduled with zero collision!', type: 'success' });
      setAssignmentTab('timetable');
      loadTimetable();
    } catch (err: any) {
      setActionMessage({ text: 'Timetable collision detected: ' + err.message, type: 'error' });
    }
  };

  const handleDeleteTimetableEntry = async (id: number) => {
    try {
      await api.deleteAdminTimetableEntry(id);
      setActionMessage({ text: 'Timetable entry removed.', type: 'success' });
      loadTimetable();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to delete entry: ' + err.message, type: 'error' });
    }
  };

  // Handlers for Page 6: Attendance & Marks
  const handleApproveMarks = async (assessmentId: number) => {
    try {
      await api.approveAdminMarks(assessmentId);
      setActionMessage({ text: 'Assessment marks officially approved and locked into transcript records!', type: 'success' });
      loadAssessmentsOverview();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Approval failed: ' + err.message, type: 'error' });
    }
  };

  // Handlers for Page 8: Communications, Audit & Profile
  const handleCreateAnnouncement = async (e: FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annContent.trim()) {
      setActionMessage({ text: 'Title and content are required.', type: 'error' });
      return;
    }
    try {
      await api.createAdminAnnouncement({
        title: annTitle.trim(),
        content: annContent.trim(),
        targetRole: annTargetRole,
        status: annStatus
      });
      setActionMessage({ text: 'School announcement created!', type: 'success' });
      setAnnModalOpen(false);
      setAnnTitle('');
      setAnnContent('');
      loadAnnouncements();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to post announcement: ' + err.message, type: 'error' });
    }
  };

  const handleUpdateAnnStatus = async (id: number, status: string) => {
    try {
      await api.setAdminAnnouncementStatus(id, status);
      setActionMessage({ text: `Announcement marked as ${status}.`, type: 'success' });
      loadAnnouncements();
    } catch (err: any) {
      setActionMessage({ text: 'Update failed: ' + err.message, type: 'error' });
    }
  };

  const handleDeleteAnnouncement = async (id: number) => {
    try {
      await api.deleteAdminAnnouncement(id);
      setActionMessage({ text: 'Announcement deleted.', type: 'success' });
      loadAnnouncements();
    } catch (err: any) {
      setActionMessage({ text: 'Delete failed: ' + err.message, type: 'error' });
    }
  };

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.updateAdminProfile({ phone: profilePhone.trim(), email: profileEmail.trim() });
      setActionMessage({ text: 'Administrator profile contact details updated!', type: 'success' });
      loadProfile();
    } catch (err: any) {
      setActionMessage({ text: 'Profile update failed: ' + err.message, type: 'error' });
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newAdminPassword !== confirmAdminPassword) {
      setActionMessage({ text: 'New passwords do not match.', type: 'error' });
      return;
    }
    if (newAdminPassword.length < 6) {
      setActionMessage({ text: 'Password must be at least 6 characters long.', type: 'error' });
      return;
    }
    try {
      await api.changeAdminPassword(currPassword, newAdminPassword);
      setActionMessage({ text: 'Security credentials updated successfully!', type: 'success' });
      setCurrPassword('');
      setNewAdminPassword('');
      setConfirmAdminPassword('');
    } catch (err: any) {
      setActionMessage({ text: 'Password change failed: ' + err.message, type: 'error' });
    }
  };

  const displayName = user.staffName || user.username;

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
            <h1>{dashData?.schoolName || 'HSPSMS PORTAL'}</h1>
            <span>Administrator Control Center</span>
          </div>
        </div>

        <div className="topbar-search">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search students, staff, classes, records..."
            value={studentSearch}
            onChange={(e) => {
              setStudentSearch(e.target.value);
              if (activePage !== 'students') handleNavPage('students');
            }}
          />
        </div>

        <div className="topbar-actions">
          <div className="user-profile-badge">
            <div className="user-avatar">{displayName.charAt(0).toUpperCase()}</div>
            <div className="user-details">
              <div className="user-name">{displayName}</div>
              <div className="user-role-label">System Admin ({user.username})</div>
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

      {/* 2. BODY LAYOUT: EXACTLY 10 MAIN ENTRIES IN SIDEBAR */}
      <div className="teacher-layout">
        <aside className="teacher-sidebar">
          <nav className="sidebar-nav">
            <div className="sidebar-nav-title">Administrator Menu</div>

            {/* Dashboard Overview */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'overview' ? 'active' : ''}`}
              onClick={() => handleNavPage('overview')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span>Dashboard Overview</span>
            </button>

            {/* Student Management */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'students' ? 'active' : ''}`}
              onClick={() => handleNavPage('students')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Student Management</span>
              {dashData?.students?.total ? (
                <span className="sidebar-badge">{dashData.students.total}</span>
              ) : null}
            </button>

            {/* Users & Staff Management */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'staff_users' ? 'active' : ''}`}
              onClick={() => handleNavPage('staff_users')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Users &amp; Staff Management</span>
              {dashData?.staff?.total ? (
                <span className="sidebar-badge">{dashData.staff.total}</span>
              ) : null}
            </button>

            {/* Academic Structure & Configuration */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'academic_structure' ? 'active' : ''}`}
              onClick={() => handleNavPage('academic_structure')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span>Academic Structure &amp; Configuration</span>
              {dashData?.academic?.totalSections ? (
                <span className="sidebar-badge">{dashData.academic.totalSections}</span>
              ) : null}
            </button>

            {/* Teaching Assignments & Timetable */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'assignments_timetable' ? 'active' : ''}`}
              onClick={() => handleNavPage('assignments_timetable')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Teaching Assignments &amp; Timetable</span>
            </button>

            {/* Attendance & Academic Results */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'attendance_results' ? 'active' : ''}`}
              onClick={() => handleNavPage('attendance_results')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span>Attendance &amp; Academic Results</span>
            </button>

            {/* Reports, Analytics & Library Overview */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'reports_library' ? 'active' : ''}`}
              onClick={() => handleNavPage('reports_library')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Reports, Analytics &amp; Library Overview</span>
            </button>

            {/* Communications & Audit Logs */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'communications_audit' ? 'active' : ''}`}
              onClick={() => handleNavPage('communications_audit')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              <span>Communications &amp; Audit Logs</span>
            </button>

            {/* School Settings */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'school_settings' ? 'active' : ''}`}
              onClick={() => handleNavPage('school_settings')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>School Settings</span>
            </button>

            {/* Administrator Profile */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'admin_profile' ? 'active' : ''}`}
              onClick={() => handleNavPage('admin_profile')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Administrator Profile</span>
            </button>
          </nav>

          <div className="sidebar-footer-card">
            <h4>Active Academic Session</h4>
            <p style={{ fontWeight: 700, color: '#1F3A5F' }}>
              {dashData?.academic?.academicYear?.name || '2026/27'} ({dashData?.academic?.academicYear?.label_ec || '2019 E.C.'})
            </p>
            <p style={{ marginTop: '4px', color: '#2E6DA4', fontWeight: 600 }}>
              {dashData?.academic?.currentTerm?.name || 'Semester 1'}
            </p>
          </div>
        </aside>

        {/* 3. MAIN CONTENT CONTAINER */}
        <main className="teacher-content">
          {actionMessage && (
            <div className={`alert-banner alert-${actionMessage.type === 'success' ? 'success' : 'danger'}`}>
              <span>{actionMessage.type === 'success' ? '✓' : '⚠️'} {actionMessage.text}</span>
              <button
                type="button"
                onClick={() => setActionMessage(null)}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 700 }}
              >
                ✕
              </button>
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
              <div className="spinner" style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '32px', height: '32px' }}></div>
              <p style={{ fontWeight: 600 }}>Querying MySQL 8 database records...</p>
            </div>
          ) : error ? (
            <div className="alert-banner alert-danger">
              <span>⚠️ {error}</span>
              <button className="btn-secondary btn-sm" onClick={loadOverviewData} style={{ marginLeft: 16 }}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* ========================================================================= */}
              {/* PAGE 1: DASHBOARD OVERVIEW */}
              {/* ========================================================================= */}
              {activePage === 'overview' && dashData && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Dashboard Overview</span>
                      </div>
                      <h2 className="page-title">{dashData.schoolName || 'Ketema Nigus Secondary & Preparatory School'}</h2>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', background: '#EFF6FF', color: '#1E40AF', padding: '3px 10px', borderRadius: '14px', border: '1px solid #BFDBFE', fontWeight: 600 }}>
                          📅 Academic Year: {dashData.academic?.academicYear?.name || '2026/27'} ({dashData.academic?.academicYear?.label_ec || '2019 E.C.'})
                        </span>
                        <span style={{ fontSize: '12px', background: '#ECFDF5', color: '#065F46', padding: '3px 10px', borderRadius: '14px', border: '1px solid #A7F3D0', fontWeight: 600 }}>
                          ⏳ Active Term: {dashData.academic?.currentTerm?.name || 'Semester 1'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <div className="spec-reference-tag">Live MySQL 8 Connected</div>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => {
                          setAnnModalOpen(true);
                        }}
                      >
                        + Post Announcement
                      </button>
                    </div>
                  </div>

                  {/* QUICK ACTIONS TOOLBAR */}
                  <div className="admin-toolbar" style={{ justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>⚡ Executive Quick Actions:</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button className="btn-secondary btn-sm" onClick={() => { handleNavPage('students'); setStudentTab('register'); }}>
                        + Student Registration
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => { handleNavPage('staff_users'); setStaffTab('add_staff'); }}>
                        + Faculty &amp; Staff Creation
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => { handleNavPage('academic_structure'); setNewSecModalOpen(true); }}>
                        + Class / Section Creation
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => { handleNavPage('assignments_timetable'); setAssignModalOpen(true); }}>
                        + Teacher Assignment
                      </button>
                    </div>
                  </div>

                  {/* SUMMARY CARDS */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <div
                      className="admin-card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleNavPage('students')}
                    >
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Active Students</div>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: '#1F3A5F', margin: '4px 0' }}>
                        {dashData.students?.active ?? 0}
                      </div>
                      <div style={{ fontSize: '11px', color: '#2A7F62' }}>
                        {dashData.students?.total ?? 0} total registered records
                      </div>
                    </div>

                    <div
                      className="admin-card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleNavPage('staff_users')}
                    >
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Faculty &amp; Staff</div>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: '#2A7F62', margin: '4px 0' }}>
                        {dashData.staff?.total ?? 0}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {dashData.staff?.teachers ?? 0} Teachers • {dashData.staff?.administrators ?? 0} Admins
                      </div>
                    </div>

                    <div
                      className="admin-card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleNavPage('academic_structure')}
                    >
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Academic Sections</div>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: '#2E6DA4', margin: '4px 0' }}>
                        {dashData.academic?.totalSections ?? 0}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {dashData.academic?.totalSubjects ?? 0} Subjects • {dashData.academic?.totalClassrooms ?? 0} Rooms
                      </div>
                    </div>

                    <div
                      className="admin-card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleNavPage('attendance_results')}
                    >
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Attendance Rate</div>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: '#0369A1', margin: '4px 0' }}>
                        {dashData.attendance?.attendanceRate ?? 95}%
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {dashData.attendance?.totalRecords?.toLocaleString() || 0} attendance records logged
                      </div>
                    </div>

                    <div className="admin-card">
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Finance &amp; Fees</div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#B7791F', margin: '4px 0' }}>
                        ETB {Number(dashData.finance?.totalCollected || 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        Outstanding: ETB {Number(dashData.finance?.outstandingBalance || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* ALERTS SECTION */}
                  {dashData.alerts && dashData.alerts.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1F3A5F', marginBottom: '12px' }}>
                        ⚠️ System Monitoring &amp; Administrative Alerts
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                        {dashData.alerts.map((alt: any) => (
                          <div
                            key={alt.id}
                            style={{
                              background: alt.type === 'danger' ? '#FEF2F2' : alt.type === 'warning' ? '#FFFBEB' : '#EFF6FF',
                              border: `1px solid ${alt.type === 'danger' ? '#FECACA' : alt.type === 'warning' ? '#FDE68A' : '#BFDBFE'}`,
                              borderRadius: '8px',
                              padding: '14px',
                              cursor: 'pointer'
                            }}
                            onClick={() => handleNavPage(alt.targetTab as AdminMainPage)}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#1E293B' }}>{alt.title}</span>
                              <span
                                style={{
                                  background: alt.type === 'danger' ? '#EF4444' : alt.type === 'warning' ? '#F59E0B' : '#3B82F6',
                                  color: '#FFFFFF',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: '12px'
                                }}
                              >
                                {alt.count}
                              </span>
                            </div>
                            <p style={{ fontSize: '12px', color: '#475569', margin: '6px 0 0' }}>{alt.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ENROLLMENT & ATTENDANCE TREND CHARTS */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '24px' }}>
                    {/* Enrollment Breakdown Chart */}
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📊 Enrollment Breakdown by Grade (9–12) &amp; Stream</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Real Database Records</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {dashData.enrollmentByGrade && dashData.enrollmentByGrade.map((eg: any) => {
                          const total = Number(dashData.students?.total || 1);
                          const count = Number(eg.student_count || 0);
                          const pct = Math.min(100, Math.round((count / total) * 100));
                          return (
                            <div key={eg.grade_level}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600 }}>
                                <span>{eg.grade_name}</span>
                                <span>{count} students ({pct}%)</span>
                              </div>
                              <div className="progress-track">
                                <div
                                  className="progress-fill"
                                  style={{
                                    width: `${Math.max(8, pct)}%`,
                                    background: eg.grade_level >= 11 ? '#2E6DA4' : '#2A7F62'
                                  }}
                                ></div>
                              </div>
                              {eg.grade_level >= 11 && (
                                <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
                                  🔬 Natural Science: {eg.natural_science_count || 0} • 📚 Social Science: {eg.social_science_count || 0}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Today Attendance & Recent Trend */}
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📅 Today's Institutional Attendance</h4>
                        <span className="status-tag active">Live Status</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginBottom: '18px' }}>
                        <div>
                          <div style={{ fontSize: '24px', fontWeight: 800, color: '#2A7F62' }}>{dashData.todayAttendance?.present ?? 0}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Present</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '24px', fontWeight: 800, color: '#C0392B' }}>{dashData.todayAttendance?.absent ?? 0}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Absent</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '24px', fontWeight: 800, color: '#B7791F' }}>{dashData.todayAttendance?.late ?? 0}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Late</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '24px', fontWeight: 800, color: '#2E6DA4' }}>{dashData.todayAttendance?.sessions ?? 0}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Sessions</div>
                        </div>
                      </div>

                      <h5 style={{ fontSize: '12px', fontWeight: 700, color: '#1F3A5F', margin: '14px 0 8px' }}>
                        Recent Daily Attendance Rates (%):
                      </h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {dashData.recentAttendanceTrend && dashData.recentAttendanceTrend.length > 0 ? (
                          dashData.recentAttendanceTrend.slice(0, 5).map((rt: any) => (
                            <div key={rt.attendance_date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', alignItems: 'center' }}>
                              <span style={{ color: '#475569' }}>{new Date(rt.attendance_date).toLocaleDateString()}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 700, color: Number(rt.rate) >= 90 ? '#2A7F62' : '#B7791F' }}>{rt.rate}%</span>
                                <span style={{ fontSize: '11px', color: '#94A3B8' }}>({rt.total_logged} logged)</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: '12px', color: '#94A3B8' }}>No past attendance trend logged yet.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* RECENT AUDIT ACTIVITIES & ANNOUNCEMENTS */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">🛡️ Recent Administrative Activities</h4>
                        <button className="btn-secondary btn-sm" onClick={() => handleNavPage('communications_audit')}>
                          View All Logs
                        </button>
                      </div>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>Actor</th>
                              <th>Action</th>
                              <th>Outcome</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashData.recentAuditLogs && dashData.recentAuditLogs.slice(0, 6).map((log: any) => (
                              <tr key={log.id}>
                                <td style={{ fontSize: '11px', color: '#64748B' }}>
                                  {new Date(log.occurred_at || log.created_at).toLocaleString()}
                                </td>
                                <td style={{ fontWeight: 600 }}>{log.actor_username || 'admin'}</td>
                                <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{log.action}</td>
                                <td>
                                  <span className={`status-tag ${log.outcome === 'success' ? 'success' : 'failure'}`}>
                                    {log.outcome}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📢 Active Notices &amp; Bulletins</h4>
                        <button className="btn-secondary btn-sm" onClick={() => setAnnModalOpen(true)}>
                          + New
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {dashData.announcements && dashData.announcements.length > 0 ? (
                          dashData.announcements.slice(0, 4).map((ann: any) => (
                            <div key={ann.id} style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>{ann.title}</span>
                                <span className="status-tag active">{ann.target_role || 'All'}</span>
                              </div>
                              <p style={{ fontSize: '12px', color: '#475569', margin: '4px 0' }}>
                                {ann.content || ann.body}
                              </p>
                              <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                                {new Date(ann.created_at || Date.now()).toLocaleDateString()}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: '#94A3B8', fontSize: '12px' }}>No announcements published yet.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================================================= */}
              {/* PAGE 2: STUDENT MANAGEMENT */}
              {/* ========================================================================= */}
              {activePage === 'students' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Student Management</span>
                      </div>
                      <h2 className="page-title">Student Records, Admissions &amp; Placement</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        className="btn-secondary"
                        onClick={exportStudentRecords}
                      >
                        📥 Export CSV
                      </button>
                      <button className="btn-primary" onClick={() => selectStudentTab('register')}>
                        + Register New Student
                      </button>
                    </div>
                  </div>

                  {/* SUB-NAVIGATION TABS */}
                  <div className="admin-subnav">
                    <button
                      className={`admin-subtab-btn ${studentTab === 'directory' ? 'active' : ''}`}
                      onClick={() => selectStudentTab('directory')}
                    >
                      <span>Student Directory &amp; Records</span>
                          <span className="badge-pill">{studentDirectoryTotal}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${studentTab === 'register' ? 'active' : ''}`}
                      onClick={() => selectStudentTab('register')}
                    >
                      <span>New Student Admission Form</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${studentTab === 'transfers' ? 'active' : ''}`}
                      onClick={() => selectStudentTab('transfers')}
                    >
                      <span>Transfers &amp; Withdrawals History</span>
                      <span className="badge-pill">{transfersList.length}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${studentTab === 'incomplete' ? 'active' : ''}`}
                      onClick={() => selectStudentTab('incomplete')}
                    >
                      <span>Incomplete Records Audit</span>
                    </button>
                  </div>

                  {/* TAB 1: DIRECTORY */}
                  {studentTab === 'directory' && (
                    <div className="admin-card">
                      {/* FILTERS */}
                      <div className="admin-toolbar">
                        <input
                          type="text"
                          placeholder="Search admission no, student name, phone..."
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          style={{ minWidth: '220px' }}
                        />
                        <select value={studentGradeFilter} onChange={(e) => setStudentGradeFilter(e.target.value)}>
                          <option value="">All Grades (9–12)</option>
                          {academicStructure?.grades?.map((grade: any) => <option key={grade.id} value={grade.id}>{grade.display_name}</option>)}
                        </select>
                        <select value={studentSectionFilter} onChange={(e) => setStudentSectionFilter(e.target.value)}>
                          <option value="">All Sections</option>
                          {academicStructure?.sections?.map((sec: any) => (
                            <option key={sec.id} value={sec.id}>{sec.grade_name} - {sec.name}</option>
                          ))}
                        </select>
                        <select value={studentStatusFilter} onChange={(e) => setStudentStatusFilter(e.target.value)}>
                          <option value="">All Statuses</option>
                          {studentOptions?.statuses.map((status) => <option key={status} value={status}>{formatStudentOption(status)}</option>)}
                        </select>
                        <select value={studentStreamFilter} onChange={(e) => setStudentStreamFilter(e.target.value)}>
                          <option value="">All Streams</option>
                          {studentOptions?.streams.map((stream) => <option key={stream} value={stream}>{stream === 'none' ? 'General / Common' : formatStudentOption(stream)}</option>)}
                        </select>
                        <select value={studentGenderFilter} onChange={(e) => setStudentGenderFilter(e.target.value)} aria-label="Filter by gender">
                          <option value="">All Genders</option>
                          {studentOptions?.genders.map((gender) => <option key={gender} value={gender}>{formatStudentOption(gender)}</option>)}
                        </select>
                        <button className="btn-secondary btn-sm" onClick={() => loadStudents(1, false)}>
                          Filter Records
                        </button>
                      </div>

                      {/* STUDENTS TABLE */}
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Admission No</th>
                              <th>Student Name</th>
                              <th>Grade &amp; Section</th>
                              <th>Stream</th>
                              <th>Gender</th>
                              <th>Primary Guardian</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentsList.length > 0 ? (
                              studentsList.map((s) => (
                                <tr key={s.id}>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{s.admission_no}</td>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{s.first_name} {s.father_name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>DOB: {s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString() : 'N/A'}</div>
                                  </td>
                                  <td>
                                    <div>{s.grade_name || `Grade ${s.grade_level}`}</div>
                                    <div style={{ fontSize: '11px', color: '#2E6DA4', fontWeight: 600 }}>{s.section_name || 'Unassigned'}</div>
                                  </td>
                                  <td>
                                    <span style={{ fontSize: '12px' }}>
                                      {s.section_stream === 'natural_science' ? '🔬 Natural Sci' : s.section_stream === 'social_science' ? '📚 Social Sci' : 'Common'}
                                    </span>
                                  </td>
                                  <td style={{ textTransform: 'capitalize' }}>{s.gender}</td>
                                  <td style={{ fontSize: '12px' }}>{s.primary_guardian || 'None Linked'}</td>
                                  <td>
                                    <span className={`status-tag ${s.student_status}`}>
                                      {s.student_status}
                                    </span>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <button
                                        className="btn-secondary btn-sm"
                                        title="View Profile Details"
                                        onClick={() => handleOpenStudentDetails(s)}
                                      >
                                        Profile
                                      </button>
                                      <button
                                        className="btn-secondary btn-sm"
                                        title="Change Status"
                                        onClick={() => { setStatusModalStudent(s); setNewStatus(''); setStatusReason(''); setDestinationSchool(''); setStatusEffectiveDate(getLocalDateInputValue()); setStatusSectionId(''); }}
                                      >
                                        Status
                                      </button>
                                      <button
                                        className="btn-secondary btn-sm"
                                        title="Reassign Section"
                                        onClick={() => setReassignModalStudent(s)}
                                      >
                                        Section
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                                  No student records found matching the current search parameters.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="admin-toolbar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Showing {studentTotal === 0 ? 0 : (studentPage - 1) * studentPageSize + 1}–{Math.min(studentPage * studentPageSize, studentTotal)} of {studentTotal} records</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button className="btn-secondary btn-sm" disabled={studentPage <= 1} onClick={() => loadStudents(studentPage - 1, studentAuditMode)}>Previous</button>
                          <span>Page {studentPage} of {Math.max(1, Math.ceil(studentTotal / studentPageSize))}</span>
                          <button className="btn-secondary btn-sm" disabled={studentPage >= Math.ceil(studentTotal / studentPageSize)} onClick={() => loadStudents(studentPage + 1, studentAuditMode)}>Next</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: REGISTER STUDENT */}
                  {studentTab === 'register' && (
                    <div className="admin-card" style={{ maxWidth: '800px', margin: '0 auto' }}>
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📝 New Student Admission Registration</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Transaction-Secured Registration</span>
                      </div>
                      <form onSubmit={handleRegisterStudent}>
                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Admission Number</label>
                            <input type="text" value="Generated after registration" readOnly aria-readonly="true" />
                            <small>The system assigns the next unique admission number when you save.</small>
                          </div>
                          <div className="form-field">
                            <label>Assigned Section &amp; Available Seats *</label>
                            <select
                              value={regSectionId}
                              onChange={(e) => setRegSectionId(e.target.value)}
                              required
                            >
                              <option value="">Select Section</option>
                              {academicStructure?.sections?.map((sec: any) => (
                                <option key={sec.id} value={sec.id}>
                                  {sec.grade_name} - {sec.name} ({sec.stream}) • {sec.capacity - sec.enrolled_count} seats left
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>First Name *</label>
                            <input
                              type="text"
                              placeholder="Enter first name"
                              value={regFirstName}
                              onChange={(e) => setRegFirstName(e.target.value)}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <label>Father's Name *</label>
                            <input
                              type="text"
                              placeholder="Enter father's name"
                              value={regFatherName}
                              onChange={(e) => setRegFatherName(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Grandfather's Name</label>
                            <input
                              type="text"
                              placeholder="Enter grandfather's name"
                              value={regGrandfatherName}
                              onChange={(e) => setRegGrandfatherName(e.target.value)}
                            />
                          </div>
                          <div className="form-field">
                            <label>Gender *</label>
                            <select
                              value={regGender}
                              onChange={(e) => setRegGender(e.target.value as '' | 'female' | 'male')}
                              required
                            >
                              <option value="">Select gender</option>
                              {studentOptions?.genders.map((gender) => <option key={gender} value={gender}>{formatStudentOption(gender)}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Date of Birth *</label>
                            <input
                              type="date"
                              max={getLocalDateInputValue()}
                              value={regDob}
                              onChange={(e) => setRegDob(e.target.value)}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <label>Student Contact Phone</label>
                            <input
                              type="text"
                              placeholder="Enter phone number"
                              value={regPhone}
                              onChange={(e) => setRegPhone(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="form-field">
                          <label>Home Address</label>
                          <input
                            type="text"
                            placeholder="Enter home address"
                            value={regAddress}
                            onChange={(e) => setRegAddress(e.target.value)}
                          />
                        </div>

                        <div className="form-field" style={{ marginTop: 12 }}>
                          <label htmlFor="student-admission-photo">Student Photo</label>
                          <input
                            id="student-admission-photo"
                            type="file"
                            accept="image/jpeg,image/png"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (!file) { setRegPhoto(null); return; }
                              if (!['image/jpeg', 'image/png'].includes(file.type)) {
                                event.currentTarget.value = '';
                                setRegPhoto(null);
                                setActionMessage({ text: 'Choose a JPEG or PNG image for the student photo.', type: 'error' });
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (typeof reader.result === 'string') setRegPhoto({ originalName: file.name, mimeType: file.type, dataBase64: reader.result });
                              };
                              reader.onerror = () => setActionMessage({ text: 'Could not read the selected photo.', type: 'error' });
                              reader.readAsDataURL(file);
                            }}
                          />
                          <small>Optional. JPEG or PNG, within the upload size limit configured in School Settings.</small>
                          {regPhoto && <img src={regPhoto.dataBase64} alt="Student photo preview" style={{ display: 'block', width: 96, height: 96, objectFit: 'cover', borderRadius: 8, marginTop: 8 }} />}
                        </div>

                        <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#1F3A5F', margin: '18px 0 10px' }}>
                          👨‍👩‍👧 Primary Guardian / Emergency Contact
                        </h5>
                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Guardian Full Name</label>
                            <input
                              type="text"
                              placeholder="Enter guardian name"
                              required={Boolean(regGuardianPhone.trim())}
                              value={regGuardianName}
                              onChange={(e) => setRegGuardianName(e.target.value)}
                            />
                          </div>
                          <div className="form-field">
                            <label>Guardian Phone</label>
                            <input
                              type="text"
                              placeholder="Enter guardian phone"
                              required={Boolean(regGuardianName.trim())}
                              value={regGuardianPhone}
                              onChange={(e) => setRegGuardianPhone(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="form-field">
                          <label>Relationship to Student</label>
                          <select
                            value={regGuardianRelation}
                            onChange={(e) => setRegGuardianRelation(e.target.value)}
                            required={Boolean(regGuardianName.trim() || regGuardianPhone.trim())}
                          >
                            <option value="">Select relationship</option>
                            {studentOptions?.guardianRelationships.map((relationship) => <option key={relationship} value={relationship}>{formatStudentOption(relationship)}</option>)}
                          </select>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                          <button type="button" className="btn-secondary" onClick={() => setStudentTab('directory')}>
                            Cancel
                          </button>
                          <button type="submit" className="btn-primary">
                            Complete Admission &amp; Place Student
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* TAB 3: TRANSFERS & WITHDRAWALS */}
                  {studentTab === 'transfers' && (
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📋 Historical Transfers, Relocations &amp; Withdrawals</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Audit trail of student status changes</span>
                      </div>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Admission No</th>
                              <th>Student Name</th>
                              <th>Action Type</th>
                              <th>Destination School</th>
                              <th>Effective Date</th>
                              <th>Reason</th>
                              <th>Authorized By</th>
                            </tr>
                          </thead>
                          <tbody>
                            {transfersList.length > 0 ? (
                              transfersList.map((t) => (
                                <tr key={t.id}>
                                  <td style={{ fontWeight: 700 }}>{t.admission_no}</td>
                                  <td style={{ fontWeight: 600 }}>{t.student_name}</td>
                                  <td>
                                    <span className="status-tag warning">{t.type}</span>
                                  </td>
                                  <td>{t.destination_school || 'N/A'}</td>
                                  <td>{new Date(t.effective_date).toLocaleDateString()}</td>
                                  <td style={{ fontSize: '12px', color: '#475569' }}>{t.reason}</td>
                                  <td style={{ fontSize: '12px', fontWeight: 600 }}>{t.approved_by_user || 'Admin'}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                                  No transfers or withdrawals recorded yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: INCOMPLETE RECORDS AUDIT */}
                  {studentTab === 'incomplete' && (
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">⚠️ Incomplete Student Records Audit</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Identify missing information</span>
                      </div>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Admission No</th>
                              <th>Student Name</th>
                              <th>Missing Information</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentsList.length > 0 ? (
                              studentsList.map((s) => (
                                  <tr key={s.id}>
                                    <td style={{ fontWeight: 700 }}>{s.admission_no}</td>
                                    <td>{s.first_name} {s.father_name}</td>
                                    <td>
                                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {!s.primary_guardian && <span className="status-tag danger">Missing Guardian</span>}
                                        {!s.phone && <span className="status-tag warning">Missing Phone</span>}
                                        {s.student_status === 'applicant' && <span className="status-tag info">Unapproved Applicant</span>}
                                      </div>
                                    </td>
                                    <td>
                                      <button className="btn-secondary btn-sm" onClick={() => handleOpenStudentDetails(s)}>
                                        Complete Record
                                      </button>
                                    </td>
                                  </tr>
                                ))
                            ) : (
                              <tr>
                                <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#2A7F62', fontWeight: 600 }}>
                                  ✓ All registered students have complete profiles and linked emergency contacts!
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <div className="admin-toolbar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Showing {studentTotal === 0 ? 0 : (studentPage - 1) * studentPageSize + 1}–{Math.min(studentPage * studentPageSize, studentTotal)} of {studentTotal} incomplete records</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button className="btn-secondary btn-sm" disabled={studentPage <= 1} onClick={() => loadStudents(studentPage - 1, true)}>Previous</button>
                          <span>Page {studentPage} of {Math.max(1, Math.ceil(studentTotal / studentPageSize))}</span>
                          <button className="btn-secondary btn-sm" disabled={studentPage >= Math.ceil(studentTotal / studentPageSize)} onClick={() => loadStudents(studentPage + 1, true)}>Next</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* PAGE 3: STAFF AND USER MANAGEMENT */}
              {/* ========================================================================= */}
              {activePage === 'staff_users' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Users &amp; Staff Management</span>
                      </div>
                      <h2 className="page-title">Faculty, Staff &amp; System Authentication Accounts</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          const headers = ['Employee No', 'Full Name', 'Type', 'Job Title', 'Department', 'Phone', 'Email', 'Status'];
                          const rows = staffList.map((st) => [
                            st.employee_no,
                            `${st.first_name} ${st.father_name}`,
                            st.staff_type,
                            st.job_title,
                            st.department,
                            st.phone || 'N/A',
                            st.email || 'N/A',
                            st.status
                          ]);
                          exportToCSV('Staff_Directory_Export', headers, rows);
                        }}
                      >
                        📥 Export CSV
                      </button>
                      <button className="btn-primary" onClick={() => setStaffTab('add_staff')}>
                        + Register New Staff
                      </button>
                    </div>
                  </div>

                  {/* SUB-NAV */}
                  <div className="admin-subnav">
                    <button
                      className={`admin-subtab-btn ${staffTab === 'staff_list' ? 'active' : ''}`}
                      onClick={() => setStaffTab('staff_list')}
                    >
                      <span>Faculty &amp; Staff Directory</span>
                      <span className="badge-pill">{staffList.length}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${staffTab === 'add_staff' ? 'active' : ''}`}
                      onClick={() => setStaffTab('add_staff')}
                    >
                      <span>Register Staff &amp; Link Account</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${staffTab === 'users_list' ? 'active' : ''}`}
                      onClick={() => setStaffTab('users_list')}
                    >
                      <span>Login Accounts, Roles &amp; Security</span>
                      <span className="badge-pill">{usersList.length}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${staffTab === 'workloads' ? 'active' : ''}`}
                      onClick={() => {
                        setStaffTab('workloads');
                        loadReports('workload');
                      }}
                    >
                      <span>Teacher Assignment Summaries</span>
                    </button>
                  </div>

                  {/* TAB 1: STAFF LIST */}
                  {staffTab === 'staff_list' && (
                    <div className="admin-card">
                      <div className="admin-toolbar">
                        <input
                          type="text"
                          placeholder="Search employee no, staff name, department..."
                          value={staffSearch}
                          onChange={(e) => setStaffSearch(e.target.value)}
                          style={{ minWidth: '240px' }}
                        />
                        <select value={staffTypeFilter} onChange={(e) => setStaffTypeFilter(e.target.value)}>
                          <option value="">All Roles (Teachers, Admins, etc.)</option>
                          <option value="teacher">Teachers &amp; Faculty</option>
                          <option value="administrator">Administrators</option>
                          <option value="librarian">Librarians</option>
                          <option value="accountant">Accountants</option>
                          <option value="support">Support Staff</option>
                        </select>
                        <button className="btn-secondary btn-sm" onClick={loadStaff}>
                          Search
                        </button>
                      </div>

                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Employee No</th>
                              <th>Staff Name</th>
                              <th>Role / Type</th>
                              <th>Department</th>
                              <th>Job Title</th>
                              <th>Contact</th>
                              <th>User Account</th>
                              <th>Assigned Sections</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {staffList.map((st) => (
                              <tr key={st.id}>
                                <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{st.employee_no}</td>
                                <td style={{ fontWeight: 600 }}>{st.first_name} {st.father_name}</td>
                                <td>
                                  <span className="status-tag info" style={{ textTransform: 'capitalize' }}>
                                    {st.staff_type}
                                  </span>
                                </td>
                                <td>{st.department}</td>
                                <td style={{ fontSize: '12px' }}>{st.job_title}</td>
                                <td style={{ fontSize: '12px' }}>{st.phone || st.email || 'N/A'}</td>
                                <td>
                                  {st.linked_username ? (
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#2A7F62' }}>
                                      ✓ @{st.linked_username}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>No login</span>
                                  )}
                                </td>
                                <td>
                                  <span style={{ fontWeight: 700, color: '#2E6DA4' }}>
                                    {st.active_assignments_count || 0} classes
                                  </span>
                                </td>
                                <td>
                                  <span className={`status-tag ${st.status}`}>{st.status}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: REGISTER STAFF */}
                  {staffTab === 'add_staff' && (
                    <div className="admin-card" style={{ maxWidth: '800px', margin: '0 auto' }}>
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">👔 Register Faculty / Staff Member</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>HR &amp; Account Provisioning</span>
                      </div>
                      <form onSubmit={handleRegisterStaff}>
                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Employee Number *</label>
                            <input
                              type="text"
                              value={staffEmpNo}
                              onChange={(e) => setStaffEmpNo(e.target.value)}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <label>Staff Type *</label>
                            <select
                              value={staffType}
                              onChange={(e) => setStaffType(e.target.value as any)}
                            >
                              <option value="teacher">Teacher / Faculty</option>
                              <option value="administrator">System Administrator</option>
                              <option value="librarian">Librarian</option>
                              <option value="accountant">Accountant / Finance</option>
                              <option value="support">Support Staff</option>
                            </select>
                          </div>
                        </div>

                        <div className="form-grid-3">
                          <div className="form-field">
                            <label>First Name *</label>
                            <input
                              type="text"
                              placeholder="e.g. Elias"
                              value={staffFirstName}
                              onChange={(e) => setStaffFirstName(e.target.value)}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <label>Father's Name *</label>
                            <input
                              type="text"
                              placeholder="e.g. Kebede"
                              value={staffFatherName}
                              onChange={(e) => setStaffFatherName(e.target.value)}
                              required
                            />
                          </div>
                          <div className="form-field">
                            <label>Grandfather's Name</label>
                            <input
                              type="text"
                              placeholder="e.g. Wolde"
                              value={staffGrandfatherName}
                              onChange={(e) => setStaffGrandfatherName(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Gender *</label>
                            <select
                              value={staffGender}
                              onChange={(e) => setStaffGender(e.target.value as 'female' | 'male')}
                            >
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                            </select>
                          </div>
                        </div>

                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Department</label>
                            <input
                              type="text"
                              placeholder="e.g. Physics & Natural Sciences"
                              value={staffDept}
                              onChange={(e) => setStaffDept(e.target.value)}
                            />
                          </div>
                          <div className="form-field">
                            <label>Job Title</label>
                            <input
                              type="text"
                              placeholder="e.g. Senior Physics Teacher"
                              value={staffJobTitle}
                              onChange={(e) => setStaffJobTitle(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Contact Phone</label>
                            <input
                              type="text"
                              placeholder="+251..."
                              value={staffPhone}
                              onChange={(e) => setStaffPhone(e.target.value)}
                            />
                          </div>
                          <div className="form-field">
                            <label>Email Address</label>
                            <input
                              type="email"
                              placeholder="staff@school.et"
                              value={staffEmail}
                              onChange={(e) => setStaffEmail(e.target.value)}
                            />
                          </div>
                        </div>

                        <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: '14px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={staffCreateAccount}
                              onChange={(e) => setStaffCreateAccount(e.target.checked)}
                            />
                            Provision System Login Account for this Staff Member
                          </label>

                          {staffCreateAccount && (
                            <div className="form-grid-3" style={{ marginTop: '12px' }}>
                              <div className="form-field">
                                <label>Login Username *</label>
                                <input
                                  type="text"
                                  placeholder="e.g. t.elias or adm.john"
                                  value={staffUsername}
                                  onChange={(e) => setStaffUsername(e.target.value)}
                                  required={staffCreateAccount}
                                />
                              </div>
                              <div className="form-field">
                                <label>Initial Password *</label>
                                <input
                                  type="text"
                                  value={staffPassword}
                                  onChange={(e) => setStaffPassword(e.target.value)}
                                  required={staffCreateAccount}
                                />
                              </div>
                              <div className="form-field">
                                <label>Account Role *</label>
                                <select
                                  value={staffAccountRole}
                                  onChange={(e) => setStaffAccountRole(e.target.value)}
                                  required={staffCreateAccount}
                                >
                                  <option value="system_admin">Administrator (System Administrator)</option>
                                  <option value="principal">Principal</option>
                                  <option value="academic_director">Academic Director</option>
                                  <option value="registrar">Registrar</option>
                                  <option value="teacher">Teacher</option>
                                  <option value="accountant">Accountant</option>
                                  <option value="librarian">Librarian</option>
                                </select>
                              </div>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                          <button type="button" className="btn-secondary" onClick={() => setStaffTab('staff_list')}>
                            Cancel
                          </button>
                          <button type="submit" className="btn-primary">
                            Register Staff Member
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* TAB 3: USER ACCOUNTS & ROLES */}
                  {staffTab === 'users_list' && (
                    <div className="admin-card">
                      <div className="admin-toolbar">
                        <input
                          type="text"
                          placeholder="Search username, email, full name..."
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          style={{ minWidth: '220px' }}
                        />
                        <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)}>
                          <option value="">All Roles</option>
                          <option value="system_admin">System Admin</option>
                          <option value="principal">Principal</option>
                          <option value="teacher">Teacher</option>
                          <option value="registrar">Registrar</option>
                          <option value="librarian">Librarian</option>
                          <option value="student">Student</option>
                          <option value="guardian">Parent/Guardian</option>
                        </select>
                        <button className="btn-secondary btn-sm" onClick={loadUsers}>
                          Filter
                        </button>
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => setNewUserModalOpen(true)}
                          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <span>+ Register New User</span>
                        </button>
                      </div>

                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Username</th>
                              <th>Display Identity</th>
                              <th>Email</th>
                              <th>Assigned Role(s)</th>
                              <th>Account Status</th>
                              <th>Last Sign In</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {usersList.map((u) => (
                              <tr key={u.id}>
                                <td style={{ fontWeight: 700, color: '#1F3A5F' }}>@{u.username}</td>
                                <td>{u.displayName || u.username}</td>
                                <td style={{ fontSize: '12px' }}>{u.email}</td>
                                <td>
                                  <span className="status-tag info">{u.roles || 'No Role'}</span>
                                </td>
                                <td>
                                  <span className={`status-tag ${u.status}`}>{u.status}</span>
                                </td>
                                <td style={{ fontSize: '11px', color: '#64748B' }}>
                                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                      className="btn-secondary btn-sm"
                                      onClick={() => handleToggleUserStatus(u)}
                                    >
                                      {u.status === 'active' ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button
                                      className="btn-secondary btn-sm"
                                      onClick={() => {
                                        setResetPassModalUser(u);
                                        setResetNewPass('Pass#' + Math.floor(1000 + Math.random() * 9000));
                                      }}
                                    >
                                      Reset Pass
                                    </button>
                                    <button
                                      className="btn-secondary btn-sm"
                                      onClick={() => {
                                        setRolesModalUser(u);
                                        setSelectedRoleCodes(u.roleCodes || []);
                                      }}
                                    >
                                      Roles
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: TEACHER WORKLOADS */}
                  {staffTab === 'workloads' && (
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📈 Faculty Teaching Assignment &amp; Workload Matrix</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Real Database Assignment Tracking</span>
                      </div>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Teacher Name</th>
                              <th>Employee No</th>
                              <th>Department</th>
                              <th>Assigned Sections</th>
                              <th>Subjects Taught</th>
                              <th>Weekly Timetable Periods</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workloadReport.map((w) => (
                              <tr key={w.id}>
                                <td style={{ fontWeight: 600 }}>{w.teacher_name}</td>
                                <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{w.employee_no}</td>
                                <td>{w.department}</td>
                                <td>
                                  <span style={{ fontWeight: 700, color: '#2E6DA4' }}>{w.total_sections} sections</span>
                                </td>
                                <td>{w.subjects_list || 'None'}</td>
                                <td>
                                  <span style={{ fontWeight: 800, color: '#2A7F62' }}>{w.weekly_periods} periods/week</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* PAGE 4: ACADEMIC STRUCTURE AND CONFIGURATION */}
              {/* ========================================================================= */}
              {activePage === 'academic_structure' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Academic Structure &amp; Configuration</span>
                      </div>
                      <h2 className="page-title">Curriculum, Classes &amp; Academic Configuration</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-secondary" onClick={() => setNewSecModalOpen(true)}>
                        + New Section
                      </button>
                      <button className="btn-primary" onClick={() => setNewSubjModalOpen(true)}>
                        + New Subject
                      </button>
                    </div>
                  </div>

                  {/* SUB-NAV */}
                  <div className="admin-subnav">
                    <button
                      className={`admin-subtab-btn ${academicTab === 'years_terms' ? 'active' : ''}`}
                      onClick={() => setAcademicTab('years_terms')}
                    >
                      <span>Academic Years &amp; Terms</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${academicTab === 'sections' ? 'active' : ''}`}
                      onClick={() => setAcademicTab('sections')}
                    >
                      <span>Grades &amp; Sections (9–12)</span>
                      <span className="badge-pill">{academicStructure?.sections?.length || 0}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${academicTab === 'subjects' ? 'active' : ''}`}
                      onClick={() => setAcademicTab('subjects')}
                    >
                      <span>Curriculum Subjects &amp; Mappings</span>
                      <span className="badge-pill">{academicStructure?.subjects?.length || 0}</span>
                    </button>
                  </div>

                  {/* TAB 1: YEARS & TERMS */}
                  {academicTab === 'years_terms' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                      <div className="admin-card">
                        <div className="admin-card-header">
                          <h4 className="admin-card-title">📅 Academic Years</h4>
                          <button className="btn-primary btn-sm" onClick={() => setNewYearModalOpen(true)}>
                            + New Academic Year
                          </button>
                        </div>
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Year Name</th>
                                <th>EC Calendar</th>
                                <th>Dates</th>
                                <th>Status</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {academicStructure?.academicYears?.map((ay: any) => (
                                <tr key={ay.id}>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{ay.name}</td>
                                  <td>{ay.label_ec || 'N/A'}</td>
                                  <td style={{ fontSize: '11px', color: '#64748B' }}>
                                    {new Date(ay.start_date).toLocaleDateString()} – {new Date(ay.end_date).toLocaleDateString()}
                                  </td>
                                  <td>
                                    <span className={`status-tag ${ay.status === 'active' || ay.is_current ? 'active' : 'draft'}`}>
                                      {ay.status} {ay.is_current ? '★ (Active)' : ''}
                                    </span>
                                  </td>
                                  <td>
                                    {!ay.is_current && (
                                      <button className="btn-secondary btn-sm" onClick={() => handleActivateYear(ay.id)}>
                                        Make Active
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="admin-card">
                        <div className="admin-card-header">
                          <h4 className="admin-card-title">⏳ Academic Terms / Semesters</h4>
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => {
                              if (academicStructure?.academicYears?.length > 0) {
                                const activeYr = academicStructure.academicYears.find((y: any) => y.is_current || y.status === 'active') || academicStructure.academicYears[0];
                                setNewTermYearId(activeYr.id);
                                const yStart = new Date(activeYr.start_date).getFullYear();
                                setNewTermStart(`${yStart}-09-10`);
                                setNewTermEnd(`${yStart + 1}-01-30`);
                              }
                              setTermTypeOption('semester_1');
                              setNewTermNo(1);
                              setNewTermName('Semester 1');
                              setCustomTermName('');
                              setNewTermModalOpen(true);
                            }}
                          >
                            + New Term / Semester
                          </button>
                        </div>
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Term / Semester</th>
                                <th>Academic Year</th>
                                <th>Calendar Duration</th>
                                <th>Status</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {academicStructure?.terms?.map((t: any) => (
                                <tr key={t.id}>
                                  <td>
                                    <div style={{ fontWeight: 700, color: '#1F3A5F' }}>{t.name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>Sequence #{t.term_no}</div>
                                  </td>
                                  <td style={{ fontSize: '12px', fontWeight: 600 }}>{t.academic_year_name}</td>
                                  <td style={{ fontSize: '11px', color: '#475569' }}>
                                    {t.start_date && t.end_date ? (
                                      `${new Date(t.start_date).toLocaleDateString()} – ${new Date(t.end_date).toLocaleDateString()}`
                                    ) : 'No dates set'}
                                  </td>
                                  <td>
                                    <span className={`status-tag ${t.status === 'active' || t.is_current ? 'active' : 'draft'}`}>
                                      {t.status} {t.is_current ? '★ (Active)' : ''}
                                    </span>
                                  </td>
                                  <td>
                                    {!t.is_current && (
                                      <button className="btn-secondary btn-sm" onClick={() => handleActivateTerm(t.id)}>
                                        Make Active
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: SECTIONS */}
                  {academicTab === 'sections' && (
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">🏫 High School &amp; Preparatory Sections (Grades 9–12)</h4>
                        <button className="btn-primary btn-sm" onClick={() => setNewSecModalOpen(true)}>
                          + Add New Section
                        </button>
                      </div>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Grade Level</th>
                              <th>Section Name</th>
                              <th>Stream Track</th>
                              <th>Capacity</th>
                              <th>Enrolled Students</th>
                              <th>Available Seats</th>
                              <th>Homeroom Teacher</th>
                              <th>Assigned Room</th>
                            </tr>
                          </thead>
                          <tbody>
                            {academicStructure?.sections?.map((sec: any) => (
                              <tr key={sec.id}>
                                <td style={{ fontWeight: 700 }}>{sec.grade_name || `Grade ${sec.grade_level}`}</td>
                                <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{sec.name}</td>
                                <td>
                                  <span style={{ fontSize: '12px' }}>
                                    {sec.stream === 'natural_science' ? '🔬 Natural Sci' : sec.stream === 'social_science' ? '📚 Social Sci' : 'Common Curriculum'}
                                  </span>
                                </td>
                                <td>{sec.capacity} seats</td>
                                <td>
                                  <span style={{ fontWeight: 700, color: '#2A7F62' }}>{sec.enrolled_count || 0}</span>
                                </td>
                                <td>
                                  <span style={{ fontWeight: 700, color: sec.capacity - sec.enrolled_count <= 0 ? '#C0392B' : '#2E6DA4' }}>
                                    {sec.capacity - sec.enrolled_count} seats left
                                  </span>
                                </td>
                                <td>{sec.homeroom_teacher || <span style={{ color: '#C0392B', fontWeight: 600 }}>Unassigned</span>}</td>
                                <td>{sec.classroom_name || 'N/A'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: SUBJECTS & MAPPINGS */}
                  {academicTab === 'subjects' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
                      <div className="admin-card">
                        <div className="admin-card-header">
                          <h4 className="admin-card-title">📚 Subjects Catalog</h4>
                          <button className="btn-primary btn-sm" onClick={() => setNewSubjModalOpen(true)}>
                            + Add Subject
                          </button>
                        </div>
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Code</th>
                                <th>Subject Name</th>
                                <th>Amharic</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {academicStructure?.subjects?.map((sub: any) => (
                                <tr key={sub.id}>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{sub.code}</td>
                                  <td style={{ fontWeight: 600 }}>{sub.name}</td>
                                  <td style={{ color: '#64748B' }}>{sub.name_am || '-'}</td>
                                  <td>
                                    <span className="status-tag active">{sub.status}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="admin-card">
                        <div className="admin-card-header">
                          <h4 className="admin-card-title">🗺️ Grade Curriculum Mappings</h4>
                          <button className="btn-primary btn-sm" onClick={() => setMapSubjModalOpen(true)}>
                            + Map to Grade
                          </button>
                        </div>
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Grade</th>
                                <th>Subject</th>
                                <th>Stream</th>
                                <th>Periods/Wk</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {academicStructure?.gradeSubjects?.map((gs: any) => (
                                <tr key={gs.id}>
                                  <td style={{ fontWeight: 600 }}>{gs.grade_name}</td>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{gs.subject_name} ({gs.subject_code})</td>
                                  <td>
                                    <span style={{ fontSize: '11px', textTransform: 'capitalize' }}>{gs.stream}</span>
                                  </td>
                                  <td>{gs.periods_per_week || 4}</td>
                                  <td>
                                    <button
                                      className="btn-secondary btn-sm"
                                      style={{ color: '#C0392B' }}
                                      onClick={() => handleRemoveGradeSubject(gs.id)}
                                    >
                                      Remove
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
                </div>
              )}

              {/* ========================================================================= */}
              {/* TEACHING ASSIGNMENTS AND TIMETABLE */}
              {/* ========================================================================= */}
              {activePage === 'assignments_timetable' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Teaching Assignments &amp; Timetable</span>
                      </div>
                      <h2 className="page-title">Faculty-Class Assignments &amp; Weekly Timetable Grid</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-secondary" onClick={() => setAssignmentTab('schedule_entry')}>
                        ⚡ Schedule Lesson Period
                      </button>
                      <button className="btn-primary" onClick={() => setAssignModalOpen(true)}>
                        + New Teacher Assignment
                      </button>
                    </div>
                  </div>

                  {/* SUB-NAV */}
                  <div className="admin-subnav">
                    <button
                      className={`admin-subtab-btn ${assignmentTab === 'assignments' ? 'active' : ''}`}
                      onClick={() => setAssignmentTab('assignments')}
                    >
                      <span>Teacher Class &amp; Subject Assignments</span>
                      <span className="badge-pill">{assignmentsData.assignments?.length || 0}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${assignmentTab === 'timetable' ? 'active' : ''}`}
                      onClick={() => setAssignmentTab('timetable')}
                    >
                      <span>Timetable Weekly Matrix</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${assignmentTab === 'schedule_entry' ? 'active' : ''}`}
                      onClick={() => setAssignmentTab('schedule_entry')}
                    >
                      <span>Schedule Lesson &amp; Conflict Check</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${assignmentTab === 'time_slots' ? 'active' : ''}`}
                      onClick={() => setAssignmentTab('time_slots')}
                    >
                      <span>Lesson Periods &amp; Time Slots</span>
                    </button>
                  </div>

                  {/* TAB 1: ASSIGNMENTS */}
                  {assignmentTab === 'assignments' && (
                    <div>
                      {/* Unassigned Banner */}
                      {assignmentsData.unassigned && assignmentsData.unassigned.length > 0 && (
                        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                          <div style={{ fontWeight: 700, color: '#991B1B', fontSize: '13px' }}>
                            ⚠️ Unassigned Curriculum Notice ({assignmentsData.unassigned.length} items):
                          </div>
                          <p style={{ fontSize: '12px', color: '#475569', margin: '4px 0 8px' }}>
                            The following sections have mandatory curriculum subjects without an active teacher assignment:
                          </p>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {assignmentsData.unassigned.slice(0, 8).map((u: any, i: number) => (
                              <span key={i} className="status-tag danger">
                                {u.section_name} • {u.subject_code} ({u.subject_name})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="admin-card">
                        <div className="admin-card-header">
                          <h4 className="admin-card-title">👨‍🏫 Teacher-Class-Subject Teaching Assignments</h4>
                          <button className="btn-primary btn-sm" onClick={() => setAssignModalOpen(true)}>
                            + Assign Teacher
                          </button>
                        </div>
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Teacher Name</th>
                                <th>Employee No</th>
                                <th>Subject</th>
                                <th>Class &amp; Section</th>
                                <th>Academic Year</th>
                                <th>Status</th>
                                <th>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {assignmentsData.assignments?.map((a: any) => (
                                <tr key={a.id}>
                                  <td style={{ fontWeight: 600 }}>{a.teacher_name}</td>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{a.employee_no}</td>
                                  <td>
                                    <span style={{ fontWeight: 700, color: '#2E6DA4' }}>{a.subject_code}</span> • {a.subject_name}
                                  </td>
                                  <td>
                                    {a.grade_name} – <span style={{ fontWeight: 600 }}>{a.section_name}</span>
                                  </td>
                                  <td>{a.academic_year_name}</td>
                                  <td>
                                    <span className="status-tag active">Active</span>
                                  </td>
                                  <td>
                                    <button
                                      className="btn-secondary btn-sm"
                                      style={{ color: '#C0392B' }}
                                      onClick={() => handleDeleteAssignment(a.id)}
                                    >
                                      Remove
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

                  {/* TAB 2: TIMETABLE GRID MATRIX */}
                  {assignmentTab === 'timetable' && (
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                          <h4 className="admin-card-title">📅 Institutional Weekly Timetable Schedule</h4>
                          <select
                            value={timetableFilterSection}
                            onChange={(e) => setTimetableFilterSection(e.target.value)}
                            style={{ padding: '6px 12px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px' }}
                          >
                            <option value="">Filter by Section</option>
                            {academicStructure?.sections?.map((s: any) => (
                              <option key={s.id} value={s.id}>
                                {s.grade_name} - {s.name} ({s.stream})
                              </option>
                            ))}
                          </select>
                        </div>
                        <button className="btn-primary btn-sm" onClick={() => setAssignmentTab('schedule_entry')}>
                          + Schedule Lesson
                        </button>
                      </div>

                      {/* MATRIX (Monday - Friday x Periods) */}
                      <div className="timetable-matrix">
                        <div className="timetable-header-cell">Period</div>
                        <div className="timetable-header-cell">Monday</div>
                        <div className="timetable-header-cell">Tuesday</div>
                        <div className="timetable-header-cell">Wednesday</div>
                        <div className="timetable-header-cell">Thursday</div>
                        <div className="timetable-header-cell">Friday</div>

                        {[1, 2, 3, 4, 5, 6, 7].map((periodNo) => (
                          <div key={periodNo} style={{ display: 'contents' }}>
                            <div className="timetable-period-label">
                              Period {periodNo}
                            </div>
                            {[1, 2, 3, 4, 5].map((dayOfWeek) => {
                              const matching = timetableEntries.filter((te) => {
                                const matchDay = te.day_of_week === dayOfWeek;
                                const matchSec = !timetableFilterSection || te.section_id === Number(timetableFilterSection);
                                const matchSlot = te.slot_label && te.slot_label.includes(`Period ${periodNo}`);
                                return matchDay && matchSec && matchSlot;
                              });

                              return (
                                <div
                                  key={dayOfWeek}
                                  className={`timetable-cell ${matching.length > 0 ? 'occupied' : ''}`}
                                >
                                  {matching.length > 0 ? (
                                    matching.map((m) => (
                                      <div key={m.id} style={{ position: 'relative' }}>
                                        <div className="subj-code">{m.subject_code}</div>
                                        <div className="teacher-sub">{m.teacher_name}</div>
                                        <div className="room-sub">🏛️ {m.room_name} ({m.section_name})</div>
                                        <button
                                          title="Delete entry"
                                          onClick={() => handleDeleteTimetableEntry(m.id)}
                                          style={{ position: 'absolute', top: -4, right: -4, background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '11px' }}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ))
                                  ) : (
                                    <span style={{ fontSize: '11px', color: '#94A3B8', textAlign: 'center' }}>-</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 3: SCHEDULE LESSON FORM (WITH CONFLICT CHECK) */}
                  {assignmentTab === 'schedule_entry' && (
                    <div className="admin-card" style={{ maxWidth: '750px', margin: '0 auto' }}>
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">⚡ Schedule Lesson &amp; Automated Collision Guard</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Backend validates teacher, room &amp; section conflicts</span>
                      </div>
                      <form onSubmit={handleScheduleEntry}>
                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Term / Semester *</label>
                            <select
                              value={schedTermId}
                              onChange={(e) => setSchedTermId(e.target.value)}
                              required
                            >
                              <option value="">Select Term</option>
                              {academicStructure?.terms?.map((t: any) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.academic_year_name})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-field">
                            <label>Target Section *</label>
                            <select
                              value={schedSecId}
                              onChange={(e) => setSchedSecId(e.target.value)}
                              required
                            >
                              <option value="">Select Section</option>
                              {academicStructure?.sections?.map((s: any) => (
                                <option key={s.id} value={s.id}>
                                  {s.grade_name} - {s.name} ({s.stream})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Curriculum Subject *</label>
                            <select
                              value={schedSubjId}
                              onChange={(e) => setSchedSubjId(e.target.value)}
                              required
                            >
                              <option value="">Select Subject</option>
                              {academicStructure?.subjects?.map((sub: any) => (
                                <option key={sub.id} value={sub.id}>
                                  {sub.code} – {sub.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-field">
                            <label>Assigned Faculty / Teacher *</label>
                            <select
                              value={schedStaffId}
                              onChange={(e) => setSchedStaffId(e.target.value)}
                              required
                            >
                              <option value="">Select Teacher</option>
                              {staffList.filter((st) => st.staff_type === 'teacher').map((st: any) => (
                                <option key={st.id} value={st.id}>
                                  {st.first_name} {st.father_name} ({st.department})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Classroom / Laboratory *</label>
                            <select
                              value={schedRoomId}
                              onChange={(e) => setSchedRoomId(e.target.value)}
                              required
                            >
                              <option value="">Select Room</option>
                              {academicStructure?.classrooms?.map((cr: any) => (
                                <option key={cr.id} value={cr.id}>
                                  {cr.name} ({cr.building} • Cap: {cr.capacity})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-field">
                            <label>Lesson Time Slot (Day &amp; Period) *</label>
                            <select
                              value={schedSlotId}
                              onChange={(e) => setSchedSlotId(e.target.value)}
                              required
                            >
                              <option value="">Select Period Slot</option>
                              {timeSlots.map((ts: any) => (
                                <option key={ts.id} value={ts.id}>
                                  {ts.label} ({ts.start_time} - {ts.end_time})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                          <button type="button" className="btn-secondary" onClick={() => setAssignmentTab('timetable')}>
                            Cancel
                          </button>
                          <button type="submit" className="btn-primary">
                            Validate &amp; Schedule Lesson
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* TAB 4: TIME SLOTS */}
                  {assignmentTab === 'time_slots' && (
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">⏰ Master Lesson Periods &amp; Time Slots</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Defined Period Durations</span>
                      </div>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Day of Week</th>
                              <th>Label</th>
                              <th>Start Time</th>
                              <th>End Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {timeSlots.map((ts) => {
                              const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                              return (
                                <tr key={ts.id}>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{days[ts.day_of_week] || `Day ${ts.day_of_week}`}</td>
                                  <td style={{ fontWeight: 600 }}>{ts.label}</td>
                                  <td>{ts.start_time}</td>
                                  <td>{ts.end_time}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* PAGE 6: ATTENDANCE AND ACADEMIC RESULTS */}
              {/* ========================================================================= */}
              {activePage === 'attendance_results' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Attendance &amp; Academic Results</span>
                      </div>
                      <h2 className="page-title">Institutional Attendance &amp; Assessment Approval Lifecycle</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          if (attSummaryData?.sessions) {
                            const headers = ['Date', 'Section', 'Teacher', 'Present', 'Absent', 'Late', 'Status'];
                            const rows = attSummaryData.sessions.map((s: any) => [
                              s.attendance_date,
                              s.section_name,
                              s.teacher_name || 'N/A',
                              s.present_count,
                              s.absent_count,
                              s.late_count,
                              s.session_status
                            ]);
                            exportToCSV(`Attendance_Summary_${attSummaryDate}`, headers, rows);
                          }
                        }}
                      >
                        📥 Export Attendance CSV
                      </button>
                    </div>
                  </div>

                  {/* SUB-NAV */}
                  <div className="admin-subnav">
                    <button
                      className={`admin-subtab-btn ${resultsTab === 'attendance' ? 'active' : ''}`}
                      onClick={() => setResultsTab('attendance')}
                    >
                      <span>Institutional Attendance Monitoring</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${resultsTab === 'assessments' ? 'active' : ''}`}
                      onClick={() => setResultsTab('assessments')}
                    >
                      <span>Assessment &amp; Marks Approval</span>
                      <span className="badge-pill">{assessmentsOverview.length}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${resultsTab === 'performance' ? 'active' : ''}`}
                      onClick={() => {
                        setResultsTab('performance');
                        loadReports('academic');
                      }}
                    >
                      <span>Academic Performance Summaries</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${resultsTab === 'grading_scales' ? 'active' : ''}`}
                      onClick={() => setResultsTab('grading_scales')}
                    >
                      <span>Grading Scales &amp; Bands</span>
                    </button>
                  </div>

                  {/* TAB 1: ATTENDANCE */}
                  {resultsTab === 'attendance' && (
                    <div>
                      {/* Date Selector & Metrics */}
                      <div className="admin-toolbar" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px' }}>Select Attendance Date:</span>
                          <input
                            type="date"
                            value={attSummaryDate}
                            onChange={(e) => {
                              setAttSummaryDate(e.target.value);
                              loadAttendanceSummary(e.target.value);
                            }}
                          />
                        </div>
                        {attSummaryData?.metrics && (
                          <div style={{ display: 'flex', gap: '16px', fontWeight: 600, fontSize: '13px' }}>
                            <span>Rate: <strong style={{ color: '#2A7F62' }}>{attSummaryData.metrics.attendanceRate}%</strong></span>
                            <span>Present: <strong>{attSummaryData.metrics.totalPresent}</strong></span>
                            <span>Absent: <strong style={{ color: '#C0392B' }}>{attSummaryData.metrics.totalAbsent}</strong></span>
                            <span>Late: <strong style={{ color: '#B7791F' }}>{attSummaryData.metrics.totalLate}</strong></span>
                          </div>
                        )}
                      </div>

                      {/* Missing Attendance Sessions Banner */}
                      {attSummaryData?.missingSections && attSummaryData.missingSections.length > 0 && (
                        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                          <div style={{ fontWeight: 700, color: '#92400E', fontSize: '13px' }}>
                            ⚠️ Sections Pending Attendance for {attSummaryDate} ({attSummaryData.missingSections.length}):
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                            {attSummaryData.missingSections.map((ms: any) => (
                              <span key={ms.id} className="status-tag warning">
                                {ms.grade_name} - {ms.section_name} (Homeroom: {ms.homeroom_teacher || 'None'})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* SESSIONS TABLE */}
                      <div className="admin-card">
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Section</th>
                                <th>Curriculum Subject</th>
                                <th>Recorded By Teacher</th>
                                <th>Present</th>
                                <th>Absent</th>
                                <th>Late</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {attSummaryData?.sessions && attSummaryData.sessions.length > 0 ? (
                                attSummaryData.sessions.map((s: any) => (
                                  <tr key={s.session_id}>
                                    <td style={{ fontWeight: 700, color: '#1F3A5F' }}>
                                      {s.grade_name} – {s.section_name}
                                    </td>
                                    <td>{s.subject_name || 'Daily Attendance'}</td>
                                    <td style={{ fontWeight: 600 }}>{s.teacher_name || 'Staff Member'}</td>
                                    <td style={{ fontWeight: 700, color: '#2A7F62' }}>{s.present_count}</td>
                                    <td style={{ fontWeight: 700, color: '#C0392B' }}>{s.absent_count}</td>
                                    <td style={{ fontWeight: 700, color: '#B7791F' }}>{s.late_count}</td>
                                    <td>
                                      <span className={`status-tag ${s.session_status === 'submitted' || s.session_status === 'locked' ? 'active' : 'draft'}`}>
                                        {s.session_status}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                                    No attendance sessions recorded for {attSummaryDate}.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: ASSESSMENTS & MARKS APPROVAL */}
                  {resultsTab === 'assessments' && (
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📝 Assessments &amp; Marks Approval Workflow</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Review Teacher Submissions</span>
                      </div>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Assessment Title</th>
                              <th>Subject</th>
                              <th>Section</th>
                              <th>Teacher</th>
                              <th>Max Score</th>
                              <th>Weight</th>
                              <th>Date</th>
                              <th>Submitted / Enrolled</th>
                              <th>Marks Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {assessmentsOverview.map((a) => (
                              <tr key={a.id}>
                                <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{a.title}</td>
                                <td>{a.subject_name} ({a.subject_code})</td>
                                <td>{a.grade_name} – {a.section_name}</td>
                                <td style={{ fontWeight: 600 }}>{a.teacher_name}</td>
                                <td>{a.max_score} pts</td>
                                <td>{a.weight}%</td>
                                <td style={{ fontSize: '11px', color: '#64748B' }}>
                                  {new Date(a.assessment_date).toLocaleDateString()}
                                </td>
                                <td>
                                  <span style={{ fontWeight: 700 }}>
                                    {a.marks_entered_count} / {a.total_enrolled}
                                  </span>
                                </td>
                                <td>
                                  {a.submitted_marks_count > 0 ? (
                                    <span className="status-tag submitted">Pending Approval ({a.submitted_marks_count})</span>
                                  ) : a.approved_marks_count > 0 ? (
                                    <span className="status-tag active">Approved / Locked</span>
                                  ) : (
                                    <span className="status-tag draft">Draft in Progress</span>
                                  )}
                                </td>
                                <td>
                                  {a.submitted_marks_count > 0 && (
                                    <button
                                      className="btn-primary btn-sm"
                                      onClick={() => handleApproveMarks(a.id)}
                                    >
                                      Approve Marks
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: PERFORMANCE */}
                  {resultsTab === 'performance' && (
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📊 Published Academic Results &amp; Pass Rates</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Aggregated Assessment Scores</span>
                      </div>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Subject</th>
                              <th>Section</th>
                              <th>Grade</th>
                              <th>Students Scored</th>
                              <th>Average Score</th>
                              <th>Highest</th>
                              <th>Lowest</th>
                              <th>Pass Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {performanceReport.map((p, idx) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{p.subject_name} ({p.subject_code})</td>
                                <td style={{ fontWeight: 600 }}>{p.section_name}</td>
                                <td>{p.grade_name}</td>
                                <td>{p.scored_students}</td>
                                <td style={{ fontWeight: 700, color: Number(p.average_score) >= 50 ? '#2A7F62' : '#C0392B' }}>
                                  {p.average_score} pts
                                </td>
                                <td style={{ color: '#2A7F62' }}>{p.highest_score} pts</td>
                                <td style={{ color: '#C0392B' }}>{p.lowest_score} pts</td>
                                <td>
                                  <span style={{ fontWeight: 800, color: Number(p.pass_rate) >= 75 ? '#2A7F62' : '#B7791F' }}>
                                    {p.pass_rate}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: GRADING SCALES */}
                  {resultsTab === 'grading_scales' && (
                    <div className="admin-card" style={{ maxWidth: '750px', margin: '0 auto' }}>
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📐 Official High School Grading Scale &amp; Bands</h4>
                        <span className="status-tag active">Active National Scale</span>
                      </div>
                      {gradingScales.map((gs) => (
                        <div key={gs.id}>
                          <h5 style={{ fontSize: '14px', fontWeight: 700, color: '#1F3A5F', marginBottom: '12px' }}>
                            {gs.name} (Rounding: {gs.rounding_decimals} Decimals)
                          </h5>
                          <div className="admin-table-container">
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th>Letter Grade</th>
                                  <th>Score Range</th>
                                  <th>Grade Points (GPA)</th>
                                  <th>Evaluation Remark</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {gs.bands?.map((b: any) => (
                                  <tr key={b.id}>
                                    <td style={{ fontWeight: 800, fontSize: '15px', color: '#1F3A5F' }}>{b.letter}</td>
                                    <td style={{ fontWeight: 600 }}>{b.min_score}% – {b.max_score}%</td>
                                    <td>{b.grade_points}</td>
                                    <td>{b.remark}</td>
                                    <td>
                                      <span className={`status-tag ${b.is_pass ? 'active' : 'danger'}`}>
                                        {b.is_pass ? 'Passing' : 'Failing'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* PAGE 7: REPORTS, ANALYTICS, AND LIBRARY OVERVIEW */}
              {/* ========================================================================= */}
              {activePage === 'reports_library' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Reports, Analytics &amp; Library Overview</span>
                      </div>
                      <h2 className="page-title">Institutional Analytics, Exports &amp; Library Overview</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          if (reportType === 'enrollment' && enrollmentReport?.bySection) {
                            const headers = ['Section', 'Grade', 'Stream', 'Capacity', 'Enrolled', 'Available Seats', 'Homeroom Teacher'];
                            const rows = enrollmentReport.bySection.map((s: any) => [
                              s.section_name, s.grade_name, s.stream, s.capacity, s.enrolled_count, s.available_seats, s.homeroom_teacher || 'N/A'
                            ]);
                            exportToCSV('Enrollment_Report', headers, rows);
                          } else if (reportType === 'attendance' && attendanceReport) {
                            const headers = ['Section', 'Grade', 'Total Records', 'Present', 'Absent', 'Attendance Rate'];
                            const rows = attendanceReport.map((a: any) => [
                              a.section_name, a.grade_name, a.total_records, a.present_count, a.absent_count, `${a.attendance_rate}%`
                            ]);
                            exportToCSV('Attendance_Compliance_Report', headers, rows);
                          }
                        }}
                      >
                        📥 Export Current Report CSV
                      </button>
                    </div>
                  </div>

                  {/* SUB-NAV */}
                  <div className="admin-subnav">
                    <button
                      className={`admin-subtab-btn ${reportsTab === 'reports' ? 'active' : ''}`}
                      onClick={() => setReportsTab('reports')}
                    >
                      <span>Institutional Reports &amp; Analytics</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${reportsTab === 'library' ? 'active' : ''}`}
                      onClick={() => setReportsTab('library')}
                    >
                      <span>Library Circulation &amp; Catalog Overview</span>
                    </button>
                  </div>

                  {/* TAB 1: REPORTS */}
                  {reportsTab === 'reports' && (
                    <div>
                      {/* REPORT SELECTOR BUTTONS */}
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                        <button
                          className={`btn-${reportType === 'enrollment' ? 'primary' : 'secondary'} btn-sm`}
                          onClick={() => { setReportType('enrollment'); loadReports('enrollment'); }}
                        >
                          1. Student Enrollment Report
                        </button>
                        <button
                          className={`btn-${reportType === 'attendance' ? 'primary' : 'secondary'} btn-sm`}
                          onClick={() => { setReportType('attendance'); loadReports('attendance'); }}
                        >
                          2. Attendance Compliance Report
                        </button>
                        <button
                          className={`btn-${reportType === 'academic' ? 'primary' : 'secondary'} btn-sm`}
                          onClick={() => { setReportType('academic'); loadReports('academic'); }}
                        >
                          3. Academic Results Report
                        </button>
                        <button
                          className={`btn-${reportType === 'workload' ? 'primary' : 'secondary'} btn-sm`}
                          onClick={() => { setReportType('workload'); loadReports('workload'); }}
                        >
                          4. Faculty Workload Report
                        </button>
                      </div>

                      {/* REPORT CONTENT VIEW */}
                      {reportType === 'enrollment' && enrollmentReport && (
                        <div className="admin-card">
                          <div className="admin-card-header">
                            <h4 className="admin-card-title">👥 Student Enrollment by Section &amp; Available Seats</h4>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>Official Capacity Audit</span>
                          </div>
                          <div className="admin-table-container">
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th>Section</th>
                                  <th>Grade</th>
                                  <th>Stream</th>
                                  <th>Capacity</th>
                                  <th>Enrolled</th>
                                  <th>Available Seats</th>
                                  <th>Homeroom Teacher</th>
                                </tr>
                              </thead>
                              <tbody>
                                {enrollmentReport.bySection?.map((s: any) => (
                                  <tr key={s.id}>
                                    <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{s.section_name}</td>
                                    <td>{s.grade_name}</td>
                                    <td style={{ fontSize: '12px', textTransform: 'capitalize' }}>{s.stream}</td>
                                    <td>{s.capacity}</td>
                                    <td style={{ fontWeight: 700, color: '#2A7F62' }}>{s.enrolled_count}</td>
                                    <td style={{ fontWeight: 700, color: s.available_seats <= 0 ? '#C0392B' : '#2E6DA4' }}>
                                      {s.available_seats}
                                    </td>
                                    <td>{s.homeroom_teacher || 'N/A'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {reportType === 'attendance' && (
                        <div className="admin-card">
                          <div className="admin-card-header">
                            <h4 className="admin-card-title">📅 Section Attendance Compliance &amp; Rates</h4>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>Institutional Aggregation</span>
                          </div>
                          <div className="admin-table-container">
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th>Section</th>
                                  <th>Grade</th>
                                  <th>Total Records Logged</th>
                                  <th>Present Records</th>
                                  <th>Unexcused Absences</th>
                                  <th>Compliance Rate</th>
                                </tr>
                              </thead>
                              <tbody>
                                {attendanceReport.map((a, idx) => (
                                  <tr key={idx}>
                                    <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{a.section_name}</td>
                                    <td>{a.grade_name}</td>
                                    <td>{a.total_records}</td>
                                    <td style={{ color: '#2A7F62', fontWeight: 600 }}>{a.present_count}</td>
                                    <td style={{ color: '#C0392B', fontWeight: 600 }}>{a.absent_count}</td>
                                    <td>
                                      <span style={{ fontWeight: 800, color: Number(a.attendance_rate) >= 90 ? '#2A7F62' : '#B7791F' }}>
                                        {a.attendance_rate}%
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {reportType === 'academic' && (
                        <div className="admin-card">
                          <div className="admin-card-header">
                            <h4 className="admin-card-title">📝 Academic Performance &amp; Pass Rate Analytics</h4>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>Curriculum Pass / Fail Status</span>
                          </div>
                          <div className="admin-table-container">
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th>Subject Code</th>
                                  <th>Subject Name</th>
                                  <th>Section</th>
                                  <th>Average Score</th>
                                  <th>Passing Rate</th>
                                </tr>
                              </thead>
                              <tbody>
                                {performanceReport.map((p, idx) => (
                                  <tr key={idx}>
                                    <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{p.subject_code}</td>
                                    <td style={{ fontWeight: 600 }}>{p.subject_name}</td>
                                    <td>{p.grade_name} – {p.section_name}</td>
                                    <td style={{ fontWeight: 700 }}>{p.average_score} pts</td>
                                    <td>
                                      <span style={{ fontWeight: 800, color: Number(p.pass_rate) >= 75 ? '#2A7F62' : '#C0392B' }}>
                                        {p.pass_rate}%
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {reportType === 'workload' && (
                        <div className="admin-card">
                          <div className="admin-card-header">
                            <h4 className="admin-card-title">👨‍🏫 Teacher Workload &amp; Weekly Periods Distribution</h4>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>Teaching Assignment Balances</span>
                          </div>
                          <div className="admin-table-container">
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th>Faculty Name</th>
                                  <th>Department</th>
                                  <th>Assigned Sections</th>
                                  <th>Subjects</th>
                                  <th>Weekly Timetable Periods</th>
                                </tr>
                              </thead>
                              <tbody>
                                {workloadReport.map((w) => (
                                  <tr key={w.id}>
                                    <td style={{ fontWeight: 600 }}>{w.teacher_name}</td>
                                    <td>{w.department}</td>
                                    <td>{w.total_sections} classes</td>
                                    <td>{w.subjects_list}</td>
                                    <td>
                                      <span style={{ fontWeight: 800, color: '#2A7F62' }}>{w.weekly_periods} periods/wk</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: LIBRARY OVERVIEW */}
                  {reportsTab === 'library' && libraryData && (
                    <div>
                      {/* LIBRARY METRICS */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                        <div className="stat-card-mini">
                          <div className="label">Total Books in Catalog</div>
                          <div className="value">{libraryData.metrics?.totalBooks ?? 0}</div>
                          <div className="subtext">{libraryData.metrics?.totalCopies ?? 0} physical copies tracked</div>
                        </div>
                        <div className="stat-card-mini">
                          <div className="label">Available Copies on Shelf</div>
                          <div className="value" style={{ color: '#2A7F62' }}>{libraryData.metrics?.availableCopies ?? 0}</div>
                          <div className="subtext">Ready for checkout</div>
                        </div>
                        <div className="stat-card-mini">
                          <div className="label">Active Borrowed Loans</div>
                          <div className="value" style={{ color: '#2E6DA4' }}>{libraryData.metrics?.activeLoans ?? 0}</div>
                          <div className="subtext">Circulating items</div>
                        </div>
                        <div className="stat-card-mini">
                          <div className="label">Overdue Loans Alert</div>
                          <div className="value" style={{ color: '#C0392B' }}>{libraryData.metrics?.overdueLoans ?? 0}</div>
                          <div className="subtext" style={{ color: '#C0392B' }}>Past return date</div>
                        </div>
                      </div>

                      {/* ACTIVE & OVERDUE CIRCULATION LOANS */}
                      <div className="admin-card" style={{ marginBottom: '20px' }}>
                        <div className="admin-card-header">
                          <h4 className="admin-card-title">📖 Active Circulation Loans &amp; Overdue Tracker</h4>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>Live Library Records</span>
                        </div>
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Book Title</th>
                                <th>Borrower (Student)</th>
                                <th>Admission No</th>
                                <th>Copy Barcode</th>
                                <th>Issue Date</th>
                                <th>Due Date</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {libraryData.activeLoans && libraryData.activeLoans.length > 0 ? (
                                libraryData.activeLoans.map((l: any) => (
                                  <tr key={l.id}>
                                    <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{l.book_title}</td>
                                    <td style={{ fontWeight: 600 }}>{l.student_name}</td>
                                    <td>{l.admission_no}</td>
                                    <td style={{ fontFamily: 'monospace' }}>{l.barcode}</td>
                                    <td>{new Date(l.issued_at).toLocaleDateString()}</td>
                                    <td>{new Date(l.due_at).toLocaleDateString()}</td>
                                    <td>
                                      {l.is_overdue ? (
                                        <span className="status-tag danger">Overdue</span>
                                      ) : (
                                        <span className="status-tag active">Active Loan</span>
                                      )}
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                                    No active borrowed book loans currently.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* BOOKS DIRECTORY */}
                      <div className="admin-card">
                        <div className="admin-card-header">
                          <h4 className="admin-card-title">📚 Library Catalog Directory</h4>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>Catalog Volumes</span>
                        </div>
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>ISBN</th>
                                <th>Title</th>
                                <th>Author</th>
                                <th>Category</th>
                                <th>Total Copies</th>
                                <th>Available Copies</th>
                              </tr>
                            </thead>
                            <tbody>
                              {libraryData.books?.map((b: any) => (
                                <tr key={b.id}>
                                  <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{b.isbn || 'N/A'}</td>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{b.title}</td>
                                  <td>{b.author}</td>
                                  <td>{b.category_name}</td>
                                  <td>{b.total_copies}</td>
                                  <td>
                                    <span style={{ fontWeight: 700, color: b.available_copies > 0 ? '#2A7F62' : '#C0392B' }}>
                                      {b.available_copies}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* COMMUNICATIONS & AUDIT LOGS */}
              {/* ========================================================================= */}
              {activePage === 'communications_audit' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Communications &amp; Audit Logs</span>
                      </div>
                      <h2 className="page-title">Communications &amp; Audit Logs</h2>
                      <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                        Official schoolwide broadcasts, public notices &amp; real-time system audit logs
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-primary" onClick={() => setAnnModalOpen(true)}>
                        + Broadcast Announcement
                      </button>
                    </div>
                  </div>

                  {/* SUB-NAV */}
                  <div className="admin-subnav">
                    <button
                      className={`admin-subtab-btn ${commsTab === 'announcements' ? 'active' : ''}`}
                      onClick={() => setCommsTab('announcements')}
                    >
                      <span>Announcements &amp; Broadcasts</span>
                      <span className="badge-pill">{announcementsList.length}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${commsTab === 'audit' ? 'active' : ''}`}
                      onClick={() => setCommsTab('audit')}
                    >
                      <span>System Audit Trail &amp; Security Logs</span>
                      <span className="badge-pill">{auditLogsList.length}</span>
                    </button>
                  </div>

                  {/* TAB 1: ANNOUNCEMENTS */}
                  {commsTab === 'announcements' && (
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📢 School Broadcasts &amp; Notices</h4>
                        <button className="btn-primary btn-sm" onClick={() => setAnnModalOpen(true)}>
                          + Create Announcement
                        </button>
                      </div>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Announcement Title</th>
                              <th>Target Audience</th>
                              <th>Author</th>
                              <th>Published Date</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {announcementsList.map((ann) => (
                              <tr key={ann.id}>
                                <td>
                                  <div style={{ fontWeight: 700, color: '#1F3A5F' }}>{ann.title}</div>
                                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                                    {ann.content || ann.body}
                                  </div>
                                </td>
                                <td>
                                  <span className="status-tag info" style={{ textTransform: 'capitalize' }}>
                                    {ann.target_role || 'All School'}
                                  </span>
                                </td>
                                <td>{ann.author_name}</td>
                                <td style={{ fontSize: '11px', color: '#64748B' }}>
                                  {ann.published_at ? new Date(ann.published_at).toLocaleDateString() : 'Unpublished'}
                                </td>
                                <td>
                                  <span className={`status-tag ${ann.status}`}>{ann.status}</span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    {ann.status !== 'published' && (
                                      <button className="btn-secondary btn-sm" onClick={() => handleUpdateAnnStatus(ann.id, 'published')}>
                                        Publish
                                      </button>
                                    )}
                                    {ann.status !== 'archived' && (
                                      <button className="btn-secondary btn-sm" onClick={() => handleUpdateAnnStatus(ann.id, 'archived')}>
                                        Archive
                                      </button>
                                    )}
                                    <button
                                      className="btn-secondary btn-sm"
                                      style={{ color: '#C0392B' }}
                                      onClick={() => handleDeleteAnnouncement(ann.id)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: AUDIT LOGS */}
                  {commsTab === 'audit' && (
                    <div className="admin-card">
                      <div className="admin-toolbar">
                        <input
                          type="text"
                          placeholder="Filter by actor username..."
                          value={auditActorFilter}
                          onChange={(e) => setAuditActorFilter(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Filter by action code..."
                          value={auditActionFilter}
                          onChange={(e) => setAuditActionFilter(e.target.value)}
                        />
                        <select value={auditOutcomeFilter} onChange={(e) => setAuditOutcomeFilter(e.target.value)}>
                          <option value="">All Outcomes</option>
                          <option value="success">Success</option>
                          <option value="failure">Failure</option>
                          <option value="denied">Denied</option>
                        </select>
                        <button className="btn-secondary btn-sm" onClick={loadAuditLogs}>
                          Filter Logs
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            const headers = ['Timestamp', 'Actor', 'Action', 'Entity', 'Outcome', 'Reason'];
                            const rows = auditLogsList.map((l) => [
                              l.occurred_at, l.actor_username, l.action, l.entity_type, l.outcome, l.reason || 'N/A'
                            ]);
                            exportToCSV('Audit_Logs_Export', headers, rows);
                          }}
                        >
                          📥 Export CSV
                        </button>
                      </div>

                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Timestamp (UTC)</th>
                              <th>Actor</th>
                              <th>Action Performed</th>
                              <th>Entity</th>
                              <th>Outcome</th>
                              <th>Reason / Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditLogsList.map((log) => (
                              <tr key={log.id}>
                                <td style={{ fontSize: '11px', color: '#64748B' }}>
                                  {new Date(log.occurred_at).toLocaleString()}
                                </td>
                                <td style={{ fontWeight: 600 }}>{log.actor_username}</td>
                                <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1F3A5F' }}>{log.action}</td>
                                <td style={{ fontSize: '12px' }}>{log.entity_type} {log.entity_id ? `(#${log.entity_id})` : ''}</td>
                                <td>
                                  <span className={`status-tag ${log.outcome}`}>{log.outcome}</span>
                                </td>
                                <td style={{ fontSize: '12px', color: '#475569' }}>
                                  {log.reason || (log.changes ? JSON.stringify(log.changes) : '-')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* ========================================================================= */}
              {/* SCHOOL SETTINGS */}
              {/* ========================================================================= */}
              {activePage === 'school_settings' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>School Settings</span>
                      </div>
                      <h2 className="page-title">School Settings</h2>
                      <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                        Institutional profile, contact details, grading policies, attendance defaults &amp; system preferences
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-secondary" onClick={() => loadSettings()}>
                        🔄 Reload Settings
                      </button>
                    </div>
                  </div>

                  {/* SETTINGS CATEGORY SUBNAV */}
                  <div className="admin-subnav">
                    <button
                      className={`admin-subtab-btn ${settingsCategory === 'identity' ? 'active' : ''}`}
                      onClick={() => setSettingsCategory('identity')}
                    >
                      <span>🏛️ School Identity &amp; Contact</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${settingsCategory === 'academic' ? 'active' : ''}`}
                      onClick={() => setSettingsCategory('academic')}
                    >
                      <span>📅 Academic Defaults &amp; Calendar</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${settingsCategory === 'grading' ? 'active' : ''}`}
                      onClick={() => setSettingsCategory('grading')}
                    >
                      <span>📊 Grading Policies</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${settingsCategory === 'attendance' ? 'active' : ''}`}
                      onClick={() => setSettingsCategory('attendance')}
                    >
                      <span>📋 Attendance Policies</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${settingsCategory === 'preferences' ? 'active' : ''}`}
                      onClick={() => setSettingsCategory('preferences')}
                    >
                      <span>⚙️ System &amp; Security Preferences</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${settingsCategory === 'all' ? 'active' : ''}`}
                      onClick={() => setSettingsCategory('all')}
                    >
                      <span>📑 All Database Settings</span>
                      <span className="badge-pill">{systemSettings.length}</span>
                    </button>
                  </div>

                  {/* CATEGORY 1: SCHOOL IDENTITY & CONTACT */}
                  {settingsCategory === 'identity' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
                      <div className="admin-card">
                        <div className="admin-card-header">
                          <h4 className="admin-card-title">🏛️ School Profile &amp; Branding</h4>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>Public Identity</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div className="form-field">
                            <label>Official School Name *</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="text"
                                id="cfg-school-name"
                                defaultValue={(() => {
                                  const s = systemSettings.find((x) => x.setting_key === 'school.name');
                                  return s ? String(s.value_json).replace(/^"|"$/g, '') : 'Ketema Nigus Secondary & Preparatory School';
                                })()}
                              />
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => {
                                  const el = document.getElementById('cfg-school-name') as HTMLInputElement;
                                  if (el && el.value.trim()) handleSaveSetting('school.name', el.value.trim());
                                }}
                              >
                                Save
                              </button>
                            </div>
                            <span style={{ fontSize: '11px', color: '#64748B' }}>Primary school name displayed on reports, transcripts &amp; header</span>
                          </div>

                          <div className="form-field">
                            <label>Country Code (ISO 3166)</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="text"
                                id="cfg-school-country"
                                defaultValue={(() => {
                                  const s = systemSettings.find((x) => x.setting_key === 'school.country');
                                  return s ? String(s.value_json).replace(/^"|"$/g, '') : 'ET';
                                })()}
                                style={{ width: '120px' }}
                              />
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => {
                                  const el = document.getElementById('cfg-school-country') as HTMLInputElement;
                                  if (el && el.value.trim()) handleSaveSetting('school.country', el.value.trim());
                                }}
                              >
                                Save
                              </button>
                            </div>
                          </div>

                          <div className="form-field">
                            <label>Default Timezone</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <select
                                id="cfg-school-timezone"
                                defaultValue={(() => {
                                  const s = systemSettings.find((x) => x.setting_key === 'school.timezone');
                                  return s ? String(s.value_json).replace(/^"|"$/g, '') : 'Africa/Addis_Ababa';
                                })()}
                              >
                                <option value="Africa/Addis_Ababa">Africa/Addis_Ababa (EAT, UTC+3)</option>
                                <option value="UTC">UTC (Coordinated Universal Time)</option>
                                <option value="Africa/Nairobi">Africa/Nairobi (UTC+3)</option>
                              </select>
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => {
                                  const el = document.getElementById('cfg-school-timezone') as HTMLSelectElement;
                                  if (el) handleSaveSetting('school.timezone', el.value);
                                }}
                              >
                                Save
                              </button>
                            </div>
                            <span style={{ fontSize: '11px', color: '#64748B' }}>Database stores all timestamps in UTC; UI displays in this zone</span>
                          </div>

                          <div className="form-field">
                            <label>School Logo URL / Asset Path</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="text"
                                id="cfg-school-logo"
                                defaultValue={(() => {
                                  const s = systemSettings.find((x) => x.setting_key === 'school.logo');
                                  return s ? String(s.value_json).replace(/^"|"$/g, '') : '/logo.png';
                                })()}
                              />
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => {
                                  const el = document.getElementById('cfg-school-logo') as HTMLInputElement;
                                  if (el) handleSaveSetting('school.logo', el.value.trim());
                                }}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="admin-card">
                        <div className="admin-card-header">
                          <h4 className="admin-card-title">📞 School Contact Information &amp; Address</h4>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>Official Inquiries</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div className="form-field">
                            <label>Official School Telephone</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="text"
                                id="cfg-school-phone"
                                defaultValue={(() => {
                                  const s = systemSettings.find((x) => x.setting_key === 'school.phone');
                                  return s ? String(s.value_json).replace(/^"|"$/g, '') : '+251 25 666 1234';
                                })()}
                              />
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => {
                                  const el = document.getElementById('cfg-school-phone') as HTMLInputElement;
                                  if (el) handleSaveSetting('school.phone', el.value.trim());
                                }}
                              >
                                Save
                              </button>
                            </div>
                          </div>

                          <div className="form-field">
                            <label>Official Contact Email</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="email"
                                id="cfg-school-email"
                                defaultValue={(() => {
                                  const s = systemSettings.find((x) => x.setting_key === 'school.email' || x.setting_key === 'school.contact_email');
                                  return s ? String(s.value_json).replace(/^"|"$/g, '') : 'admin@hspsms.edu.et';
                                })()}
                              />
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => {
                                  const el = document.getElementById('cfg-school-email') as HTMLInputElement;
                                  if (el) handleSaveSetting('school.email', el.value.trim());
                                }}
                              >
                                Save
                              </button>
                            </div>
                          </div>

                          <div className="form-field">
                            <label>Physical Campus Address</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <textarea
                                id="cfg-school-address"
                                rows={3}
                                defaultValue={(() => {
                                  const s = systemSettings.find((x) => x.setting_key === 'school.address');
                                  return s ? String(s.value_json).replace(/^"|"$/g, '') : 'Kebele 14, Harar City Administration, Harari Region, Ethiopia';
                                })()}
                                style={{ flex: 1, padding: '8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px' }}
                              />
                              <button
                                className="btn-primary btn-sm"
                                style={{ alignSelf: 'flex-start' }}
                                onClick={() => {
                                  const el = document.getElementById('cfg-school-address') as HTMLTextAreaElement;
                                  if (el) handleSaveSetting('school.address', el.value.trim());
                                }}
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 2: ACADEMIC DEFAULTS & CALENDAR */}
                  {settingsCategory === 'academic' && (
                    <div className="admin-card" style={{ maxWidth: '820px' }}>
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📅 Academic Calendar &amp; Session Configuration</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Terms, Formats &amp; Currencies</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Default Terms Per Academic Year</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Standard number of semesters or terms per academic session (e.g. 2 semesters)</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                              id="cfg-academic-terms"
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'academic.terms_per_year');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : '2';
                              })()}
                              style={{ width: '140px' }}
                            >
                              <option value="2">2 Semesters</option>
                              <option value="3">3 Trimesters</option>
                              <option value="4">4 Quarters</option>
                            </select>
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-academic-terms') as HTMLSelectElement;
                                if (el) handleSaveSetting('academic.terms_per_year', Number(el.value));
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>UI Display Calendar</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Primary calendar standard presented across user dashboard views</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                              id="cfg-calendar-display"
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'calendar.display');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : 'ethiopian';
                              })()}
                              style={{ width: '160px' }}
                            >
                              <option value="ethiopian">Ethiopian (E.C.)</option>
                              <option value="gregorian">Gregorian (G.C.)</option>
                            </select>
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-calendar-display') as HTMLSelectElement;
                                if (el) handleSaveSetting('calendar.display', el.value);
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Exported Files Calendar</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Calendar format applied when generating CSV and spreadsheet exports</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                              id="cfg-calendar-export"
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'calendar.export');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : 'gregorian';
                              })()}
                              style={{ width: '160px' }}
                            >
                              <option value="gregorian">Gregorian (G.C.)</option>
                              <option value="ethiopian">Ethiopian (E.C.)</option>
                            </select>
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-calendar-export') as HTMLSelectElement;
                                if (el) handleSaveSetting('calendar.export', el.value);
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Operating Currency</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>ISO 4217 currency code applied to school financial ledgers &amp; fees</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              id="cfg-finance-currency"
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'finance.currency');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : 'ETB';
                              })()}
                              style={{ width: '100px' }}
                            />
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-finance-currency') as HTMLInputElement;
                                if (el && el.value.trim()) handleSaveSetting('finance.currency', el.value.trim());
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 3: GRADING POLICIES */}
                  {settingsCategory === 'grading' && (
                    <div className="admin-card" style={{ maxWidth: '820px' }}>
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📊 Institutional Grading &amp; Assessment Policies</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Standards &amp; Weights</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Minimum Passing Mark (%)</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Cut-off percentage score required for student course and term promotion (Default: 50%)</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="number"
                              id="cfg-grading-passmark"
                              min={0}
                              max={100}
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'grading.pass_mark');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : '50';
                              })()}
                              style={{ width: '90px' }}
                            />
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-grading-passmark') as HTMLInputElement;
                                if (el && el.value !== '') handleSaveSetting('grading.pass_mark', Number(el.value));
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Missing Assessment Score Rule</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Policy for handling absent or unrecorded student assessment entries in GPA calculations</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                              id="cfg-grading-missing"
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'grading.missing_mark_rule');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : 'incomplete';
                              })()}
                              style={{ width: '160px' }}
                            >
                              <option value="incomplete">Incomplete (Hold Ranks)</option>
                              <option value="zero">Count as Zero (0)</option>
                              <option value="exclude">Exclude from Average</option>
                            </select>
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-grading-missing') as HTMLSelectElement;
                                if (el) handleSaveSetting('grading.missing_mark_rule', el.value);
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Enforce Assessment Weights Total 100%</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Require all teacher assessments within a term to sum up strictly to 100% before approval</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                              id="cfg-grading-weight"
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'grading.weights_must_total_100');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : 'true';
                              })()}
                              style={{ width: '130px' }}
                            >
                              <option value="true">Enforced (True)</option>
                              <option value="false">Flexible (False)</option>
                            </select>
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-grading-weight') as HTMLSelectElement;
                                if (el) handleSaveSetting('grading.weights_must_total_100', el.value === 'true');
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 4: ATTENDANCE POLICIES */}
                  {settingsCategory === 'attendance' && (
                    <div className="admin-card" style={{ maxWidth: '820px' }}>
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📋 Institutional Attendance Policies</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Daily Tracking &amp; Guardian Alerts</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Attendance Recording Mode</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Institutional frequency of taking student attendance: Daily roll-call or Per-period</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                              id="cfg-attendance-mode"
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'attendance.mode');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : 'daily';
                              })()}
                              style={{ width: '150px' }}
                            >
                              <option value="daily">Daily (Once per day)</option>
                              <option value="per_period">Per Period (Every class)</option>
                            </select>
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-attendance-mode') as HTMLSelectElement;
                                if (el) handleSaveSetting('attendance.mode', el.value);
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Guardian Alert Status Triggers</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Attendance statuses that trigger automated SMS/Email alerts to linked student parents (JSON array)</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              id="cfg-attendance-alerts"
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'attendance.guardian_alert_statuses');
                                return s ? JSON.stringify(s.value_json) : '["absent"]';
                              })()}
                              style={{ width: '180px' }}
                            />
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-attendance-alerts') as HTMLInputElement;
                                if (el) {
                                  try {
                                    const parsed = JSON.parse(el.value);
                                    handleSaveSetting('attendance.guardian_alert_statuses', parsed);
                                  } catch {
                                    handleSaveSetting('attendance.guardian_alert_statuses', [el.value.trim()]);
                                  }
                                }
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 5: SYSTEM & SECURITY PREFERENCES */}
                  {settingsCategory === 'preferences' && (
                    <div className="admin-card" style={{ maxWidth: '820px' }}>
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">⚙️ System &amp; Security Preferences</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Security, Limits &amp; Infrastructure</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Maximum Failed Login Attempts</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Consecutive failed sign-ins before user account is temporarily locked out</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="number"
                              id="cfg-sec-failed-logins"
                              min={1}
                              max={20}
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'security.max_failed_logins');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : '5';
                              })()}
                              style={{ width: '80px' }}
                            />
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-sec-failed-logins') as HTMLInputElement;
                                if (el && el.value !== '') handleSaveSetting('security.max_failed_logins', Number(el.value));
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Account Lockout Duration (Minutes)</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Time period user must wait after exceeding maximum failed login attempts</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="number"
                              id="cfg-sec-lockout"
                              min={1}
                              max={1440}
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'security.lockout_minutes');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : '15';
                              })()}
                              style={{ width: '80px' }}
                            />
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-sec-lockout') as HTMLInputElement;
                                if (el && el.value !== '') handleSaveSetting('security.lockout_minutes', Number(el.value));
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Maximum Upload File Size (MB)</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Max allowed size for document, avatar and homework file uploads</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="number"
                              id="cfg-uploads-max"
                              min={1}
                              max={100}
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'uploads.max_mb');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : '10';
                              })()}
                              style={{ width: '80px' }}
                            />
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-uploads-max') as HTMLInputElement;
                                if (el && el.value !== '') handleSaveSetting('uploads.max_mb', Number(el.value));
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ flex: 1, paddingRight: '20px' }}>
                            <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Allow Over-Capacity Class Enrollment</div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>Permit enrolling students into a section after its designated physical room capacity is reached</div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                              id="cfg-enroll-overcapacity"
                              defaultValue={(() => {
                                const s = systemSettings.find((x) => x.setting_key === 'enrollment.allow_over_capacity');
                                return s ? String(s.value_json).replace(/^"|"$/g, '') : 'false';
                              })()}
                              style={{ width: '130px' }}
                            >
                              <option value="false">Disallow (False)</option>
                              <option value="true">Allow (True)</option>
                            </select>
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => {
                                const el = document.getElementById('cfg-enroll-overcapacity') as HTMLSelectElement;
                                if (el) handleSaveSetting('enrollment.allow_over_capacity', el.value === 'true');
                              }}
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 6: ALL DATABASE SETTINGS */}
                  {settingsCategory === 'all' && (
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <div>
                          <h4 className="admin-card-title">📑 All System Settings Repository</h4>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>Raw system_settings MySQL Table with Automated Audit Trail</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="text"
                            placeholder="Filter by key name..."
                            value={settingsSearch}
                            onChange={(e) => setSettingsSearch(e.target.value)}
                            style={{ height: '32px', padding: '0 10px', fontSize: '13px', width: '220px', border: '1px solid #CBD5E1', borderRadius: '6px' }}
                          />
                        </div>
                      </div>

                      {/* Add Custom Setting Row */}
                      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '14px', marginBottom: '16px' }}>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F', marginBottom: '8px' }}>
                          + Add or Custom-Override Configuration Key:
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            placeholder="setting_key (e.g. school.motto)"
                            value={customKey}
                            onChange={(e) => setCustomKey(e.target.value)}
                            style={{ flex: 1, minWidth: '200px', height: '34px', padding: '0 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '6px' }}
                          />
                          <input
                            type="text"
                            placeholder="value_json (e.g. Learning for Excellence)"
                            value={customVal}
                            onChange={(e) => setCustomVal(e.target.value)}
                            style={{ flex: 1, minWidth: '200px', height: '34px', padding: '0 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '6px' }}
                          />
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => {
                              if (!customKey.trim()) return;
                              let val: any = customVal.trim();
                              if (val === 'true') val = true;
                              else if (val === 'false') val = false;
                              else if (!isNaN(Number(val)) && val !== '') val = Number(val);
                              handleSaveSetting(customKey.trim(), val);
                              setCustomKey('');
                              setCustomVal('');
                            }}
                          >
                            Add / Save Setting
                          </button>
                        </div>
                      </div>

                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Setting Key</th>
                              <th>Current Value</th>
                              <th>Description</th>
                              <th>Version</th>
                              <th>Last Updated</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {systemSettings
                              .filter((s) => !settingsSearch || s.setting_key.toLowerCase().includes(settingsSearch.toLowerCase()))
                              .map((s) => {
                                let valStr = typeof s.value_json === 'string' ? s.value_json : JSON.stringify(s.value_json);
                                valStr = valStr.replace(/^"|"$/g, '');
                                return (
                                  <tr key={s.setting_key}>
                                    <td>
                                      <code style={{ fontWeight: 700, color: '#1F3A5F', fontSize: '12px' }}>{s.setting_key}</code>
                                    </td>
                                    <td>
                                      <input
                                        type="text"
                                        defaultValue={valStr}
                                        id={`raw-setting-${s.setting_key}`}
                                        style={{ padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', width: '220px' }}
                                      />
                                    </td>
                                    <td style={{ fontSize: '12px', color: '#64748B', maxWidth: '300px' }}>
                                      {s.description || 'System configuration parameter'}
                                    </td>
                                    <td>
                                      <span className="badge-pill" style={{ background: '#E2E8F0', color: '#475569' }}>
                                        v{s.version ?? 1}
                                      </span>
                                    </td>
                                    <td style={{ fontSize: '11px', color: '#64748B' }}>
                                      {s.updated_at ? new Date(s.updated_at).toLocaleString() : '-'}
                                    </td>
                                    <td>
                                      <button
                                        className="btn-primary btn-sm"
                                        onClick={() => {
                                          const input = document.getElementById(`raw-setting-${s.setting_key}`) as HTMLInputElement;
                                          if (input) {
                                            let finalVal: any = input.value;
                                            if (finalVal === 'true') finalVal = true;
                                            else if (finalVal === 'false') finalVal = false;
                                            else if (!isNaN(Number(finalVal)) && finalVal.trim() !== '') finalVal = Number(finalVal);
                                            handleSaveSetting(s.setting_key, finalVal);
                                          }
                                        }}
                                      >
                                        Save
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* ADMINISTRATOR PROFILE */}
              {/* ========================================================================= */}
              {activePage === 'admin_profile' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Administrator Profile</span>
                      </div>
                      <h2 className="page-title">Administrator Profile</h2>
                      <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                        Manage administrative credentials, contact details, notification preferences &amp; session security
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-secondary" style={{ color: '#C0392B', borderColor: '#FECACA' }} onClick={onLogout}>
                        🚪 Sign Out of ERP
                      </button>
                    </div>
                  </div>

                  {/* 2-COLUMN PROFILE CARDS */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                    {/* CARD 1: IDENTITY & CONTACT */}
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">👤 Administrator Identity &amp; Contact</h4>
                        <span className="badge-pill" style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' }}>
                          Verified Account
                        </span>
                      </div>
                      <form onSubmit={handleUpdateProfile}>
                        <div className="form-field">
                          <label>System Username (Permanent)</label>
                          <input type="text" value={adminProfile?.username || user.username} disabled style={{ background: '#F1F5F9' }} />
                        </div>
                        <div className="form-field">
                          <label>Assigned System Role</label>
                          <input type="text" value="System Administrator (Full Privileges)" disabled style={{ background: '#F1F5F9' }} />
                        </div>
                        <div className="form-field">
                          <label>Linked Staff Name</label>
                          <input
                            type="text"
                            value={adminProfile?.first_name ? `${adminProfile.first_name} ${adminProfile.father_name}` : displayName}
                            disabled
                            style={{ background: '#F1F5F9' }}
                          />
                        </div>
                        <div className="form-field">
                          <label>Official Contact Telephone</label>
                          <input
                            type="text"
                            placeholder="e.g. +251 91 123 4567"
                            value={profilePhone}
                            onChange={(e) => setProfilePhone(e.target.value)}
                          />
                        </div>
                        <div className="form-field">
                          <label>Official Email Address</label>
                          <input
                            type="email"
                            placeholder="admin@hspsms.edu.et"
                            value={profileEmail}
                            onChange={(e) => setProfileEmail(e.target.value)}
                          />
                        </div>
                        <button type="submit" className="btn-primary" style={{ marginTop: '12px', width: '100%' }}>
                          Update Profile Contact Details
                        </button>
                      </form>
                    </div>

                    {/* CARD 2: PASSWORD CHANGE */}
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">🔒 Change Account Password</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Bcrypt Hashed</span>
                      </div>
                      <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', fontSize: '12px', color: '#475569' }}>
                        Current password verification is strictly required. Passwords are never stored or transmitted in plain text.
                      </div>
                      <form onSubmit={handleChangePassword}>
                        <div className="form-field">
                          <label>Current Password *</label>
                          <input
                            type="password"
                            placeholder="Enter your current password"
                            value={currPassword}
                            onChange={(e) => setCurrPassword(e.target.value)}
                            required
                          />
                        </div>
                        <div className="form-field">
                          <label>New Password * (Min 6 Characters)</label>
                          <input
                            type="password"
                            placeholder="Enter new strong password"
                            value={newAdminPassword}
                            onChange={(e) => setNewAdminPassword(e.target.value)}
                            required
                          />
                        </div>
                        <div className="form-field">
                          <label>Confirm New Password *</label>
                          <input
                            type="password"
                            placeholder="Re-enter new password"
                            value={confirmAdminPassword}
                            onChange={(e) => setConfirmAdminPassword(e.target.value)}
                            required
                          />
                        </div>
                        <button type="submit" className="btn-primary" style={{ marginTop: '12px', width: '100%' }}>
                          Save New Password
                        </button>
                      </form>
                    </div>
                  </div>

                  {/* NOTIFICATION PREFERENCES & ACTIVE SESSION */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                    {/* NOTIFICATION PREFERENCES */}
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">🔔 Notification &amp; Alert Preferences</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>System Dispatch</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#1E293B', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={notifSecurityAlerts}
                            onChange={(e) => setNotifSecurityAlerts(e.target.checked)}
                            style={{ width: '16px', height: '16px' }}
                          />
                          <div>
                            <div style={{ fontWeight: 600 }}>Security &amp; Login Audit Alerts</div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>Notify when administrative logins occur or privilege changes are executed</div>
                          </div>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#1E293B', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={notifGuardianBroadcasts}
                            onChange={(e) => setNotifGuardianBroadcasts(e.target.checked)}
                            style={{ width: '16px', height: '16px' }}
                          />
                          <div>
                            <div style={{ fontWeight: 600 }}>Broadcast Publication Confirmations</div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>Receive dispatch reports when schoolwide notices are posted to guardians</div>
                          </div>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#1E293B', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={notifAttendanceDigest}
                            onChange={(e) => setNotifAttendanceDigest(e.target.checked)}
                            style={{ width: '16px', height: '16px' }}
                          />
                          <div>
                            <div style={{ fontWeight: 600 }}>Daily Attendance Summary Digest</div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>Receive an automated morning attendance submission and absence overview</div>
                          </div>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#1E293B', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={notifSystemErrors}
                            onChange={(e) => setNotifSystemErrors(e.target.checked)}
                            style={{ width: '16px', height: '16px' }}
                          />
                          <div>
                            <div style={{ fontWeight: 600 }}>System Error &amp; Integrity Alerts</div>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>High-priority notifications on failed background jobs or unassigned classes</div>
                          </div>
                        </label>

                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ marginTop: '10px' }}
                          onClick={() => setActionMessage({ text: 'Notification preferences saved successfully!', type: 'success' })}
                        >
                          Save Notification Preferences
                        </button>
                      </div>
                    </div>

                    {/* ACTIVE SESSION CARD */}
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">🚪 Session Security &amp; Sign Out</h4>
                        <span className="status-tag success">Active Session</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', color: '#334155' }}>
                        <div><strong>Signed In As:</strong> {user.username}</div>
                        <div><strong>Role Level:</strong> System Administrator</div>
                        <div><strong>System Permissions:</strong> {user.permissions?.length || 0} active authorization grants</div>
                        <div><strong>Session Token:</strong> JWT Bearer Authentication</div>
                        <div style={{ marginTop: '12px', padding: '12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px' }}>
                          <div style={{ fontWeight: 700, color: '#991B1B', marginBottom: '6px' }}>Terminate Administrator Session</div>
                          <p style={{ fontSize: '12px', color: '#7F1D1D', margin: '0 0 10px' }}>
                            Sign out of the system on this device. All cached session tokens will be cleared immediately.
                          </p>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ background: '#EF4444', color: '#FFFFFF', borderColor: '#DC2626', width: '100%' }}
                            onClick={onLogout}
                          >
                            Sign Out Now
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RECENT ACTIVITY CARD */}
                  <div className="admin-card">
                    <div className="admin-card-header">
                      <h4 className="admin-card-title">🛡️ Recent Account Security &amp; Audit Trail</h4>
                      <button className="btn-secondary btn-sm" onClick={() => loadAuditLogs()}>
                        🔄 Refresh Activity
                      </button>
                    </div>
                    <div className="admin-table-container">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Action Performed</th>
                            <th>Entity Target</th>
                            <th>Outcome</th>
                            <th>Details / Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditLogsList
                            .filter((l) => l.actor_username === user.username || l.actor_username === 'admin')
                            .slice(0, 10)
                            .map((log) => (
                              <tr key={log.id}>
                                <td style={{ fontSize: '11px', color: '#64748B' }}>
                                  {new Date(log.occurred_at).toLocaleString()}
                                </td>
                                <td style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1F3A5F' }}>{log.action}</td>
                                <td style={{ fontSize: '12px' }}>{log.entity_type} {log.entity_id ? `(#${log.entity_id})` : ''}</td>
                                <td>
                                  <span className={`status-tag ${log.outcome}`}>{log.outcome}</span>
                                </td>
                                <td style={{ fontSize: '12px', color: '#475569' }}>
                                  {log.reason || (log.changes ? JSON.stringify(log.changes) : '-')}
                                </td>
                              </tr>
                            ))}
                          {auditLogsList.filter((l) => l.actor_username === user.username || l.actor_username === 'admin').length === 0 && (
                            <tr>
                              <td colSpan={5} style={{ textAlign: 'center', padding: '20px', color: '#94A3B8' }}>
                                No recent administrator account actions recorded.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* GLOBAL MODALS */}
      {/* ========================================================================= */}

      {/* 1. STUDENT DETAILS PROFILE MODAL */}
      {viewStudentModalOpen && selectedStudent && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Student Profile: {selectedStudent.first_name} {selectedStudent.father_name}</h3>
              {selectedStudent.photo_document_id && <img crossOrigin="use-credentials" src={`${(import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '')}/admin/students/${selectedStudent.id}/photo`} alt={`${selectedStudent.first_name} ${selectedStudent.father_name}`} style={{ width: 112, height: 112, objectFit: 'cover', borderRadius: 10, marginBottom: 14 }} />}
              <button className="modal-close-btn" onClick={() => setViewStudentModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div><strong>Admission No:</strong> {selectedStudent.admission_no}</div>
                <div><strong>Status:</strong> <span className={`status-tag ${selectedStudent.status}`}>{selectedStudent.status}</span></div>
                <div><strong>Gender:</strong> {selectedStudent.gender}</div>
                <div><strong>Date of Birth:</strong> {selectedStudent.date_of_birth ? new Date(selectedStudent.date_of_birth).toLocaleDateString() : 'N/A'}</div>
                <div><strong>Placement:</strong> {selectedStudent.grade_name} – {selectedStudent.section_name} ({selectedStudent.section_stream})</div>
                <div><strong>Admission Date:</strong> {selectedStudent.admission_date ? new Date(selectedStudent.admission_date).toLocaleDateString() : 'N/A'}</div>
              </div>

              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1F3A5F', margin: '14px 0 8px' }}>Linked Guardians</h4>
              {selectedStudent.guardians && selectedStudent.guardians.length > 0 ? (
                selectedStudent.guardians.map((g: any) => (
                  <div key={g.id} style={{ background: '#F8FAFC', padding: '10px', borderRadius: '6px', marginBottom: '6px' }}>
                    <strong>{g.first_name} {g.father_name}</strong> ({g.relationship}) • Phone: {g.phone}
                  </div>
                ))
              ) : (
                <div style={{ color: '#94A3B8', fontSize: '12px' }}>No guardians linked.</div>
              )}

              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1F3A5F', margin: '14px 0 8px' }}>Enrollment History</h4>
              {selectedStudent.enrollments && selectedStudent.enrollments.map((en: any) => (
                <div key={en.id} style={{ fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                  • {en.academic_year_name}: {en.grade_name} - {en.section_name} (Roll: {en.roll_no}, Status: {en.status})
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={handleOpenStudentEdit}>Edit Student Profile</button>
              <button className="btn-secondary" onClick={() => setViewStudentModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {studentEditModalOpen && selectedStudent && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="student-edit-title">
            <div className="modal-header">
              <h3 id="student-edit-title">Edit Student Profile</h3>
              <button type="button" className="modal-close-btn" onClick={() => setStudentEditModalOpen(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={handleSaveStudentEdit}>
              <div className="modal-body">
                <p style={{ color: '#64748B', fontSize: 13, marginTop: 0 }}>Admission number: <strong>{selectedStudent.admission_no}</strong>. This identifier cannot be changed here.</p>
                <div className="form-grid-2">
                  <div className="form-field"><label htmlFor="student-edit-first">First name *</label><input id="student-edit-first" value={studentEditForm.firstName} onChange={(e) => setStudentEditForm({ ...studentEditForm, firstName: e.target.value })} required /></div>
                  <div className="form-field"><label htmlFor="student-edit-father">Father's name *</label><input id="student-edit-father" value={studentEditForm.fatherName} onChange={(e) => setStudentEditForm({ ...studentEditForm, fatherName: e.target.value })} required /></div>
                  <div className="form-field"><label htmlFor="student-edit-grandfather">Grandfather's name</label><input id="student-edit-grandfather" value={studentEditForm.grandfatherName} onChange={(e) => setStudentEditForm({ ...studentEditForm, grandfatherName: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="student-edit-gender">Gender *</label><select id="student-edit-gender" value={studentEditForm.gender} onChange={(e) => setStudentEditForm({ ...studentEditForm, gender: e.target.value as 'female' | 'male' })}>{studentOptions?.genders.map((gender) => <option key={gender} value={gender}>{formatStudentOption(gender)}</option>)}</select></div>
                  <div className="form-field"><label htmlFor="student-edit-dob">Date of birth *</label><input id="student-edit-dob" type="date" value={studentEditForm.dateOfBirth} onChange={(e) => setStudentEditForm({ ...studentEditForm, dateOfBirth: e.target.value })} required /></div>
                  <div className="form-field"><label htmlFor="student-edit-phone">Phone</label><input id="student-edit-phone" type="tel" value={studentEditForm.phone} onChange={(e) => setStudentEditForm({ ...studentEditForm, phone: e.target.value })} /></div>
                </div>
                <div className="form-field"><label htmlFor="student-edit-address">Address</label><input id="student-edit-address" value={studentEditForm.address} onChange={(e) => setStudentEditForm({ ...studentEditForm, address: e.target.value })} /></div>
                <h4 style={{ color: '#1F3A5F', marginBottom: 8 }}>Primary guardian</h4>
                <div className="form-grid-2">
                  <div className="form-field"><label htmlFor="student-edit-guardian">Guardian full name</label><input id="student-edit-guardian" value={studentEditForm.guardianName} onChange={(e) => setStudentEditForm({ ...studentEditForm, guardianName: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="student-edit-guardian-phone">Guardian phone</label><input id="student-edit-guardian-phone" type="tel" value={studentEditForm.guardianPhone} onChange={(e) => setStudentEditForm({ ...studentEditForm, guardianPhone: e.target.value })} /></div>
                </div>
                <div className="form-field"><label htmlFor="student-edit-guardian-relation">Relationship</label><select id="student-edit-guardian-relation" value={studentEditForm.guardianRelation} onChange={(e) => setStudentEditForm({ ...studentEditForm, guardianRelation: e.target.value })} required={Boolean(studentEditForm.guardianName.trim() || studentEditForm.guardianPhone.trim())}><option value="">Select relationship</option>{studentOptions?.guardianRelationships.map((relationship) => <option key={relationship} value={relationship}>{formatStudentOption(relationship)}</option>)}</select></div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setStudentEditModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={studentEditSaving}>{studentEditSaving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. CHANGE STATUS MODAL */}
      {statusModalStudent && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Change Status: {statusModalStudent.first_name} {statusModalStudent.father_name}</h3>
              <button className="modal-close-btn" onClick={() => setStatusModalStudent(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>New Enrollment Status *</label>
                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} required>
                  <option value="">Select status</option>
                  {studentOptions?.statuses.filter((status) => status !== 'applicant' && status !== statusModalStudent.student_status).map((status) => <option key={status} value={status}>{formatStudentOption(status)}</option>)}
                </select>
              </div>

              {newStatus === 'transferred' && (
                <div className="form-field">
                  <label htmlFor="student-transfer-destination">Destination School *</label>
                  <input
                    id="student-transfer-destination"
                    type="text"
                    placeholder="Enter destination school"
                    maxLength={190}
                    required
                    value={destinationSchool}
                    onChange={(e) => setDestinationSchool(e.target.value)}
                  />
                </div>
              )}

              {newStatus === 'active' && statusModalStudent.student_status !== 'active' && (
                <div className="form-field">
                  <label htmlFor="student-reactivation-section">Section placement *</label>
                  <select id="student-reactivation-section" value={statusSectionId} onChange={(e) => setStatusSectionId(e.target.value)} required>
                    <option value="">Select a section</option>
                    {academicStructure?.sections?.map((section: any) => (
                      <option key={section.id} value={section.id}>{section.grade_name} - {section.name} ({section.stream}) · {section.capacity - section.enrolled_count} seats available</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-field">
                <label htmlFor="student-status-effective-date">Effective date *</label>
                <input id="student-status-effective-date" type="date" value={statusEffectiveDate} onChange={(e) => setStatusEffectiveDate(e.target.value)} required />
              </div>
              <div className="form-field">
                <label>Reason for Status Change *</label>
                <textarea
                  rows={3}
                  placeholder="Provide administrative justification..."
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setStatusModalStudent(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleChangeStudentStatus}>Save Status Change</button>
            </div>
          </div>
        </div>
      )}

      {/* 3. REASSIGN SECTION MODAL */}
      {reassignModalStudent && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Reassign Section: {reassignModalStudent.first_name} {reassignModalStudent.father_name}</h3>
              <button className="modal-close-btn" onClick={() => setReassignModalStudent(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>Destination Section *</label>
                <select value={newSectionId} onChange={(e) => setNewSectionId(e.target.value)}>
                  <option value="">Select Destination Section</option>
                  {academicStructure?.sections?.map((sec: any) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.grade_name} – {sec.name} ({sec.stream}) • {sec.capacity - sec.enrolled_count} seats left
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setReassignModalStudent(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleReassignSection}>Confirm Section Transfer</button>
            </div>
          </div>
        </div>
      )}

      {/* 4. RESET PASSWORD MODAL */}
      {resetPassModalUser && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Reset Password for @{resetPassModalUser.username}</h3>
              <button className="modal-close-btn" onClick={() => setResetPassModalUser(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>New Password (Bcrypt Encrypted) *</label>
                <input
                  type="text"
                  value={resetNewPass}
                  onChange={(e) => setResetNewPass(e.target.value)}
                />
                <small>Generated default or enter custom security key.</small>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setResetPassModalUser(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleResetPassword}>Save New Password</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. USER ROLES MODAL */}
      {rolesModalUser && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Manage Roles for @{rolesModalUser.username}</h3>
              <button className="modal-close-btn" onClick={() => setRolesModalUser(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '14px' }}>
                Select permitted system access roles for this account:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {availableRoles.map((r) => (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedRoleCodes.includes(r.code)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRoleCodes([...selectedRoleCodes, r.code]);
                        } else {
                          setSelectedRoleCodes(selectedRoleCodes.filter((c) => c !== r.code));
                        }
                      }}
                    />
                    <strong>{r.name}</strong> ({r.code})
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setRolesModalUser(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveRoles}>Save Role Assignments</button>
            </div>
          </div>
        </div>
      )}

      {/* 5B. REGISTER / CREATE USER ACCOUNT MODAL */}
      {newUserModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Register New User Account</h3>
              <button className="modal-close-btn" onClick={() => setNewUserModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                <div className="form-field">
                  <label>Username (Login Handle) *</label>
                  <input
                    type="text"
                    placeholder="e.g. t.haile, adm.alem, s.bekele"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    required
                  />
                  <small>Unique username used to log into HSPSMS.</small>
                </div>
                <div className="form-field">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    placeholder="user@school.et"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    required
                  />
                  <small>Official contact email address.</small>
                </div>
                <div className="form-field">
                  <label>Phone Number (Optional)</label>
                  <input
                    type="tel"
                    placeholder="+251 911 234567"
                    value={newUserPhone}
                    onChange={(e) => setNewUserPhone(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Account Role *</label>
                  <select
                    value={newUserRoleCode}
                    onChange={(e) => setNewUserRoleCode(e.target.value)}
                    required
                  >
                    <option value="system_admin">Administrator (System Administrator)</option>
                    <option value="principal">Principal (School Oversight &amp; Approvals)</option>
                    <option value="academic_director">Academic Director</option>
                    <option value="registrar">Registrar (Admissions &amp; Enrollments)</option>
                    <option value="teacher">Teacher (Attendance &amp; Marks)</option>
                    <option value="accountant">Accountant (Invoices &amp; Payments)</option>
                    <option value="librarian">Librarian (Book Circulation)</option>
                    <option value="student">Student (Timetable &amp; Report Cards)</option>
                    <option value="guardian">Parent / Guardian (Child Progress)</option>
                  </select>
                  <small>Select the account role: Administrator, Principal, Teacher, Accountant, etc.</small>
                </div>
                <div className="form-field">
                  <label>Initial Password (Encrypted with Bcrypt) *</label>
                  <input
                    type="text"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    required
                  />
                  <small>Minimum 6 characters. The user can update it anytime from their profile.</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setNewUserModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Register Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. NEW ACADEMIC YEAR MODAL (UNRESTRICTED DATES & YEARS) */}
      {newYearModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Create Academic Year</h3>
              <button className="modal-close-btn" onClick={() => setNewYearModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateYear}>
              <div className="modal-body">
                <div className="form-field">
                  <label>Year Quick Presets (or choose Custom to enter any year)</label>
                  <select
                    value={newYearPreset}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewYearPreset(val);
                      const found = YEAR_PRESETS.find((p) => p.name === val);
                      if (found) {
                        setNewYearName(found.name);
                        setNewYearLabelEc(found.ec);
                        setNewYearStart(found.start);
                        setNewYearEnd(found.end);
                      }
                    }}
                  >
                    <option value="custom">-- Custom Year (Open / Unrestricted) --</option>
                    {YEAR_PRESETS.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} ({p.ec})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Academic Year Name (Any Year, e.g. 2028/29, 2030, 2025/2026) *</label>
                  <input
                    type="text"
                    placeholder="e.g. 2028/29"
                    value={newYearName}
                    onChange={(e) => setNewYearName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-field">
                  <label>Ethiopian Calendar Label (e.g. 2021 E.C.)</label>
                  <input
                    type="text"
                    placeholder="e.g. 2021 E.C."
                    value={newYearLabelEc}
                    onChange={(e) => setNewYearLabelEc(e.target.value)}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Start Date (All Dates, Months &amp; Years) *</label>
                    <input
                      type="date"
                      value={newYearStart}
                      onChange={(e) => setNewYearStart(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>End Date (All Dates, Months &amp; Years) *</label>
                    <input
                      type="date"
                      value={newYearEnd}
                      onChange={(e) => setNewYearEnd(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setNewYearModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Year</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. NEW TERM / SEMESTER MODAL (SEMESTER 1, 2, AND OTHER OPTIONS) */}
      {newTermModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Create Academic Term / Semester</h3>
              <button className="modal-close-btn" onClick={() => setNewTermModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateTerm}>
              <div className="modal-body">
                <div className="form-field">
                  <label>Academic Year *</label>
                  <select value={newTermYearId} onChange={(e) => setNewTermYearId(e.target.value)} required>
                    <option value="">Select Year</option>
                    {academicStructure?.academicYears?.map((y: any) => (
                      <option key={y.id} value={y.id}>
                        {y.name} {y.label_ec ? `(${y.label_ec})` : ''} {y.is_current ? '★ (Active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label style={{ fontWeight: 700, marginBottom: '6px', display: 'block' }}>Semester / Term Option *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: termTypeOption === 'semester_1' ? '2px solid #2E6DA4' : '1px solid #CBD5E1',
                        background: termTypeOption === 'semester_1' ? '#EFF6FF' : '#F8FAFC',
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                      onClick={() => {
                        setTermTypeOption('semester_1');
                        setNewTermNo(1);
                        setNewTermName('Semester 1');
                        const yr = academicStructure?.academicYears?.find((y: any) => String(y.id) === String(newTermYearId));
                        if (yr?.start_date) {
                          const yStart = new Date(yr.start_date).getFullYear();
                          setNewTermStart(`${yStart}-09-10`);
                          setNewTermEnd(`${yStart + 1}-01-30`);
                        }
                      }}
                    >
                      <input
                        type="radio"
                        name="termOptionRadio"
                        checked={termTypeOption === 'semester_1'}
                        onChange={() => {}}
                        style={{ marginRight: '6px' }}
                      />
                      <strong style={{ color: '#1F3A5F' }}>Semester 1</strong>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Term Sequence #1</div>
                    </div>

                    <div
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: termTypeOption === 'semester_2' ? '2px solid #2E6DA4' : '1px solid #CBD5E1',
                        background: termTypeOption === 'semester_2' ? '#EFF6FF' : '#F8FAFC',
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                      onClick={() => {
                        setTermTypeOption('semester_2');
                        setNewTermNo(2);
                        setNewTermName('Semester 2');
                        const yr = academicStructure?.academicYears?.find((y: any) => String(y.id) === String(newTermYearId));
                        if (yr?.end_date) {
                          const yEnd = new Date(yr.end_date).getFullYear();
                          setNewTermStart(`${yEnd}-02-10`);
                          setNewTermEnd(`${yEnd}-07-05`);
                        }
                      }}
                    >
                      <input
                        type="radio"
                        name="termOptionRadio"
                        checked={termTypeOption === 'semester_2'}
                        onChange={() => {}}
                        style={{ marginRight: '6px' }}
                      />
                      <strong style={{ color: '#1F3A5F' }}>Semester 2</strong>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Term Sequence #2</div>
                    </div>

                    <div
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: termTypeOption === 'other' ? '2px solid #2E6DA4' : '1px solid #CBD5E1',
                        background: termTypeOption === 'other' ? '#EFF6FF' : '#F8FAFC',
                        cursor: 'pointer',
                        textAlign: 'center'
                      }}
                      onClick={() => {
                        setTermTypeOption('other');
                        setNewTermNo(3);
                        setNewTermName(customTermName || 'Summer Semester');
                      }}
                    >
                      <input
                        type="radio"
                        name="termOptionRadio"
                        checked={termTypeOption === 'other'}
                        onChange={() => {}}
                        style={{ marginRight: '6px' }}
                      />
                      <strong style={{ color: '#1F3A5F' }}>Other Term</strong>
                      <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>Custom Session</div>
                    </div>
                  </div>
                </div>

                {termTypeOption === 'other' ? (
                  <div className="form-grid-2">
                    <div className="form-field">
                      <label>Custom Term Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Summer Semester, Trimester 3, Quarter 1"
                        value={customTermName}
                        onChange={(e) => {
                          setCustomTermName(e.target.value);
                          setNewTermName(e.target.value);
                        }}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label>Term Sequence Number *</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={newTermNo}
                        onChange={(e) => setNewTermNo(Number(e.target.value))}
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="form-field">
                    <label>Configured Term Label</label>
                    <input
                      type="text"
                      value={newTermName}
                      onChange={(e) => setNewTermName(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Start Date (All Dates, Months &amp; Years) *</label>
                    <input
                      type="date"
                      value={newTermStart}
                      onChange={(e) => setNewTermStart(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>End Date (All Dates, Months &amp; Years) *</label>
                    <input
                      type="date"
                      value={newTermEnd}
                      onChange={(e) => setNewTermEnd(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setNewTermModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Term</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. NEW SECTION MODAL */}
      {newSecModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Create Class / Section</h3>
              <button className="modal-close-btn" onClick={() => setNewSecModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateSection}>
              <div className="modal-body">
                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Grade Level (9–12) *</label>
                    <select value={newSecGradeId} onChange={(e) => setNewSecGradeId(e.target.value)} required>
                      <option value="">Select Grade</option>
                      {academicStructure?.grades?.map((g: any) => (
                        <option key={g.id} value={g.id}>{g.display_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Section Name *</label>
                    <input type="text" placeholder="e.g. 11-A" value={newSecName} onChange={(e) => setNewSecName(e.target.value)} required />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Stream Track *</label>
                    <select value={newSecStream} onChange={(e) => setNewSecStream(e.target.value as any)}>
                      <option value="none">None (Grades 9–10)</option>
                      <option value="natural_science">Natural Science</option>
                      <option value="social_science">Social Science</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Capacity *</label>
                    <input type="number" min={10} max={60} value={newSecCapacity} onChange={(e) => setNewSecCapacity(Number(e.target.value))} required />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Homeroom Teacher</label>
                    <select value={newSecHomeroom} onChange={(e) => setNewSecHomeroom(e.target.value)}>
                      <option value="">Select Homeroom Teacher</option>
                      {staffList.filter((s) => s.staff_type === 'teacher').map((s) => (
                        <option key={s.id} value={s.id}>{s.first_name} {s.father_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Designated Classroom</label>
                    <select value={newSecRoom} onChange={(e) => setNewSecRoom(e.target.value)}>
                      <option value="">Select Room</option>
                      {academicStructure?.classrooms?.map((cr: any) => (
                        <option key={cr.id} value={cr.id}>{cr.name} ({cr.building})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setNewSecModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Section</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. NEW SUBJECT MODAL */}
      {newSubjModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Create Curriculum Subject</h3>
              <button className="modal-close-btn" onClick={() => setNewSubjModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateSubject}>
              <div className="modal-body">
                <div className="form-field">
                  <label>Subject Code (e.g. PHY, BIO, MAT) *</label>
                  <input type="text" placeholder="e.g. CHE" value={newSubjCode} onChange={(e) => setNewSubjCode(e.target.value)} required />
                </div>
                <div className="form-field">
                  <label>Subject Name (English) *</label>
                  <input type="text" placeholder="e.g. Chemistry" value={newSubjName} onChange={(e) => setNewSubjName(e.target.value)} required />
                </div>
                <div className="form-field">
                  <label>Subject Name (Amharic)</label>
                  <input type="text" placeholder="e.g. ኬሚስትሪ" value={newSubjNameAm} onChange={(e) => setNewSubjNameAm(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setNewSubjModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add Subject</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. MAP SUBJECT TO GRADE MODAL */}
      {mapSubjModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Map Subject to Grade Curriculum</h3>
              <button className="modal-close-btn" onClick={() => setMapSubjModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleMapGradeSubject}>
              <div className="modal-body">
                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Target Grade Level *</label>
                    <select value={mapGradeId} onChange={(e) => setMapGradeId(e.target.value)} required>
                      <option value="">Select Grade</option>
                      {academicStructure?.grades?.map((g: any) => (
                        <option key={g.id} value={g.id}>{g.display_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Subject *</label>
                    <select value={mapSubjId} onChange={(e) => setMapSubjId(e.target.value)} required>
                      <option value="">Select Subject</option>
                      {academicStructure?.subjects?.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Stream Track *</label>
                    <select value={mapStream} onChange={(e) => setMapStream(e.target.value as any)}>
                      <option value="all">All / Common Track</option>
                      <option value="natural_science">Natural Science Only</option>
                      <option value="social_science">Social Science Only</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Periods per Week *</label>
                    <input type="number" min={1} max={10} value={mapPeriods} onChange={(e) => setMapPeriods(Number(e.target.value))} required />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setMapSubjModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Link to Curriculum</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 11. ASSIGN TEACHER MODAL */}
      {assignModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Assign Teacher to Subject &amp; Class</h3>
              <button className="modal-close-btn" onClick={() => setAssignModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateAssignment}>
              <div className="modal-body">
                <div className="form-field">
                  <label>Teacher / Faculty Member *</label>
                  <select value={assignStaffId} onChange={(e) => setAssignStaffId(e.target.value)} required>
                    <option value="">Select Teacher</option>
                    {staffList.filter((s) => s.staff_type === 'teacher').map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.father_name} ({s.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Subject *</label>
                    <select value={assignSubjId} onChange={(e) => setAssignSubjId(e.target.value)} required>
                      <option value="">Select Subject</option>
                      {academicStructure?.subjects?.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Class &amp; Section *</label>
                    <select value={assignSecId} onChange={(e) => setAssignSecId(e.target.value)} required>
                      <option value="">Select Section</option>
                      {academicStructure?.sections?.map((sec: any) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.grade_name} – {sec.name} ({sec.stream})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label>Academic Year *</label>
                  <select value={assignYearId} onChange={(e) => setAssignYearId(e.target.value)} required>
                    <option value="">Select Academic Year</option>
                    {academicStructure?.academicYears?.map((y: any) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setAssignModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Confirm Teaching Assignment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 12. ANNOUNCEMENT BROADCAST MODAL */}
      {annModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Broadcast School Announcement</h3>
              <button className="modal-close-btn" onClick={() => setAnnModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateAnnouncement}>
              <div className="modal-body">
                <div className="form-field">
                  <label>Announcement Headline *</label>
                  <input
                    type="text"
                    placeholder="e.g. Mid-term Exam Schedule Announced"
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Target Audience *</label>
                    <select value={annTargetRole} onChange={(e) => setAnnTargetRole(e.target.value)}>
                      <option value="all">Entire School Community</option>
                      <option value="teacher">Teachers &amp; Faculty Only</option>
                      <option value="student">Students Only</option>
                      <option value="guardian">Parents / Guardians Only</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Publication Status *</label>
                    <select value={annStatus} onChange={(e) => setAnnStatus(e.target.value)}>
                      <option value="published">Publish Immediately</option>
                      <option value="draft">Save as Draft</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label>Announcement Message Body *</label>
                  <textarea
                    rows={4}
                    placeholder="Type the full announcement content here..."
                    value={annContent}
                    onChange={(e) => setAnnContent(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setAnnModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Publish Announcement</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
