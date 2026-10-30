import { useState, useEffect, useRef, type FormEvent } from 'react';
import { api } from '../api/client';
import '../StakeholderDashboards.css';

const DATE_TODAY = new Date().toISOString().slice(0, 10);
type RegistrarPage =
  | 'overview' | 'admissions' | 'registration' | 'enrollment' | 'students'
  | 'transfers' | 'promotions' | 'guardians' | 'documents' | 'examinations'
  | 'results' | 'attendance' | 'reports' | 'profile';
type RegistrarModuleData = {
  page: RegistrarPage;
  items: any[];
  total: number;
  summary?: Record<string, number>;
};

const registrarPages: Array<{ id: RegistrarPage; icon: string; label: string }> = [
  { id: 'overview', icon: '▦', label: 'Dashboard Overview' },
  { id: 'admissions', icon: '✉', label: 'Admissions & Applications' },
  { id: 'registration', icon: '＋', label: 'Student Registration' },
  { id: 'enrollment', icon: '▤', label: 'Enrollment & Placement' },
  { id: 'students', icon: '♙', label: 'Student Directory' },
  { id: 'transfers', icon: '⇄', label: 'Transfers & Withdrawals' },
  { id: 'promotions', icon: '↑', label: 'Promotion & Graduation' },
  { id: 'guardians', icon: '♧', label: 'Guardians & Contacts' },
  { id: 'documents', icon: '▧', label: 'Student Documents' },
  { id: 'examinations', icon: '◷', label: 'Examination Records' },
  { id: 'results', icon: '▥', label: 'Results & Academic Records' },
  { id: 'attendance', icon: '✓', label: 'Attendance Records' },
  { id: 'reports', icon: '▧', label: 'Reports & Data Quality' },
  { id: 'profile', icon: '👤', label: 'Registrar Profile' }
];

interface RegistrarDashboardProps {
  user: {
    username: string;
    role: string;
    permissions: string[];
    staffName?: string;
  };
  onLogout: () => void;
}

