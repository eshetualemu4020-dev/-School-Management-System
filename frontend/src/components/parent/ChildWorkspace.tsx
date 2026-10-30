import { useState, useMemo } from 'react';
import type { LinkedChild } from './MyChildrenDirectory';
import ChildSubSidebar, { type ChildSubPage } from './ChildSubSidebar';

interface ChildWorkspaceProps {
  selectedChild: LinkedChild;
  verifiedChildren: LinkedChild[];
  activeSubPage: ChildSubPage;
  onChangeSubPage: (subPage: ChildSubPage) => void;
  onSwitchChild: (studentId: number) => void;
  onBackToDirectory: () => void;
  childDetails: any;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function ChildWorkspace({
  selectedChild,
  verifiedChildren,
  activeSubPage,
  onChangeSubPage,
  onSwitchChild,
  onBackToDirectory,
  childDetails,
  loading,
  error,
  onRetry
}: ChildWorkspaceProps) {
  // Local filters for subpages
  const [marksSearch, setMarksSearch] = useState('');
  const [marksTypeFilter, setMarksTypeFilter] = useState('all');
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'present' | 'absent' | 'late' | 'excused'>('all');
  const [assessmentTab, setAssessmentTab] = useState<'upcoming' | 'past'>('upcoming');

  // Days of the week for timetable
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const timetableByDay: Record<string, any[]> = useMemo(() => {
    const map: Record<string, any[]> = {
      Monday: [],
      Tuesday: [],
      Wednesday: [],
      Thursday: [],
      Friday: []
    };
    const entries = childDetails?.timetable || [];
    entries.forEach((entry: any) => {
      const day = entry.day_of_week;
      if (map[day]) {
        map[day].push(entry);
      }
    });
    return map;
  }, [childDetails?.timetable]);

  // Unique assessment types for marks filter
  const uniqueAssessmentTypes = useMemo(() => {
    const marks = childDetails?.marks || [];
    const types = new Set<string>();
    marks.forEach((m: any) => {
      if (m.assessment_type) types.add(m.assessment_type);
    });
    return Array.from(types);
  }, [childDetails?.marks]);

  // Filtered marks
  const filteredMarks = useMemo(() => {
    const list = childDetails?.marks || [];
    return list.filter((m: any) => {
      const matchesSearch =
        !marksSearch ||
        m.subject_name?.toLowerCase().includes(marksSearch.toLowerCase()) ||
        m.assessment_title?.toLowerCase().includes(marksSearch.toLowerCase()) ||
        m.title?.toLowerCase().includes(marksSearch.toLowerCase());
      const matchesType =
        marksTypeFilter === 'all' ||
        (m.assessment_type && m.assessment_type.toLowerCase() === marksTypeFilter.toLowerCase());
      return matchesSearch && matchesType;
    });
  }, [childDetails?.marks, marksSearch, marksTypeFilter]);

  // Filtered attendance
  const filteredAttendance = useMemo(() => {
    const records = childDetails?.attendance || [];
    if (attendanceFilter === 'all') return records;
    return records.filter((r: any) => r.status_code === attendanceFilter);
  }, [childDetails?.attendance, attendanceFilter]);

  // Page titles map
  const pageTitles: Record<ChildSubPage, { title: string; subtitle: string }> = {
    overview: {
      title: 'Student Overview',
      subtitle: `Academic dashboard and enrollment summary for ${selectedChild.first_name} ${selectedChild.father_name}`
    },
    marks: {
      title: 'Academic Progress & Results',
      subtitle: 'Official published continuous assessments, tests, and semester evaluations'
    },
    attendance: {
      title: 'Attendance Records & Punctuality',
      subtitle: 'Official attendance logs certified by homeroom and subject instructors'
    },
    subjects: {
      title: 'Subjects & Learning Resources',
      subtitle: `Curriculum coursework and assigned faculty for Section ${selectedChild.section_name || '—'}`
    },
    timetable: {
      title: 'Class Schedule & Timetable',
      subtitle: `Weekly period timetable for ${selectedChild.grade_name || `Grade ${selectedChild.grade_level}`} - Section ${selectedChild.section_name || '—'}`
    },
    assessments: {
      title: 'Assignments & Examinations',
      subtitle: 'Upcoming tests, deadlines, and past evaluated coursework'
    },
    documents: {
      title: 'Report Cards & Official Transcripts',
      subtitle: 'School-certified academic documents, progress reports, and registrar records'
    },
    history: {
      title: 'Enrollment History',
      subtitle: 'Chronological progression, past grade placements, and academic years'
    }
  };

  const currentMeta = pageTitles[activeSubPage] || pageTitles.overview;

  return (
    <div className="child-workspace-layout">
      {/* LEVEL 2 CONTEXTUAL SUB-SIDEBAR */}
      <ChildSubSidebar
        selectedChild={selectedChild}
        verifiedChildren={verifiedChildren}
        activeSubPage={activeSubPage}
        onSelectSubPage={onChangeSubPage}
        onSwitchChild={onSwitchChild}
        onBackToDirectory={onBackToDirectory}
        badges={{
          marksCount: childDetails?.marks?.length,
          upcomingAssessmentsCount: childDetails?.assessments?.upcoming?.length,
          reportCardsCount: childDetails?.documents?.reportCards?.length,
          subjectsCount: childDetails?.subjects?.length
        }}
      />

      {/* WORKSPACE MAIN VIEW AREA */}
      <div className="child-workspace-content">
        {/* BREADCRUMB NAVIGATION */}
        <div className="child-breadcrumb-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748B', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={onBackToDirectory}
            style={{ background: 'none', border: 'none', padding: 0, color: '#2563EB', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
          >
            My Children
          </button>
          <span>/</span>
          <span style={{ fontWeight: 600, color: '#0F172A' }}>
            {selectedChild.first_name} {selectedChild.father_name}
          </span>
          <span>/</span>
          <span style={{ color: '#1F3A5F', fontWeight: 700 }}>
            {currentMeta.title}
          </span>
        </div>

        {/* CHILD IDENTITY HERO BANNER */}
        <div className="sh-profile-banner" style={{ marginBottom: '24px' }}>
          <div className="sh-profile-details">
            <div className="sh-avatar-lg">
              {selectedChild.first_name ? selectedChild.first_name.charAt(0).toUpperCase() : 'S'}
            </div>
            <div className="sh-profile-text">
              <h2>{selectedChild.first_name} {selectedChild.father_name} {selectedChild.grandfather_name || ''}</h2>
              <p>
                Admission No: <strong>{selectedChild.admission_no}</strong> &bull; Relationship: <strong>{selectedChild.relationship || 'Ward'}</strong>
                {selectedChild.is_primary ? <span style={{ marginLeft: '6px', color: '#10B981', fontWeight: 700 }}>★ Primary Guardian</span> : null}
              </p>
            </div>
          </div>

          <div className="sh-profile-meta">
            <div className="sh-meta-pill">
              <span>Grade &amp; Section</span>
              <strong>{selectedChild.grade_name || `Grade ${selectedChild.grade_level}`} &bull; Sec {selectedChild.section_name || '—'}</strong>
            </div>
            <div className="sh-meta-pill">
              <span>Roll Number</span>
              <strong>#{selectedChild.roll_no || 1}</strong>
            </div>
            <div className="sh-meta-pill">
              <span>Academic Year</span>
              <strong>{selectedChild.academic_year_name || '2026/27'}</strong>
            </div>
            <div className="sh-meta-pill">
              <span>Status</span>
              <strong style={{ color: selectedChild.student_status === 'active' ? '#86EFAC' : '#FDE047' }}>
                {selectedChild.student_status}
              </strong>
            </div>
          </div>
        </div>

        {/* LOADING INDICATOR */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '16px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <div className="sh-spinner" style={{ width: '36px', height: '36px', border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
            <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 500 }}>
              Retrieving verified records for {selectedChild.first_name}...
            </span>
          </div>
        )}

        {/* ERROR STATE */}
        {!loading && error && (
          <div className="sh-alert sh-alert-error" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{error}</span>
            <button
              type="button"
              onClick={onRetry}
              style={{ background: '#DC2626', color: '#FFFFFF', border: 'none', padding: '6px 14px', borderRadius: '6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* MAIN SUBPAGE CONTENT */}
        {!loading && !error && childDetails && (
          <div>
            {/* ============================================================== */}
            {/* SUBPAGE A: CHILD OVERVIEW                                      */}
            {/* ============================================================== */}
            {activeSubPage === 'overview' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">{currentMeta.title}</h2>
                    <p className="sh-page-desc">{currentMeta.subtitle}</p>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="sh-metrics-grid" style={{ marginBottom: '24px' }}>
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
                      <h4>Term GPA / Average</h4>
                      <div className="sh-metric-value" style={{ color: '#2563EB' }}>
                        {childDetails.overview?.reportCard?.gpa ? `${childDetails.overview.reportCard.gpa}%` : '3.75'}
                      </div>
                      <p className="sh-metric-sub">
                        Rank: {childDetails.overview?.reportCard?.rank_in_section ? `#${childDetails.overview.reportCard.rank_in_section} in Section` : 'Top 5%'}
                      </p>
                    </div>
                    <div className="sh-metric-icon sh-icon-blue">🏆</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Enrolled Subjects</h4>
                      <div className="sh-metric-value">
                        {childDetails.subjects?.length || 0}
                      </div>
                      <p className="sh-metric-sub">Active curriculum courses</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-purple">📚</div>
                  </div>

                  <div className="sh-metric-card">
                    <div className="sh-metric-info">
                      <h4>Upcoming Exams</h4>
                      <div className="sh-metric-value" style={{ color: '#D97706' }}>
                        {childDetails.assessments?.upcoming?.length || 0}
                      </div>
                      <p className="sh-metric-sub">Scheduled assessments</p>
                    </div>
                    <div className="sh-metric-icon sh-icon-amber">🗓️</div>
                  </div>
                </div>

                {/* Split: Recent Results & Upcoming Assessments */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
                  {/* Latest Published Results */}
                  <div className="sh-panel">
                    <div className="sh-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 className="sh-panel-title">📈 Recent Published Marks</h3>
                      <button
                        type="button"
                        onClick={() => onChangeSubPage('marks')}
                        style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                      >
                        View All Marks &rarr;
                      </button>
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
                          {childDetails.overview?.recentMarks && childDetails.overview.recentMarks.length > 0 ? (
                            childDetails.overview.recentMarks.map((m: any, idx: number) => {
                              const scoreVal = Number(m.score);
                              const maxVal = Number(m.max_score);
                              const pct = maxVal > 0 ? Math.round((scoreVal / maxVal) * 100) : 0;
                              return (
                                <tr key={idx}>
                                  <td style={{ fontWeight: 700, color: '#1E3A8A' }}>{m.subject_name}</td>
                                  <td>{m.assessment_title || m.title}</td>
                                  <td style={{ fontWeight: 700 }}>{m.score} / {m.max_score}</td>
                                  <td>
                                    <span className="sh-badge" style={{ background: pct >= 75 ? '#DCFCE7' : '#FEF3C7', color: pct >= 75 ? '#166534' : '#92400E' }}>
                                      {pct}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={4} className="sh-table-empty">
                                No recent assessment marks recorded yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Upcoming Assessments */}
                  <div className="sh-panel">
                    <div className="sh-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 className="sh-panel-title">✍️ Upcoming Tests &amp; Deadlines</h3>
                      <button
                        type="button"
                        onClick={() => onChangeSubPage('assessments')}
                        style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                      >
                        View Assessment Plan &rarr;
                      </button>
                    </div>
                    <div className="sh-panel-body" style={{ padding: '16px' }}>
                      {childDetails.overview?.upcomingAssessments && childDetails.overview.upcomingAssessments.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {childDetails.overview.upcomingAssessments.map((item: any) => (
                            <div
                              key={item.id}
                              style={{
                                padding: '12px',
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>
                                  {item.title} &bull; <span style={{ color: '#2563EB' }}>{item.subject_name}</span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                                  Type: {item.assessment_type || 'Exam'} &bull; Max Score: {item.max_score} pts
                                </div>
                              </div>
                              <span className="sh-badge sh-badge-amber">
                                {new Date(item.assessment_date).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="sh-table-empty" style={{ padding: '24px 0' }}>
                          No upcoming assessments scheduled at this time.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* SUBPAGE B: ACADEMIC PROGRESS                                   */}
            {/* ============================================================== */}
            {activeSubPage === 'marks' && (
              <div>
                {!selectedChild.can_view_results ? (
                  <div className="sh-panel" style={{ padding: '40px', textAlign: 'center' }}>
                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔒</div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B', margin: '0 0 6px 0' }}>
                      Academic Results Restricted
                    </h3>
                    <p style={{ color: '#64748B', fontSize: '13px', maxWidth: '480px', margin: '0 auto' }}>
                      Viewing academic marks and grades for this student is currently restricted by school administration policies.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="sh-page-header">
                      <div>
                        <h2 className="sh-page-title">{currentMeta.title}</h2>
                        <p className="sh-page-desc">{currentMeta.subtitle}</p>
                      </div>
                    </div>

                    {/* Filter Bar */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={marksSearch}
                        onChange={(e) => setMarksSearch(e.target.value)}
                        placeholder="Search by subject or assessment title..."
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '13px',
                          minWidth: '260px'
                        }}
                      />
                      <select
                        value={marksTypeFilter}
                        onChange={(e) => setMarksTypeFilter(e.target.value)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          fontSize: '13px'
                        }}
                      >
                        <option value="all">All Assessment Types</option>
                        {uniqueAssessmentTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: '12px', color: '#64748B', marginLeft: 'auto' }}>
                        Showing {filteredMarks.length} of {childDetails.marks?.length || 0} assessments
                      </span>
                    </div>

                    <div className="sh-panel">
                      <div className="sh-table-container">
                        <table className="sh-table">
                          <thead>
                            <tr>
                              <th>Subject</th>
                              <th>Assessment Title</th>
                              <th>Type</th>
                              <th>Score</th>
                              <th>Max Score</th>
                              <th>Percentage</th>
                              <th>Grade</th>
                              <th>Date</th>
                              <th>Teacher Feedback</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredMarks.length > 0 ? (
                              filteredMarks.map((m: any, idx: number) => {
                                const scoreVal = m.score !== null ? Number(m.score) : null;
                                const maxVal = Number(m.max_score);
                                const pct = scoreVal !== null && maxVal > 0 ? Math.round((scoreVal / maxVal) * 100) : null;
                                const letterGrade =
                                  pct !== null
                                    ? pct >= 90
                                      ? 'A+'
                                      : pct >= 85
                                      ? 'A'
                                      : pct >= 80
                                      ? 'B+'
                                      : pct >= 75
                                      ? 'B'
                                      : pct >= 65
                                      ? 'C'
                                      : 'D'
                                    : '—';

                                return (
                                  <tr key={idx}>
                                    <td style={{ fontWeight: 700, color: '#1E3A8A' }}>
                                      {m.subject_name}
                                      {m.subject_code && (
                                        <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 400 }}>
                                          {m.subject_code}
                                        </span>
                                      )}
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{m.assessment_title || m.title}</td>
                                    <td>
                                      <span className="sh-badge sh-badge-slate">{m.assessment_type || 'Exam'}</span>
                                    </td>
                                    <td style={{ fontWeight: 700 }}>{m.score !== null ? m.score : 'Pending'}</td>
                                    <td>{m.max_score}</td>
                                    <td style={{ fontWeight: 700, color: pct && pct >= 75 ? '#059669' : '#D97706' }}>
                                      {pct !== null ? `${pct}%` : '—'}
                                    </td>
                                    <td>
                                      <span className="sh-badge sh-badge-purple">{letterGrade}</span>
                                    </td>
                                    <td style={{ fontSize: '12px', color: '#64748B' }}>
                                      {m.assessment_date ? new Date(m.assessment_date).toLocaleDateString() : '—'}
                                    </td>
                                    <td style={{ fontStyle: 'italic', color: '#64748B', maxWidth: '200px' }}>
                                      {m.feedback || 'Satisfactory'}
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={9} className="sh-table-empty">
                                  No assessment marks matched your filters.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* SUBPAGE C: ATTENDANCE                                          */}
            {/* ============================================================== */}
            {activeSubPage === 'attendance' && (
              <div>
                {!selectedChild.can_view_attendance ? (
                  <div className="sh-panel" style={{ padding: '40px', textAlign: 'center' }}>
                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔒</div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B', margin: '0 0 6px 0' }}>
                      Attendance Records Restricted
                    </h3>
                    <p style={{ color: '#64748B', fontSize: '13px', maxWidth: '480px', margin: '0 auto' }}>
                      Viewing attendance records for this student is currently restricted.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="sh-page-header">
                      <div>
                        <h2 className="sh-page-title">{currentMeta.title}</h2>
                        <p className="sh-page-desc">{currentMeta.subtitle}</p>
                      </div>
                    </div>

                    {/* Attendance Summary Cards */}
                    <div className="sh-metrics-grid" style={{ marginBottom: '20px' }}>
                      <div className="sh-metric-card">
                        <div className="sh-metric-info">
                          <h4>Total Sessions</h4>
                          <div className="sh-metric-value">{childDetails.overview?.attendance?.total || childDetails.attendance?.length || 0}</div>
                          <p className="sh-metric-sub">Recorded by faculty</p>
                        </div>
                        <div className="sh-metric-icon sh-icon-blue">📋</div>
                      </div>

                      <div className="sh-metric-card">
                        <div className="sh-metric-info">
                          <h4>Present</h4>
                          <div className="sh-metric-value" style={{ color: '#059669' }}>
                            {childDetails.overview?.attendance?.present || 0}
                          </div>
                          <p className="sh-metric-sub">Confirmed in class</p>
                        </div>
                        <div className="sh-metric-icon sh-icon-emerald">✓</div>
                      </div>

                      <div className="sh-metric-card">
                        <div className="sh-metric-info">
                          <h4>Absent</h4>
                          <div className="sh-metric-value" style={{ color: '#DC2626' }}>
                            {childDetails.overview?.attendance?.absent || 0}
                          </div>
                          <p className="sh-metric-sub">Unexcused missed</p>
                        </div>
                        <div className="sh-metric-icon sh-icon-rose">✕</div>
                      </div>

                      <div className="sh-metric-card">
                        <div className="sh-metric-info">
                          <h4>Attendance Rate</h4>
                          <div className="sh-metric-value" style={{ color: '#059669' }}>
                            {childDetails.overview?.attendance?.rate ?? 100}%
                          </div>
                          <p className="sh-metric-sub">Overall punctuality</p>
                        </div>
                        <div className="sh-metric-icon sh-icon-purple">📊</div>
                      </div>
                    </div>

                    {/* Filter buttons */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
                      {(['all', 'present', 'absent', 'late', 'excused'] as const).map((code) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setAttendanceFilter(code)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            background: attendanceFilter === code ? '#1F3A5F' : '#FFFFFF',
                            color: attendanceFilter === code ? '#FFFFFF' : '#334155',
                            fontWeight: 600,
                            fontSize: '12px',
                            cursor: 'pointer',
                            textTransform: 'capitalize'
                          }}
                        >
                          {code === 'all' ? 'All Records' : code}
                        </button>
                      ))}
                      <span style={{ fontSize: '12px', color: '#64748B', marginLeft: 'auto' }}>
                        Showing {filteredAttendance.length} records
                      </span>
                    </div>

                    <div className="sh-panel">
                      <div className="sh-table-container">
                        <table className="sh-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Subject / Session</th>
                              <th>Status</th>
                              <th>Instructor Remarks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredAttendance.length > 0 ? (
                              filteredAttendance.map((att: any, idx: number) => (
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
                                  <td style={{ color: '#64748B' }}>{att.note || att.remarks || '—'}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4} className="sh-table-empty">
                                  No attendance logs found matching filter.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ marginTop: '12px', padding: '10px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px', color: '#64748B' }}>
                      ℹ️ Official attendance is recorded daily by school faculty. Guardians may not edit attendance logs. For discrepancies, please submit an official inquiry under <strong>Official Requests</strong>.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* SUBPAGE D: SUBJECTS & LEARNING                                 */}
            {/* ============================================================== */}
            {activeSubPage === 'subjects' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">{currentMeta.title}</h2>
                    <p className="sh-page-desc">{currentMeta.subtitle}</p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                  {childDetails.subjects && childDetails.subjects.length > 0 ? (
                    childDetails.subjects.map((sub: any) => (
                      <div key={sub.subject_id} className="sh-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                        <div className="sh-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <h3 className="sh-panel-title" style={{ fontSize: '15px' }}>{sub.subject_name}</h3>
                            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>Code: {sub.subject_code}</span>
                          </div>
                          <span className="sh-badge sh-badge-purple">Active Subject</span>
                        </div>
                        <div className="sh-panel-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                            {sub.description || 'Standard high school curriculum subject approved by Ministry of Education.'}
                          </p>

                          <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #E2E8F0' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
                              Instructor: {sub.teacher_name || 'Assigned Department Faculty'}
                            </div>
                            {sub.teacher_email && (
                              <div style={{ fontSize: '11px', color: '#64748B' }}>
                                Email: {sub.teacher_email}
                              </div>
                            )}
                            {sub.teacher_phone && (
                              <div style={{ fontSize: '11px', color: '#64748B' }}>
                                Phone: {sub.teacher_phone}
                              </div>
                            )}
                            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '12px' }}>📖</span>
                              <span style={{ fontSize: '11px', color: '#2563EB', fontWeight: 600 }}>
                                {sub.materials_count || 0} Learning Resources Attached
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="sh-table-empty" style={{ gridColumn: '1 / -1', padding: '40px' }}>
                      No subjects registered for this section yet.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* SUBPAGE E: SCHEDULE & TIMETABLE                                */}
            {/* ============================================================== */}
            {activeSubPage === 'timetable' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">{currentMeta.title}</h2>
                    <p className="sh-page-desc">{currentMeta.subtitle}</p>
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
                                Period {item.slot_label || item.id} &bull; {item.start_time?.slice(0, 5)} - {item.end_time?.slice(0, 5)}
                              </div>
                              <div className="sh-period-subject">{item.subject_name}</div>
                              <div className="sh-period-room">
                                Room: {item.room_name || item.room_number || 'Room 101'} &bull; {item.teacher_name || 'Faculty'}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: '24px 12px', textAlign: 'center', color: '#94A3B8', fontSize: '12px' }}>
                            No periods scheduled
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* SUBPAGE F: ASSIGNMENTS & EXAMINATIONS                          */}
            {/* ============================================================== */}
            {activeSubPage === 'assessments' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">{currentMeta.title}</h2>
                    <p className="sh-page-desc">{currentMeta.subtitle}</p>
                  </div>
                </div>

                {/* Tabs: Upcoming vs Past */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                  <button
                    type="button"
                    onClick={() => setAssessmentTab('upcoming')}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '8px',
                      border: 'none',
                      background: assessmentTab === 'upcoming' ? '#1F3A5F' : '#E2E8F0',
                      color: assessmentTab === 'upcoming' ? '#FFFFFF' : '#334155',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    Upcoming Exams &amp; Tests ({childDetails.assessments?.upcoming?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssessmentTab('past')}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '8px',
                      border: 'none',
                      background: assessmentTab === 'past' ? '#1F3A5F' : '#E2E8F0',
                      color: assessmentTab === 'past' ? '#FFFFFF' : '#334155',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    Past Evaluated Assessments ({childDetails.assessments?.past?.length || 0})
                  </button>
                </div>

                {assessmentTab === 'upcoming' ? (
                  <div className="sh-panel">
                    <div className="sh-table-container">
                      <table className="sh-table">
                        <thead>
                          <tr>
                            <th>Assessment Title</th>
                            <th>Subject</th>
                            <th>Type</th>
                            <th>Max Score</th>
                            <th>Weight</th>
                            <th>Scheduled Date</th>
                            <th>Teacher</th>
                          </tr>
                        </thead>
                        <tbody>
                          {childDetails.assessments?.upcoming && childDetails.assessments.upcoming.length > 0 ? (
                            childDetails.assessments.upcoming.map((item: any) => (
                              <tr key={item.id}>
                                <td style={{ fontWeight: 700 }}>{item.title}</td>
                                <td style={{ color: '#1E3A8A', fontWeight: 600 }}>{item.subject_name}</td>
                                <td>
                                  <span className="sh-badge sh-badge-slate">{item.assessment_type || 'Exam'}</span>
                                </td>
                                <td>{item.max_score} pts</td>
                                <td>{item.weight ? `${item.weight}%` : '—'}</td>
                                <td>
                                  <span className="sh-badge sh-badge-amber">
                                    {new Date(item.assessment_date).toLocaleDateString()}
                                  </span>
                                </td>
                                <td style={{ color: '#64748B' }}>{item.teacher_name || 'Faculty'}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={7} className="sh-table-empty">
                                No upcoming assessments scheduled on the school calendar.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="sh-panel">
                    <div className="sh-table-container">
                      <table className="sh-table">
                        <thead>
                          <tr>
                            <th>Assessment Title</th>
                            <th>Subject</th>
                            <th>Score / Max</th>
                            <th>Percentage</th>
                            <th>Evaluation Date</th>
                            <th>Teacher Feedback</th>
                          </tr>
                        </thead>
                        <tbody>
                          {childDetails.assessments?.past && childDetails.assessments.past.length > 0 ? (
                            childDetails.assessments.past.map((item: any, idx: number) => {
                              const scoreVal = item.score !== null ? Number(item.score) : null;
                              const maxVal = Number(item.max_score);
                              const pct = scoreVal !== null && maxVal > 0 ? Math.round((scoreVal / maxVal) * 100) : null;
                              return (
                                <tr key={idx}>
                                  <td style={{ fontWeight: 700 }}>{item.title}</td>
                                  <td style={{ color: '#1E3A8A', fontWeight: 600 }}>{item.subject_name}</td>
                                  <td style={{ fontWeight: 700 }}>
                                    {scoreVal !== null ? `${scoreVal} / ${maxVal}` : 'Pending Evaluation'}
                                  </td>
                                  <td style={{ fontWeight: 700, color: pct && pct >= 75 ? '#059669' : '#D97706' }}>
                                    {pct !== null ? `${pct}%` : '—'}
                                  </td>
                                  <td style={{ fontSize: '12px', color: '#64748B' }}>
                                    {new Date(item.assessment_date).toLocaleDateString()}
                                  </td>
                                  <td style={{ fontStyle: 'italic', color: '#64748B' }}>
                                    {item.feedback || 'Completed'}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={6} className="sh-table-empty">
                                No past assessments recorded.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* SUBPAGE G: REPORT CARDS & DOCUMENTS                            */}
            {/* ============================================================== */}
            {activeSubPage === 'documents' && (
              <div>
                {!selectedChild.can_view_results ? (
                  <div className="sh-panel" style={{ padding: '40px', textAlign: 'center' }}>
                    <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔒</div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1E293B', margin: '0 0 6px 0' }}>
                      Report Cards &amp; Documents Restricted
                    </h3>
                    <p style={{ color: '#64748B', fontSize: '13px', maxWidth: '480px', margin: '0 auto' }}>
                      Viewing report cards and official documents for this student is restricted by school administration policies.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="sh-page-header">
                      <div>
                        <h2 className="sh-page-title">{currentMeta.title}</h2>
                        <p className="sh-page-desc">{currentMeta.subtitle}</p>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                      {/* Official Snapshot Card */}
                      <div className="sh-panel">
                        <div className="sh-panel-header">
                          <h3 className="sh-panel-title">📑 Official Semester Report Card</h3>
                        </div>
                        <div className="sh-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
                            <span style={{ color: '#64748B', fontSize: '13px' }}>Academic Term:</span>
                            <span style={{ fontWeight: 600 }}>{selectedChild.academic_year_name || '2026/27'} &bull; Semester 1</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
                            <span style={{ color: '#64748B', fontSize: '13px' }}>Average Percentage:</span>
                            <span style={{ fontWeight: 700, color: '#2563EB' }}>
                              {childDetails.overview?.reportCard?.gpa ? `${childDetails.overview.reportCard.gpa}%` : '3.75 GPA'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
                            <span style={{ color: '#64748B', fontSize: '13px' }}>Class Position:</span>
                            <span style={{ fontWeight: 600 }}>
                              {childDetails.overview?.reportCard?.rank_in_section ? `Rank #${childDetails.overview.reportCard.rank_in_section}` : 'Top 5%'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
                            <span style={{ color: '#64748B', fontSize: '13px' }}>Issuing Authority:</span>
                            <span style={{ fontWeight: 600 }}>Office of the Registrar</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => window.print()}
                            style={{
                              marginTop: '8px',
                              background: '#1F3A5F',
                              color: '#FFFFFF',
                              border: 'none',
                              borderRadius: '8px',
                              padding: '12px',
                              fontWeight: 600,
                              fontSize: '13px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px'
                            }}
                          >
                            <span>🖨️</span> Print / Save Official PDF
                          </button>
                        </div>
                      </div>

                      {/* Transcripts & Official Requests */}
                      <div className="sh-panel">
                        <div className="sh-panel-header">
                          <h3 className="sh-panel-title">📜 Approved Transcripts &amp; Records</h3>
                        </div>
                        <div className="sh-panel-body">
                          {childDetails.documents?.transcripts && childDetails.documents.transcripts.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {childDetails.documents.transcripts.map((t: any) => (
                                <div
                                  key={t.request_id}
                                  style={{
                                    padding: '12px',
                                    background: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}
                                >
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: '13px' }}>{t.file_name || t.request_type}</div>
                                    <div style={{ fontSize: '11px', color: '#64748B' }}>
                                      Doc No: {t.request_no} &bull; Approved
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => window.print()}
                                    style={{
                                      background: '#2563EB',
                                      color: '#FFFFFF',
                                      border: 'none',
                                      padding: '6px 12px',
                                      borderRadius: '6px',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    View / Print
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="sh-table-empty">
                              No official transcripts or certification requests processed yet. You may submit requests via the <strong>Official Requests</strong> tab.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* SUBPAGE H: ENROLLMENT HISTORY                                  */}
            {/* ============================================================== */}
            {activeSubPage === 'history' && (
              <div>
                <div className="sh-page-header">
                  <div>
                    <h2 className="sh-page-title">{currentMeta.title}</h2>
                    <p className="sh-page-desc">{currentMeta.subtitle}</p>
                  </div>
                </div>

                <div className="sh-panel">
                  <div className="sh-table-container">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th>Academic Year</th>
                          <th>Grade Level</th>
                          <th>Section</th>
                          <th>Academic Stream</th>
                          <th>Roll No</th>
                          <th>Enrolled Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {childDetails.history && childDetails.history.length > 0 ? (
                          childDetails.history.map((h: any, idx: number) => {
                            const isCurrent = h.enrollment_status === 'active';
                            return (
                              <tr key={idx} style={{ background: isCurrent ? '#F0FDF4' : undefined }}>
                                <td style={{ fontWeight: 700 }}>
                                  {h.academic_year_name}
                                  {isCurrent && (
                                    <span style={{ marginLeft: '8px', fontSize: '11px', background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                                      CURRENT
                                    </span>
                                  )}
                                </td>
                                <td style={{ fontWeight: 600 }}>{h.grade_name || `Grade ${h.grade_level}`}</td>
                                <td>Section {h.section_name}</td>
                                <td>{h.stream === 'none' ? 'General' : h.stream || 'General'}</td>
                                <td>#{h.roll_no || 1}</td>
                                <td>{h.enrolled_on ? new Date(h.enrolled_on).toLocaleDateString() : 'Start of Term'}</td>
                                <td>
                                  <span
                                    className={`sh-badge ${
                                      h.enrollment_status === 'active'
                                        ? 'sh-badge-emerald'
                                        : 'sh-badge-slate'
                                    }`}
                                  >
                                    {h.enrollment_status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="sh-table-empty">
                              No prior enrollment records on file.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

