import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { api } from '../../api/client';

interface TeacherLeaveProps {
  onShowToast: (msg: string) => void;
}

interface StaffProfile {
  id: number;
  employee_no: string;
  full_name: string;
  job_title: string;
  department: string;
  employment_status: string;
  hire_date: string | null;
}

interface AttendanceRecord {
  id: number;
  attendance_date: string;
  status: 'present' | 'absent' | 'late' | 'on_leave';
  note: string | null;
  created_at: string;
}

interface LeaveApplication {
  id: number;
  type: string;
  entity_type: string;
  entity_id: number | null;
  new_value_json: {
    startDate?: string;
    endDate?: string;
    leaveType?: string;
    reason?: string;
    coverTeacher?: string;
    contactPhone?: string;
    totalDays?: number;
    [key: string]: any;
  };
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  decided_by_username: string | null;
}

const LEAVE_CATEGORIES = [
  { value: 'Medical / Sick Leave', label: 'Medical / Sick Leave', hint: 'For medical conditions or health consultations' },
  { value: 'Annual Leave', label: 'Annual Leave', hint: 'Planned institutional vacation entitlement' },
  { value: 'Urgent Family Leave', label: 'Urgent Family Leave', hint: 'Emergency domestic matters or family care' },
  { value: 'Maternity / Paternity Leave', label: 'Maternity / Paternity Leave', hint: 'Statutory parental duty leave' },
  { value: 'Bereavement Leave', label: 'Bereavement Leave', hint: 'Compassionate leave for loss of family member' },
  { value: 'Professional Development / School Duty', label: 'Professional Development / School Duty', hint: 'Conferences, workshops, academic curriculum duty' },
  { value: 'Other Exceptional Leave', label: 'Other Exceptional Leave', hint: 'Special circumstances requiring Principal clearance' }
];

