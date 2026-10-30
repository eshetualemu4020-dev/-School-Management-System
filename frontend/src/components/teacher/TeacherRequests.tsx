import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { api } from '../../api/client';

interface TeacherRequestsProps {
  assignedClasses?: any[];
  onShowToast: (msg: string) => void;
}

interface ApprovalRequest {
  id: number;
  type: string;
  entity_type: string;
  entity_id: number | null;
  old_value_json: any;
  new_value_json: any;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decided_by_username?: string | null;
  decision_note?: string | null;
  decided_at?: string | null;
  created_at: string;
}

const LEAVE_TYPES = [
  'Medical / Sick Leave',
  'Annual Leave',
  'Emergency Family Leave',
  'Maternity / Paternity Leave',
  'Bereavement Leave',
  'Professional Development / School Duty'
];

export default function TeacherRequests({
  assignedClasses = [],
  onShowToast
}: TeacherRequestsProps) {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'closed'>('all');

  // Filters toolbar
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Inspector card
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);

  // Submit Modal
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [requestType, setRequestType] = useState<
    'leave_request' | 'attendance_edit_after_lock' | 'result_unlock' | 'timetable_change'
  >('leave_request');
  const [reason, setReason] = useState<string>('');

  // Leave fields
  const [leaveType, setLeaveType] = useState<string>(LEAVE_TYPES[0]);
  const [leaveStartDate, setLeaveStartDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [leaveEndDate, setLeaveEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });

  // Attendance fields
  const [attendanceSectionId, setAttendanceSectionId] = useState<number | null>(null);
  const [attendanceDate, setAttendanceDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [attendanceCorrectionDetails, setAttendanceCorrectionDetails] = useState<string>('');

  // Result unlock fields
  const [assessmentTitle, setAssessmentTitle] = useState<string>('');
  const [assessmentClassId, setAssessmentClassId] = useState<number | null>(null);

  // Timetable change fields
  const [timetableSectionId, setTimetableSectionId] = useState<number | null>(null);
  const [timetableDetails, setTimetableDetails] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fetch requests from backend
  const fetchRequests = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getMyTeacherRequests();
      setRequests(data || []);
      if (assignedClasses.length > 0 && !attendanceSectionId) {
        setAttendanceSectionId(assignedClasses[0].section_id);
        setAssessmentClassId(assignedClasses[0].section_id);
        setTimetableSectionId(assignedClasses[0].section_id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load requests & approvals.');
      onShowToast('Error loading requests.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // Format request type name
  const formatRequestType = (type: string) => {
    switch (type) {
      case 'attendance_edit_after_lock':
        return 'Attendance Correction';
      case 'result_unlock':
        return 'Mark Correction / Result Unlock';
      case 'leave_request':
        return 'Staff Leave Application';
      case 'timetable_change':
        return 'Timetable / Schedule Change';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  // Cancel pending request
  const handleCancelRequest = async (id: number) => {
    if (!window.confirm('Are you sure you want to withdraw/cancel this pending request?')) return;
    try {
      await api.cancelMyTeacherRequest(id);
      onShowToast('Request successfully cancelled and withdrawn.');
      await fetchRequests();
      if (selectedRequest?.id === id) {
        setSelectedRequest((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
      }
    } catch (err: any) {
      alert(`Failed to cancel request: ${err.message}`);
    }
  };

  // Re-submit / Clone rejected request
  const handleResubmit = (req: ApprovalRequest) => {
    if (
      req.type === 'leave_request' ||
      req.type === 'attendance_edit_after_lock' ||
      req.type === 'result_unlock' ||
      req.type === 'timetable_change'
    ) {
      setRequestType(req.type);
    }
    setReason(`Resubmission for #${req.id}: ${req.reason}`);
    setShowSubmitModal(true);
  };

  // Submit new request handler
  const handleSubmitRequest = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      alert('Please provide a comprehensive reason or justification.');
      return;
    }

    setIsSubmitting(true);
    try {
      let newValueJson: any = {};
      let entityId: number | undefined = undefined;

      if (requestType === 'leave_request') {
        newValueJson = {
          leaveType,
          startDate: leaveStartDate,
          endDate: leaveEndDate,
          reason: reason.trim()
        };
      } else if (requestType === 'attendance_edit_after_lock') {
        const selectedSec = assignedClasses.find((c) => c.section_id === attendanceSectionId);
        newValueJson = {
          sectionId: attendanceSectionId,
          sectionName: selectedSec?.section_name || `Section #${attendanceSectionId}`,
          attendanceDate,
          correctionNotes: attendanceCorrectionDetails.trim()
        };
        entityId = attendanceSectionId || undefined;
      } else if (requestType === 'result_unlock') {
        const selectedSec = assignedClasses.find((c) => c.section_id === assessmentClassId);
        newValueJson = {
          assessmentTitle: assessmentTitle.trim(),
          sectionId: assessmentClassId,
          sectionName: selectedSec?.section_name || 'N/A',
          reason: reason.trim()
        };
      } else if (requestType === 'timetable_change') {
        const selectedSec = assignedClasses.find((c) => c.section_id === timetableSectionId);
        newValueJson = {
          sectionId: timetableSectionId,
          sectionName: selectedSec?.section_name || 'N/A',
          adjustmentDetails: timetableDetails.trim(),
          reason: reason.trim()
        };
        entityId = timetableSectionId || undefined;
      }

      await api.createTeacherRequest({
        type: requestType,
        entityId,
        reason: reason.trim(),
        newValueJson
      });

      onShowToast('Official administrative request submitted successfully!');
      setShowSubmitModal(false);
      setReason('');
      setAttendanceCorrectionDetails('');
      setAssessmentTitle('');
      setTimetableDetails('');
      await fetchRequests();
      setActiveTab('pending');
    } catch (err: any) {
      alert(`Failed to submit request: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to safely parse JSON payloads
  const parseJsonSafe = (raw: any) => {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  // Computed KPI metrics
  const metrics = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let cancelled = 0;

    requests.forEach((r) => {
      if (r.status === 'pending') pending++;
      else if (r.status === 'approved') approved++;
      else if (r.status === 'rejected') rejected++;
      else if (r.status === 'cancelled') cancelled++;
    });

    return {
      total: requests.length,
      pending,
      approved,
      rejected,
      cancelled
    };
  }, [requests]);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // Tab filter
      if (activeTab === 'pending' && r.status !== 'pending') return false;
      if (activeTab === 'approved' && r.status !== 'approved') return false;
      if (activeTab === 'closed' && r.status !== 'rejected' && r.status !== 'cancelled') return false;

      // Type filter
      if (filterType !== 'all' && r.type !== filterType) return false;

      // Status filter
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesReason = (r.reason || '').toLowerCase().includes(q);
        const matchesType = (r.type || '').toLowerCase().includes(q);
        const matchesNote = (r.decision_note || '').toLowerCase().includes(q);
        const matchesDecider = (r.decided_by_username || '').toLowerCase().includes(q);
        const matchesId = String(r.id).includes(q);
        if (!matchesReason && !matchesType && !matchesNote && !matchesDecider && !matchesId) {
          return false;
        }
      }

      return true;
    });
  }, [requests, activeTab, filterType, filterStatus, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* PAGE HEADER */}
      <div className="page-header-row" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="page-breadcrumb">
            <span>Teacher Portal</span> / <span>Workflow Governance</span> / <span>Requests &amp; Approvals</span>
          </div>
          <h2 className="page-title" style={{ margin: '4px 0 6px' }}>Decision Requests &amp; Change Governance</h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #64748B)' }}>
            Submit and track administrative requests for staff leave, locked attendance adjustments, exam score corrections, and schedule changes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={fetchRequests}
            title="Refresh requests from database"
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
            onClick={() => setShowSubmitModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            + Submit New Request
          </button>
        </div>
      </div>

      {/* POLICY BOX */}
      <div
        style={{
          background: 'rgba(30, 58, 95, 0.05)',
          border: '1px solid rgba(30, 58, 95, 0.2)',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#1F3A5F" style={{ flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <div style={{ fontSize: '13px', color: 'var(--text-primary, #334155)', lineHeight: '1.45' }}>
          <strong>Segregation of Duties Policy:</strong> All corrections to finalized attendance records, published examination scores, staff leave dates, or timetable assignments require administrative sign-off by the Principal or Academic Director. Every approval generates an immutable audit record.
        </div>
      </div>

      {/* KPI METRICS OVERVIEW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
        {/* Total Filed */}
        <div
          style={{
            background: 'var(--bg-card, #FFFFFF)',
            border: '1px solid var(--border-color, #E2E8F0)',
            borderRadius: '12px',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px'
            }}
          >
            📋
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #64748B)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Petitions
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)', marginTop: '2px' }}>
              {metrics.total}
            </div>
          </div>
        </div>

        {/* Pending Review */}
        <div
          style={{
            background: 'var(--bg-card, #FFFFFF)',
            border: '1px solid var(--border-color, #E2E8F0)',
            borderRadius: '12px',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#FFFBEB',
              color: '#D97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px'
            }}
          >
            ⏳
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Awaiting Review
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#B45309', marginTop: '2px' }}>
              {metrics.pending}
            </div>
          </div>
        </div>

        {/* Approved */}
        <div
          style={{
            background: 'var(--bg-card, #FFFFFF)',
            border: '1px solid var(--border-color, #E2E8F0)',
            borderRadius: '12px',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#F0FDF4',
              color: '#16A34A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px'
            }}
          >
            ✅
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Approved Decisions
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>
              {metrics.approved}
            </div>
          </div>
        </div>

        {/* Rejected / Closed */}
        <div
          style={{
            background: 'var(--bg-card, #FFFFFF)',
            border: '1px solid var(--border-color, #E2E8F0)',
            borderRadius: '12px',
            padding: '18px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#FEF2F2',
              color: '#DC2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px'
            }}
          >
            🚫
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Rejected / Closed
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#991B1B', marginTop: '2px' }}>
              {metrics.rejected + metrics.cancelled}
            </div>
          </div>
        </div>
      </div>

      {/* TABS + FILTER TOOLBAR */}
      <div
        style={{
          background: 'var(--bg-card, #FFFFFF)',
          border: '1px solid var(--border-color, #E2E8F0)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}
      >
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color, #E2E8F0)', paddingBottom: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={activeTab === 'all' ? 'btn-primary' : 'btn-outline'}
            style={{ padding: '6px 14px', fontSize: '13px' }}
            onClick={() => setActiveTab('all')}
          >
            All Requests ({requests.length})
          </button>
          <button
            type="button"
            className={activeTab === 'pending' ? 'btn-primary' : 'btn-outline'}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              ...(activeTab === 'pending' ? { background: '#D97706', borderColor: '#D97706' } : {})
            }}
            onClick={() => setActiveTab('pending')}
          >
            ⏳ Pending Review ({metrics.pending})
          </button>
          <button
            type="button"
            className={activeTab === 'approved' ? 'btn-primary' : 'btn-outline'}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              ...(activeTab === 'approved' ? { background: '#16A34A', borderColor: '#16A34A' } : {})
            }}
            onClick={() => setActiveTab('approved')}
          >
            ✅ Approved ({metrics.approved})
          </button>
          <button
            type="button"
            className={activeTab === 'closed' ? 'btn-primary' : 'btn-outline'}
            style={{ padding: '6px 14px', fontSize: '13px' }}
            onClick={() => setActiveTab('closed')}
          >
            🚫 Rejected / Closed ({metrics.rejected + metrics.cancelled})
          </button>
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'center' }}>
          {/* Search box */}
          <div style={{ position: 'relative' }}>
            <svg
              width="16"
              height="16"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#94A3B8"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search reason, note, decider, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '36px', height: '38px', fontSize: '13px', width: '100%' }}
            />
          </div>

          {/* Type Filter */}
          <div>
            <select
              className="form-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ height: '38px', fontSize: '13px', width: '100%' }}
            >
              <option value="all">All Request Categories</option>
              <option value="leave_request">Staff Leave Application</option>
              <option value="attendance_edit_after_lock">Attendance Correction</option>
              <option value="result_unlock">Mark / Result Unlock</option>
              <option value="timetable_change">Timetable / Schedule Change</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              className="form-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ height: '38px', fontSize: '13px', width: '100%' }}
            >
              <option value="all">All Decision States</option>
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Reset Filters */}
          {(filterType !== 'all' || filterStatus !== 'all' || searchQuery.trim()) && (
            <div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setFilterType('all');
                  setFilterStatus('all');
                  setSearchQuery('');
                }}
                style={{ height: '38px', fontSize: '12px', padding: '0 14px', width: '100%' }}
              >
                ✕ Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* REQUESTS LISTING & INSPECTOR SPLIT VIEW */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
          <div
            className="spinner"
            style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '32px', height: '32px' }}
          ></div>
          <p style={{ fontWeight: 600 }}>Loading decision records from MySQL...</p>
        </div>
      ) : error ? (
        <div className="alert-banner alert-danger">
          <span>⚠️ {error}</span>
          <button type="button" className="btn-outline" onClick={fetchRequests} style={{ marginLeft: '12px' }}>
            Try Again
          </button>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div
          style={{
            background: 'var(--bg-card, #FFFFFF)',
            padding: '48px 24px',
            borderRadius: '12px',
            textAlign: 'center',
            border: '1px solid var(--border-color, #E2E8F0)'
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚖️</div>
          <h3 style={{ color: 'var(--text-primary, #1F3A5F)', margin: '0 0 8px', fontSize: '18px' }}>
            No Decision Requests Found
          </h3>
          <p style={{ color: 'var(--text-secondary, #64748B)', maxWidth: '460px', margin: '0 auto 20px', fontSize: '13px' }}>
            {searchQuery || filterType !== 'all' || filterStatus !== 'all'
              ? 'No requests match your current search and filter parameters.'
              : 'You have not submitted any administrative change requests for this category.'}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowSubmitModal(true)}
          >
            + Submit New Request
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selectedRequest ? '1fr 380px' : '1fr', gap: '20px', alignItems: 'flex-start' }}>
          {/* Table */}
          <div className="data-table-container" style={{ background: 'var(--bg-card, #FFFFFF)', borderRadius: '12px', overflow: 'hidden' }}>
            <table className="spec-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th style={{ width: '120px' }}>Submitted</th>
                  <th>Category</th>
                  <th>Reason / Justification</th>
                  <th style={{ textAlign: 'center', width: '110px' }}>Status</th>
                  <th>Decision Outcome</th>
                  <th style={{ textAlign: 'right', width: '150px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((req, idx) => {
                  const isSelected = selectedRequest?.id === req.id;
                  return (
                    <tr
                      key={req.id}
                      style={{
                        borderBottom: '1px solid var(--border-color, #E2E8F0)',
                        background: isSelected ? 'rgba(37, 99, 235, 0.05)' : undefined,
                        cursor: 'pointer'
                      }}
                      onClick={() => setSelectedRequest(req)}
                    >
                      <td style={{ color: '#64748B', fontWeight: 600, fontSize: '13px' }}>{idx + 1}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: '#64748B' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary, #1F3A5F)' }}>
                          {new Date(req.created_at).toLocaleDateString()}
                        </div>
                        <div>{new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary, #1F3A5F)', fontSize: '13px' }}>
                          {formatRequestType(req.type)}
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748B' }}>
                          Ref #{req.id} • {req.entity_type} {req.entity_id ? `(#${req.entity_id})` : ''}
                        </span>
                      </td>
                      <td style={{ maxWidth: '240px', fontSize: '13px', color: 'var(--text-primary, #334155)', lineHeight: '1.4' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {req.reason}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span
                          className={`badge-solid ${
                            req.status === 'approved'
                              ? 'badge-emerald'
                              : req.status === 'pending'
                              ? 'badge-amber'
                              : req.status === 'rejected'
                              ? 'badge-rose'
                              : 'badge-slate'
                          }`}
                          style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748B', maxWidth: '200px' }}>
                        {req.decided_by_username ? (
                          <div>
                            <span>By <strong>@{req.decided_by_username}</strong></span>
                            {req.decision_note && (
                              <div style={{ color: req.status === 'approved' ? '#15803D' : '#DC2626', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                "{req.decision_note}"
                              </div>
                            )}
                          </div>
                        ) : req.status === 'cancelled' ? (
                          <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>Withdrawn by author</span>
                        ) : (
                          <span style={{ color: '#D97706', fontWeight: 600 }}>Awaiting Principal review</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                          {req.status === 'pending' && (
                            <button
                              type="button"
                              className="btn-outline"
                              onClick={() => handleCancelRequest(req.id)}
                              style={{ padding: '4px 8px', fontSize: '12px', color: '#DC2626', borderColor: '#FECACA' }}
                              title="Withdraw pending request"
                            >
                              Withdraw
                            </button>
                          )}
                          {req.status === 'rejected' && (
                            <button
                              type="button"
                              className="btn-outline"
                              onClick={() => handleResubmit(req)}
                              style={{ padding: '4px 8px', fontSize: '12px', color: '#2563EB' }}
                              title="Re-submit petition with adjustments"
                            >
                              Re-submit
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-outline"
                            onClick={() => setSelectedRequest(req)}
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                          >
                            Details &rarr;
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* INSPECTOR PANEL */}
          {selectedRequest && (
            <div
              style={{
                background: 'var(--bg-card, #FFFFFF)',
                border: '1px solid var(--border-color, #E2E8F0)',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color, #E2E8F0)', paddingBottom: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)' }}>
                  Petition #{selectedRequest.id} Details
                </h3>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => setSelectedRequest(null)}
                  style={{ padding: '2px 8px', fontSize: '12px' }}
                >
                  ✕
                </button>
              </div>

              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Category &amp; Status
                </span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <strong style={{ color: 'var(--text-primary, #1F3A5F)', fontSize: '14px' }}>
                    {formatRequestType(selectedRequest.type)}
                  </strong>
                  <span
                    className={`badge-solid ${
                      selectedRequest.status === 'approved'
                        ? 'badge-emerald'
                        : selectedRequest.status === 'pending'
                        ? 'badge-amber'
                        : selectedRequest.status === 'rejected'
                        ? 'badge-rose'
                        : 'badge-slate'
                    }`}
                    style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}
                  >
                    {selectedRequest.status}
                  </span>
                </div>
              </div>

              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Reason Stated
                </span>
                <p
                  style={{
                    margin: '4px 0 0',
                    color: 'var(--text-primary, #334155)',
                    background: 'var(--bg-subtle, #F8FAFC)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    lineHeight: '1.45',
                    border: '1px solid var(--border-color, #E2E8F0)'
                  }}
                >
                  {selectedRequest.reason}
                </p>
              </div>

              {/* PARSED CHANGES / PARAMETERS (new_value_json) */}
              {(() => {
                const parsedNew = parseJsonSafe(selectedRequest.new_value_json);
                if (!parsedNew) return null;
                return (
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                      Proposed Change Parameters
                    </span>
                    <div
                      style={{
                        margin: '4px 0 0',
                        background: 'var(--bg-subtle, #F8FAFC)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        border: '1px solid var(--border-color, #E2E8F0)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      {parsedNew.leaveType && (
                        <div>
                          <span style={{ color: '#64748B' }}>Leave Type:</span> <strong>{parsedNew.leaveType}</strong>
                        </div>
                      )}
                      {parsedNew.startDate && (
                        <div>
                          <span style={{ color: '#64748B' }}>Period:</span>{' '}
                          <strong>
                            {new Date(parsedNew.startDate).toLocaleDateString()} &rarr;{' '}
                            {parsedNew.endDate ? new Date(parsedNew.endDate).toLocaleDateString() : 'Ongoing'}
                          </strong>
                        </div>
                      )}
                      {parsedNew.sectionName && (
                        <div>
                          <span style={{ color: '#64748B' }}>Target Class:</span> <strong>{parsedNew.sectionName}</strong>
                        </div>
                      )}
                      {parsedNew.attendanceDate && (
                        <div>
                          <span style={{ color: '#64748B' }}>Session Date:</span> <strong>{parsedNew.attendanceDate}</strong>
                        </div>
                      )}
                      {parsedNew.assessmentTitle && (
                        <div>
                          <span style={{ color: '#64748B' }}>Assessment:</span> <strong>{parsedNew.assessmentTitle}</strong>
                        </div>
                      )}
                      {parsedNew.adjustmentDetails && (
                        <div>
                          <span style={{ color: '#64748B' }}>Adjustment:</span> <span>{parsedNew.adjustmentDetails}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* DECISION OUTCOME */}
              {selectedRequest.decision_note && (
                <div>
                  <span style={{ color: '#64748B', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                    Administrative Decision Feedback
                  </span>
                  <p
                    style={{
                      margin: '4px 0 0',
                      color: selectedRequest.status === 'approved' ? '#15803D' : '#B91C1C',
                      fontWeight: 600,
                      background: selectedRequest.status === 'approved' ? '#F0FDF4' : '#FEF2F2',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      lineHeight: '1.45',
                      border: `1px solid ${selectedRequest.status === 'approved' ? '#BBF7D0' : '#FECACA'}`
                    }}
                  >
                    "{selectedRequest.decision_note}"
                  </p>
                </div>
              )}

              {/* TIMELINE METADATA */}
              <div style={{ fontSize: '11px', color: '#94A3B8', borderTop: '1px solid var(--border-color, #E2E8F0)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div>Filed: {new Date(selectedRequest.created_at).toLocaleString()}</div>
                {selectedRequest.decided_at && (
                  <div>
                    Decided by <strong>@{selectedRequest.decided_by_username || 'Admin'}</strong> on{' '}
                    {new Date(selectedRequest.decided_at).toLocaleString()}
                  </div>
                )}
              </div>

              {/* ACTIONS */}
              {selectedRequest.status === 'pending' && (
                <button
                  type="button"
                  className="btn-outline"
                  style={{ color: '#DC2626', borderColor: '#FECACA', width: '100%', justifyContent: 'center' }}
                  onClick={() => handleCancelRequest(selectedRequest.id)}
                >
                  Withdraw / Cancel Petition
                </button>
              )}

              {selectedRequest.status === 'rejected' && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => handleResubmit(selectedRequest)}
                >
                  Re-submit with Updates
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUBMIT NEW REQUEST MODAL */}
      {showSubmitModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 130
          }}
        >
          <div
            style={{
              background: 'var(--bg-card, #FFFFFF)',
              borderRadius: '16px',
              padding: '28px',
              maxWidth: '560px',
              width: '95%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid var(--border-color, #E2E8F0)',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)' }}>
                Submit Administrative Change Petition
              </h3>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setShowSubmitModal(false)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Request Type Selector */}
              <div>
                <label className="input-label" htmlFor="newReqType">Request Category</label>
                <select
                  id="newReqType"
                  className="form-select"
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as any)}
                  required
                >
                  <option value="leave_request">Staff Leave Application</option>
                  <option value="attendance_edit_after_lock">Locked Attendance Correction</option>
                  <option value="result_unlock">Assessment Marks Unlock / Correction</option>
                  <option value="timetable_change">Timetable / Schedule Adjustment</option>
                </select>
              </div>

              {/* DYNAMIC FORM: STAFF LEAVE */}
              {requestType === 'leave_request' && (
                <>
                  <div>
                    <label className="input-label" htmlFor="newLeaveType">Leave Classification</label>
                    <select
                      id="newLeaveType"
                      className="form-select"
                      value={leaveType}
                      onChange={(e) => setLeaveType(e.target.value)}
                    >
                      {LEAVE_TYPES.map((lt) => (
                        <option key={lt} value={lt}>
                          {lt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="input-label" htmlFor="leaveStart">Start Date</label>
                      <input
                        id="leaveStart"
                        type="date"
                        className="form-input"
                        value={leaveStartDate}
                        onChange={(e) => setLeaveStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="input-label" htmlFor="leaveEnd">End Date</label>
                      <input
                        id="leaveEnd"
                        type="date"
                        className="form-input"
                        value={leaveEndDate}
                        onChange={(e) => setLeaveEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              {/* DYNAMIC FORM: ATTENDANCE CORRECTION */}
              {requestType === 'attendance_edit_after_lock' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label className="input-label" htmlFor="attSecSelect">Affected Section</label>
                      <select
                        id="attSecSelect"
                        className="form-select"
                        value={attendanceSectionId || ''}
                        onChange={(e) => setAttendanceSectionId(Number(e.target.value))}
                        required
                      >
                        {assignedClasses.map((c) => (
                          <option key={`${c.section_id}-${c.subject_id}`} value={c.section_id}>
                            {c.section_name} ({c.grade_name})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="input-label" htmlFor="attDateSelect">Attendance Date</label>
                      <input
                        id="attDateSelect"
                        type="date"
                        className="form-input"
                        value={attendanceDate}
                        onChange={(e) => setAttendanceDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="input-label" htmlFor="attCorrDetails">Correction Specifics</label>
                    <input
                      id="attCorrDetails"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Student Abebe Kebede marked Absent, arrived with Clinic pass"
                      value={attendanceCorrectionDetails}
                      onChange={(e) => setAttendanceCorrectionDetails(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* DYNAMIC FORM: ASSESSMENT UNLOCK */}
              {requestType === 'result_unlock' && (
                <>
                  <div>
                    <label className="input-label" htmlFor="resSecSelect">Target Class / Section</label>
                    <select
                      id="resSecSelect"
                      className="form-select"
                      value={assessmentClassId || ''}
                      onChange={(e) => setAssessmentClassId(Number(e.target.value))}
                    >
                      {assignedClasses.map((c) => (
                        <option key={`${c.section_id}-${c.subject_id}`} value={c.section_id}>
                          {c.section_name} — {c.subject_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="input-label" htmlFor="resTitleInput">Assessment Name / Exam</label>
                    <input
                      id="resTitleInput"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Midterm Examination / Quiz 2"
                      value={assessmentTitle}
                      onChange={(e) => setAssessmentTitle(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              {/* DYNAMIC FORM: TIMETABLE CHANGE */}
              {requestType === 'timetable_change' && (
                <>
                  <div>
                    <label className="input-label" htmlFor="ttSecSelect">Target Class</label>
                    <select
                      id="ttSecSelect"
                      className="form-select"
                      value={timetableSectionId || ''}
                      onChange={(e) => setTimetableSectionId(Number(e.target.value))}
                    >
                      {assignedClasses.map((c) => (
                        <option key={`${c.section_id}-${c.subject_id}`} value={c.section_id}>
                          {c.section_name} — {c.subject_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="input-label" htmlFor="ttDetails">Proposed Schedule Swap / Room Shift</label>
                    <input
                      id="ttDetails"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Swap Tuesday Period 3 with Physics Lab Period 5"
                      value={timetableDetails}
                      onChange={(e) => setTimetableDetails(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              {/* Reason / Justification */}
              <div>
                <label className="input-label" htmlFor="reqReasonInput">Comprehensive Reason &amp; Justification</label>
                <textarea
                  id="reqReasonInput"
                  className="form-input"
                  rows={4}
                  placeholder="Explain clearly why this administrative decision or override is requested..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowSubmitModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting to Admin...' : 'Submit Petition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
