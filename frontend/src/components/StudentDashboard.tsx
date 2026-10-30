import { useState, useEffect } from 'react';
import { api } from '../api/client';
import '../TeacherDashboard.css';
import '../StudentDashboard.css';
import { StudentSettings } from './student/StudentSettings';
import { StudentSubjects } from './student/StudentSubjects';
import { StudentTimetable } from './student/StudentTimetable';
import { StudentAttendance } from './student/StudentAttendance';
import { StudentAssessments } from './student/StudentAssessments';
import { StudentResults } from './student/StudentResults';
import { StudentDocuments } from './student/StudentDocuments';
import { StudentNotifications } from './student/StudentNotifications';
import { StudentHelpSupport } from './student/StudentHelpSupport';
import { StudentProfile } from './student/StudentProfile';
import { StudentSpinner, StudentErrorState } from './student/StudentCommon';

export type StudentPage =
  | 'dashboard'
  | 'subjects'
  | 'timetable'
  | 'attendance'
  | 'assessments'
  | 'results'
  | 'documents'
  | 'services'
  | 'notifications'
  | 'help'
  | 'settings'
  | 'profile';

interface StudentDashboardProps {
  user: {
    username: string;
    role: string;
    permissions: string[];
  };
  onLogout: () => void;
}

const getStudentPageFromPath = (path: string): StudentPage => {
  const clean = path.replace(/\/$/, '');
  if (clean === '/student' || clean === '/student/dashboard' || clean === '') return 'dashboard';
  if (clean.startsWith('/student/subjects')) return 'subjects';
  if (clean.startsWith('/student/timetable')) return 'timetable';
  if (clean.startsWith('/student/attendance')) return 'attendance';
  if (clean.startsWith('/student/assessments')) return 'assessments';
  if (clean.startsWith('/student/results')) return 'results';
  if (clean.startsWith('/student/documents')) return 'documents';
  if (clean.startsWith('/student/services') || clean.startsWith('/student/library') || clean.startsWith('/student/fees')) return 'services';
  if (clean.startsWith('/student/notifications')) return 'notifications';
  if (clean.startsWith('/student/help')) return 'help';
  if (clean.startsWith('/student/settings')) return 'settings';
  if (clean.startsWith('/student/profile')) return 'profile';
  return 'dashboard';
};