export default function TeacherLeave({ onShowToast }: TeacherLeaveProps) {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'attendance' | 'applications' | 'policy'>('attendance');

  // Staff and attendance state
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<{
    totalDays: number;
    present: number;
    absent: number;
    late: number;
    onLeave: number;
    attendanceRate: number;
  }>({
    totalDays: 0,
    present: 0,
    absent: 0,
    late: 0,
    onLeave: 0,
    attendanceRate: 100
  });

  // Leave applications state
  const [leaveApplications, setLeaveApplications] = useState<LeaveApplication[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingApps, setIsLoadingApps] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Attendance filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // Applications filter
  const [appStatusFilter, setAppStatusFilter] = useState<string>('all');

  // Apply Leave Modal state
  const [showApplyModal, setShowApplyModal] = useState<boolean>(false);
  const [leaveType, setLeaveType] = useState<string>(LEAVE_CATEGORIES[0].value);
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('');
  const [coverTeacher, setCoverTeacher] = useState<string>('');
  const [contactPhone, setContactPhone] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Cancelling an application
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Calculated duration in days
  const calculatedDays = useMemo(() => {
    if (!startDate || !endDate) return 1;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return 0;
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [startDate, endDate]);

  // Fetch staff attendance history
  const fetchAttendanceHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getStaffAttendanceHistory({
        status: filterStatus !== 'all' ? filterStatus : undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined
      });
      setStaff(data.staff || null);
      setAttendanceRecords(data.records || []);
      setSummary({
        totalDays: data.summary?.totalDays || 0,
        present: data.summary?.present || 0,
        absent: data.summary?.absent || 0,
        late: data.summary?.late || 0,
        onLeave: data.summary?.onLeave || 0,
        attendanceRate: data.summary?.attendanceRate ?? 100
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load staff attendance logs.');
      onShowToast('Error loading attendance logs.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch leave applications
  const fetchLeaveApplications = async () => {
    setIsLoadingApps(true);
    try {
      const data = await api.getMyLeaveApplications();
      setLeaveApplications(data || []);
    } catch (err: any) {
      console.error('Failed to load leave applications:', err);
    } finally {
      setIsLoadingApps(false);
    }
  };

  useEffect(() => {
    fetchAttendanceHistory();
    fetchLeaveApplications();
  }, [filterStatus, filterStartDate, filterEndDate]);

  // Handle Apply for Leave
  const handleApplyLeave = async (e: FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate || !reason.trim()) {
      alert('Please fill out the start date, end date, and reason for leave.');
      return;
    }
    if (calculatedDays <= 0) {
      alert('End date cannot precede the start date.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.applyForTeacherLeave({
        startDate,
        endDate,
        leaveType,
        reason: reason.trim(),
        coverTeacher: coverTeacher.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined
      });
      onShowToast('Leave application submitted to administration for authorization!');
      setShowApplyModal(false);
      setReason('');
      setCoverTeacher('');
      setContactPhone('');
      // Refresh both tabs
      fetchLeaveApplications();
      fetchAttendanceHistory();
      setActiveTab('applications');
    } catch (err: any) {
      alert(`Application failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Cancel Leave Application
  const handleCancelApplication = async (appId: number) => {
    if (!window.confirm('Are you sure you want to withdraw this leave application?')) {
      return;
    }
    setCancellingId(appId);
    try {
      await api.cancelMyLeaveApplication(appId);
      onShowToast('Leave application withdrawn.');
      fetchLeaveApplications();
    } catch (err: any) {
      alert(`Withdrawal failed: ${err.message}`);
    } finally {
      setCancellingId(null);
    }
  };

  // Filtered applications
  const filteredApplications = useMemo(() => {
    if (appStatusFilter === 'all') return leaveApplications;
    return leaveApplications.filter((app) => app.status === appStatusFilter);
  }, [leaveApplications, appStatusFilter]);

  // Clear filters
  const handleResetFilters = () => {
    setFilterStatus('all');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* PAGE HEADER */}
      <div className="page-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div className="page-breadcrumb" style={{ fontSize: '13px', color: 'var(--text-secondary, #64748B)', marginBottom: '4px' }}>
            <span>Teacher Portal</span> / <span>Staff Services</span> / <span>Leave &amp; Staff Attendance</span>
          </div>
          <h2 className="page-title" style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)' }}>
            Staff Attendance &amp; Leave Services
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              fetchAttendanceHistory();
              fetchLeaveApplications();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowApplyModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 700 }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            + Apply for Staff Leave
          </button>
        </div>
      </div>

      {/* STAFF DUTY PROFILE BANNER */}
      {staff && (
        <div
          style={{
            background: 'var(--card-bg, #FFFFFF)',
            borderRadius: '12px',
            padding: '18px 24px',
            border: '1px solid var(--border-color, #E2E8F0)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #1F3A5F 0%, #2E6DA4 100%)',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '18px'
              }}
            >
              {staff.full_name?.charAt(0) || 'T'}
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)' }}>
                {staff.full_name}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary, #64748B)', display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '2px' }}>
                <span>ID: <strong>{staff.employee_no}</strong></span>
                <span>•</span>
                <span>Role: <strong>{staff.job_title}</strong></span>
                <span>•</span>
                <span>Department: <strong>{staff.department || 'Academic Faculty'}</strong></span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748B)', textTransform: 'uppercase', fontWeight: 600 }}>
                Employment Status
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: staff.employment_status === 'active' ? '#10B981' : '#F59E0B'
                  }}
                />
                <span style={{ fontSize: '13px', fontWeight: 700, color: staff.employment_status === 'active' ? '#065F46' : '#92400E' }}>
                  {staff.employment_status?.toUpperCase() || 'ACTIVE'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI METRICS ROW */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px'
        }}
      >
        <div style={{ background: 'var(--card-bg, #FFFFFF)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color, #E2E8F0)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Total Working Days</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)', margin: '4px 0' }}>
            {summary.totalDays} <span style={{ fontSize: '14px', fontWeight: 500 }}>Sessions</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748B)' }}>Institutional log records</div>
        </div>

        <div style={{ background: 'var(--card-bg, #FFFFFF)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color, #E2E8F0)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Present on Duty</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#10B981', margin: '4px 0' }}>
            {summary.present} <span style={{ fontSize: '14px', fontWeight: 500 }}>Days</span>
          </div>
          <div style={{ fontSize: '11px', color: '#059669' }}>Regular instructional duty</div>
        </div>

        <div style={{ background: 'var(--card-bg, #FFFFFF)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color, #E2E8F0)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Attendance Rate</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: summary.attendanceRate >= 90 ? '#10B981' : summary.attendanceRate >= 75 ? '#F59E0B' : '#EF4444', margin: '4px 0' }}>
            {summary.attendanceRate}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748B)' }}>Duty punctuality score</div>
        </div>

        <div style={{ background: 'var(--card-bg, #FFFFFF)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color, #E2E8F0)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Late Arrivals</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#F59E0B', margin: '4px 0' }}>
            {summary.late} <span style={{ fontSize: '14px', fontWeight: 500 }}>Days</span>
          </div>
          <div style={{ fontSize: '11px', color: '#D97706' }}>Noted with grace period</div>
        </div>

        <div style={{ background: 'var(--card-bg, #FFFFFF)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color, #E2E8F0)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Authorized Leaves</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#3B82F6', margin: '4px 0' }}>
            {summary.onLeave} <span style={{ fontSize: '14px', fontWeight: 500 }}>Days</span>
          </div>
          <div style={{ fontSize: '11px', color: '#2563EB' }}>Principal approved absence</div>
        </div>

        <div style={{ background: 'var(--card-bg, #FFFFFF)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-color, #E2E8F0)' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>Unexcused Absences</div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: summary.absent > 0 ? '#EF4444' : '#10B981', margin: '4px 0' }}>
            {summary.absent} <span style={{ fontSize: '14px', fontWeight: 500 }}>Days</span>
          </div>
          <div style={{ fontSize: '11px', color: summary.absent > 0 ? '#DC2626' : '#059669' }}>
            {summary.absent > 0 ? 'Requires administrative review' : 'Zero unexcused absence'}
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div style={{ borderBottom: '1px solid var(--border-color, #E2E8F0)', display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'attendance' ? '3px solid #1F3A5F' : '3px solid transparent',
            color: activeTab === 'attendance' ? '#1F3A5F' : 'var(--text-secondary, #64748B)',
            fontWeight: activeTab === 'attendance' ? 700 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Daily Attendance Logs ({attendanceRecords.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('applications')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'applications' ? '3px solid #1F3A5F' : '3px solid transparent',
            color: activeTab === 'applications' ? '#1F3A5F' : 'var(--text-secondary, #64748B)',
            fontWeight: activeTab === 'applications' ? 700 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          My Leave Applications ({leaveApplications.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('policy')}
          style={{
            padding: '12px 20px',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'policy' ? '3px solid #1F3A5F' : '3px solid transparent',
            color: activeTab === 'policy' ? '#1F3A5F' : 'var(--text-secondary, #64748B)',
            fontWeight: activeTab === 'policy' ? 700 : 500,
            fontSize: '14px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Staff Leave &amp; Duty Policy
        </button>
      </div>

      {/* TAB 1: DAILY ATTENDANCE LOGS */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* FILTERS BAR */}
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color, #E2E8F0)',
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="filterStatusSelect" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary, #64748B)' }}>
                Result Status:
              </label>
              <select
                id="filterStatusSelect"
                className="form-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ width: '160px' }}
              >
                <option value="all">All Logs ({summary.totalDays})</option>
                <option value="present">Present ({summary.present})</option>
                <option value="late">Late Arrival ({summary.late})</option>
                <option value="on_leave">Authorized Leave ({summary.onLeave})</option>
                <option value="absent">Absent ({summary.absent})</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="filterStartInput" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary, #64748B)' }}>
                From:
              </label>
              <input
                id="filterStartInput"
                type="date"
                className="form-input"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                style={{ width: '150px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="filterEndInput" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary, #64748B)' }}>
                To:
              </label>
              <input
                id="filterEndInput"
                type="date"
                className="form-input"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                style={{ width: '150px' }}
              />
            </div>

            {(filterStatus !== 'all' || filterStartDate || filterEndDate) && (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleResetFilters}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                Clear Filters
              </button>
            )}

            <div style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-secondary, #64748B)' }}>
              Showing <strong>{attendanceRecords.length}</strong> log entries
            </div>
          </div>

          {/* TABLE OR LOADING */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary, #64748B)' }}>
              <div className="spinner" style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '28px', height: '28px' }}></div>
              <p>Fetching staff duty records from MySQL...</p>
            </div>
          ) : error ? (
            <div className="alert-banner alert-danger">
              <span>⚠️ {error}</span>
            </div>
          ) : attendanceRecords.length === 0 ? (
            <div
              style={{
                background: 'var(--card-bg, #FFFFFF)',
                padding: '48px 24px',
                borderRadius: '12px',
                textAlign: 'center',
                border: '1px solid var(--border-color, #E2E8F0)'
              }}
            >
              <div style={{ fontSize: '42px', marginBottom: '12px' }}>📋</div>
              <h3 style={{ color: 'var(--text-primary, #1F3A5F)', margin: '0 0 8px' }}>No Attendance Records Found</h3>
              <p style={{ color: 'var(--text-secondary, #64748B)', maxWidth: '440px', margin: '0 auto 16px' }}>
                There are no staff attendance logs matching the current filter criteria.
              </p>
              {(filterStatus !== 'all' || filterStartDate || filterEndDate) && (
                <button type="button" className="btn-secondary" onClick={handleResetFilters}>
                  Clear Search Filters
                </button>
              )}
            </div>
          ) : (
            <div className="data-table-container" style={{ background: 'var(--card-bg, #FFFFFF)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color, #E2E8F0)' }}>
              <table className="spec-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg, #F8FAFC)', borderBottom: '1px solid var(--border-color, #E2E8F0)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748B' }}>#</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748B' }}>Working Date</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748B' }}>Day of Week</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748B' }}>Attendance Result</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748B' }}>Administrative Remarks</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#64748B' }}>Logged At</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRecords.map((r, idx) => {
                    const recordDate = new Date(r.attendance_date);
                    const dayName = recordDate.toLocaleDateString('en-US', { weekday: 'long' });
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color, #F1F5F9)' }}>
                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary, #64748B)', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--text-primary, #1F3A5F)' }}>
                          {recordDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-secondary, #64748B)', fontSize: '13px' }}>
                          {dayName}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span
                            className={`badge-solid ${
                              r.status === 'present'
                                ? 'badge-emerald'
                                : r.status === 'on_leave'
                                ? 'badge-blue'
                                : r.status === 'late'
                                ? 'badge-amber'
                                : 'badge-rose'
                            }`}
                            style={{ padding: '4px 10px', fontSize: '11px', fontWeight: 700, borderRadius: '6px' }}
                          >
                            {r.status === 'present' ? '✓ PRESENT' : r.status === 'late' ? '⏱ LATE ARRIVAL' : r.status === 'on_leave' ? '✈ ON LEAVE' : '✗ ABSENT'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '13px', color: 'var(--text-secondary, #64748B)' }}>
                          {r.note || (r.status === 'present' ? 'Standard teaching session duty logged' : 'Duty verification complete')}
                        </td>
                        <td style={{ padding: '14px 16px', fontSize: '12px', color: '#94A3B8' }}>
                          {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY LEAVE APPLICATIONS */}
      {activeTab === 'applications' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* FILTER BAR FOR APPLICATIONS */}
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              padding: '14px 18px',
              borderRadius: '12px',
              border: '1px solid var(--border-color, #E2E8F0)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary, #64748B)' }}>Filter by Status:</span>
              {(['all', 'pending', 'approved', 'rejected', 'cancelled'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setAppStatusFilter(st)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: appStatusFilter === st ? '#1F3A5F' : 'var(--border-color, #E2E8F0)',
                    background: appStatusFilter === st ? '#1F3A5F' : 'transparent',
                    color: appStatusFilter === st ? '#FFFFFF' : 'var(--text-secondary, #64748B)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowApplyModal(true)}
              style={{ fontSize: '13px', padding: '8px 16px' }}
            >
              + New Leave Request
            </button>
          </div>

          {/* APPLICATIONS LIST */}
          {isLoadingApps ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary, #64748B)' }}>
              <div className="spinner" style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '28px', height: '28px' }}></div>
              <p>Loading your leave applications...</p>
            </div>
          ) : filteredApplications.length === 0 ? (
            <div
              style={{
                background: 'var(--card-bg, #FFFFFF)',
                padding: '48px 24px',
                borderRadius: '12px',
                textAlign: 'center',
                border: '1px solid var(--border-color, #E2E8F0)'
              }}
            >
              <div style={{ fontSize: '42px', marginBottom: '12px' }}>🏖️</div>
              <h3 style={{ color: 'var(--text-primary, #1F3A5F)', margin: '0 0 8px' }}>
                {appStatusFilter === 'all' ? 'No Leave Applications' : `No ${appStatusFilter} leave applications`}
              </h3>
              <p style={{ color: 'var(--text-secondary, #64748B)', maxWidth: '460px', margin: '0 auto 20px' }}>
                You have not submitted any staff leave applications yet. Need time off for medical, personal, or training reasons? Submit an application to administration.
              </p>
              <button type="button" className="btn-primary" onClick={() => setShowApplyModal(true)}>
                + Apply for Staff Leave
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredApplications.map((app) => {
                const payload = app.new_value_json || {};
                const startStr = payload.startDate || 'N/A';
                const endStr = payload.endDate || 'N/A';
                const days = payload.totalDays || 1;
                const category = payload.leaveType || 'General Staff Leave';

                return (
                  <div
                    key={app.id}
                    style={{
                      background: 'var(--card-bg, #FFFFFF)',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color, #E2E8F0)',
                      padding: '20px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px'
                    }}
                  >
                    {/* Top Row: Category + Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            background: '#EFF6FF',
                            color: '#1E40AF',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '12px'
                          }}
                        >
                          {category}
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary, #64748B)' }}>
                          Request #{app.id} • Submitted on {new Date(app.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          className={`badge-solid ${
                            app.status === 'approved'
                              ? 'badge-emerald'
                              : app.status === 'pending'
                              ? 'badge-amber'
                              : app.status === 'rejected'
                              ? 'badge-rose'
                              : 'badge-slate'
                          }`}
                          style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 }}
                        >
                          {app.status === 'pending' ? '⏳ PENDING REVIEW' : app.status === 'approved' ? '✓ APPROVED' : app.status === 'rejected' ? '✗ REJECTED' : 'CANCELLED'}
                        </span>

                        {app.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => handleCancelApplication(app.id)}
                            disabled={cancellingId === app.id}
                            style={{
                              border: '1px solid #EF4444',
                              background: '#FEF2F2',
                              color: '#DC2626',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {cancellingId === app.id ? 'Withdrawing...' : 'Withdraw'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Middle: Leave Duration & Details */}
                    <div
                      style={{
                        background: 'var(--bg-primary, #F8FAFC)',
                        padding: '14px 18px',
                        borderRadius: '8px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748B)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Leave Duration
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #1F3A5F)', marginTop: '2px' }}>
                          {startStr} → {endStr}
                        </div>
                        <div style={{ fontSize: '12px', color: '#2563EB', fontWeight: 600 }}>
                          {days} calendar {days === 1 ? 'day' : 'days'}
                        </div>
                      </div>

                      {payload.coverTeacher && (
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748B)', textTransform: 'uppercase', fontWeight: 600 }}>
                            Cover / Handover Colleague
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #1F3A5F)', marginTop: '2px' }}>
                            {payload.coverTeacher}
                          </div>
                        </div>
                      )}

                      {payload.contactPhone && (
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748B)', textTransform: 'uppercase', fontWeight: 600 }}>
                            Contact While Away
                          </div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #1F3A5F)', marginTop: '2px' }}>
                            {payload.contactPhone}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Reason */}
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #64748B)', marginBottom: '4px' }}>
                        Reason &amp; Handover Explanation:
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary, #334155)', lineHeight: 1.5 }}>
                        {app.reason || payload.reason || 'No description provided.'}
                      </p>
                    </div>

                    {/* Administrative Decision if decided */}
                    {app.status !== 'pending' && (
                      <div
                        style={{
                          borderTop: '1px solid var(--border-color, #E2E8F0)',
                          paddingTop: '12px',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '12px'
                        }}
                      >
                        <div style={{ fontSize: '18px' }}>
                          {app.status === 'approved' ? '✅' : app.status === 'rejected' ? '❌' : 'ℹ️'}
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary, #1F3A5F)' }}>
                            Administrative Resolution {app.decided_by_username ? `by ${app.decided_by_username}` : ''}
                            {app.decided_at && ` • ${new Date(app.decided_at).toLocaleDateString()}`}
                          </div>
                          {app.decision_note ? (
                            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary, #64748B)' }}>
                              Remarks: "{app.decision_note}"
                            </p>
                          ) : (
                            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary, #64748B)' }}>
                              {app.status === 'approved' ? 'Leave authorized without additional condition.' : 'Application marked closed.'}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: INSTITUTIONAL POLICY */}
      {activeTab === 'policy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              padding: '28px',
              borderRadius: '12px',
              border: '1px solid var(--border-color, #E2E8F0)'
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)' }}>
              Faculty Attendance, Punctuality &amp; Leave Guidelines
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div style={{ background: 'var(--bg-primary, #F8FAFC)', padding: '18px', borderRadius: '10px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, color: '#1F3A5F' }}>
                  🕒 Daily Arrival &amp; Check-In
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary, #475569)', lineHeight: 1.5, margin: 0 }}>
                  All faculty members must check in at the front campus terminal prior to morning assembly (08:00 AM). Check-ins between 08:01 AM and 08:30 AM are logged as <strong>Late Arrival</strong> within grace periods. Unnotified check-ins after 08:30 AM are flagged for HR review.
                </p>
              </div>

              <div style={{ background: 'var(--bg-primary, #F8FAFC)', padding: '18px', borderRadius: '10px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, color: '#1F3A5F' }}>
                  🏥 Sick &amp; Medical Leaves
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary, #475569)', lineHeight: 1.5, margin: 0 }}>
                  Medical leave can be applied retrospectively within 24 hours of returning to campus. Absences exceeding two (2) consecutive working days require an official medical certificate signed by an authorized physician.
                </p>
              </div>

              <div style={{ background: 'var(--bg-primary, #F8FAFC)', padding: '18px', borderRadius: '10px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, color: '#1F3A5F' }}>
                  📅 Planned Annual &amp; Vacation Leave
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary, #475569)', lineHeight: 1.5, margin: 0 }}>
                  Planned non-emergency leave requests must be submitted at least three (3) working days in advance. Teachers must coordinate lesson handouts or assign a peer cover teacher to ensure curriculum continuity.
                </p>
              </div>

              <div style={{ background: 'var(--bg-primary, #F8FAFC)', padding: '18px', borderRadius: '10px' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 700, color: '#1F3A5F' }}>
                  ✍️ Approval Authority
                </h4>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary, #475569)', lineHeight: 1.5, margin: 0 }}>
                  All teacher leave applications are routed directly into the <strong>Administration Approvals Queue</strong>. The Principal or Academic Dean reviews and authorizes requests based on departmental coverage.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* APPLY FOR LEAVE MODAL */}
      {showApplyModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: '16px'
          }}
        >
          <div
            style={{
              background: 'var(--card-bg, #FFFFFF)',
              borderRadius: '16px',
              padding: '28px',
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)' }}>
                  Submit Staff Leave Application
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary, #64748B)' }}>
                  This request will be routed directly to the Principal's approval queue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94A3B8' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleApplyLeave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="input-label" htmlFor="leaveCategorySelect">
                  Leave Category <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  id="leaveCategorySelect"
                  className="form-select"
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                >
                  {LEAVE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #64748B)', marginTop: '4px' }}>
                  {LEAVE_CATEGORIES.find((c) => c.value === leaveType)?.hint}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="input-label" htmlFor="leaveStartDateInput">
                    Start Date <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    id="leaveStartDateInput"
                    type="date"
                    className="form-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="leaveEndDateInput">
                    End Date <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    id="leaveEndDateInput"
                    type="date"
                    className="form-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Calculated duration badge */}
              <div
                style={{
                  background: calculatedDays > 0 ? '#EFF6FF' : '#FEF2F2',
                  border: `1px solid ${calculatedDays > 0 ? '#BFDBFE' : '#FECACA'}`,
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '13px', color: calculatedDays > 0 ? '#1E40AF' : '#991B1B', fontWeight: 600 }}>
                  {calculatedDays > 0
                    ? `Estimated Duration: ${calculatedDays} Working/Calendar Day${calculatedDays > 1 ? 's' : ''}`
                    : 'Invalid range: End date must be on or after start date.'}
                </span>
                {calculatedDays > 0 && (
                  <span style={{ fontSize: '11px', color: '#3B82F6', fontWeight: 700 }}>
                    {calculatedDays <= 2 ? 'Short Absence' : 'Extended Leave'}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label className="input-label" htmlFor="coverTeacherInput">
                    Peer Cover / Handover Teacher
                  </label>
                  <input
                    id="coverTeacherInput"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Mr. Abebe (Maths)"
                    value={coverTeacher}
                    onChange={(e) => setCoverTeacher(e.target.value)}
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="contactPhoneInput">
                    Emergency Phone While Away
                  </label>
                  <input
                    id="contactPhoneInput"
                    type="tel"
                    className="form-input"
                    placeholder="e.g. +251 91 123 4567"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="input-label" htmlFor="leaveReasonInput">
                  Reason &amp; Handover Explanation <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <textarea
                  id="leaveReasonInput"
                  className="form-input"
                  rows={3}
                  placeholder="Detail the circumstances for your absence and any classroom or assessment tasks assigned during this period..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowApplyModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting || calculatedDays <= 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {isSubmitting ? (
                    <>
                      <div className="spinner" style={{ width: '14px', height: '14px', borderColor: '#FFFFFF', borderTopColor: 'transparent' }} />
                      Submitting...
                    </>
                  ) : (
                    'Submit to Administration'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
