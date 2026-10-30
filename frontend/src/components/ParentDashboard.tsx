import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { api } from '../api/client';
import MyChildrenDirectory, { type LinkedChild } from './parent/MyChildrenDirectory';
import ChildWorkspace from './parent/ChildWorkspace';
import { type ChildSubPage } from './parent/ChildSubSidebar';
import CommunicationNotices from './parent/CommunicationNotices';
import '../TeacherDashboard.css';
import '../ParentDashboard.css';
import '../StakeholderDashboards.css';

interface ParentDashboardProps {
  user: {
    username: string;
    role: string;
    permissions: string[];
  };
  onLogout: () => void;
}

export type ParentPage =
  | 'overview'
  | 'children'
  | 'announcements'
  | 'requests'
  | 'notifications'
  | 'finance'
  | 'settings';

export default function ParentDashboard({ user, onLogout }: ParentDashboardProps) {
  // Level 1 Navigation State
  const [activeTab, setActiveTab] = useState<ParentPage>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Responsive & Collapsible Sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Guardian profile & linked children data
  const [guardianProfile, setGuardianProfile] = useState<any>(null);
  const [childrenList, setChildrenList] = useState<LinkedChild[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  // Level 2 Child Workspace State
  const [childWorkspaceActive, setChildWorkspaceActive] = useState<boolean>(false);
  const [childSubPage, setChildSubPage] = useState<ChildSubPage>('overview');
  const [childDetails, setChildDetails] = useState<any>(null);
  const [loadingChild, setLoadingChild] = useState(false);
  const [childError, setChildError] = useState<string | null>(null);

  // Official Requests State
  const [parentRequests, setParentRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestSubject, setRequestSubject] = useState('');
  const [requestCategory, setRequestCategory] = useState<'record_correction' | 'fee_inquiry' | 'bonafide_letter' | 'meeting_request' | 'general'>('general');
  const [requestStudentId, setRequestStudentId] = useState<string>('');
  const [requestDescription, setRequestDescription] = useState('');
  const [requestMsg, setRequestMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Account & Security Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Finance Student Selector
  const [financeStudentId, setFinanceStudentId] = useState<number | null>(null);
  const [financeDetails, setFinanceDetails] = useState<any>(null);
  const [loadingFinance, setLoadingFinance] = useState(false);

  // Verified children only
  const verifiedChildren = useMemo(() => {
    return childrenList.filter(
      (c) => c.link_status === 'active' && guardianProfile?.verification_status === 'verified'
    );
  }, [childrenList, guardianProfile]);

  // Selected child metadata
  const activeChildMeta = useMemo(() => {
    return childrenList.find((c) => c.student_id === selectedStudentId) || verifiedChildren[0] || null;
  }, [childrenList, selectedStudentId, verifiedChildren]);

  // Financial permission flag
  const hasFinanceAccess = useMemo(() => {
    return Boolean(
      guardianProfile?.verification_status === 'verified' &&
      childrenList.some((c) => Boolean(c.can_view_fees))
    );
  }, [guardianProfile, childrenList]);

  // Initial dashboard load
  useEffect(() => {
    void loadParentDashboard();
  }, []);

  // Keyboard shortcut for mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen]);

  // Load parent requests when requests tab becomes active
  useEffect(() => {
    if (activeTab === 'requests') {
      void loadParentRequests();
    }
  }, [activeTab]);

  // Load finance data when finance tab becomes active or child changes
  useEffect(() => {
    if (activeTab === 'finance' && financeStudentId) {
      void loadChildFinance(financeStudentId);
    }
  }, [activeTab, financeStudentId]);

  const loadParentDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getParentDashboard();
      setGuardianProfile(data.guardian);
      const kids: LinkedChild[] = data.children || [];
      setChildrenList(kids);

      if (kids.length > 0) {
        const firstVerified = kids.find((k) => k.link_status === 'active') || kids[0];
        setSelectedStudentId(firstVerified.student_id);
        setFinanceStudentId(firstVerified.student_id);
        void loadChildDetails(firstVerified.student_id);
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

  const loadParentRequests = async () => {
    setLoadingRequests(true);
    try {
      const res = await api.getParentRequests();
      setParentRequests(res.requests || []);
    } catch (err: any) {
      console.error('Failed to load parent requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const loadChildFinance = async (studentId: number) => {
    setLoadingFinance(true);
    try {
      const res = await api.getParentChildFinance(studentId);
      setFinanceDetails(res);
    } catch (err: any) {
      console.error('Failed to load child finance:', err);
    } finally {
      setLoadingFinance(false);
    }
  };

  // Section 6: Switch Child with immediate state flushing and permission recheck
  const handleSwitchChild = (studentId: number, targetSubPage?: ChildSubPage) => {
    // 1. Immediately flush previous child private state to prevent cross-child leakage
    setChildDetails(null);
    setSelectedStudentId(studentId);
    setChildError(null);

    // 2. Identify target child
    const targetChild = childrenList.find((c) => c.student_id === studentId);

    // 3. Recheck authorization for active subpage
    let nextSubPage = targetSubPage || childSubPage;
    if (targetChild) {
      if ((nextSubPage === 'marks' || nextSubPage === 'documents') && !Boolean(targetChild.can_view_results)) {
        nextSubPage = 'overview';
      }
      if (nextSubPage === 'attendance' && !Boolean(targetChild.can_view_attendance)) {
        nextSubPage = 'overview';
      }
    }
    setChildSubPage(nextSubPage);

    // 4. Fetch newly selected child records from backend
    void loadChildDetails(studentId);
  };

  // Open Child Workspace from Directory or Family Overview
  const handleOpenChildWorkspace = (studentId: number, subPage: ChildSubPage = 'overview') => {
    setActiveTab('children');
    setChildWorkspaceActive(true);
    handleSwitchChild(studentId, subPage);
  };

  // Return to All Children Directory
  const handleBackToDirectory = () => {
    setChildWorkspaceActive(false);
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ text: 'New passwords do not match.', type: 'error' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ text: 'Password must be at least 8 characters.', type: 'error' });
      return;
    }
    setPasswordLoading(true);
    setPasswordMsg(null);
    try {
      const res = await api.changePassword(currentPassword, newPassword);
      setPasswordMsg({ text: res.message || 'Password changed successfully.', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordMsg({ text: err.message || 'Failed to update password.', type: 'error' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSubmitRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!requestSubject || !requestDescription) {
      setRequestMsg({ text: 'Please fill in all required request fields.', type: 'error' });
      return;
    }
    setSubmittingRequest(true);
    setRequestMsg(null);
    try {
      const payload: any = {
        category: requestCategory,
        subject: requestSubject,
        description: requestDescription
      };
      if (requestStudentId) {
        payload.studentId = Number(requestStudentId);
      }
      const res = await api.createParentRequest(payload);
      setRequestMsg({
        text: res.message || `Request #${res.requestNo || 'SUBMITTED'} submitted successfully to school administration.`,
        type: 'success'
      });
      setRequestSubject('');
      setRequestDescription('');
      setRequestStudentId('');
      void loadParentRequests();
    } catch (err: any) {
      setRequestMsg({ text: err.message || 'Failed to submit official request.', type: 'error' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Full Screen Loading State
  if (loading) {
    return (
      <div className="teacher-shell parent-dashboard-shell">
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
              <span>Parent &amp; Guardian Portal</span>
            </div>
          </div>
        </header>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 64px)', gap: '16px' }}>
          <div className="sh-spinner" style={{ width: '40px', height: '40px', border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
          <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 500 }}>
            Verifying guardian credentials and retrieving linked student records...
          </span>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="teacher-shell parent-dashboard-shell">
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
              <span>Parent &amp; Guardian Portal</span>
            </div>
          </div>
          <button type="button" className="topbar-logout-btn" onClick={onLogout}>Sign Out</button>
        </header>
        <div style={{ padding: '48px', maxWidth: '600px', margin: '40px auto', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #FCA5A5', textAlign: 'center' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚠️</div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#991B1B', margin: '0 0 8px 0' }}>Unable to load parent portal</h2>
          <p style={{ color: '#64748B', fontSize: '14px', marginBottom: '20px' }}>{error}</p>
          <button type="button" className="sh-btn sh-btn-primary" onClick={loadParentDashboard} style={{ background: '#2563EB', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Level 1: Main Persistent Sidebar Items (Strictly Ordered per Section 3)
  const mainNavItems: Array<{
    page: ParentPage;
    label: string;
    icon: string;
    badge?: number;
  }> = [
    { page: 'overview', label: 'Family Dashboard', icon: '📊' },
    { page: 'children', label: 'My Children', icon: '👨‍👧‍👦', badge: verifiedChildren.length },
    { page: 'announcements', label: 'Communication & Notices', icon: '📢', badge: childDetails?.announcements?.length },
    { page: 'requests', label: 'Official Requests', icon: '✍️', badge: parentRequests.filter((r) => r.status === 'pending').length },
    { page: 'notifications', label: 'Notifications', icon: '🔔' },
    ...(hasFinanceAccess ? [{ page: 'finance' as ParentPage, label: 'Fees & Payments', icon: '💳' }] : []),
    { page: 'settings', label: 'Account & Security', icon: '⚙️' }
  ];

  return (
    <div className="teacher-shell parent-dashboard-shell">
      {/* MOBILE DRAWER BACKDROP */}
      {mobileDrawerOpen && (
        <div
          className="parent-drawer-backdrop"
          onClick={() => setMobileDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 1. FIXED APPLICATION TOPBAR */}
      <header className="teacher-topbar">
        <div className="topbar-brand" style={{ display: 'flex', alignItems: 'center' }}>
          <button
            type="button"
            className="topbar-menu-toggle"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Open mobile navigation menu"
            aria-expanded={mobileDrawerOpen}
          >
            ☰
          </button>
          <div className="topbar-logo-box">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>
          <div className="topbar-title">
            <h1>HSPSMS PORTAL</h1>
            <span>Parent &amp; Guardian Portal</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="topbar-location-badge" style={{
            fontSize: '12px',
            color: '#94A3B8',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            padding: '6px 14px',
            borderRadius: '20px',
            fontWeight: 600
          }}>
            📍 Addis Ababa &bull; 2019 E.C. (2026/27)
          </div>

          <div className="topbar-actions">
            <div
              className="user-profile-badge"
              onClick={() => { setActiveTab('settings'); setMobileDrawerOpen(false); }}
              style={{ cursor: 'pointer' }}
              title="View Account & Security"
            >
              <div className="user-avatar">
                {guardianProfile?.first_name ? guardianProfile.first_name.charAt(0).toUpperCase() : user.username.charAt(0).toUpperCase()}
              </div>
              <div className="user-details">
                <div className="user-name">
                  {guardianProfile ? `${guardianProfile.first_name} ${guardianProfile.father_name}` : user.username}
                </div>
                <div className="user-role-label">Guardian</div>
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

      {/* 2. BODY LAYOUT: VERTICAL SIDEBAR + MAIN WORKSPACE */}
      <div className="teacher-layout">
        {/* LEVEL 1: LEFT VERTICAL SIDEBAR */}
        <aside className={`teacher-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileDrawerOpen ? 'mobile-open' : ''}`}>
          {/* Mobile Drawer Header */}
          <div className="mobile-drawer-header">
            <span className="mobile-drawer-title">Parent Navigation</span>
            <button
              type="button"
              className="mobile-drawer-close-btn"
              onClick={() => setMobileDrawerOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>

          {/* Desktop Collapse Toggle Button */}
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span>{sidebarCollapsed ? '▶' : '◀'}</span>
            {!sidebarCollapsed && <span>Collapse Sidebar</span>}
          </button>

          <nav className="sidebar-nav">
            <div className="sidebar-nav-title">Guardian Navigation</div>

            {mainNavItems.map((item) => {
              const isActive = activeTab === item.page;
              return (
                <button
                  key={item.page}
                  type="button"
                  className={`sidebar-tab-btn ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(item.page);
                    setMobileDrawerOpen(false);
                    // If clicking My Children directly, preserve or reset to directory as appropriate
                    if (item.page === 'children' && !childWorkspaceActive) {
                      setChildWorkspaceActive(false);
                    }
                  }}
                  data-tooltip={item.label}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="sidebar-icon" style={{ fontSize: '16px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="sidebar-badge">{item.badge}</span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* SIDEBAR FOOTER: ACTIVE STUDENT CARD */}
          {!sidebarCollapsed && (
            <div className="sidebar-footer-card">
              <h4>Active Student</h4>
              <p style={{ fontWeight: 600, color: '#1F3A5F' }}>
                {activeChildMeta ? `${activeChildMeta.first_name} ${activeChildMeta.father_name}` : 'No verified ward linked'}
              </p>
              <p>
                {activeChildMeta?.grade_name
                  ? `${activeChildMeta.grade_name} - Section ${activeChildMeta.section_name || '—'}`
                  : 'Placement in Progress'}
              </p>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '6px' }}>
                {activeChildMeta?.admission_no ? `ID: ${activeChildMeta.admission_no} • ` : ''}
                {activeChildMeta?.relationship || 'Ward'}
              </div>
              {activeChildMeta && (
                <button
                  type="button"
                  onClick={() => {
                    handleOpenChildWorkspace(activeChildMeta.student_id, 'overview');
                    setMobileDrawerOpen(false);
                  }}
                  style={{
                    marginTop: '8px',
                    width: '100%',
                    background: '#1F3A5F',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Open Workspace &rarr;
                </button>
              )}
            </div>
          )}
        </aside>

        {/* MAIN WORKSPACE CONTENT */}
        <main className="teacher-content" style={{ padding: activeTab === 'children' && childWorkspaceActive ? 0 : undefined }}>
          {/* ============================================================== */}
          {/* TAB 1: FAMILY DASHBOARD (OVERVIEW)                             */}
          {/* ============================================================== */}
          {activeTab === 'overview' && (
            <div style={{ padding: '24px 28px' }}>
              <div className="sh-page-header">
                <div>
                  <h2 className="sh-page-title">
                    Welcome back, {guardianProfile?.first_name || user.username}
                  </h2>
                  <p className="sh-page-desc">
                    HSPSMS Parent &amp; Guardian Family Overview &bull; Academic Year 2019 E.C. (2026/27)
                  </p>
                </div>
              </div>

              {/* Family Overview Metrics */}
              <div className="sh-metrics-grid" style={{ marginBottom: '24px' }}>
                <div className="sh-metric-card">
                  <div className="sh-metric-info">
                    <h4>Verified Wards</h4>
                    <div className="sh-metric-value" style={{ color: '#2563EB' }}>
                      {verifiedChildren.length}
                    </div>
                    <p className="sh-metric-sub">
                      {childrenList.length} total student link(s) on file
                    </p>
                  </div>
                  <div className="sh-metric-icon sh-icon-blue">👨‍👧‍👦</div>
                </div>

                <div className="sh-metric-card">
                  <div className="sh-metric-info">
                    <h4>Primary Ward Attendance</h4>
                    <div className="sh-metric-value" style={{ color: '#059669' }}>
                      {childDetails?.overview?.attendance?.rate ?? 100}%
                    </div>
                    <p className="sh-metric-sub">
                      {activeChildMeta ? `${activeChildMeta.first_name}'s rate` : 'Overall punctuality'}
                    </p>
                  </div>
                  <div className="sh-metric-icon sh-icon-emerald">✓</div>
                </div>

                <div className="sh-metric-card">
                  <div className="sh-metric-info">
                    <h4>Open Requests</h4>
                    <div className="sh-metric-value" style={{ color: '#D97706' }}>
                      {parentRequests.filter((r) => r.status === 'pending').length}
                    </div>
                    <p className="sh-metric-sub">Awaiting registrar review</p>
                  </div>
                  <div className="sh-metric-icon sh-icon-amber">✍️</div>
                </div>

                <div className="sh-metric-card">
                  <div className="sh-metric-info">
                    <h4>School Notices</h4>
                    <div className="sh-metric-value">
                      {childDetails?.announcements?.length || 0}
                    </div>
                    <p className="sh-metric-sub">Active circulars for guardians</p>
                  </div>
                  <div className="sh-metric-icon sh-icon-purple">📢</div>
                </div>
              </div>

              {/* Verified Wards Cards */}
              <div className="sh-panel" style={{ marginBottom: '24px' }}>
                <div className="sh-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="sh-panel-title">👨‍👧‍👦 Linked Children</h3>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('children'); setChildWorkspaceActive(false); }}
                    style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                  >
                    View Full Directory &rarr;
                  </button>
                </div>
                <div className="sh-panel-body">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                    {verifiedChildren.map((child) => (
                      <div
                        key={child.student_id}
                        style={{
                          padding: '16px',
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '10px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div className="child-avatar-sm" style={{ width: '42px', height: '42px', fontSize: '16px' }}>
                            {child.first_name[0]}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                              {child.first_name} {child.father_name}
                            </h4>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>
                              ID: {child.admission_no} &bull; {child.relationship || 'Ward'}
                            </span>
                          </div>
                          <span className="sh-badge sh-badge-emerald">Verified</span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                          <span>Placement:</span>
                          <strong style={{ color: '#1F3A5F' }}>
                            {child.grade_name || `Grade ${child.grade_level}`} - Section {child.section_name || '—'}
                          </strong>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenChildWorkspace(child.student_id, 'overview')}
                          style={{
                            background: '#1F3A5F',
                            color: '#FFFFFF',
                            border: 'none',
                            padding: '10px',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          <span>Open Child Workspace</span>
                          <span>&rarr;</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* School Announcements */}
              <div className="sh-panel">
                <div className="sh-panel-header">
                  <h3 className="sh-panel-title">📢 Latest Announcements</h3>
                </div>
                <div className="sh-panel-body">
                  {childDetails?.announcements && childDetails.announcements.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {childDetails.announcements.slice(0, 3).map((ann: any) => (
                        <div
                          key={ann.id}
                          style={{
                            padding: '14px',
                            background: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px'
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>{ann.title}</div>
                          <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px', lineHeight: 1.5 }}>{ann.content}</div>
                          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>
                            Published {new Date(ann.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="sh-table-empty">No announcements posted for guardians at this time.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: MY CHILDREN (DIRECTORY OR LEVEL 2 CHILD WORKSPACE)      */}
          {/* ============================================================== */}
          {activeTab === 'children' && (
            <>
              {childWorkspaceActive && activeChildMeta ? (
                <ChildWorkspace
                  selectedChild={activeChildMeta}
                  verifiedChildren={verifiedChildren}
                  activeSubPage={childSubPage}
                  onChangeSubPage={(sub) => setChildSubPage(sub)}
                  onSwitchChild={(id) => handleSwitchChild(id)}
                  onBackToDirectory={handleBackToDirectory}
                  childDetails={childDetails}
                  loading={loadingChild}
                  error={childError}
                  onRetry={() => {
                    if (selectedStudentId) void loadChildDetails(selectedStudentId);
                  }}
                />
              ) : (
                <div style={{ padding: '24px 28px' }}>
                  <MyChildrenDirectory
                    childrenList={childrenList}
                    selectedStudentId={selectedStudentId}
                    guardianVerificationStatus={guardianProfile?.verification_status || 'verified'}
                    onSelectChild={(id) => setSelectedStudentId(id)}
                    onOpenChildWorkspace={(id) => handleOpenChildWorkspace(id, 'overview')}
                    loading={loadingChild}
                    error={childError}
                    onRetry={() => {
                      if (selectedStudentId) void loadChildDetails(selectedStudentId);
                    }}
                  />
                </div>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* TAB 3: COMMUNICATION & NOTICES                                 */}
          {/* ============================================================== */}
          {activeTab === 'announcements' && (
            <CommunicationNotices
              verifiedChildren={verifiedChildren}
              selectedStudentId={selectedStudentId}
            />
          )}

          {/* ============================================================== */}
          {/* TAB 4: OFFICIAL REQUESTS                                       */}
          {/* ============================================================== */}
          {activeTab === 'requests' && (
            <div style={{ padding: '24px 28px' }}>
              <div className="sh-page-header">
                <div>
                  <h2 className="sh-page-title">Parent Requests &amp; Inquiries</h2>
                  <p className="sh-page-desc">Submit formal requests to the school registrar, finance office, or faculty</p>
                </div>
              </div>

              {requestMsg && (
                <div className={`sh-alert sh-alert-${requestMsg.type}`} style={{ marginBottom: '20px' }}>
                  <span>{requestMsg.text}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
                {/* Submit Form */}
                <div className="sh-panel">
                  <div className="sh-panel-header">
                    <h3 className="sh-panel-title">✍️ Submit Formal Request</h3>
                  </div>
                  <div className="sh-panel-body">
                    <form onSubmit={handleSubmitRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                          Target Child (Optional)
                        </label>
                        <select
                          value={requestStudentId}
                          onChange={(e) => setRequestStudentId(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                        >
                          <option value="">General Family / School Inquiry</option>
                          {verifiedChildren.map((c) => (
                            <option key={c.student_id} value={c.student_id}>
                              {c.first_name} {c.father_name} (ID: {c.admission_no})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                          Request Category
                        </label>
                        <select
                          value={requestCategory}
                          onChange={(e) => setRequestCategory(e.target.value as any)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                        >
                          <option value="general">General Inquiry</option>
                          <option value="bonafide_letter">Bonafide / Enrollment Verification Letter</option>
                          <option value="fee_inquiry">Tuition &amp; Fees Inquiry</option>
                          <option value="record_correction">Student Record Correction Request</option>
                          <option value="meeting_request">Parent-Teacher Conference Request</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                          Subject / Summary
                        </label>
                        <input
                          type="text"
                          value={requestSubject}
                          onChange={(e) => setRequestSubject(e.target.value)}
                          placeholder="e.g., Request for Semester 1 Verification Certificate"
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                          required
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                          Detailed Description
                        </label>
                        <textarea
                          rows={4}
                          value={requestDescription}
                          onChange={(e) => setRequestDescription(e.target.value)}
                          placeholder="Explain your inquiry in detail..."
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', resize: 'vertical' }}
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submittingRequest}
                        style={{
                          background: '#2563EB',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '12px',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        {submittingRequest ? 'Submitting Request...' : 'Submit Official Request'}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Requests History */}
                <div className="sh-panel">
                  <div className="sh-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="sh-panel-title">📋 Official Requests History</h3>
                    <button
                      type="button"
                      onClick={loadParentRequests}
                      style={{ background: 'none', border: 'none', color: '#2563EB', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="sh-panel-body" style={{ padding: '16px' }}>
                    {loadingRequests ? (
                      <div className="sh-table-empty">Loading requests...</div>
                    ) : parentRequests.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {parentRequests.map((req: any) => (
                          <div
                            key={req.id}
                            style={{
                              padding: '12px',
                              background: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              borderRadius: '8px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 700, fontSize: '13px', color: '#0F172A' }}>
                                {req.request_no}: {req.subject}
                              </span>
                              <span
                                className={`sh-badge ${
                                  req.status === 'resolved' || req.status === 'approved'
                                    ? 'sh-badge-emerald'
                                    : req.status === 'rejected'
                                    ? 'sh-badge-rose'
                                    : 'sh-badge-blue'
                                }`}
                              >
                                {req.status}
                              </span>
                            </div>
                            {req.student_first_name && (
                              <div style={{ fontSize: '11px', color: '#2563EB', marginTop: '3px', fontWeight: 600 }}>
                                Ward: {req.student_first_name} {req.student_father_name} (ID: {req.admission_no})
                              </div>
                            )}
                            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                              {req.description}
                            </div>
                            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>
                              Submitted {new Date(req.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="sh-table-empty">
                        No official requests submitted yet. Use the form on the left to submit a request.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: NOTIFICATIONS                                           */}
          {/* ============================================================== */}
          {activeTab === 'notifications' && (
            <div style={{ padding: '24px 28px' }}>
              <div className="sh-page-header">
                <div>
                  <h2 className="sh-page-title">Guardian Notifications &amp; System Alerts</h2>
                  <p className="sh-page-desc">Official alerts concerning your linked children and institutional updates</p>
                </div>
              </div>

              <div className="sh-panel">
                <div className="sh-panel-body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ padding: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '20px' }}>🔔</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>Semester 1 Report Cards Released</div>
                        <div style={{ fontSize: '13px', color: '#475569', marginTop: '3px' }}>
                          Official marks and final evaluations have been published for all secondary and preparatory students.
                        </div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>Today at 10:00 AM</div>
                      </div>
                    </div>

                    <div style={{ padding: '14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '20px' }}>📋</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>Attendance Verified</div>
                        <div style={{ fontSize: '13px', color: '#475569', marginTop: '3px' }}>
                          Weekly attendance logs have been verified by class homeroom instructors.
                        </div>
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>Yesterday at 4:30 PM</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 6: FEES & PAYMENTS                                         */}
          {/* ============================================================== */}
          {activeTab === 'finance' && (
            <div style={{ padding: '24px 28px' }}>
              <div className="sh-page-header">
                <div>
                  <h2 className="sh-page-title">Tuition Invoices &amp; Payment Receipts</h2>
                  <p className="sh-page-desc">Official billing records and payment reconciliation for authorized wards</p>
                </div>
              </div>

              {/* Student Selector for Multiple Children */}
              {verifiedChildren.length > 1 && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Select Student:</span>
                  {verifiedChildren.map((c) => {
                    const isSelected = c.student_id === financeStudentId;
                    return (
                      <button
                        key={c.student_id}
                        type="button"
                        onClick={() => setFinanceStudentId(c.student_id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1',
                          background: isSelected ? '#EFF6FF' : '#FFFFFF',
                          color: isSelected ? '#1E40AF' : '#334155',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        {c.first_name} {c.father_name} ({c.grade_name || `Grade ${c.grade_level}`})
                      </button>
                    );
                  })}
                </div>
              )}

              {loadingFinance ? (
                <div className="sh-table-empty">Loading financial records...</div>
              ) : (
                <div>
                  {/* Summary Cards */}
                  <div className="sh-metrics-grid" style={{ marginBottom: 20 }}>
                    <div className="sh-metric-card">
                      <div className="sh-metric-info">
                        <h4>Total Invoiced</h4>
                        <div className="sh-metric-value">
                          ETB {Number(financeDetails?.summary?.totalBilled || childDetails?.finance?.summary?.totalBilled || 0).toLocaleString()}
                        </div>
                        <p className="sh-metric-sub">Tuition &amp; term fees</p>
                      </div>
                      <div className="sh-metric-icon sh-icon-blue">📋</div>
                    </div>

                    <div className="sh-metric-card">
                      <div className="sh-metric-info">
                        <h4>Total Paid</h4>
                        <div className="sh-metric-value" style={{ color: '#059669' }}>
                          ETB {Number(financeDetails?.summary?.totalPaid || childDetails?.finance?.summary?.totalPaid || 0).toLocaleString()}
                        </div>
                        <p className="sh-metric-sub">Receipts confirmed</p>
                      </div>
                      <div className="sh-metric-icon sh-icon-emerald">✓</div>
                    </div>

                    <div className="sh-metric-card">
                      <div className="sh-metric-info">
                        <h4>Outstanding Balance</h4>
                        <div
                          className="sh-metric-value"
                          style={{
                            color: Number(financeDetails?.summary?.outstandingBalance || childDetails?.finance?.summary?.outstandingBalance || 0) > 0 ? '#DC2626' : '#059669'
                          }}
                        >
                          ETB {Number(financeDetails?.summary?.outstandingBalance || childDetails?.finance?.summary?.outstandingBalance || 0).toLocaleString()}
                        </div>
                        <p className="sh-metric-sub">Current balance due</p>
                      </div>
                      <div className="sh-metric-icon sh-icon-amber">💰</div>
                    </div>
                  </div>

                  {/* Invoices Table */}
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
                          {((financeDetails?.invoices || childDetails?.finance?.invoices) || []).length > 0 ? (
                            (financeDetails?.invoices || childDetails?.finance?.invoices).map((inv: any) => (
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
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 7: ACCOUNT & SECURITY                                      */}
          {/* ============================================================== */}
          {activeTab === 'settings' && (
            <div style={{ padding: '24px 28px' }}>
              <div className="sh-page-header">
                <div>
                  <h2 className="sh-page-title">Account Settings &amp; Security</h2>
                  <p className="sh-page-desc">Manage guardian profile details, contact preferences, and credentials</p>
                </div>
              </div>

              {passwordMsg && (
                <div className={`sh-alert sh-alert-${passwordMsg.type}`} style={{ marginBottom: '20px' }}>
                  <span>{passwordMsg.text}</span>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                <div className="sh-panel">
                  <div className="sh-panel-header">
                    <h3 className="sh-panel-title">👤 Guardian Profile Information</h3>
                  </div>
                  <div className="sh-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
                      <span style={{ color: '#64748B', fontSize: '13px' }}>Full Name:</span>
                      <span style={{ fontWeight: 700 }}>
                        {guardianProfile ? `${guardianProfile.first_name} ${guardianProfile.father_name}` : user.username}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
                      <span style={{ color: '#64748B', fontSize: '13px' }}>User Account:</span>
                      <span style={{ fontWeight: 600 }}>@{user.username}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
                      <span style={{ color: '#64748B', fontSize: '13px' }}>Primary Phone:</span>
                      <span style={{ fontWeight: 600 }}>{guardianProfile?.phone || 'Verified by SMS'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
                      <span style={{ color: '#64748B', fontSize: '13px' }}>Email Address:</span>
                      <span style={{ fontWeight: 600 }}>{guardianProfile?.email || 'guardian@school.edu.et'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px' }}>
                      <span style={{ color: '#64748B', fontSize: '13px' }}>Verification Status:</span>
                      <span className="sh-badge sh-badge-emerald">
                        {guardianProfile?.verification_status === 'verified' ? 'Verified Guardian' : guardianProfile?.verification_status || 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="sh-panel">
                  <div className="sh-panel-header">
                    <h3 className="sh-panel-title">🔒 Change Account Password</h3>
                  </div>
                  <div className="sh-panel-body">
                    <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                          Current Password
                        </label>
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                          required
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                          New Password (Min 8 characters)
                        </label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                          required
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                          Confirm New Password
                        </label>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={passwordLoading}
                        style={{
                          background: '#1F3A5F',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '12px',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        {passwordLoading ? 'Updating Password...' : 'Save New Password'}
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
