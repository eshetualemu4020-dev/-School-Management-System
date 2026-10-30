import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import AdminAcademicLifecycle from './AdminAcademicLifecycle';
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
  | 'teachers'
  | 'staff_users'
  | 'academic_structure'
  | 'assignments_timetable'
  | 'attendance_results'
  | 'finance_fees'
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

// Mirrors the backend password policy (backend/src/modules/auth/security.utils.ts).
// Keep this in sync so client-side validation matches the server exactly.
const validatePasswordStrength = (value: string): string | null => {
  if (!value || value.length < 8) return 'Password must be at least 8 characters long.';
  if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter (A-Z).';
  if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter (a-z).';
  if (!/[0-9]/.test(value)) return 'Password must contain at least one number (0-9).';
  return null;
};
const formatElapsedSeconds = (seconds: number) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return [days ? `${days}d` : '', `${hours}h`, `${minutes}m`].filter(Boolean).join(' ');
};

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
  const [staffTab, setStaffTab] = useState<'staff_list' | 'add_staff' | 'users_list' | 'active_sessions' | 'login_attempts' | 'role_matrix'>('staff_list');
  const [teacherTab, setTeacherTab] = useState<'directory' | 'add_teacher' | 'workloads'>('directory');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherStatusFilter, setTeacherStatusFilter] = useState('');
  const [teacherSort, setTeacherSort] = useState('name');
  const [teacherPage, setTeacherPage] = useState(1);
  const [teacherPageSize] = useState(25);
  const [teacherList, setTeacherList] = useState<any[]>([]);
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [teacherHasMore, setTeacherHasMore] = useState(false);

  // Teacher profile drawer
  const [teacherProfile, setTeacherProfile] = useState<any>(null);
  const [teacherProfileOpen, setTeacherProfileOpen] = useState(false);
  const [teacherProfileLoading, setTeacherProfileLoading] = useState(false);

  // Offboarding dialog target
  const [offboardTeacher, setOffboardTeacher] = useState<any>(null);
  const [offboardStatus, setOffboardStatus] = useState<'on_leave' | 'terminated'>('on_leave');
  const [offboardDate, setOffboardDate] = useState(getLocalDateInputValue());
  const [offboardDisableLogin, setOffboardDisableLogin] = useState(false);

  // Teacher password reset
  const [teacherResetTarget, setTeacherResetTarget] = useState<any>(null);
  const [teacherResetPassword, setTeacherResetPassword] = useState('');

  // Qualifications & Documents (teacher management only)
  const [qualifications, setQualifications] = useState<any[]>([]);
  const [qualificationsLoading, setQualificationsLoading] = useState(false);
  const [qualificationHistory, setQualificationHistory] = useState<any[]>([]);
  const [qualificationModalOpen, setQualificationModalOpen] = useState(false);
  const [editingQualificationId, setEditingQualificationId] = useState<number | null>(null);
  const [qualificationForm, setQualificationForm] = useState({
    qualificationLevel: 'bachelors',
    title: '',
    institution: '',
    fieldOfStudy: '',
    awardDate: '',
    gradeOrClass: '',
    registrationNo: '',
    notes: ''
  });
  const [includeStaffQualification, setIncludeStaffQualification] = useState(false);
  const [newStaffQualification, setNewStaffQualification] = useState({
    qualificationLevel: 'bachelors',
    title: '',
    institution: '',
    fieldOfStudy: '',
    awardDate: '',
    gradeOrClass: '',
    registrationNo: '',
    notes: ''
  });
  const [qualificationSaving, setQualificationSaving] = useState(false);
  const [qualificationError, setQualificationError] = useState('');
  const [qualificationDocumentTarget, setQualificationDocumentTarget] = useState<any>(null);
  const [qualificationDocument, setQualificationDocument] = useState<{ originalName: string; mimeType: string; dataBase64: string } | null>(null);
  const [qualificationDocumentUploading, setQualificationDocumentUploading] = useState(false);
  const [qualificationVerifyTarget, setQualificationVerifyTarget] = useState<any>(null);
  const [qualificationVerifyNote, setQualificationVerifyNote] = useState('');
  const [academicTab, setAcademicTab] = useState<'years_terms' | 'sections' | 'subjects'>('years_terms');
  const [assignmentTab, setAssignmentTab] = useState<'assignments' | 'timetable' | 'schedule_entry' | 'time_slots'>('assignments');
  const [resultsTab, setResultsTab] = useState<'attendance' | 'assessments' | 'performance' | 'grading_scales' | 'approvals' | 'publishing' | 'lifecycle'>('attendance');
  const [financeTab, setFinanceTab] = useState<'overview' | 'invoices' | 'payments' | 'structures' | 'scholarships'>('overview');
  const [reportsTab, setReportsTab] = useState<'reports' | 'library'>('reports');
  const [commsTab, setCommsTab] = useState<'announcements' | 'audit'>('announcements');
  const [settingsCategory, setSettingsCategory] = useState<
    'identity' | 'academic' | 'grading' | 'attendance' | 'preferences' | 'all' | 'backups' | 'recycle_bin' | 'system_health'
  >('identity');
  const [settingsSearch, setSettingsSearch] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [customVal, setCustomVal] = useState('');
  const [notifSecurityAlerts, setNotifSecurityAlerts] = useState(true);

  // Package 5: Disaster Recovery & System Diagnostics State
  const [backupsList, setBackupsList] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupNotes, setBackupNotes] = useState('');
  const [backupType, setBackupType] = useState<'manual' | 'scheduled' | 'pre_close'>('manual');
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoreModalBackup, setRestoreModalBackup] = useState<any | null>(null);
  const [restoreConfirmWord, setRestoreConfirmWord] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoringBackup, setRestoringBackup] = useState(false);

  // Recycle Bin State
  const [recycleBinItems, setRecycleBinItems] = useState<any[]>([]);
  const [recycleBinTotal, setRecycleBinTotal] = useState(0);
  const [recycleBinPage, setRecycleBinPage] = useState(1);
  const [recycleBinEntityType, setRecycleBinEntityType] = useState('');
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);
  const [purgeConfirmItem, setPurgeConfirmItem] = useState<any | null>(null);
  const [purgePassword, setPurgePassword] = useState('');
  const [purgingItem, setPurgingItem] = useState(false);

  // System Diagnostics State
  const [diagnosticsData, setDiagnosticsData] = useState<any | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [notifGuardianBroadcasts, setNotifGuardianBroadcasts] = useState(true);
  const [notifAttendanceDigest, setNotifAttendanceDigest] = useState(false);
  const [notifSystemErrors, setNotifSystemErrors] = useState(true);

  // Package 3: Approvals Queue State
  const [approvalsList, setApprovalsList] = useState<any[]>([]);
  const [approvalsTotal, setApprovalsTotal] = useState(0);
  const [approvalsPage, setApprovalsPage] = useState(1);
  const [approvalsStatusFilter, setApprovalsStatusFilter] = useState('pending');
  const [approvalsTypeFilter, setApprovalsTypeFilter] = useState('all');
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsSummary, setApprovalsSummary] = useState<{ totalPending: number; byType: Record<string, number> }>({
    totalPending: 0,
    byType: {}
  });
  const [decisionModalItem, setDecisionModalItem] = useState<any | null>(null);
  const [decisionAction, setDecisionAction] = useState<'approve' | 'reject'>('approve');
  const [decisionNote, setDecisionNote] = useState('');
  const [decidingApproval, setDecidingApproval] = useState(false);

  // Package 1: Finance & Fees State
  const [financeOverview, setFinanceOverview] = useState<any | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [feeCategoriesList, setFeeCategoriesList] = useState<any[]>([]);
  const [feeStructuresList, setFeeStructuresList] = useState<any[]>([]);
  const [invoicesList, setInvoicesList] = useState<any[]>([]);
  const [invoicesTotal, setInvoicesTotal] = useState(0);
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [invoicesStatusFilter, setInvoicesStatusFilter] = useState('all');
  const [invoicesSearch, setInvoicesSearch] = useState('');
  const [paymentsList, setPaymentsList] = useState<any[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsMethodFilter, setPaymentsMethodFilter] = useState('all');
  const [paymentsSearch, setPaymentsSearch] = useState('');
  const [scholarshipsList, setScholarshipsList] = useState<any[]>([]);

  // Finance Modals & Action State
  const [newInvoiceModalOpen, setNewInvoiceModalOpen] = useState(false);
  const [newInvStudentId, setNewInvStudentId] = useState<number | ''>('');
  const [invoiceStudentOptions, setInvoiceStudentOptions] = useState<any[]>([]);
  const [invoiceStudentSearch, setInvoiceStudentSearch] = useState('');
  const [newInvDueDate, setNewInvDueDate] = useState('');
  const [newInvNotes, setNewInvNotes] = useState('');
  const [newInvItems, setNewInvItems] = useState<Array<{ fee_category_id: number; description: string; quantity: number; unit_amount: number }>>([
    { fee_category_id: 0, description: '', quantity: 1, unit_amount: 0 }
  ]);
  const [recordPaymentModalOpen, setRecordPaymentModalOpen] = useState(false);
  const [recPayStudentId, setRecPayStudentId] = useState<number | ''>('');
  const [recPayInvoiceId, setRecPayInvoiceId] = useState<number | ''>('');
  const [recPayAmount, setRecPayAmount] = useState<number | ''>('');
  const [recPayMethod, setRecPayMethod] = useState('telebirr');
  const [recPayReference, setRecPayReference] = useState('');
  const [recPayPayerName, setRecPayPayerName] = useState('');
  const [recPayNotes, setRecPayNotes] = useState('');
  const [invoiceDetailModal, setInvoiceDetailModal] = useState<any | null>(null);
  const [paymentReceiptModal, setPaymentReceiptModal] = useState<any | null>(null);
  const [newFeeStructModalOpen, setNewFeeStructModalOpen] = useState(false);
  const [newFeeStructYearId, setNewFeeStructYearId] = useState<number | ''>('');
  const [newFeeStructGradeId, setNewFeeStructGradeId] = useState<number | ''>('');
  const [newFeeStructCatId, setNewFeeStructCatId] = useState<number | ''>('');
  const [newFeeStructAmount, setNewFeeStructAmount] = useState<number | ''>('');
  const [newFeeCategoryModalOpen, setNewFeeCategoryModalOpen] = useState(false);
  const [newFeeCategoryCode, setNewFeeCategoryCode] = useState('');
  const [newFeeCategoryName, setNewFeeCategoryName] = useState('');
  const [newFeeCategoryRecurring, setNewFeeCategoryRecurring] = useState(false);
  const [newFeeStructDueDate, setNewFeeStructDueDate] = useState('');
  const [newWaiverModalOpen, setNewWaiverModalOpen] = useState(false);
  const [newWaiverStudentId, setNewWaiverStudentId] = useState<number | ''>('');
  const [newWaiverCatId, setNewWaiverCatId] = useState<number | ''>('');
  const [newWaiverType, setNewWaiverType] = useState<'percentage' | 'fixed_amount'>('percentage');
  const [newWaiverValue, setNewWaiverValue] = useState<number | ''>(50);
  const [newWaiverReason, setNewWaiverReason] = useState('');
  const [submittingFinance, setSubmittingFinance] = useState(false);

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
  const [assignmentTeachers, setAssignmentTeachers] = useState<any[]>([]);
  const [loadingAssignmentTeachers, setLoadingAssignmentTeachers] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffTypeFilter, setStaffTypeFilter] = useState('');
  const [staffStatusFilter, setStaffStatusFilter] = useState('');
  const [staffEditRecord, setStaffEditRecord] = useState<any>(null);
  const [staffEditForm, setStaffEditForm] = useState<{ employeeNo: string; firstName: string; fatherName: string; grandfatherName: string; gender: 'female' | 'male'; dateOfBirth: string; phone: string; email: string; address: string; jobTitle: string; department: string; staffType: 'teacher' | 'administrator' | 'support' | 'librarian' | 'accountant' | 'other'; hireDate: string; endDate: string; status: 'active' | 'on_leave' | 'terminated' }>({ employeeNo: '', firstName: '', fatherName: '', grandfatherName: '', gender: 'female', dateOfBirth: '', phone: '', email: '', address: '', jobTitle: '', department: '', staffType: 'teacher', hireDate: '', endDate: '', status: 'active' });
  const [staffEditSaving, setStaffEditSaving] = useState(false);
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
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRoleCode, setNewUserRoleCode] = useState('teacher');

  // Package 6: Security Administration State
  const [securitySessions, setSecuritySessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState<any[]>([]);
  const [loginAttemptsTotal, setLoginAttemptsTotal] = useState(0);
  const [loginAttemptsPage, setLoginAttemptsPage] = useState(1);
  const [loginAttemptsFilter, setLoginAttemptsFilter] = useState<{ username: string; success: string }>({ username: '', success: '' });
  const [loginAttemptsLoading, setLoginAttemptsLoading] = useState(false);

  // Role Permissions Matrix State
  const [matrixRoles, setMatrixRoles] = useState<any[]>([]);
  const [matrixPermissions, setMatrixPermissions] = useState<any[]>([]);
  const [permissionMatrix, setPermissionMatrix] = useState<Record<number, number[]>>({});
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [selectedMatrixRole, setSelectedMatrixRole] = useState<number | null>(null);

  // 2FA Admin Profile State
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [setup2FaData, setSetup2FaData] = useState<{ secret: string; otpauthUri: string; backupCodes: string[] } | null>(null);
  const [verify2FaCode, setVerify2FaCode] = useState('');
  const [disable2FaPassword, setDisable2FaPassword] = useState('');
  const [showDisable2FaModal, setShowDisable2FaModal] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);

  // Bulk User Selection State
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);

  // Confirmation Modal with Admin Password Re-entry
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmActionTitle, setConfirmActionTitle] = useState('');
  const [confirmActionMessage, setConfirmActionMessage] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [confirmPendingAction, setConfirmPendingAction] = useState<(() => Promise<void>) | null>(null);

  // Lightweight, styleable confirmation dialog (replaces window.confirm/prompt).
  const [dialogState, setDialogState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    tone: 'danger' | 'default';
    requirePassword: boolean;
    requireReason: boolean;
    reasonLabel: string;
    onConfirm: (password?: string, reason?: string) => Promise<void>;
  } | null>(null);
  const [dialogPassword, setDialogPassword] = useState('');
  const [dialogReason, setDialogReason] = useState('');
  const [dialogWorking, setDialogWorking] = useState(false);

  // Page 3 Form: Register Staff
  const [staffEmpNo, setStaffEmpNo] = useState('');
  const [staffFirstName, setStaffFirstName] = useState('');
  const [staffFatherName, setStaffFatherName] = useState('');
  const [staffGrandfatherName, setStaffGrandfatherName] = useState('');
  const [staffGender, setStaffGender] = useState<'female' | 'male'>('male');
  const [staffType, setStaffType] = useState<'teacher' | 'administrator' | 'librarian' | 'accountant' | 'support'>('administrator');
  const [staffJobTitle, setStaffJobTitle] = useState('');
  const [staffDept, setStaffDept] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffCreateAccount, setStaffCreateAccount] = useState(true);
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffAccountRole, setStaffAccountRole] = useState('teacher');
  const [staffPhoto, setStaffPhoto] = useState<{ originalName: string; mimeType: string; dataBase64: string } | null>(null);

  // Page 4: Academic Structure & Settings Data
  const [academicStructure, setAcademicStructure] = useState<any>(null);
  const [systemSettings, setSystemSettings] = useState<any[]>([]);
  const [settingsSavingKey, setSettingsSavingKey] = useState<string | null>(null);
  const [settingsFeedback, setSettingsFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
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
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [newSecGradeId, setNewSecGradeId] = useState<number | string>('');
  const [newSecYearId, setNewSecYearId] = useState<number | string>('');
  const [newSecName, setNewSecName] = useState('');
  const [newSecStream, setNewSecStream] = useState<'none' | 'natural_science' | 'social_science'>('none');
  const [newSecCapacity, setNewSecCapacity] = useState(40);
  const [newSecHomeroom, setNewSecHomeroom] = useState<number | string>('');
  const [newSecRoom, setNewSecRoom] = useState<number | string>('');
  const [newSubjModalOpen, setNewSubjModalOpen] = useState(false);
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [newSubjCode, setNewSubjCode] = useState('');
  const [newSubjName, setNewSubjName] = useState('');
  const [newSubjNameAm, setNewSubjNameAm] = useState('');
  const [newSubjDescription, setNewSubjDescription] = useState('');
  const [mapSubjModalOpen, setMapSubjModalOpen] = useState(false);
  const [mapGradeId, setMapGradeId] = useState<number | string>('');
  const [mapSubjId, setMapSubjId] = useState<number | string>('');
  const [mapStream, setMapStream] = useState<'all' | 'natural_science' | 'social_science'>('all');
  const [mapPeriods, setMapPeriods] = useState(4);
  const [mapAcademicYearId, setMapAcademicYearId] = useState<number | string>('');

  // Page 5: Teaching Assignments & Timetable Data
  const [assignmentsData, setAssignmentsData] = useState<{ assignments: any[]; unassigned: any[] }>({ assignments: [], unassigned: [] });
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignStaffId, setAssignStaffId] = useState<number | string>('');
  const [assignSubjId, setAssignSubjId] = useState<number | string>('');
  const [assignSecId, setAssignSecId] = useState<number | string>('');
  const [assignYearId, setAssignYearId] = useState<number | string>('');
  const [assignmentError, setAssignmentError] = useState('');
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [showAssignmentCurriculumMap, setShowAssignmentCurriculumMap] = useState(false);
  const [assignmentMapSubjectId, setAssignmentMapSubjectId] = useState<number | string>('');
  const [assignmentMapPeriods, setAssignmentMapPeriods] = useState(4);
  const [assignmentMapSaving, setAssignmentMapSaving] = useState(false);
  const [timetableEntries, setTimetableEntries] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [slotDay, setSlotDay] = useState(1);
  const [slotLabel, setSlotLabel] = useState('Period 1');
  const [slotStart, setSlotStart] = useState('08:00');
  const [slotEnd, setSlotEnd] = useState('08:45');
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
  const [assessmentOptions, setAssessmentOptions] = useState<any>(null);
  const [assessmentForm, setAssessmentForm] = useState({ teachingAssignmentId: '', termId: '', assessmentTypeId: '', title: '', maxScore: '100', weight: '0', assessmentDate: new Date().toISOString().slice(0, 10) });
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
  const [annSubmitError, setAnnSubmitError] = useState('');
  const [annSubmitting, setAnnSubmitting] = useState(false);
  const [auditLogsList, setAuditLogsList] = useState<any[]>([]);
  const [auditActorFilter, setAuditActorFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState('');
  const [adminProfile, setAdminProfile] = useState<any>(null);
  const [adminProfilePhoto, setAdminProfilePhoto] = useState<{ originalName: string; mimeType: string; dataBase64: string } | null>(null);
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
    loadApprovalsSummary();
    void loadNotifications();
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
    } else if (page === 'teachers') {
      loadTeachers();
      loadRoles();
    } else if (page === 'staff_users') {
      loadStaff();
      loadUsers();
      loadRoles();
    } else if (page === 'academic_structure') {
      loadAcademicStructure();
    } else if (page === 'assignments_timetable') {
      loadAssignments();
      loadTimetable();
      loadAssignmentTeachers();
      if (academicStructure === null) loadAcademicStructure();
    } else if (page === 'attendance_results') {
      loadAttendanceSummary(attSummaryDate);
      loadAssessmentsOverview();
      loadGradingScales();
      loadApprovals();
      loadApprovalsSummary();
    } else if (page === 'finance_fees') {
      loadFinanceData();
      if (academicStructure === null) loadAcademicStructure();
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

  // Non-teaching staff only. Teachers are managed on their own dedicated page.
  const loadStaff = async () => {
    try {
      const requestedType = staffTypeFilter && staffTypeFilter !== 'teacher' ? staffTypeFilter : undefined;
      const res = await api.getAdminStaff(staffSearch || undefined, requestedType, staffStatusFilter || undefined);
      setStaffList((Array.isArray(res) ? res : []).filter((member: any) => member.staff_type !== 'teacher'));
    } catch (err: any) {
      setActionMessage({ text: 'Error loading users and staff: ' + err.message, type: 'error' });
    }
  };

  // Dedicated teacher directory (teachers only, never mixed with other staff).
  const loadTeachers = async (page = teacherPage) => {
    setTeacherLoading(true);
    try {
      // Fetch one extra row to know whether a next page exists.
      const res = await api.getAdminStaff(teacherSearch || undefined, 'teacher', teacherStatusFilter || undefined, {
        limit: teacherPageSize + 1,
        offset: (page - 1) * teacherPageSize,
        sort: teacherSort
      });
      const rows = Array.isArray(res) ? res : [];
      setTeacherHasMore(rows.length > teacherPageSize);
      setTeacherList(rows.slice(0, teacherPageSize));
      setTeacherPage(page);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading teacher directory: ' + err.message, type: 'error' });
    } finally {
      setTeacherLoading(false);
    }
  };

  const openTeacherProfile = async (teacher: any, focusSection?: 'qualifications') => {
    setTeacherProfileOpen(true);
    setTeacherProfileLoading(true);
    setTeacherProfile(null);
    setQualifications([]);
    setQualificationHistory([]);
    void loadQualifications(Number(teacher.id));
    try {
      const data = await api.getAdminTeacherProfile(Number(teacher.id));
      setTeacherProfile(data);
    } catch (err: any) {
      setActionMessage({ text: 'Could not load teacher profile: ' + err.message, type: 'error' });
      setTeacherProfileOpen(false);
    } finally {
      setTeacherProfileLoading(false);
      if (focusSection === 'qualifications') {
        // Wait for the drawer to paint, then scroll the qualifications block into view.
        window.setTimeout(() => {
          document.getElementById('teacher-qualifications-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    }
  };

  const openTeacherQualifications = (teacher: any) => { void openTeacherProfile(teacher, 'qualifications'); };

  const refreshTeacherProfile = async () => {
    if (!teacherProfile?.staff?.id) return;
    try {
      setTeacherProfile(await api.getAdminTeacherProfile(Number(teacherProfile.staff.id)));
    } catch { /* keep the last good profile */ }
  };

  const handleTeacherProfilePhoto = (file: File | null) => {
    if (!file || !teacherProfile?.staff?.id) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setActionMessage({ text: 'Choose a JPEG or PNG photo.', type: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setActionMessage({ text: 'Staff photo must be no larger than 5 MB.', type: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.uploadStaffPhoto(Number(teacherProfile.staff.id), {
          originalName: file.name,
          mimeType: file.type,
          dataBase64: String(reader.result)
        });
        setActionMessage({ text: 'Teacher photo updated.', type: 'success' });
        await refreshTeacherProfile();
        await loadTeachers(teacherPage);
      } catch (err: any) {
        setActionMessage({ text: 'Could not update the teacher photo: ' + err.message, type: 'error' });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOpenOffboard = (teacher: any) => {
    setOffboardTeacher(teacher);
    setOffboardStatus('on_leave');
    setOffboardDate(getLocalDateInputValue());
    setOffboardDisableLogin(false);
  };

  const handleOffboardTeacher = async () => {
    if (!offboardTeacher) return;
    try {
      await api.updateAdminStaff(Number(offboardTeacher.id), {
        status: offboardStatus,
        endDate: offboardStatus === 'terminated' ? offboardDate : undefined
      });
      if (offboardDisableLogin && offboardTeacher.user_id) {
        await api.updateAdminUserStatus(Number(offboardTeacher.user_id), 'disabled');
      }
      setActionMessage({
        text: `${offboardTeacher.first_name} ${offboardTeacher.father_name} marked as ${offboardStatus === 'on_leave' ? 'on leave' : 'terminated'}${offboardDisableLogin ? ' and portal login disabled' : ''}.`,
        type: 'success'
      });
      setOffboardTeacher(null);
      await loadTeachers(teacherPage);
      if (teacherProfileOpen) await refreshTeacherProfile();
      void loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Could not update employment status: ' + err.message, type: 'error' });
    }
  };

  const handleReactivateTeacher = async (teacher: any) => {
    try {
      await api.updateAdminStaff(Number(teacher.id), { status: 'active', endDate: '' });
      setActionMessage({ text: `${teacher.first_name} ${teacher.father_name} reactivated.`, type: 'success' });
      await loadTeachers(teacherPage);
      if (teacherProfileOpen) await refreshTeacherProfile();
      void loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Could not reactivate teacher: ' + err.message, type: 'error' });
    }
  };

  const handleToggleTeacherLogin = (teacher: any) => {
    const enable = teacher.user_account_status !== 'active';
    openConfirmDialog({
      title: `${enable ? 'Enable' : 'Disable'} portal login for ${teacher.first_name} ${teacher.father_name}`,
      message: enable
        ? `The teacher will be able to sign in to the teacher portal again with @${teacher.linked_username}.`
        : `The teacher will be signed out and blocked from the teacher portal. Their staff record and assignments are preserved.`,
      confirmLabel: enable ? 'Enable login' : 'Disable login',
      tone: enable ? 'default' : 'danger',
      onConfirm: async () => {
        await api.updateAdminUserStatus(Number(teacher.user_id), enable ? 'active' : 'disabled');
        setActionMessage({ text: `Portal login ${enable ? 'enabled' : 'disabled'} for @${teacher.linked_username}.`, type: 'success' });
        await loadTeachers(teacherPage);
        if (teacherProfileOpen) await refreshTeacherProfile();
      }
    });
  };

  const handleRevokeTeacherSessions = (teacher: any) => {
    if (!teacher.user_id) return;
    openConfirmDialog({
      title: `Revoke sessions for ${teacher.first_name} ${teacher.father_name}`,
      message: 'All active browser and device sessions for this teacher will be immediately invalidated. They will need to sign in again.',
      confirmLabel: 'Revoke sessions',
      tone: 'danger',
      onConfirm: async () => {
        const res = await api.revokeUserSessions(Number(teacher.user_id));
        setActionMessage({ text: `Revoked ${res.revokedCount} session(s) for @${teacher.linked_username}.`, type: 'success' });
      }
    });
  };

  const handleResetTeacherPassword = async () => {
    if (!teacherResetTarget) return;
    const policyError = validatePasswordStrength(teacherResetPassword);
    if (policyError) {
      setActionMessage({ text: policyError, type: 'error' });
      return;
    }
    try {
      await api.resetAdminUserPassword(Number(teacherResetTarget.user_id), teacherResetPassword);
      setActionMessage({ text: `Password reset for @${teacherResetTarget.linked_username}.`, type: 'success' });
      setTeacherResetTarget(null);
      setTeacherResetPassword('');
    } catch (err: any) {
      setActionMessage({ text: 'Password reset failed: ' + err.message, type: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // QUALIFICATIONS & DOCUMENTS (teacher management)
  // ---------------------------------------------------------------------------
  const loadQualifications = async (staffId: number) => {
    setQualificationsLoading(true);
    try {
      const [list, history] = await Promise.all([
        api.getStaffQualifications(staffId),
        api.getQualificationHistory(staffId).catch(() => [])
      ]);
      setQualifications(list || []);
      setQualificationHistory(history || []);
    } catch (err: any) {
      setActionMessage({ text: 'Could not load qualifications: ' + err.message, type: 'error' });
    } finally {
      setQualificationsLoading(false);
    }
  };

  const openNewQualification = () => {
    setEditingQualificationId(null);
    setQualificationForm({
      qualificationLevel: 'bachelors',
      title: '',
      institution: '',
      fieldOfStudy: '',
      awardDate: '',
      gradeOrClass: '',
      registrationNo: '',
      notes: ''
    });
    setQualificationError('');
    setQualificationModalOpen(true);
  };

  const openEditQualification = (qualification: any) => {
    setEditingQualificationId(Number(qualification.id));
    setQualificationForm({
      qualificationLevel: qualification.qualification_level || 'bachelors',
      title: qualification.title || '',
      institution: qualification.institution || '',
      fieldOfStudy: qualification.field_of_study || '',
      awardDate: qualification.award_date ? String(qualification.award_date).slice(0, 10) : '',
      gradeOrClass: qualification.grade_or_class || '',
      registrationNo: qualification.registration_no || '',
      notes: qualification.notes || ''
    });
    setQualificationError('');
    setQualificationModalOpen(true);
  };

  const handleSaveQualification = async (e: FormEvent) => {
    e.preventDefault();
    const staffId = teacherProfile?.staff?.id;
    if (!staffId) return;
    if (!qualificationForm.title.trim() || !qualificationForm.institution.trim()) {
      setQualificationError('Qualification title and institution are required.');
      return;
    }
    setQualificationSaving(true);
    setQualificationError('');
    try {
      const payload = {
        qualificationLevel: qualificationForm.qualificationLevel,
        title: qualificationForm.title.trim(),
        institution: qualificationForm.institution.trim(),
        fieldOfStudy: qualificationForm.fieldOfStudy.trim() || undefined,
        awardDate: qualificationForm.awardDate || undefined,
        gradeOrClass: qualificationForm.gradeOrClass.trim() || undefined,
        registrationNo: qualificationForm.registrationNo.trim() || undefined,
        notes: qualificationForm.notes.trim() || undefined
      };
      if (editingQualificationId) {
        await api.updateStaffQualification(Number(staffId), editingQualificationId, payload);
        setActionMessage({ text: 'Qualification updated.', type: 'success' });
      } else {
        await api.createStaffQualification(Number(staffId), payload);
        setActionMessage({ text: 'Qualification recorded.', type: 'success' });
      }
      setQualificationModalOpen(false);
      await loadQualifications(Number(staffId));
    } catch (err: any) {
      setQualificationError(err.message || 'Could not save the qualification.');
    } finally {
      setQualificationSaving(false);
    }
  };

  const handleDeleteQualification = (qualification: any) => {
    const staffId = teacherProfile?.staff?.id;
    if (!staffId) return;
    openConfirmDialog({
      title: 'Remove Qualification',
      message: `Remove "${qualification.title}" (${qualification.institution}) from this teacher's record? The attached document and audit history are preserved.`,
      confirmLabel: 'Remove qualification',
      tone: 'danger',
      onConfirm: async () => {
        await api.deleteStaffQualification(Number(staffId), Number(qualification.id));
        setActionMessage({ text: 'Qualification removed.', type: 'success' });
        await loadQualifications(Number(staffId));
      }
    });
  };

  const handleQualificationDocumentFile = (file: File | null) => {
    if (!file) { setQualificationDocument(null); return; }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      setActionMessage({ text: 'Upload a PDF, JPEG, or PNG document.', type: 'error' });
      setQualificationDocument(null);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setActionMessage({ text: 'The document must be no larger than 10 MB.', type: 'error' });
      setQualificationDocument(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setQualificationDocument({
      originalName: file.name,
      mimeType: file.type,
      dataBase64: String(reader.result)
    });
    reader.readAsDataURL(file);
  };

  const handleUploadQualificationDocument = async (e: FormEvent) => {
    e.preventDefault();
    const staffId = teacherProfile?.staff?.id;
    if (!staffId || !qualificationDocumentTarget || !qualificationDocument) {
      setActionMessage({ text: 'Choose a PDF, JPEG, or PNG file to upload.', type: 'error' });
      return;
    }
    setQualificationDocumentUploading(true);
    try {
      await api.uploadQualificationDocument(Number(staffId), Number(qualificationDocumentTarget.id), qualificationDocument);
      setActionMessage({ text: 'Document uploaded and queued for verification.', type: 'success' });
      setQualificationDocumentTarget(null);
      setQualificationDocument(null);
      await loadQualifications(Number(staffId));
    } catch (err: any) {
      setActionMessage({ text: 'Upload failed: ' + err.message, type: 'error' });
    } finally {
      setQualificationDocumentUploading(false);
    }
  };

  const handleVerifyQualificationDocument = async (status: 'verified' | 'rejected') => {
    const staffId = teacherProfile?.staff?.id;
    if (!staffId || !qualificationVerifyTarget) return;
    if (status === 'rejected' && !qualificationVerifyNote.trim()) {
      setActionMessage({ text: 'Provide a reason when rejecting a document.', type: 'error' });
      return;
    }
    try {
      await api.verifyQualificationDocument(Number(staffId), Number(qualificationVerifyTarget.document_link_id), {
        status,
        note: qualificationVerifyNote.trim() || undefined
      });
      setActionMessage({ text: `Document marked as ${status}.`, type: 'success' });
      setQualificationVerifyTarget(null);
      setQualificationVerifyNote('');
      await loadQualifications(Number(staffId));
    } catch (err: any) {
      setActionMessage({ text: 'Verification failed: ' + err.message, type: 'error' });
    }
  };

  const loadAssignmentTeachers = async () => {
    setLoadingAssignmentTeachers(true);
    try {
      // Keep these options independent of the staff directory's current filters.
      const teachers = await api.getAdminStaff(undefined, 'teacher', 'active');
      setAssignmentTeachers(Array.isArray(teachers) ? teachers : []);
    } catch (err: any) {
      setAssignmentTeachers([]);
      setActionMessage({ text: 'Unable to load active teachers for assignments: ' + err.message, type: 'error' });
    } finally {
      setLoadingAssignmentTeachers(false);
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
      return true;
    } catch (err: any) {
      setActionMessage({ text: 'Error loading system settings: ' + err.message, type: 'error' });
      return false;
    }
  };

  const loadBackups = async () => {
    setBackupsLoading(true);
    try {
      const res = await api.getBackups();
      setBackupsList(res || []);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading backups: ' + err.message, type: 'error' });
    } finally {
      setBackupsLoading(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      await api.createBackup({ type: backupType, notes: backupNotes });
      setActionMessage({ text: 'Backup generated successfully.', type: 'success' });
      setBackupNotes('');
      loadBackups();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to create backup: ' + err.message, type: 'error' });
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleVerifyChecksum = async (id: number) => {
    try {
      const res = await api.verifyBackupChecksum(id);
      if (res.valid) {
        setActionMessage({ text: `Backup #${id} verified intact (Checksum: ${res.calculatedChecksum.slice(0, 16)}...)`, type: 'success' });
      } else {
        setActionMessage({ text: `WARNING: Backup #${id} checksum mismatch! Stored: ${res.storedChecksum}, Calculated: ${res.calculatedChecksum}`, type: 'error' });
      }
      loadBackups();
    } catch (err: any) {
      setActionMessage({ text: 'Verification failed: ' + err.message, type: 'error' });
    }
  };

  const handleRestoreBackupSubmit = async () => {
    if (!restoreModalBackup) return;
    if (restoreConfirmWord !== 'RESTORE') {
      setActionMessage({ text: 'You must type "RESTORE" exactly to confirm.', type: 'error' });
      return;
    }
    setRestoringBackup(true);
    try {
      const res = await api.restoreBackup(restoreModalBackup.id, {
        confirmationWord: restoreConfirmWord,
        adminPassword: restorePassword
      });
      setActionMessage({ text: res.message || 'Database restored successfully.', type: 'success' });
      setRestoreModalBackup(null);
      setRestoreConfirmWord('');
      setRestorePassword('');
      loadOverviewData();
      loadBackups();
    } catch (err: any) {
      setActionMessage({ text: 'Restore failed: ' + err.message, type: 'error' });
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleDeleteBackup = (id: number) => {
    openConfirmDialog({
      title: `Delete Backup #${id}`,
      message: `Are you sure you want to permanently delete backup #${id}? This action cannot be undone.`,
      confirmLabel: 'Delete backup',
      tone: 'danger',
      onConfirm: async () => {
        await api.deleteBackup(id);
        setActionMessage({ text: `Backup #${id} deleted successfully.`, type: 'success' });
        loadBackups();
      }
    });
  };

  const loadRecycleBin = async (entityType = recycleBinEntityType, page = recycleBinPage) => {
    setRecycleBinLoading(true);
    try {
      const res = await api.getRecycleBin({
        entityType: entityType || undefined,
        page,
        limit: 25
      });
      setRecycleBinItems(res?.items || []);
      setRecycleBinTotal(res?.total || 0);
      setRecycleBinPage(page);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading recycle bin: ' + err.message, type: 'error' });
    } finally {
      setRecycleBinLoading(false);
    }
  };

  const handleRestoreRecycleItem = async (entityType: string, id: number) => {
    try {
      const res = await api.restoreRecycleBinItem(entityType, id);
      setActionMessage({ text: res.message || 'Item restored successfully.', type: 'success' });
      loadRecycleBin();
    } catch (err: any) {
      setActionMessage({ text: 'Restore failed: ' + err.message, type: 'error' });
    }
  };

  const handlePurgeRecycleItem = async () => {
    if (!purgeConfirmItem) return;
    setPurgingItem(true);
    try {
      const res = await api.purgeRecycleBinItem(purgeConfirmItem.entityType, purgeConfirmItem.id, purgePassword);
      setActionMessage({ text: res.message || 'Record permanently purged.', type: 'success' });
      setPurgeConfirmItem(null);
      setPurgePassword('');
      loadRecycleBin();
    } catch (err: any) {
      setActionMessage({ text: 'Purge failed: ' + err.message, type: 'error' });
    } finally {
      setPurgingItem(false);
    }
  };

  const handlePurgeAllExpired = () => {
    openConfirmDialog({
      title: 'Purge All Expired Items',
      message: 'This permanently removes every soft-deleted record whose retention window has elapsed. Provide your administrator password to continue.',
      confirmLabel: 'Purge expired items',
      tone: 'danger',
      requirePassword: true,
      onConfirm: async (password?: string) => {
        const res = await api.purgeAllExpiredRecycleBin(password);
        setActionMessage({ text: `Purged ${res.purgedCount} expired items permanently.`, type: 'success' });
        loadRecycleBin();
      }
    });
  };

  // Notification center (bell) — real persisted notifications + live alerts & approvals.
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  // Close the notification dropdown when clicking anywhere outside it.
  useEffect(() => {
    if (!notificationsOpen) return;
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-admin-notifications]')) setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, [notificationsOpen]);

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    try {
      const res = await api.getNotifications();
      setNotificationsList(res || []);
    } catch {
      // Non-critical: keep any previously loaded notifications.
    } finally {
      setNotificationsLoading(false);
    }
  };

  const handleMarkNotificationRead = async (notification: any) => {
    if (notification.read_at) return;
    try {
      await api.markNotificationRead(notification.id);
      setNotificationsList((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Could not mark the notification as read.', type: 'error' });
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotificationsList((current) => current.map((item) => item.read_at ? item : { ...item, read_at: now }));
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Could not mark notifications as read.', type: 'error' });
    }
  };

  // Generic, styleable confirmation dialog used to replace native window.confirm / prompt.
  const openConfirmDialog = (options: {
    title: string;
    message: string;
    confirmLabel?: string;
    tone?: 'danger' | 'default';
    requirePassword?: boolean;
    requireReason?: boolean;
    reasonLabel?: string;
    onConfirm: (password?: string, reason?: string) => Promise<void>;
  }) => {
    setDialogState({
      title: options.title,
      message: options.message,
      confirmLabel: options.confirmLabel || 'Confirm',
      tone: options.tone || 'default',
      requirePassword: options.requirePassword || false,
      requireReason: options.requireReason || false,
      reasonLabel: options.reasonLabel || 'Reason',
      onConfirm: options.onConfirm
    });
    setDialogPassword('');
    setDialogReason('');
  };

  const handleDialogConfirm = async () => {
    if (!dialogState) return;
    if (dialogState.requirePassword && !dialogPassword.trim()) {
      setActionMessage({ text: 'Enter your administrator password to continue.', type: 'error' });
      return;
    }
    if (dialogState.requireReason && !dialogReason.trim()) {
      setActionMessage({ text: 'A reason is required to continue.', type: 'error' });
      return;
    }
    setDialogWorking(true);
    try {
      await dialogState.onConfirm(dialogPassword || undefined, dialogReason || undefined);
      setDialogState(null);
      setDialogPassword('');
      setDialogReason('');
    } catch (err: any) {
      setActionMessage({ text: err.message || 'The action could not be completed.', type: 'error' });
    } finally {
      setDialogWorking(false);
    }
  };

  const loadDiagnostics = async () => {
    setDiagnosticsLoading(true);
    try {
      const res = await api.getSystemDiagnostics();
      setDiagnosticsData(res);
    } catch (err: any) {
      setActionMessage({ text: 'Error running diagnostics: ' + err.message, type: 'error' });
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const loadApprovalsSummary = async () => {
    try {
      const res = await api.getApprovalsSummary();
      if (res) {
        setApprovalsSummary(res);
      }
    } catch (err: any) {
      console.error('Failed to load approvals summary:', err);
    }
  };

  const loadApprovals = async (page = approvalsPage, status = approvalsStatusFilter, type = approvalsTypeFilter) => {
    setApprovalsLoading(true);
    try {
      const res = await api.getApprovals({
        page,
        limit: 20,
        status: status === 'all' ? undefined : status,
        type: type === 'all' ? undefined : type
      });
      if (res) {
        setApprovalsList(res.items || []);
        setApprovalsTotal(res.total || 0);
        setApprovalsPage(page);
      }
      loadApprovalsSummary();
    } catch (err: any) {
      setActionMessage({ text: 'Error loading approvals: ' + err.message, type: 'error' });
    } finally {
      setApprovalsLoading(false);
    }
  };

  const handleDecideApproval = async () => {
    if (!decisionModalItem) return;
    setDecidingApproval(true);
    try {
      const res = await api.decideApproval(decisionModalItem.id, {
        action: decisionAction,
        decisionNote: decisionNote.trim() || undefined
      });
      if (res && res.success) {
        setActionMessage({ text: res.message || `Request ${decisionAction}d successfully.`, type: 'success' });
        setDecisionModalItem(null);
        setDecisionNote('');
        loadApprovals(approvalsPage, approvalsStatusFilter, approvalsTypeFilter);
        loadApprovalsSummary();
      }
    } catch (err: any) {
      setActionMessage({ text: err.message || `Failed to ${decisionAction} request.`, type: 'error' });
    } finally {
      setDecidingApproval(false);
    }
  };

  // =========================================================================
  // PACKAGE 1: FINANCE & FEES HANDLERS
  // =========================================================================
  const loadFinanceOverview = async () => {
    try {
      const data = await api.getFinanceOverview();
      setFinanceOverview(data);
    } catch (err: any) {
      console.error('Failed to load finance overview:', err);
    }
  };

  const loadFeeCategories = async () => {
    try {
      const cats = await api.getFeeCategories();
      setFeeCategoriesList(cats || []);
      const firstCategoryId = Number(cats?.[0]?.id) || 0;
      if (firstCategoryId) {
        setNewFeeStructCatId((current) => current || firstCategoryId);
        setNewInvItems((items) => items.map((item) => item.fee_category_id ? item : { ...item, fee_category_id: firstCategoryId }));
      }
    } catch (err: any) {
      console.error('Failed to load fee categories:', err);
    }
  };

  const loadFeeStructures = async (yearId?: number) => {
    try {
      const structs = await api.getFeeStructures(yearId);
      setFeeStructuresList(structs || []);
    } catch (err: any) {
      console.error('Failed to load fee structures:', err);
    }
  };

  const loadInvoices = async (page = invoicesPage, status = invoicesStatusFilter, search = invoicesSearch) => {
    try {
      const res = await api.getInvoices({
        page,
        limit: 20,
        status: status === 'all' ? undefined : status,
        search: search.trim() || undefined
      });
      if (res) {
        setInvoicesList(res.items || []);
        setInvoicesTotal(res.total || 0);
        setInvoicesPage(page);
      }
    } catch (err: any) {
      console.error('Failed to load invoices:', err);
    }
  };

  const loadPayments = async (page = paymentsPage, method = paymentsMethodFilter, search = paymentsSearch) => {
    try {
      const res = await api.getPayments({
        page,
        limit: 20,
        method: method === 'all' ? undefined : method,
        search: search.trim() || undefined
      });
      if (res) {
        setPaymentsList(res.items || []);
        setPaymentsTotal(res.total || 0);
        setPaymentsPage(page);
      }
    } catch (err: any) {
      console.error('Failed to load payments:', err);
    }
  };

  const loadScholarships = async () => {
    try {
      const list = await api.getScholarships();
      setScholarshipsList(list || []);
    } catch (err: any) {
      console.error('Failed to load scholarships:', err);
    }
  };

  const loadInvoiceStudentOptions = async (search = invoiceStudentSearch) => {
    try {
      const result = await api.getAdminStudents({ search: search.trim() || undefined, status: 'active', limit: 100, offset: 0 });
      setInvoiceStudentOptions(result.items || []);
    } catch (err: any) {
      setActionMessage({ text: 'Unable to load active students for finance tasks: ' + err.message, type: 'error' });
    }
  };

  const loadFinanceData = async () => {
    setFinanceLoading(true);
    try {
      await Promise.all([
        loadFinanceOverview(),
        loadFeeCategories(),
        loadFeeStructures(),
        loadInvoices(),
        loadPayments(),
        loadScholarships(),
        loadInvoiceStudentOptions('')
      ]);
    } finally {
      setFinanceLoading(false);
    }
  };

  const handleCreateInvoice = async (e: FormEvent) => {
    e.preventDefault();
    if (!newInvStudentId) {
      setActionMessage({ text: 'Please select a student for the invoice.', type: 'error' });
      return;
    }
    const activeYearId = academicStructure?.academicYears?.find((year: any) => year.is_current || year.status === 'active')?.id
      || dashData?.academic?.academicYear?.id;
    if (!activeYearId) {
      setActionMessage({ text: 'Set an active academic year before creating student invoices.', type: 'error' });
      return;
    }
    if (!newInvItems.length || newInvItems.some((item) => !item.fee_category_id || !item.description.trim() || item.unit_amount <= 0 || item.quantity <= 0)) {
      setActionMessage({ text: 'Every invoice line needs a fee category, description, quantity, and positive amount.', type: 'error' });
      return;
    }
    setSubmittingFinance(true);
    try {
      const res = await api.createInvoice({
        student_id: Number(newInvStudentId),
        academic_year_id: Number(activeYearId),
        due_date: newInvDueDate || getLocalDateInputValue(),
        notes: newInvNotes || undefined,
        items: newInvItems.map((item) => ({
          fee_category_id: Number(item.fee_category_id),
          description: item.description,
          quantity: Number(item.quantity) || 1,
          unit_amount: Number(item.unit_amount) || 0
        }))
      });
      setActionMessage({ text: res.message || 'Invoice generated successfully.', type: 'success' });
      setNewInvoiceModalOpen(false);
      setNewInvStudentId('');
      setNewInvNotes('');
      loadInvoices();
      loadFinanceOverview();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to create invoice: ' + err.message, type: 'error' });
    } finally {
      setSubmittingFinance(false);
    }
  };

  const openNewInvoiceModal = () => {
    setNewInvStudentId('');
    setInvoiceStudentSearch('');
    setNewInvDueDate('');
    setNewInvNotes('');
    setNewInvItems([{ fee_category_id: Number(feeCategoriesList[0]?.id) || 0, description: '', quantity: 1, unit_amount: 0 }]);
    setNewInvoiceModalOpen(true);
    void loadInvoiceStudentOptions('');
  };

  const handleRecordPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!recPayStudentId || !recPayAmount || Number(recPayAmount) <= 0) {
      setActionMessage({ text: 'Valid student and payment amount are required.', type: 'error' });
      return;
    }
    setSubmittingFinance(true);
    try {
      const res = await api.recordPayment({
        student_id: Number(recPayStudentId),
        invoice_id: recPayInvoiceId ? Number(recPayInvoiceId) : null,
        amount: Number(recPayAmount),
        method: recPayMethod,
        reference: recPayReference || undefined,
        payer_name: recPayPayerName || undefined,
        notes: recPayNotes || undefined
      });
      setActionMessage({ text: res.message || 'Payment recorded successfully.', type: 'success' });
      setRecordPaymentModalOpen(false);
      setRecPayAmount('');
      setRecPayReference('');
      setRecPayPayerName('');
      setRecPayNotes('');
      loadPayments();
      loadInvoices();
      loadFinanceOverview();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to record payment: ' + err.message, type: 'error' });
    } finally {
      setSubmittingFinance(false);
    }
  };

  const handleCreateFeeStructure = async (e: FormEvent) => {
    e.preventDefault();
    const yearId = newFeeStructYearId || academicStructure?.academicYears?.find((year: any) => year.is_current || year.status === 'active')?.id || dashData?.academic?.academicYear?.id;
    if (!yearId || !newFeeStructCatId || !newFeeStructAmount || Number(newFeeStructAmount) <= 0) {
      setActionMessage({ text: 'Select an academic year and fee category, then enter a positive fee amount.', type: 'error' });
      return;
    }
    setSubmittingFinance(true);
    try {
      const res = await api.createFeeStructure({
        academic_year_id: Number(yearId),
        grade_id: newFeeStructGradeId ? Number(newFeeStructGradeId) : null,
        fee_category_id: Number(newFeeStructCatId),
        amount: Number(newFeeStructAmount),
        due_date: newFeeStructDueDate || undefined
      });
      setActionMessage({ text: res.message || 'Fee structure created successfully.', type: 'success' });
      setNewFeeStructModalOpen(false);
      loadFeeStructures();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to create fee structure: ' + err.message, type: 'error' });
    } finally {
      setSubmittingFinance(false);
    }
  };

  const handleCreateFeeCategory = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createFeeCategory({ code: newFeeCategoryCode.trim(), name: newFeeCategoryName.trim(), isRecurring: newFeeCategoryRecurring });
      setNewFeeCategoryModalOpen(false);
      setNewFeeCategoryCode('');
      setNewFeeCategoryName('');
      setNewFeeCategoryRecurring(false);
      await loadFeeCategories();
      setActionMessage({ text: 'Fee category created.', type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: 'Fee category could not be created: ' + err.message, type: 'error' });
    }
  };

  const handleCreateWaiver = async (e: FormEvent) => {
    e.preventDefault();
    if (!newWaiverStudentId || !newWaiverValue || Number(newWaiverValue) <= 0) {
      setActionMessage({ text: 'Please select student and specify waiver value.', type: 'error' });
      return;
    }
    setSubmittingFinance(true);
    try {
      const res = await api.createScholarship({
        student_id: Number(newWaiverStudentId),
        fee_category_id: newWaiverCatId ? Number(newWaiverCatId) : null,
        award_type: newWaiverType,
        value: Number(newWaiverValue),
        reason: newWaiverReason || 'Scholarship discount'
      });
      setActionMessage({ text: res.message || 'Fee waiver awarded.', type: 'success' });
      setNewWaiverModalOpen(false);
      setNewWaiverReason('');
      loadScholarships();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to grant waiver: ' + err.message, type: 'error' });
    } finally {
      setSubmittingFinance(false);
    }
  };

  const handleVoidInvoice = (invoiceId: number) => {
    openConfirmDialog({
      title: 'Void Invoice',
      message: `Voiding invoice #${invoiceId} cancels its outstanding balance and is recorded in the audit log. Provide a reason to continue.`,
      confirmLabel: 'Void invoice',
      tone: 'danger',
      requireReason: true,
      reasonLabel: 'Reason for voiding this invoice',
      onConfirm: async (_password?: string, reason?: string) => {
        const res = await api.voidInvoice(invoiceId, reason || 'Voided by administrator');
        setActionMessage({ text: res.message || 'Invoice voided.', type: 'success' });
        loadInvoices();
        loadFinanceOverview();
      }
    });
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
      const [res, preferences] = await Promise.all([api.getAdminProfile(), api.getAdminNotificationPreferences()]);
      setAdminProfile(res);
      if (res?.phone) setProfilePhone(res.phone);
      if (res?.email) setProfileEmail(res.email);
      setNotifSecurityAlerts(preferences.securityAlerts);
      setNotifGuardianBroadcasts(preferences.guardianBroadcasts);
      setNotifAttendanceDigest(preferences.attendanceDigest);
      setNotifSystemErrors(preferences.systemErrors);
    } catch (err: any) {
      setActionMessage({ text: 'Error loading profile: ' + err.message, type: 'error' });
    }
  };

  const handleSaveNotificationPreferences = async () => {
    try {
      await api.saveAdminNotificationPreferences({
        securityAlerts: notifSecurityAlerts,
        guardianBroadcasts: notifGuardianBroadcasts,
        attendanceDigest: notifAttendanceDigest,
        systemErrors: notifSystemErrors
      });
      setActionMessage({ text: 'Notification preferences saved to your administrator account.', type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: 'Could not save notification preferences: ' + err.message, type: 'error' });
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

  const exportInvoices = async () => {
    try {
      const first = await api.getInvoices({
        status: invoicesStatusFilter !== 'all' ? invoicesStatusFilter : undefined,
        search: invoicesSearch || undefined,
        limit: 100,
        page: 1
      });
      const all = [...(first.items || [])];
      for (let page = 2; page <= (first.totalPages || 1); page++) {
        const next = await api.getInvoices({
          status: invoicesStatusFilter !== 'all' ? invoicesStatusFilter : undefined,
          search: invoicesSearch || undefined,
          limit: 100,
          page
        });
        all.push(...(next.items || []));
      }
      exportToCSV('Finance_Invoices_Export',
        ['Invoice No', 'Student', 'Admission No', 'Issue Date', 'Due Date', 'Total', 'Paid', 'Balance', 'Status'],
        all.map((i) => [
          i.invoice_no,
          `${i.first_name || ''} ${i.father_name || ''}`.trim(),
          i.admission_no,
          i.issue_date ? String(i.issue_date).slice(0, 10) : '',
          i.due_date ? String(i.due_date).slice(0, 10) : '',
          i.total_amount,
          i.paid_amount,
          i.balance,
          i.status
        ])
      );
      setActionMessage({ text: `Exported ${all.length} invoice record(s).`, type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: 'Invoice export failed: ' + err.message, type: 'error' });
    }
  };

  const exportPayments = async () => {
    try {
      const first = await api.getPayments({
        method: paymentsMethodFilter !== 'all' ? paymentsMethodFilter : undefined,
        search: paymentsSearch || undefined,
        limit: 100,
        page: 1
      });
      const all = [...(first.items || [])];
      for (let page = 2; page <= (first.totalPages || 1); page++) {
        const next = await api.getPayments({
          method: paymentsMethodFilter !== 'all' ? paymentsMethodFilter : undefined,
          search: paymentsSearch || undefined,
          limit: 100,
          page
        });
        all.push(...(next.items || []));
      }
      exportToCSV('Finance_Payments_Export',
        ['Receipt No', 'Student', 'Admission No', 'Amount', 'Method', 'Reference', 'Payer', 'Paid At'],
        all.map((p) => [
          p.receipt_no,
          `${p.first_name || ''} ${p.father_name || ''}`.trim(),
          p.admission_no,
          p.amount,
          p.method,
          p.reference || '',
          p.payer_name || '',
          p.paid_at ? new Date(p.paid_at).toISOString() : ''
        ])
      );
      setActionMessage({ text: `Exported ${all.length} payment record(s).`, type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: 'Payment export failed: ' + err.message, type: 'error' });
    }
  };

  const exportStaff = () => {
    exportToCSV('Staff_Directory_Export',
      ['Employee No', 'Full Name', 'Staff Type', 'Job Title', 'Department', 'Phone', 'Email', 'Status'],
      (staffList || []).map((s) => [
        s.employee_no,
        `${s.first_name || ''} ${s.father_name || ''}`.trim(),
        s.staff_type,
        s.job_title,
        s.department,
        s.phone || '',
        s.email || '',
        s.status
      ])
    );
    setActionMessage({ text: `Exported ${(staffList || []).length} staff record(s).`, type: 'success' });
  };

  const exportAuditLogs = () => {
    exportToCSV('Audit_Logs_Export',
      ['Timestamp', 'Actor', 'Action', 'Outcome', 'IP Address'],
      (auditLogsList || []).map((log) => [
        log.created_at ? new Date(log.created_at).toISOString() : '',
        log.actor || log.username || '',
        log.action,
        log.outcome,
        log.ip_address || ''
      ])
    );
    setActionMessage({ text: `Exported ${(auditLogsList || []).length} audit record(s).`, type: 'success' });
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
  const handleStaffPhotoFile = (file: File | null) => {
    if (!file) { setStaffPhoto(null); return; }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setActionMessage({ text: 'Choose a JPEG or PNG photo.', type: 'error' });
      setStaffPhoto(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setActionMessage({ text: 'Staff photo must be no larger than 5 MB.', type: 'error' });
      setStaffPhoto(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setStaffPhoto({
      originalName: file.name,
      mimeType: file.type,
      dataBase64: String(reader.result)
    });
    reader.readAsDataURL(file);
  };

  const handleRegisterStaff = async (e: FormEvent) => {
    e.preventDefault();
    if (!staffEmpNo.trim() || !staffFirstName.trim() || !staffFatherName.trim() || !staffJobTitle.trim()) {
      setActionMessage({ text: 'Employee number, full name, and job title are required.', type: 'error' });
      return;
    }
    if (staffCreateAccount) {
      if (!staffUsername.trim()) {
        setActionMessage({ text: 'Enter a username for the new staff portal account.', type: 'error' });
        return;
      }
      const passwordError = validatePasswordStrength(staffPassword);
      if (passwordError) {
        setActionMessage({ text: passwordError, type: 'error' });
        return;
      }
    }
    if (includeStaffQualification) {
      if (!newStaffQualification.title.trim() || !newStaffQualification.institution.trim()) {
        setActionMessage({ text: 'Qualification title and awarding institution are required when recording a qualification.', type: 'error' });
        return;
      }
    }
    // Catch duplicate employee numbers before the request is sent.
    if (staffList.some((m: any) => String(m.employee_no).toLowerCase() === staffEmpNo.trim().toLowerCase())
      || teacherList.some((m: any) => String(m.employee_no).toLowerCase() === staffEmpNo.trim().toLowerCase())) {
      setActionMessage({ text: `Employee number '${staffEmpNo.trim()}' is already in use. Choose a different one.`, type: 'error' });
      return;
    }
    try {
      const createdStaff = await api.createAdminStaff({
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
        roleCode: staffCreateAccount ? staffAccountRole : undefined,
        photo: staffPhoto || undefined
      });

      if (includeStaffQualification && newStaffQualification.title.trim() && newStaffQualification.institution.trim()) {
        const staffIdToUse = createdStaff?.id;
        if (staffIdToUse) {
          try {
            await api.createStaffQualification(Number(staffIdToUse), {
              qualificationLevel: newStaffQualification.qualificationLevel,
              title: newStaffQualification.title.trim(),
              institution: newStaffQualification.institution.trim(),
              fieldOfStudy: newStaffQualification.fieldOfStudy.trim() || undefined,
              awardDate: newStaffQualification.awardDate || undefined,
              gradeOrClass: newStaffQualification.gradeOrClass.trim() || undefined,
              registrationNo: newStaffQualification.registrationNo.trim() || undefined,
              notes: newStaffQualification.notes.trim() || undefined
            });
          } catch (qErr: any) {
            console.error('Failed to attach qualification to new staff:', qErr);
          }
        }
      }

      const createdTeacher = staffType === 'teacher';
      setActionMessage({ text: `${createdTeacher ? 'Teacher' : 'Staff member'} '${staffFirstName} ${staffFatherName}' created successfully!`, type: 'success' });
      setStaffEmpNo('');
      setStaffFirstName('');
      setStaffFatherName('');
      setStaffUsername('');
      setStaffPhoto(null);
      setIncludeStaffQualification(false);
      setNewStaffQualification({
        qualificationLevel: 'bachelors',
        title: '',
        institution: '',
        fieldOfStudy: '',
        awardDate: '',
        gradeOrClass: '',
        registrationNo: '',
        notes: ''
      });
      if (createdTeacher) {
        setTeacherTab('directory');
        loadTeachers();
      } else {
        setStaffTab('staff_list');
        loadStaff();
      }
      loadUsers();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Staff creation failed: ' + err.message, type: 'error' });
    }
  };

  const openStaffEdit = (staff: any) => {
    setStaffEditRecord(staff);
    setStaffEditForm({
      employeeNo: staff.employee_no || '',
      firstName: staff.first_name || '',
      fatherName: staff.father_name || '',
      grandfatherName: staff.grandfather_name || '',
      gender: staff.gender || 'female',
      dateOfBirth: staff.date_of_birth ? String(staff.date_of_birth).slice(0, 10) : '',
      phone: staff.phone || '',
      email: staff.email || '',
      address: staff.address || '',
      jobTitle: staff.job_title || '',
      department: staff.department || '',
      staffType: staff.staff_type || 'teacher',
      hireDate: staff.hire_date ? String(staff.hire_date).slice(0, 10) : '',
      endDate: staff.end_date ? String(staff.end_date).slice(0, 10) : '',
      status: staff.status || 'active'
    });
  };

  const handleSaveStaffEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!staffEditRecord) return;
    setStaffEditSaving(true);
    try {
      await api.updateAdminStaff(staffEditRecord.id, {
        employeeNo: staffEditForm.employeeNo.trim(),
        firstName: staffEditForm.firstName.trim(),
        fatherName: staffEditForm.fatherName.trim(),
        grandfatherName: staffEditForm.grandfatherName.trim(),
        gender: staffEditForm.gender,
        dateOfBirth: staffEditForm.dateOfBirth,
        phone: staffEditForm.phone.trim(),
        email: staffEditForm.email.trim(),
        address: staffEditForm.address.trim(),
        jobTitle: staffEditForm.jobTitle.trim(),
        department: staffEditForm.department.trim(),
        staffType: staffEditForm.staffType,
        hireDate: staffEditForm.hireDate,
        endDate: staffEditForm.endDate,
        status: staffEditForm.status
      });
      setActionMessage({ text: staffEditForm.status === 'terminated'
        ? `Staff record for ${staffEditRecord.first_name} ${staffEditRecord.father_name} was updated and any linked login was disabled.`
        : `Staff record for ${staffEditRecord.first_name} ${staffEditRecord.father_name} was updated.`, type: 'success' });
      setStaffEditRecord(null);
      await loadStaff();
    } catch (err: any) {
      setActionMessage({ text: 'Staff update failed: ' + err.message, type: 'error' });
    } finally {
      setStaffEditSaving(false);
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
    if (!resetPassModalUser) {
      return;
    }
    const policyError = validatePasswordStrength(resetNewPass);
    if (policyError) {
      setActionMessage({ text: policyError, type: 'error' });
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

  // -------------------------------------------------------------------------
  // PACKAGE 6: SECURITY ADMINISTRATION HANDLERS
  // -------------------------------------------------------------------------
  const loadSecuritySessions = async () => {
    setSessionsLoading(true);
    try {
      const data = await api.getSecuritySessions();
      setSecuritySessions(data || []);
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to load security sessions.', type: 'error' });
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: number) => {
    try {
      await api.revokeSession(sessionId);
      setActionMessage({ text: 'Session terminated successfully.', type: 'success' });
      await loadSecuritySessions();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to revoke session.', type: 'error' });
    }
  };

  const handleRevokeAllUserSessions = async (userId: number, username: string) => {
    triggerPasswordProtectedAction(
      `Terminate All Active Sessions for @${username}`,
      `This will immediately invalidate all active login tokens for @${username} across all web browsers and devices.`,
      async () => {
        const res = await api.revokeUserSessions(userId);
        setActionMessage({ text: `Revoked ${res.revokedCount} active session(s) for @${username}.`, type: 'success' });
        await loadSecuritySessions();
      }
    );
  };

  const loadLoginAttempts = async (page = 1) => {
    setLoginAttemptsLoading(true);
    try {
      const data = await api.getLoginAttempts({
        page,
        limit: 25,
        username: loginAttemptsFilter.username || undefined,
        success: loginAttemptsFilter.success ? loginAttemptsFilter.success === 'true' : undefined
      });
      setLoginAttempts(data.attempts || []);
      setLoginAttemptsTotal(data.total || 0);
      setLoginAttemptsPage(data.page || 1);
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to load login attempts.', type: 'error' });
    } finally {
      setLoginAttemptsLoading(false);
    }
  };

  const handleUnlockUser = async (userId: number, username: string) => {
    triggerPasswordProtectedAction(
      `Unlock Account for @${username}`,
      `This resets the failed sign-in counter and clears temporary account lockout for @${username}.`,
      async () => {
        await api.unlockUser(userId);
        setActionMessage({ text: `Account @${username} has been unlocked.`, type: 'success' });
        await loadLoginAttempts(loginAttemptsPage);
        await loadUsers();
      }
    );
  };

  const loadRoleMatrix = async () => {
    setMatrixLoading(true);
    try {
      const data = await api.getRolePermissionsMatrix();
      setMatrixRoles(data.roles || []);
      setMatrixPermissions(data.permissions || []);
      setPermissionMatrix(data.matrix || {});
      if (data.roles?.length && selectedMatrixRole === null) {
        setSelectedMatrixRole(data.roles[0].id);
      }
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to load role permissions matrix.', type: 'error' });
    } finally {
      setMatrixLoading(false);
    }
  };

  const handleTogglePermission = (roleId: number, permId: number) => {
    const role = matrixRoles.find((r) => r.id === roleId);
    if (role?.code === 'system_admin') {
      setActionMessage({ text: 'Permissions for system_admin are immutable.', type: 'error' });
      return;
    }

    setPermissionMatrix((prev) => {
      const current = prev[roleId] || [];
      const updated = current.includes(permId)
        ? current.filter((id) => id !== permId)
        : [...current, permId];
      return { ...prev, [roleId]: updated };
    });
  };

  const handleSaveRolePermissions = async (roleId: number) => {
    const role = matrixRoles.find((r) => r.id === roleId);
    if (role?.code === 'system_admin') {
      setActionMessage({ text: 'Permissions for system_admin cannot be modified.', type: 'error' });
      return;
    }
    const perms = permissionMatrix[roleId] || [];
    triggerPasswordProtectedAction(
      `Save Permissions for Role: ${role?.name || role?.code}`,
      `Modifying role permissions immediately affects all staff and users assigned to this role.`,
      async () => {
        await api.updateRolePermissions(roleId, perms);
        setActionMessage({ text: `Permissions updated for ${role?.name}.`, type: 'success' });
        await loadRoleMatrix();
      }
    );
  };

  const handleStart2FASetup = async () => {
    setTwoFactorLoading(true);
    try {
      const data = await api.setup2FA();
      setSetup2FaData(data);
      setVerify2FaCode('');
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to initiate 2FA setup.', type: 'error' });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleVerifyAndEnable2FA = async (e: FormEvent) => {
    e.preventDefault();
    if (!verify2FaCode.trim()) return;
    setTwoFactorLoading(true);
    try {
      await api.verify2FA(verify2FaCode.trim());
      setTwoFactorEnabled(true);
      setSetup2FaData(null);
      setVerify2FaCode('');
      setActionMessage({ text: 'Two-factor authentication activated successfully! Store your recovery codes safely.', type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Verification failed. Code was invalid or expired.', type: 'error' });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleDisable2FA = async (e: FormEvent) => {
    e.preventDefault();
    if (!disable2FaPassword.trim()) return;
    setTwoFactorLoading(true);
    try {
      await api.disable2FA(disable2FaPassword);
      setTwoFactorEnabled(false);
      setShowDisable2FaModal(false);
      setDisable2FaPassword('');
      setActionMessage({ text: 'Two-factor authentication disabled.', type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to disable 2FA. Incorrect password.', type: 'error' });
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const triggerPasswordProtectedAction = (
    title: string,
    message: string,
    action: () => Promise<void>
  ) => {
    setConfirmActionTitle(title);
    setConfirmActionMessage(message);
    setConfirmPasswordInput('');
    setConfirmPendingAction(() => action);
    setConfirmModalOpen(true);
  };

  const executeConfirmedAction = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmPendingAction) return;
    try {
      await confirmPendingAction();
      setConfirmModalOpen(false);
      setConfirmPendingAction(null);
      setConfirmPasswordInput('');
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Action failed.', type: 'error' });
    }
  };

  const handleToggleSelectAllUsers = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedUserIds(usersList.map((u) => u.id));
    } else {
      setSelectedUserIds([]);
    }
  };

  const handleToggleSelectUser = (id: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBulkSetStatus = async (status: 'active' | 'disabled') => {
    if (selectedUserIds.length === 0) return;
    triggerPasswordProtectedAction(
      `Bulk ${status === 'active' ? 'Activate' : 'Deactivate'} Users (${selectedUserIds.length})`,
      `Are you sure you want to set status to '${status}' for ${selectedUserIds.length} selected user accounts?`,
      async () => {
        let count = 0;
        for (const uid of selectedUserIds) {
          try {
            await api.updateAdminUserStatus(uid, status);
            count++;
          } catch (err: any) {
            console.error(`Failed to update user ${uid}:`, err);
          }
        }
        setActionMessage({ text: `Successfully updated ${count} user account(s) to ${status}.`, type: 'success' });
        setSelectedUserIds([]);
        await loadUsers();
      }
    );
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
      setNewUserPassword('');
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
    if (!newSecGradeId || !newSecYearId || !newSecName.trim()) {
      setActionMessage({ text: 'Select a grade, academic year, and section name.', type: 'error' });
      return;
    }
    try {
      if (editingSectionId) {
        await api.updateAdminSection(editingSectionId, {
          name: newSecName.trim(),
          capacity: Number(newSecCapacity),
          homeroomStaffId: newSecHomeroom ? Number(newSecHomeroom) : null,
          classroomId: newSecRoom ? Number(newSecRoom) : null
        });
        setActionMessage({ text: `Section '${newSecName}' updated.`, type: 'success' });
      } else {
        await api.createAdminSection({
          gradeId: Number(newSecGradeId),
          academicYearId: Number(newSecYearId),
          name: newSecName.trim(),
          stream: newSecStream,
          capacity: Number(newSecCapacity),
          homeroomStaffId: newSecHomeroom ? Number(newSecHomeroom) : undefined,
          classroomId: newSecRoom ? Number(newSecRoom) : undefined
        });
        setActionMessage({ text: `Section '${newSecName}' created!`, type: 'success' });
      }
      setNewSecModalOpen(false);
      setEditingSectionId(null);
      setNewSecName('');
      loadAcademicStructure();
      loadOverviewData();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to create section: ' + err.message, type: 'error' });
    }
  };

  const openNewSectionModal = () => {
    const year = academicStructure?.academicYears?.find((item: any) => item.is_current || item.status === 'active')
      || academicStructure?.academicYears?.[0];
    setNewSecYearId(year?.id || '');
    setEditingSectionId(null);
    setNewSecGradeId('');
    setNewSecName('');
    setNewSecStream('none');
    setNewSecCapacity(40);
    setNewSecHomeroom('');
    setNewSecRoom('');
    setNewSecModalOpen(true);
  };

  const openEditSectionModal = (section: any) => {
    setEditingSectionId(Number(section.id));
    setNewSecGradeId(section.grade_id);
    setNewSecYearId(section.academic_year_id);
    setNewSecName(section.name);
    setNewSecStream(section.stream || 'none');
    setNewSecCapacity(Number(section.capacity));
    setNewSecHomeroom(section.homeroom_staff_id || '');
    setNewSecRoom(section.classroom_id || '');
    setNewSecModalOpen(true);
  };

  const handleCreateMissingGrade = async () => {
    const existingLevels = new Set((academicStructure?.grades || []).map((grade: any) => Number(grade.grade_level)));
    const nextLevel = [9, 10, 11, 12].find((level) => !existingLevels.has(level));
    if (!nextLevel) {
      setActionMessage({ text: 'Grades 9–12 are already configured.', type: 'error' });
      return;
    }
    try {
      await api.createAdminGrade({ gradeLevel: nextLevel });
      setActionMessage({ text: `Grade ${nextLevel} created.`, type: 'success' });
      await loadAcademicStructure();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to create grade: ' + err.message, type: 'error' });
    }
  };

  const handleEditGradeName = (grade: any) => {
    openConfirmDialog({
      title: `Rename ${grade.display_name}`,
      message: 'Update the display name shown to staff, students and guardians throughout the portal.',
      confirmLabel: 'Save grade name',
      requireReason: true,
      reasonLabel: 'Grade display name',
      onConfirm: async (_password?: string, displayName?: string) => {
        await api.updateAdminGrade(Number(grade.id), { displayName: (displayName || '').trim() });
        setActionMessage({ text: 'Grade updated.', type: 'success' });
        await loadAcademicStructure();
      }
    });
  };

  const handleToggleGrade = async (grade: any) => {
    try {
      await api.updateAdminGrade(Number(grade.id), { isActive: !Boolean(grade.is_active) });
      setActionMessage({ text: `${grade.display_name} ${grade.is_active ? 'deactivated' : 'activated'}.`, type: 'success' });
      await loadAcademicStructure();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to change grade status: ' + err.message, type: 'error' });
    }
  };

  const handleToggleSection = async (section: any) => {
    const status = section.status === 'active' ? 'closed' : 'active';
    try {
      await api.updateAdminSection(Number(section.id), { status });
      setActionMessage({ text: `Section ${section.name} ${status === 'active' ? 'activated' : 'closed'}. Enrollment history was preserved.`, type: 'success' });
      await loadAcademicStructure();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to change section status: ' + err.message, type: 'error' });
    }
  };

  const handleCreateSubject = async (e: FormEvent) => {
    e.preventDefault();
    if (!newSubjCode.trim() || !newSubjName.trim()) return;
    try {
      const subjectPayload = {
        code: newSubjCode.trim().toUpperCase(),
        name: newSubjName.trim(),
        nameAm: newSubjNameAm.trim() || undefined,
        description: newSubjDescription.trim() || undefined
      };
      if (editingSubjectId) {
        await api.updateAdminSubject(editingSubjectId, subjectPayload);
        setActionMessage({ text: `Subject '${newSubjName}' updated.`, type: 'success' });
      } else {
        await api.createAdminSubject(subjectPayload);
        setActionMessage({ text: `Subject '${newSubjName}' (${newSubjCode}) added!`, type: 'success' });
      }
      setNewSubjModalOpen(false);
      setEditingSubjectId(null);
      setNewSubjCode('');
      setNewSubjName('');
      setNewSubjNameAm('');
      setNewSubjDescription('');
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
        periodsPerWeek: Number(mapPeriods),
        academicYearId: mapAcademicYearId ? Number(mapAcademicYearId) : undefined
      });
      setActionMessage({ text: 'Subject mapped to grade curriculum!', type: 'success' });
      setMapSubjModalOpen(false);
      loadAcademicStructure();
    } catch (err: any) {
      setActionMessage({ text: 'Mapping failed: ' + err.message, type: 'error' });
    }
  };

  const openNewSubjectModal = () => {
    setEditingSubjectId(null);
    setNewSubjCode('');
    setNewSubjName('');
    setNewSubjNameAm('');
    setNewSubjDescription('');
    setNewSubjModalOpen(true);
  };

  const openEditSubjectModal = (subject: any) => {
    setEditingSubjectId(Number(subject.id));
    setNewSubjCode(subject.code || '');
    setNewSubjName(subject.name || '');
    setNewSubjNameAm(subject.name_am || '');
    setNewSubjDescription(subject.description || '');
    setNewSubjModalOpen(true);
  };

  const handleToggleSubjectStatus = async (subject: any) => {
    try {
      await api.updateAdminSubject(Number(subject.id), { status: subject.status === 'active' ? 'inactive' : 'active' });
      setActionMessage({ text: `Subject ${subject.status === 'active' ? 'deactivated' : 'activated'}.`, type: 'success' });
      await loadAcademicStructure();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to change subject status: ' + err.message, type: 'error' });
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
    setSettingsSavingKey(key);
    setSettingsFeedback(null);
    try {
      await api.updateAdminSetting(key, value);
      await loadSettings();
      setSettingsFeedback({ text: `${key} saved successfully.`, type: 'success' });
      void loadOverviewData();
    } catch (err: any) {
      setSettingsFeedback({ text: `Could not save ${key}: ${err.message}`, type: 'error' });
    } finally {
      setSettingsSavingKey(null);
    }
  };

  // Handlers for Page 5: Assignments & Timetable
  const getEligibleAssignmentSubjects = (sectionId: number | string) => {
    const section = academicStructure?.sections?.find((item: any) => String(item.id) === String(sectionId));
    if (!section) return [];
    const eligibleSubjectIds = new Set((academicStructure?.gradeSubjects || [])
      .filter((mapping: any) => Number(mapping.grade_id) === Number(section.grade_id)
        && (mapping.stream === 'all' || mapping.stream === section.stream)
        && (!mapping.academic_year_id || Number(mapping.academic_year_id) === Number(section.academic_year_id)))
      .map((mapping: any) => Number(mapping.subject_id)));
    return (academicStructure?.subjects || []).filter((subject: any) => subject.status === 'active'
      && !subject.deleted_at && eligibleSubjectIds.has(Number(subject.id)));
  };

  const handleCreateAssignment = async (e: FormEvent) => {
    e.preventDefault();
    setAssignmentError('');
    if (!assignStaffId || !assignSubjId || !assignSecId || !assignYearId) {
      setAssignmentError('Select a teacher, a subject offered to the selected section, and a section. The academic year is taken from that section.');
      return;
    }
    const selectedSection = academicStructure?.sections?.find((section: any) => Number(section.id) === Number(assignSecId));
    if (!selectedSection || Number(selectedSection.academic_year_id) !== Number(assignYearId)) {
      setAssignmentError('The academic year must match the selected section. Choose the section again.');
      return;
    }
    if (!getEligibleAssignmentSubjects(assignSecId).some((subject: any) => Number(subject.id) === Number(assignSubjId))) {
      setAssignmentError('That subject is not mapped to this section’s grade, stream, and academic year.');
      return;
    }
    setAssignmentSaving(true);
    try {
      await api.createAdminAssignment({
        staffId: Number(assignStaffId),
        subjectId: Number(assignSubjId),
        sectionId: Number(assignSecId),
        academicYearId: Number(assignYearId)
      });
      setActionMessage({ text: 'Teacher assigned to class & subject!', type: 'success' });
      setAssignModalOpen(false);
      setAssignmentError('');
      loadAssignments();
      loadOverviewData();
    } catch (err: any) {
      setAssignmentError(err.message || 'Assignment failed. Review the selected teacher, subject, section, and year.');
    } finally {
      setAssignmentSaving(false);
    }
  };

  const handleMapAssignmentSubject = async () => {
    const section = academicStructure?.sections?.find((item: any) => Number(item.id) === Number(assignSecId));
    const subject = academicStructure?.subjects?.find((item: any) => Number(item.id) === Number(assignmentMapSubjectId));
    if (!section || !subject || subject.status !== 'active') {
      setAssignmentError('Select an active subject and section before adding a curriculum mapping.');
      return;
    }
    const grade = academicStructure?.grades?.find((item: any) => Number(item.id) === Number(section.grade_id));
    const isCommonGrade = Number(grade?.grade_level) <= 10;
    setAssignmentMapSaving(true);
    setAssignmentError('');
    try {
      await api.addAdminGradeSubject({
        gradeId: Number(section.grade_id),
        subjectId: Number(subject.id),
        stream: isCommonGrade ? 'all' : section.stream === 'social_science' ? 'social_science' : 'natural_science',
        periodsPerWeek: Number(assignmentMapPeriods),
        academicYearId: Number(section.academic_year_id)
      });
      await loadAcademicStructure();
      setAssignSubjId(Number(subject.id));
      setShowAssignmentCurriculumMap(false);
      setActionMessage({ text: `${subject.name} mapped to ${section.grade_name} ${section.name}. You can now confirm the teacher assignment.`, type: 'success' });
    } catch (err: any) {
      setAssignmentError(err.message || 'Could not map this subject to the section curriculum.');
    } finally {
      setAssignmentMapSaving(false);
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

  const handleCreateTimeSlot = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createAdminTimeSlot({ dayOfWeek: slotDay, label: slotLabel, startTime: slotStart, endTime: slotEnd });
      setActionMessage({ text: 'Lesson period added.', type: 'success' });
      setTimeSlots(await api.getAdminTimeSlots());
    } catch (err: any) { setActionMessage({ text: err.message || 'Could not add lesson period.', type: 'error' }); }
  };

  const handleCreateConfiguredAssessment = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createAdminAssessment({ ...assessmentForm, teachingAssignmentId: Number(assessmentForm.teachingAssignmentId), termId: Number(assessmentForm.termId), assessmentTypeId: Number(assessmentForm.assessmentTypeId), maxScore: Number(assessmentForm.maxScore), weight: Number(assessmentForm.weight) });
      setActionMessage({ text: 'Assessment configured as draft.', type: 'success' });
      setAssessmentOptions(null);
      loadAssessmentsOverview();
    } catch (err: any) { setActionMessage({ text: err.message || 'Could not configure assessment.', type: 'error' }); }
  };

  const handleAssessmentStatus = async (assessmentId: number, status: 'draft' | 'open' | 'closed') => {
    try { await api.updateAdminAssessment(assessmentId, { status }); setActionMessage({ text: `Assessment set to ${status}.`, type: 'success' }); loadAssessmentsOverview(); }
    catch (err: any) { setActionMessage({ text: err.message || 'Could not update assessment status.', type: 'error' }); }
  };

  const handleEditAssessmentTitle = (assessment: any) => {
    openConfirmDialog({
      title: 'Rename Assessment',
      message: 'Update the title that teachers and report cards will use for this assessment.',
      confirmLabel: 'Save title',
      requireReason: true,
      reasonLabel: 'Assessment title',
      onConfirm: async (_password?: string, title?: string) => {
        await api.updateAdminAssessment(Number(assessment.id), { title: (title || '').trim() });
        setActionMessage({ text: 'Assessment title updated.', type: 'success' });
        loadAssessmentsOverview();
      }
    });
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
    setAnnSubmitError('');
    if (!annTitle.trim() || !annContent.trim()) {
      setAnnSubmitError('Enter both an announcement headline and message.');
      return;
    }
    setAnnSubmitting(true);
    try {
      const result = await api.createAdminAnnouncement({
        title: annTitle.trim(),
        content: annContent.trim(),
        targetRole: annTargetRole,
        status: annStatus
      });
      setActionMessage({ text: annStatus === 'published'
        ? `Announcement published to ${result.recipients || 0} audience accounts; ${result.emailsQueued || 0} email messages queued.`
        : 'Announcement draft saved. Publish it later to notify the selected audience.', type: 'success' });
      setAnnModalOpen(false);
      setAnnSubmitError('');
      setAnnTitle('');
      setAnnContent('');
      loadAnnouncements();
      loadOverviewData();
    } catch (err: any) {
      setAnnSubmitError(err.message || 'Failed to publish the announcement.');
    } finally {
      setAnnSubmitting(false);
    }
  };

  const handleUpdateAnnStatus = async (id: number, status: string) => {
    try {
      const result = await api.setAdminAnnouncementStatus(id, status);
      setActionMessage({ text: status === 'published' && result.recipients !== undefined
        ? `Announcement published to ${result.recipients || 0} audience accounts; ${result.emailsQueued || 0} email messages queued.`
        : `Announcement marked as ${status}.`, type: 'success' });
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
      await api.updateAdminProfile({ phone: profilePhone.trim(), email: profileEmail.trim(), photo: adminProfilePhoto || undefined });
      if (adminProfilePhoto) setAdminProfilePhoto(null);
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
    const policyError = validatePasswordStrength(newAdminPassword);
    if (policyError) {
      setActionMessage({ text: policyError, type: 'error' });
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

  // Build the notification list from live overview alerts and the approvals queue.
  // Each item is shown only when its matching saved preference is enabled.
  const preferenceAllows = (id: string): boolean => {
    if (id === 'pending-approvals') return notifSecurityAlerts;
    if (id === 'missing-att') return notifAttendanceDigest;
    if (id === 'pending-marks') return notifSystemErrors;
    return true;
  };
  const dashboardNotifications: Array<{ id: string; title: string; message: string; count: number; type: string; targetTab: AdminMainPage }> = [];
  if (approvalsSummary.totalPending > 0) {
    dashboardNotifications.push({
      id: 'pending-approvals',
      title: 'Pending Approvals',
      message: `${approvalsSummary.totalPending} request(s) await your decision.`,
      count: approvalsSummary.totalPending,
      type: 'danger',
      targetTab: 'attendance_results'
    });
  }
  (dashData?.alerts || []).forEach((alt: any) => {
    if (Number(alt.count) > 0) {
      dashboardNotifications.push({
        id: alt.id,
        title: alt.title,
        message: alt.message,
        count: Number(alt.count),
        type: alt.type,
        targetTab: alt.targetTab
      });
    }
  });
  const visibleNotifications = dashboardNotifications.filter((item) => preferenceAllows(item.id));
  const unreadNotifications = notificationsList.filter((item) => !item.read_at);
  const notificationCount = visibleNotifications.reduce((sum, item) => sum + item.count, 0) + unreadNotifications.length;

  return (
    <div className="teacher-shell admin-dashboard-shell">
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
            type="search"
            aria-label="Search the student directory"
            placeholder="Search student name or admission number…"
            value={studentSearch}
            onChange={(e) => {
              setStudentSearch(e.target.value);
              if (activePage !== 'students') { setStudentTab('directory'); handleNavPage('students'); }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && activePage === 'students') loadStudents(1, false);
            }}
          />
        </div>

        <div className="topbar-actions">
          <div style={{ position: 'relative' }} data-admin-notifications>
            <button
              type="button"
              className="topbar-logout-btn"
              aria-label={`Notifications${notificationCount > 0 ? ` (${notificationCount} pending)` : ''}`}
              title="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 9px' }}
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {notificationCount > 0 && (
                <span
                  aria-hidden="true"
                  style={{ background: '#DC2626', color: '#fff', borderRadius: '10px', fontSize: '10px', fontWeight: 800, padding: '1px 6px' }}
                >
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div
                role="menu"
                style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: '340px', maxHeight: '420px', overflowY: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', boxShadow: '0 12px 32px rgba(15, 23, 42, .18)', zIndex: 60, padding: '8px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px 6px' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>Notifications</span>
                  {unreadNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleMarkAllNotificationsRead()}
                      style={{ border: 0, background: 'transparent', color: '#2563EB', fontSize: '11px', cursor: 'pointer' }}
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {notificationsLoading && notificationsList.length === 0 && (
                  <div style={{ padding: '10px', fontSize: '12px', color: '#64748B' }}>Loading notifications…</div>
                )}

                {unreadNotifications.length > 0 && (
                  <div style={{ padding: '2px 6px 6px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94A3B8', padding: '4px 4px 6px' }}>
                      Inbox
                    </div>
                    {unreadNotifications.slice(0, 8).map((item) => (
                      <button
                        key={`inbox-${item.id}`}
                        type="button"
                        role="menuitem"
                        onClick={() => void handleMarkNotificationRead(item)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: '#EFF6FF', borderRadius: '8px', padding: '9px 10px', marginBottom: '4px', cursor: 'pointer' }}
                        title="Click to mark as read"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
                          <span style={{ fontWeight: 700, fontSize: '12px', color: '#1E293B' }}>{item.title}</span>
                          <span style={{ fontSize: '10px', color: '#64748B', whiteSpace: 'nowrap' }}>
                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                          </span>
                        </div>
                        {item.body && <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>{item.body}</div>}
                      </button>
                    ))}
                  </div>
                )}

                {visibleNotifications.length > 0 && (
                  <div style={{ padding: '2px 6px 6px', borderTop: unreadNotifications.length > 0 ? '1px solid #F1F5F9' : 'none' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#94A3B8', padding: '6px 4px 6px' }}>
                      Action required
                    </div>
                    {visibleNotifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setNotificationsOpen(false);
                          handleNavPage(item.targetTab);
                        }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, background: 'transparent', borderRadius: '8px', padding: '9px 10px', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '12px', color: '#1E293B' }}>{item.title}</span>
                          <span style={{ background: item.type === 'danger' ? '#EF4444' : item.type === 'warning' ? '#F59E0B' : '#3B82F6', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '1px 7px', borderRadius: '10px' }}>
                            {item.count}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{item.message}</div>
                      </button>
                    ))}
                  </div>
                )}

                {!notificationsLoading && unreadNotifications.length === 0 && visibleNotifications.length === 0 && (
                  <div style={{ padding: '12px 10px', fontSize: '12px', color: '#64748B' }}>
                    You're all caught up — no notifications right now.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="user-profile-badge">
            {adminProfile?.photo_document_id ? <img className="user-avatar" crossOrigin="use-credentials" src={api.getAdminProfilePhotoUrl(adminProfile.photo_document_id)} alt={`${displayName} profile`} style={{ objectFit: 'cover' }} /> : <div className="user-avatar">{displayName.charAt(0).toUpperCase()}</div>}
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

            {/* Teacher Management (dedicated page) */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'teachers' ? 'active' : ''}`}
              onClick={() => handleNavPage('teachers')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
              </svg>
              <span>Teacher Management</span>
              {dashData?.staff?.teachers ? (
                <span className="sidebar-badge">{dashData.staff.teachers}</span>
              ) : null}
            </button>

            {/* Users & Staff Management (non-teaching staff + accounts) */}
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
                <span className="sidebar-badge">{Math.max(0, Number(dashData.staff.total) - Number(dashData.staff.teachers || 0))}</span>
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

            {/* Finance & Fees (11th Module) */}
            <button
              type="button"
              className={`sidebar-tab-btn ${activePage === 'finance_fees' ? 'active' : ''}`}
              onClick={() => handleNavPage('finance_fees')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Finance &amp; Fees</span>
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
                      <button className="btn-secondary btn-sm" onClick={() => { handleNavPage('teachers'); setStaffType('teacher'); setTeacherTab('add_teacher'); }}>
                        + Teacher Registration
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => { setStaffType('administrator'); handleNavPage('staff_users'); setStaffTab('add_staff'); }}>
                        + Staff Account Creation
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => { handleNavPage('academic_structure'); openNewSectionModal(); }}>
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

                    <div
                      className="admin-card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleNavPage('finance_fees')}
                    >
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Finance &amp; Fees</div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#B7791F', margin: '4px 0' }}>
                        ETB {Number(dashData.finance?.totalCollected || 0).toLocaleString()}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        Outstanding: ETB {Number(dashData.finance?.outstandingBalance || 0).toLocaleString()}
                      </div>
                    </div>

                    <div
                      className="admin-card"
                      style={{ cursor: 'pointer', borderLeft: approvalsSummary.totalPending > 0 ? '4px solid #DC2626' : undefined }}
                      onClick={() => {
                        handleNavPage('attendance_results');
                        setResultsTab('approvals');
                        loadApprovals(1, 'pending', 'all');
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Approvals Queue</div>
                        {approvalsSummary.totalPending > 0 && (
                          <span style={{ fontSize: '10px', background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                            ACTION REQ.
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '28px', fontWeight: 800, color: approvalsSummary.totalPending > 0 ? '#DC2626' : '#1F3A5F', margin: '4px 0' }}>
                        {approvalsSummary.totalPending}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        Pending administrative decisions
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
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => { setStaffType('teacher'); handleNavPage('teachers'); setTeacherTab('add_teacher'); }}
                      >
                        👨‍🏫 Register Teacher
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
                    <button
                      type="button"
                      className="admin-subtab-btn"
                      onClick={() => { setStaffType('teacher'); handleNavPage('teachers'); setTeacherTab('add_teacher'); }}
                      title="Onboard teaching faculty and record academic qualifications"
                    >
                      <span>👨‍🏫 Register Teacher</span>
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
              {/* PAGE: TEACHER MANAGEMENT (dedicated academic staff page) */}
              {/* ========================================================================= */}
              {activePage === 'teachers' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Teacher Management</span>
                      </div>
                      <h2 className="page-title">Teaching Faculty &amp; Classroom Assignments</h2>
                      <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
                        Academic staff only. Non-teaching employees and login accounts are managed under <strong>Users &amp; Staff</strong>.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          exportToCSV('Teachers_Export',
                            ['Employee No', 'Full Name', 'Job Title', 'Department', 'Phone', 'Email', 'User Account', 'Assigned Classes', 'Status'],
                            teacherList.map((t) => [
                              t.employee_no,
                              `${t.first_name || ''} ${t.father_name || ''}`.trim(),
                              t.job_title,
                              t.department,
                              t.phone || '',
                              t.email || '',
                              t.linked_username ? `@${t.linked_username}` : 'No login',
                              t.active_assignments_count || 0,
                              t.status
                            ])
                          );
                          setActionMessage({ text: `Exported ${teacherList.length} teacher record(s).`, type: 'success' });
                        }}
                      >
                        📥 Export CSV
                      </button>
                      <button
                        className="btn-primary"
                        onClick={() => { setStaffType('teacher'); setTeacherTab('add_teacher'); }}
                      >
                        + Register Teacher
                      </button>
                    </div>
                  </div>

                  {/* TEACHER KPIs — school-wide figures from the overview endpoint, not the filtered page. */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                    <div className="admin-card">
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Active Teachers</div>
                      <div style={{ fontSize: '26px', fontWeight: 800, color: '#1F3A5F', margin: '4px 0' }}>
                        {dashData?.staff?.teachers ?? 0}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>Active teaching staff school-wide</div>
                    </div>
                    <div className="admin-card">
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Classes Assigned</div>
                      <div style={{ fontSize: '26px', fontWeight: 800, color: '#2A7F62', margin: '4px 0' }}>
                        {dashData?.academic?.activeAssignments ?? 0}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>Active class–subject assignments</div>
                    </div>
                    <div className="admin-card">
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>With Login Accounts</div>
                      <div style={{ fontSize: '26px', fontWeight: 800, color: '#2E6DA4', margin: '4px 0' }}>
                        {teacherList.filter((t) => t.linked_username).length}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>On this page only — {teacherList.length} listed</div>
                    </div>
                    <div className="admin-card">
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Unassigned Teachers</div>
                      <div style={{ fontSize: '26px', fontWeight: 800, color: teacherList.some((t) => Number(t.active_assignments_count || 0) === 0) ? '#B7791F' : '#1F3A5F', margin: '4px 0' }}>
                        {teacherList.filter((t) => Number(t.active_assignments_count || 0) === 0).length}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>No active load on this page</div>
                    </div>
                  </div>

                  {/* SUB-NAV */}
                  <div className="admin-subnav">
                    <button
                      className={`admin-subtab-btn ${teacherTab === 'directory' ? 'active' : ''}`}
                      onClick={() => setTeacherTab('directory')}
                    >
                      <span>Teacher Directory</span>
                      <span className="badge-pill">{teacherList.length}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${teacherTab === 'add_teacher' ? 'active' : ''}`}
                      onClick={() => { setStaffType('teacher'); setTeacherTab('add_teacher'); }}
                    >
                      <span>Register New Teacher</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${teacherTab === 'workloads' ? 'active' : ''}`}
                      onClick={() => { setTeacherTab('workloads'); loadReports('workload'); }}
                    >
                      <span>Teaching Load Summary</span>
                    </button>
                  </div>

                  {/* TAB: TEACHER DIRECTORY */}
                  {teacherTab === 'directory' && (
                    <div className="admin-card">
                      <div className="admin-toolbar">
                        <input
                          type="text"
                          placeholder="Search teacher name, employee no, department, email, job title..."
                          value={teacherSearch}
                          onChange={(e) => setTeacherSearch(e.target.value)}
                          style={{ minWidth: '260px' }}
                        />
                        <select value={teacherStatusFilter} onChange={(e) => setTeacherStatusFilter(e.target.value)} aria-label="Filter teacher employment status">
                          <option value="">All Employment Statuses</option>
                          <option value="active">Active</option>
                          <option value="on_leave">On Leave</option>
                          <option value="terminated">Terminated</option>
                        </select>
                        <select value={teacherSort} onChange={(e) => { setTeacherSort(e.target.value); }} aria-label="Sort teachers">
                          <option value="name">Sort: Name (A–Z)</option>
                          <option value="name_desc">Sort: Name (Z–A)</option>
                          <option value="employee_no">Sort: Employee No</option>
                          <option value="load">Sort: Highest Load</option>
                          <option value="load_asc">Sort: Lowest Load</option>
                          <option value="hire_date">Sort: Newest Hire</option>
                          <option value="status">Sort: Status</option>
                        </select>
                        <button className="btn-secondary btn-sm" onClick={() => loadTeachers(1)}>
                          Search
                        </button>
                      </div>

                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Employee No</th>
                              <th>Teacher Name</th>
                              <th>Job Title</th>
                              <th>Department</th>
                              <th>Contact</th>
                              <th>Login Account</th>
                              <th>Assigned Classes</th>
                              <th>Qualifications</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teacherLoading ? (
                              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 28, color: '#64748B' }}>Loading teacher directory…</td></tr>
                            ) : teacherList.length > 0 ? teacherList.map((t) => (
                              <tr key={t.id}>
                                <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{t.employee_no}</td>
                                <td style={{ fontWeight: 600 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#F1F5F9', overflow: 'hidden', display: 'grid', placeItems: 'center', color: '#64748B', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                      {t.photo_document_id ? (
                                        <img
                                          crossOrigin="use-credentials"
                                          src={api.getStaffPhotoUrl(Number(t.id), t.photo_document_id)}
                                          alt={`${t.first_name} ${t.father_name}`}
                                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                      ) : (
                                        String(t.first_name || '?').charAt(0).toUpperCase()
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => void openTeacherProfile(t)}
                                      style={{ border: 0, background: 'none', padding: 0, color: '#1F3A5F', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                                    >
                                      {t.first_name} {t.father_name}
                                      {t.hire_date && (
                                        <div style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 400 }}>
                                          Hired {String(t.hire_date).slice(0, 10)}
                                        </div>
                                      )}
                                    </button>
                                  </div>
                                </td>
                                <td style={{ fontSize: '12px' }}>{t.job_title}</td>
                                <td>{t.department}</td>
                                <td style={{ fontSize: '12px' }}>{t.phone || t.email || 'N/A'}</td>
                                <td>
                                  {t.linked_username ? (
                                    <span style={{ fontSize: '12px', fontWeight: 600, color: t.user_account_status === 'active' ? '#2A7F62' : '#B7791F' }}>
                                      {t.user_account_status === 'active' ? '✓' : '⏸'} @{t.linked_username}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>No login</span>
                                  )}
                                </td>
                                <td>
                                  <span style={{ fontWeight: 700, color: Number(t.active_assignments_count || 0) === 0 ? '#B7791F' : '#2E6DA4' }}>
                                    {t.active_assignments_count || 0} classes
                                  </span>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    onClick={() => openTeacherQualifications(t)}
                                    title="Open the Qualifications & Documents section"
                                    style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                  >
                                    <span style={{ fontWeight: 700, color: Number(t.qualification_count || 0) === 0 ? '#B7791F' : '#1F3A5F' }}>
                                      {t.qualification_count || 0}
                                    </span>
                                    {Number(t.unverified_document_count || 0) > 0 && (
                                      <span style={{ fontSize: '10px', background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
                                        {t.unverified_document_count} to verify
                                      </span>
                                    )}
                                  </button>
                                </td>
                                <td>
                                  <span className={`status-tag ${t.status}`}>{String(t.status || '').replace('_', ' ')}</span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button type="button" className="btn-secondary btn-sm" onClick={() => void openTeacherProfile(t)}>Profile</button>
                                    <button type="button" className="btn-secondary btn-sm" onClick={() => openTeacherQualifications(t)}>Qualifications</button>
                                    <button type="button" className="btn-secondary btn-sm" onClick={() => openStaffEdit(t)}>Edit</button>
                                    <button
                                      type="button"
                                      className="btn-secondary btn-sm"
                                      onClick={() => { handleNavPage('assignments_timetable'); setAssignModalOpen(true); setAssignStaffId(t.id); }}
                                    >
                                      Assign Class
                                    </button>
                                    {t.linked_username && (
                                      <>
                                        <button type="button" className="btn-secondary btn-sm" onClick={() => { setTeacherResetTarget(t); setTeacherResetPassword(''); }}>Reset Password</button>
                                        <button
                                          type="button"
                                          className="btn-secondary btn-sm"
                                          onClick={() => handleToggleTeacherLogin(t)}
                                        >
                                          {t.user_account_status === 'active' ? 'Disable Login' : 'Enable Login'}
                                        </button>
                                        <button
                                          type="button"
                                          className="btn-secondary btn-sm"
                                          onClick={() => handleRevokeTeacherSessions(t)}
                                        >
                                          Revoke Sessions
                                        </button>
                                      </>
                                    )}
                                    {t.status === 'active' ? (
                                      <button
                                        type="button"
                                        className="btn-secondary btn-sm"
                                        style={{ color: '#B91C1C' }}
                                        onClick={() => handleOpenOffboard(t)}
                                      >
                                        Offboard
                                      </button>
                                    ) : (
                                      <button type="button" className="btn-secondary btn-sm" onClick={() => handleReactivateTeacher(t)}>Reactivate</button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )) : (
                              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 28, color: '#64748B' }}>No teachers match the current search and filters.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="admin-toolbar" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>
                          Page {teacherPage} · showing {teacherList.length} teacher(s) per page
                          {teacherHasMore ? '' : ' (end of directory)'}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={teacherPage <= 1 || teacherLoading}
                            onClick={() => void loadTeachers(teacherPage - 1)}
                          >
                            ← Previous
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={!teacherHasMore || teacherLoading}
                            onClick={() => void loadTeachers(teacherPage + 1)}
                          >
                            Next →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: REGISTER TEACHER (reuses the shared staff registration form) */}
                  {teacherTab === 'add_teacher' && (
                    <div className="admin-card" style={{ maxWidth: '800px', margin: '0 auto' }}>
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">👨‍🏫 Register Teaching Faculty</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>Academic staff onboarding &amp; portal account</span>
                      </div>
                      <form onSubmit={handleRegisterStaff}>
                        <div className="form-grid-2">
                          <div className="form-field">
                            <label>Employee Number *</label>
                            <input type="text" value={staffEmpNo} onChange={(e) => setStaffEmpNo(e.target.value)} required />
                          </div>
                          <div className="form-field">
                            <label>Staff Type</label>
                            <input type="text" value="Teacher / Faculty" readOnly aria-readonly="true" />
                          </div>
                          <div className="form-field">
                            <label>First Name *</label>
                            <input type="text" value={staffFirstName} onChange={(e) => setStaffFirstName(e.target.value)} required />
                          </div>
                          <div className="form-field">
                            <label>Father Name *</label>
                            <input type="text" value={staffFatherName} onChange={(e) => setStaffFatherName(e.target.value)} required />
                          </div>
                          <div className="form-field">
                            <label>Grandfather Name</label>
                            <input type="text" value={staffGrandfatherName} onChange={(e) => setStaffGrandfatherName(e.target.value)} />
                          </div>
                          <div className="form-field">
                            <label>Gender</label>
                            <select value={staffGender} onChange={(e) => setStaffGender(e.target.value as 'female' | 'male')}>
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                            </select>
                          </div>
                          <div className="form-field">
                            <label>Job Title *</label>
                            <input type="text" value={staffJobTitle} onChange={(e) => setStaffJobTitle(e.target.value)} placeholder="e.g. Mathematics Teacher" required />
                          </div>
                          <div className="form-field">
                            <label>Department</label>
                            <input type="text" value={staffDept} onChange={(e) => setStaffDept(e.target.value)} placeholder="e.g. Natural Sciences" />
                          </div>
                          <div className="form-field">
                            <label>Phone</label>
                            <input type="text" value={staffPhone} onChange={(e) => setStaffPhone(e.target.value)} />
                          </div>
                          <div className="form-field">
                            <label>Email</label>
                            <input type="email" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} />
                          </div>
                        </div>

                        {/* PROFILE PHOTO */}
                        <div className="form-field" style={{ marginTop: '16px' }}>
                          <label htmlFor="teacher-photo">Profile Photo (JPEG or PNG, max 5 MB)</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px' }}>
                            {staffPhoto ? (
                              <img
                                src={staffPhoto.dataBase64}
                                alt="Selected teacher photo preview"
                                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: '50%', border: '2px solid #CBD5E1' }}
                              />
                            ) : (
                              <div
                                aria-hidden="true"
                                style={{ width: 64, height: 64, borderRadius: '50%', background: '#F1F5F9', border: '1px dashed #CBD5E1', display: 'grid', placeItems: 'center', color: '#94A3B8', fontSize: 22 }}
                              >
                                👤
                              </div>
                            )}
                            <div>
                              <input
                                id="teacher-photo"
                                type="file"
                                accept="image/jpeg,image/png"
                                onChange={(e) => handleStaffPhotoFile(e.target.files?.[0] || null)}
                              />
                              {staffPhoto && (
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  style={{ marginTop: '6px' }}
                                  onClick={() => setStaffPhoto(null)}
                                >
                                  Remove photo
                                </button>
                              )}
                            </div>
                          </div>
                          <small style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: '#64748B' }}>
                            The photo is stored privately and can be replaced later from the teacher's profile.
                          </small>
                        </div>

                        <div style={{ marginTop: '16px', padding: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px' }}>
                            <input type="checkbox" checked={staffCreateAccount} onChange={(e) => setStaffCreateAccount(e.target.checked)} />
                            Create a teacher portal login account
                          </label>
                          {staffCreateAccount && (
                            <div className="form-grid-2" style={{ marginTop: '12px' }}>
                              <div className="form-field">
                                <label>Username *</label>
                                <input type="text" value={staffUsername} onChange={(e) => setStaffUsername(e.target.value)} />
                              </div>
                              <div className="form-field">
                                <label>Temporary Password *</label>
                                <input
                                  type="password"
                                  autoComplete="new-password"
                                  value={staffPassword}
                                  onChange={(e) => setStaffPassword(e.target.value)}
                                  placeholder="8+ chars, upper, lower, number"
                                  aria-describedby="teacher-password-hint"
                                />
                                <small id="teacher-password-hint" style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: staffPassword && validatePasswordStrength(staffPassword) ? '#B91C1C' : '#64748B' }}>
                                  {staffPassword && validatePasswordStrength(staffPassword)
                                    ? validatePasswordStrength(staffPassword)
                                    : 'At least 8 characters with an uppercase letter, a lowercase letter, and a number.'}
                                </small>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ACADEMIC & PROFESSIONAL QUALIFICATION SECTION */}
                        <div style={{ marginTop: '16px', padding: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: includeStaffQualification ? '14px' : '0' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={includeStaffQualification}
                                onChange={(e) => setIncludeStaffQualification(e.target.checked)}
                              />
                              <span>🎓 Academic &amp; Professional Qualification</span>
                            </label>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>
                              {includeStaffQualification ? 'Record initial degree / qualification' : 'Optional: check to add qualification'}
                            </span>
                          </div>

                          {includeStaffQualification && (
                            <div className="form-grid-2" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
                              <div className="form-field">
                                <label>Qualification Level *</label>
                                <select
                                  value={newStaffQualification.qualificationLevel}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, qualificationLevel: e.target.value })}
                                >
                                  <option value="phd">PhD / Doctorate</option>
                                  <option value="masters">Master's Degree</option>
                                  <option value="bachelors">Bachelor's Degree</option>
                                  <option value="diploma">Diploma</option>
                                  <option value="certificate">Certificate</option>
                                  <option value="high_school">High School</option>
                                  <option value="other">Other</option>
                                </select>
                              </div>
                              <div className="form-field">
                                <label>Award Date</label>
                                <input
                                  type="date"
                                  max={getLocalDateInputValue()}
                                  value={newStaffQualification.awardDate}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, awardDate: e.target.value })}
                                />
                              </div>
                              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                                <label>Qualification Title *</label>
                                <input
                                  type="text"
                                  maxLength={190}
                                  placeholder="e.g. BSc in Mathematics"
                                  value={newStaffQualification.title}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, title: e.target.value })}
                                  required={includeStaffQualification}
                                />
                              </div>
                              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                                <label>Institution *</label>
                                <input
                                  type="text"
                                  maxLength={190}
                                  placeholder="e.g. Haramaya University"
                                  value={newStaffQualification.institution}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, institution: e.target.value })}
                                  required={includeStaffQualification}
                                />
                              </div>
                              <div className="form-field">
                                <label>Field of Study</label>
                                <input
                                  type="text"
                                  maxLength={190}
                                  placeholder="e.g. Applied Mathematics"
                                  value={newStaffQualification.fieldOfStudy}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, fieldOfStudy: e.target.value })}
                                />
                              </div>
                              <div className="form-field">
                                <label>Grade / Class / Result</label>
                                <input
                                  type="text"
                                  maxLength={60}
                                  placeholder="e.g. Very Good or 3.6 GPA"
                                  value={newStaffQualification.gradeOrClass}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, gradeOrClass: e.target.value })}
                                />
                              </div>
                              <div className="form-field">
                                <label>Registration / Certificate No</label>
                                <input
                                  type="text"
                                  maxLength={80}
                                  placeholder="e.g. CERT-2023-8891"
                                  value={newStaffQualification.registrationNo}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, registrationNo: e.target.value })}
                                />
                              </div>
                              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                                <label>Notes</label>
                                <input
                                  type="text"
                                  maxLength={500}
                                  placeholder="Optional administrative notes or remarks"
                                  value={newStaffQualification.notes}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, notes: e.target.value })}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                          <button type="submit" className="btn-primary">Create Teacher Record</button>
                          <button type="button" className="btn-secondary" onClick={() => setTeacherTab('directory')}>Cancel</button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* TAB: TEACHING LOAD */}
                  {teacherTab === 'workloads' && (
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">📊 Teaching Load Summary</h4>
                        <button className="btn-secondary btn-sm" onClick={() => loadReports('workload')}>Refresh</button>
                      </div>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Teacher</th>
                              <th>Employee No</th>
                              <th>Department</th>
                              <th>Assigned Sections</th>
                              <th>Subjects Taught</th>
                              <th>Periods / Week</th>
                            </tr>
                          </thead>
                          <tbody>
                            {workloadReport.length > 0 ? workloadReport.map((row: any, idx: number) => (
                              <tr key={row.id || row.staff_id || idx}>
                                <td style={{ fontWeight: 600 }}>{row.teacher_name || row.full_name || `${row.first_name || ''} ${row.father_name || ''}`.trim()}</td>
                                <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{row.employee_no || '—'}</td>
                                <td>{row.department || '—'}</td>
                                <td style={{ fontWeight: 700, color: '#2E6DA4' }}>{row.total_sections ?? row.assigned_classes ?? 0}</td>
                                <td style={{ fontSize: '12px' }}>{row.subjects_list || 'None'}</td>
                                <td style={{ fontWeight: 800, color: '#2A7F62' }}>{row.weekly_periods ?? row.periods_per_week ?? '—'}</td>
                              </tr>
                            )) : (
                              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 28, color: '#64748B' }}>No teaching workload data available yet.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================================= */}
              {/* PAGE 3: STAFF AND USER MANAGEMENT (non-teaching staff + login accounts) */}
              {/* ========================================================================= */}
              {activePage === 'staff_users' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Users &amp; Staff Management</span>
                      </div>
                      <h2 className="page-title">Non-Teaching Staff &amp; System Authentication Accounts</h2>
                      <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
                        Teachers are managed on the <button type="button" onClick={() => handleNavPage('teachers')} style={{ border: 0, background: 'none', padding: 0, color: '#2563EB', cursor: 'pointer', fontWeight: 700, font: 'inherit' }}>Teacher Management</button> page.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        className="btn-secondary"
                        onClick={exportStaff}
                      >
                        📥 Export CSV
                      </button>
                      <button className="btn-primary" onClick={() => { setStaffType('administrator'); setStaffTab('add_staff'); }}>
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
                      <span>Non-Teaching Staff Directory</span>
                      <span className="badge-pill">{staffList.length}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${staffTab === 'add_staff' ? 'active' : ''}`}
                      onClick={() => { setStaffType('administrator'); setStaffTab('add_staff'); }}
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
                      className="admin-subtab-btn"
                      onClick={() => { setTeacherTab('workloads'); handleNavPage('teachers'); }}
                    >
                      <span>Teacher Load Summary →</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${staffTab === 'active_sessions' ? 'active' : ''}`}
                      onClick={() => {
                        setStaffTab('active_sessions');
                        loadSecuritySessions();
                      }}
                    >
                      <span>Active Sessions</span>
                      <span className="badge-pill">{securitySessions.length}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${staffTab === 'login_attempts' ? 'active' : ''}`}
                      onClick={() => {
                        setStaffTab('login_attempts');
                        loadLoginAttempts(1);
                      }}
                    >
                      <span>Login History &amp; Lockouts</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${staffTab === 'role_matrix' ? 'active' : ''}`}
                      onClick={() => {
                        setStaffTab('role_matrix');
                        loadRoleMatrix();
                      }}
                    >
                      <span>Role Permissions Matrix</span>
                    </button>
                  </div>

                  {/* TAB 1: STAFF LIST */}
                  {staffTab === 'staff_list' && (
                    <div className="admin-card">
                      <div className="admin-toolbar">
                        <input
                          type="text"
                          placeholder="Search employee no, name, department, email, job title..."
                          value={staffSearch}
                          onChange={(e) => setStaffSearch(e.target.value)}
                          style={{ minWidth: '240px' }}
                        />
                        <select value={staffTypeFilter} onChange={(e) => setStaffTypeFilter(e.target.value)}>
                          <option value="">All Non-Teaching Roles</option>
                          <option value="administrator">Administrators</option>
                          <option value="librarian">Librarians</option>
                          <option value="accountant">Accountants</option>
                          <option value="support">Support Staff</option>
                        </select>
                        <select value={staffStatusFilter} onChange={(e) => setStaffStatusFilter(e.target.value)} aria-label="Filter employment status">
                          <option value="">All Employment Statuses</option>
                          <option value="active">Active</option>
                          <option value="on_leave">On Leave</option>
                          <option value="terminated">Terminated</option>
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
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {staffList.length > 0 ? staffList.map((st) => (
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
                                <td>
                                  <button type="button" className="btn-secondary btn-sm" onClick={() => openStaffEdit(st)}>Edit</button>
                                </td>
                              </tr>
                            )) : (
                              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 28, color: '#64748B' }}>No staff records match the current search and filters.</td></tr>
                            )}
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
                            <label>Job Title *</label>
                            <input
                              type="text"
                              placeholder="e.g. Senior Physics Teacher"
                              value={staffJobTitle}
                              onChange={(e) => setStaffJobTitle(e.target.value)}
                              required
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
                                  type="password"
                                  autoComplete="new-password"
                                  minLength={8}
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
                                  <option value="">Select a role</option>
                                  {availableRoles.map((role) => <option key={role.id} value={role.code}>{role.name} ({role.code})</option>)}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* ACADEMIC & PROFESSIONAL QUALIFICATION SECTION */}
                        <div style={{ marginTop: '16px', padding: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: includeStaffQualification ? '14px' : '0' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px', cursor: 'pointer', margin: 0 }}>
                              <input
                                type="checkbox"
                                checked={includeStaffQualification}
                                onChange={(e) => setIncludeStaffQualification(e.target.checked)}
                              />
                              <span>🎓 Academic &amp; Professional Qualification</span>
                            </label>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>
                              {includeStaffQualification ? 'Record initial degree / qualification' : 'Optional: check to add qualification'}
                            </span>
                          </div>

                          {includeStaffQualification && (
                            <div className="form-grid-2" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
                              <div className="form-field">
                                <label>Qualification Level *</label>
                                <select
                                  value={newStaffQualification.qualificationLevel}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, qualificationLevel: e.target.value })}
                                >
                                  <option value="phd">PhD / Doctorate</option>
                                  <option value="masters">Master's Degree</option>
                                  <option value="bachelors">Bachelor's Degree</option>
                                  <option value="diploma">Diploma</option>
                                  <option value="certificate">Certificate</option>
                                  <option value="high_school">High School</option>
                                  <option value="other">Other</option>
                                </select>
                              </div>
                              <div className="form-field">
                                <label>Award Date</label>
                                <input
                                  type="date"
                                  max={getLocalDateInputValue()}
                                  value={newStaffQualification.awardDate}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, awardDate: e.target.value })}
                                />
                              </div>
                              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                                <label>Qualification Title *</label>
                                <input
                                  type="text"
                                  maxLength={190}
                                  placeholder="e.g. BSc in Mathematics"
                                  value={newStaffQualification.title}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, title: e.target.value })}
                                  required={includeStaffQualification}
                                />
                              </div>
                              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                                <label>Institution *</label>
                                <input
                                  type="text"
                                  maxLength={190}
                                  placeholder="e.g. Haramaya University"
                                  value={newStaffQualification.institution}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, institution: e.target.value })}
                                  required={includeStaffQualification}
                                />
                              </div>
                              <div className="form-field">
                                <label>Field of Study</label>
                                <input
                                  type="text"
                                  maxLength={190}
                                  placeholder="e.g. Applied Mathematics"
                                  value={newStaffQualification.fieldOfStudy}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, fieldOfStudy: e.target.value })}
                                />
                              </div>
                              <div className="form-field">
                                <label>Grade / Class / Result</label>
                                <input
                                  type="text"
                                  maxLength={60}
                                  placeholder="e.g. Very Good or 3.6 GPA"
                                  value={newStaffQualification.gradeOrClass}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, gradeOrClass: e.target.value })}
                                />
                              </div>
                              <div className="form-field">
                                <label>Registration / Certificate No</label>
                                <input
                                  type="text"
                                  maxLength={80}
                                  placeholder="e.g. CERT-2023-8891"
                                  value={newStaffQualification.registrationNo}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, registrationNo: e.target.value })}
                                />
                              </div>
                              <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                                <label>Notes</label>
                                <input
                                  type="text"
                                  maxLength={500}
                                  placeholder="Optional administrative notes or remarks"
                                  value={newStaffQualification.notes}
                                  onChange={(e) => setNewStaffQualification({ ...newStaffQualification, notes: e.target.value })}
                                />
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

                      {selectedUserIds.length > 0 && (
                        <div className="bulk-actions-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', marginBottom: '16px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>
                            ✓ {selectedUserIds.length} user account(s) selected
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{ color: '#166534', borderColor: '#BBF7D0', background: '#F0FDF4' }}
                              onClick={() => handleBulkSetStatus('active')}
                            >
                              Bulk Activate
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              style={{ color: '#991B1B', borderColor: '#FECACA', background: '#FEF2F2' }}
                              onClick={() => handleBulkSetStatus('disabled')}
                            >
                              Bulk Deactivate
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => setSelectedUserIds([])}
                            >
                              Clear Selection
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th style={{ width: '40px', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={usersList.length > 0 && selectedUserIds.length === usersList.length}
                                  onChange={handleToggleSelectAllUsers}
                                  title="Select All"
                                />
                              </th>
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
                                <td style={{ textAlign: 'center' }}>
                                  <input
                                    type="checkbox"
                                    checked={selectedUserIds.includes(u.id)}
                                    onChange={() => handleToggleSelectUser(u.id)}
                                  />
                                </td>
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
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
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
                                        setResetNewPass('');
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
                                    <button
                                      className="btn-secondary btn-sm"
                                      style={{ color: '#B91C1C', borderColor: '#FECACA' }}
                                      title="Revoke all active web/mobile sessions for this user"
                                      onClick={() => handleRevokeAllUserSessions(u.id, u.username)}
                                    >
                                      Revoke Sessions
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

                  {/* TAB 4: ACTIVE USER SESSIONS */}
                  {staffTab === 'active_sessions' && (
                    <div className="admin-card">
                      <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h4 className="admin-card-title">🌐 Active Refresh Sessions &amp; Connected Devices</h4>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>Live audit of persistent browser/device authentication sessions</span>
                        </div>
                        <button className="btn-secondary btn-sm" onClick={loadSecuritySessions} disabled={sessionsLoading}>
                          {sessionsLoading ? 'Refreshing…' : '🔄 Refresh Sessions'}
                        </button>
                      </div>

                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>User Identity</th>
                              <th>IP Address</th>
                              <th>Device / User Agent</th>
                              <th>Signed In At</th>
                              <th>Last Seen</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {securitySessions.length > 0 ? (
                              securitySessions.map((s) => (
                                <tr key={s.id}>
                                  <td>
                                    <div style={{ fontWeight: 700, color: '#1F3A5F' }}>@{s.username}</div>
                                    <div style={{ fontSize: '12px', color: '#64748B' }}>{s.display_name || s.email}</div>
                                  </td>
                                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{s.ip_address || 'Unknown'}</td>
                                  <td style={{ fontSize: '11px', color: '#475569', maxWidth: '240px', wordBreak: 'break-all' }}>
                                    {s.user_agent || 'Standard Web Browser'}
                                  </td>
                                  <td style={{ fontSize: '12px' }}>{new Date(s.created_at).toLocaleString()}</td>
                                  <td style={{ fontSize: '12px', fontWeight: 600, color: '#0369A1' }}>
                                    {s.last_seen_at ? new Date(s.last_seen_at).toLocaleTimeString() : 'Recent'}
                                  </td>
                                  <td>
                                    <span className={`status-tag ${s.is_active ? 'active' : 'disabled'}`}>
                                      {s.is_active ? 'Active' : 'Expired'}
                                    </span>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <button
                                        type="button"
                                        className="btn-secondary btn-sm"
                                        style={{ color: '#B91C1C', borderColor: '#FECACA' }}
                                        onClick={() => handleRevokeSession(s.id)}
                                      >
                                        Revoke
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-secondary btn-sm"
                                        onClick={() => handleRevokeAllUserSessions(s.user_id, s.username)}
                                        title="Revoke all devices for this user"
                                      >
                                        Revoke User All
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={7} style={{ textAlign: 'center', padding: '28px', color: '#64748B' }}>
                                  {sessionsLoading ? 'Loading active sessions…' : 'No active sessions found.'}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* TAB 6: LOGIN ATTEMPTS & ACCOUNT LOCKOUTS */}
                  {staffTab === 'login_attempts' && (
                    <div className="admin-card">
                      <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h4 className="admin-card-title">🛡️ Sign-in Audit History &amp; Brute-Force Lockout Defense</h4>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>Automatic 5-attempt lockout monitoring with instant admin unlock</span>
                        </div>
                        <span className="badge-pill" style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE' }}>
                          Total Logged: {loginAttemptsTotal}
                        </span>
                      </div>

                      <div className="admin-toolbar" style={{ gap: '10px', marginTop: '12px' }}>
                        <input
                          type="text"
                          placeholder="Filter by username..."
                          value={loginAttemptsFilter.username}
                          onChange={(e) => setLoginAttemptsFilter({ ...loginAttemptsFilter, username: e.target.value })}
                          style={{ minWidth: '180px' }}
                        />
                        <select
                          value={loginAttemptsFilter.success}
                          onChange={(e) => setLoginAttemptsFilter({ ...loginAttemptsFilter, success: e.target.value })}
                        >
                          <option value="">All Outcomes</option>
                          <option value="true">Successful Sign-ins Only</option>
                          <option value="false">Failed Attempts Only</option>
                        </select>
                        <button className="btn-secondary btn-sm" onClick={() => loadLoginAttempts(1)}>
                          Filter
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            setLoginAttemptsFilter({ username: '', success: '' });
                            loadLoginAttempts(1);
                          }}
                        >
                          Reset
                        </button>
                      </div>

                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Timestamp</th>
                              <th>Target Account</th>
                              <th>Client IP</th>
                              <th>Outcome</th>
                              <th>Failure Reason</th>
                              <th>Lockout Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {loginAttempts.length > 0 ? (
                              loginAttempts.map((a) => (
                                <tr key={a.id}>
                                  <td style={{ fontSize: '12px' }}>{new Date(a.created_at).toLocaleString()}</td>
                                  <td>
                                    <strong style={{ color: '#1F3A5F' }}>@{a.username}</strong>
                                    {a.account_locked ? (
                                      <span className="status-tag disabled" style={{ marginLeft: '8px', fontSize: '10px' }}>
                                        LOCKED
                                      </span>
                                    ) : null}
                                  </td>
                                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{a.ip_address || 'Unknown'}</td>
                                  <td>
                                    <span className={`status-tag ${a.success ? 'active' : 'disabled'}`}>
                                      {a.success ? '✓ SUCCESS' : '✕ FAILED'}
                                    </span>
                                  </td>
                                  <td style={{ fontSize: '12px', color: a.success ? '#166534' : '#991B1B' }}>
                                    {a.failure_reason || (a.success ? 'Authentication Verified' : 'Unknown')}
                                  </td>
                                  <td>
                                    {a.user_id && (a.account_locked || !a.success) ? (
                                      <button
                                        type="button"
                                        className="btn-secondary btn-sm"
                                        style={{ color: '#166534', borderColor: '#BBF7D0' }}
                                        onClick={() => handleUnlockUser(a.user_id, a.username)}
                                      >
                                        🔓 Reset &amp; Unlock
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: '11px', color: '#94A3B8' }}>Normal</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '28px', color: '#64748B' }}>
                                  {loginAttemptsLoading ? 'Loading audit logs…' : 'No sign-in records found.'}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {loginAttemptsTotal > 25 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={loginAttemptsPage <= 1}
                            onClick={() => loadLoginAttempts(loginAttemptsPage - 1)}
                          >
                            ← Previous
                          </button>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>
                            Page {loginAttemptsPage} of {Math.ceil(loginAttemptsTotal / 25)}
                          </span>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            disabled={loginAttemptsPage >= Math.ceil(loginAttemptsTotal / 25)}
                            onClick={() => loadLoginAttempts(loginAttemptsPage + 1)}
                          >
                            Next →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 7: ROLE PERMISSIONS MATRIX */}
                  {staffTab === 'role_matrix' && (
                    <div className="admin-card">
                      <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h4 className="admin-card-title">🔐 Role-Based Access Control (RBAC) Permissions Matrix</h4>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>
                            Manage granular capabilities per role. System Administrator role is locked and protected.
                          </span>
                        </div>
                        {selectedMatrixRole && (
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            disabled={matrixLoading || matrixRoles.find((r) => r.id === selectedMatrixRole)?.code === 'system_admin'}
                            onClick={() => handleSaveRolePermissions(selectedMatrixRole)}
                          >
                            {matrixLoading ? 'Saving…' : '💾 Save Permissions'}
                          </button>
                        )}
                      </div>

                      {/* ROLE SELECTOR BUTTONS */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '14px 0' }}>
                        {matrixRoles.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            className={`btn-secondary btn-sm ${selectedMatrixRole === r.id ? 'active' : ''}`}
                            style={{
                              background: selectedMatrixRole === r.id ? '#1F3A5F' : '#FFFFFF',
                              color: selectedMatrixRole === r.id ? '#FFFFFF' : '#1E293B',
                              borderColor: selectedMatrixRole === r.id ? '#1F3A5F' : '#CBD5E1'
                            }}
                            onClick={() => setSelectedMatrixRole(r.id)}
                          >
                            {r.name} {r.code === 'system_admin' ? '🔒' : ''}
                          </button>
                        ))}
                      </div>

                      {selectedMatrixRole && (
                        <div>
                          {matrixRoles.find((r) => r.id === selectedMatrixRole)?.code === 'system_admin' && (
                            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#1E40AF' }}>
                              🔒 <strong>Immutable System Role:</strong> System Administrator possesses all operational and security privileges by definition. Core grants cannot be revoked.
                            </div>
                          )}

                          <div className="admin-table-container">
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th style={{ width: '60px', textAlign: 'center' }}>Granted</th>
                                  <th>Permission Name</th>
                                  <th>System Code</th>
                                  <th>Module Category</th>
                                  <th>Functional Description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {matrixPermissions.map((perm) => {
                                  const isChecked = (permissionMatrix[selectedMatrixRole] || []).includes(perm.id);
                                  const isSystemAdmin = matrixRoles.find((r) => r.id === selectedMatrixRole)?.code === 'system_admin';
                                  return (
                                    <tr key={perm.id}>
                                      <td style={{ textAlign: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          disabled={isSystemAdmin}
                                          onChange={() => handleTogglePermission(selectedMatrixRole, perm.id)}
                                          style={{ cursor: isSystemAdmin ? 'not-allowed' : 'pointer', width: '16px', height: '16px' }}
                                        />
                                      </td>
                                      <td style={{ fontWeight: 600 }}>{perm.name}</td>
                                      <td>
                                        <code style={{ fontSize: '11px', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                                          {perm.code}
                                        </code>
                                      </td>
                                      <td>
                                        <span className="badge-pill" style={{ textTransform: 'capitalize' }}>
                                          {perm.module || 'System'}
                                        </span>
                                      </td>
                                      <td style={{ fontSize: '12px', color: '#64748B' }}>{perm.description || '—'}</td>
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
                      <button className="btn-secondary" onClick={openNewSectionModal}>
                        + New Section
                      </button>
                      <button className="btn-primary" onClick={openNewSubjectModal}>
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
                    <div style={{ display: 'grid', gap: 20 }}>
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">Grade Configuration (9–12)</h4>
                        <button className="btn-secondary btn-sm" onClick={() => void handleCreateMissingGrade()}>
                          + Add Missing Grade
                        </button>
                      </div>
                      <div className="admin-table-container">
                        <table className="admin-table">
                          <thead><tr><th>Grade</th><th>Curriculum</th><th>Status</th><th>Actions</th></tr></thead>
                          <tbody>
                            {[...(academicStructure?.grades || [])].filter((grade: any) => Number(grade.grade_level) >= 9 && Number(grade.grade_level) <= 12)
                              .sort((a: any, b: any) => Number(a.grade_level) - Number(b.grade_level)).map((grade: any) => (
                                <tr key={grade.id}>
                                  <td style={{ fontWeight: 700 }}>{grade.display_name}</td>
                                  <td>{Number(grade.grade_level) >= 11 ? 'Natural / Social streams' : 'Common curriculum'}</td>
                                  <td><span className={`status-tag ${grade.is_active ? 'active' : 'draft'}`}>{grade.is_active ? 'Active' : 'Inactive'}</span></td>
                                  <td style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn-secondary btn-sm" onClick={() => void handleEditGradeName(grade)}>Edit name</button>
                                    <button className="btn-secondary btn-sm" onClick={() => void handleToggleGrade(grade)}>{grade.is_active ? 'Deactivate' : 'Activate'}</button>
                                  </td>
                                </tr>
                              ))}
                            {!(academicStructure?.grades || []).some((grade: any) => Number(grade.grade_level) >= 9 && Number(grade.grade_level) <= 12) && (
                              <tr><td colSpan={4}>No Grades 9–12 are configured.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="admin-card">
                      <div className="admin-card-header">
                        <h4 className="admin-card-title">🏫 High School &amp; Preparatory Sections (Grades 9–12)</h4>
                        <button className="btn-primary btn-sm" onClick={openNewSectionModal}>
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
                              <th>Status</th>
                              <th>Actions</th>
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
                                <td><span className={`status-tag ${sec.status === 'active' ? 'active' : 'draft'}`}>{sec.status}</span></td>
                                <td>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn-secondary btn-sm" onClick={() => openEditSectionModal(sec)}>Edit</button>
                                    <button className="btn-secondary btn-sm" onClick={() => void handleToggleSection(sec)}>
                                      {sec.status === 'active' ? 'Close section' : 'Activate'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    </div>
                  )}

                  {/* TAB 3: SUBJECTS & MAPPINGS */}
                  {academicTab === 'subjects' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
                      <div className="admin-card">
                        <div className="admin-card-header">
                          <h4 className="admin-card-title">📚 Subjects Catalog</h4>
                          <button className="btn-primary btn-sm" onClick={openNewSubjectModal}>
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
                                <th>Description</th>
                                <th>Status</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {academicStructure?.subjects?.map((sub: any) => (
                                <tr key={sub.id}>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{sub.code}</td>
                                  <td style={{ fontWeight: 600 }}>{sub.name}</td>
                                  <td style={{ color: '#64748B' }}>{sub.name_am || '-'}</td>
                                  <td style={{ color: '#64748B' }}>{sub.description || '-'}</td>
                                  <td>
                                    <span className={`status-tag ${sub.status === 'active' ? 'active' : 'draft'}`}>{sub.status}</span>
                                  </td>
                                  <td style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn-secondary btn-sm" onClick={() => openEditSubjectModal(sub)}>Edit</button>
                                    <button className="btn-secondary btn-sm" onClick={() => void handleToggleSubjectStatus(sub)}>{sub.status === 'active' ? 'Deactivate' : 'Activate'}</button>
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
                                <th>Academic Year</th>
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
                                  <td>{gs.academic_year_name || 'All years'}</td>
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
                      <button className="btn-primary" onClick={() => { setAssignmentError(''); setShowAssignmentCurriculumMap(false); setAssignModalOpen(true); if (!assignmentTeachers.length) loadAssignmentTeachers(); }}>
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
                              disabled={loadingAssignmentTeachers}
                            >
                              <option value="">{loadingAssignmentTeachers ? 'Loading active teachers…' : assignmentTeachers.length ? 'Select Teacher' : 'No active teachers found'}</option>
                              {assignmentTeachers.map((st: any) => (
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
                        <form onSubmit={handleCreateTimeSlot} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 16 }}>
                          <select value={slotDay} onChange={e => setSlotDay(Number(e.target.value))}>{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>
                          <input aria-label="Period label" value={slotLabel} onChange={e => setSlotLabel(e.target.value)} required maxLength={80} />
                          <input aria-label="Start time" type="time" value={slotStart} onChange={e => setSlotStart(e.target.value)} required />
                          <input aria-label="End time" type="time" value={slotEnd} onChange={e => setSlotEnd(e.target.value)} required />
                          <button className="btn-primary" type="submit">Add lesson period</button>
                        </form>
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
                    <button
                      className={`admin-subtab-btn ${resultsTab === 'approvals' ? 'active' : ''}`}
                      onClick={() => {
                        setResultsTab('approvals');
                        loadApprovals(1, approvalsStatusFilter, approvalsTypeFilter);
                      }}
                    >
                      <span>Approvals Queue</span>
                      {approvalsSummary.totalPending > 0 && (
                        <span className="badge-pill" style={{ backgroundColor: '#DC2626', color: '#fff', marginLeft: '6px' }}>
                          {approvalsSummary.totalPending}
                        </span>
                      )}
                    </button>
                    <button
                      className={`admin-subtab-btn ${resultsTab === 'lifecycle' ? 'active' : ''}`}
                      onClick={() => setResultsTab('lifecycle')}
                    >
                      <span>Academic Lifecycle</span>
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
                      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 12 }}><button className="btn-primary btn-sm" onClick={async () => { try { setAssessmentOptions(await api.getAdminAssessmentConfigurationOptions()); } catch (err: any) { setActionMessage({ text: err.message, type: 'error' }); } }}>Configure Assessment</button></div>
                      {assessmentOptions && <form onSubmit={handleCreateConfiguredAssessment} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 16 }}>
                        <select required value={assessmentForm.teachingAssignmentId} onChange={e => setAssessmentForm({ ...assessmentForm, teachingAssignmentId: e.target.value })}><option value="">Class, subject and teacher</option>{assessmentOptions.assignments.map((a: any) => <option key={a.teaching_assignment_id} value={a.teaching_assignment_id}>{a.grade_name} {a.section_name} · {a.subject_name} · {a.teacher_name}</option>)}</select>
                        <select required value={assessmentForm.termId} onChange={e => setAssessmentForm({ ...assessmentForm, termId: e.target.value })}><option value="">Term</option>{assessmentOptions.terms.map((t: any) => <option key={t.id} value={t.id}>{t.academic_year_name} · {t.name}</option>)}</select>
                        <select required value={assessmentForm.assessmentTypeId} onChange={e => setAssessmentForm({ ...assessmentForm, assessmentTypeId: e.target.value })}><option value="">Type</option>{assessmentOptions.types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                        <input placeholder="Title" required maxLength={150} value={assessmentForm.title} onChange={e => setAssessmentForm({ ...assessmentForm, title: e.target.value })} />
                        <input aria-label="Maximum marks" type="number" min="0.01" step="any" required value={assessmentForm.maxScore} onChange={e => setAssessmentForm({ ...assessmentForm, maxScore: e.target.value })} />
                        <input aria-label="Weight percent" type="number" min="0" max="100" step="any" required value={assessmentForm.weight} onChange={e => setAssessmentForm({ ...assessmentForm, weight: e.target.value })} />
                        <input aria-label="Assessment date" type="date" required value={assessmentForm.assessmentDate} onChange={e => setAssessmentForm({ ...assessmentForm, assessmentDate: e.target.value })} />
                        <button className="btn-primary" type="submit">Save as draft</button><button type="button" className="btn-secondary" onClick={() => setAssessmentOptions(null)}>Cancel</button>
                      </form>}
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
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    <span className={`status-tag ${a.assessment_status === 'open' ? 'active' : 'draft'}`}>{a.assessment_status}</span>
                                    <button className="btn-secondary btn-sm" onClick={() => void handleEditAssessmentTitle(a)}>Edit title</button>
                                    {a.assessment_status !== 'closed' && <button className="btn-secondary btn-sm" onClick={() => handleAssessmentStatus(a.id, a.assessment_status === 'draft' ? 'open' : 'closed')}>{a.assessment_status === 'draft' ? 'Open assessment' : 'Close assessment'}</button>}
                                  </div>
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

                  {/* TAB 5: APPROVALS QUEUE (PACKAGE 3) */}
                  {resultsTab === 'approvals' && (
                    <div>
                      {/* Metric summary cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                        <div className="admin-card" style={{ borderLeft: '4px solid #DC2626' }}>
                          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Total Pending Requests</div>
                          <div style={{ fontSize: '28px', fontWeight: 800, color: approvalsSummary.totalPending > 0 ? '#DC2626' : '#1F3A5F', margin: '4px 0' }}>
                            {approvalsSummary.totalPending}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Awaiting executive action</div>
                        </div>
                        <div className="admin-card">
                          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Student Transfers / Withdrawals</div>
                          <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563EB', margin: '4px 0' }}>
                            {(approvalsSummary.byType?.student_transfer || 0) + (approvalsSummary.byType?.student_withdrawal || 0)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Transfer &amp; enrollment shifts</div>
                        </div>
                        <div className="admin-card">
                          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Results &amp; Marks Unlocks</div>
                          <div style={{ fontSize: '24px', fontWeight: 800, color: '#D97706', margin: '4px 0' }}>
                            {approvalsSummary.byType?.result_unlock || 0}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Post-lock grade edits</div>
                        </div>
                        <div className="admin-card">
                          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Attendance Unlocks</div>
                          <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', margin: '4px 0' }}>
                            {approvalsSummary.byType?.attendance_edit_after_lock || 0}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Late attendance corrections</div>
                        </div>
                      </div>

                      {/* Filter Toolbar */}
                      <div className="admin-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1F3A5F' }}>Filters:</span>
                          <select
                            className="form-control"
                            style={{ width: '170px' }}
                            value={approvalsStatusFilter}
                            onChange={(e) => {
                              const s = e.target.value;
                              setApprovalsStatusFilter(s);
                              loadApprovals(1, s, approvalsTypeFilter);
                            }}
                          >
                            <option value="pending">⏳ Pending Only</option>
                            <option value="approved">✅ Approved</option>
                            <option value="rejected">❌ Rejected</option>
                            <option value="all">📁 All Statuses</option>
                          </select>

                          <select
                            className="form-control"
                            style={{ width: '210px' }}
                            value={approvalsTypeFilter}
                            onChange={(e) => {
                              const t = e.target.value;
                              setApprovalsTypeFilter(t);
                              loadApprovals(1, approvalsStatusFilter, t);
                            }}
                          >
                            <option value="all">All Request Types</option>
                            <option value="student_transfer">Student Transfer</option>
                            <option value="student_withdrawal">Student Withdrawal</option>
                            <option value="admission_application">Admission Application</option>
                            <option value="result_unlock">Result / Marks Unlock</option>
                            <option value="attendance_edit_after_lock">Attendance Edit (Post-Lock)</option>
                            <option value="fee_waiver">Fee Waiver / Scholarship</option>
                            <option value="payment_void">Payment Void / Reversal</option>
                            <option value="admission_application">Admission Application</option>
                          </select>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => loadApprovals(approvalsPage, approvalsStatusFilter, approvalsTypeFilter)}
                            disabled={approvalsLoading}
                          >
                            {approvalsLoading ? 'Refreshing...' : '🔄 Refresh Queue'}
                          </button>
                        </div>
                      </div>

                      {/* Approvals Table */}
                      <div className="admin-card">
                        <div className="admin-card-header">
                          <div>
                            <h4 className="admin-card-title">📋 Executive Approvals &amp; Exception Requests</h4>
                            <div className="admin-card-subtitle">
                              Showing {approvalsList.length} of {approvalsTotal} requests
                            </div>
                          </div>
                        </div>

                        {approvalsLoading ? (
                          <div style={{ padding: '30px', textAlign: 'center', color: '#64748B' }}>
                            Loading approval records...
                          </div>
                        ) : approvalsList.length === 0 ? (
                          <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
                            <div style={{ fontWeight: 600 }}>No approvals found matching current filters.</div>
                            <div style={{ fontSize: '12px', marginTop: '4px' }}>
                              All exceptions and change requests have been processed.
                            </div>
                          </div>
                        ) : (
                          <div className="admin-table-container">
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th>ID / Date</th>
                                  <th>Type</th>
                                  <th>Requester</th>
                                  <th>Reason &amp; Remarks</th>
                                  <th>Status</th>
                                  <th>Decision Info</th>
                                  <th style={{ textAlign: 'right' }}>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {approvalsList.map((item: any) => {
                                  let typeBadgeColor = '#2563EB';
                                  let typeLabel = item.type;
                                  if (item.type === 'student_transfer') {
                                    typeBadgeColor = '#2563EB';
                                    typeLabel = 'Student Transfer';
                                  } else if (item.type === 'student_withdrawal') {
                                    typeBadgeColor = '#7C3AED';
                                    typeLabel = 'Student Withdrawal';
                                  } else if (item.type === 'result_unlock') {
                                    typeBadgeColor = '#D97706';
                                    typeLabel = 'Result Unlock';
                                  } else if (item.type === 'attendance_edit_after_lock') {
                                    typeBadgeColor = '#059669';
                                    typeLabel = 'Attendance Unlock';
                                  } else if (item.type === 'fee_waiver') {
                                    typeBadgeColor = '#CA8A04';
                                    typeLabel = 'Fee Waiver';
                                  } else if (item.type === 'payment_void') {
                                    typeBadgeColor = '#DC2626';
                                    typeLabel = 'Payment Void';
                                  } else if (item.type === 'admission_application') {
                                    typeBadgeColor = '#10B981';
                                    typeLabel = 'Admission Application';
                                  }

                                  return (
                                    <tr key={item.id}>
                                      <td>
                                        <div style={{ fontWeight: 700, color: '#1F3A5F' }}>#{item.id}</div>
                                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A'}
                                        </div>
                                      </td>
                                      <td>
                                        <span
                                          style={{
                                            display: 'inline-block',
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            backgroundColor: `${typeBadgeColor}15`,
                                            color: typeBadgeColor,
                                            border: `1px solid ${typeBadgeColor}40`
                                          }}
                                        >
                                          {typeLabel}
                                        </span>
                                      </td>
                                      <td>
                                        <div style={{ fontWeight: 600, color: '#1F3A5F' }}>{item.requester_name}</div>
                                        <div style={{ fontSize: '11px', color: '#64748B' }}>@{item.requester_username}</div>
                                      </td>
                                      <td style={{ maxWidth: '280px' }}>
                                        <div
                                          style={{
                                            fontSize: '12px',
                                            color: '#334155',
                                            fontStyle: 'italic',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                          }}
                                          title={item.reason}
                                        >
                                          "{item.reason}"
                                        </div>
                                      </td>
                                      <td>
                                        <span
                                          className={`status-tag ${
                                            item.status === 'approved'
                                              ? 'active'
                                              : item.status === 'rejected'
                                              ? 'danger'
                                              : 'pending'
                                          }`}
                                        >
                                          {item.status.toUpperCase()}
                                        </span>
                                      </td>
                                      <td>
                                        {item.decided_by ? (
                                          <div>
                                            <div style={{ fontSize: '12px', fontWeight: 600 }}>{item.decider_name || 'Admin'}</div>
                                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                                              {item.decided_at ? new Date(item.decided_at).toLocaleDateString() : ''}
                                            </div>
                                            {item.decision_note && (
                                              <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                                                Note: {item.decision_note}
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <span style={{ fontSize: '12px', color: '#94A3B8' }}>Awaiting decision</span>
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'right' }}>
                                        <button
                                          type="button"
                                          className={`btn-sm ${item.status === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
                                          onClick={() => {
                                            setDecisionModalItem(item);
                                            setDecisionAction('approve');
                                            setDecisionNote('');
                                          }}
                                        >
                                          {item.status === 'pending' ? 'Review & Decide' : 'View Details'}
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Detail & Decision Modal */}
                      {decisionModalItem && (
                        <div
                          className="admin-modal-overlay"
                          style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(15, 23, 42, 0.65)',
                            backdropFilter: 'blur(3px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                            padding: '20px'
                          }}
                        >
                          <div
                            className="admin-modal-content"
                            style={{
                              backgroundColor: '#fff',
                              borderRadius: '12px',
                              maxWidth: '680px',
                              width: '100%',
                              maxHeight: '90vh',
                              overflowY: 'auto',
                              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                              border: '1px solid #E2E8F0'
                            }}
                          >
                            {/* Modal Header */}
                            <div
                              style={{
                                padding: '18px 24px',
                                borderBottom: '1px solid #E2E8F0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1F3A5F' }}>
                                  Approval Request #{decisionModalItem.id}
                                </h3>
                                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                                  Type: <span style={{ fontWeight: 600 }}>{decisionModalItem.type}</span> • Submitted: {new Date(decisionModalItem.created_at).toLocaleString()}
                                </div>
                              </div>
                              <button
                                type="button"
                                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748B' }}
                                onClick={() => setDecisionModalItem(null)}
                              >
                                ✕
                              </button>
                            </div>

                            {/* Modal Body */}
                            <div style={{ padding: '24px' }}>
                              {/* Status banner */}
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '12px 16px',
                                  borderRadius: '8px',
                                  marginBottom: '20px',
                                  backgroundColor:
                                    decisionModalItem.status === 'approved'
                                      ? '#ECFDF5'
                                      : decisionModalItem.status === 'rejected'
                                      ? '#FEF2F2'
                                      : '#FFFBEB',
                                  border: `1px solid ${
                                    decisionModalItem.status === 'approved'
                                      ? '#A7F3D0'
                                      : decisionModalItem.status === 'rejected'
                                      ? '#FECACA'
                                      : '#FDE68A'
                                  }`
                                }}
                              >
                                <div>
                                  <span style={{ fontWeight: 700, fontSize: '13px' }}>Current Status: </span>
                                  <span
                                    className={`status-tag ${
                                      decisionModalItem.status === 'approved'
                                        ? 'active'
                                        : decisionModalItem.status === 'rejected'
                                        ? 'danger'
                                        : 'pending'
                                    }`}
                                  >
                                    {decisionModalItem.status.toUpperCase()}
                                  </span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748B' }}>
                                  Requester: <span style={{ fontWeight: 600, color: '#1F3A5F' }}>{decisionModalItem.requester_name}</span>
                                </div>
                              </div>

                              {/* Reason Box */}
                              <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                                  REASON PROVIDED BY REQUESTER
                                </label>
                                <div
                                  style={{
                                    padding: '14px',
                                    borderRadius: '8px',
                                    backgroundColor: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    fontSize: '13px',
                                    color: '#1E293B',
                                    lineHeight: '1.5'
                                  }}
                                >
                                  {decisionModalItem.reason}
                                </div>
                              </div>

                              {/* Proposed Changes Diff View */}
                              <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                                  PAYLOAD &amp; PROPOSED CHANGES
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                  <div
                                    style={{
                                      backgroundColor: '#F8FAFC',
                                      border: '1px solid #E2E8F0',
                                      borderRadius: '8px',
                                      padding: '12px'
                                    }}
                                  >
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '6px' }}>
                                      CURRENT / OLD VALUE
                                    </div>
                                    <pre
                                      style={{
                                        margin: 0,
                                        fontSize: '11px',
                                        color: '#334155',
                                        maxHeight: '160px',
                                        overflow: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-all'
                                      }}
                                    >
                                      {decisionModalItem.old_value_json
                                        ? JSON.stringify(decisionModalItem.old_value_json, null, 2)
                                        : 'None / Not Applicable'}
                                    </pre>
                                  </div>

                                  <div
                                    style={{
                                      backgroundColor: '#F0FDF4',
                                      border: '1px solid #BBF7D0',
                                      borderRadius: '8px',
                                      padding: '12px'
                                    }}
                                  >
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', marginBottom: '6px' }}>
                                      REQUESTED / NEW VALUE
                                    </div>
                                    <pre
                                      style={{
                                        margin: 0,
                                        fontSize: '11px',
                                        color: '#14532D',
                                        maxHeight: '160px',
                                        overflow: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-all'
                                      }}
                                    >
                                      {decisionModalItem.new_value_json
                                        ? JSON.stringify(decisionModalItem.new_value_json, null, 2)
                                        : 'None'}
                                    </pre>
                                  </div>
                                </div>
                              </div>

                              {/* If already decided */}
                              {decisionModalItem.status !== 'pending' && (
                                <div
                                  style={{
                                    padding: '14px',
                                    borderRadius: '8px',
                                    backgroundColor: '#F1F5F9',
                                    border: '1px solid #CBD5E1',
                                    marginBottom: '10px'
                                  }}
                                >
                                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B' }}>
                                    Decision Record
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                                    Processed by: <strong>{decisionModalItem.decider_name || 'Administrator'}</strong> on{' '}
                                    {decisionModalItem.decided_at ? new Date(decisionModalItem.decided_at).toLocaleString() : 'N/A'}
                                  </div>
                                  {decisionModalItem.decision_note && (
                                    <div style={{ fontSize: '12px', color: '#1E293B', marginTop: '6px' }}>
                                      Remark: <em>"{decisionModalItem.decision_note}"</em>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* If Pending: Decision Controls */}
                              {decisionModalItem.status === 'pending' && (
                                <div style={{ marginTop: '16px', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                    Executive Decision Note / Remarks:
                                  </label>
                                  <textarea
                                    className="form-control"
                                    rows={3}
                                    placeholder="Enter administrative comments or reason for approval/rejection..."
                                    value={decisionNote}
                                    onChange={(e) => setDecisionNote(e.target.value)}
                                    style={{ width: '100%', marginBottom: '16px' }}
                                  />

                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                    <button
                                      type="button"
                                      className="btn-secondary"
                                      onClick={() => setDecisionModalItem(null)}
                                      disabled={decidingApproval}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-danger"
                                      onClick={() => {
                                        setDecisionAction('reject');
                                        setTimeout(() => handleDecideApproval(), 0);
                                      }}
                                      disabled={decidingApproval}
                                      style={{ backgroundColor: '#DC2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                      {decidingApproval && decisionAction === 'reject' ? 'Rejecting...' : '❌ Reject Request'}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-primary"
                                      onClick={() => {
                                        setDecisionAction('approve');
                                        setTimeout(() => handleDecideApproval(), 0);
                                      }}
                                      disabled={decidingApproval}
                                      style={{ backgroundColor: '#16A34A', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                                    >
                                      {decidingApproval && decisionAction === 'approve' ? 'Approving...' : '✅ Approve & Execute'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {resultsTab === 'lifecycle' && <AdminAcademicLifecycle />}
                </div>
              )}

              {/* ========================================================================= */}
              {/* PAGE 11: FINANCE & FEES (PACKAGE 1) */}
              {/* ========================================================================= */}
              {activePage === 'finance_fees' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Admin</span> / <span>Finance &amp; Fee Management</span>
                      </div>
                      <h2 className="page-title">Institutional Finance, Invoices &amp; Collections</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={openNewInvoiceModal}
                      >
                        + Generate Invoice
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setRecordPaymentModalOpen(true)}
                        style={{ backgroundColor: '#16A34A', borderColor: '#15803D' }}
                      >
                        💳 Record Payment (Cashier)
                      </button>
                    </div>
                  </div>

                  {/* Subtabs Bar */}
                  <div className="admin-subtabs-bar">
                    <button
                      className={`admin-subtab-btn ${financeTab === 'overview' ? 'active' : ''}`}
                      onClick={() => setFinanceTab('overview')}
                    >
                      <span>Financial Overview &amp; Analytics</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${financeTab === 'invoices' ? 'active' : ''}`}
                      onClick={() => {
                        setFinanceTab('invoices');
                        loadInvoices();
                      }}
                    >
                      <span>Invoices Management</span>
                      <span className="badge-pill">{invoicesTotal}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${financeTab === 'payments' ? 'active' : ''}`}
                      onClick={() => {
                        setFinanceTab('payments');
                        loadPayments();
                      }}
                    >
                      <span>Payment Transactions &amp; Cashier</span>
                      <span className="badge-pill">{paymentsTotal}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${financeTab === 'structures' ? 'active' : ''}`}
                      onClick={() => {
                        setFinanceTab('structures');
                        loadFeeStructures();
                        loadFeeCategories();
                      }}
                    >
                      <span>Fee Structures &amp; Categories</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${financeTab === 'scholarships' ? 'active' : ''}`}
                      onClick={() => {
                        setFinanceTab('scholarships');
                        loadScholarships();
                      }}
                    >
                      <span>Scholarships &amp; Waivers</span>
                    </button>
                  </div>

                  {/* SUBTAB 1: FINANCIAL OVERVIEW */}
                  {financeTab === 'overview' && (
                    <div>
                      {financeLoading && (
                        <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '10px' }}>
                          🔄 Refreshing financial data and metrics...
                        </div>
                      )}
                      {/* Metric cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <div className="admin-card" style={{ borderLeft: '4px solid #2563EB' }}>
                          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Total Invoiced</div>
                          <div style={{ fontSize: '26px', fontWeight: 800, color: '#1F3A5F', margin: '4px 0' }}>
                            ETB {Number(financeOverview?.totalInvoiced || dashData?.finance?.totalInvoiced || 0).toLocaleString()}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Gross institutional receivables</div>
                        </div>

                        <div className="admin-card" style={{ borderLeft: '4px solid #16A34A' }}>
                          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Total Collected (Cash In)</div>
                          <div style={{ fontSize: '26px', fontWeight: 800, color: '#16A34A', margin: '4px 0' }}>
                            ETB {Number(financeOverview?.totalCollected || dashData?.finance?.totalCollected || 0).toLocaleString()}
                          </div>
                          <div style={{ fontSize: '11px', color: '#16A34A', fontWeight: 600 }}>
                            {financeOverview?.collectionRate ?? 0}% overall collection rate
                          </div>
                        </div>

                        <div className="admin-card" style={{ borderLeft: '4px solid #DC2626' }}>
                          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Outstanding Balance</div>
                          <div style={{ fontSize: '26px', fontWeight: 800, color: '#DC2626', margin: '4px 0' }}>
                            ETB {Number(financeOverview?.outstandingBalance || dashData?.finance?.outstandingBalance || 0).toLocaleString()}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>Pending student fee arrears</div>
                        </div>

                        <div className="admin-card" style={{ borderLeft: '4px solid #D97706' }}>
                          <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Collection Efficiency</div>
                          <div style={{ fontSize: '26px', fontWeight: 800, color: '#D97706', margin: '4px 0' }}>
                            {financeOverview?.collectionRate ?? 0}%
                          </div>
                          <div style={{ marginTop: '6px', height: '6px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${financeOverview?.collectionRate ?? 0}%`,
                                height: '100%',
                                backgroundColor: '#16A34A'
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Analytics breakdown grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                        {/* Breakdown by Payment Method */}
                        <div className="admin-card">
                          <div className="admin-card-header">
                            <h4 className="admin-card-title">📱 Collections by Channel &amp; Method</h4>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {(financeOverview?.byMethod && financeOverview.byMethod.length > 0) ? (
                              financeOverview.byMethod.map((m: any) => (
                                <div
                                  key={m.method}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    backgroundColor: '#F8FAFC',
                                    border: '1px solid #E2E8F0'
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 700, textTransform: 'capitalize', color: '#1F3A5F' }}>
                                      {m.method.replace('_', ' ')}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                                      {m.count} confirmed transaction{m.count === 1 ? '' : 's'}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontWeight: 800, fontSize: '15px', color: '#16A34A' }}>
                                      ETB {Number(m.total).toLocaleString()}
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div style={{ color: '#64748B', textAlign: 'center', padding: '16px' }}>No payment channel data yet.</div>
                            )}
                          </div>
                        </div>

                        {/* Breakdown by Invoices Status */}
                        <div className="admin-card">
                          <div className="admin-card-header">
                            <h4 className="admin-card-title">🧾 Invoices by Settlement Status</h4>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {(financeOverview?.byStatus && financeOverview.byStatus.length > 0) ? (
                              financeOverview.byStatus.map((s: any) => {
                                const badgeColor =
                                  s.status === 'paid' ? '#16A34A' : s.status === 'partially_paid' ? '#D97706' : s.status === 'void' ? '#64748B' : '#2563EB';
                                return (
                                  <div
                                    key={s.status}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      padding: '10px 14px',
                                      borderRadius: '8px',
                                      backgroundColor: '#F8FAFC',
                                      border: '1px solid #E2E8F0'
                                    }}
                                  >
                                    <div>
                                      <span
                                        style={{
                                          display: 'inline-block',
                                          padding: '2px 8px',
                                          borderRadius: '10px',
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          backgroundColor: `${badgeColor}15`,
                                          color: badgeColor
                                        }}
                                      >
                                        {s.status.toUpperCase()}
                                      </span>
                                      <span style={{ fontSize: '12px', color: '#64748B', marginLeft: '8px' }}>
                                        {s.count} invoice{s.count === 1 ? '' : 's'}
                                      </span>
                                    </div>
                                    <div style={{ fontWeight: 800, fontSize: '15px', color: '#1F3A5F' }}>
                                      ETB {Number(s.total).toLocaleString()}
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div style={{ color: '#64748B', textAlign: 'center', padding: '16px' }}>No invoice status data yet.</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Recent Collections Table */}
                      <div className="admin-card">
                        <div className="admin-card-header">
                          <h4 className="admin-card-title">🕒 Recent Payment Collections</h4>
                        </div>
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Receipt No</th>
                                <th>Student</th>
                                <th>Amount</th>
                                <th>Payment Method</th>
                                <th>Reference</th>
                                <th>Date</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(financeOverview?.recentPayments || []).map((p: any) => (
                                <tr key={p.id}>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{p.receipt_no}</td>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{p.student_name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>{p.admission_no}</div>
                                  </td>
                                  <td style={{ fontWeight: 800, color: '#16A34A' }}>
                                    ETB {Number(p.amount).toLocaleString()}
                                  </td>
                                  <td style={{ textTransform: 'capitalize' }}>{p.method}</td>
                                  <td style={{ fontSize: '12px', color: '#64748B' }}>{p.reference || 'N/A'}</td>
                                  <td>{p.received_at ? new Date(p.received_at).toLocaleDateString() : 'N/A'}</td>
                                  <td>
                                    <span className="status-tag active">{p.status}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBTAB 2: INVOICES MANAGEMENT */}
                  {financeTab === 'invoices' && (
                    <div>
                      {/* Filter Toolbar */}
                      <div className="admin-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Search by invoice # or student..."
                            value={invoicesSearch}
                            onChange={(e) => setInvoicesSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') loadInvoices(1, invoicesStatusFilter, invoicesSearch);
                            }}
                            style={{ width: '250px' }}
                          />
                          <select
                            className="form-control"
                            style={{ width: '160px' }}
                            value={invoicesStatusFilter}
                            onChange={(e) => {
                              const s = e.target.value;
                              setInvoicesStatusFilter(s);
                              loadInvoices(1, s, invoicesSearch);
                            }}
                          >
                            <option value="all">All Invoices</option>
                            <option value="issued">Issued / Unpaid</option>
                            <option value="partially_paid">Partially Paid</option>
                            <option value="paid">Paid</option>
                            <option value="void">Void</option>
                          </select>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => loadInvoices(1, invoicesStatusFilter, invoicesSearch)}
                          >
                            Search
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={exportInvoices}
                          >
                            📥 Export CSV
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={openNewInvoiceModal}
                        >
                          + Generate New Invoice
                        </button>
                      </div>

                      {/* Invoices Table */}
                      <div className="admin-card">
                        <div className="admin-card-header">
                          <div>
                            <h4 className="admin-card-title">📑 Invoices Registry</h4>
                            <div className="admin-card-subtitle">
                              Showing {invoicesList.length} of {invoicesTotal} invoices
                            </div>
                          </div>
                        </div>

                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Invoice #</th>
                                <th>Student</th>
                                <th>Class &amp; Year</th>
                                <th>Due Date</th>
                                <th>Total</th>
                                <th>Paid</th>
                                <th>Balance</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {invoicesList.map((inv: any) => (
                                <tr key={inv.id}>
                                  <td>
                                    <div style={{ fontWeight: 700, color: '#1F3A5F' }}>{inv.invoice_no}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                                      {inv.issue_date ? new Date(inv.issue_date).toLocaleDateString() : ''}
                                    </div>
                                  </td>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{inv.student_name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>{inv.admission_no}</div>
                                  </td>
                                  <td>
                                    <div>{inv.grade_name} - {inv.section_name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>{inv.academic_year_name}</div>
                                  </td>
                                  <td>
                                    <span style={{ fontSize: '12px' }}>
                                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'N/A'}
                                    </span>
                                  </td>
                                  <td style={{ fontWeight: 700 }}>ETB {Number(inv.total_amount).toLocaleString()}</td>
                                  <td style={{ fontWeight: 700, color: '#16A34A' }}>
                                    ETB {Number(inv.paid_amount).toLocaleString()}
                                  </td>
                                  <td style={{ fontWeight: 800, color: inv.balance > 0 ? '#DC2626' : '#16A34A' }}>
                                    ETB {Number(inv.balance).toLocaleString()}
                                  </td>
                                  <td>
                                    <span
                                      className={`status-tag ${
                                        inv.status === 'paid'
                                          ? 'active'
                                          : inv.status === 'partially_paid'
                                          ? 'pending'
                                          : inv.status === 'void'
                                          ? 'danger'
                                          : 'inactive'
                                      }`}
                                    >
                                      {inv.status.toUpperCase()}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                      <button
                                        type="button"
                                        className="btn-secondary btn-sm"
                                        onClick={async () => {
                                          try {
                                            const detail = await api.getInvoiceById(inv.id);
                                            setInvoiceDetailModal(detail);
                                          } catch (err: any) {
                                            setActionMessage({ text: 'Error fetching invoice detail: ' + err.message, type: 'error' });
                                          }
                                        }}
                                      >
                                        Details
                                      </button>
                                      {inv.status !== 'void' && inv.status !== 'paid' && (
                                        <button
                                          type="button"
                                          className="btn-primary btn-sm"
                                          onClick={() => {
                                            setRecPayStudentId(inv.student_id);
                                            setRecPayInvoiceId(inv.id);
                                            setRecPayAmount(inv.balance);
                                            setRecordPaymentModalOpen(true);
                                          }}
                                          style={{ backgroundColor: '#16A34A', borderColor: '#15803D' }}
                                        >
                                          Pay
                                        </button>
                                      )}
                                      {inv.status !== 'void' && (
                                        <button
                                          type="button"
                                          className="btn-danger btn-sm"
                                          onClick={() => handleVoidInvoice(inv.id)}
                                          style={{ backgroundColor: '#EF4444', color: '#fff', border: 'none' }}
                                        >
                                          Void
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBTAB 3: PAYMENTS & CASHIER */}
                  {financeTab === 'payments' && (
                    <div>
                      {/* Filter Toolbar */}
                      <div className="admin-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Search receipt #, reference, student..."
                            value={paymentsSearch}
                            onChange={(e) => setPaymentsSearch(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') loadPayments(1, paymentsMethodFilter, paymentsSearch);
                            }}
                            style={{ width: '270px' }}
                          />
                          <select
                            className="form-control"
                            style={{ width: '160px' }}
                            value={paymentsMethodFilter}
                            onChange={(e) => {
                              const m = e.target.value;
                              setPaymentsMethodFilter(m);
                              loadPayments(1, m, paymentsSearch);
                            }}
                          >
                            <option value="all">All Channels</option>
                            <option value="telebirr">Telebirr</option>
                            <option value="cbe_birr">CBE Birr</option>
                            <option value="cash">Cash</option>
                            <option value="bank_transfer">Bank Transfer</option>
                          </select>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => loadPayments(1, paymentsMethodFilter, paymentsSearch)}
                          >
                            Filter
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={exportPayments}
                          >
                            📥 Export CSV
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => setRecordPaymentModalOpen(true)}
                          style={{ backgroundColor: '#16A34A', borderColor: '#15803D' }}
                        >
                          💳 Record New Payment
                        </button>
                      </div>

                      {/* Payments Table */}
                      <div className="admin-card">
                        <div className="admin-card-header">
                          <div>
                            <h4 className="admin-card-title">💵 Collections Ledger &amp; Cashier Receipts</h4>
                            <div className="admin-card-subtitle">
                              Showing {paymentsList.length} of {paymentsTotal} transactions
                            </div>
                          </div>
                        </div>

                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Receipt #</th>
                                <th>Student</th>
                                <th>Amount</th>
                                <th>Payment Method</th>
                                <th>Reference</th>
                                <th>Payer Name</th>
                                <th>Received By</th>
                                <th>Date</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paymentsList.map((p: any) => (
                                <tr key={p.id}>
                                  <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{p.receipt_no}</td>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{p.student_name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>{p.admission_no}</div>
                                  </td>
                                  <td style={{ fontWeight: 800, color: '#16A34A', fontSize: '14px' }}>
                                    ETB {Number(p.amount).toLocaleString()}
                                  </td>
                                  <td>
                                    <span
                                      style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: '10px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        backgroundColor:
                                          p.method === 'telebirr'
                                            ? '#EDE9FE'
                                            : p.method === 'cbe_birr'
                                            ? '#FEE2E2'
                                            : p.method === 'cash'
                                            ? '#DCFCE7'
                                            : '#DBEAFE',
                                        color:
                                          p.method === 'telebirr'
                                            ? '#6D28D9'
                                            : p.method === 'cbe_birr'
                                            ? '#B91C1C'
                                            : p.method === 'cash'
                                            ? '#15803D'
                                            : '#1D4ED8'
                                      }}
                                    >
                                      {p.method.toUpperCase().replace('_', ' ')}
                                    </span>
                                  </td>
                                  <td style={{ fontSize: '12px', color: '#475569' }}>{p.reference || '—'}</td>
                                  <td style={{ fontSize: '12px' }}>{p.payer_name || 'Self / Guardian'}</td>
                                  <td style={{ fontSize: '12px', color: '#64748B' }}>{p.cashier_username || 'Admin'}</td>
                                  <td>{p.received_at ? new Date(p.received_at).toLocaleDateString() : 'N/A'}</td>
                                  <td style={{ textAlign: 'right' }}>
                                    <button
                                      type="button"
                                      className="btn-secondary btn-sm"
                                      onClick={() => setPaymentReceiptModal(p)}
                                    >
                                      Receipt
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

                  {/* SUBTAB 4: FEE STRUCTURES & CATEGORIES */}
                  {financeTab === 'structures' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
                      {/* Fee Structures */}
                      <div className="admin-card">
                        <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h4 className="admin-card-title">🏛️ Active Grade-Level Fee Schedules</h4>
                          <button
                            type="button"
                            className="btn-primary btn-sm"
                            onClick={() => setNewFeeStructModalOpen(true)}
                          >
                            + Add Schedule
                          </button>
                        </div>
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Category</th>
                                <th>Grade</th>
                                <th>Amount</th>
                                <th>Academic Year</th>
                              </tr>
                            </thead>
                            <tbody>
                              {feeStructuresList.map((fs: any) => (
                                <tr key={fs.id}>
                                  <td style={{ fontWeight: 600 }}>{fs.category_name}</td>
                                  <td>{fs.grade_name || 'All Grades'}</td>
                                  <td style={{ fontWeight: 700, color: '#16A34A' }}>
                                    ETB {Number(fs.amount).toLocaleString()}
                                  </td>
                                  <td style={{ fontSize: '12px', color: '#64748B' }}>{fs.academic_year_name || 'Current'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Fee Categories */}
                      <div className="admin-card">
                        <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <button type="button" className="btn-primary btn-sm" onClick={() => setNewFeeCategoryModalOpen(true)}>+ Add Category</button>
                          <h4 className="admin-card-title">🏷️ Registered Fee Categories</h4>
                        </div>
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Category Name</th>
                                <th>Code</th>
                                <th>Type</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {feeCategoriesList.map((fc: any) => (
                                <tr key={fc.id}>
                                  <td style={{ fontWeight: 600 }}>{fc.name}</td>
                                  <td><code>{fc.code}</code></td>
                                  <td>{fc.is_recurring ? 'Recurring / Periodic' : 'One-time Fee'}</td>
                                  <td>
                                    <span className="status-tag active">{fc.status}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUBTAB 5: SCHOLARSHIPS & WAIVERS */}
                  {financeTab === 'scholarships' && (
                    <div>
                      <div className="admin-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>
                            Fee Concessions, Need-Based Aid &amp; Academic Scholarships
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => setNewWaiverModalOpen(true)}
                        >
                          + Award New Fee Waiver
                        </button>
                      </div>

                      <div className="admin-card">
                        <div className="admin-table-container">
                          <table className="admin-table">
                            <thead>
                              <tr>
                                <th>Student</th>
                                <th>Category</th>
                                <th>Award Type</th>
                                <th>Concession Value</th>
                                <th>Reason</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scholarshipsList.map((sc: any) => (
                                <tr key={sc.id}>
                                  <td>
                                    <div style={{ fontWeight: 600 }}>{sc.student_name}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>{sc.admission_no}</div>
                                  </td>
                                  <td>{sc.category_name || 'All Categories'}</td>
                                  <td style={{ textTransform: 'capitalize' }}>{sc.award_type.replace('_', ' ')}</td>
                                  <td style={{ fontWeight: 700, color: '#2563EB' }}>
                                    {sc.award_type === 'percentage' ? `${sc.value}% Off` : `ETB ${Number(sc.value).toLocaleString()}`}
                                  </td>
                                  <td style={{ fontSize: '12px', color: '#475569' }}>{sc.reason}</td>
                                  <td>
                                    <span className="status-tag active">{sc.status}</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MODAL 1: GENERATE INVOICE */}
                  {newInvoiceModalOpen && (
                    <div className="admin-modal-overlay">
                      <div className="admin-modal-content" style={{ maxWidth: '620px' }}>
                        <div className="modal-header">
                          <h3>Generate Student Fee Invoice</h3>
                          <button type="button" onClick={() => setNewInvoiceModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCreateInvoice} style={{ padding: '20px' }}>
                          <div className="form-group" style={{ marginBottom: '14px' }}>
                            <label>Select Student *</label>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                              <input className="form-control" value={invoiceStudentSearch} onChange={(e) => setInvoiceStudentSearch(e.target.value)} placeholder="Search active students by name or admission no." />
                              <button type="button" className="btn-secondary btn-sm" onClick={() => void loadInvoiceStudentOptions(invoiceStudentSearch)}>Find</button>
                            </div>
                            <select
                              className="form-control"
                              value={newInvStudentId}
                              onChange={(e) => setNewInvStudentId(Number(e.target.value) || '')}
                              required
                            >
                              <option value="">-- Choose student --</option>
                              {invoiceStudentOptions.map((s: any) => (
                                <option key={s.id} value={s.id}>
                                  {s.admission_no} - {s.first_name} {s.father_name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: '14px' }}>
                            <label>Due Date *</label>
                            <input
                              type="date"
                              className="form-control"
                              value={newInvDueDate}
                              onChange={(e) => setNewInvDueDate(e.target.value)}
                              required
                            />
                          </div>

                          <div style={{ marginBottom: '14px' }}>
                            <label style={{ fontWeight: 600, display: 'block', marginBottom: '6px' }}>Invoice Line Items</label>
                            {newInvItems.map((item, idx) => (
                              <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) minmax(130px, 1fr) 76px 100px 40px', gap: '8px', marginBottom: '8px' }}>
                                <select
                                  className="form-control"
                                  value={item.fee_category_id || ''}
                                  required
                                  onChange={(e) => {
                                    const updated = [...newInvItems];
                                    updated[idx].fee_category_id = Number(e.target.value);
                                    setNewInvItems(updated);
                                  }}
                                >
                                  <option value="">Select fee category</option>
                                  {feeCategoriesList.map((fc: any) => (
                                    <option key={fc.id} value={fc.id}>{fc.name}</option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  className="form-control"
                                  placeholder="Description"
                                  maxLength={255}
                                  required
                                  value={item.description}
                                  onChange={(e) => {
                                    const updated = [...newInvItems];
                                    updated[idx].description = e.target.value;
                                    setNewInvItems(updated);
                                  }}
                                />
                                <input
                                  type="number"
                                  className="form-control"
                                  placeholder="Qty"
                                  min={1}
                                  step={1}
                                  required
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const updated = [...newInvItems];
                                    updated[idx].quantity = Number(e.target.value) || 0;
                                    setNewInvItems(updated);
                                  }}
                                />
                                <input
                                  type="number"
                                  className="form-control"
                                  placeholder="Amount"
                                  min={0.01}
                                  step="0.01"
                                  required
                                  value={item.unit_amount}
                                  onChange={(e) => {
                                    const updated = [...newInvItems];
                                    updated[idx].unit_amount = Number(e.target.value) || 0;
                                    setNewInvItems(updated);
                                  }}
                                />
                                <button type="button" className="btn-secondary btn-sm" aria-label="Remove invoice line item" title="Remove line item" disabled={newInvItems.length === 1} onClick={() => setNewInvItems(newInvItems.filter((_, itemIndex) => itemIndex !== idx))}>×</button>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => setNewInvItems([...newInvItems, { fee_category_id: Number(feeCategoriesList[0]?.id) || 0, description: '', quantity: 1, unit_amount: 0 }])}
                            >
                              + Add Line Item
                            </button>
                          </div>

                          <div className="form-group" style={{ marginBottom: '16px' }}>
                            <label>Notes / Remarks (Optional)</label>
                            <textarea
                              className="form-control"
                              rows={2}
                              value={newInvNotes}
                              onChange={(e) => setNewInvNotes(e.target.value)}
                            />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setNewInvoiceModalOpen(false)}>
                              Cancel
                            </button>
                            <button type="submit" className="btn-primary" disabled={submittingFinance}>
                              {submittingFinance ? 'Generating...' : 'Generate Invoice'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* MODAL 2: RECORD PAYMENT (CASHIER) */}
                  {recordPaymentModalOpen && (
                    <div className="admin-modal-overlay">
                      <div className="admin-modal-content" style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                          <h3>Record Student Payment (Cashier)</h3>
                          <button type="button" onClick={() => setRecordPaymentModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleRecordPayment} style={{ padding: '20px' }}>
                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Student *</label>
                            <select
                              className="form-control"
                              value={recPayStudentId}
                              onChange={(e) => setRecPayStudentId(Number(e.target.value) || '')}
                              required
                            >
                              <option value="">-- Select paying student --</option>
                              {invoiceStudentOptions.map((s: any) => (
                                <option key={s.id} value={s.id}>
                                  {s.admission_no} - {s.first_name} {s.father_name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Amount (ETB) *</label>
                            <input
                              type="number"
                              className="form-control"
                              value={recPayAmount}
                              onChange={(e) => setRecPayAmount(Number(e.target.value) || '')}
                              required
                            />
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Payment Channel / Method *</label>
                            <select
                              className="form-control"
                              value={recPayMethod}
                              onChange={(e) => setRecPayMethod(e.target.value)}
                              required
                            >
                              <option value="telebirr">Telebirr Mobile Payment</option>
                              <option value="cbe_birr">CBE Birr</option>
                              <option value="cash">Cash Over Counter</option>
                              <option value="bank_transfer">Direct Bank Transfer</option>
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Transaction Reference / Slip #</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="e.g. TB-2026-993881"
                              value={recPayReference}
                              onChange={(e) => setRecPayReference(e.target.value)}
                            />
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Payer Name (Guardian / Self)</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Name of person making payment"
                              value={recPayPayerName}
                              onChange={(e) => setRecPayPayerName(e.target.value)}
                            />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setRecordPaymentModalOpen(false)}>
                              Cancel
                            </button>
                            <button type="submit" className="btn-primary" style={{ backgroundColor: '#16A34A', borderColor: '#15803D' }} disabled={submittingFinance}>
                              {submittingFinance ? 'Recording...' : 'Post Payment'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* MODAL 3: INVOICE DETAIL & ALLOCATIONS */}
                  {invoiceDetailModal && (
                    <div className="admin-modal-overlay">
                      <div className="admin-modal-content" style={{ maxWidth: '640px' }}>
                        <div className="modal-header">
                          <h3>Invoice {invoiceDetailModal.invoice_no}</h3>
                          <button type="button" onClick={() => setInvoiceDetailModal(null)}>✕</button>
                        </div>
                        <div style={{ padding: '24px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
                            <div>
                              <div style={{ fontSize: '11px', color: '#64748B' }}>STUDENT</div>
                              <div style={{ fontWeight: 700, fontSize: '14px' }}>{invoiceDetailModal.student_name}</div>
                              <div style={{ fontSize: '12px', color: '#64748B' }}>{invoiceDetailModal.admission_no}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '11px', color: '#64748B' }}>DUE DATE</div>
                              <div style={{ fontWeight: 700 }}>
                                {invoiceDetailModal.due_date ? new Date(invoiceDetailModal.due_date).toLocaleDateString() : 'N/A'}
                              </div>
                              <span className="status-tag active">{invoiceDetailModal.status.toUpperCase()}</span>
                            </div>
                          </div>

                          <h5 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>Line Items</h5>
                          <table className="admin-table" style={{ marginBottom: '16px' }}>
                            <thead>
                              <tr>
                                <th>Item</th>
                                <th>Qty</th>
                                <th>Unit Price</th>
                                <th style={{ textAlign: 'right' }}>Line Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(invoiceDetailModal.items || []).map((it: any) => (
                                <tr key={it.id}>
                                  <td>{it.description}</td>
                                  <td>{it.quantity}</td>
                                  <td>ETB {Number(it.unit_amount).toLocaleString()}</td>
                                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                    ETB {Number(it.line_total).toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', padding: '12px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                            <div>Total: <strong>ETB {Number(invoiceDetailModal.total_amount).toLocaleString()}</strong></div>
                            <div>Paid: <strong style={{ color: '#16A34A' }}>ETB {Number(invoiceDetailModal.paid_amount).toLocaleString()}</strong></div>
                            <div>Balance: <strong style={{ color: '#DC2626' }}>ETB {Number(invoiceDetailModal.balance).toLocaleString()}</strong></div>
                          </div>

                          <div style={{ marginTop: '20px', textAlign: 'right' }}>
                            <button type="button" className="btn-secondary" onClick={() => setInvoiceDetailModal(null)}>
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MODAL 4: PAYMENT RECEIPT VIEW */}
                  {paymentReceiptModal && (
                    <div className="admin-modal-overlay">
                      <div className="admin-modal-content" style={{ maxWidth: '480px' }}>
                        <div className="modal-header">
                          <h3>Official Fee Receipt</h3>
                          <button type="button" onClick={() => setPaymentReceiptModal(null)}>✕</button>
                        </div>
                        <div style={{ padding: '24px', backgroundColor: '#FAFBFD' }}>
                          <div style={{ textAlign: 'center', marginBottom: '16px', borderBottom: '1px dashed #CBD5E1', paddingBottom: '12px' }}>
                            <h4 style={{ margin: 0, color: '#1F3A5F' }}>Ketema Nigus Secondary School</h4>
                            <div style={{ fontSize: '11px', color: '#64748B' }}>Ministry of Education • Addis Ababa, Ethiopia</div>
                            <div style={{ fontWeight: 800, fontSize: '18px', color: '#16A34A', marginTop: '8px' }}>
                              RECEIPT #{paymentReceiptModal.receipt_no}
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', marginBottom: '16px' }}>
                            <div>Student:</div>
                            <div style={{ fontWeight: 600 }}>{paymentReceiptModal.student_name}</div>
                            <div>Admission No:</div>
                            <div>{paymentReceiptModal.admission_no}</div>
                            <div>Payment Method:</div>
                            <div style={{ textTransform: 'capitalize' }}>{paymentReceiptModal.method}</div>
                            <div>Reference:</div>
                            <div>{paymentReceiptModal.reference || 'N/A'}</div>
                            <div>Date:</div>
                            <div>{new Date(paymentReceiptModal.received_at || paymentReceiptModal.created_at).toLocaleString()}</div>
                          </div>

                          <div style={{ borderTop: '2px solid #1F3A5F', borderBottom: '2px solid #1F3A5F', padding: '12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0' }}>
                            <span style={{ fontWeight: 700 }}>AMOUNT RECEIVED:</span>
                            <span style={{ fontSize: '20px', fontWeight: 800, color: '#16A34A' }}>
                              ETB {Number(paymentReceiptModal.amount).toLocaleString()}
                            </span>
                          </div>

                          <div style={{ textAlign: 'center', fontSize: '11px', color: '#64748B', marginTop: '12px' }}>
                            This is an official computer-generated receipt from the Ketema Nigus ERP system.
                          </div>

                          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setPaymentReceiptModal(null)}>
                              Close
                            </button>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => {
                                window.print();
                              }}
                            >
                              🖨️ Print Receipt
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MODAL 5: NEW FEE STRUCTURE */}
                  {newFeeStructModalOpen && (
                    <div className="admin-modal-overlay">
                      <div className="admin-modal-content" style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                          <h3>Configure Fee Schedule</h3>
                          <button type="button" onClick={() => setNewFeeStructModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCreateFeeStructure} style={{ padding: '20px' }}>
                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Academic Year</label>
                            <select
                              className="form-control"
                              value={newFeeStructYearId}
                              onChange={(e) => setNewFeeStructYearId(Number(e.target.value) || '')}
                            >
                              <option value="">Current Academic Year</option>
                              {academicStructure?.academicYears?.map((y: any) => (
                                <option key={y.id} value={y.id}>{y.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Grade Level (Optional - Universal if blank)</label>
                            <select
                              className="form-control"
                              value={newFeeStructGradeId}
                              onChange={(e) => setNewFeeStructGradeId(Number(e.target.value) || '')}
                            >
                              <option value="">All Grades (Universal)</option>
                              {academicStructure?.grades?.map((g: any) => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Fee Category *</label>
                            <select
                              className="form-control"
                              value={newFeeStructCatId}
                              onChange={(e) => setNewFeeStructCatId(Number(e.target.value) || '')}
                              required
                            >
                              <option value="">Select a fee category</option>
                              {feeCategoriesList.map((fc: any) => (
                                <option key={fc.id} value={fc.id}>{fc.name} ({fc.code})</option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Amount (ETB) *</label>
                            <input
                              type="number"
                              className="form-control"
                              min={0.01}
                              step="0.01"
                              value={newFeeStructAmount}
                              onChange={(e) => setNewFeeStructAmount(Number(e.target.value) || '')}
                              required
                            />
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Due Date (Optional)</label>
                            <input
                              type="date"
                              className="form-control"
                              value={newFeeStructDueDate}
                              onChange={(e) => setNewFeeStructDueDate(e.target.value)}
                            />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setNewFeeStructModalOpen(false)}>
                              Cancel
                            </button>
                            <button type="submit" className="btn-primary" disabled={submittingFinance}>
                              {submittingFinance ? 'Saving...' : 'Save Structure'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}

                  {/* MODAL 6: NEW SCHOLARSHIP WAIVER */}
                  {newWaiverModalOpen && (
                    <div className="admin-modal-overlay">
                      <div className="admin-modal-content" style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                          <h3>Award Fee Concession / Scholarship</h3>
                          <button type="button" onClick={() => setNewWaiverModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCreateWaiver} style={{ padding: '20px' }}>
                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Student *</label>
                            <select
                              className="form-control"
                              value={newWaiverStudentId}
                              onChange={(e) => setNewWaiverStudentId(Number(e.target.value) || '')}
                              required
                            >
                              <option value="">-- Select student --</option>
                              {invoiceStudentOptions.map((s: any) => (
                                <option key={s.id} value={s.id}>
                                  {s.admission_no} - {s.first_name} {s.father_name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Fee Category (Optional)</label>
                            <select
                              className="form-control"
                              value={newWaiverCatId}
                              onChange={(e) => setNewWaiverCatId(Number(e.target.value) || '')}
                            >
                              <option value="">All Categories / General Tuition</option>
                              {feeCategoriesList.map((fc: any) => (
                                <option key={fc.id} value={fc.id}>{fc.name} ({fc.code})</option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Award Type *</label>
                            <select
                              className="form-control"
                              value={newWaiverType}
                              onChange={(e) => setNewWaiverType(e.target.value as any)}
                              required
                            >
                              <option value="percentage">Percentage Discount (% Off)</option>
                              <option value="fixed_amount">Fixed Amount Deduction (ETB)</option>
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Value ({newWaiverType === 'percentage' ? '%' : 'ETB'}) *</label>
                            <input
                              type="number"
                              className="form-control"
                              value={newWaiverValue}
                              onChange={(e) => setNewWaiverValue(Number(e.target.value) || '')}
                              required
                            />
                          </div>

                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label>Justification / Reason *</label>
                            <textarea
                              className="form-control"
                              rows={2}
                              placeholder="Academic excellence, economic hardship, sibling concession..."
                              value={newWaiverReason}
                              onChange={(e) => setNewWaiverReason(e.target.value)}
                              required
                            />
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                            <button type="button" className="btn-secondary" onClick={() => setNewWaiverModalOpen(false)}>
                              Cancel
                            </button>
                            <button type="submit" className="btn-primary" disabled={submittingFinance}>
                              {submittingFinance ? 'Granting...' : 'Grant Waiver'}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                  {newFeeCategoryModalOpen && (
                    <div className="admin-modal-overlay">
                      <div className="admin-modal-content" style={{ maxWidth: 480 }}>
                        <div className="modal-header">
                          <h3>Create Fee Category</h3>
                          <button type="button" onClick={() => setNewFeeCategoryModalOpen(false)}>✕</button>
                        </div>
                        <form onSubmit={handleCreateFeeCategory} style={{ padding: 20 }}>
                          <div className="form-group" style={{ marginBottom: 12 }}>
                            <label>Category Code *</label>
                            <input className="form-control" value={newFeeCategoryCode} onChange={(e) => setNewFeeCategoryCode(e.target.value)} maxLength={40} required />
                          </div>
                          <div className="form-group" style={{ marginBottom: 12 }}>
                            <label>Category Name *</label>
                            <input className="form-control" value={newFeeCategoryName} onChange={(e) => setNewFeeCategoryName(e.target.value)} maxLength={100} required />
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={newFeeCategoryRecurring} onChange={(e) => setNewFeeCategoryRecurring(e.target.checked)} />
                            Recurring fee
                          </label>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                            <button type="button" className="btn-secondary" onClick={() => setNewFeeCategoryModalOpen(false)}>Cancel</button>
                            <button type="submit" className="btn-primary">Create Category</button>
                          </div>
                        </form>
                      </div>
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
                          onClick={exportAuditLogs}
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
                <div key={systemSettings.map((s) => `${s.setting_key}:${s.version}`).join('|')}>
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

                  {settingsFeedback && <div role="status" aria-live="polite" style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: '8px', color: settingsFeedback.type === 'success' ? '#166534' : '#991B1B', background: settingsFeedback.type === 'success' ? '#DCFCE7' : '#FEE2E2', border: `1px solid ${settingsFeedback.type === 'success' ? '#86EFAC' : '#FCA5A5'}` }}>{settingsFeedback.text}</div>}
                  {settingsSavingKey && <div role="status" aria-live="polite" style={{ margin: '0 0 14px', color: '#475569', fontSize: '13px' }}>Saving {settingsSavingKey}…</div>}

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
                    <button
                      className={`admin-subtab-btn ${settingsCategory === 'backups' ? 'active' : ''}`}
                      onClick={() => {
                        setSettingsCategory('backups');
                        void loadBackups();
                      }}
                    >
                      <span>💾 Backups &amp; Disaster Recovery</span>
                      <span className="badge-pill">{backupsList.length}</span>
                    </button>
                    <button
                      className={`admin-subtab-btn ${settingsCategory === 'recycle_bin' ? 'active' : ''}`}
                      onClick={() => {
                        setSettingsCategory('recycle_bin');
                        void loadRecycleBin();
                      }}
                    >
                      <span>🗑️ Recycle Bin</span>
                      {recycleBinTotal > 0 && <span className="badge-pill" style={{ background: '#E74C3C' }}>{recycleBinTotal}</span>}
                    </button>
                    <button
                      className={`admin-subtab-btn ${settingsCategory === 'system_health' ? 'active' : ''}`}
                      onClick={() => {
                        setSettingsCategory('system_health');
                        void loadDiagnostics();
                      }}
                    >
                      <span>🩺 System Health &amp; Diagnostics</span>
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
                            placeholder='Value (text or JSON, e.g. "Learning for Excellence")'
                            value={customVal}
                            onChange={(e) => setCustomVal(e.target.value)}
                            style={{ flex: 1, minWidth: '200px', height: '34px', padding: '0 10px', fontSize: '13px', border: '1px solid #CBD5E1', borderRadius: '6px' }}
                          />
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => {
                              if (!customKey.trim()) return;
                              const rawValue = customVal.trim();
                              let val: any = rawValue;
                              if (rawValue) {
                                try { val = JSON.parse(rawValue); } catch { /* Treat unquoted input as a plain text setting. */ }
                              }
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
                                const valStr = typeof s.value_json === 'string' ? s.value_json : JSON.stringify(s.value_json);
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
                                            try { finalVal = JSON.parse(input.value); } catch { /* Keep plain text as a string. */ }
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

                  {/* CATEGORY 7: BACKUPS & DISASTER RECOVERY (PACKAGE 5) */}
                  {settingsCategory === 'backups' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {/* BACKUP GENERATION CARD */}
                      <div className="admin-card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Create New Database Backup</h3>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B' }}>
                              Export a full transactional snapshot of all tables with SHA-256 integrity checksum.
                            </p>
                          </div>
                          <button
                            className="btn-primary"
                            onClick={handleCreateBackup}
                            disabled={creatingBackup}
                          >
                            {creatingBackup ? 'Generating Snapshot...' : '💾 Generate Backup Now'}
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginTop: '16px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                              Backup Type
                            </label>
                            <select
                              value={backupType}
                              onChange={(e) => setBackupType(e.target.value as any)}
                              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                            >
                              <option value="manual">Manual Snapshot (On-Demand)</option>
                              <option value="pre_close">Pre-Year-End Close Snapshot</option>
                              <option value="scheduled">Scheduled Routine Backup</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                              Notes / Purpose (Optional)
                            </label>
                            <input
                              type="text"
                              value={backupNotes}
                              onChange={(e) => setBackupNotes(e.target.value)}
                              placeholder="e.g., Prior to 2018 E.C. Semester 2 final marks submission"
                              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* BACKUPS REPOSITORY TABLE */}
                      <div className="admin-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Backup Archives Repository</h3>
                            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                              {backupsList.length} total backup snapshots stored securely on server storage
                            </div>
                          </div>
                          <button
                            className="btn-secondary btn-sm"
                            onClick={loadBackups}
                            disabled={backupsLoading}
                          >
                            🔄 Refresh List
                          </button>
                        </div>

                        {backupsLoading ? (
                          <div style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>Loading archives...</div>
                        ) : backupsList.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '40px', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
                            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
                            <div style={{ fontWeight: 600, color: '#334155' }}>No backup archives found</div>
                            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>Click "Generate Backup Now" above to create your first snapshot.</div>
                          </div>
                        ) : (
                          <div className="table-responsive">
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th>ID</th>
                                  <th>Archive File</th>
                                  <th>Type</th>
                                  <th>Records</th>
                                  <th>Size</th>
                                  <th>Date &amp; Time</th>
                                  <th>Integrity (SHA-256)</th>
                                  <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {backupsList.map((b) => (
                                  <tr key={b.id}>
                                    <td style={{ fontWeight: 600 }}>#{b.id}</td>
                                    <td>
                                      <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '13px' }}>{b.file_name}</div>
                                      {b.notes && <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>{b.notes}</div>}
                                    </td>
                                    <td>
                                      <span className="badge-pill" style={{
                                        background: b.type === 'pre_close' ? '#FEF3C7' : b.type === 'scheduled' ? '#E0E7FF' : '#F1F5F9',
                                        color: b.type === 'pre_close' ? '#92400E' : b.type === 'scheduled' ? '#3730A3' : '#475569'
                                      }}>
                                        {b.type}
                                      </span>
                                    </td>
                                    <td style={{ fontSize: '13px' }}>{b.total_records ? b.total_records.toLocaleString() : '-'}</td>
                                    <td style={{ fontSize: '13px' }}>
                                      {b.file_size ? `${(b.file_size / 1024).toFixed(1)} KB` : '-'}
                                    </td>
                                    <td style={{ fontSize: '12px', color: '#64748B' }}>
                                      {b.created_at ? new Date(b.created_at).toLocaleString() : '-'}
                                    </td>
                                    <td>
                                      {b.checksum ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <span style={{ fontFamily: 'monospace', fontSize: '11px', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                                            {b.checksum.slice(0, 10)}...
                                          </span>
                                          <button
                                            className="btn-secondary btn-sm"
                                            style={{ padding: '2px 6px', fontSize: '10px' }}
                                            onClick={() => handleVerifyChecksum(b.id)}
                                            title="Verify checksum matches current file on disk"
                                          >
                                            Verify
                                          </button>
                                        </div>
                                      ) : (
                                        <span style={{ color: '#94A3B8', fontSize: '12px' }}>None</span>
                                      )}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                        <a
                                          href={`http://localhost:5000/api/v1/admin/backups/${b.id}/download`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="btn-secondary btn-sm"
                                          download
                                          style={{ textDecoration: 'none' }}
                                        >
                                          ⬇️ Download
                                        </a>
                                        <button
                                          className="btn-primary btn-sm"
                                          style={{ background: '#D97706', borderColor: '#D97706' }}
                                          onClick={() => {
                                            setRestoreModalBackup(b);
                                            setRestoreConfirmWord('');
                                            setRestorePassword('');
                                          }}
                                        >
                                          🔄 Restore
                                        </button>
                                        <button
                                          className="btn-danger btn-sm"
                                          onClick={() => handleDeleteBackup(b.id)}
                                        >
                                          🗑️ Delete
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* RESTORE CONFIRMATION MODAL */}
                      {restoreModalBackup && (
                        <div style={{
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'rgba(15, 23, 42, 0.75)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 9999,
                          padding: '16px'
                        }}>
                          <div style={{
                            background: '#FFFFFF',
                            borderRadius: '12px',
                            maxWidth: '520px',
                            width: '100%',
                            padding: '24px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#B45309', marginBottom: '12px' }}>
                              <span style={{ fontSize: '28px' }}>⚠️</span>
                              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                                Confirm Database Restore
                              </h3>
                            </div>
                            <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E', padding: '12px', borderRadius: '8px', fontSize: '13px', lineHeight: 1.5, marginBottom: '16px' }}>
                              <strong>DANGER:</strong> Restoring backup <strong>#{restoreModalBackup.id} ({restoreModalBackup.file_name})</strong> will replace all database tables with this archive snapshot. Any data written after this snapshot was created will be lost.
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                                Type <strong>RESTORE</strong> in uppercase to confirm:
                              </label>
                              <input
                                type="text"
                                value={restoreConfirmWord}
                                onChange={(e) => setRestoreConfirmWord(e.target.value)}
                                placeholder="RESTORE"
                                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px', fontFamily: 'monospace' }}
                              />
                            </div>

                            <div style={{ marginBottom: '20px' }}>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                                Administrator Password:
                              </label>
                              <input
                                type="password"
                                value={restorePassword}
                                onChange={(e) => setRestorePassword(e.target.value)}
                                placeholder="Enter your current password"
                                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px' }}
                              />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                              <button
                                className="btn-secondary"
                                onClick={() => setRestoreModalBackup(null)}
                                disabled={restoringBackup}
                              >
                                Cancel
                              </button>
                              <button
                                className="btn-primary"
                                style={{ background: '#DC2626', borderColor: '#DC2626' }}
                                onClick={handleRestoreBackupSubmit}
                                disabled={restoringBackup || restoreConfirmWord !== 'RESTORE' || !restorePassword}
                              >
                                {restoringBackup ? 'Restoring Database...' : '🚨 Confirm & Execute Restore'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* CATEGORY 8: RECYCLE BIN (PACKAGE 5) */}
                  {settingsCategory === 'recycle_bin' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div className="admin-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Soft-Deleted Records &amp; Recycle Bin</h3>
                            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>
                              Records deleted from students, staff, academic structure, or announcements are retained here for 30 days before permanent deletion.
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              className="btn-danger btn-sm"
                              onClick={handlePurgeAllExpired}
                            >
                              🧹 Purge All Expired
                            </button>
                            <button
                              className="btn-secondary btn-sm"
                              onClick={() => loadRecycleBin()}
                              disabled={recycleBinLoading}
                            >
                              🔄 Refresh
                            </button>
                          </div>
                        </div>

                        {/* FILTER BAR */}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '16px', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Filter by Entity:</span>
                          <select
                            value={recycleBinEntityType}
                            onChange={(e) => {
                              setRecycleBinEntityType(e.target.value);
                              loadRecycleBin(e.target.value, 1);
                            }}
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                          >
                            <option value="">All Entities ({recycleBinTotal})</option>
                            <option value="students">Students</option>
                            <option value="staff">Staff / Faculty</option>
                            <option value="sections">Class Sections</option>
                            <option value="subjects">Curriculum Subjects</option>
                            <option value="announcements">Announcements</option>
                          </select>
                        </div>
                      </div>

                      {/* RECYCLE BIN TABLE */}
                      <div className="admin-card">
                        {recycleBinLoading ? (
                          <div style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>Loading recycle bin...</div>
                        ) : recycleBinItems.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '40px', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
                            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗑️</div>
                            <div style={{ fontWeight: 600, color: '#334155' }}>Recycle Bin is Empty</div>
                            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>No soft-deleted records currently pending retention or purge.</div>
                          </div>
                        ) : (
                          <div className="table-responsive">
                            <table className="admin-table">
                              <thead>
                                <tr>
                                  <th>Entity Type</th>
                                  <th>ID</th>
                                  <th>Record Summary</th>
                                  <th>Deleted At</th>
                                  <th>Deleted By</th>
                                  <th>Days Left</th>
                                  <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {recycleBinItems.map((item) => (
                                  <tr key={`${item.entityType}-${item.id}`}>
                                    <td>
                                      <span className="badge-pill" style={{ textTransform: 'capitalize', background: '#F1F5F9', color: '#334155' }}>
                                        {item.entityType}
                                      </span>
                                    </td>
                                    <td style={{ fontWeight: 600 }}>#{item.id}</td>
                                    <td style={{ fontWeight: 600, color: '#1E293B' }}>
                                      {item.label || item.name || item.title || `Item #${item.id}`}
                                    </td>
                                    <td style={{ fontSize: '12px', color: '#64748B' }}>
                                      {item.deleted_at ? new Date(item.deleted_at).toLocaleString() : '-'}
                                    </td>
                                    <td style={{ fontSize: '12px' }}>
                                      {item.deleted_by_username || item.deleted_by || 'Admin'}
                                    </td>
                                    <td>
                                      <span className="badge-pill" style={{
                                        background: (item.daysRemaining ?? 30) < 5 ? '#FEE2E2' : '#FEF3C7',
                                        color: (item.daysRemaining ?? 30) < 5 ? '#991B1B' : '#92400E'
                                      }}>
                                        {item.daysRemaining !== undefined ? `${item.daysRemaining} days` : '30 days'}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                        <button
                                          className="btn-primary btn-sm"
                                          onClick={() => handleRestoreRecycleItem(item.entityType, item.id)}
                                        >
                                          ♻️ Restore
                                        </button>
                                        <button
                                          className="btn-danger btn-sm"
                                          onClick={() => {
                                            setPurgeConfirmItem(item);
                                            setPurgePassword('');
                                          }}
                                        >
                                          💥 Purge
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* PURGE ITEM MODAL */}
                      {purgeConfirmItem && (
                        <div style={{
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'rgba(15, 23, 42, 0.75)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          zIndex: 9999,
                          padding: '16px'
                        }}>
                          <div style={{
                            background: '#FFFFFF',
                            borderRadius: '12px',
                            maxWidth: '480px',
                            width: '100%',
                            padding: '24px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#DC2626', marginBottom: '12px' }}>
                              <span style={{ fontSize: '28px' }}>💥</span>
                              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                                Permanent Record Purge
                              </h3>
                            </div>
                            <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.5, marginBottom: '16px' }}>
                              Are you sure you want to permanently purge <strong>{purgeConfirmItem.entityType} #{purgeConfirmItem.id} ({purgeConfirmItem.label || purgeConfirmItem.name || purgeConfirmItem.title || 'Record'})</strong>? This record will be permanently deleted from the database and cannot be recovered.
                            </p>

                            <div style={{ marginBottom: '20px' }}>
                              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                                Administrator Password Required:
                              </label>
                              <input
                                type="password"
                                value={purgePassword}
                                onChange={(e) => setPurgePassword(e.target.value)}
                                placeholder="Enter administrator password"
                                style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '14px' }}
                              />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                              <button
                                className="btn-secondary"
                                onClick={() => setPurgeConfirmItem(null)}
                                disabled={purgingItem}
                              >
                                Cancel
                              </button>
                              <button
                                className="btn-danger"
                                onClick={handlePurgeRecycleItem}
                                disabled={purgingItem || !purgePassword}
                              >
                                {purgingItem ? 'Purging...' : 'Permanently Delete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* CATEGORY 9: SYSTEM HEALTH & DIAGNOSTICS (PACKAGE 5) */}
                  {settingsCategory === 'system_health' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div className="admin-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Live System Health &amp; Runtime Telemetry</h3>
                            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>
                              Real-time monitoring of Node.js engine, MySQL database latency, memory footprint, and storage allocations.
                            </div>
                          </div>
                          <button
                            className="btn-primary"
                            onClick={loadDiagnostics}
                            disabled={diagnosticsLoading}
                          >
                            {diagnosticsLoading ? 'Running Check...' : '🩺 Run Live Health Check'}
                          </button>
                        </div>
                      </div>

                      {diagnosticsLoading ? (
                        <div style={{ textAlign: 'center', padding: '48px', color: '#64748B' }}>Running comprehensive diagnostics...</div>
                      ) : diagnosticsData ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                          {/* CARD 1: DATABASE ENGINE */}
                          <div className="admin-card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                              <span style={{ fontSize: '20px' }}>🗄️</span>
                              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>MySQL Database Engine</h4>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                                <span style={{ color: '#64748B' }}>Connectivity Status</span>
                                <span className="badge-pill" style={{ background: '#DCFCE7', color: '#166534', fontWeight: 600 }}>
                                  ● {diagnosticsData.database?.status || 'Connected'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                                <span style={{ color: '#64748B' }}>Query Latency (Ping)</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{diagnosticsData.database?.latencyMs ?? '—'} ms</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                                <span style={{ color: '#64748B' }}>Database Name</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{diagnosticsData.database?.databaseName || 'Unavailable'}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                                <span style={{ color: '#64748B' }}>Total Database Size</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{Number(diagnosticsData.storage?.dbSizeMb ?? 0).toLocaleString()} MB</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748B' }}>Active DB Connections</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{diagnosticsData.database?.threadsConnected ?? 0} / {diagnosticsData.database?.maxConnections ?? 0}</span>
                              </div>
                            </div>
                          </div>

                          {/* CARD 2: SERVER RUNTIME */}
                          <div className="admin-card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                              <span style={{ fontSize: '20px' }}>⚡</span>
                              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Node.js Server Runtime</h4>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                                <span style={{ color: '#64748B' }}>Node Version</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{diagnosticsData.system?.nodeVersion || 'Unavailable'}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                                <span style={{ color: '#64748B' }}>Environment</span>
                                <span className="badge-pill" style={{ background: '#E0E7FF', color: '#3730A3' }}>
                                  {diagnosticsData.app?.environment || 'Unavailable'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                                <span style={{ color: '#64748B' }}>Uptime</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{formatElapsedSeconds(diagnosticsData.system?.processUptimeSeconds)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                                <span style={{ color: '#64748B' }}>Memory RSS</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{diagnosticsData.system?.memoryUsageMb?.rss ?? '—'} MB</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748B' }}>Heap Allocated / Used</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>
                                  {diagnosticsData.system?.memoryUsageMb?.heapUsed ?? '—'} / {diagnosticsData.system?.memoryUsageMb?.heapTotal ?? '—'} MB
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* CARD 3: APPLICATION STORAGE & ARCHIVES */}
                          <div className="admin-card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                              <span style={{ fontSize: '20px' }}>📦</span>
                              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Storage &amp; Backup Volume</h4>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                                <span style={{ color: '#64748B' }}>Total Backups Stored</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{diagnosticsData.storage?.backupCount ?? 0} files</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                                <span style={{ color: '#64748B' }}>Backup Storage Used</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{diagnosticsData.storage?.backupStorageMb ?? 0} MB</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '6px' }}>
                                <span style={{ color: '#64748B' }}>Recycle Bin Soft-Deletes</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{recycleBinTotal} items</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748B' }}>Application Status</span>
                                <span className="badge-pill" style={{ background: '#DCFCE7', color: '#166534', fontWeight: 600 }}>
                                  ● Operational
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '40px', background: '#F8FAFC', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
                          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🩺</div>
                          <div style={{ fontWeight: 600, color: '#334155' }}>Telemetry Ready</div>
                          <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>Click "Run Live Health Check" above to query real-time performance indicators.</div>
                        </div>
                      )}
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
                          <label>Administrator Photo</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                            {adminProfilePhoto ? <img src={adminProfilePhoto.dataBase64} alt="Selected administrator photo preview" style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: '50%', border: '2px solid #CBD5E1' }} /> : adminProfile?.photo_document_id ? <img crossOrigin="use-credentials" src={api.getAdminProfilePhotoUrl(adminProfile.photo_document_id)} alt="Administrator profile" style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: '50%', border: '2px solid #CBD5E1' }} /> : <div className="user-avatar" style={{ width: 76, height: 76, fontSize: 26 }}>{displayName.charAt(0).toUpperCase()}</div>}
                            <div>
                              <label htmlFor="admin-profile-photo" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>Choose Photo</label>
                              <input id="admin-profile-photo" type="file" accept="image/jpeg,image/png" style={{ display: 'none' }} onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
                                  setActionMessage({ text: 'Choose a JPEG or PNG photo no larger than 5 MB.', type: 'error' });
                                  e.target.value = '';
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = () => {
                                  if (typeof reader.result === 'string') setAdminProfilePhoto({ originalName: file.name, mimeType: file.type, dataBase64: reader.result });
                                  else setActionMessage({ text: 'Could not read the selected photo.', type: 'error' });
                                };
                                reader.onerror = () => setActionMessage({ text: 'Could not read the selected photo.', type: 'error' });
                                reader.readAsDataURL(file);
                              }} />
                              <div style={{ marginTop: 6, fontSize: 12, color: '#64748B' }}>JPEG or PNG, maximum 5 MB. Save profile changes to upload.</div>
                            </div>
                          </div>
                        </div>
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
                          Save Profile Changes
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
                          <label>New Password * (Min 8 Characters, Uppercase, Lowercase &amp; Number)</label>
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

                  {/* TWO-FACTOR AUTHENTICATION CARD */}
                  <div className="admin-card two-factor-card" style={{ marginBottom: '24px' }}>
                    <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 className="admin-card-title">🛡️ Two-Factor Authentication (RFC 6238 TOTP)</h4>
                        <span style={{ fontSize: '12px', color: '#64748B' }}>
                          Time-based One-Time Password verification and emergency recovery codes
                        </span>
                      </div>
                      <span className={`status-tag ${twoFactorEnabled ? 'active' : 'disabled'}`}>
                        {twoFactorEnabled ? '✓ 2FA ACTIVE' : '✕ NOT CONFIGURED'}
                      </span>
                    </div>

                    {twoFactorEnabled ? (
                      <div style={{ padding: '14px 0' }}>
                        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '14px', borderRadius: '8px', color: '#166534', fontSize: '13px', marginBottom: '16px' }}>
                          ✓ <strong>Account Protected:</strong> Time-based one-time password (TOTP) verification is currently active on your account. You will be prompted for an authenticator code or single-use recovery code whenever you sign in.
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ color: '#B91C1C', borderColor: '#FECACA' }}
                          onClick={() => setShowDisable2FaModal(true)}
                        >
                          Disable Two-Factor Authentication
                        </button>
                      </div>
                    ) : !setup2FaData ? (
                      <div style={{ padding: '14px 0' }}>
                        <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: '0 0 16px' }}>
                          Enhance administrative security by binding a standard authenticator app (such as Google Authenticator, Microsoft Authenticator, 1Password, or Authy). 
                          Once enabled, signing in requires both your password and a dynamically generated 6-digit code.
                        </p>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleStart2FASetup}
                          disabled={twoFactorLoading}
                        >
                          {twoFactorLoading ? 'Generating Setup Secret…' : '🔑 Enable Two-Factor Authentication'}
                        </button>
                      </div>
                    ) : (
                      <div style={{ padding: '14px 0' }}>
                        <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '12px 14px', borderRadius: '8px', color: '#1E40AF', fontSize: '13px', marginBottom: '16px' }}>
                          <strong>Step 1:</strong> Enter the setup key below into your authenticator app, or click the direct setup link.
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Manual Entry Secret Key (Base32)</label>
                          <div className="totp-secret-box" style={{ marginTop: '6px' }}>
                            {setup2FaData.secret}
                          </div>
                          <div style={{ marginTop: '8px' }}>
                            <a
                              href={setup2FaData.otpauthUri}
                              className="btn-secondary btn-sm"
                              style={{ display: 'inline-block', textDecoration: 'none' }}
                            >
                              🔗 Open in Compatible Authenticator App
                            </a>
                          </div>
                        </div>

                        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '14px', borderRadius: '8px', color: '#92400E', fontSize: '13px', marginBottom: '16px' }}>
                          <strong>Step 2: Emergency Backup Recovery Codes</strong>
                          <p style={{ margin: '6px 0 10px', fontSize: '12px' }}>
                            Store these 8 emergency recovery codes in a secure password manager or offline location. Each code can be used exactly once if you lose access to your authenticator app.
                          </p>
                          <div className="backup-codes-grid">
                            {setup2FaData.backupCodes.map((code, idx) => (
                              <div key={idx} className="backup-code-item">
                                {code}
                              </div>
                            ))}
                          </div>
                        </div>

                        <form onSubmit={handleVerifyAndEnable2FA} style={{ maxWidth: '420px', marginTop: '16px' }}>
                          <div className="form-field">
                            <label style={{ fontWeight: 700 }}>Step 3: Enter 6-Digit Authenticator Code to Confirm *</label>
                            <input
                              type="text"
                              maxLength={6}
                              placeholder="000000"
                              value={verify2FaCode}
                              onChange={(e) => setVerify2FaCode(e.target.value)}
                              style={{ fontSize: '20px', letterSpacing: '4px', textAlign: 'center', fontWeight: 700 }}
                              required
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => setSetup2FaData(null)}
                            >
                              Cancel Setup
                            </button>
                            <button
                              type="submit"
                              className="btn-primary"
                              disabled={twoFactorLoading || verify2FaCode.trim().length !== 6}
                            >
                              {twoFactorLoading ? 'Verifying…' : 'Verify &amp; Activate 2FA'}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
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
                          onClick={handleSaveNotificationPreferences}
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
              {selectedStudent.photo_document_id && <img crossOrigin="use-credentials" src={api.getAdminStudentPhotoUrl(selectedStudent.id, selectedStudent.photo_document_id)} alt={`${selectedStudent.first_name} ${selectedStudent.father_name}`} style={{ width: 112, height: 112, objectFit: 'cover', borderRadius: 10, marginBottom: 14 }} />}
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
                <label>Temporary Password *</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={resetNewPass}
                  onChange={(e) => setResetNewPass(e.target.value)}
                  required
                />
                <small>The user must change this password at their next sign in.</small>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setResetPassModalUser(null)}>Cancel</button>
            <button className="btn-primary" onClick={handleResetPassword}>Reset Password</button>
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
                    <option value="">Select a role</option>
                    {availableRoles.map((role) => <option key={role.id} value={role.code}>{role.name} ({role.code})</option>)}
                  </select>
                  <small>Select the account role: Administrator, Principal, Teacher, Accountant, etc.</small>
                </div>
                <div className="form-field">
                  <label>Temporary Password *</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    required
                  />
                  <small>Use a strong temporary password. The account holder will be prompted to change it at first sign in.</small>
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
              <h3>{editingSectionId ? 'Edit Class / Section' : 'Create Class / Section'}</h3>
              <button className="modal-close-btn" onClick={() => setNewSecModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateSection}>
              <div className="modal-body">
                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Grade Level (9–12) *</label>
                    <select
                      value={newSecGradeId}
                      onChange={(e) => {
                        const selectedGrade = academicStructure?.grades?.find((grade: any) => String(grade.id) === e.target.value);
                        setNewSecGradeId(e.target.value);
                        setNewSecStream(Number(selectedGrade?.grade_level) >= 11 ? 'natural_science' : 'none');
                      }}
                      required
                      disabled={Boolean(editingSectionId)}
                    >
                      <option value="">Select Grade</option>
                      {academicStructure?.grades?.filter((g: any) => g.is_active).map((g: any) => (
                        <option key={g.id} value={g.id}>{g.display_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Section Name *</label>
                    <input type="text" placeholder="e.g. 11-A" value={newSecName} onChange={(e) => setNewSecName(e.target.value)} required />
                  </div>
                </div>

                <div className="form-field" style={{ marginTop: 12 }}>
                  <label>Academic Year *</label>
                  <select value={newSecYearId} onChange={(e) => setNewSecYearId(e.target.value)} required disabled={Boolean(editingSectionId)}>
                    <option value="">Select Academic Year</option>
                    {academicStructure?.academicYears?.filter((year: any) => year.status !== 'closed').map((year: any) => (
                      <option key={year.id} value={year.id}>{year.name}{year.is_current ? ' (Current)' : ''}</option>
                    ))}
                  </select>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Stream Track *</label>
                    <select
                      value={newSecStream}
                      onChange={(e) => setNewSecStream(e.target.value as any)}
                      disabled={!newSecGradeId}
                      required
                    >
                      {Number(academicStructure?.grades?.find((grade: any) => String(grade.id) === String(newSecGradeId))?.grade_level) >= 11 ? (
                        <>
                          <option value="natural_science">Natural Science</option>
                          <option value="social_science">Social Science</option>
                        </>
                      ) : (
                        <option value="none">Common curriculum</option>
                      )}
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
                <button type="button" className="btn-secondary" onClick={() => { setNewSecModalOpen(false); setEditingSectionId(null); }}>Cancel</button>
                <button type="submit" className="btn-primary">{editingSectionId ? 'Save Section' : 'Create Section'}</button>
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
              <h3>{editingSubjectId ? 'Edit Curriculum Subject' : 'Create Curriculum Subject'}</h3>
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
                <div className="form-field">
                  <label>Description</label>
                  <textarea maxLength={500} rows={3} value={newSubjDescription} onChange={(e) => setNewSubjDescription(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => { setNewSubjModalOpen(false); setEditingSubjectId(null); }}>Cancel</button>
                <button type="submit" className="btn-primary">{editingSubjectId ? 'Save Subject' : 'Add Subject'}</button>
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
                    <select value={mapGradeId} onChange={(e) => {
                      const selected = academicStructure?.grades?.find((g: any) => String(g.id) === e.target.value);
                      setMapGradeId(e.target.value);
                      setMapStream(Number(selected?.grade_level) >= 11 ? 'natural_science' : 'all');
                    }} required>
                      <option value="">Select Grade</option>
                      {academicStructure?.grades?.filter((g: any) => g.is_active).map((g: any) => (
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
                    <select value={mapStream} onChange={(e) => setMapStream(e.target.value as any)} disabled={!mapGradeId}>
                      {Number(academicStructure?.grades?.find((g: any) => String(g.id) === String(mapGradeId))?.grade_level) >= 11 ? <>
                        <option value="natural_science">Natural Science Only</option>
                        <option value="social_science">Social Science Only</option>
                      </> : <option value="all">All / Common Track (Grades 9–10)</option>}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Periods per Week *</label>
                    <input type="number" min={1} max={10} value={mapPeriods} onChange={(e) => setMapPeriods(Number(e.target.value))} required />
                  </div>
                </div>
                <div className="form-field" style={{ marginTop: 12 }}>
                  <label>Academic Year Scope</label>
                  <select value={mapAcademicYearId} onChange={(e) => setMapAcademicYearId(e.target.value)}>
                    <option value="">All academic years</option>
                    {academicStructure?.academicYears?.map((year: any) => (
                      <option key={year.id} value={year.id}>{year.name}</option>
                    ))}
                  </select>
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
                  <select value={assignStaffId} onChange={(e) => { setAssignStaffId(e.target.value); setAssignmentError(''); }} required disabled={loadingAssignmentTeachers}>
                    <option value="">{loadingAssignmentTeachers ? 'Loading active teachers…' : assignmentTeachers.length ? 'Select Teacher' : 'No active teachers found'}</option>
                    {assignmentTeachers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.father_name} ({s.department})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Subject *</label>
                    <select value={assignSubjId} onChange={(e) => { setAssignSubjId(e.target.value); setAssignmentError(''); }} required disabled={!assignSecId}>
                      <option value="">{assignSecId ? getEligibleAssignmentSubjects(assignSecId).length ? 'Select Subject' : 'No active subjects mapped to this section' : 'Select a section first'}</option>
                      {getEligibleAssignmentSubjects(assignSecId).map((s: any) => (
                        <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                      ))}
                    </select>
                    {assignSecId && <button type="button" className="btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => { setShowAssignmentCurriculumMap((shown) => !shown); setAssignmentError(''); }}>
                      {showAssignmentCurriculumMap ? 'Cancel curriculum mapping' : 'Map a subject to this section'}
                    </button>}
                  </div>
                  <div className="form-field">
                    <label>Class &amp; Section *</label>
                    <select value={assignSecId} onChange={(e) => {
                      const selectedId = e.target.value;
                      const section = academicStructure?.sections?.find((item: any) => String(item.id) === selectedId);
                      setAssignSecId(selectedId);
                      setAssignYearId(section?.academic_year_id || '');
                      if (!getEligibleAssignmentSubjects(selectedId).some((subject: any) => String(subject.id) === String(assignSubjId))) setAssignSubjId('');
                      setShowAssignmentCurriculumMap(false);
                      setAssignmentMapSubjectId('');
                      setAssignmentError('');
                    }} required>
                      <option value="">Select Section</option>
                      {(academicStructure?.sections || []).filter((sec: any) => sec.status === 'active'
                        && academicStructure?.grades?.some((grade: any) => Number(grade.id) === Number(sec.grade_id) && Boolean(grade.is_active))
                        && academicStructure?.academicYears?.some((year: any) => Number(year.id) === Number(sec.academic_year_id) && year.status !== 'closed')).map((sec: any) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.grade_name} – {sec.name} ({sec.stream})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label>Academic Year *</label>
                  <select value={assignYearId} onChange={(e) => { setAssignYearId(e.target.value); setAssignmentError(''); }} required disabled={Boolean(assignSecId)}>
                    <option value="">{assignSecId ? 'Academic year is set by the selected section' : 'Select a section first'}</option>
                    {(academicStructure?.academicYears || []).filter((y: any) => y.status !== 'closed' && (!assignSecId || Number(y.id) === Number(assignYearId))).map((y: any) => (
                      <option key={y.id} value={y.id}>{y.name}</option>
                    ))}
                  </select>
                </div>
                {showAssignmentCurriculumMap && assignSecId && <div style={{ marginTop: 14, padding: 14, border: '1px solid #CBD5E1', borderRadius: 8, background: '#F8FAFC' }}>
                  <strong>Curriculum mapping for this section</strong>
                  <p style={{ margin: '6px 0 10px', fontSize: 13, color: '#475569' }}>
                    This subject must be part of the section’s curriculum before a teacher can be assigned. Grade 9–10 mappings use the common curriculum; Grades 11–12 use the section’s stream.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 5, flex: '1 1 220px' }}>Active subject
                      <select value={assignmentMapSubjectId} onChange={(e) => setAssignmentMapSubjectId(e.target.value)}>
                        <option value="">Select subject to map</option>
                        {(academicStructure?.subjects || []).filter((subject: any) => subject.status === 'active' && !subject.deleted_at).map((subject: any) => (
                          <option key={subject.id} value={subject.id}>{subject.code} — {subject.name}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: 'grid', gap: 5, width: 130 }}>Periods per week
                      <input type="number" min={1} max={10} value={assignmentMapPeriods} onChange={(e) => setAssignmentMapPeriods(Number(e.target.value))} />
                    </label>
                    <button type="button" className="btn-primary" onClick={() => void handleMapAssignmentSubject()} disabled={assignmentMapSaving || !assignmentMapSubjectId}>
                      {assignmentMapSaving ? 'Adding…' : 'Add to curriculum'}
                    </button>
                  </div>
                </div>}
                {assignmentError && <div role="alert" style={{ marginTop: 12, padding: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8 }}>{assignmentError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setAssignModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={assignmentSaving || loadingAssignmentTeachers}>{assignmentSaving ? 'Saving…' : 'Confirm Teaching Assignment'}</button>
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
                    maxLength={190}
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
                    maxLength={10000}
                    onChange={(e) => setAnnContent(e.target.value)}
                    required
                  />
                </div>
                {annSubmitError && <div role="alert" style={{ marginTop: 12, padding: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8 }}>{annSubmitError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setAnnModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={annSubmitting}>{annSubmitting ? 'Publishing…' : annStatus === 'draft' ? 'Save Announcement Draft' : 'Publish Announcement'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {staffEditRecord && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Edit Staff Record: {staffEditRecord.first_name} {staffEditRecord.father_name}</h3>
              <button type="button" className="modal-close-btn" onClick={() => setStaffEditRecord(null)}>✕</button>
            </div>
            <form onSubmit={handleSaveStaffEdit}>
              <div className="modal-body">
                <p style={{ color: '#64748B', marginTop: 0 }}>Maintain identity, employment, and contact details for this staff record.</p>
                <div className="form-grid-2">
                  <div className="form-field"><label htmlFor="staff-edit-employee-no">Employee No *</label><input id="staff-edit-employee-no" maxLength={30} required value={staffEditForm.employeeNo} onChange={(e) => setStaffEditForm({ ...staffEditForm, employeeNo: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="staff-edit-type">Staff Category *</label><select id="staff-edit-type" value={staffEditForm.staffType} onChange={(e) => setStaffEditForm({ ...staffEditForm, staffType: e.target.value as typeof staffEditForm.staffType })}><option value="teacher">Teacher</option><option value="administrator">Administrator</option><option value="support">Support</option><option value="librarian">Librarian</option><option value="accountant">Accountant</option><option value="other">Other</option></select></div>
                  <div className="form-field"><label htmlFor="staff-edit-first-name">First Name *</label><input id="staff-edit-first-name" maxLength={60} required value={staffEditForm.firstName} onChange={(e) => setStaffEditForm({ ...staffEditForm, firstName: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="staff-edit-father-name">Father Name *</label><input id="staff-edit-father-name" maxLength={60} required value={staffEditForm.fatherName} onChange={(e) => setStaffEditForm({ ...staffEditForm, fatherName: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="staff-edit-grandfather-name">Grandfather Name</label><input id="staff-edit-grandfather-name" maxLength={60} value={staffEditForm.grandfatherName} onChange={(e) => setStaffEditForm({ ...staffEditForm, grandfatherName: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="staff-edit-gender">Gender *</label><select id="staff-edit-gender" value={staffEditForm.gender} onChange={(e) => setStaffEditForm({ ...staffEditForm, gender: e.target.value as 'female' | 'male' })}><option value="female">Female</option><option value="male">Male</option></select></div>
                  <div className="form-field"><label htmlFor="staff-edit-dob">Date of Birth</label><input id="staff-edit-dob" type="date" value={staffEditForm.dateOfBirth} onChange={(e) => setStaffEditForm({ ...staffEditForm, dateOfBirth: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="staff-edit-hire-date">Hire Date</label><input id="staff-edit-hire-date" type="date" value={staffEditForm.hireDate} onChange={(e) => setStaffEditForm({ ...staffEditForm, hireDate: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="staff-edit-end-date">End Date (employment)</label><input id="staff-edit-end-date" type="date" value={staffEditForm.endDate} min={staffEditForm.hireDate || undefined} onChange={(e) => setStaffEditForm({ ...staffEditForm, endDate: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="staff-edit-phone">Phone</label><input id="staff-edit-phone" type="tel" maxLength={30} value={staffEditForm.phone} onChange={(e) => setStaffEditForm({ ...staffEditForm, phone: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="staff-edit-email">Email</label><input id="staff-edit-email" type="email" maxLength={190} value={staffEditForm.email} onChange={(e) => setStaffEditForm({ ...staffEditForm, email: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="staff-edit-title">Job Title *</label><input id="staff-edit-title" maxLength={100} required value={staffEditForm.jobTitle} onChange={(e) => setStaffEditForm({ ...staffEditForm, jobTitle: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="staff-edit-department">Department</label><input id="staff-edit-department" maxLength={100} value={staffEditForm.department} onChange={(e) => setStaffEditForm({ ...staffEditForm, department: e.target.value })} /></div>
                  <div className="form-field" style={{ gridColumn: '1 / -1' }}><label htmlFor="staff-edit-address">Address</label><input id="staff-edit-address" maxLength={255} value={staffEditForm.address} onChange={(e) => setStaffEditForm({ ...staffEditForm, address: e.target.value })} /></div>
                  <div className="form-field"><label htmlFor="staff-edit-status">Employment Status *</label><select id="staff-edit-status" value={staffEditForm.status} onChange={(e) => setStaffEditForm({ ...staffEditForm, status: e.target.value as 'active' | 'on_leave' | 'terminated' })}><option value="active">Active</option><option value="on_leave">On Leave</option><option value="terminated">Terminated</option></select><small>Termination disables a linked login. Reactivating employment does not restore a disabled login; manage account access in Login Accounts, Roles &amp; Security.</small></div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" disabled={staffEditSaving} onClick={() => setStaffEditRecord(null)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={staffEditSaving}>{staffEditSaving ? 'Saving…' : 'Save Staff Record'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL WITH ADMIN PASSWORD RE-ENTRY */}
      {confirmModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>⚠️ Security Confirmation Required</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setConfirmModalOpen(false);
                  setConfirmPendingAction(null);
                }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={executeConfirmedAction}>
              <div className="modal-body">
                <div style={{ fontWeight: 700, fontSize: '15px', color: '#1F3A5F', marginBottom: '8px' }}>
                  {confirmActionTitle}
                </div>
                <p style={{ color: '#475569', fontSize: '13px', lineHeight: 1.5, margin: '0 0 16px' }}>
                  {confirmActionMessage}
                </p>

                <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: '12px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '12px', color: '#991B1B' }}>
                  🔒 <strong>Authentication Safeguard:</strong> Re-enter your current administrator password to authorize this privileged operation.
                </div>

                <div className="form-field">
                  <label htmlFor="confirm-action-password">Administrator Password *</label>
                  <input
                    id="confirm-action-password"
                    type="password"
                    placeholder="Enter your current password"
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setConfirmModalOpen(false);
                    setConfirmPendingAction(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ background: '#DC2626', borderColor: '#B91C1C' }}>
                  Confirm &amp; Execute
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT QUALIFICATION MODAL */}
      {qualificationModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="qualification-modal-title">
            <div className="modal-header">
              <h3 id="qualification-modal-title">{editingQualificationId ? '✏️ Edit Qualification' : '🎓 Add Qualification'}</h3>
              <button type="button" className="modal-close-btn" aria-label="Cancel" onClick={() => setQualificationModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveQualification}>
              <div className="modal-body">
                {qualificationError && (
                  <div role="alert" style={{ marginBottom: '12px', padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', fontSize: '12px', color: '#991B1B' }}>
                    {qualificationError}
                  </div>
                )}
                <div className="form-grid-2">
                  <div className="form-field">
                    <label>Qualification Level *</label>
                    <select
                      value={qualificationForm.qualificationLevel}
                      onChange={(e) => setQualificationForm({ ...qualificationForm, qualificationLevel: e.target.value })}
                    >
                      <option value="phd">PhD / Doctorate</option>
                      <option value="masters">Master's Degree</option>
                      <option value="bachelors">Bachelor's Degree</option>
                      <option value="diploma">Diploma</option>
                      <option value="certificate">Certificate</option>
                      <option value="high_school">High School</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Award Date</label>
                    <input
                      type="date"
                      max={getLocalDateInputValue()}
                      value={qualificationForm.awardDate}
                      onChange={(e) => setQualificationForm({ ...qualificationForm, awardDate: e.target.value })}
                    />
                  </div>
                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Qualification Title *</label>
                    <input
                      type="text"
                      maxLength={190}
                      placeholder="e.g. BSc in Mathematics"
                      value={qualificationForm.title}
                      onChange={(e) => setQualificationForm({ ...qualificationForm, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Institution *</label>
                    <input
                      type="text"
                      maxLength={190}
                      placeholder="e.g. Haramaya University"
                      value={qualificationForm.institution}
                      onChange={(e) => setQualificationForm({ ...qualificationForm, institution: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Field of Study</label>
                    <input
                      type="text"
                      maxLength={190}
                      placeholder="e.g. Applied Mathematics"
                      value={qualificationForm.fieldOfStudy}
                      onChange={(e) => setQualificationForm({ ...qualificationForm, fieldOfStudy: e.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label>Grade / Class / Result</label>
                    <input
                      type="text"
                      maxLength={60}
                      placeholder="e.g. Very Good or 3.6 GPA"
                      value={qualificationForm.gradeOrClass}
                      onChange={(e) => setQualificationForm({ ...qualificationForm, gradeOrClass: e.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label>Registration / Certificate No</label>
                    <input
                      type="text"
                      maxLength={80}
                      value={qualificationForm.registrationNo}
                      onChange={(e) => setQualificationForm({ ...qualificationForm, registrationNo: e.target.value })}
                    />
                  </div>
                  <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <label>Notes</label>
                    <input
                      type="text"
                      maxLength={500}
                      value={qualificationForm.notes}
                      onChange={(e) => setQualificationForm({ ...qualificationForm, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" disabled={qualificationSaving} onClick={() => setQualificationModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={qualificationSaving}>
                  {qualificationSaving ? 'Saving…' : editingQualificationId ? 'Save Changes' : 'Add Qualification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPLOAD / REPLACE QUALIFICATION DOCUMENT MODAL */}
      {qualificationDocumentTarget && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="qualification-document-title">
            <div className="modal-header">
              <h3 id="qualification-document-title">
                📄 {qualificationDocumentTarget.document_id ? 'Replace' : 'Upload'} Supporting Document
              </h3>
              <button type="button" className="modal-close-btn" aria-label="Cancel" onClick={() => { setQualificationDocumentTarget(null); setQualificationDocument(null); }}>✕</button>
            </div>
            <form onSubmit={handleUploadQualificationDocument}>
              <div className="modal-body">
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#475569' }}>
                  Attach the certificate or transcript for <strong>{qualificationDocumentTarget.title}</strong>.
                  {qualificationDocumentTarget.document_id && ' The current document will be superseded and marked as replaced.'}
                </p>
                <div className="form-field">
                  <label>Document File * (PDF, JPEG, or PNG, max 10 MB)</label>
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => handleQualificationDocumentFile(e.target.files?.[0] || null)}
                  />
                </div>
                {qualificationDocument && (
                  <div style={{ marginTop: '10px', fontSize: '12px', color: '#2A7F62', fontWeight: 600 }}>
                    ✓ Ready to upload: {qualificationDocument.originalName}
                  </div>
                )}
                <div style={{ marginTop: '12px', padding: '10px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', fontSize: '11px', color: '#1E40AF' }}>
                  Uploaded documents start as <strong>pending</strong> and must be verified before they are considered confirmed.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" disabled={qualificationDocumentUploading} onClick={() => { setQualificationDocumentTarget(null); setQualificationDocument(null); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={qualificationDocumentUploading || !qualificationDocument}>
                  {qualificationDocumentUploading ? 'Uploading…' : qualificationDocumentTarget.document_id ? 'Replace Document' : 'Upload Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VERIFY / REJECT QUALIFICATION DOCUMENT MODAL */}
      {qualificationVerifyTarget && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="qualification-verify-title">
            <div className="modal-header">
              <h3 id="qualification-verify-title">✅ Verify Document</h3>
              <button type="button" className="modal-close-btn" aria-label="Cancel" onClick={() => { setQualificationVerifyTarget(null); setQualificationVerifyNote(''); }}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#475569' }}>
                Review <strong>{qualificationVerifyTarget.original_name}</strong> for <strong>{qualificationVerifyTarget.title}</strong>.
                Current status: <strong>{String(qualificationVerifyTarget.verification_status || 'pending').replace('_', ' ')}</strong>.
              </p>
              <div className="form-field">
                <label>Verification Note {qualificationVerifyTarget.verification_status === 'rejected' ? '(required for rejection)' : '(optional)'}</label>
                <input
                  type="text"
                  maxLength={255}
                  placeholder="e.g. Original certificate sighted and returned"
                  value={qualificationVerifyNote}
                  onChange={(e) => setQualificationVerifyNote(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => { setQualificationVerifyTarget(null); setQualificationVerifyNote(''); }}>Cancel</button>
              <button type="button" className="btn-secondary" style={{ color: '#B91C1C' }} onClick={() => void handleVerifyQualificationDocument('rejected')}>Reject</button>
              <button type="button" className="btn-primary" style={{ background: '#16A34A', borderColor: '#15803D' }} onClick={() => void handleVerifyQualificationDocument('verified')}>Mark Verified</button>
            </div>
          </div>
        </div>
      )}

      {/* TEACHER PROFILE DRAWER */}
      {teacherProfileOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setTeacherProfileOpen(false); }}>
          <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="teacher-profile-title" style={{ maxWidth: '860px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 id="teacher-profile-title">
                👨‍🏫 {teacherProfile?.staff ? `${teacherProfile.staff.first_name} ${teacherProfile.staff.father_name}` : 'Teacher Profile'}
              </h3>
              <button type="button" className="modal-close-btn" aria-label="Close teacher profile" onClick={() => setTeacherProfileOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              {teacherProfileLoading && (
                <div style={{ padding: '24px', textAlign: 'center', color: '#64748B' }}>Loading teacher profile…</div>
              )}

              {!teacherProfileLoading && teacherProfile && (
                <>
                  {/* HEADER SUMMARY */}
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', marginBottom: '18px' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#1F3A5F', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800, overflow: 'hidden' }}>
                      {teacherProfile.staff.photo_document_id ? (
                        <img
                          crossOrigin="use-credentials"
                          src={api.getStaffPhotoUrl(Number(teacherProfile.staff.id), teacherProfile.staff.photo_document_id)}
                          alt={`${teacherProfile.staff.first_name} ${teacherProfile.staff.father_name}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        String(teacherProfile.staff.first_name || '?').charAt(0).toUpperCase()
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '16px', color: '#1F3A5F' }}>
                        {teacherProfile.staff.first_name} {teacherProfile.staff.father_name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B' }}>
                        {teacherProfile.staff.job_title} · {teacherProfile.staff.department || 'No department'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                        Employee No: {teacherProfile.staff.employee_no}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                      <span className={`status-tag ${teacherProfile.staff.status}`}>{String(teacherProfile.staff.status || '').replace('_', ' ')}</span>
                      {teacherProfile.staff.linked_username ? (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: teacherProfile.staff.user_account_status === 'active' ? '#2A7F62' : '#B7791F' }}>
                          {teacherProfile.staff.user_account_status === 'active' ? '✓ Login active' : '⏸ Login disabled'} (@{teacherProfile.staff.linked_username})
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#94A3B8' }}>No portal login</span>
                      )}
                      <label className="btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                        {teacherProfile.staff.photo_document_id ? 'Replace Photo' : 'Upload Photo'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          style={{ display: 'none' }}
                          onChange={(e) => handleTeacherProfilePhoto(e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                  </div>

                  {/* EMPLOYMENT DETAILS */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '18px' }}>
                    {[
                      { label: 'Hire Date', value: teacherProfile.staff.hire_date ? String(teacherProfile.staff.hire_date).slice(0, 10) : '—' },
                      { label: 'End Date', value: teacherProfile.staff.end_date ? String(teacherProfile.staff.end_date).slice(0, 10) : '—' },
                      { label: 'Phone', value: teacherProfile.staff.phone || '—' },
                      { label: 'Email', value: teacherProfile.staff.email || '—' },
                      { label: 'Date of Birth', value: teacherProfile.staff.date_of_birth ? String(teacherProfile.staff.date_of_birth).slice(0, 10) : '—' },
                      { label: 'Gender', value: teacherProfile.staff.gender || '—' },
                      { label: 'Address', value: teacherProfile.staff.address || '—' },
                      { label: 'Last Login', value: teacherProfile.staff.last_login_at ? new Date(teacherProfile.staff.last_login_at).toLocaleString() : 'Never' }
                    ].map((item) => (
                      <div key={item.label} style={{ padding: '9px 11px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.04em', color: '#94A3B8', fontWeight: 800 }}>{item.label}</div>
                        <div style={{ fontSize: '12px', color: '#1E293B', marginTop: '2px', wordBreak: 'break-word' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* ATTENDANCE SUMMARY */}
                  <div style={{ marginBottom: '18px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#1F3A5F' }}>Staff Attendance — last 30 days</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                      {[
                        { label: 'Present', value: teacherProfile.attendanceSummary?.present || 0, color: '#2A7F62' },
                        { label: 'Absent', value: teacherProfile.attendanceSummary?.absent || 0, color: '#B91C1C' },
                        { label: 'Late', value: teacherProfile.attendanceSummary?.late || 0, color: '#B7791F' },
                        { label: 'On Leave', value: teacherProfile.attendanceSummary?.on_leave || 0, color: '#2E6DA4' }
                      ].map((item) => (
                        <div key={item.label} style={{ padding: '10px', border: '1px solid #E2E8F0', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: item.color }}>{item.value}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* HOMEROOM DUTIES */}
                  <div style={{ marginBottom: '18px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#1F3A5F' }}>Homeroom Teacher Of</h4>
                    {teacherProfile.homeroom?.length ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {teacherProfile.homeroom.map((h: any) => (
                          <span key={h.id} style={{ padding: '4px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', borderRadius: '14px', fontSize: '11px', fontWeight: 600 }}>
                            {h.grade_name} {h.section_name}{h.academic_year ? ` · ${h.academic_year}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#94A3B8' }}>Not assigned as a homeroom teacher.</div>
                    )}
                  </div>

                  {/* CLASS / SUBJECT ASSIGNMENTS */}
                  <div style={{ marginBottom: '18px' }}>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#1F3A5F' }}>
                      Class &amp; Subject Assignments ({teacherProfile.assignments?.length || 0})
                    </h4>
                    {teacherProfile.assignments?.length ? (
                      <div className="admin-table-container" style={{ border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                        <table className="admin-table" style={{ fontSize: '12px' }}>
                          <thead>
                            <tr>
                              <th>Grade</th>
                              <th>Section</th>
                              <th>Subject</th>
                              <th>Code</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teacherProfile.assignments.map((a: any) => (
                              <tr key={a.id}>
                                <td style={{ fontWeight: 600 }}>{a.grade_name || `Grade ${a.grade_level}`}</td>
                                <td>{a.section_name}</td>
                                <td>{a.subject_name}</td>
                                <td style={{ fontFamily: 'monospace', color: '#2E6DA4' }}>{a.subject_code}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ padding: '12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '12px', color: '#92400E' }}>
                        ⚠ This teacher has no active class or subject assignment. Use <strong>Assign Class</strong> to add one.
                      </div>
                    )}
                  </div>

                  {/* TIMETABLE */}
                  <div>
                    <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: '#1F3A5F' }}>Weekly Timetable ({teacherProfile.timetable?.length || 0} periods)</h4>
                    {teacherProfile.timetable?.length ? (
                      <div className="admin-table-container" style={{ border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                        <table className="admin-table" style={{ fontSize: '12px' }}>
                          <thead>
                            <tr>
                              <th>Day</th>
                              <th>Time</th>
                              <th>Period</th>
                              <th>Class</th>
                              <th>Subject</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teacherProfile.timetable.map((row: any) => (
                              <tr key={row.id}>
                                <td style={{ fontWeight: 600 }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][Number(row.day_of_week) - 1] || row.day_of_week}</td>
                                <td>{String(row.start_time).slice(0, 5)}–{String(row.end_time).slice(0, 5)}</td>
                                <td>{row.slot_label}</td>
                                <td>{row.grade_name} {row.section_name}</td>
                                <td>{row.subject_name}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#94A3B8' }}>No timetable periods scheduled yet.</div>
                    )}
                  </div>

                  {/* QUALIFICATIONS & DOCUMENTS */}
                  <div id="teacher-qualifications-section" style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid #E2E8F0', scrollMarginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <h4 style={{ margin: 0, fontSize: '13px', color: '#1F3A5F' }}>
                        🎓 Qualifications &amp; Documents ({qualifications.length})
                      </h4>
                      <button type="button" className="btn-primary btn-sm" onClick={openNewQualification}>
                        + Add Qualification
                      </button>
                    </div>

                    {qualificationsLoading ? (
                      <div style={{ padding: '14px', textAlign: 'center', color: '#64748B', fontSize: '12px' }}>Loading qualifications…</div>
                    ) : qualifications.length === 0 ? (
                      <div style={{ padding: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px', color: '#64748B' }}>
                        No qualifications recorded yet. Add the teacher's academic credentials and attach supporting documents.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {qualifications.map((q) => (
                          <div key={q.id} style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', background: '#FFFFFF' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: '13px', color: '#1E293B' }}>{q.title}</div>
                                <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                                  {q.institution}
                                  {q.field_of_study ? ` · ${q.field_of_study}` : ''}
                                </div>
                                <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                  <span style={{ textTransform: 'uppercase', fontWeight: 800, letterSpacing: '.03em' }}>
                                    {String(q.qualification_level || '').replace('_', ' ')}
                                  </span>
                                  {q.award_date && <span>Awarded {String(q.award_date).slice(0, 10)}</span>}
                                  {q.grade_or_class && <span>Result: {q.grade_or_class}</span>}
                                  {q.registration_no && <span>Reg. No: {q.registration_no}</span>}
                                </div>
                                {q.notes && <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px' }}>{q.notes}</div>}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                                <button type="button" className="btn-secondary btn-sm" onClick={() => openEditQualification(q)}>Edit</button>
                                <button type="button" className="btn-secondary btn-sm" style={{ color: '#B91C1C' }} onClick={() => handleDeleteQualification(q)}>Remove</button>
                              </div>
                            </div>

                            {/* DOCUMENT ROW */}
                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #E2E8F0', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
                              {q.document_id ? (
                                <div style={{ fontSize: '11px', color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 700 }}>📄 {q.original_name}</span>
                                  <span>{q.mime_type}</span>
                                  <span>{q.size_bytes ? `${Math.max(1, Math.round(Number(q.size_bytes) / 1024))} KB` : ''}</span>
                                  <span className={`status-tag ${q.verification_status === 'verified' ? 'active' : q.verification_status === 'rejected' ? 'terminated' : 'on_leave'}`}>
                                    {String(q.verification_status || 'pending').replace('_', ' ')}
                                  </span>
                                  {q.verified_by_username && (
                                    <span>by @{q.verified_by_username}{q.verified_at ? ` on ${new Date(q.verified_at).toLocaleDateString()}` : ''}</span>
                                  )}
                                  {q.verification_note && <span style={{ color: '#B91C1C' }}>“{q.verification_note}”</span>}
                                </div>
                              ) : (
                                <div style={{ fontSize: '11px', color: '#94A3B8' }}>No supporting document attached.</div>
                              )}

                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn-secondary btn-sm"
                                  onClick={() => { setQualificationDocumentTarget(q); setQualificationDocument(null); }}
                                >
                                  {q.document_id ? 'Replace Document' : 'Upload Document'}
                                </button>
                                {q.document_id && (
                                  <>
                                    <a
                                      className="btn-secondary btn-sm"
                                      href={api.getQualificationDocumentDownloadUrl(Number(teacherProfile.staff.id), Number(q.document_link_id))}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      Download
                                    </a>
                                    <button
                                      type="button"
                                      className="btn-secondary btn-sm"
                                      onClick={() => { setQualificationVerifyTarget(q); setQualificationVerifyNote(q.verification_note || ''); }}
                                    >
                                      Verify
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* AUDIT HISTORY */}
                    {qualificationHistory.length > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        <h4 style={{ margin: '0 0 8px', fontSize: '12px', color: '#1F3A5F' }}>Qualification Change History</h4>
                        <div className="admin-table-container" style={{ border: '1px solid #E2E8F0', borderRadius: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                          <table className="admin-table" style={{ fontSize: '11px' }}>
                            <thead>
                              <tr>
                                <th>When</th>
                                <th>Actor</th>
                                <th>Action</th>
                                <th>Outcome</th>
                                <th>Detail</th>
                              </tr>
                            </thead>
                            <tbody>
                              {qualificationHistory.map((row: any) => (
                                <tr key={row.id}>
                                  <td>{row.occurred_at ? new Date(row.occurred_at).toLocaleString() : '—'}</td>
                                  <td>@{row.actor_username || 'system'}</td>
                                  <td style={{ fontFamily: 'monospace' }}>{String(row.action || '').replace('STAFF_QUALIFICATION_', '')}</td>
                                  <td><span className={`status-tag ${row.outcome === 'success' ? 'active' : 'terminated'}`}>{row.outcome}</span></td>
                                  <td style={{ color: '#64748B' }}>{row.reason || (row.changes ? String(row.changes).slice(0, 90) : '—')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setTeacherProfileOpen(false)}>Close</button>
              {teacherProfile?.staff?.user_id && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleRevokeTeacherSessions(teacherProfile.staff)}
                >
                  Revoke Sessions
                </button>
              )}
              {teacherProfile?.staff && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => { setTeacherProfileOpen(false); openStaffEdit(teacherProfile.staff); }}
                >
                  Edit Teacher Record
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TEACHER OFFBOARDING MODAL */}
      {offboardTeacher && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="offboard-title">
            <div className="modal-header">
              <h3 id="offboard-title">⚠️ Offboard {offboardTeacher.first_name} {offboardTeacher.father_name}</h3>
              <button type="button" className="modal-close-btn" aria-label="Cancel offboarding" onClick={() => setOffboardTeacher(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-field">
                <label>New Employment Status *</label>
                <select value={offboardStatus} onChange={(e) => setOffboardStatus(e.target.value as 'on_leave' | 'terminated')}>
                  <option value="on_leave">On Leave (temporary, keeps the login)</option>
                  <option value="terminated">Terminated (ends employment)</option>
                </select>
              </div>
              {offboardStatus === 'terminated' && (
                <div className="form-field">
                  <label>Effective End Date *</label>
                  <input type="date" value={offboardDate} onChange={(e) => setOffboardDate(e.target.value)} />
                </div>
              )}
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', fontSize: '13px', fontWeight: 600 }}>
                <input type="checkbox" checked={offboardDisableLogin} onChange={(e) => setOffboardDisableLogin(e.target.checked)} />
                Also disable this teacher's portal login
              </label>
              {Number(offboardTeacher.active_assignments_count || 0) > 0 && (
                <div style={{ marginTop: '12px', padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', fontSize: '12px', color: '#92400E' }}>
                  ⚠ This teacher still has <strong>{offboardTeacher.active_assignments_count}</strong> active class assignment(s). Reassign them from <strong>Teaching Assignments &amp; Timetable</strong> so students keep a teacher.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setOffboardTeacher(null)}>Cancel</button>
              <button type="button" className="btn-primary" style={{ background: '#DC2626', borderColor: '#B91C1C' }} onClick={() => void handleOffboardTeacher()}>
                Confirm {offboardStatus === 'on_leave' ? 'Leave' : 'Termination'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEACHER PASSWORD RESET MODAL */}
      {teacherResetTarget && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="teacher-reset-title">
            <div className="modal-header">
              <h3 id="teacher-reset-title">🔑 Reset Password for @{teacherResetTarget.linked_username}</h3>
              <button type="button" className="modal-close-btn" aria-label="Cancel password reset" onClick={() => setTeacherResetTarget(null)}>✕</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void handleResetTeacherPassword(); }}>
              <div className="modal-body">
                <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#475569' }}>
                  Set a new temporary password for <strong>{teacherResetTarget.first_name} {teacherResetTarget.father_name}</strong>.
                </p>
                <div className="form-field">
                  <label>New Temporary Password *</label>
                  <input type="password" autoComplete="new-password" value={teacherResetPassword} onChange={(e) => setTeacherResetPassword(e.target.value)} autoFocus />
                  <small style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: teacherResetPassword && validatePasswordStrength(teacherResetPassword) ? '#B91C1C' : '#64748B' }}>
                    {teacherResetPassword && validatePasswordStrength(teacherResetPassword)
                      ? validatePasswordStrength(teacherResetPassword)
                      : 'At least 8 characters with an uppercase letter, a lowercase letter, and a number.'}
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setTeacherResetTarget(null)}>Cancel</button>
                <button type="submit" className="btn-primary">Reset Password</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GENERIC CONFIRMATION DIALOG (replaces native window.confirm / prompt) */}
      {dialogState && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !dialogWorking) setDialogState(null); }}>
          <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title">
            <div className="modal-header">
              <h3 id="admin-dialog-title">{dialogState.tone === 'danger' ? '⚠️ ' : ''}{dialogState.title}</h3>
              <button
                type="button"
                className="modal-close-btn"
                aria-label="Close dialog"
                disabled={dialogWorking}
                onClick={() => setDialogState(null)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void handleDialogConfirm(); }}>
              <div className="modal-body">
                <p style={{ color: '#475569', fontSize: '13px', lineHeight: 1.5, margin: '0 0 16px' }}>
                  {dialogState.message}
                </p>

                {dialogState.requirePassword && (
                  <div className="form-field">
                    <label htmlFor="admin-dialog-password">Administrator Password *</label>
                    <input
                      id="admin-dialog-password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Confirm with your current password"
                      value={dialogPassword}
                      onChange={(e) => setDialogPassword(e.target.value)}
                      autoFocus
                    />
                  </div>
                )}

                {dialogState.requireReason && (
                  <div className="form-field">
                    <label htmlFor="admin-dialog-reason">{dialogState.reasonLabel} *</label>
                    <input
                      id="admin-dialog-reason"
                      type="text"
                      value={dialogReason}
                      onChange={(e) => setDialogReason(e.target.value)}
                      autoFocus={!dialogState.requirePassword}
                    />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={dialogWorking}
                  onClick={() => setDialogState(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={dialogWorking}
                  style={dialogState.tone === 'danger' ? { background: '#DC2626', borderColor: '#B91C1C' } : undefined}
                >
                  {dialogWorking ? 'Working…' : dialogState.confirmLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISABLE 2FA MODAL */}
      {showDisable2FaModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Disable Two-Factor Authentication</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowDisable2FaModal(false)}>✕</button>
            </div>
            <form onSubmit={handleDisable2FA}>
              <div className="modal-body">
                <p style={{ color: '#64748B', fontSize: '13px', marginTop: 0 }}>
                  Disabling 2FA reduces your account security. An authenticator code will no longer be required at sign-in.
                </p>
                <div className="form-field">
                  <label htmlFor="disable-2fa-pwd">Current Account Password *</label>
                  <input
                    id="disable-2fa-pwd"
                    type="password"
                    placeholder="Enter current password to confirm"
                    value={disable2FaPassword}
                    onChange={(e) => setDisable2FaPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowDisable2FaModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: '#DC2626', borderColor: '#B91C1C' }} disabled={twoFactorLoading}>
                  {twoFactorLoading ? 'Disabling…' : 'Disable 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
