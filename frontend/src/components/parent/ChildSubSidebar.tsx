import type { LinkedChild } from './MyChildrenDirectory';

export type ChildSubPage =
  | 'overview'
  | 'marks'
  | 'attendance'
  | 'subjects'
  | 'timetable'
  | 'assessments'
  | 'documents'
  | 'history';

interface ChildSubSidebarProps {
  selectedChild: LinkedChild;
  verifiedChildren: LinkedChild[];
  activeSubPage: ChildSubPage;
  onSelectSubPage: (subPage: ChildSubPage) => void;
  onSwitchChild: (studentId: number) => void;
  onBackToDirectory: () => void;
  badges?: {
    marksCount?: number;
    upcomingAssessmentsCount?: number;
    reportCardsCount?: number;
    subjectsCount?: number;
  };
}

export default function ChildSubSidebar({
  selectedChild,
  verifiedChildren,
  activeSubPage,
  onSelectSubPage,
  onSwitchChild,
  onBackToDirectory,
  badges = {}
}: ChildSubSidebarProps) {
  const subNavItems: Array<{
    page: ChildSubPage;
    label: string;
    icon: string;
    badge?: number;
    permissionFlag?: 'can_view_results' | 'can_view_attendance';
  }> = [
    { page: 'overview', label: 'Child Overview', icon: '📊' },
    {
      page: 'marks',
      label: 'Academic Progress',
      icon: '📈',
      badge: badges.marksCount,
      permissionFlag: 'can_view_results'
    },
    {
      page: 'attendance',
      label: 'Attendance',
      icon: '📋',
      permissionFlag: 'can_view_attendance'
    },
    {
      page: 'subjects',
      label: 'Subjects & Learning',
      icon: '📚',
      badge: badges.subjectsCount
    },
    { page: 'timetable', label: 'Schedule & Timetable', icon: '🗓️' },
    {
      page: 'assessments',
      label: 'Assignments & Exams',
      icon: '✍️',
      badge: badges.upcomingAssessmentsCount
    },
    {
      page: 'documents',
      label: 'Report Cards & Docs',
      icon: '📑',
      badge: badges.reportCardsCount,
      permissionFlag: 'can_view_results'
    },
    { page: 'history', label: 'Enrollment History', icon: '🏛️' }
  ];

  return (
    <aside className="child-sub-sidebar" aria-label="Child Specific Navigation">
      {/* 1. Back to Directory / All Wards */}
      <button
        type="button"
        className="child-back-btn"
        onClick={onBackToDirectory}
        title="Return to all children directory"
      >
        <span>←</span>
        <span>All Children</span>
      </button>

      {/* 2. Selected Child Profile & Switcher Card */}
      <div className="child-identity-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="child-avatar-sm">
            {selectedChild.first_name ? selectedChild.first_name.charAt(0).toUpperCase() : 'S'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h4 className="child-name-text">
              {selectedChild.first_name} {selectedChild.father_name}
            </h4>
            <span className="child-admission-text">
              ID: {selectedChild.admission_no}
            </span>
          </div>
        </div>

        <div className="child-placement-meta">
          <div>
            <strong>{selectedChild.grade_name || `Grade ${selectedChild.grade_level || '—'}`}</strong>
            {selectedChild.section_name && <span> &bull; Sec {selectedChild.section_name}</span>}
          </div>
          <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
            {selectedChild.academic_year_name || '2026/27'} &bull; {selectedChild.relationship || 'Ward'}
          </div>
        </div>

        {/* Quick Child Switcher Dropdown (if parent has multiple verified children) */}
        {verifiedChildren.length > 1 && (
          <div style={{ marginTop: '10px' }}>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 700, color: '#64748B', marginBottom: '4px', textTransform: 'uppercase' }}>
              Switch Student:
            </label>
            <select
              value={selectedChild.student_id}
              onChange={(e) => onSwitchChild(Number(e.target.value))}
              className="child-switcher-select"
              aria-label="Switch selected child"
            >
              {verifiedChildren.map((c) => (
                <option key={c.student_id} value={c.student_id}>
                  {c.first_name} {c.father_name} ({c.grade_name || `Grade ${c.grade_level}`})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 3. Level 2 Contextual Navigation Sub-Items */}
      <nav className="child-subnav-list">
        <div className="child-subnav-title">Child Records</div>

        {subNavItems.map((item) => {
          const isActive = activeSubPage === item.page;
          const isRestricted = item.permissionFlag && !Boolean(selectedChild[item.permissionFlag]);

          return (
            <button
              key={item.page}
              type="button"
              className={`child-subnav-btn ${isActive ? 'active' : ''} ${isRestricted ? 'restricted' : ''}`}
              onClick={() => {
                if (!isRestricted) {
                  onSelectSubPage(item.page);
                }
              }}
              disabled={isRestricted}
              title={isRestricted ? 'Restricted by school permissions' : item.label}
            >
              <span className="child-subnav-icon">{item.icon}</span>
              <span className="child-subnav-label">{item.label}</span>
              {isRestricted ? (
                <span className="child-subnav-lock" title="Restricted">🔒</span>
              ) : item.badge !== undefined && item.badge > 0 ? (
                <span className="child-subnav-badge">{item.badge}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