export default function StudentDashboard({ user, onLogout }: StudentDashboardProps) {
  const [activePage, setActivePage] = useState<StudentPage>(() => getStudentPageFromPath(window.location.pathname));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashData, setDashData] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState<number | undefined>(undefined);
  const [notificationsVersion, setNotificationsVersion] = useState(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const navigateTo = (page: StudentPage) => {
    setActivePage(page);
    const targetPath = `/student/${page}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setActivePage(getStudentPageFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/student' || window.location.pathname === '/student/') {
      window.history.replaceState(null, '', '/student/dashboard');
    }
  }, []);

  useEffect(() => {
    loadStudentData();
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getNotifications()
      .then((items) => {
        if (!cancelled) setUnreadNotifications((items || []).filter((item) => !item.read_at).length);
      })
      .catch(() => {
        if (!cancelled) setUnreadNotifications(undefined);
      });
    return () => { cancelled = true; };
  }, [notificationsVersion]);

  const loadStudentData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getStudentDashboard();
      setDashData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load student dashboard records.');
    } finally {
      setLoading(false);
    }
  };

  const studentFullName = dashData?.profile?.first_name
    ? `${dashData.profile.first_name} ${dashData.profile.father_name}`
    : user.username;

  if (loading) {
    return (
      <div className="teacher-shell student-dashboard-shell">
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
              <span>Student Academic Portal</span>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="user-profile-badge">
              <div className="user-avatar">{user.username.charAt(0).toUpperCase()}</div>
              <div className="user-details">
                <div className="user-name">{user.username}</div>
                <div className="user-role-label">Student</div>
              </div>
            </div>
            <button type="button" className="topbar-logout-btn" onClick={onLogout}>Sign Out</button>
          </div>
        </header>
        <StudentSpinner message="Loading student enrollment and academic data from MySQL 8..." />
      </div>
    );
  }

  if (error || !dashData) {
    return (
      <div className="teacher-shell student-dashboard-shell">
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
              <span>Student Academic Portal</span>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="user-profile-badge">
              <div className="user-avatar">{user.username.charAt(0).toUpperCase()}</div>
              <div className="user-details">
                <div className="user-name">{user.username}</div>
                <div className="user-role-label">Student</div>
              </div>
            </div>
            <button type="button" className="topbar-logout-btn" onClick={onLogout}>Sign Out</button>
          </div>
        </header>
        <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
          <StudentErrorState title="Failed to load student profile" message={error || 'Unable to connect to MySQL backend.'} onRetry={loadStudentData} />
        </div>
      </div>
    );
  }

  const { profile, attendance, marks, assignments, reportCard, announcements } = dashData;

  const sidebarItems: Array<{
    page: StudentPage;
    label: string;
    icon: string;
    badge?: number;
  }> = [
    { page: 'dashboard', label: 'Dashboard', icon: '📊' },
    { page: 'subjects', label: 'Subjects & Materials', icon: '📚' },
    { page: 'timetable', label: 'Timetable & Calendar', icon: '🗓️' },
    { page: 'attendance', label: 'Attendance', icon: '📋' },
    { page: 'assessments', label: 'Assignments & Tests', icon: '✍️', badge: assignments?.length },
    { page: 'results', label: 'Results & Progress', icon: '📈', badge: marks?.length },
    { page: 'documents', label: 'Report Cards & Docs', icon: '📑' },
    { page: 'services', label: 'Library & Fees', icon: '💳' },
    { page: 'notifications', label: 'Notifications', icon: '🔔', badge: unreadNotifications },
    { page: 'help', label: 'Help & Support', icon: '💬' },
    { page: 'settings', label: 'Settings & Security', icon: '⚙️' },
    { page: 'profile', label: 'My Profile', icon: '👤' }
  ];

  return (
    <div className="teacher-shell student-dashboard-shell">
      {/* TOAST MESSAGE */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: '#1F3A5F',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          fontWeight: 600,
          fontSize: '14px',
          zIndex: 9999
        }}>
          {toastMessage}
        </div>
      )}

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
            <span>Student Academic Portal</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            fontSize: '12px',
            color: '#64748B',
            background: '#F1F5F9',
            padding: '6px 12px',
            borderRadius: '20px',
            fontWeight: 600
          }}>
            📍 Addis Ababa &bull; 2019 E.C. (2026/27)
          </div>

          <div className="topbar-actions">
            <div
              className="user-profile-badge"
              onClick={() => navigateTo('profile')}
              style={{ cursor: 'pointer' }}
              title="View My Profile"
            >
              <div className="user-avatar">{studentFullName.charAt(0).toUpperCase()}</div>
              <div className="user-details">
                <div className="user-name">{studentFullName}</div>
                <div className="user-role-label">Student ({profile?.admission_no || user.username})</div>
              </div>
            </div>

            <button type="button" className="topbar-logout-btn" onClick={onLogout}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* 2. BODY LAYOUT: SIDEBAR + CONTENT */}
      <div className="teacher-layout">
        {/* LEFT SIDEBAR WITH 12 SEQUENCED PAGES */}
        <aside className="teacher-sidebar">
          <nav className="sidebar-nav">
            <div className="sidebar-nav-title">Student Portal</div>

            {sidebarItems.map((item) => {
              const isActive = activePage === item.page;
              return (
                <button
                  key={item.page}
                  type="button"
                  className={`sidebar-tab-btn ${isActive ? 'active' : ''}`}
                  onClick={() => navigateTo(item.page)}
                >
                  <span style={{ fontSize: '16px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="sidebar-badge">{item.badge}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="sidebar-footer-card">
            <h4>Enrolled Section</h4>
            <p>
              {profile?.section_name
                ? `${profile?.grade_name || `Grade ${profile?.grade_level}`} — Section ${profile?.section_name}`
                : 'Placement in Progress'}
            </p>
            <p style={{ marginTop: '2px', color: '#1F3A5F', fontWeight: 600 }}>
              {profile?.stream ? (profile.stream === 'none' ? 'General Stream' : profile.stream) : 'Awaiting Section Allocation'}
            </p>
            <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>
              {profile?.roll_no ? `Roll No: #${profile.roll_no} • ` : ''}{profile?.academic_year_name || '2026/27'}
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="teacher-content">
          {/* ============================================================== */}
          {/* PAGE 1: DASHBOARD */}
          {/* ============================================================== */}
          {activePage === 'dashboard' && (
            <div className="student-dashboard-overview">
              <div className="page-header">
                <div>
                  <h2 className="page-title">Welcome back, {studentFullName} 👋</h2>
                  <p className="page-subtitle">
                    Here is your official academic summary for {profile?.academic_year_name || '2026/27 Academic Year'}.
                  </p>
                </div>
              </div>

              {/* UNENROLLED WELCOME NOTICE */}
              {!profile?.enrollment_id && (
                <div style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '10px',
                  padding: '16px 20px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px'
                }}>
                  <span style={{ fontSize: '26px' }}>ℹ️</span>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1E40AF', fontSize: '14px' }}>
                      Admitted Student Profile — Class Placement in Progress
                    </div>
                    <div style={{ fontSize: '13px', color: '#3B82F6', marginTop: '3px' }}>
                      Welcome, <strong>{studentFullName}</strong>! Your student account (Admission No: <strong>{profile?.admission_no}</strong>) is verified and active. The registrar office is currently finalizing section assignments. Your timetable, subjects, and teacher materials will appear here as soon as placement is confirmed.
                    </div>
                  </div>
                </div>
              )}

              {/* QUICK METRICS GRID */}
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-title">Term Attendance</span>
                    <span className="metric-badge badge-blue">Term 1</span>
                  </div>
                  <div className="metric-value">
                    {attendance?.summary?.rate ?? 100}%
                  </div>
                  <div className="metric-subtext">
                    {attendance?.summary?.present || 0} Present &bull; {attendance?.summary?.absent || 0} Absent &bull; {attendance?.summary?.late || 0} Late
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-title">Term Average</span>
                    <span className="metric-badge badge-green">Official</span>
                  </div>
                  <div className="metric-value">
                    {reportCard?.averagePercent ? `${reportCard.averagePercent}%` : (marks?.length ? `${(marks.reduce((a: number, b: any) => a + (Number(b.score) || 0), 0) / marks.length).toFixed(1)}%` : 'N/A')}
                  </div>
                  <div className="metric-subtext">
                    Class Rank: #{reportCard?.classRank || 1} of {reportCard?.classSize || 30}
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-title">Active Assessments</span>
                    <span className="metric-badge badge-orange">{assignments?.length || 0} Open</span>
                  </div>
                  <div className="metric-value">{assignments?.length || 0}</div>
                  <div className="metric-subtext">Upcoming in next 7 days</div>
                </div>

                <div className="metric-card">
                  <div className="metric-header">
                    <span className="metric-title">Enrollment Status</span>
                    <span className="metric-badge badge-green">Active</span>
                  </div>
                  <div className="metric-value" style={{ fontSize: '18px', paddingTop: '4px' }}>
                    Grade {profile?.grade_level} - {profile?.section_name}
                  </div>
                  <div className="metric-subtext">
                    Roll #{profile?.roll_no || 1} &bull; Adm: {profile?.admission_no}
                  </div>
                </div>
              </div>

              {/* QUICK LINKS BANNER */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                margin: '24px 0'
              }}>
                <button
                  type="button"
                  onClick={() => navigateTo('subjects')}
                  style={{
                    padding: '14px',
                    background: '#fff',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>📚</div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B' }}>My Subjects</div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>View syllabus and materials</div>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTo('timetable')}
                  style={{
                    padding: '14px',
                    background: '#fff',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>🗓️</div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B' }}>Today's Lessons</div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>Check live period schedule</div>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTo('results')}
                  style={{
                    padding: '14px',
                    background: '#fff',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>📈</div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B' }}>Official Results</div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>Review published marks</div>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTo('documents')}
                  style={{
                    padding: '14px',
                    background: '#fff',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>📑</div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B' }}>Report Cards</div>
                  <div style={{ fontSize: '12px', color: '#64748B' }}>Download official term PDF</div>
                </button>
              </div>

              {/* ANNOUNCEMENTS & RECENT ASSIGNMENTS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: '#1F3A5F' }}>
                    📢 School Announcements
                  </h3>
                  {announcements?.length === 0 ? (
                    <p style={{ color: '#64748B', fontSize: '14px' }}>No active announcements for your grade.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {announcements?.slice(0, 3).map((a: any) => (
                        <div key={a.id} style={{ padding: '12px', background: '#F8FAFC', borderRadius: '8px' }}>
                          <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '14px' }}>{a.title}</div>
                          <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '13px' }}>{a.body}</p>
                          <small style={{ color: '#94A3B8', fontSize: '11px', display: 'block', marginTop: '6px' }}>
                            Published: {new Date(a.published_at).toLocaleDateString()}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ background: '#fff', padding: '20px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: '#1F3A5F' }}>
                    ✍️ Upcoming Deadlines (Next 7 Days)
                  </h3>
                  {assignments?.length === 0 ? (
                    <p style={{ color: '#64748B', fontSize: '14px' }}>No upcoming assignments or tests due.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {assignments?.slice(0, 3).map((item: any) => (
                        <div key={item.id} style={{ padding: '12px', background: '#F8FAFC', borderRadius: '8px', borderLeft: '4px solid #F59E0B' }}>
                          <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '14px' }}>{item.title}</div>
                          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                            {item.subject_name} &bull; Max Mark: {item.max_score}
                          </div>
                          <div style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600, marginTop: '4px' }}>
                            ⏰ Due: {new Date(item.due_at).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* PAGE 2: SUBJECTS & MATERIALS (Fully Built in Step 2) */}
          {/* ============================================================== */}
          {activePage === 'subjects' && (
            <StudentSubjects onNavigateTab={(page) => navigateTo(page as StudentPage)} />
          )}

          {/* ============================================================== */}
          {/* PAGE 3: TIMETABLE & CALENDAR (Fully Built in Step 3) */}
          {/* ============================================================== */}
          {activePage === 'timetable' && (
            <StudentTimetable />
          )}

          {/* ============================================================== */}
          {/* ============================================================== */}
          {/* PAGE 4: ATTENDANCE & ROLL CALL (Fully Built in Step 3) */}
          {/* ============================================================== */}
          {activePage === 'attendance' && (
            <StudentAttendance />
          )}

          {/* ============================================================== */}
          {/* PAGE 5: ASSIGNMENTS & ASSESSMENTS (Fully Built in Step 4) */}
          {/* ============================================================== */}
          {activePage === 'assessments' && (
            <StudentAssessments />
          )}

          {/* ============================================================== */}
          {/* PAGE 6: RESULTS & ACADEMIC PROGRESS (Fully Built in Step 4) */}
          {/* ============================================================== */}
          {activePage === 'results' && (
            <StudentResults />
          )}

          {/* ============================================================== */}
          {/* PAGE 7: REPORT CARDS & DOCUMENTS */}
          {/* ============================================================== */}
          {activePage === 'documents' && (
            <StudentDocuments showToast={showToast} onNavigateTab={(page) => navigateTo(page as StudentPage)} />
          )}

          {/* ============================================================== */}
          {/* PAGE: NOTIFICATIONS & ANNOUNCEMENTS */}
          {/* ============================================================== */}
          {activePage === 'notifications' && (
            <StudentNotifications showToast={showToast} onInboxChange={() => setNotificationsVersion((v) => v + 1)} />
          )}

          {/* ============================================================== */}
          {/* PAGE: HELP & SUPPORT */}
          {/* ============================================================== */}
          {activePage === 'help' && (
            <StudentHelpSupport showToast={showToast} />
          )}

          {/* ============================================================== */}
          {/* PAGE 11: SETTINGS & SECURITY (Fully Built in Step 1) */}
          {/* ============================================================== */}
          {activePage === 'settings' && (
            <StudentSettings showToast={showToast} />
          )}

          {/* ============================================================== */}
          {/* PAGE 12: MY PROFILE */}
          {/* ============================================================== */}
          {activePage === 'profile' && (
            <StudentProfile showToast={showToast} onNavigateTab={(page) => navigateTo(page as StudentPage)} />
          )}

          {/* ============================================================== */}
          {/* PAGES 8–10 & 12 ROADMAP PLACEHOLDERS (Steps 6–7) */}
          {/* ============================================================== */}
          {activePage !== 'dashboard' && activePage !== 'settings' && activePage !== 'subjects' && activePage !== 'timetable' && activePage !== 'attendance' && activePage !== 'assessments' && activePage !== 'results' && activePage !== 'documents' && activePage !== 'notifications' && activePage !== 'help' && activePage !== 'profile' && (
            <div style={{
              background: '#fff',
              padding: '40px 28px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                {sidebarItems.find((s) => s.page === activePage)?.icon || '⏳'}
              </div>
              <h2 style={{ margin: '0 0 8px', color: '#1F3A5F', fontSize: '20px', fontWeight: 800 }}>
                {sidebarItems.find((s) => s.page === activePage)?.label}
              </h2>
              <p style={{ margin: '0 auto 20px', color: '#64748B', fontSize: '14px', maxWidth: '480px', lineHeight: 1.5 }}>
                Foundation complete. This page is scheduled in the phased build sequence:
              </p>
              <div style={{
                display: 'inline-block',
                background: '#F1F5F9',
                color: '#334155',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600
              }}>
                {activePage === 'services' && '➡️ Step 6: Library & Fees (3 Tabs)'}
              </div>
              <div style={{ marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => navigateTo('dashboard')}
                  style={{ background: '#1F3A5F', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
                >
                  &larr; Return to Dashboard
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
