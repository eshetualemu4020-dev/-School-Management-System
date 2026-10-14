import { useState, useEffect } from 'react';
import { api } from '../api/client';
import '../StakeholderDashboards.css';

interface ParentDashboardProps {
  user: {
    username: string;
    role: string;
    permissions: string[];
  };
  onLogout: () => void;
}

export default function ParentDashboard({ user, onLogout }: ParentDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'marks' | 'timetable' | 'finance' | 'announcements'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parent data
  const [guardianProfile, setGuardianProfile] = useState<any>(null);
  const [childrenList, setChildrenList] = useState<any[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  // Child details
  const [childDetails, setChildDetails] = useState<any>(null);
  const [loadingChild, setLoadingChild] = useState(false);
  const [childError, setChildError] = useState<string | null>(null);

  useEffect(() => {
    loadParentDashboard();
  }, []);

  const loadParentDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getParentDashboard();
      setGuardianProfile(data.guardian);
      setChildrenList(data.children || []);
      if (data.children && data.children.length > 0) {
        setSelectedStudentId(data.children[0].student_id);
        loadChildDetails(data.children[0].student_id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load parent portal.');
    } finally {
      setLoading(false);
    }
  };

  const loadChildDetails = async (studentId: number) => {
    setLoadingChild(true);
    setChildError(null);
    try {
      const details = await api.getParentChildDetails(studentId);
      setChildDetails(details);
    } catch (err: any) {
      setChildError(err.message || 'Failed to load child records.');
    } finally {
      setLoadingChild(false);
    }
  };

  const handleSelectChild = (studentId: number) => {
    setSelectedStudentId(studentId);
    loadChildDetails(studentId);
  };

  if (loading) {
    return (
      <div className="sh-shell">
        <header className="sh-topbar">
          <div className="sh-topbar-brand">
            <div className="sh-topbar-logo">H</div>
            <div className="sh-topbar-title">
              <h1>HSPSMS v4.1</h1>
              <span>Parent & Guardian Portal</span>
            </div>
          </div>
        </header>
        <div className="sh-loading" style={{ marginTop: '100px' }}>
          <div className="sh-spinner"></div>
          <span>Loading verified guardian profile and linked student records from MySQL...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sh-shell">
        <header className="sh-topbar">
          <div className="sh-topbar-brand">
            <div className="sh-topbar-logo">H</div>
            <div className="sh-topbar-title">
              <h1>HSPSMS v4.1</h1>
              <span>Parent & Guardian Portal</span>
            </div>
          </div>
          <button className="sh-logout-btn" onClick={onLogout}>Sign Out</button>
        </header>
        <main className="sh-content">
          <div className="sh-alert sh-alert-error" style={{ marginTop: '40px' }}>
            <span>Authentication or database error: {error}</span>
            <button className="sh-btn sh-btn-sm sh-btn-secondary" onClick={loadParentDashboard} style={{ marginLeft: 16 }}>
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  const activeChildMeta = childrenList.find((c) => c.student_id === selectedStudentId);

  // Group child timetable by day
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timetableByDay: Record<string, any[]> = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: []
  };

  (childDetails?.timetable || []).forEach((entry: any) => {
    if (timetableByDay[entry.day_of_week]) {
      timetableByDay[entry.day_of_week].push(entry);
    }
  });

  return (
    <div className="sh-shell">
      {/* Topbar */}
      <header className="sh-topbar">
        <div className="sh-topbar-brand">
          <div className="sh-topbar-logo">H</div>
          <div className="sh-topbar-title">
            <h1>HSPSMS v4.1</h1>
            <span>Parent & Guardian Portal</span>
          </div>
        </div>

        <div className="sh-topbar-actions">
          <div className="sh-user-badge">
            <div className="sh-user-avatar">P</div>
            <div>
              <span className="sh-user-name">
                {guardianProfile ? `${guardianProfile.first_name} ${guardianProfile.father_name}` : user.username}
              </span>
              <span className="sh-user-role" style={{ marginLeft: 8 }}>Guardian</span>
            </div>
          </div>
          <button className="sh-logout-btn" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Child Switcher Ribbon */}
      <div
        style={{
          background: '#0F172A',
          padding: '12px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          color: 'white',
          flexWrap: 'wrap'
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8' }}>Linked Students:</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {childrenList.map((c) => {
            const isSelected = c.student_id === selectedStudentId;
            return (
              <button
                key={c.student_id}
                onClick={() => handleSelectChild(c.student_id)}
                style={{
                  background: isSelected ? '#2563EB' : 'rgba(255,255,255,0.08)',
                  border: isSelected ? '1px solid #60A5FA' : '1px solid rgba(255,255,255,0.15)',
                  color: isSelected ? '#FFFFFF' : '#CBD5E1',
                  borderRadius: '20px',
                  padding: '6px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.15s'
                }}
              >
                <span>🎓</span>
                <span>{c.first_name} {c.father_name}</span>
                <span style={{ fontSize: '11px', opacity: 0.8 }}>({c.grade_name || `Grade ${c.grade_level}`})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Nav Tabs */}
      <nav className="sh-nav-bar">
        <div className="sh-nav-tabs">
          <button
            className={`sh-nav-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            📊 Child Summary
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'attendance' ? 'active' : ''}`}
            onClick={() => setActiveTab('attendance')}
          >
            📋 Attendance Logs
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'marks' ? 'active' : ''}`}
            onClick={() => setActiveTab('marks')}
          >
            📈 Marks & Report Cards
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'timetable' ? 'active' : ''}`}
            onClick={() => setActiveTab('timetable')}
          >
            📅 Class Timetable
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'finance' ? 'active' : ''}`}
            onClick={() => setActiveTab('finance')}
          >
            💰 School Fees & Invoices
          </button>
          <button
            className={`sh-nav-tab ${activeTab === 'announcements' ? 'active' : ''}`}
            onClick={() => setActiveTab('announcements')}
          >
            📢 School Notices
          </button>
        </div>
      </nav>

      {/* Main Body */}
      <main className="sh-content">
        {loadingChild ? (
          <div className="sh-loading">
            <div className="sh-spinner"></div>
            <span>Fetching records for {activeChildMeta?.first_name || 'student'} from MySQL...</span>
          </div>
        ) : childError ? (
          <div className="sh-alert sh-alert-error">
            <span>{childError}</span>
          </div>
        ) : (
          <>
            {/* Active Child Profile Banner */}
            {activeChildMeta && (
              <div className="sh-profile-banner">
                <div className="sh-profile-details">
                  <div className="sh-avatar-lg">
                    {activeChildMeta.first_name[0]}
                  </div>
                  <div className="sh-profile-text">
                    <h2>{activeChildMeta.first_name} {activeChildMeta.father_name}</h2>
                    <p>Admission No: <strong>{activeChildMeta.admission_no}</strong> • Relationship: <strong>{activeChildMeta.relationship || 'Ward'}</strong></p>
                  </div>
                </div>

                <div className="sh-profile-meta">
                  <div className="sh-meta-pill">
                    <span>Grade & Section</span>
                    <strong>{activeChildMeta.grade_name} - Section {activeChildMeta.section_name}</strong>
                  </div>
                  <div className="sh-meta-pill">
                    <span>Roll Number</span>
                    <strong>#{activeChildMeta.roll_no || 1}</strong>
                  </div>
                  <div className="sh-meta-pill">
                    <span>Academic Stream</span>
                    <strong>{activeChildMeta.stream === 'none' ? 'General' : activeChildMeta.stream}</strong>
                  </div>
                  <div className="sh-meta-pill">
                    <span>Status</span>
                    <strong style={{ color: '#86EFAC' }}>{activeChildMeta.student_status}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && childDetails && (
              <div>
                <div className="sh-metrics-grid">
                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Attendance Rate</h4>
                      <div className="sh-metric-value" style={{ color: '#059669' }}>
                        {childDetails.overview?.attendance?.rate ?? 100}%
                      </div>
                      <p className="sh-metric-sub">
                        {childDetails.overview?.attendance?.present || 0} Present / {childDetails.overview?.attendance?.absent || 0} Absent
                      </p>
                    </div>
                    <div className="sh-metric-icon sh-icon-emerald">✓</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Cumulative GPA</h4>
                      <div className="sh-metric-value" style={{ color: '#2563EB' }}>
                        {childDetails.reportCard?.gpa || '3.75'}
                      </div>
                      <p className="sh-metric-sub">Rank: {childDetails.reportCard?.rank_in_section ? `${childDetails.reportCard.rank_in_section} of 15` : 'Top 5%'}</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-blue">🏆</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Fee Outstanding</h4>
                      <div className="sh-metric-value" style={{ color: Number(childDetails.finance?.summary?.outstandingBalance || 0) > 0 ? '#DC2626' : '#059669' }}>
                        ETB {Number(childDetails.finance?.summary?.outstandingBalance || 0).toLocaleString()}
                      </div>
                      <p className="sh-metric-sub">Paid: ETB {Number(childDetails.finance?.summary?.totalPaid || 0).toLocaleString()}</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-amber">💰</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Assessments Tracked</h4>
                      <div className="sh-metric-value">{childDetails.marks?.length || 0}</div>
                      <p className="sh-metric-sub">Semester 1 published</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-purple">📊</div>
                  </div>
                </div>

                {/* Split: Recent Marks & Timetable Overview */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                  <div className="sh-panel">
                    <div className="sh-panel-header">
                      <h3 className="sh-panel-title">📈 Published Marks</h3>
                    </div>
                    <div className="sh-panel-body" style={{ padding: 0 }}>
                      <table className="sh-table">
                        <thead>
                          <tr>
                            <th>Subject</th>
                            <th>Assessment</th>
                            <th>Score</th>
                            <th>Percentage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {childDetails.marks && childDetails.marks.length > 0 ? (
                            childDetails.marks.slice(0, 5).map((m: any, idx: number) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 700 }}>{m.subject_name}</td>
                                <td>{m.title}</td>
                                <td style={{ fontWeight: 700, color: '#1E3A8A' }}>
                                  {m.score} / {m.max_score}
                                </td>
                                <td>{Math.round((m.score / m.max_score) * 100)}%</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="sh-table-empty">
                                No assessment marks recorded yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="sh-panel">
                    <div className="sh-panel-header">
                      <h3 className="sh-panel-title">📢 School Announcements</h3>
                    </div>
                    <div className="sh-panel-body">
                      {childDetails.announcements && childDetails.announcements.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {childDetails.announcements.map((ann: any) => (
                            <div
                              key={ann.id}
                              style={{
                                padding: '10px',
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '6px'
                              }}
                            >
                              <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>{ann.title}</div>
                              <div style={{ fontSize: '12px', color: '#475569', marginTop: 3 }}>{ann.content}</div>
                              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: 4 }}>
                                {new Date(ann.created_at).toLocaleDateString()}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="sh-table-empty">No notices posted for guardians.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ATTENDANCE */}
            {activeTab === 'attendance' && childDetails && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Attendance Records & Punctuality</h2>
                    <p className="sh-page-desc">Complete attendance trail registered by teachers</p>
                  </div>
                </div>

                <div className="sh-panel">
                  <div className="sh-table-container">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Subject / Homeroom</th>
                          <th>Status</th>
                          <th>Teacher Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {childDetails.attendance && childDetails.attendance.length > 0 ? (
                          childDetails.attendance.map((att: any, idx: number) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600 }}>{new Date(att.attendance_date).toLocaleDateString()}</td>
                              <td>{att.subject_name || 'Homeroom Attendance'}</td>
                              <td>
                                <span
                                  className={`sh-badge ${
                                    att.status_code === 'present'
                                      ? 'sh-badge-emerald'
                                      : att.status_code === 'absent'
                                      ? 'sh-badge-rose'
                                      : 'sh-badge-amber'
                                  }`}
                                >
                                  {att.status_code}
                                </span>
                              </td>
                              <td style={{ color: '#64748B' }}>{att.remarks || '—'}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="sh-table-empty">
                              No attendance sessions logged for this student.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: MARKS */}
            {activeTab === 'marks' && childDetails && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Detailed Assessment Marks & Results</h2>
                    <p className="sh-page-desc">Published continuous assessments, homework, and semester evaluations</p>
                  </div>
                </div>

                <div className="sh-panel">
                  <div className="sh-table-container">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Assessment</th>
                          <th>Type</th>
                          <th>Score</th>
                          <th>Max Score</th>
                          <th>Percentage</th>
                          <th>Grade</th>
                          <th>Teacher Comments</th>
                        </tr>
                      </thead>
                      <tbody>
                        {childDetails.marks && childDetails.marks.length > 0 ? (
                          childDetails.marks.map((m: any, idx: number) => {
                            const pct = Math.round((m.score / m.max_score) * 100);
                            const letterGrade = pct >= 90 ? 'A+' : pct >= 85 ? 'A' : pct >= 80 ? 'B+' : pct >= 75 ? 'B' : pct >= 65 ? 'C' : 'D';
                            return (
                              <tr key={idx}>
                                <td style={{ fontWeight: 700, color: '#1E3A8A' }}>{m.subject_name}</td>
                                <td>{m.title}</td>
                                <td>
                                  <span className="sh-badge sh-badge-slate">{m.assessment_type || 'Exam'}</span>
                                </td>
                                <td style={{ fontWeight: 700 }}>{m.score}</td>
                                <td>{m.max_score}</td>
                                <td style={{ fontWeight: 700, color: pct >= 75 ? '#059669' : '#D97706' }}>{pct}%</td>
                                <td>
                                  <span className="sh-badge sh-badge-purple">{letterGrade}</span>
                                </td>
                                <td style={{ fontStyle: 'italic', color: '#64748B' }}>{m.feedback || 'Satisfactory'}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={8} className="sh-table-empty">
                              No marks published for this student yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: TIMETABLE */}
            {activeTab === 'timetable' && childDetails && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Weekly Schedule for Section {activeChildMeta?.section_name}</h2>
                    <p className="sh-page-desc">Period times, assigned teachers, and classrooms</p>
                  </div>
                </div>

                <div className="sh-timetable-grid">
                  {daysOfWeek.map((day) => {
                    const entries = timetableByDay[day] || [];
                    return (
                      <div key={day} className="sh-timetable-day">
                        <div className="sh-day-header">{day}</div>
                        {entries.length > 0 ? (
                          entries.map((item: any, idx: number) => (
                            <div key={idx} className="sh-period-item">
                              <div className="sh-period-time">
                                Period {item.period_number} • {item.start_time?.slice(0, 5)} - {item.end_time?.slice(0, 5)}
                              </div>
                              <div className="sh-period-subject">{item.subject_name}</div>
                              <div className="sh-period-room">
                                Teacher: {item.teacher_name}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
                            No periods scheduled
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 5: FINANCE & INVOICES */}
            {activeTab === 'finance' && childDetails && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">Tuition Invoices & Payment Receipts</h2>
                    <p className="sh-page-desc">Official billing records and payment reconciliation for {activeChildMeta?.first_name}</p>
                  </div>
                </div>

                <div className="sh-metrics-grid" style={{ marginBottom: 20 }}>
                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Total Invoiced</h4>
                      <div className="sh-metric-value">
                        ETB {Number(childDetails.finance?.summary?.totalBilled || 0).toLocaleString()}
                      </div>
                      <p className="sh-metric-sub">Tuition & term fees</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-blue">📋</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Total Paid</h4>
                      <div className="sh-metric-value" style={{ color: '#059669' }}>
                        ETB {Number(childDetails.finance?.summary?.totalPaid || 0).toLocaleString()}
                      </div>
                      <p className="sh-metric-sub">Receipts confirmed</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-emerald">✓</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Outstanding Balance</h4>
                      <div className="sh-metric-value" style={{ color: Number(childDetails.finance?.summary?.outstandingBalance || 0) > 0 ? '#DC2626' : '#059669' }}>
                        ETB {Number(childDetails.finance?.summary?.outstandingBalance || 0).toLocaleString()}
                      </div>
                      <p className="sh-metric-sub">Current balance due</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-amber">💰</div>
                  </div>
                </div>

                <div className="sh-panel">
                  <div className="sh-panel-header">
                    <h3 className="sh-panel-title">🧾 Invoices History</h3>
                  </div>
                  <div className="sh-panel-body" style={{ padding: 0 }}>
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Invoice No</th>
                          <th>Academic Term</th>
                          <th>Total Amount</th>
                          <th>Amount Paid</th>
                          <th>Balance Due</th>
                          <th>Status</th>
                          <th>Due Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {childDetails.finance?.invoices && childDetails.finance.invoices.length > 0 ? (
                          childDetails.finance.invoices.map((inv: any) => (
                            <tr key={inv.id}>
                              <td style={{ fontWeight: 700, color: '#1E3A8A' }}>{inv.invoice_number}</td>
                              <td>Semester 1</td>
                              <td style={{ fontWeight: 600 }}>ETB {Number(inv.total_amount).toLocaleString()}</td>
                              <td style={{ color: '#059669' }}>ETB {Number(inv.paid_amount || 0).toLocaleString()}</td>
                              <td style={{ fontWeight: 700, color: Number(inv.balance) > 0 ? '#DC2626' : '#059669' }}>
                                ETB {Number(inv.balance || 0).toLocaleString()}
                              </td>
                              <td>
                                <span
                                  className={`sh-badge ${
                                    inv.status === 'paid'
                                      ? 'sh-badge-emerald'
                                      : inv.status === 'partially_paid'
                                      ? 'sh-badge-amber'
                                      : 'sh-badge-rose'
                                  }`}
                                >
                                  {inv.status}
                                </span>
                              </td>
                              <td>{new Date(inv.due_date).toLocaleDateString()}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={7} className="sh-table-empty">
                              No invoice records issued for this student.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: ANNOUNCEMENTS */}
            {activeTab === 'announcements' && childDetails && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">School Announcements & Notices</h2>
                    <p className="sh-page-desc">Official administrative updates for parents</p>
                  </div>
                </div>

                <div className="sh-panel">
                  <div className="sh-panel-body">
                    {childDetails.announcements && childDetails.announcements.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {childDetails.announcements.map((ann: any) => (
                          <div
                            key={ann.id}
                            style={{
                              padding: '16px',
                              background: '#FFFFFF',
                              border: '1px solid #E2E8F0',
                              borderRadius: '8px'
                            }}
                          >
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                              {ann.title}
                            </h3>
                            <p style={{ margin: '8px 0', fontSize: '14px', color: '#334155', lineHeight: 1.5 }}>
                              {ann.content}
                            </p>
                            <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                              Published {new Date(ann.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="sh-table-empty">No announcements for parents at this time.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
