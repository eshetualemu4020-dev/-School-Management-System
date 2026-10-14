import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../api/client';
import '../StakeholderDashboards.css';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'sections' | 'transfers' | 'documents'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Data states
  const [dashData, setDashData] = useState<any>(null);
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [sectionsList, setSectionsList] = useState<any[]>([]);
  const [transfersList, setTransfersList] = useState<any[]>([]);
  const [documentsList, setDocumentsList] = useState<any[]>([]);

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
  const [regDob, setRegDob] = useState('2009-05-15');
  const [regGradeLevel, setRegGradeLevel] = useState(11);
  const [regSectionId, setRegSectionId] = useState(1);
  const [regStream, setRegStream] = useState('natural_science');
  const [regEmergencyName, setRegEmergencyName] = useState('');
  const [regEmergencyPhone, setRegEmergencyPhone] = useState('+251911223344');
  const [submittingReg, setSubmittingReg] = useState(false);

  // Reassign Section Modal
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [targetStudent, setTargetStudent] = useState<any>(null);
  const [newTargetSectionId, setNewTargetSectionId] = useState<number>(1);
  const [submittingReassign, setSubmittingReassign] = useState(false);

  // Transfer Modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferStudentId, setTransferStudentId] = useState<number>(1);
  const [transferType, setTransferType] = useState('transfer_out');
  const [transferReason, setTransferReason] = useState('Family relocation to Hawassa');
  const [destinationSchool, setDestinationSchool] = useState('Hawassa Comprehensive Secondary School');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  useEffect(() => {
    loadRegistrarData();
  }, []);

  const loadRegistrarData = async () => {
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

  const handleTabSwitch = (tab: 'overview' | 'students' | 'sections' | 'transfers' | 'documents') => {
    setActiveTab(tab);
    setActionMessage(null);
    if (tab === 'students') loadStudents();
    if (tab === 'sections') loadSections();
    if (tab === 'transfers') loadTransfers();
    if (tab === 'documents') loadDocuments();
  };

  const handleRegisterStudent = async (e: FormEvent) => {
    e.preventDefault();
    if (!regFirstName.trim() || !regFatherName.trim() || !regGrandfatherName.trim()) {
      setActionMessage({ text: 'Complete student names are required.', type: 'error' });
      return;
    }

    setSubmittingReg(true);
    try {
      const res = await api.registerStudent({
        firstName: regFirstName.trim(),
        fatherName: regFatherName.trim(),
        grandfatherName: regGrandfatherName.trim(),
        gender: regGender,
        dateOfBirth: regDob,
        gradeLevel: Number(regGradeLevel),
        sectionId: Number(regSectionId),
        stream: regStream,
        emergencyContactName: regEmergencyName.trim() || undefined,
        emergencyContactPhone: regEmergencyPhone.trim() || undefined
      });

      setActionMessage({
        text: `Student ${res.fullName} admitted with Admission No ${res.admissionNo}!`,
        type: 'success'
      });
      setRegisterModalOpen(false);
      setRegFirstName('');
      setRegFatherName('');
      setRegGrandfatherName('');
      loadRegistrarData();
      if (activeTab === 'students') loadStudents();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to register student: ' + err.message, type: 'error' });
    } finally {
      setSubmittingReg(false);
    }
  };

  const handleReassignSection = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetStudent) return;

    setSubmittingReassign(true);
    try {
      await api.reassignStudentSection(targetStudent.id, Number(newTargetSectionId));
      setActionMessage({
        text: `Student ${targetStudent.first_name} ${targetStudent.father_name} reassigned to Section successfully!`,
        type: 'success'
      });
      setReassignModalOpen(false);
      loadRegistrarData();
      if (activeTab === 'students') loadStudents();
      if (activeTab === 'sections') loadSections();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to reassign section: ' + err.message, type: 'error' });
    } finally {
      setSubmittingReassign(false);
    }
  };

  const handleRecordTransfer = async (e: FormEvent) => {
    e.preventDefault();
    setSubmittingTransfer(true);
    try {
      await api.recordStudentTransfer({
        studentId: Number(transferStudentId),
        transferType,
        reason: transferReason,
        destinationSchool: destinationSchool || undefined,
        effectiveDate: transferDate
      });
      setActionMessage({ text: 'Student transfer record created and student status updated!', type: 'success' });
      setTransferModalOpen(false);
      loadRegistrarData();
      if (activeTab === 'transfers') loadTransfers();
      if (activeTab === 'students') loadStudents();
    } catch (err: any) {
      setActionMessage({ text: 'Failed to record transfer: ' + err.message, type: 'error' });
    } finally {
      setSubmittingTransfer(false);
    }
  };

  return (
    <div className="sh-shell">
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

      {/* Nav Tabs */}
      <nav className="sh-nav-bar">
        <div className="sh-nav-tabs">
          <button
            className={`sh-nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('overview')}
          >
            📊 Admissions Overview
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'students' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('students')}
          >
            👥 Student Directory
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'sections' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('sections')}
          >
            🏫 Section Capacities & Seats
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'transfers' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('transfers')}
          >
            📋 Transfers & Withdrawals
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('documents')}
          >
            📁 Student Records & Documents
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="sh-btn sh-btn-secondary sh-btn-sm" onClick={() => setTransferModalOpen(true)}>
            📋 Record Transfer
          </button>
          <button className="sh-btn sh-btn-primary sh-btn-sm" onClick={() => setRegisterModalOpen(true)}>
            + Admit Student
          </button>
        </div>
      </nav>

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
                      <div className="sh-metric-value">{dashData.metrics.totalStudents}</div>
                      <p className="sh-metric-sub">{dashData.metrics.activeStudents} active status</p>
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
                      <div className="sh-metric-value">{dashData.metrics.transfersCount}</div>
                      <p className="sh-metric-sub">Processed this academic year</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-amber">📋</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Verified Student Records</h4>
                      <div className="sh-metric-value">{dashData.metrics.verifiedDocuments}</div>
                      <p className="sh-metric-sub">Birth certificates & transcripts</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-purple">📁</div>
                  </div>
                </div>

                {/* Split: Section Capacities & Recent Admissions */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
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
                                  {new Date(st.created_at).toLocaleDateString()}
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
                    <p className="sh-page-desc">Complete database of enrolled, transferred, and prospective students</p>
                  </div>
                  <button className="sh-btn sh-btn-primary" onClick={() => setRegisterModalOpen(true)}>
                    + Admit New Student
                  </button>
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
                              <td>{st.grade_name || `Grade ${st.grade_level}`}</td>
                              <td>Section {st.section_name || 'Unassigned'}</td>
                              <td>
                                <span className="sh-badge sh-badge-slate">{st.stream}</span>
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
                                  onClick={() => {
                                    setTargetStudent(st);
                                    setNewTargetSectionId(st.section_id || 1);
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
            {activeTab === 'sections' && (
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
                    <p className="sh-page-desc">Formal exit records and student destination schools</p>
                  </div>
                  <button className="sh-btn sh-btn-primary" onClick={() => setTransferModalOpen(true)}>
                    + Record Student Transfer
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
                              <td style={{ fontWeight: 700 }}>{t.first_name} {t.father_name}</td>
                              <td>{t.admission_no}</td>
                              <td>
                                <span className="sh-badge sh-badge-amber">{t.transfer_type}</span>
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
                    <h2 className="sh-page-title">Student Record Verification & Archives</h2>
                    <p className="sh-page-desc">Birth certificates, previous transcripts, and registration files</p>
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
                              <td style={{ fontWeight: 700 }}>{d.first_name} {d.father_name}</td>
                              <td>{d.admission_no}</td>
                              <td>{d.document_type || 'Birth Certificate / Previous Grade Transcript'}</td>
                              <td>
                                <span className="sh-badge sh-badge-emerald">✓ Verified</span>
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
          </>
        )}
      </main>

      {/* ADMIT STUDENT MODAL */}
      {registerModalOpen && (
        <div className="sh-modal-overlay">
          <div className="sh-modal">
            <div className="sh-modal-header">
              <h3>Admit & Register New Student</h3>
              <button className="sh-modal-close" onClick={() => setRegisterModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleRegisterStudent}>
              <div className="sh-modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div className="sh-form-group">
                    <label>First Name</label>
                    <input
                      type="text"
                      className="sh-input"
                      placeholder="e.g. Dawit"
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="sh-form-group">
                    <label>Father's Name</label>
                    <input
                      type="text"
                      className="sh-input"
                      placeholder="e.g. Girma"
                      value={regFatherName}
                      onChange={(e) => setRegFatherName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="sh-form-group">
                    <label>Grandfather's Name</label>
                    <input
                      type="text"
                      className="sh-input"
                      placeholder="e.g. Tadesse"
                      value={regGrandfatherName}
                      onChange={(e) => setRegGrandfatherName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="sh-form-group">
                    <label>Gender</label>
                    <select
                      className="sh-select"
                      value={regGender}
                      onChange={(e) => setRegGender(e.target.value as any)}
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
                      value={regDob}
                      onChange={(e) => setRegDob(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="sh-form-group">
                    <label>Grade Level</label>
                    <select
                      className="sh-select"
                      value={regGradeLevel}
                      onChange={(e) => setRegGradeLevel(Number(e.target.value))}
                    >
                      <option value={9}>Grade 9</option>
                      <option value={10}>Grade 10</option>
                      <option value={11}>Grade 11</option>
                      <option value={12}>Grade 12</option>
                    </select>
                  </div>

                  <div className="sh-form-group">
                    <label>Academic Stream</label>
                    <select
                      className="sh-select"
                      value={regStream}
                      onChange={(e) => setRegStream(e.target.value)}
                    >
                      <option value="none">General (Grades 9-10)</option>
                      <option value="natural_science">Natural Science</option>
                      <option value="social_science">Social Science</option>
                    </select>
                  </div>
                </div>

                <div className="sh-form-group">
                  <label>Assign to Section</label>
                  <select
                    className="sh-select"
                    value={regSectionId}
                    onChange={(e) => setRegSectionId(Number(e.target.value))}
                  >
                    {dashData?.sections?.map((sec: any) => (
                      <option key={sec.id} value={sec.id}>
                        Section {sec.section_name} ({sec.grade_name || `Grade ${sec.grade_level}`}) — {sec.available_seats} seats free
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="sh-form-group">
                    <label>Emergency Contact Name</label>
                    <input
                      type="text"
                      className="sh-input"
                      placeholder="e.g. Girma Tadesse"
                      value={regEmergencyName}
                      onChange={(e) => setRegEmergencyName(e.target.value)}
                    />
                  </div>
                  <div className="sh-form-group">
                    <label>Emergency Contact Phone</label>
                    <input
                      type="text"
                      className="sh-input"
                      placeholder="e.g. +251911223344"
                      value={regEmergencyPhone}
                      onChange={(e) => setRegEmergencyPhone(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="sh-modal-footer">
                <button
                  type="button"
                  className="sh-btn sh-btn-secondary"
                  onClick={() => setRegisterModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sh-btn sh-btn-primary" disabled={submittingReg}>
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
                  {targetStudent.admission_no}) from current Section {targetStudent.section_name}.
                </p>

                <div className="sh-form-group">
                  <label>Select Target Section</label>
                  <select
                    className="sh-select"
                    value={newTargetSectionId}
                    onChange={(e) => setNewTargetSectionId(Number(e.target.value))}
                  >
                    {dashData?.sections?.map((sec: any) => (
                      <option key={sec.id} value={sec.id}>
                        Section {sec.section_name} ({sec.grade_name || `Grade ${sec.grade_level}`}) — {sec.available_seats} seats free
                      </option>
                    ))}
                  </select>
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
                <button type="submit" className="sh-btn sh-btn-primary" disabled={submittingReassign}>
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
                  <label>Student ID</label>
                  <input
                    type="number"
                    className="sh-input"
                    min={1}
                    value={transferStudentId}
                    onChange={(e) => setTransferStudentId(Number(e.target.value))}
                    required
                  />
                  <small style={{ color: '#64748B' }}>e.g. Student ID (1 to 15)</small>
                </div>

                <div className="sh-form-group">
                  <label>Transfer Type</label>
                  <select
                    className="sh-select"
                    value={transferType}
                    onChange={(e) => setTransferType(e.target.value)}
                  >
                    <option value="transfer_out">Transfer Out (Relocation / Other School)</option>
                    <option value="withdrawal">Formal Withdrawal</option>
                    <option value="medical_leave">Medical Leave</option>
                  </select>
                </div>

                <div className="sh-form-group">
                  <label>Destination School</label>
                  <input
                    type="text"
                    className="sh-input"
                    placeholder="e.g. Menelik II High School"
                    value={destinationSchool}
                    onChange={(e) => setDestinationSchool(e.target.value)}
                  />
                </div>

                <div className="sh-form-group">
                  <label>Reason for Departure</label>
                  <textarea
                    className="sh-textarea"
                    rows={3}
                    placeholder="Provide official rationale for records..."
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
                <button type="submit" className="sh-btn sh-btn-primary" disabled={submittingTransfer}>
                  {submittingTransfer ? 'Recording Departure...' : 'Record Departure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
