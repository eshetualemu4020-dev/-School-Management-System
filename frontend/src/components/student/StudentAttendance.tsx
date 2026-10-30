import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { StudentTabs, type TabItem, StudentSpinner, StudentEmptyState, StudentErrorState } from './StudentCommon';

interface AttendanceSummaryData {
  summary: {
    total: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    rate: number;
    thresholdWarning: boolean;
  };
  monthlyBreakdown: Array<{
    month: string;
    monthLabel: string;
    total: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    rate: number;
  }>;
  subjectBreakdown: Array<{
    subjectId: number;
    subjectCode: string;
    subjectName: string;
    total: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    rate: number;
  }>;
  terms?: Array<{
    id: number;
    term_no: number;
    name: string;
    is_current: number;
    start_date: string;
    end_date: string;
  }>;
  selectedTermId?: number | null;
  ministryWarning: boolean;
  ministryMessage: string | null;
  cautionMessage: string | null;
}

interface AttendanceRecordItem {
  id: number;
  status_code: 'present' | 'late' | 'absent' | 'excused';
  status_name: string;
  note?: string;
  counts_as_present: number;
  is_excused: number;
  is_corrected?: boolean | number;
  session_id: number;
  attendance_date: string;
  time_slot_id?: number | null;
  period_label?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  subject_id?: number | null;
  subject_name?: string;
  subject_code?: string;
  marked_by_name: string;
}

