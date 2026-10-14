import { useState, useEffect } from 'react';
import { api } from '../api/client';
import '../TeacherDashboard.css';

interface StudentDashboardProps {
  user: {
    username: string;
    role: string;
    permissions: string[];
  };
  onLogout: () => void;
}

export default function StudentDashboard({ user, onLogout }: StudentDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'timetable' | 'attendance' | 'marks' | 'assignments' | 'reportcard'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashData, setDashData] = useState<any>(null);

  useEffect(() => {
    loadStudentData();
  }, []);

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
      <div className="teacher-shell">
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
        </header>
        <div style={{ textAlign: 'center', padding: '100px 20px', color: '#64748B' }}>
          <div className="spinner" style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '28px', height: '28px' }}></div>
          <p>Loading student enrollment and academic data from MySQL...</p>
        </div>
      </div>
    );
  }

  if (error || !dashData) {
    return (
      <div className="teacher-shell">
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
          <button type="button" className="topbar-logout-btn" onClick={onLogout}>Sign Out</button>
        </header>
        <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
          <div className="alert-banner alert-danger">
            <span>⚠️ Failed to load student profile: {error}</span>
            <button className="btn-secondary btn-sm" onClick={loadStudentData} style={{ marginLeft: 16 }}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { profile, timetable, attendance, marks, assignments, reportCard, announcements } = dashData;

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timetableByDay: Record<string, any[]> = {
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: []
  };

  (timetable || []).forEach((entry: any) => {
    if (timetableByDay[entry.day_of_week]) {
      timetableByDay[entry.day_of_week].push(entry);
    }
  });

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
            <span>Student Academic Portal</span>
          </div>
        </div>

        <div className="topbar-search">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search subjects, assignments, timetable..."
            aria-label="Student portal search"
          />
        </div>

        <div className="topbar-actions">
          <div className="user-profile-badge">
            <div className="user-avatar">{studentFullName.charAt(0).toUpperCase()}</div>
            <div className="user-details">
              <div className="user-name">{studentFullName}</div>
              <div className="user-role-label">Student ({user.username})</div>
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

      {/* 2. BODY LAYOUT: SIDEBAR + CONTENT */}
      <div className="teacher-layout">
        {/* LEFT SIDEBAR NAVIGATION */}
        <aside className="teacher-sidebar">
          <nav className="sidebar-nav">
            <div className="sidebar-nav-title">Student Menu</div>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Profile &amp; Overview</span>
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'timetable' ? 'active' : ''}`}
              onClick={() => setActiveTab('timetable')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Weekly Timetable</span>
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
              onClick={() => setActiveTab('attendance')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span>Attendance History</span>
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'marks' ? 'active' : ''}`}
              onClick={() => setActiveTab('marks')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Marks &amp; Grades</span>
              {marks?.length ? <span className="sidebar-badge">{marks.length}</span> : null}
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'assignments' ? 'active' : ''}`}
              onClick={() => setActiveTab('assignments')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>Assignments</span>
              {assignments?.length ? <span className="sidebar-badge">{assignments.length}</span> : null}
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'reportcard' ? 'active' : ''}`}
              onClick={() => setActiveTab('reportcard')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>Official Report Card</span>
            </button>
          </nav>

          <div className="sidebar-footer-card">
            <h4>Enrolled Section</h4>
            <p>
              {profile?.grade_name || `Grade ${profile?.grade_level}`} — Section {profile?.section_name}
            </p>
            <p style={{ marginTop: '2px', color: '#1F3A5F', fontWeight: 600 }}>
              {profile?.stream === 'none' ? 'General Stream' : profile?.stream}
            </p>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="teacher-content">
          {/* ============================================================== */}
          {/* TAB 1: OVERVIEW & PROFILE */}
          {/* ============================================================== */}
          {activeTab === 'overview' && (
            <div>
              <div className="page-header-row">
                <div>
                  <div className="page-breadcrumb">
                    <span>Student Portal</span> / <span>Dashboard</span>
                  </div>
                  <h2 className="page-title">Welcome back, {profile?.first_name || user.username}</h2>
                </div>
                <div className="spec-reference-tag">Live MySQL 8 Connected</div>
              </div>

              {/* STUDENT PROFILE CARD */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '10px', background: '#1F3A5F', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', fontWeight: 700 }}>
                    {profile?.first_name ? profile.first_name[0] : 'S'}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1F3A5F' }}>
                      {profile?.first_name} {profile?.father_name} {profile?.grandfather_name}
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748B' }}>
                      Admission No: <strong>{profile?.admission_no}</strong> • Roll No: <strong>{profile?.roll_no || '1'}</strong>
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <div className="active-meta-pill" style={{ background: '#EAF1F8', color: '#1F3A5F', padding: '6px 14px', borderRadius: '8px' }}>
                    <span style={{ fontSize: '10px', display: 'block', textTransform: 'uppercase', color: '#64748B' }}>Grade &amp; Section</span>
                    <strong>{profile?.grade_name || `Grade ${profile?.grade_level}`} - {profile?.section_name}</strong>
                  </div>
                  <div className="active-meta-pill" style={{ background: '#EAF1F8', color: '#1F3A5F', padding: '6px 14px', borderRadius: '8px' }}>
                    <span style={{ fontSize: '10px', display: 'block', textTransform: 'uppercase', color: '#64748B' }}>Stream</span>
                    <strong>{profile?.stream === 'none' ? 'General' : profile?.stream}</strong>
                  </div>
                  <div className="active-meta-pill" style={{ background: '#EAF1F8', color: '#1F3A5F', padding: '6px 14px', borderRadius: '8px' }}>
                    <span style={{ fontSize: '10px', display: 'block', textTransform: 'uppercase', color: '#64748B' }}>Academic Year</span>
                    <strong>{profile?.academic_year_name || '2026/27'}</strong>
                  </div>
                </div>
              </div>

              {/* 4 KPI METRIC CARDS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: '#FFFFFF', padding: '18px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Attendance Rate</div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#2A7F62', margin: '4px 0' }}>
                    {attendance?.summary?.rate ?? 100}%
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    {attendance?.summary?.present || 0} Present • {attendance?.summary?.absent || 0} Absent
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '18px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Published Marks</div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#1F3A5F', margin: '4px 0' }}>
                    {marks?.length || 0}
                  </div>
                  <div style={{ fontSize: '11px', color: '#2A7F62' }}>Assessments recorded</div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '18px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Active Assignments</div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: '#2E6DA4', margin: '4px 0' }}>
                    {assignments?.length || 0}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Tasks assigned</div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '18px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Report Card Status</div>
                  <div style={{ fontSize: '26px', fontWeight: 700, color: reportCard ? '#2A7F62' : '#B7791F', margin: '4px 0' }}>
                    {reportCard ? 'Available' : 'Pending'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    {reportCard ? `Cumulative GPA: ${reportCard.gpa}` : 'Awaiting term publish'}
                  </div>
                </div>
              </div>

              {/* SPLIT: RECENT MARKS & ANNOUNCEMENTS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1F3A5F', marginBottom: '14px' }}>
                    📈 Recent Assessment Marks
                  </h3>
                  <div className="data-table-container">
                    <table className="spec-table">
                      <thead>
                        <tr>
                          <th>Subject</th>
                          <th>Assessment</th>
                          <th>Score</th>
                          <th>Percentage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marks && marks.length > 0 ? (
                          marks.slice(0, 5).map((m: any, i: number) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{m.subject_name}</td>
                              <td>{m.title}</td>
                              <td style={{ fontWeight: 700 }}>
                                {m.score} / {m.max_score}
                              </td>
                              <td>
                                <span className="badge-solid badge-emerald">
                                  {Math.round((m.score / m.max_score) * 100)}%
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: '#64748B' }}>
                              No marks published yet for this term.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#1F3A5F', marginBottom: '14px' }}>
                    📢 School Announcements
                  </h3>
                  {announcements && announcements.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {announcements.map((ann: any) => (
                        <div
                          key={ann.id}
                          style={{
                            borderLeft: '3px solid #2E6DA4',
                            padding: '10px 14px',
                            background: '#F8FAFC',
                            borderRadius: '0 8px 8px 0'
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '13px', color: '#1F3A5F' }}>{ann.title}</div>
                          <div style={{ fontSize: '12px', color: '#475569', marginTop: 4 }}>{ann.content}</div>
                          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: 6 }}>
                            {new Date(ann.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: '#94A3B8', textAlign: 'center', margin: 0 }}>No announcements at this time.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: WEEKLY TIMETABLE */}
          {/* ============================================================== */}
          {activeTab === 'timetable' && (
            <div>
              <div className="page-header-row">
                <div>
                  <div className="page-breadcrumb">
                    <span>Student Portal</span> / <span>Timetable</span>
                  </div>
                  <h2 className="page-title">Weekly Class Schedule</h2>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                {daysOfWeek.map((day) => {
                  const entries = timetableByDay[day] || [];
                  return (
                    <div key={day} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                      <div style={{ background: '#1F3A5F', color: '#FFFFFF', padding: '10px 14px', fontWeight: 700, fontSize: '13px' }}>
                        {day}
                      </div>
                      <div style={{ padding: '8px 12px' }}>
                        {entries.length > 0 ? (
                          entries.map((item: any, idx: number) => (
                            <div key={idx} style={{ padding: '8px 0', borderBottom: idx < entries.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                              <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>
                                Period {item.period_number} • {item.start_time?.slice(0, 5)} - {item.end_time?.slice(0, 5)}
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1F3A5F', marginTop: 2 }}>
                                {item.subject_name}
                              </div>
                              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: 2 }}>
                                Teacher: {item.teacher_name} {item.room_name ? `• Room ${item.room_name}` : ''}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
                            No lessons scheduled
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: ATTENDANCE HISTORY */}
          {/* ============================================================== */}
          {activeTab === 'attendance' && (
            <div>
              <div className="page-header-row">
                <div>
                  <div className="page-breadcrumb">
                    <span>Student Portal</span> / <span>Attendance</span>
                  </div>
                  <h2 className="page-title">Attendance History &amp; Records</h2>
                </div>
              </div>

              {/* KPI CARDS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Attendance Rate</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#2A7F62', margin: '4px 0' }}>
                    {attendance?.summary?.rate ?? 100}%
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Required: &ge; 85%</div>
                </div>
                <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Days Present</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#1F3A5F', margin: '4px 0' }}>
                    {attendance?.summary?.present || 0}
                  </div>
                  <div style={{ fontSize: '11px', color: '#2A7F62' }}>Attended class</div>
                </div>
                <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Days Absent</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#C0392B', margin: '4px 0' }}>
                    {attendance?.summary?.absent || 0}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Unexcused absences</div>
                </div>
                <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Days Late</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#B7791F', margin: '4px 0' }}>
                    {attendance?.summary?.late || 0}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>Tardy arrivals</div>
                </div>
              </div>

              <div className="data-table-container">
                <table className="spec-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Subject / Period</th>
                      <th>Status</th>
                      <th>Remarks / Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance?.records && attendance.records.length > 0 ? (
                      attendance.records.map((r: any, idx: number) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{new Date(r.attendance_date).toLocaleDateString()}</td>
                          <td>{r.subject_name || 'Daily Homeroom Session'}</td>
                          <td>
                            <span
                              className={`badge-solid ${
                                r.status_code === 'present'
                                  ? 'badge-emerald'
                                  : r.status_code === 'absent'
                                  ? 'badge-rose'
                                  : 'badge-amber'
                              }`}
                            >
                              {r.status_code}
                            </span>
                          </td>
                          <td style={{ color: '#64748B' }}>{r.remarks || '—'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                          No attendance records registered yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: MARKS & PERFORMANCE */}
          {/* ============================================================== */}
          {activeTab === 'marks' && (
            <div>
              <div className="page-header-row">
                <div>
                  <div className="page-breadcrumb">
                    <span>Student Portal</span> / <span>Marks</span>
                  </div>
                  <h2 className="page-title">Assessment Marks &amp; Subject Performance</h2>
                </div>
              </div>

              <div className="data-table-container">
                <table className="spec-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Assessment Title</th>
                      <th>Type</th>
                      <th>Score</th>
                      <th>Max Score</th>
                      <th>Percentage</th>
                      <th>Letter Grade</th>
                      <th>Feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marks && marks.length > 0 ? (
                      marks.map((m: any, idx: number) => {
                        const pct = Math.round((m.score / m.max_score) * 100);
                        const letterGrade = pct >= 90 ? 'A+' : pct >= 85 ? 'A' : pct >= 80 ? 'B+' : pct >= 75 ? 'B' : pct >= 65 ? 'C' : 'D';
                        return (
                          <tr key={idx}>
                            <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{m.subject_name}</td>
                            <td>{m.title}</td>
                            <td>
                              <span className="badge-solid badge-slate">{m.assessment_type || 'Quiz/Exam'}</span>
                            </td>
                            <td style={{ fontWeight: 700, fontSize: '14px' }}>{m.score}</td>
                            <td>{m.max_score}</td>
                            <td>
                              <span style={{ fontWeight: 700, color: pct >= 80 ? '#2A7F62' : '#B7791F' }}>
                                {pct}%
                              </span>
                            </td>
                            <td>
                              <span className="badge-solid badge-purple">{letterGrade}</span>
                            </td>
                            <td style={{ fontStyle: 'italic', color: '#64748B' }}>
                              {m.feedback || 'Good effort'}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                          No assessment marks published for this term yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: ASSIGNMENTS */}
          {/* ============================================================== */}
          {activeTab === 'assignments' && (
            <div>
              <div className="page-header-row">
                <div>
                  <div className="page-breadcrumb">
                    <span>Student Portal</span> / <span>Assignments</span>
                  </div>
                  <h2 className="page-title">Assignments &amp; Homework Tasks</h2>
                </div>
              </div>

              <div className="data-table-container">
                <table className="spec-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Subject</th>
                      <th>Assigned Date</th>
                      <th>Due Date</th>
                      <th>Max Score</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments && assignments.length > 0 ? (
                      assignments.map((asg: any) => (
                        <tr key={asg.id}>
                          <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{asg.title}</td>
                          <td>{asg.subject_name}</td>
                          <td style={{ fontSize: '12px', color: '#64748B' }}>
                            {new Date(asg.assigned_date).toLocaleDateString()}
                          </td>
                          <td style={{ fontSize: '12px', fontWeight: 600, color: '#C0392B' }}>
                            {new Date(asg.due_date).toLocaleDateString()}
                          </td>
                          <td>{asg.max_score}</td>
                          <td>
                            <span className="badge-solid badge-blue">Assigned</span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                          No pending homework assignments found in MySQL.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 6: OFFICIAL REPORT CARD */}
          {/* ============================================================== */}
          {activeTab === 'reportcard' && (
            <div>
              <div className="page-header-row">
                <div>
                  <div className="page-breadcrumb">
                    <span>Student Portal</span> / <span>Report Card</span>
                  </div>
                  <h2 className="page-title">Term Academic Report Card</h2>
                </div>
              </div>

              {reportCard ? (
                <div
                  style={{
                    maxWidth: '850px',
                    margin: '0 auto',
                    background: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
                  }}
                >
                  <div
                    style={{
                      backgroundColor: '#1F3A5F',
                      color: 'white',
                      padding: '24px',
                      textAlign: 'center',
                      borderBottom: '4px solid #2E6DA4'
                    }}
                  >
                    <h2 style={{ margin: 0, fontSize: '18px', letterSpacing: '1px' }}>
                      HIGH SCHOOL AND PREPARATORY SCHOOL
                    </h2>
                    <h4 style={{ margin: '6px 0 0 0', fontWeight: 400, color: '#94A3B8' }}>
                      OFFICIAL STUDENT ACADEMIC PROGRESS REPORT
                    </h4>
                    <div style={{ fontSize: '12px', marginTop: 6, color: '#CBD5E1' }}>
                      Academic Year: {profile?.academic_year_name || '2026/27'} • Term: Semester 1
                    </div>
                  </div>

                  <div style={{ padding: '24px' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px',
                        background: '#F8FAFC',
                        padding: '16px',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        fontSize: '13px'
                      }}
                    >
                      <div>
                        <span style={{ color: '#64748B', display: 'block' }}>Student Name</span>
                        <strong>{profile?.first_name} {profile?.father_name}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', display: 'block' }}>Admission No</span>
                        <strong>{profile?.admission_no}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', display: 'block' }}>Grade &amp; Section</span>
                        <strong>{profile?.grade_name} - Section {profile?.section_name}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', display: 'block' }}>Cumulative GPA</span>
                        <strong style={{ color: '#2A7F62', fontSize: '16px' }}>{reportCard.gpa || '3.75'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', display: 'block' }}>Class Rank</span>
                        <strong>{reportCard.rank_in_section ? `${reportCard.rank_in_section} of 15` : 'Top 5%'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', display: 'block' }}>Standing</span>
                        <strong style={{ color: '#2A7F62' }}>Promoted / Good Standing</strong>
                      </div>
                    </div>

                    <div style={{ padding: '14px', background: '#FEF7EC', borderRadius: '8px', fontSize: '13px', color: '#B7791F' }}>
                      <strong>Homeroom Remarks:</strong> Student demonstrates consistent academic excellence, punctuality, and active participation in class activities.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#FFFFFF', padding: '40px', borderRadius: '10px', textAlign: 'center', color: '#64748B', border: '1px solid #E2E8F0' }}>
                  No certified report card published for this semester yet.
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