export default function RegistrarDashboard({ user, onLogout }: RegistrarDashboardProps) {
  const [activeTab, setActiveTab] = useState<RegistrarPage>(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/registrar/profile')) {
      return 'profile';
    }
    return 'overview';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Data states
  const [dashData, setDashData] = useState<any>(null);
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [applicantsList, setApplicantsList] = useState<any[]>([]);
  const [admissionsTotal, setAdmissionsTotal] = useState(0);
  const [admissionsLoading, setAdmissionsLoading] = useState(false);
  const [admissionsError, setAdmissionsError] = useState<string | null>(null);
  const [admissionsSearch, setAdmissionsSearch] = useState('');
  const [admissionsStatus, setAdmissionsStatus] = useState('');
  const [admissionsPage, setAdmissionsPage] = useState(1);
  const [applicationModalOpen, setApplicationModalOpen] = useState(false);
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const [applicationForm, setApplicationForm] = useState({
    firstName: '',
    fatherName: '',
    grandfatherName: '',
    gender: 'male' as 'male' | 'female',
    dateOfBirth: '',
    phone: '',
    email: '',
    address: '',
    guardianName: '',
    guardianPhone: '',
    previousSchool: ''
  });
  const [sectionsList, setSectionsList] = useState<any[]>([]);
  const [transfersList, setTransfersList] = useState<any[]>([]);
  const [documentsList, setDocumentsList] = useState<any[]>([]);
  const [moduleData, setModuleData] = useState<RegistrarModuleData | null>(null);
  const [moduleLoading, setModuleLoading] = useState(false);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleStatus, setModuleStatus] = useState('');
  const [moduleSection, setModuleSection] = useState<number | undefined>();
  const [modulePage, setModulePage] = useState(1);
  const moduleRequestId = useRef(0);

  // Search & Filters
  const [studentSearch, setStudentSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState<number | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState('');

  // Register Student Modal
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [regFirstName, setRegFirstName] = useState('');
  const [regFatherName, setRegFatherName] = useState('');
  const [regGrandfatherName, setRegGrandfatherName] = useState('');
  const [regGender, setRegGender] = useState<'male' | 'female'>('male');
  const [regDob, setRegDob] = useState('');
  const [regGradeLevel, setRegGradeLevel] = useState<number | ''>('');
  const [regStream, setRegStream] = useState<'none' | 'natural_science' | 'social_science' | ''>('');
  const [regSectionId, setRegSectionId] = useState(0);
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regPreviousSchool, setRegPreviousSchool] = useState('');
  const [regPhoto, setRegPhoto] = useState<{ originalName: string; mimeType: string; dataBase64: string } | null>(null);
  const [photoReading, setPhotoReading] = useState(false);
  const regPhotoInput = useRef<HTMLInputElement>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<number | undefined>();
  const [regError, setRegError] = useState<string | null>(null);
  const [submittingReg, setSubmittingReg] = useState(false);

  // Reassign Section Modal
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [targetStudent, setTargetStudent] = useState<any>(null);
  const [newTargetSectionId, setNewTargetSectionId] = useState<number>(0);
  const [placementReason, setPlacementReason] = useState('');
  const [submittingReassign, setSubmittingReassign] = useState(false);

  // Transfer Modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferStudentId, setTransferStudentId] = useState<number | ''>('');
  const [transferType, setTransferType] = useState<'transfer' | 'withdrawal'>('transfer');
  const [transferReason, setTransferReason] = useState('');
  const [destinationSchool, setDestinationSchool] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);

  // Registrar Profile State
  const [profileData, setProfileData] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<{ originalName: string; mimeType: string; dataBase64: string } | null>(null);
  const [photoCacheKey, setPhotoCacheKey] = useState<number>(Date.now());
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Reports & Data Quality State (Real MySQL only)
  const [dqSummary, setDqSummary] = useState<{
    students_without_guardians: number;
    guardians_pending_verification: number;
    active_students_without_current_enrollment: number;
    current_assessments_without_finalized_marks: number;
  } | null>(null);
  const [dqLoading, setDqLoading] = useState(false);
  const [dqError, setDqError] = useState<string | null>(null);

  // Registration by Year Chart State
  const [regChartData, setRegChartData] = useState<Array<{ year: string; label: string; count: number; mode: 'calendar' | 'academic' }>>([]);
  const [regChartMode, setRegChartMode] = useState<'calendar' | 'academic'>('calendar');
  const [regChartLoading, setRegChartLoading] = useState(false);
  const [regChartError, setRegChartError] = useState<string | null>(null);
  const [chartHoveredBar, setChartHoveredBar] = useState<{
    year: string | number;
    label?: string;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  // Data Quality Drilldown Modal State
  const [dqModalOpen, setDqModalOpen] = useState(false);
  const [dqIndicator, setDqIndicator] = useState<string>('');
  const [dqModalTitle, setDqModalTitle] = useState<string>('');
  const [dqDetailItems, setDqDetailItems] = useState<any[]>([]);
  const [dqDetailTotal, setDqDetailTotal] = useState(0);
  const [dqDetailPage, setDqDetailPage] = useState(1);
  const [dqDetailLoading, setDqDetailLoading] = useState(false);
  const [dqDetailError, setDqDetailError] = useState<string | null>(null);

  useEffect(() => {
    loadRegistrarData();
    if (activeTab === 'profile') {
      void loadProfile();
    }
    if (activeTab === 'reports') {
      void loadReportsData();
    }
    const onPopState = () => {
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/registrar/profile')) {
        setActiveTab('profile');
        void loadProfile();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openRegisterModal = () => {
    setRegError(null);
    setSelectedApplicationId(undefined);
    setRegFirstName('');
    setRegFatherName('');
    setRegGrandfatherName('');
    setRegGender('male');
    setRegDob('');
    setRegPhone('');
    setRegEmail('');
    setRegAddress('');
    setRegPreviousSchool('');
    setRegPhoto(null);
    if (regPhotoInput.current) regPhotoInput.current.value = '';
    setRegGradeLevel('');
    setRegStream('');
    setRegSectionId(0);
    setRegisterModalOpen(true);
  };

  const beginApplicationRegistration = (application: any) => {
    setRegError(null);
    setSelectedApplicationId(application.id);
    setRegFirstName(application.first_name);
    setRegFatherName(application.father_name);
    setRegGrandfatherName(application.grandfather_name || '');
    setRegGender(application.gender);
    setRegDob(String(application.date_of_birth).slice(0, 10));
    setRegPhone(application.phone || '');
    setRegEmail(application.email || '');
    setRegAddress(application.address || '');
    setRegPreviousSchool(application.previous_school || '');
    setRegPhoto(null);
    if (regPhotoInput.current) regPhotoInput.current.value = '';
    setRegGradeLevel('');
    setRegStream('');
    setRegSectionId(0);
    setRegisterModalOpen(true);
  };

  async function loadRegistrarData() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getRegistrarDashboard();
      setDashData(data);
      if (data.sections && data.sections.length > 0) {
        setRegSectionId(data.sections[0].id);
        setNewTargetSectionId(data.sections[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load registrar data.');
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    try {
      const list = await api.getRegistrarStudents(studentSearch, sectionFilter, statusFilter);
      setStudentsList(list);
    } catch (err: any) {
      setActionMessage({ text: 'Failed to load students: ' + err.message, type: 'error' });
    }
  };

  const loadSections = async () => {
    try {
      const list = await api.getRegistrarSections();
      setSectionsList(list);
    } catch (err: any) {
      setActionMessage({ text: 'Failed to load sections: ' + err.message, type: 'error' });
    }
  };

  const loadTransfers = async () => {
    try {
      const list = await api.getRegistrarTransfers();
      setTransfersList(list);
    } catch (err: any) {
      setActionMessage({ text: 'Failed to load transfers: ' + err.message, type: 'error' });
    }
  };

  const loadDocuments = async () => {
    try {
      const list = await api.getRegistrarDocuments();
      setDocumentsList(list);
    } catch (err: any) {
      setActionMessage({ text: 'Failed to load documents: ' + err.message, type: 'error' });
    }
  };

  const loadRegistrarModulePage = async (tab: RegistrarPage, page = 1, filterStatus = moduleStatus) => {
    const requestId = ++moduleRequestId.current;
    setModuleLoading(true);
    setModuleError(null);
    setModulePage(page);
    try {
      if (tab === 'guardians') {
        const result = await api.getRegistrarGuardians(moduleSearch, filterStatus, page);
        if (requestId === moduleRequestId.current) setModuleData({ page: tab, items: result.items, total: result.total });
      } else if (tab === 'attendance') {
        const result = await api.getRegistrarAttendanceSummary(moduleSection, undefined, undefined, page);
        if (requestId === moduleRequestId.current) setModuleData({ page: tab, items: result.items, total: result.total });
      } else if (tab === 'examinations') {
        const result = await api.getRegistrarAssessmentCompleteness(moduleSection, undefined, undefined, page);
        if (requestId === moduleRequestId.current) setModuleData({ page: tab, items: result.items, total: result.total });
      } else if (tab === 'results') {
        const result = await api.getRegistrarAcademicRecords(moduleSearch, moduleSection, undefined, undefined, page);
        if (requestId === moduleRequestId.current) setModuleData({ page: tab, items: result.items, total: result.total });
      } else if (tab === 'promotions') {
        const result = await api.getRegistrarPromotions(filterStatus, moduleSearch, undefined, page);
        if (requestId === moduleRequestId.current) setModuleData({ page: tab, items: result.items, total: result.total });
      }
    } catch (err: any) {
      if (requestId === moduleRequestId.current) setModuleError(err.message || `Failed to load ${tab} records.`);
    } finally {
      if (requestId === moduleRequestId.current) setModuleLoading(false);
    }
  };

  const handleTabSwitch = (tab: RegistrarPage) => {
    setActiveTab(tab);
    setActionMessage(null);
    setModuleStatus('');
    if (typeof window !== 'undefined') {
      if (tab === 'profile') {
        window.history.pushState(null, '', '/registrar/profile');
      } else if (window.location.pathname.startsWith('/registrar/profile')) {
        window.history.pushState(null, '', '/');
      }
    }
    if (tab === 'profile') void loadProfile();
    if (tab === 'reports') void loadReportsData();
    if (tab === 'students') loadStudents();
    if (tab === 'admissions') loadApplicants();
    if (tab === 'enrollment') loadSections();
    if (tab === 'transfers') loadTransfers();
    if (tab === 'documents') loadDocuments();
    if (['guardians', 'attendance', 'examinations', 'results', 'promotions'].includes(tab)) {
      void loadRegistrarModulePage(tab, 1, '');
    }
  };

  const loadApplicants = async (page = 1, search = admissionsSearch, status = admissionsStatus) => {
    setAdmissionsLoading(true);
    setAdmissionsError(null);
    setAdmissionsPage(page);
    try {
      const result = await api.getRegistrarAdmissionApplications(search, status, page);
      setApplicantsList(result.items);
      setAdmissionsTotal(result.total);
    } catch (err: any) {
      setAdmissionsError(err.message || 'Failed to load admission applications.');
    } finally {
      setAdmissionsLoading(false);
    }
  };

  const handleCreateApplication = async (event: FormEvent) => {
    event.preventDefault();
    setSubmittingApplication(true);
    try {
      const result = await api.createRegistrarAdmissionApplication({
        ...applicationForm,
        grandfatherName: applicationForm.grandfatherName || undefined,
        phone: applicationForm.phone || undefined,
        email: applicationForm.email || undefined,
        address: applicationForm.address || undefined,
        guardianName: applicationForm.guardianName || undefined,
        guardianPhone: applicationForm.guardianPhone || undefined,
        previousSchool: applicationForm.previousSchool || undefined
      });
      setApplicationModalOpen(false);
      setApplicationForm({
        firstName: '', fatherName: '', grandfatherName: '', gender: 'male', dateOfBirth: '',
        phone: '', email: '', address: '', guardianName: '', guardianPhone: '', previousSchool: ''
      });
      setActionMessage({ text: `Application ${result.applicationRef} submitted for authorized review.`, type: 'success' });
      await loadApplicants(1);
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to submit the admission application.', type: 'error' });
    } finally {
      setSubmittingApplication(false);
    }
  };

  const openTransferModal = async () => {
    try {
      const activeStudents = await api.getRegistrarStudents(undefined, undefined, 'active');
      setStudentsList(activeStudents);
      setTransferStudentId('');
      setTransferReason('');
      setDestinationSchool('');
      setTransferDate(new Date().toISOString().slice(0, 10));
      setTransferModalOpen(true);
    } catch (err: any) {
      setActionMessage({ text: 'Failed to load active students: ' + err.message, type: 'error' });
    }
  };

  const handleRegisterStudent = async (e: FormEvent) => {
    e.preventDefault();
    if (!regFirstName.trim() || !regFatherName.trim()) {
      setRegError('Complete student names are required.');
      return;
    }
    if (!Number.isSafeInteger(Number(regSectionId)) || Number(regSectionId) < 1) {
      setRegError('Choose an available section before registering the student.');
      return;
    }
    const selectedSection = dashData?.sections?.find((section: any) => Number(section.id) === Number(regSectionId));
    if (!regStream || !selectedSection || Number(selectedSection.grade_level) !== Number(regGradeLevel) || selectedSection.stream !== regStream || Number(selectedSection.available_seats) < 1) {
      setRegError('Choose a grade, an available stream, and a matching section with available seats.');
      return;
    }

    setRegError(null);
    setSubmittingReg(true);
    try {
      const res = await api.registerStudent({
        firstName: regFirstName.trim(),
        fatherName: regFatherName.trim(),
        grandfatherName: regGrandfatherName.trim(),
        gender: regGender,
        dateOfBirth: regDob,
        sectionId: Number(regSectionId),
        phone: regPhone.trim() || undefined,
        email: regEmail.trim() || undefined,
        address: regAddress.trim() || undefined,
        previousSchool: regPreviousSchool.trim() || undefined,
        applicationId: selectedApplicationId,
        photo: regPhoto || undefined
      });

      setActionMessage({
        text: `${res.message} Student number: ${res.admissionNo}.`,
        type: 'success'
      });
      setRegisterModalOpen(false);
      setSelectedApplicationId(undefined);
      setRegFirstName('');
      setRegFatherName('');
      setRegGrandfatherName('');
      setRegDob('');
      setRegPhone('');
      setRegEmail('');
      setRegAddress('');
      setRegPreviousSchool('');
      setRegPhoto(null);
      if (regPhotoInput.current) regPhotoInput.current.value = '';
      await loadRegistrarData();
      if (activeTab === 'students') await loadStudents();
      if (activeTab === 'admissions') await loadApplicants(admissionsPage);
    } catch (err: any) {
      setRegError(err.message || 'Failed to register student.');
    } finally {
      setSubmittingReg(false);
    }
  };

  const handleReassignSection = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetStudent) return;

    if (!newTargetSectionId || Number(newTargetSectionId) === Number(targetStudent.section_id)) {
      setActionMessage({ text: 'Please select a different section to reassign the student to.', type: 'error' });
      return;
    }

    if (!placementReason.trim()) {
      setActionMessage({ text: 'Please enter a placement change reason.', type: 'error' });
      return;
    }

    setSubmittingReassign(true);
    try {
      await api.reassignStudentSection(targetStudent.id, Number(newTargetSectionId), placementReason.trim());
      setActionMessage({
        text: `Student ${targetStudent.first_name} ${targetStudent.father_name} reassigned successfully. Previous enrollment history was preserved.`,
        type: 'success'
      });
      setReassignModalOpen(false);
      setPlacementReason('');
      await loadRegistrarData();
      if (activeTab === 'students') await loadStudents();
      if (activeTab === 'enrollment') await loadSections();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to reassign section: ' + (err.message || 'Unknown error'), type: 'error' });
    } finally {
      setSubmittingReassign(false);
    }
  };

  const handleRecordTransfer = async (e: FormEvent) => {
    e.preventDefault();
    if (transferStudentId === '') {
      setActionMessage({ text: 'Choose a student from the directory before recording an exit.', type: 'error' });
      return;
    }
    const actionLabel = transferType === 'transfer' ? 'transfer' : 'withdrawal';
    if (!window.confirm(`This will immediately end the student's active enrollment and record an approved ${actionLabel}. Continue only if this decision is authorized.`)) {
      return;
    }
    setSubmittingTransfer(true);
    try {
      await api.recordStudentTransfer({
        studentId: Number(transferStudentId),
        type: transferType,
        reason: transferReason,
        destinationSchool: transferType === 'transfer' ? destinationSchool || undefined : undefined,
        effectiveDate: transferDate
      });
      setActionMessage({ text: `Student ${actionLabel} was recorded and the active enrollment ended.`, type: 'success' });
      setTransferModalOpen(false);
      setTransferStudentId('');
      setTransferReason('');
      setDestinationSchool('');
      setTransferDate('');
      await loadRegistrarData();
      if (activeTab === 'transfers') await loadTransfers();
      if (activeTab === 'students') await loadStudents();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to record transfer: ' + err.message, type: 'error' });
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const loadProfile = async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const res = await api.getRegistrarProfile();
      setProfileData(res);
      setEditEmail(res.email || '');
      setEditPhone(res.phone || '');
      setEditAddress(res.address || '');
    } catch (err: any) {
      setProfileError(err.message || 'Failed to load registrar profile from database.');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setActionMessage({ text: 'Please select a JPEG or PNG photo.', type: 'error' });
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setActionMessage({ text: 'Profile photo must be 5 MB or smaller.', type: 'error' });
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfilePhotoPreview({
          originalName: file.name,
          mimeType: file.type,
          dataBase64: reader.result
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDedicatedPhotoUpload = async () => {
    if (!profilePhotoPreview) return;
    setUploadingPhoto(true);
    try {
      await api.updateRegistrarProfile({
        photo: profilePhotoPreview
      });
      setActionMessage({ text: 'Profile photo uploaded and updated successfully.', type: 'success' });
      setProfilePhotoPreview(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      setPhotoCacheKey(Date.now());
      await loadProfile();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to upload profile photo: ' + (err.message || 'Unknown error'), type: 'error' });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!window.confirm('Are you sure you want to remove your profile photo?')) return;
    setRemovingPhoto(true);
    try {
      await api.updateRegistrarProfile({
        removePhoto: true
      });
      setActionMessage({ text: 'Profile photo removed successfully.', type: 'success' });
      setProfilePhotoPreview(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
      setPhotoCacheKey(Date.now());
      await loadProfile();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to remove profile photo: ' + (err.message || 'Unknown error'), type: 'error' });
    } finally {
      setRemovingPhoto(false);
    }
  };

  const handleSavePersonal = async (e: FormEvent) => {
    e.preventDefault();
    setSavingPersonal(true);
    try {
      await api.updateRegistrarProfile({
        email: editEmail.trim(),
        phone: editPhone.trim(),
        address: editAddress.trim(),
        photo: profilePhotoPreview || undefined
      });
      setActionMessage({ text: 'Personal information updated successfully in MySQL.', type: 'success' });
      setIsEditingPersonal(false);
      setProfilePhotoPreview(null);
      setPhotoCacheKey(Date.now());
      await loadProfile();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to update personal details: ' + (err.message || 'Unknown error'), type: 'error' });
    } finally {
      setSavingPersonal(false);
    }
  };

  const handlePasswordChange = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) {
      setActionMessage({ text: 'New password must be at least 8 characters long.', type: 'error' });
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setActionMessage({ text: 'New password must contain uppercase, lowercase, and numeric characters.', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setActionMessage({ text: 'New password and confirmation do not match.', type: 'error' });
      return;
    }
    setSubmittingPassword(true);
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setActionMessage({ text: result.message || 'Password changed successfully.', type: 'success' });
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Unable to change password.', type: 'error' });
    } finally {
      setSubmittingPassword(false);
    }
  };

  // Reports & Data Quality Handlers
  const loadReportsData = async (mode = regChartMode) => {
    setDqLoading(true);
    setDqError(null);
    setRegChartLoading(true);
    setRegChartError(null);

    try {
      const summary = await api.getRegistrarDataQuality();
      setDqSummary(summary);
    } catch (err: any) {
      setDqError(err.message || 'Failed to load database quality indicators.');
    } finally {
      setDqLoading(false);
    }

    try {
      const chartResult = await api.getRegistrarRegistrationByYear(mode);
      setRegChartData(Array.isArray(chartResult) ? chartResult : []);
    } catch (err: any) {
      setRegChartError(err.message || 'Failed to load registration statistics.');
    } finally {
      setRegChartLoading(false);
    }
  };

  const handleChartModeSwitch = async (mode: 'calendar' | 'academic') => {
    setRegChartMode(mode);
    setRegChartLoading(true);
    setRegChartError(null);
    setChartHoveredBar(null);
    try {
      const chartResult = await api.getRegistrarRegistrationByYear(mode);
      setRegChartData(Array.isArray(chartResult) ? chartResult : []);
    } catch (err: any) {
      setRegChartError(err.message || 'Failed to switch registration chart mode.');
    } finally {
      setRegChartLoading(false);
    }
  };

  const openDqDetailsModal = async (indicator: string, title: string, page = 1) => {
    setDqModalOpen(true);
    setDqIndicator(indicator);
    setDqModalTitle(title);
    setDqDetailPage(page);
    setDqDetailLoading(true);
    setDqDetailError(null);
    try {
      const res = await api.getRegistrarDataQualityDetails(indicator, page, 10);
      setDqDetailItems(res.items || []);
      setDqDetailTotal(res.total || 0);
    } catch (err: any) {
      setDqDetailError(err.message || 'Failed to load indicator details.');
    } finally {
      setDqDetailLoading(false);
    }
  };

  const handleDqPageChange = async (newPage: number) => {
    if (!dqIndicator || newPage < 1) return;
    setDqDetailPage(newPage);
    setDqDetailLoading(true);
    setDqDetailError(null);
    try {
      const res = await api.getRegistrarDataQualityDetails(dqIndicator, newPage, 10);
      setDqDetailItems(res.items || []);
      setDqDetailTotal(res.total || 0);
    } catch (err: any) {
      setDqDetailError(err.message || 'Failed to load page records.');
    } finally {
      setDqDetailLoading(false);
    }
  };

  return (
    <div className="sh-shell registrar-shell">
      {/* Topbar */}
      <header className="sh-topbar">
        <div className="sh-topbar-brand">
          <div className="sh-topbar-logo">H</div>
          <div className="sh-topbar-title">
            <h1>HSPSMS v4.1</h1>
            <span>Office of the Registrar</span>
          </div>
        </div>

        <div className="sh-topbar-actions">
          <div className="sh-user-badge">
            <div className="sh-user-avatar">R</div>
            <div>
              <span className="sh-user-name">{user.staffName || user.username}</span>
              <span className="sh-user-role" style={{ marginLeft: 8 }}>Registrar</span>
            </div>
          </div>
          <button className="sh-logout-btn" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      <div className="registrar-workspace">
        <aside className="registrar-sidebar" aria-label="Registrar modules">
          <div className="registrar-sidebar-heading">REGISTRAR WORKSPACE</div>
          <nav className="registrar-sidebar-nav">
            {registrarPages.map((page) => (
              <button
                key={page.id}
                type="button"
                className={`registrar-sidebar-link${activeTab === page.id ? ' active' : ''}`}
                aria-current={activeTab === page.id ? 'page' : undefined}
                onClick={() => {
                  if (page.id === 'registration') {
                    handleTabSwitch('registration');
                    return;
                  }
                  handleTabSwitch(page.id);
                }}
              >
                <span aria-hidden="true" className="registrar-sidebar-icon">{page.icon}</span>
                <span>{page.label}</span>
              </button>
            ))}
          </nav>
        </aside>

      {/* Main Content */}
      <main className="sh-content">
        {actionMessage && (
          <div className={`sh-alert sh-alert-${actionMessage.type}`}>
            {actionMessage.type === 'success' ? '✓' : '⚠'} {actionMessage.text}
          </div>
        )}

        {loading ? (
          <div className="sh-loading">
            <div className="sh-spinner"></div>
            <span>Loading student admission rosters and section statistics from MySQL...</span>
          </div>
        ) : error ? (
          <div className="sh-alert sh-alert-error">
            <span>Failed to load registrar data: {error}</span>
            <button className="sh-btn sh-btn-sm sh-btn-secondary" onClick={loadRegistrarData} style={{ marginLeft: 16 }}>
              Retry
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'registration' && (
              <section>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Student Registration</h2>
                    <p className="sh-page-desc">Create an official student record and current-year enrollment.</p>
                  </div>
                  <button className="sh-btn sh-btn-primary" onClick={openRegisterModal} disabled={!dashData?.sections?.some((section: any) => Number(section.available_seats) > 0)}>
                    Register a student
                  </button>
                </div>
                <div className="sh-panel">
                  <div className="sh-panel-body">
                    <p>Student numbers are assigned by the server. Registration and initial placement are saved together.</p>
                    <p>Required: legal names, date of birth, gender, and an available section in the active academic year.</p>
                    {!dashData?.sections?.some((section: any) => Number(section.available_seats) > 0) && (
                      <div className="sh-alert sh-alert-info" role="status">There are no available seats in the current active sections. Registration is disabled until an eligible section has capacity.</div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'admissions' && (
              <section>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Admissions & Applications</h2>
                    <p className="sh-page-desc">Create applications and track their authorized review decisions.</p>
                  </div>
                  <button type="button" className="sh-btn sh-btn-primary" onClick={() => setApplicationModalOpen(true)}>
                    New application
                  </button>
                </div>
                <div className="sh-alert sh-alert-info" role="note">
                  Submitted applications enter the existing approvals queue. Final approval or rejection is performed by the authorized system administrator; this does not register or enroll a student.
                </div>
                <div className="sh-panel">
                  <div className="sh-panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
                    <label>
                      Search
                      <input className="sh-input" value={admissionsSearch} onChange={(event) => setAdmissionsSearch(event.target.value)} placeholder="Reference, applicant, guardian" />
                    </label>
                    <label>
                      Status
                      <select className="sh-select" value={admissionsStatus} onChange={(event) => setAdmissionsStatus(event.target.value)}>
                        <option value="">All statuses</option>
                        <option value="pending_review">Pending review</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="registered">Registered</option>
                        <option value="withdrawn">Withdrawn</option>
                      </select>
                    </label>
                    <button type="button" className="sh-btn sh-btn-secondary" onClick={() => void loadApplicants(1)} disabled={admissionsLoading}>Apply filters</button>
                  </div>
                  {admissionsLoading && <div className="sh-loading"><div className="sh-spinner"></div><span>Loading admission applications…</span></div>}
                  {admissionsError && (
                    <div className="sh-alert sh-alert-error" role="alert">
                      {admissionsError}
                      <button type="button" className="sh-btn sh-btn-sm sh-btn-secondary" onClick={() => void loadApplicants(admissionsPage)} style={{ marginLeft: 12 }}>Retry</button>
                    </div>
                  )}
                  <div className="sh-table-container">
                    <table className="sh-table">
                      <thead>
                        <tr><th>Application</th><th>Applicant</th><th>Date of Birth</th><th>Guardian contact</th><th>Previous school</th><th>Status</th><th>Decision note</th><th>Action</th></tr>
                      </thead>
                      <tbody>
                        {!admissionsLoading && applicantsList.length ? applicantsList.map((application) => (
                          <tr key={application.id}>
                            <td>{application.application_ref}</td>
                            <td>{application.first_name} {application.father_name} {application.grandfather_name || ''}</td>
                            <td>{application.date_of_birth ? new Date(application.date_of_birth).toLocaleDateString() : '—'}</td>
                            <td>{application.guardian_name || '—'}{application.guardian_phone ? <><br />{application.guardian_phone}</> : null}</td>
                            <td>{application.previous_school || '—'}</td>
                            <td><span className={`sh-badge ${application.status === 'approved' || application.status === 'registered' ? 'sh-badge-emerald' : application.status === 'rejected' ? 'sh-badge-rose' : 'sh-badge-amber'}`}>{application.status.replaceAll('_', ' ')}</span></td>
                            <td>{application.decision_note || '—'}</td>
                            <td>{application.status === 'approved' && user.permissions.includes('student.create') && (
                              <button type="button" className="sh-btn sh-btn-primary sh-btn-sm" onClick={() => beginApplicationRegistration(application)}>Register</button>
                            )}</td>
                          </tr>
                        )) : !admissionsLoading && (
                          <tr><td colSpan={8} className="sh-table-empty">No admission applications were found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="sh-panel-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{admissionsTotal} total applications</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button type="button" className="sh-btn sh-btn-secondary sh-btn-sm" disabled={admissionsPage <= 1 || admissionsLoading} onClick={() => void loadApplicants(admissionsPage - 1)}>Previous</button>
                      <span>Page {admissionsPage} of {Math.max(1, Math.ceil(admissionsTotal / 25))}</span>
                      <button type="button" className="sh-btn sh-btn-secondary sh-btn-sm" disabled={admissionsPage >= Math.ceil(admissionsTotal / 25) || admissionsLoading} onClick={() => void loadApplicants(admissionsPage + 1)}>Next</button>
                    </div>
                  </div>
                </div>

                {applicationModalOpen && (
                  <div className="sh-modal-overlay">
                    <div className="sh-modal">
                      <div className="sh-modal-header">
                        <h3>Submit admission application</h3>
                        <button type="button" className="sh-modal-close" onClick={() => setApplicationModalOpen(false)} aria-label="Close">×</button>
                      </div>
                      <form onSubmit={handleCreateApplication}>
                        <div className="sh-modal-body">
                          <div className="registrar-application-form-grid">
                            <div className="sh-form-group">
                              <label>Applicant first name</label>
                              <input className="sh-input" maxLength={60} required value={applicationForm.firstName} onChange={(event) => setApplicationForm((form) => ({ ...form, firstName: event.target.value }))} />
                            </div>
                            <div className="sh-form-group">
                              <label>Father name</label>
                              <input className="sh-input" maxLength={60} required value={applicationForm.fatherName} onChange={(event) => setApplicationForm((form) => ({ ...form, fatherName: event.target.value }))} />
                            </div>
                            <div className="sh-form-group">
                              <label>Grandfather name (optional)</label>
                              <input className="sh-input" maxLength={60} value={applicationForm.grandfatherName} onChange={(event) => setApplicationForm((form) => ({ ...form, grandfatherName: event.target.value }))} />
                            </div>
                            <div className="sh-form-group">
                              <label>Gender</label>
                              <select className="sh-select" value={applicationForm.gender} onChange={(event) => setApplicationForm((form) => ({ ...form, gender: event.target.value as 'female' | 'male' }))}>
                                <option value="male">Male</option><option value="female">Female</option>
                              </select>
                            </div>
                            <div className="sh-form-group">
                              <label>Date of birth</label>
                              <input type="date" className="sh-input" max={DATE_TODAY} required value={applicationForm.dateOfBirth} onChange={(event) => setApplicationForm((form) => ({ ...form, dateOfBirth: event.target.value }))} />
                            </div>
                            <div className="sh-form-group">
                              <label>Applicant phone (optional)</label>
                              <input className="sh-input" maxLength={30} value={applicationForm.phone} onChange={(event) => setApplicationForm((form) => ({ ...form, phone: event.target.value }))} />
                            </div>
                            <div className="sh-form-group">
                              <label>Email (optional)</label>
                              <input type="email" className="sh-input" maxLength={190} value={applicationForm.email} onChange={(event) => setApplicationForm((form) => ({ ...form, email: event.target.value }))} />
                            </div>
                            <div className="sh-form-group">
                              <label>Previous school (optional)</label>
                              <input className="sh-input" maxLength={190} value={applicationForm.previousSchool} onChange={(event) => setApplicationForm((form) => ({ ...form, previousSchool: event.target.value }))} />
                            </div>
                            <div className="sh-form-group">
                              <label>Guardian name (optional)</label>
                              <input className="sh-input" maxLength={190} value={applicationForm.guardianName} onChange={(event) => setApplicationForm((form) => ({ ...form, guardianName: event.target.value }))} />
                            </div>
                            <div className="sh-form-group">
                              <label>Guardian phone (optional)</label>
                              <input className="sh-input" maxLength={30} value={applicationForm.guardianPhone} onChange={(event) => setApplicationForm((form) => ({ ...form, guardianPhone: event.target.value }))} />
                            </div>
                          </div>
                          <div className="sh-form-group">
                            <label>Address (optional)</label>
                            <input className="sh-input" maxLength={255} value={applicationForm.address} onChange={(event) => setApplicationForm((form) => ({ ...form, address: event.target.value }))} />
                          </div>
                        </div>
                        <div className="sh-modal-footer">
                          <button type="button" className="sh-btn sh-btn-secondary" onClick={() => setApplicationModalOpen(false)}>Cancel</button>
                          <button type="submit" className="sh-btn sh-btn-primary" disabled={submittingApplication}>{submittingApplication ? 'Submitting…' : 'Submit for review'}</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && dashData && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Registration & Admissions Overview</h2>
                    <p className="sh-page-desc">Official enrollment registers for the current academic session</p>
                  </div>
                </div>

                {/* KPI Metrics */}
                <div className="sh-metrics-grid">
                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Total Enrolled Students</h4>
                      <div className="sh-metric-value">{dashData.metrics.activeStudents}</div>
                      <p className="sh-metric-sub">{dashData.metrics.totalStudents} official student records</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-blue">🎓</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Total Section Seats</h4>
                      <div className="sh-metric-value">{dashData.metrics.totalCapacity}</div>
                      <p className="sh-metric-sub">{dashData.metrics.availableSeats} available across classes</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-emerald">🏫</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Transfers & Withdrawals</h4>
                      <div className="sh-metric-value">{dashData.metrics.totalTransfers}</div>
                      <p className="sh-metric-sub">Recorded during the current academic year</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-amber">📋</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Student Documents</h4>
                      <div className="sh-metric-value">{dashData.metrics.studentDocuments}</div>
                      <p className="sh-metric-sub">Document records on file</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-purple">📁</div>
                  </div>
                </div>

                {/* Split: Section Capacities & Recent Admissions */}
                <div className="registrar-overview-grid">
                  <div className="sh-panel">
                    <div className="sh-panel-header">
                      <h3 className="sh-panel-title">🏫 Section Capacity Summary</h3>
                    </div>
                    <div className="sh-panel-body" style={{ padding: 0 }}>
                      <table className="sh-table">
                        <thead>
                          <tr>
                            <th>Section</th>
                            <th>Grade</th>
                            <th>Capacity</th>
                            <th>Enrolled</th>
                            <th>Available Seats</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashData.sections && dashData.sections.length > 0 ? (
                            dashData.sections.map((s: any) => (
                              <tr key={s.id}>
                                <td style={{ fontWeight: 700 }}>Section {s.section_name}</td>
                                <td>{s.grade_name || `Grade ${s.grade_level}`}</td>
                                <td>{s.capacity}</td>
                                <td style={{ fontWeight: 700, color: '#1E3A8A' }}>{s.enrolled_count}</td>
                                <td>
                                  <span
                                    className={`sh-badge ${
                                      s.available_seats > 5 ? 'sh-badge-emerald' : 'sh-badge-amber'
                                    }`}
                                  >
                                    {s.available_seats} seats free
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="sh-table-empty">
                                No sections found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="sh-panel">
                    <div className="sh-panel-header">
                      <h3 className="sh-panel-title">🎓 Recent Student Admissions</h3>
                    </div>
                    <div className="sh-panel-body" style={{ padding: 0 }}>
                      <table className="sh-table">
                        <thead>
                          <tr>
                            <th>Admission No</th>
                            <th>Student Name</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashData.recentAdmissions && dashData.recentAdmissions.length > 0 ? (
                            dashData.recentAdmissions.map((st: any) => (
                              <tr key={st.id}>
                                <td style={{ fontWeight: 700, color: '#1E3A8A' }}>{st.admission_no}</td>
                                <td>{st.first_name} {st.father_name}</td>
                                <td style={{ fontSize: '12px', color: '#64748B' }}>
                                  {new Date(st.admission_date).toLocaleDateString()}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={3} className="sh-table-empty">
                                No recent admissions.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: STUDENT DIRECTORY */}
            {activeTab === 'students' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Master Student Directory</h2>
                    <p className="sh-page-desc">Search student records and view current-year enrollment placement</p>
                  </div>
                </div>

                <div className="sh-filter-bar">
                  <input
                    type="text"
                    className="sh-input"
                    placeholder="Search by admission no or student name..."
                    style={{ width: '320px' }}
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadStudents()}
                  />
                  <select
                    className="sh-select"
                    style={{ width: '200px' }}
                    value={sectionFilter || ''}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : undefined;
                      setSectionFilter(val);
                    }}
                  >
                    <option value="">All Sections</option>
                    {dashData?.sections?.map((sec: any) => (
                      <option key={sec.id} value={sec.id}>
                        Section {sec.section_name} ({sec.grade_name || `Grade ${sec.grade_level}`})
                      </option>
                    ))}
                  </select>
                  <select
                    className="sh-select"
                    style={{ width: '160px' }}
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="transferred">Transferred</option>
                    <option value="withdrawn">Withdrawn</option>
                    <option value="graduated">Graduated</option>
                  </select>
                  <button className="sh-btn sh-btn-secondary" onClick={loadStudents}>
                    Filter
                  </button>
                </div>

                <div className="sh-panel">
                  <div className="sh-table-container">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Admission No</th>
                          <th>Full Name</th>
                          <th>Gender</th>
                          <th>Grade</th>
                          <th>Section</th>
                          <th>Stream</th>
                          <th>Roll No</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {studentsList.length > 0 ? (
                          studentsList.map((st) => (
                            <tr key={st.id}>
                              <td style={{ fontWeight: 700, color: '#1E3A8A' }}>{st.admission_no}</td>
                              <td style={{ fontWeight: 600 }}>
                                {st.first_name} {st.father_name} {st.grandfather_name}
                              </td>
                              <td style={{ textTransform: 'capitalize' }}>{st.gender}</td>
                              <td>{st.grade_name || (st.grade_level ? `Grade ${st.grade_level}` : '—')}</td>
                              <td>Section {st.section_name || 'Unassigned'}</td>
                              <td>
                                <span className="sh-badge sh-badge-slate">{st.stream || '—'}</span>
                              </td>
                              <td style={{ fontWeight: 700 }}>{st.roll_no || '—'}</td>
                              <td>
                                <span
                                  className={`sh-badge ${
                                    st.status === 'active'
                                      ? 'sh-badge-emerald'
                                      : st.status === 'transferred'
                                      ? 'sh-badge-amber'
                                      : 'sh-badge-rose'
                                  }`}
                                >
                                  {st.status}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="sh-btn sh-btn-sm sh-btn-secondary"
                                  disabled={!st.enrollment_id}
                                  title={!st.enrollment_id ? 'Only students with an active current-year enrollment can be reassigned.' : undefined}
                                  onClick={() => {
                                    setTargetStudent(st);
                                    const diffSection = (dashData?.sections || []).find(
                                      (sec: any) => Number(sec.id) !== Number(st.section_id) && Number(sec.available_seats) > 0
                                    );
                                    setNewTargetSectionId(diffSection ? diffSection.id : 0);
                                    setPlacementReason('');
                                    setReassignModalOpen(true);
                                  }}
                                >
                                  Reassign Section
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={9} className="sh-table-empty">
                              No student records found in MySQL.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: SECTIONS & SEATS */}
            {activeTab === 'enrollment' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Section Assignment & Seat Capacities</h2>
                    <p className="sh-page-desc">Monitor classroom occupancy and available student quotas</p>
                  </div>
                </div>

                <div className="sh-panel">
                  <div className="sh-table-container">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Section ID</th>
                          <th>Section Name</th>
                          <th>Grade Level</th>
                          <th>Stream</th>
                          <th>Max Capacity</th>
                          <th>Enrolled Count</th>
                          <th>Available Seats</th>
                          <th>Occupancy %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionsList.length > 0 ? (
                          sectionsList.map((sec) => {
                            const pct = Math.round((sec.enrolled_count / sec.capacity) * 100);
                            return (
                              <tr key={sec.id}>
                                <td>#{sec.id}</td>
                                <td style={{ fontWeight: 700 }}>Section {sec.section_name}</td>
                                <td>{sec.grade_name || `Grade ${sec.grade_level}`}</td>
                                <td>
                                  <span className="sh-badge sh-badge-slate">{sec.stream}</span>
                                </td>
                                <td>{sec.capacity}</td>
                                <td style={{ fontWeight: 700, color: '#1E3A8A' }}>{sec.enrolled_count}</td>
                                <td>
                                  <span
                                    className={`sh-badge ${
                                      sec.available_seats > 5 ? 'sh-badge-emerald' : 'sh-badge-amber'
                                    }`}
                                  >
                                    {sec.available_seats} seats free
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div
                                      style={{
                                        width: 80,
                                        height: 8,
                                        backgroundColor: '#E2E8F0',
                                        borderRadius: 4,
                                        overflow: 'hidden'
                                      }}
                                    >
                                      <div
                                        style={{
                                          width: `${Math.min(pct, 100)}%`,
                                          height: '100%',
                                          backgroundColor: pct > 90 ? '#DC2626' : '#2563EB'
                                        }}
                                      ></div>
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: 600 }}>{pct}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={8} className="sh-table-empty">
                              Loading section availability...
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: TRANSFERS & WITHDRAWALS */}
            {activeTab === 'transfers' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Transfers, Withdrawals & Departures</h2>
                    <p className="sh-page-desc">View and record student transfers or formal withdrawals in one place.</p>
                  </div>
                  <button type="button" className="sh-btn sh-btn-primary" onClick={() => void openTransferModal()}>
                    Record transfer or withdrawal
                  </button>
                </div>

                <div className="sh-panel">
                  <div className="sh-table-container">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Record ID</th>
                          <th>Student Name</th>
                          <th>Admission No</th>
                          <th>Type</th>
                          <th>Destination School</th>
                          <th>Reason</th>
                          <th>Effective Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transfersList.length > 0 ? (
                          transfersList.map((t) => (
                            <tr key={t.id}>
                              <td>#{t.id}</td>
                              <td style={{ fontWeight: 700 }}>{t.student_name}</td>
                              <td>{t.admission_no}</td>
                              <td>
                                <span className="sh-badge sh-badge-amber">{t.type}</span>
                              </td>
                              <td style={{ fontWeight: 600 }}>{t.destination_school || 'N/A'}</td>
                              <td style={{ color: '#475569' }}>{t.reason}</td>
                              <td>{new Date(t.effective_date).toLocaleDateString()}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="sh-table-empty">
                              No transfer or withdrawal records registered in MySQL.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: DOCUMENTS & VERIFICATION */}
            {activeTab === 'documents' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Student Documents</h2>
                    <p className="sh-page-desc">Stored document metadata and scan status. Upload, download, and verification actions are not connected.</p>
                  </div>
                </div>

                <div className="sh-panel">
                  <div className="sh-table-container">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Doc ID</th>
                          <th>Student Name</th>
                          <th>Admission No</th>
                          <th>Document Title / Type</th>
                          <th>Verification Status</th>
                          <th>Uploaded Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documentsList.length > 0 ? (
                          documentsList.map((d) => (
                            <tr key={d.id}>
                              <td>#{d.id}</td>
                              <td style={{ fontWeight: 700 }}>{d.student_name}</td>
                              <td>{d.admission_no}</td>
                              <td>{d.doc_type} · {d.original_name}</td>
                              <td>
                                <span className={`sh-badge ${d.scan_status === 'clean' ? 'sh-badge-emerald' : d.scan_status === 'infected' ? 'sh-badge-rose' : 'sh-badge-amber'}`}>
                                  {d.scan_status === 'clean' ? 'File scan: Clean' : `File scan: ${d.scan_status}`}
                                </span>
                              </td>
                              <td>{new Date(d.created_at).toLocaleDateString()}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="sh-table-empty">
                              No student archival documents found in MySQL.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {(['guardians', 'attendance', 'examinations', 'results', 'promotions'] as RegistrarPage[]).includes(activeTab) && (
              <section>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">
                      {registrarPages.find((page) => page.id === activeTab)?.label}
                    </h2>
                    <p className="sh-page-desc">
                      {activeTab === 'guardians' && 'Read-only guardian contacts and linked-student details. Editing and linking are not connected.'}
                      {activeTab === 'attendance' && 'Read-only attendance session summaries; attendance corrections are not performed here.'}
                      {activeTab === 'examinations' && 'Assessment and mark-submission completeness. Marks remain managed by authorized academic staff.'}
                      {activeTab === 'results' && 'Published report-card snapshots only. Draft and unpublished results are not displayed.'}
                      {activeTab === 'promotions' && 'Read-only recorded promotion, repetition, and graduation decisions. Decision entry is not connected.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sh-btn sh-btn-secondary"
                    onClick={() => void loadRegistrarModulePage(activeTab, modulePage)}
                    disabled={moduleLoading}
                  >
                    Refresh
                  </button>
                </div>

                <div className="sh-panel">
                  <div className="sh-panel-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
                    {['guardians', 'results', 'promotions'].includes(activeTab) && (
                      <label>
                        Search
                        <input
                          className="sh-input"
                          value={moduleSearch}
                          onChange={(event) => setModuleSearch(event.target.value)}
                          placeholder="Name or student number"
                        />
                      </label>
                    )}
                    {['attendance', 'examinations', 'results'].includes(activeTab) && (
                      <label>
                        Section
                        <select
                          className="sh-select"
                          value={moduleSection || ''}
                          onChange={(event) => setModuleSection(event.target.value ? Number(event.target.value) : undefined)}
                        >
                          <option value="">All sections</option>
                          {dashData?.sections?.map((section: any) => (
                            <option key={section.id} value={section.id}>
                              {section.section_name} ({section.grade_name || `Grade ${section.grade_level}`})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {activeTab === 'guardians' && (
                      <label>
                        Verification
                        <select className="sh-select" value={moduleStatus} onChange={(event) => setModuleStatus(event.target.value)}>
                          <option value="">All statuses</option>
                          <option value="pending">Pending</option>
                          <option value="verified">Verified</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </label>
                    )}
                    {activeTab === 'promotions' && (
                      <label>
                        Decision
                        <select className="sh-select" value={moduleStatus} onChange={(event) => setModuleStatus(event.target.value)}>
                          <option value="">All decisions</option>
                          <option value="promoted">Promoted</option>
                          <option value="repeat">Repeat</option>
                          <option value="graduated">Graduated</option>
                        </select>
                      </label>
                    )}
                    <button type="button" className="sh-btn sh-btn-primary" onClick={() => void loadRegistrarModulePage(activeTab, 1)} disabled={moduleLoading}>
                      Apply filters
                    </button>
                  </div>
                </div>

                {moduleLoading && (
                  <div className="sh-loading"><div className="sh-spinner"></div><span>Loading records…</span></div>
                )}
                {moduleError && (
                  <div className="sh-alert sh-alert-error" role="alert">
                    {moduleError}
                    <button type="button" className="sh-btn sh-btn-sm sh-btn-secondary" onClick={() => void loadRegistrarModulePage(activeTab, modulePage)} style={{ marginLeft: 12 }}>
                      Retry
                    </button>
                  </div>
                )}

                {!moduleLoading && !moduleError && moduleData?.page === activeTab && (
                  <div className="sh-panel">
                        <div className="sh-table-container">
                          <table className="sh-table">
                            {activeTab === 'guardians' && (
                              <>
                                <thead><tr><th>Guardian</th><th>Contact</th><th>Linked students</th><th>Relationship</th><th>Verification</th></tr></thead>
                                <tbody>
                                  {moduleData.items.map((row) => (
                                    <tr key={row.id}>
                                      <td>{row.first_name} {row.father_name} {row.grandfather_name || ''}</td>
                                      <td>{row.phone || '—'}<br />{row.email || '—'}</td>
                                      <td>{row.linked_student_count}</td>
                                      <td>{row.relationships || '—'}</td>
                                      <td>{row.verification_status}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </>
                            )}
                            {activeTab === 'attendance' && (
                              <>
                                <thead><tr><th>Date</th><th>Grade / section</th><th>Subject</th><th>Session</th><th>Recorded</th><th>Present</th><th>Absent</th><th>Late</th><th>Excused</th></tr></thead>
                                <tbody>
                                  {moduleData.items.map((row) => (
                                    <tr key={row.session_id}>
                                      <td>{row.attendance_date ? new Date(row.attendance_date).toLocaleDateString() : '—'}</td>
                                      <td>{row.grade_name} · {row.section_name}</td>
                                      <td>{row.subject_name || 'Class session'}</td>
                                      <td>{row.session_status}</td>
                                      <td>{row.recorded_students}</td>
                                      <td>{row.present_count || 0}</td>
                                      <td>{row.absent_count || 0}</td>
                                      <td>{row.late_count || 0}</td>
                                      <td>{row.excused_count || 0}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </>
                            )}
                            {activeTab === 'examinations' && (
                              <>
                                <thead><tr><th>Assessment</th><th>Year / term</th><th>Grade / section</th><th>Subject</th><th>Expected</th><th>With marks</th><th>Finalized</th><th>Draft</th></tr></thead>
                                <tbody>
                                  {moduleData.items.map((row) => (
                                    <tr key={row.assessment_id}>
                                      <td>{row.title}<br /><small>{row.assessment_status}</small></td>
                                      <td>{row.academic_year_name} / {row.term_name}</td>
                                      <td>{row.grade_name} · {row.section_name}</td>
                                      <td>{row.subject_name}</td>
                                      <td>{row.expected_students}</td>
                                      <td>{row.students_with_marks}</td>
                                      <td>{row.finalized_students}</td>
                                      <td>{row.draft_students}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </>
                            )}
                            {activeTab === 'results' && (
                              <>
                                <thead><tr><th>Student</th><th>Year / term</th><th>Grade / section</th><th>Average</th><th>Class rank</th><th>Version / issued</th></tr></thead>
                                <tbody>
                                  {moduleData.items.map((row) => (
                                    <tr key={row.report_card_id}>
                                      <td>{row.admission_no}<br />{row.first_name} {row.father_name}</td>
                                      <td>{row.academic_year_name} / {row.term_name}</td>
                                      <td>{row.grade_name} · {row.section_name}</td>
                                      <td>{row.average_percent == null ? '—' : `${Number(row.average_percent).toFixed(1)}%`}</td>
                                      <td>{row.class_rank == null ? '—' : `${row.class_rank} / ${row.class_size}`}</td>
                                      <td>v{row.version}{row.issued_at ? ` · ${new Date(row.issued_at).toLocaleDateString()}` : ''}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </>
                            )}
                            {activeTab === 'promotions' && (
                              <>
                                <thead><tr><th>Student</th><th>Decision</th><th>From</th><th>To</th><th>Effective date</th><th>Decided by</th><th>Remarks</th></tr></thead>
                                <tbody>
                                  {moduleData.items.map((row) => (
                                    <tr key={row.id}>
                                      <td>{row.admission_no}<br />{row.first_name} {row.father_name}</td>
                                      <td>{row.decision}</td>
                                      <td>{row.from_grade_name} · {row.from_academic_year} / {row.section_name}</td>
                                      <td>{row.to_grade_name || '—'} · {row.to_academic_year || '—'}</td>
                                      <td>{row.effective_date ? new Date(row.effective_date).toLocaleDateString() : '—'}</td>
                                      <td>{row.decided_by || '—'}</td>
                                      <td>{row.remarks || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </>
                            )}
                            {moduleData.items.length === 0 && (
                              <tbody><tr><td colSpan={activeTab === 'guardians' ? 5 : activeTab === 'attendance' ? 9 : activeTab === 'examinations' ? 8 : activeTab === 'results' ? 6 : 7} className="sh-table-empty">No records found for the selected filters.</td></tr></tbody>
                            )}
                          </table>
                        </div>
                        <div className="sh-panel-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{moduleData.total} total records</span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" className="sh-btn sh-btn-secondary sh-btn-sm" disabled={modulePage <= 1 || moduleLoading} onClick={() => void loadRegistrarModulePage(activeTab, modulePage - 1)}>Previous</button>
                            <span>Page {modulePage} of {Math.max(1, Math.ceil(moduleData.total / 25))}</span>
                            <button type="button" className="sh-btn sh-btn-secondary sh-btn-sm" disabled={modulePage >= Math.ceil(moduleData.total / 25) || moduleLoading} onClick={() => void loadRegistrarModulePage(activeTab, modulePage + 1)}>Next</button>
                          </div>
                        </div>
                      </div>
                )}
              </section>
            )}

            {/* TAB: REPORTS & DATA QUALITY */}
            {activeTab === 'reports' && (
              <section className="registrar-reports-section">
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Reports &amp; Data Quality</h2>
                    <p className="sh-page-desc">
                      Real-time database integrity metrics and chronological student registration trends derived directly from the school's MySQL database.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sh-btn sh-btn-secondary"
                    onClick={() => void loadReportsData()}
                    disabled={dqLoading || regChartLoading}
                  >
                    Refresh Metrics
                  </button>
                </div>

                {/* Section 1: Read-Only Data Quality Indicators */}
                <div className="registrar-dq-section">
                  <div className="registrar-section-title-wrap">
                    <h3 className="registrar-section-title">Data Quality Indicators</h3>
                    <span className="registrar-section-subtitle">
                      Live audit of student links, guardian verification, current-year enrollments, and academic assessment status.
                    </span>
                  </div>

                  {dqLoading && (
                    <div className="sh-loading" style={{ margin: '20px 0' }}>
                      <div className="sh-spinner"></div>
                      <span>Auditing MySQL database records…</span>
                    </div>
                  )}

                  {dqError && (
                    <div className="sh-alert sh-alert-error" role="alert" style={{ marginBottom: 16 }}>
                      <span><strong>Database Audit Error:</strong> {dqError}</span>
                      <button
                        type="button"
                        className="sh-btn sh-btn-sm sh-btn-secondary"
                        onClick={() => void loadReportsData()}
                        style={{ marginLeft: 12 }}
                      >
                        Retry Audit
                      </button>
                    </div>
                  )}

                  {!dqLoading && !dqError && dqSummary && (
                    <div className="registrar-reports-grid">
                      {/* Card 1: Students Without Linked Guardians */}
                      <div className="registrar-dq-card">
                        <div className="registrar-dq-header">
                          <span className="registrar-dq-icon">👨‍👩‍👦</span>
                          <span
                            className={`registrar-dq-badge ${
                              dqSummary.students_without_guardians > 0 ? 'badge-warning' : 'badge-success'
                            }`}
                          >
                            {dqSummary.students_without_guardians > 0 ? 'Needs Attention' : 'Compliant'}
                          </span>
                        </div>
                        <h4 className="registrar-dq-card-title">Students Without Linked Guardians</h4>
                        <div className="registrar-dq-count">{dqSummary.students_without_guardians}</div>
                        <p className="registrar-dq-desc">
                          Active students with zero guardian relationships established in <code>student_guardians</code>.
                        </p>
                        <button
                          type="button"
                          className="registrar-dq-action-btn"
                          onClick={() =>
                            void openDqDetailsModal(
                              'students_without_guardians',
                              'Students Without Linked Guardians'
                            )
                          }
                          disabled={dqSummary.students_without_guardians === 0}
                        >
                          {dqSummary.students_without_guardians > 0
                            ? `Inspect ${dqSummary.students_without_guardians} Records →`
                            : 'No Anomalies Found'}
                        </button>
                      </div>

                      {/* Card 2: Guardians Pending Verification */}
                      <div className="registrar-dq-card">
                        <div className="registrar-dq-header">
                          <span className="registrar-dq-icon">🛡️</span>
                          <span
                            className={`registrar-dq-badge ${
                              dqSummary.guardians_pending_verification > 0 ? 'badge-warning' : 'badge-success'
                            }`}
                          >
                            {dqSummary.guardians_pending_verification > 0 ? 'Verification Needed' : 'All Verified'}
                          </span>
                        </div>
                        <h4 className="registrar-dq-card-title">Guardians Pending Verification</h4>
                        <div className="registrar-dq-count">{dqSummary.guardians_pending_verification}</div>
                        <p className="registrar-dq-desc">
                          Parent or guardian profiles marked with <code>pending</code> identity verification in MySQL.
                        </p>
                        <button
                          type="button"
                          className="registrar-dq-action-btn"
                          onClick={() =>
                            void openDqDetailsModal(
                              'guardians_pending_verification',
                              'Guardians Pending Verification'
                            )
                          }
                          disabled={dqSummary.guardians_pending_verification === 0}
                        >
                          {dqSummary.guardians_pending_verification > 0
                            ? `Inspect ${dqSummary.guardians_pending_verification} Records →`
                            : 'All Verified'}
                        </button>
                      </div>

                      {/* Card 3: Active Students Without Current Enrollment */}
                      <div className="registrar-dq-card">
                        <div className="registrar-dq-header">
                          <span className="registrar-dq-icon">⚠️</span>
                          <span
                            className={`registrar-dq-badge ${
                              dqSummary.active_students_without_current_enrollment > 0 ? 'badge-danger' : 'badge-success'
                            }`}
                          >
                            {dqSummary.active_students_without_current_enrollment > 0 ? 'Unplaced Students' : 'Fully Placed'}
                          </span>
                        </div>
                        <h4 className="registrar-dq-card-title">Active Students Without Current Enrollment</h4>
                        <div className="registrar-dq-count">
                          {dqSummary.active_students_without_current_enrollment}
                        </div>
                        <p className="registrar-dq-desc">
                          Students with status <code>active</code> who lack an active section enrollment for the current academic year.
                        </p>
                        <button
                          type="button"
                          className="registrar-dq-action-btn"
                          onClick={() =>
                            void openDqDetailsModal(
                              'active_students_without_current_enrollment',
                              'Active Students Without Current Enrollment'
                            )
                          }
                          disabled={dqSummary.active_students_without_current_enrollment === 0}
                        >
                          {dqSummary.active_students_without_current_enrollment > 0
                            ? `Inspect ${dqSummary.active_students_without_current_enrollment} Records →`
                            : 'All Enrolled'}
                        </button>
                      </div>

                      {/* Card 4: Current Assessments Without Finalized Marks */}
                      <div className="registrar-dq-card">
                        <div className="registrar-dq-header">
                          <span className="registrar-dq-icon">📝</span>
                          <span
                            className={`registrar-dq-badge ${
                              dqSummary.current_assessments_without_finalized_marks > 0 ? 'badge-info' : 'badge-success'
                            }`}
                          >
                            {dqSummary.current_assessments_without_finalized_marks > 0 ? 'Marks Pending' : 'All Marks Final'}
                          </span>
                        </div>
                        <h4 className="registrar-dq-card-title">Current Assessments Without Finalized Marks</h4>
                        <div className="registrar-dq-count">
                          {dqSummary.current_assessments_without_finalized_marks}
                        </div>
                        <p className="registrar-dq-desc">
                          Assessments in active terms that remain in draft status or are awaiting mark finalization.
                        </p>
                        <button
                          type="button"
                          className="registrar-dq-action-btn"
                          onClick={() =>
                            void openDqDetailsModal(
                              'current_assessments_without_finalized_marks',
                              'Current Assessments Without Finalized Marks'
                            )
                          }
                          disabled={dqSummary.current_assessments_without_finalized_marks === 0}
                        >
                          {dqSummary.current_assessments_without_finalized_marks > 0
                            ? `Inspect ${dqSummary.current_assessments_without_finalized_marks} Records →`
                            : 'All Marks Finalized'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 2: Student Registration by Year Chart */}
                <div className="registrar-chart-card">
                  <div className="registrar-chart-header">
                    <div>
                      <h3 className="registrar-chart-title">Student Registration by Year</h3>
                      <p className="registrar-chart-subtitle">
                        Aggregated from MySQL database records based on official registration events.
                      </p>
                    </div>
                    <div className="registrar-chart-toggle-group">
                      <button
                        type="button"
                        className={`registrar-chart-toggle-btn ${regChartMode === 'calendar' ? 'active' : ''}`}
                        onClick={() => void handleChartModeSwitch('calendar')}
                        disabled={regChartLoading}
                      >
                        Calendar Year (Admission Date)
                      </button>
                      <button
                        type="button"
                        className={`registrar-chart-toggle-btn ${regChartMode === 'academic' ? 'active' : ''}`}
                        onClick={() => void handleChartModeSwitch('academic')}
                        disabled={regChartLoading}
                      >
                        Academic Year (Enrollment)
                      </button>
                    </div>
                  </div>

                  {regChartLoading && (
                    <div className="sh-loading" style={{ margin: '40px 0' }}>
                      <div className="sh-spinner"></div>
                      <span>Aggregating yearly student records from MySQL…</span>
                    </div>
                  )}

                  {regChartError && (
                    <div className="sh-alert sh-alert-error" role="alert" style={{ margin: '20px' }}>
                      <span><strong>Chart Data Error:</strong> {regChartError}</span>
                      <button
                        type="button"
                        className="sh-btn sh-btn-sm sh-btn-secondary"
                        onClick={() => void handleChartModeSwitch(regChartMode)}
                        style={{ marginLeft: 12 }}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {!regChartLoading && !regChartError && (
                    <>
                      {regChartData.length === 0 ? (
                        <div className="registrar-chart-empty">
                          <p>No registered student records found in MySQL for this reporting mode.</p>
                        </div>
                      ) : (
                        <div className="registrar-chart-svg-container">
                          {(() => {
                            const svgWidth = 640;
                            const svgHeight = 280;
                            const marginLeft = 60;
                            const marginRight = 30;
                            const marginTop = 35;
                            const marginBottom = 45;
                            const plotWidth = svgWidth - marginLeft - marginRight;
                            const plotHeight = svgHeight - marginTop - marginBottom;

                            const maxVal = Math.max(...regChartData.map((d) => d.count), 5);
                            const yMax = Math.ceil(maxVal * 1.15);
                            const numYSteps = 4;
                            const yTicks = Array.from({ length: numYSteps + 1 }, (_, i) =>
                              Math.round((yMax / numYSteps) * i)
                            );

                            const slotWidth = plotWidth / regChartData.length;
                            const barWidth = Math.min(Math.max(slotWidth * 0.45, 24), 70);

                            return (
                              <svg
                                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                                className="registrar-chart-svg"
                                style={{ width: '100%', height: 'auto', display: 'block' }}
                              >
                                <defs>
                                  <linearGradient id="regBarGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#1e3a8a" />
                                    <stop offset="100%" stopColor="#3b82f6" />
                                  </linearGradient>
                                  <linearGradient id="regBarHoverGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#0f172a" />
                                    <stop offset="100%" stopColor="#2563eb" />
                                  </linearGradient>
                                </defs>

                                {/* Y-axis gridlines & labels */}
                                {yTicks.map((tickVal) => {
                                  const yPos = marginTop + plotHeight - (tickVal / yMax) * plotHeight;
                                  return (
                                    <g key={tickVal}>
                                      <line
                                        x1={marginLeft}
                                        y1={yPos}
                                        x2={svgWidth - marginRight}
                                        y2={yPos}
                                        stroke="#e2e8f0"
                                        strokeDasharray={tickVal === 0 ? undefined : '3,3'}
                                      />
                                      <text
                                        x={marginLeft - 10}
                                        y={yPos + 4}
                                        textAnchor="end"
                                        fontSize="11"
                                        fill="#64748b"
                                      >
                                        {tickVal}
                                      </text>
                                    </g>
                                  );
                                })}

                                {/* Y-axis Label */}
                                <text
                                  transform={`rotate(-90)`}
                                  x={-(marginTop + plotHeight / 2)}
                                  y={18}
                                  textAnchor="middle"
                                  fontSize="11"
                                  fontWeight="600"
                                  fill="#475569"
                                >
                                  Students Registered
                                </text>

                                {/* Baseline */}
                                <line
                                  x1={marginLeft}
                                  y1={marginTop + plotHeight}
                                  x2={svgWidth - marginRight}
                                  y2={marginTop + plotHeight}
                                  stroke="#cbd5e1"
                                  strokeWidth="1.5"
                                />

                                {/* Bars & X-axis Labels */}
                                {regChartData.map((item, idx) => {
                                  const barX = marginLeft + idx * slotWidth + (slotWidth - barWidth) / 2;
                                  const barHeight = (item.count / yMax) * plotHeight;
                                  const barY = marginTop + plotHeight - barHeight;
                                  const displayLabel = item.label ? `${item.year} (${item.label})` : String(item.year);
                                  const isHovered =
                                    chartHoveredBar?.year === item.year &&
                                    chartHoveredBar?.count === item.count;

                                  return (
                                    <g
                                      key={String(item.year)}
                                      onMouseEnter={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setChartHoveredBar({
                                          year: item.year,
                                          label: item.label,
                                          count: item.count,
                                          x: rect.left + rect.width / 2,
                                          y: rect.top
                                        });
                                      }}
                                      onMouseLeave={() => setChartHoveredBar(null)}
                                      style={{ cursor: 'pointer' }}
                                    >
                                      {/* Bar rectangle */}
                                      <rect
                                        x={barX}
                                        y={barY}
                                        width={barWidth}
                                        height={Math.max(barHeight, 2)}
                                        rx="4"
                                        ry="4"
                                        fill={isHovered ? 'url(#regBarHoverGradient)' : 'url(#regBarGradient)'}
                                        style={{ transition: 'all 0.2s ease' }}
                                      />

                                      {/* Count on top of bar */}
                                      <text
                                        x={barX + barWidth / 2}
                                        y={barY - 6}
                                        textAnchor="middle"
                                        fontSize="11"
                                        fontWeight="700"
                                        fill="#1e293b"
                                      >
                                        {item.count}
                                      </text>

                                      {/* X-axis year text */}
                                      <text
                                        x={barX + barWidth / 2}
                                        y={marginTop + plotHeight + 18}
                                        textAnchor="middle"
                                        fontSize="11"
                                        fontWeight="500"
                                        fill="#334155"
                                      >
                                        {displayLabel}
                                      </text>
                                    </g>
                                  );
                                })}

                                {/* X-axis Label */}
                                <text
                                  x={marginLeft + plotWidth / 2}
                                  y={svgHeight - 8}
                                  textAnchor="middle"
                                  fontSize="11"
                                  fontWeight="600"
                                  fill="#475569"
                                >
                                  {regChartMode === 'calendar' ? 'Admission Calendar Year' : 'Academic Year'}
                                </text>
                              </svg>
                            );
                          })()}

                          {/* Hover Tooltip */}
                          {chartHoveredBar && (
                            <div className="registrar-chart-tooltip" style={{ display: 'block' }}>
                              <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>
                                {regChartMode === 'calendar' ? 'Calendar Year' : 'Academic Year'}: {chartHoveredBar.year}
                                {chartHoveredBar.label ? ` (${chartHoveredBar.label})` : ''}
                              </div>
                              <div style={{ color: '#1e3a8a', fontWeight: 700, fontSize: '13px' }}>
                                {chartHoveredBar.count} {chartHoveredBar.count === 1 ? 'Student' : 'Students'} Registered
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Reconciliation Info Footer */}
                      <div className="registrar-chart-reconcile-footer">
                        <span>
                          <strong>Data Reconciliation:</strong> Showing{' '}
                          {regChartData.reduce((acc, curr) => acc + curr.count, 0)} total students across{' '}
                          {regChartData.length} recorded {regChartMode === 'calendar' ? 'calendar' : 'academic'} year(s).
                        </span>
                        <span>Source: MySQL <code>students</code> &amp; <code>enrollments</code></span>
                      </div>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* TAB: REGISTRAR PROFILE */}
            {activeTab === 'profile' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Registrar Profile</h2>
                    <p className="sh-page-desc">
                      Manage your official registrar profile credentials, personal details, photo, and account security.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="sh-btn sh-btn-secondary"
                    onClick={() => void loadProfile()}
                    disabled={profileLoading}
                  >
                    {profileLoading ? 'Refreshing...' : 'Refresh Profile'}
                  </button>
                </div>

                {profileError && (
                  <div className="sh-alert sh-alert-error" role="alert" style={{ marginBottom: 20 }}>
                    {profileError}
                  </div>
                )}

                {/* Header Banner */}
                <div className="registrar-profile-banner">
                  <div className="registrar-profile-banner-left">
                    <div className="registrar-profile-avatar-container">
                      {profilePhotoPreview ? (
                        <img
                          src={profilePhotoPreview.dataBase64}
                          alt="Preview Avatar"
                          className="registrar-profile-avatar-img"
                        />
                      ) : profileData?.photo_document_id ? (
                        <img
                          src={api.getRegistrarProfilePhotoUrl(photoCacheKey)}
                          crossOrigin="use-credentials"
                          alt="Registrar Profile"
                          className="registrar-profile-avatar-img"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="registrar-profile-avatar-fallback">
                          {(profileData?.first_name?.[0] || user.username?.[0] || 'R').toUpperCase()}
                          {(profileData?.father_name?.[0] || '').toUpperCase()}
                        </div>
                      )}
                      <div className="registrar-profile-avatar-badge" title="Active Account">✓</div>
                    </div>
                    <div className="registrar-profile-banner-details">
                      <h2>
                        {profileData?.first_name
                          ? `${profileData.first_name} ${profileData.father_name || ''} ${profileData.grandfather_name || ''}`
                          : profileData?.username || user.username}
                        {profileData?.name_am && (
                          <span className="amharic-name">({profileData.name_am})</span>
                        )}
                      </h2>
                      <p style={{ margin: 0, opacity: 0.9, fontSize: '13px' }}>
                        {profileData?.job_title || 'Chief Registrar Officer'} · {profileData?.department || 'Office of the Registrar'}
                      </p>
                      <div className="registrar-profile-banner-badges">
                        <span className="registrar-profile-pill">
                          Employee ID: {profileData?.employee_no || `USR-${profileData?.id || user.username}`}
                        </span>
                        <span className="registrar-profile-pill">
                          Role: Registrar
                        </span>
                        <span className="registrar-profile-pill active-status">
                          ● {profileData?.employment_status ? profileData.employment_status.toUpperCase() : 'ACTIVE'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <button
                      type="button"
                      className="sh-btn"
                      style={{ background: '#FFFFFF', color: '#1E3A8A', fontWeight: 600, border: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      📷 {profileData?.photo_document_id ? 'Change Photo' : 'Upload Photo'}
                    </button>
                  </div>
                </div>

                {/* Profile Main 2-Column Grid */}
                <div className="registrar-profile-layout">
                  {/* LEFT COLUMN: Dedicated Photo Upload + Personal Info + Employment */}
                  <div className="registrar-profile-column">
                    {/* DEDICATED PHOTO UPLOAD CARD */}
                    <div className="sh-panel">
                      <div className="sh-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Profile Photo Upload</h3>
                        {profileData?.photo_document_id && !profilePhotoPreview && (
                          <button
                            type="button"
                            className="sh-btn sh-btn-secondary sh-btn-sm"
                            style={{ color: '#DC2626', borderColor: '#FECACA' }}
                            onClick={handleRemovePhoto}
                            disabled={removingPhoto}
                          >
                            {removingPhoto ? 'Removing...' : 'Remove Photo'}
                          </button>
                        )}
                      </div>
                      <div className="sh-panel-body">
                        <input
                          ref={photoInputRef}
                          type="file"
                          accept="image/jpeg,image/png"
                          style={{ display: 'none' }}
                          onChange={handlePhotoSelect}
                        />

                        {profilePhotoPreview ? (
                          <div>
                            <div className="registrar-photo-preview-bar">
                              <img
                                src={profilePhotoPreview.dataBase64}
                                alt="New Photo Preview"
                                className="registrar-photo-preview-thumb"
                              />
                              <div style={{ flex: 1, minWidth: 160 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: '#15803D' }}>
                                  New photo selected
                                </div>
                                <div style={{ fontSize: 12, color: '#64748B' }}>
                                  {profilePhotoPreview.originalName}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  type="button"
                                  className="sh-btn sh-btn-primary sh-btn-sm"
                                  onClick={handleDedicatedPhotoUpload}
                                  disabled={uploadingPhoto}
                                >
                                  {uploadingPhoto ? 'Saving Photo...' : 'Upload & Save Photo'}
                                </button>
                                <button
                                  type="button"
                                  className="sh-btn sh-btn-secondary sh-btn-sm"
                                  onClick={() => {
                                    setProfilePhotoPreview(null);
                                    if (photoInputRef.current) photoInputRef.current.value = '';
                                  }}
                                  disabled={uploadingPhoto}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                            <small style={{ display: 'block', marginTop: 8, color: '#64748B' }}>
                              Click "Upload & Save Photo" to apply your new profile photo to your official record.
                            </small>
                          </div>
                        ) : (
                          <div
                            className="registrar-photo-dropzone"
                            onClick={() => photoInputRef.current?.click()}
                          >
                            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📸</div>
                            <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '14px', marginBottom: '4px' }}>
                              Click to select or drag and drop a new profile photo
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748B' }}>
                              Supports JPEG or PNG format. Maximum file size: 5 MB.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* PERSONAL INFORMATION CARD */}
                    <div className="sh-panel">
                      <div className="sh-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Personal Information</h3>
                        {!isEditingPersonal ? (
                          <button
                            type="button"
                            className="sh-btn sh-btn-secondary sh-btn-sm"
                            onClick={() => setIsEditingPersonal(true)}
                          >
                            ✏️ Edit Information
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="sh-btn sh-btn-secondary sh-btn-sm"
                            onClick={() => {
                              setIsEditingPersonal(false);
                              setEditEmail(profileData?.email || '');
                              setEditPhone(profileData?.phone || '');
                              setEditAddress(profileData?.address || '');
                            }}
                            disabled={savingPersonal}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                      <div className="sh-panel-body">
                        {isEditingPersonal ? (
                          <form onSubmit={handleSavePersonal}>
                            <div className="sh-form-group">
                              <label>Full Legal Name</label>
                              <input
                                type="text"
                                className="sh-input"
                                value={profileData?.first_name ? `${profileData.first_name} ${profileData.father_name || ''} ${profileData.grandfather_name || ''}` : profileData?.username || ''}
                                disabled
                                style={{ background: '#F1F5F9', cursor: 'not-allowed' }}
                              />
                              <small style={{ color: '#64748B' }}>Legal name changes require HR/Administrative verification.</small>
                            </div>

                            <div className="sh-form-group">
                              <label htmlFor="edit-email">Email Address</label>
                              <input
                                id="edit-email"
                                type="email"
                                className="sh-input"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                placeholder="registrar@hspsms.edu.et"
                                maxLength={190}
                                required
                              />
                            </div>

                            <div className="sh-form-group">
                              <label htmlFor="edit-phone">Phone Number</label>
                              <input
                                id="edit-phone"
                                type="tel"
                                className="sh-input"
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                placeholder="+251 91 123 4567"
                                maxLength={30}
                              />
                            </div>

                            <div className="sh-form-group">
                              <label htmlFor="edit-address">Residential Address / City</label>
                              <input
                                id="edit-address"
                                type="text"
                                className="sh-input"
                                value={editAddress}
                                onChange={(e) => setEditAddress(e.target.value)}
                                placeholder="Addis Ababa, Bole Sub-City"
                                maxLength={255}
                              />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                              <button
                                type="button"
                                className="sh-btn sh-btn-secondary"
                                onClick={() => {
                                  setIsEditingPersonal(false);
                                  setEditEmail(profileData?.email || '');
                                  setEditPhone(profileData?.phone || '');
                                  setEditAddress(profileData?.address || '');
                                }}
                                disabled={savingPersonal}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="sh-btn sh-btn-primary"
                                disabled={savingPersonal}
                              >
                                {savingPersonal ? 'Saving Changes...' : 'Save Personal Details'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="registrar-info-grid">
                            <div className="registrar-info-row">
                              <span className="registrar-info-label">Full Name</span>
                              <span className="registrar-info-value">
                                {profileData?.first_name ? `${profileData.first_name} ${profileData.father_name || ''} ${profileData.grandfather_name || ''}` : profileData?.username || '—'}
                              </span>
                            </div>
                            {profileData?.name_am && (
                              <div className="registrar-info-row">
                                <span className="registrar-info-label">Amharic Name</span>
                                <span className="registrar-info-value">{profileData.name_am}</span>
                              </div>
                            )}
                            <div className="registrar-info-row">
                              <span className="registrar-info-label">Gender</span>
                              <span className="registrar-info-value" style={{ textTransform: 'capitalize' }}>
                                {profileData?.gender || '—'}
                              </span>
                            </div>
                            <div className="registrar-info-row">
                              <span className="registrar-info-label">Email</span>
                              <span className="registrar-info-value">{profileData?.email || '—'}</span>
                            </div>
                            <div className="registrar-info-row">
                              <span className="registrar-info-label">Phone</span>
                              <span className="registrar-info-value">{profileData?.phone || '—'}</span>
                            </div>
                            <div className="registrar-info-row">
                              <span className="registrar-info-label">Address</span>
                              <span className="registrar-info-value">{profileData?.address || '—'}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* EMPLOYMENT INFORMATION (READ ONLY) */}
                    <div className="sh-panel">
                      <div className="sh-panel-header">
                        <h3>Employment Information</h3>
                      </div>
                      <div className="sh-panel-body">
                        <div className="registrar-info-grid">
                          <div className="registrar-info-row">
                            <span className="registrar-info-label">Employee ID</span>
                            <span className="registrar-info-value">{profileData?.employee_no || '—'}</span>
                          </div>
                          <div className="registrar-info-row">
                            <span className="registrar-info-label">Job Title</span>
                            <span className="registrar-info-value">{profileData?.job_title || 'Chief Registrar Officer'}</span>
                          </div>
                          <div className="registrar-info-row">
                            <span className="registrar-info-label">Department</span>
                            <span className="registrar-info-value">{profileData?.department || 'Office of the Registrar'}</span>
                          </div>
                          <div className="registrar-info-row">
                            <span className="registrar-info-label">Staff Classification</span>
                            <span className="registrar-info-value" style={{ textTransform: 'capitalize' }}>
                              {profileData?.staff_type || 'Administrator'}
                            </span>
                          </div>
                          <div className="registrar-info-row">
                            <span className="registrar-info-label">Hire Date</span>
                            <span className="registrar-info-value">
                              {profileData?.hire_date ? new Date(profileData.hire_date).toLocaleDateString() : '—'}
                            </span>
                          </div>
                          <div className="registrar-info-row">
                            <span className="registrar-info-label">Employment Status</span>
                            <span className="registrar-info-value">
                              <span className="sh-badge sh-badge-emerald">
                                {profileData?.employment_status ? profileData.employment_status.toUpperCase() : 'ACTIVE'}
                              </span>
                            </span>
                          </div>
                        </div>
                        <small style={{ display: 'block', marginTop: 12, color: '#64748B' }}>
                          ℹ️ Employment records and official staff designations are centrally managed by School HR and System Administration.
                        </small>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Account Security + Audit Activity */}
                  <div className="registrar-profile-column">
                    {/* ACCOUNT SECURITY CARD */}
                    <div className="sh-panel">
                      <div className="sh-panel-header">
                        <h3>Account Security</h3>
                      </div>
                      <div className="sh-panel-body">
                        <div className="registrar-password-rules">
                          <strong>Password Requirements:</strong>
                          <ul>
                            <li>Minimum of 8 characters in length</li>
                            <li>At least one uppercase and one lowercase letter</li>
                            <li>At least one numeric digit (0–9)</li>
                          </ul>
                        </div>
                        <form onSubmit={handlePasswordChange}>
                          <div className="sh-form-group">
                            <label htmlFor="reg-curr-pass">Current Password</label>
                            <input
                              id="reg-curr-pass"
                              type="password"
                              className="sh-input"
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              placeholder="Enter your current password"
                              required
                            />
                          </div>

                          <div className="sh-form-group">
                            <label htmlFor="reg-new-pass">New Password</label>
                            <input
                              id="reg-new-pass"
                              type="password"
                              className="sh-input"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Enter new strong password"
                              required
                            />
                          </div>

                          <div className="sh-form-group">
                            <label htmlFor="reg-conf-pass">Confirm New Password</label>
                            <input
                              id="reg-conf-pass"
                              type="password"
                              className="sh-input"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              placeholder="Confirm new password"
                              required
                            />
                          </div>

                          <button
                            type="submit"
                            className="sh-btn sh-btn-primary"
                            style={{ width: '100%', marginTop: 8 }}
                            disabled={submittingPassword}
                          >
                            {submittingPassword ? 'Updating Password...' : 'Update Password'}
                          </button>
                        </form>
                      </div>
                    </div>

                    {/* ACCOUNT ACTIVITY & AUDIT LOGS */}
                    <div className="sh-panel">
                      <div className="sh-panel-header">
                        <h3>Account Activity</h3>
                      </div>
                      <div className="sh-panel-body" style={{ padding: 0 }}>
                        <div className="sh-table-container">
                          <table className="sh-table" style={{ fontSize: '12px' }}>
                            <thead>
                              <tr>
                                <th>Timestamp</th>
                                <th>Action</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {profileData?.recent_activity?.length > 0 ? (
                                profileData.recent_activity.map((act: any) => (
                                  <tr key={act.id}>
                                    <td style={{ whiteSpace: 'nowrap', color: '#64748B' }}>
                                      {new Date(act.occurred_at).toLocaleString()}
                                    </td>
                                    <td>
                                      <div style={{ fontWeight: 600, color: '#0F172A' }}>
                                        {act.action}
                                      </div>
                                      {act.reason && (
                                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                                          {act.reason}
                                        </div>
                                      )}
                                    </td>
                                    <td>
                                      <span className={`sh-badge ${act.outcome === 'success' ? 'sh-badge-emerald' : 'sh-badge-rose'}`}>
                                        {act.outcome}
                                      </span>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={3} className="sh-table-empty">
                                    No recorded activity entries found.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="sh-panel-body" style={{ borderTop: '1px solid #E2E8F0', fontSize: '12px', color: '#64748B' }}>
                        Last logged in: {profileData?.last_login_at ? new Date(profileData.last_login_at).toLocaleString() : 'Current session'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      </div>

      {/* ADMIT STUDENT MODAL */}
      {registerModalOpen && (
        <div className="sh-modal-overlay">
          <div className="sh-modal">
            <div className="sh-modal-header">
              <h3>{selectedApplicationId ? 'Register approved application' : 'Admit & Register New Student'}</h3>
              <button className="sh-modal-close" onClick={() => { setRegisterModalOpen(false); setSelectedApplicationId(undefined); }}>
                ✕
              </button>
            </div>
            <form onSubmit={handleRegisterStudent}>
              <div className="sh-modal-body">
                {regError && <div className="sh-alert sh-alert-error" role="alert">{regError}</div>}
                {!dashData?.sections?.some((section: any) => Number(section.available_seats) > 0) && (
                  <div className="sh-alert sh-alert-info" role="status">No active section currently has available seats.</div>
                )}
                {selectedApplicationId && (
                  <div className="sh-alert sh-alert-info" role="note">
                    Applicant details are taken from the approved application and cannot be changed in this registration step.
                  </div>
                )}
                <div className="registrar-registration-name-grid">
                  <div className="sh-form-group">
                    <label>First Name</label>
                    <input
                      type="text"
                      className="sh-input"
                      placeholder="e.g. Dawit"
                      maxLength={60}
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      disabled={Boolean(selectedApplicationId)}
                      required
                    />
                  </div>
                  <div className="sh-form-group">
                    <label>Father's Name</label>
                    <input
                      type="text"
                      className="sh-input"
                      placeholder="e.g. Girma"
                      maxLength={60}
                      value={regFatherName}
                      onChange={(e) => setRegFatherName(e.target.value)}
                      disabled={Boolean(selectedApplicationId)}
                      required
                    />
                  </div>
                  <div className="sh-form-group">
                    <label>Grandfather's Name (optional)</label>
                    <input
                      type="text"
                      className="sh-input"
                      placeholder="e.g. Tadesse"
                      maxLength={60}
                      value={regGrandfatherName}
                      onChange={(e) => setRegGrandfatherName(e.target.value)}
                      disabled={Boolean(selectedApplicationId)}
                    />
                  </div>
                </div>

                <div className="registrar-registration-fields-grid">
                  <div className="sh-form-group">
                    <label>Gender</label>
                    <select
                      className="sh-select"
                      value={regGender}
                      onChange={(e) => setRegGender(e.target.value as 'male' | 'female')}
                      disabled={Boolean(selectedApplicationId)}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div className="sh-form-group">
                    <label>Date of Birth</label>
                    <input
                      type="date"
                      className="sh-input"
                      max={DATE_TODAY}
                      value={regDob}
                      onChange={(e) => setRegDob(e.target.value)}
                      disabled={Boolean(selectedApplicationId)}
                      required
                    />
                  </div>
                </div>

                <div className="sh-form-group">
                  <label htmlFor="registrar-registration-grade">Grade *</label>
                  <select
                    id="registrar-registration-grade"
                    className="sh-select"
                    value={regGradeLevel}
                    onChange={(e) => {
                      const selectedLevel = e.target.value ? Number(e.target.value) : '';
                      setRegGradeLevel(selectedLevel);
                      // Grades 9 and 10 share the common curriculum; Grades 11 and 12 select a stream.
                      setRegStream(selectedLevel === '' || selectedLevel >= 11 ? '' : 'none');
                      setRegSectionId(0);
                    }}
                    required
                  >
                    <option value="">Select a grade</option>
                    {[9, 10, 11, 12].map((level) => (
                      <option key={level} value={level}>Grade {level}</option>
                    ))}
                  </select>
                  {!(dashData?.sections || []).some((sec: any) => Number(sec.grade_level) >= 9) && (
                    <small>No active Grade 9 or higher sections are configured.</small>
                  )}
                </div>
                <div className="sh-form-group">
                  <label htmlFor="registrar-registration-stream">Stream *</label>
                  <select
                    id="registrar-registration-stream"
                    className="sh-select"
                    value={regStream}
                    onChange={(e) => {
                      setRegStream(e.target.value as 'none' | 'natural_science' | 'social_science' | '');
                      setRegSectionId(0);
                    }}
                    required
                  >
                    <option value="">Select a stream</option>
                    {Number(regGradeLevel) >= 11 ? (
                      <>
                        <option value="natural_science">Natural</option>
                        <option value="social_science">Social</option>
                      </>
                    ) : regGradeLevel !== '' ? (
                      <option value="none">General / Common</option>
                    ) : null}
                  </select>
                  {regGradeLevel === '' && <small>Select a grade to choose a stream.</small>}
                  {regGradeLevel !== '' && regStream !== '' && !(dashData?.sections || []).some((sec: any) => Number(sec.grade_level) === Number(regGradeLevel) && sec.stream === regStream) && (
                    <small>No section is configured for this grade and stream yet.</small>
                  )}
                  {regGradeLevel !== '' && regStream !== '' && (dashData?.sections || []).some((sec: any) => Number(sec.grade_level) === Number(regGradeLevel) && sec.stream === regStream) && !(dashData?.sections || []).some((sec: any) => Number(sec.grade_level) === Number(regGradeLevel) && sec.stream === regStream && Number(sec.available_seats) > 0) && (
                    <small>All sections for this grade and stream are at capacity.</small>
                  )}
                </div>
                <div className="sh-form-group">
                  <label htmlFor="registrar-registration-section">Section *</label>
                  <select
                    id="registrar-registration-section"
                    className="sh-select"
                    value={regSectionId || ''}
                    onChange={(e) => setRegSectionId(Number(e.target.value))}
                    required
                  >
                    <option value="">{regGradeLevel === '' ? 'Select a grade first' : regStream === '' ? 'Select an available stream' : 'Select an available section'}</option>
                    {(dashData?.sections || [])
                      .filter((sec: any) => Number(sec.grade_level) === Number(regGradeLevel) && sec.stream === regStream && Number(sec.available_seats) > 0)
                      .map((sec: any) => (
                        <option key={sec.id} value={sec.id}>
                          Section {sec.section_name} — {sec.available_seats} seats available
                        </option>
                      ))}
                  </select>
                  {regGradeLevel !== '' && regStream !== '' && !(dashData?.sections || []).some((sec: any) => Number(sec.grade_level) === Number(regGradeLevel) && sec.stream === regStream && Number(sec.available_seats) > 0) && (
                    <small>No {regStream === 'natural_science' ? 'Natural' : regStream === 'social_science' ? 'Social' : 'General / Common'} sections with available seats are available for this grade.</small>
                  )}
                </div>

                <div className="registrar-registration-fields-grid">
                  <div className="sh-form-group">
                    <label>Student phone (optional)</label>
                    <input
                      type="text"
                      className="sh-input"
                      maxLength={30}
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      disabled={Boolean(selectedApplicationId)}
                    />
                  </div>
                  <div className="sh-form-group">
                    <label>Email (optional)</label>
                    <input
                      type="email"
                      className="sh-input"
                      maxLength={190}
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      disabled={Boolean(selectedApplicationId)}
                    />
                  </div>
                  <div className="sh-form-group">
                    <label>Previous school (optional)</label>
                    <input
                      type="text"
                      className="sh-input"
                      maxLength={190}
                      value={regPreviousSchool}
                      onChange={(e) => setRegPreviousSchool(e.target.value)}
                      disabled={Boolean(selectedApplicationId)}
                    />
                  </div>
                  <div className="sh-form-group">
                    <label>Address (optional)</label>
                    <input
                      type="text"
                      className="sh-input"
                      maxLength={255}
                      value={regAddress}
                      onChange={(e) => setRegAddress(e.target.value)}
                      disabled={Boolean(selectedApplicationId)}
                    />
                  </div>
                </div>
                <div className="sh-form-group">
                  <label htmlFor="registrar-student-photo">Student photo (optional)</label>
                  <input
                    ref={regPhotoInput}
                    id="registrar-student-photo"
                    type="file"
                    className="sh-input"
                    accept="image/jpeg,image/png"
                    disabled={photoReading || submittingReg}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      setRegError(null);
                      if (!file) {
                        setRegPhoto(null);
                        return;
                      }
                      if (!['image/jpeg', 'image/png'].includes(file.type)) {
                        event.currentTarget.value = '';
                        setRegPhoto(null);
                        setRegError('Choose a JPEG or PNG image for the student photo.');
                        return;
                      }
                      if (file.size === 0 || file.size > 20 * 1024 * 1024) {
                        event.currentTarget.value = '';
                        setRegPhoto(null);
                        setRegError('The photo must be 20 MB or smaller. The server may enforce a lower configured upload limit.');
                        return;
                      }
                      setRegPhoto(null);
                      setPhotoReading(true);
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') {
                          setRegPhoto({ originalName: file.name, mimeType: file.type, dataBase64: reader.result });
                        } else {
                          if (regPhotoInput.current) regPhotoInput.current.value = '';
                          setRegError('Could not read the selected photo.');
                        }
                        setPhotoReading(false);
                      };
                      reader.onerror = () => {
                        if (regPhotoInput.current) regPhotoInput.current.value = '';
                        setRegError('Could not read the selected photo.');
                        setPhotoReading(false);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <small>JPEG or PNG, 20 MB or smaller. The server enforces the school’s configured file-size limit.</small>
                  {photoReading && <small role="status">Reading selected photo…</small>}
                  {regPhoto && (
                    <div className="registrar-photo-preview">
                      <img src={regPhoto.dataBase64} alt="Selected student photo preview" />
                      <span>{regPhoto.originalName}</span>
                      <button
                        type="button"
                        className="sh-btn sh-btn-secondary sh-btn-sm"
                        onClick={() => {
                          setRegPhoto(null);
                          if (regPhotoInput.current) regPhotoInput.current.value = '';
                        }}
                        disabled={submittingReg}
                      >
                        Remove photo
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="sh-modal-footer">
                <button
                  type="button"
                  className="sh-btn sh-btn-secondary"
                  onClick={() => { setRegisterModalOpen(false); setSelectedApplicationId(undefined); }}
                  disabled={photoReading}
                >
                  Cancel
                </button>
                <button type="submit" className="sh-btn sh-btn-primary" disabled={submittingReg || photoReading || !dashData?.sections?.some((section: any) => Number(section.available_seats) > 0)}>
                  {submittingReg ? 'Admitting Student...' : 'Admit & Enroll Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REASSIGN SECTION MODAL */}
      {reassignModalOpen && targetStudent && (
        <div className="sh-modal-overlay">
          <div className="sh-modal">
            <div className="sh-modal-header">
              <h3>Reassign Section</h3>
              <button className="sh-modal-close" onClick={() => setReassignModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleReassignSection}>
              <div className="sh-modal-body">
                <p style={{ margin: '0 0 16px 0', fontSize: '14px' }}>
                  Reassigning <strong>{targetStudent.first_name} {targetStudent.father_name}</strong> (
                  {targetStudent.admission_no}) from current Section <strong>{targetStudent.section_name || 'Unassigned'}</strong>.
                </p>

                <div className="sh-form-group">
                  <label htmlFor="target-section-select">
                    Select Target Section <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <select
                    id="target-section-select"
                    className="sh-select"
                    value={newTargetSectionId || ''}
                    onChange={(e) => setNewTargetSectionId(Number(e.target.value))}
                    required
                  >
                    <option value="">-- Choose New Section --</option>
                    {dashData?.sections?.map((sec: any) => {
                      const isCurrent = Number(sec.id) === Number(targetStudent.section_id);
                      const isFull = Number(sec.available_seats) <= 0;
                      return (
                        <option
                          key={sec.id}
                          value={sec.id}
                          disabled={isCurrent || isFull}
                        >
                          Section {sec.section_name} ({sec.grade_name || `Grade ${sec.grade_level}`})
                          {isCurrent
                            ? ' — (Current Section)'
                            : isFull
                            ? ' — (Full, 0 seats)'
                            : ` — ${sec.available_seats} seats free`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="sh-form-group" style={{ marginTop: '16px' }}>
                  <label htmlFor="reassign-reason">
                    Reason for Reassignment <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <textarea
                    id="reassign-reason"
                    className="sh-input"
                    rows={3}
                    placeholder="e.g., Academic realignment, class size balancing, or parent/guardian request"
                    value={placementReason}
                    onChange={(e) => setPlacementReason(e.target.value)}
                    required
                    maxLength={500}
                    style={{ resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <small style={{ color: '#64748B' }}>A documented reason is required to preserve enrollment audit history.</small>
                    <small style={{ color: placementReason.length > 450 ? '#EF4444' : '#64748B' }}>
                      {placementReason.length}/500
                    </small>
                  </div>
                </div>
              </div>
              <div className="sh-modal-footer">
                <button
                  type="button"
                  className="sh-btn sh-btn-secondary"
                  onClick={() => setReassignModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sh-btn sh-btn-primary"
                  disabled={
                    submittingReassign ||
                    !newTargetSectionId ||
                    Number(newTargetSectionId) === Number(targetStudent.section_id) ||
                    !placementReason.trim()
                  }
                >
                  {submittingReassign ? 'Reassigning...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD TRANSFER MODAL */}
      {transferModalOpen && (
        <div className="sh-modal-overlay">
          <div className="sh-modal">
            <div className="sh-modal-header">
              <h3>Record Student Transfer / Withdrawal</h3>
              <button className="sh-modal-close" onClick={() => setTransferModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleRecordTransfer}>
              <div className="sh-modal-body">
                <div className="sh-form-group">
                  <label htmlFor="exit-student">Active student</label>
                  <select
                    id="exit-student"
                    className="sh-input"
                    value={transferStudentId}
                    onChange={(e) => setTransferStudentId(e.target.value ? Number(e.target.value) : '')}
                    required
                  >
                    <option value="">Select an active student</option>
                    {studentsList.filter((student) => student.status === 'active').map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.admission_no} · {student.first_name} {student.father_name} {student.grandfather_name || ''}
                      </option>
                    ))}
                  </select>
                  {studentsList.length === 0 && (
                    <small style={{ color: '#64748B' }}>No active students are available to process.</small>
                  )}
                </div>

                <div className="sh-form-group">
                  <label htmlFor="exit-type">Authorized action</label>
                  <select
                    id="exit-type"
                    className="sh-select"
                    value={transferType}
                    onChange={(e) => setTransferType(e.target.value as 'transfer' | 'withdrawal')}
                  >
                    <option value="transfer">Transfer out to another school</option>
                    <option value="withdrawal">Formal withdrawal</option>
                  </select>
                </div>

                {transferType === 'transfer' && <div className="sh-form-group">
                  <label>Destination School</label>
                  <input
                    type="text"
                    className="sh-input"
                    placeholder="e.g. Menelik II High School"
                    maxLength={190}
                    value={destinationSchool}
                    onChange={(e) => setDestinationSchool(e.target.value)}
                  />
                </div>}

                <div className="sh-form-group">
                  <label>Reason for Departure</label>
                  <textarea
                    className="sh-textarea"
                    rows={3}
                    placeholder="Provide official rationale for records..."
                    maxLength={500}
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    required
                  ></textarea>
                </div>

                <div className="sh-form-group">
                  <label>Effective Date</label>
                  <input
                    type="date"
                    className="sh-input"
                    value={transferDate}
                    max={DATE_TODAY}
                    onChange={(e) => setTransferDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="sh-modal-footer">
                <button
                  type="button"
                  className="sh-btn sh-btn-secondary"
                  onClick={() => setTransferModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sh-btn sh-btn-primary" disabled={submittingTransfer || studentsList.length === 0}>
                  {submittingTransfer ? 'Recording Departure...' : 'Record Departure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DATA QUALITY DRILLDOWN MODAL */}
      {dqModalOpen && (
        <div className="sh-modal-overlay" onClick={() => setDqModalOpen(false)}>
          <div
            className="sh-modal-dialog"
            style={{ maxWidth: 860 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sh-modal-header">
              <div>
                <h3 className="sh-modal-title">{dqModalTitle}</h3>
                <p className="sh-modal-desc" style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Audited directly from MySQL database. Read-only records responsible for this data quality count.
                </p>
              </div>
              <button
                type="button"
                className="sh-modal-close"
                onClick={() => setDqModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="sh-modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {dqDetailLoading && (
                <div className="sh-loading" style={{ margin: '30px 0' }}>
                  <div className="sh-spinner"></div>
                  <span>Loading underlying records from MySQL…</span>
                </div>
              )}

              {dqDetailError && (
                <div className="sh-alert sh-alert-error" role="alert">
                  <span>{dqDetailError}</span>
                  <button
                    type="button"
                    className="sh-btn sh-btn-sm sh-btn-secondary"
                    onClick={() => void handleDqPageChange(dqDetailPage)}
                    style={{ marginLeft: 12 }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {!dqDetailLoading && !dqDetailError && (
                <>
                  {dqDetailItems.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                      No records found for this data quality check.
                    </div>
                  ) : (
                    <div className="sh-table-container">
                      <table className="sh-table">
                        {dqIndicator === 'students_without_guardians' && (
                          <>
                            <thead>
                              <tr>
                                <th>Admission No</th>
                                <th>Student Name</th>
                                <th>Gender</th>
                                <th>Grade / Section</th>
                                <th>Admission Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dqDetailItems.map((st) => (
                                <tr key={st.id}>
                                  <td><strong>{st.admission_no}</strong></td>
                                  <td>{st.first_name} {st.father_name} {st.grandfather_name || ''}</td>
                                  <td>{st.gender}</td>
                                  <td>{st.grade_name ? `${st.grade_name} · ${st.section_name || ''}` : (st.section_name || '—')}</td>
                                  <td>{st.admission_date ? new Date(st.admission_date).toLocaleDateString() : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </>
                        )}

                        {dqIndicator === 'guardians_pending_verification' && (
                          <>
                            <thead>
                              <tr>
                                <th>Guardian Name</th>
                                <th>Phone</th>
                                <th>Email</th>
                                <th>Status</th>
                                <th>Created At</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dqDetailItems.map((g) => (
                                <tr key={g.id}>
                                  <td><strong>{g.first_name} {g.father_name} {g.grandfather_name || ''}</strong></td>
                                  <td>{g.phone || '—'}</td>
                                  <td>{g.email || '—'}</td>
                                  <td><span className="sh-badge badge-warning">{g.verification_status}</span></td>
                                  <td>{g.created_at ? new Date(g.created_at).toLocaleDateString() : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </>
                        )}

                        {dqIndicator === 'active_students_without_current_enrollment' && (
                          <>
                            <thead>
                              <tr>
                                <th>Admission No</th>
                                <th>Student Name</th>
                                <th>Status</th>
                                <th>Gender</th>
                                <th>Admission Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dqDetailItems.map((st) => (
                                <tr key={st.id}>
                                  <td><strong>{st.admission_no}</strong></td>
                                  <td>{st.first_name} {st.father_name} {st.grandfather_name || ''}</td>
                                  <td><span className="sh-badge badge-success">{st.status}</span></td>
                                  <td>{st.gender}</td>
                                  <td>{st.admission_date ? new Date(st.admission_date).toLocaleDateString() : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </>
                        )}

                        {dqIndicator === 'current_assessments_without_finalized_marks' && (
                          <>
                            <thead>
                              <tr>
                                <th>Assessment Title</th>
                                <th>Academic Year / Term</th>
                                <th>Grade / Section</th>
                                <th>Subject</th>
                                <th>Weight</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dqDetailItems.map((a) => (
                                <tr key={a.id}>
                                  <td><strong>{a.title}</strong></td>
                                  <td>{a.academic_year_name} · {a.term_name}</td>
                                  <td>{a.grade_name} ({a.section_name})</td>
                                  <td>{a.subject_name}</td>
                                  <td>{a.weight_percent ? `${a.weight_percent}%` : '—'}</td>
                                  <td><span className="sh-badge badge-warning">{a.status}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </>
                        )}
                      </table>
                    </div>
                  )}

                  {/* Pagination */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 16,
                      fontSize: '13px',
                      color: '#64748b'
                    }}
                  >
                    <span>
                      Total: <strong>{dqDetailTotal}</strong> {dqDetailTotal === 1 ? 'record' : 'records'}
                    </span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        type="button"
                        className="sh-btn sh-btn-secondary sh-btn-sm"
                        disabled={dqDetailPage <= 1 || dqDetailLoading}
                        onClick={() => void handleDqPageChange(dqDetailPage - 1)}
                      >
                        Previous
                      </button>
                      <span>
                        Page {dqDetailPage} of {Math.max(1, Math.ceil(dqDetailTotal / 10))}
                      </span>
                      <button
                        type="button"
                        className="sh-btn sh-btn-secondary sh-btn-sm"
                        disabled={dqDetailPage >= Math.ceil(dqDetailTotal / 10) || dqDetailLoading}
                        onClick={() => void handleDqPageChange(dqDetailPage + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="sh-modal-footer">
              <button
                type="button"
                className="sh-btn sh-btn-secondary"
                onClick={() => setDqModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