export const StudentAttendance: React.FC = () => {
  // Sync initial tab from URL (/student/attendance/history -> 'history', else 'overview')
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>(() => {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/attendance/history') || path.includes('/attendance/records')) return 'history';
    return 'overview';
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Summary State (Tab 4.1)
  const [summaryData, setSummaryData] = useState<AttendanceSummaryData | null>(null);
  const [summaryTermFilter, setSummaryTermFilter] = useState<string>('all');

  // History / Records State (Tab 4.2)
  const [records, setRecords] = useState<AttendanceRecordItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [termFilter, setTermFilter] = useState<string>('all');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [fromDateFilter, setFromDateFilter] = useState<string>('');
  const [toDateFilter, setToDateFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [recordsLoading, setRecordsLoading] = useState(false);

  // Tab change handler with URL sync
  const handleTabChange = (key: string) => {
    const newTab = key as 'overview' | 'history';
    setActiveTab(newTab);
    const target = newTab === 'history' ? '/student/attendance/history' : '/student/attendance/summary';
    if (window.location.pathname !== target) {
      window.history.pushState(null, '', target);
    }
  };

  // Browser back/forward navigation support
  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('/attendance/history') || path.includes('/attendance/records')) {
        setActiveTab('history');
      } else {
        setActiveTab('overview');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadSummary = async (termIdParam?: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getStudentAttendanceSummary(termIdParam);
      if (res) {
        setSummaryData(res);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load attendance summary.');
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async (params?: {
    targetPage?: number;
    status?: string;
    month?: string;
    term?: string;
    subject?: string;
    fromDate?: string;
    toDate?: string;
  }) => {
    setRecordsLoading(true);
    try {
      const p = params?.targetPage ?? page;
      const s = params?.status ?? statusFilter;
      const m = params?.month ?? monthFilter;
      const t = params?.term ?? termFilter;
      const sub = params?.subject ?? subjectFilter;
      const fDate = params?.fromDate ?? fromDateFilter;
      const tDate = params?.toDate ?? toDateFilter;

      const res = await api.getStudentAttendanceRecords({
        status: s !== 'all' ? s : undefined,
        month: m || undefined,
        termId: t !== 'all' && t !== '' ? Number(t) : undefined,
        subjectId: sub !== 'all' && sub !== '' ? Number(sub) : undefined,
        fromDate: fDate || undefined,
        toDate: tDate || undefined,
        page: p,
        limit: 15
      });

      if (res) {
        setRecords(res.records || []);
        setTotalCount(res.totalCount || 0);
        setPage(res.page || 1);
        setTotalPages(res.totalPages || 1);
      }
    } catch (err: any) {
      console.error('Failed to load attendance records:', err);
    } finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    loadSummary(summaryTermFilter !== 'all' ? Number(summaryTermFilter) : undefined);
    loadRecords({ targetPage: 1 });
  }, []);

  const handleSummaryTermChange = (termVal: string) => {
    setSummaryTermFilter(termVal);
    const tId = termVal !== 'all' ? Number(termVal) : undefined;
    loadSummary(tId);
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setPage(1);
    loadRecords({ targetPage: 1, status });
  };

  const handleHistoryTermChange = (term: string) => {
    setTermFilter(term);
    setPage(1);
    loadRecords({ targetPage: 1, term });
  };

  const handleSubjectFilterChange = (subject: string) => {
    setSubjectFilter(subject);
    setPage(1);
    loadRecords({ targetPage: 1, subject });
  };

  const handleMonthFilterChange = (month: string) => {
    setMonthFilter(month);
    setPage(1);
    loadRecords({ targetPage: 1, month });
  };

  const handleDateFilterApply = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadRecords({ targetPage: 1 });
  };

  const handleResetFilters = () => {
    setStatusFilter('all');
    setMonthFilter('');
    setTermFilter('all');
    setSubjectFilter('all');
    setFromDateFilter('');
    setToDateFilter('');
    setPage(1);
    loadRecords({
      targetPage: 1,
      status: 'all',
      month: '',
      term: 'all',
      subject: 'all',
      fromDate: '',
      toDate: ''
    });
  };

  const tabs: TabItem[] = [
    {
      key: 'overview',
      label: 'Summary',
      icon: '📊',
      badge: summaryData?.summary ? `${summaryData.summary.rate}%` : undefined
    },
    {
      key: 'history',
      label: 'Daily History',
      icon: '📜',
      badge: totalCount > 0 ? totalCount : undefined
    }
  ];

  if (loading) {
    return (
      <div className="student-page-container" style={{ padding: '24px' }}>
        <StudentSpinner message="Calculating official attendance rates and loading records..." />
      </div>
    );
  }

  if (error || !summaryData) {
    return (
      <div className="student-page-container" style={{ padding: '24px' }}>
        <StudentErrorState message={error || 'Attendance data unavailable'} onRetry={() => loadSummary()} />
      </div>
    );
  }

  const { summary, monthlyBreakdown, subjectBreakdown, terms, ministryWarning, ministryMessage, cautionMessage } = summaryData;

  return (
    <div className="student-page-container" style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #1E3A8A 100%)',
        color: '#FFFFFF',
        borderRadius: '16px',
        padding: '24px 28px',
        marginBottom: '24px',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '28px' }}>📋</span>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }}>
              Attendance & Roll Call
            </h1>
          </div>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: '14px', maxWidth: '580px', lineHeight: 1.5 }}>
            Official attendance record tracked and audited by certified teachers and registrar office. Late arrivals physically attend class and count toward the attendance rate.
          </p>
        </div>

        {/* Rate Gauge Badge */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '14px',
          padding: '14px 20px',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#93C5FD', fontWeight: 700 }}>
              Official Attendance Rate
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: summary.rate >= 85 ? '#4ADE80' : summary.rate >= 80 ? '#FBBF24' : '#F87171' }}>
              {summary.rate}%
            </div>
          </div>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: summary.rate >= 85 ? 'rgba(74, 222, 128, 0.2)' : summary.rate >= 80 ? 'rgba(251, 191, 36, 0.2)' : 'rgba(248, 113, 113, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px'
          }}>
            {summary.rate >= 85 ? '✅' : summary.rate >= 80 ? '⚠️' : '🚨'}
          </div>
        </div>
      </div>

      {/* Ministry 80% Rule Alert Banners */}
      {ministryWarning && (
        <div style={{
          background: '#FEF2F2',
          border: '2px solid #EF4444',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          color: '#991B1B'
        }}>
          <span style={{ fontSize: '28px' }}>🚨</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '2px' }}>
              Ministry of Education Attendance Warning
            </div>
            <div style={{ fontSize: '13px', lineHeight: 1.5, color: '#B91C1C' }}>
              {ministryMessage}
            </div>
          </div>
        </div>
      )}

      {cautionMessage && !ministryWarning && (
        <div style={{
          background: '#FFFBEB',
          border: '1.5px solid #F59E0B',
          borderRadius: '12px',
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          color: '#92400E'
        }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '14px', marginBottom: '2px' }}>
              Attendance Caution Alert
            </div>
            <div style={{ fontSize: '13px', lineHeight: 1.4, color: '#B45309' }}>
              {cautionMessage}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <StudentTabs tabs={tabs} activeKey={activeTab} onChange={handleTabChange} ariaLabel="Attendance subpage tabs" />

      {/* ===================================================================== */}
      {/* TAB 4.1: OVERVIEW & SUMMARY */}
      {/* ===================================================================== */}
      {activeTab === 'overview' && (
        <div>
          {/* Term Filter Bar for Summary */}
          {terms && terms.length > 0 && (
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '14px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🗓️</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1F2937' }}>Academic Term Scope:</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <select
                  value={summaryTermFilter}
                  onChange={(e) => handleSummaryTermChange(e.target.value)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #CBD5E1',
                    fontSize: '13px',
                    color: '#0F172A',
                    fontWeight: 600,
                    background: '#FFFFFF',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">Full Academic Year (All Terms)</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.is_current ? '(Current Term)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Key Metric KPI Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '28px'
          }}>
            {/* Total Sessions */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '18px 20px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}>
              <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Total Sessions</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                {summary.total}
              </div>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
                Conducted class sessions
              </div>
            </div>

            {/* Present Sessions */}
            <div style={{
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '14px',
              padding: '18px 20px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}>
              <div style={{ fontSize: '13px', color: '#166534', fontWeight: 600 }}>Present</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>
                {summary.present}
              </div>
              <div style={{ fontSize: '12px', color: '#166534', marginTop: '4px' }}>
                On-time full attendance
              </div>
            </div>

            {/* Late Sessions */}
            <div style={{
              background: '#FEFCE8',
              border: '1px solid #FEF08A',
              borderRadius: '14px',
              padding: '18px 20px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}>
              <div style={{ fontSize: '13px', color: '#854D0E', fontWeight: 600 }}>Late Arrivals</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#A16207', marginTop: '4px' }}>
                {summary.late}
              </div>
              <div style={{ fontSize: '12px', color: '#854D0E', marginTop: '4px' }}>
                Counts as present in class
              </div>
            </div>

            {/* Unexcused Absences */}
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '14px',
              padding: '18px 20px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}>
              <div style={{ fontSize: '13px', color: '#991B1B', fontWeight: 600 }}>Unexcused Absent</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>
                {summary.absent}
              </div>
              <div style={{ fontSize: '12px', color: '#991B1B', marginTop: '4px' }}>
                Deducted from rate
              </div>
            </div>

            {/* Excused Absences */}
            <div style={{
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              borderRadius: '14px',
              padding: '18px 20px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}>
              <div style={{ fontSize: '13px', color: '#1E40AF', fontWeight: 600 }}>Excused</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
                {summary.excused}
              </div>
              <div style={{ fontSize: '12px', color: '#1E40AF', marginTop: '4px' }}>
                Authorized leave/medical
              </div>
            </div>
          </div>

          {/* Monthly Breakdown Table */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '24px',
            marginBottom: '28px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
              Monthly Attendance Trends
            </h3>
            {monthlyBreakdown.length === 0 ? (
              <p style={{ color: '#94A3B8', fontSize: '14px', margin: 0 }}>No monthly attendance history recorded yet for this term.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #E2E8F0', color: '#64748B', fontSize: '12px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '12px 16px' }}>Month</th>
                      <th style={{ padding: '12px 16px' }}>Sessions</th>
                      <th style={{ padding: '12px 16px' }}>Present</th>
                      <th style={{ padding: '12px 16px' }}>Late</th>
                      <th style={{ padding: '12px 16px' }}>Absent</th>
                      <th style={{ padding: '12px 16px' }}>Excused</th>
                      <th style={{ padding: '12px 16px' }}>Attendance Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyBreakdown.map((m) => (
                      <tr key={m.month} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0F172A' }}>{m.monthLabel}</td>
                        <td style={{ padding: '14px 16px', color: '#334155' }}>{m.total}</td>
                        <td style={{ padding: '14px 16px', color: '#15803D', fontWeight: 600 }}>{m.present}</td>
                        <td style={{ padding: '14px 16px', color: '#B45309', fontWeight: 600 }}>{m.late}</td>
                        <td style={{ padding: '14px 16px', color: '#B91C1C', fontWeight: 600 }}>{m.absent}</td>
                        <td style={{ padding: '14px 16px', color: '#1D4ED8', fontWeight: 600 }}>{m.excused}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontWeight: 800,
                              color: m.rate >= 85 ? '#15803D' : m.rate >= 80 ? '#B45309' : '#B91C1C'
                            }}>
                              {m.rate}%
                            </span>
                            <div style={{ width: '80px', height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{
                                width: `${Math.min(100, m.rate)}%`,
                                height: '100%',
                                background: m.rate >= 85 ? '#10B981' : m.rate >= 80 ? '#F59E0B' : '#EF4444'
                              }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Subject Breakdown */}
          {subjectBreakdown.length > 0 && (
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '24px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
                Subject & Homeroom Attendance
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {subjectBreakdown.map((s) => (
                  <div
                    key={s.subjectId}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      background: '#F8FAFC'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 800, fontSize: '15px', color: '#0F172A' }}>{s.subjectName}</span>
                      <span style={{
                        fontWeight: 800,
                        fontSize: '14px',
                        color: s.rate >= 85 ? '#15803D' : s.rate >= 80 ? '#B45309' : '#B91C1C'
                      }}>
                        {s.rate}%
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#64748B', display: 'flex', gap: '12px', marginTop: '6px' }}>
                      <span>Total: {s.total}</span>
                      <span style={{ color: '#15803D' }}>Present: {s.present}</span>
                      <span style={{ color: '#B45309' }}>Late: {s.late}</span>
                      <span style={{ color: '#B91C1C' }}>Absent: {s.absent}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4.2: ATTENDANCE RECORDS & HISTORY */}
      {/* ===================================================================== */}
      {activeTab === 'history' && (
        <div>
          {/* Comprehensive Filter Bar */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '20px',
            marginBottom: '20px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* Status Pills */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: 'All Records' },
                  { key: 'present', label: 'Present' },
                  { key: 'late', label: 'Late' },
                  { key: 'absent', label: 'Absent' },
                  { key: 'excused', label: 'Excused' }
                ].map((f) => {
                  const isSelected = statusFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => handleStatusFilterChange(f.key)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        border: isSelected ? '2px solid #1F3A5F' : '1px solid #E2E8F0',
                        background: isSelected ? '#1F3A5F' : '#FFFFFF',
                        color: isSelected ? '#FFFFFF' : '#475569',
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {(statusFilter !== 'all' || monthFilter || termFilter !== 'all' || subjectFilter !== 'all' || fromDateFilter || toDateFilter) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  style={{
                    background: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    color: '#475569',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  ✕ Reset Filters
                </button>
              )}
            </div>

            {/* Dropdown & Date Filters */}
            <form onSubmit={handleDateFilterApply} style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              alignItems: 'end'
            }}>
              {/* Term Filter */}
              {terms && terms.length > 0 && (
                <div>
                  <label htmlFor="historyTermFilter" style={{ display: 'block', fontSize: '12px', color: '#64748B', fontWeight: 600, marginBottom: '4px' }}>
                    Term:
                  </label>
                  <select
                    id="historyTermFilter"
                    value={termFilter}
                    onChange={(e) => handleHistoryTermChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#1E293B',
                      background: '#FFFFFF'
                    }}
                  >
                    <option value="all">All Terms</option>
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Subject Filter */}
              {subjectBreakdown.length > 0 && (
                <div>
                  <label htmlFor="historySubjectFilter" style={{ display: 'block', fontSize: '12px', color: '#64748B', fontWeight: 600, marginBottom: '4px' }}>
                    Subject / Class:
                  </label>
                  <select
                    id="historySubjectFilter"
                    value={subjectFilter}
                    onChange={(e) => handleSubjectFilterChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#1E293B',
                      background: '#FFFFFF'
                    }}
                  >
                    <option value="all">All Classes & Homerooms</option>
                    {subjectBreakdown.map((s) => (
                      <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Month Filter */}
              {monthlyBreakdown.length > 0 && (
                <div>
                  <label htmlFor="historyMonthFilter" style={{ display: 'block', fontSize: '12px', color: '#64748B', fontWeight: 600, marginBottom: '4px' }}>
                    Month:
                  </label>
                  <select
                    id="historyMonthFilter"
                    value={monthFilter}
                    onChange={(e) => handleMonthFilterChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      color: '#1E293B',
                      background: '#FFFFFF'
                    }}
                  >
                    <option value="">All Recorded Months</option>
                    {monthlyBreakdown.map((m) => (
                      <option key={m.month} value={m.month}>{m.monthLabel}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* From Date */}
              <div>
                <label htmlFor="fromDateInput" style={{ display: 'block', fontSize: '12px', color: '#64748B', fontWeight: 600, marginBottom: '4px' }}>
                  From Date:
                </label>
                <input
                  id="fromDateInput"
                  type="date"
                  value={fromDateFilter}
                  onChange={(e) => setFromDateFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    color: '#1E293B',
                    background: '#FFFFFF'
                  }}
                />
              </div>

              {/* To Date */}
              <div>
                <label htmlFor="toDateInput" style={{ display: 'block', fontSize: '12px', color: '#64748B', fontWeight: 600, marginBottom: '4px' }}>
                  To Date:
                </label>
                <input
                  id="toDateInput"
                  type="date"
                  value={toDateFilter}
                  onChange={(e) => setToDateFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    color: '#1E293B',
                    background: '#FFFFFF'
                  }}
                />
              </div>

              {/* Apply Date Filter Button */}
              <div>
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#1F3A5F',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Apply Dates
                </button>
              </div>
            </form>
          </div>

          {/* Records List */}
          {recordsLoading ? (
            <StudentSpinner message="Filtering attendance roll call records..." />
          ) : records.length === 0 ? (
            <StudentEmptyState
              icon="📋"
              title="No Attendance Records Found"
              description="No roll call records matched the selected filters. Please adjust status, month, or date range."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {records.map((rec) => {
                const dateObj = new Date(rec.attendance_date);
                let badgeBg = '#DCFCE7';
                let badgeColor = '#15803D';
                let badgeLabel = 'Present';

                if (rec.status_code === 'late') {
                  badgeBg = '#FEF3C7';
                  badgeColor = '#B45309';
                  badgeLabel = 'Late Arrival';
                } else if (rec.status_code === 'absent') {
                  badgeBg = '#FEE2E2';
                  badgeColor = '#B91C1C';
                  badgeLabel = 'Absent';
                } else if (rec.status_code === 'excused') {
                  badgeBg = '#DBEAFE';
                  badgeColor = '#1D4ED8';
                  badgeLabel = 'Excused Leave';
                }

                // Determine session/period text
                const sessionLabel = rec.period_label
                  ? `${rec.period_label} ${rec.period_start ? `(${rec.period_start.substring(0, 5)} - ${rec.period_end?.substring(0, 5)})` : ''}`
                  : (rec.subject_name ? 'Subject Class Roll Call' : 'Daily Homeroom Roll Call');

                return (
                  <div
                    key={rec.id}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}
                  >
                    {/* Date and Subject */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '10px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                          {dateObj.toLocaleDateString('en-US', { month: 'short' })}
                        </span>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                          {dateObj.getDate()}
                        </span>
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                            {rec.subject_name || 'Daily Homeroom Roll Call'}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            background: '#F1F5F9',
                            color: '#475569',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontWeight: 600
                          }}>
                            {sessionLabel}
                          </span>
                        </div>

                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                          {dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>

                        {rec.note && (
                          <div style={{
                            marginTop: '6px',
                            fontSize: '13px',
                            color: '#475569',
                            background: '#F8FAFC',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            borderLeft: `3px solid ${badgeColor}`
                          }}>
                            💬 <em>"{rec.note}"</em>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Badge, Correction Badge & Marker */}
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {Boolean(rec.is_corrected) && (
                          <span
                            title="Official correction authorized and audited in academic records"
                            style={{
                              background: '#FEF3C7',
                              color: '#92400E',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700
                            }}
                          >
                            ✏️ Corrected
                          </span>
                        )}

                        {Boolean(rec.is_excused) && (
                          <span
                            title="Authorized absence by school administration"
                            style={{
                              background: '#DBEAFE',
                              color: '#1E40AF',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700
                            }}
                          >
                            🛡️ Excused
                          </span>
                        )}

                        <span style={{
                          background: badgeBg,
                          color: badgeColor,
                          padding: '4px 12px',
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px'
                        }}>
                          {badgeLabel}
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                        Recorded by: <strong>{rec.marked_by_name}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Server-Side Pagination */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '16px'
                }}>
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => {
                      const prev = page - 1;
                      setPage(prev);
                      loadRecords({ targetPage: prev });
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      background: page <= 1 ? '#F1F5F9' : '#FFFFFF',
                      color: page <= 1 ? '#94A3B8' : '#1E293B',
                      cursor: page <= 1 ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '13px'
                    }}
                  >
                    Previous
                  </button>

                  <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                    Page {page} of {totalPages} ({totalCount} total records)
                  </span>

                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => {
                      const next = page + 1;
                      setPage(next);
                      loadRecords({ targetPage: next });
                    }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      background: page >= totalPages ? '#F1F5F9' : '#FFFFFF',
                      color: page >= totalPages ? '#94A3B8' : '#1E293B',
                      cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '13px'
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
