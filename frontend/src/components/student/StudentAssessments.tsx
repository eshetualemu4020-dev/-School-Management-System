import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { StudentTabs, StudentSpinner, StudentEmptyState, StudentErrorState, type TabItem } from './StudentCommon';

interface AssignmentItem {
  id: number;
  title: string;
  instructions?: string;
  due_at: string;
  allow_late: boolean;
  max_score: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  teacher_name: string;
  type?: string;
  type_name?: string;
  is_overdue: boolean;
  days_remaining: number;
  submission_id?: number;
  submitted_at?: string;
  submission_status?: string;
  obtained_score?: number | null;
  feedback?: string;
  document_id?: number | null;
  file_name?: string | null;
  status: 'pending' | 'submitted' | 'graded' | 'overdue';
}

interface SubmissionItem {
  id: number;
  assignment_id: number;
  assignment_title: string;
  assignment_instructions?: string;
  max_score: number;
  due_at: string;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  teacher_name: string;
  submitted_at: string;
  is_late: boolean;
  submission_status: string;
  content_text?: string;
  document_id?: number | null;
  file_name?: string | null;
  file_size?: number | null;
  obtained_score?: number | null;
  percentage?: number | null;
  feedback?: string;
  graded_at?: string;
}

interface PastAssessmentItem {
  id: number;
  title: string;
  type_code: string;
  type_name: string;
  due_at: string;
  assessment_date?: string;
  max_score: number;
  weight?: number | null;
  term_id?: number;
  term_name?: string;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  teacher_name: string;
  submission_id?: number;
  submitted_at?: string;
  is_submitted: boolean;
  obtained_score?: number | null;
  percentage?: number | null;
  feedback?: string;
  is_published: boolean;
}

interface AssessmentDetailData {
  id: number;
  title: string;
  instructions: string;
  due_at: string;
  allow_late: boolean;
  max_score: number;
  assignment_status: string;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  subject_name_am?: string;
  teacher_name: string;
  teacher_email?: string;
  term_name?: string;
  submission_id?: number;
  submitted_at?: string;
  is_late?: boolean;
  submission_status?: string;
  content_text?: string;
  document_id?: number | null;
  submission_file_name?: string | null;
  submission_file_size?: number | null;
  score?: number | null;
  obtained_score?: number | null;
  feedback?: string;
  graded_at?: string;
  attachments: Array<{
    id: number;
    title: string;
    description?: string;
    url?: string;
    document_id?: number;
    original_name?: string;
    mime_type?: string;
    size_bytes?: number;
  }>;
  is_overdue: boolean;
  can_submit: boolean;
}

interface StudentAssessmentsProps {
  scopeA?: boolean;
}

export const StudentAssessments: React.FC<StudentAssessmentsProps> = ({ scopeA = true }) => {
  // Sync initial tab from URL
  const [activeTab, setActiveTab] = useState<'upcoming' | 'submitted' | 'past' | 'detail'>(() => {
    const path = window.location.pathname.toLowerCase();
    if (scopeA && (path.includes('/assessments/submitted') || path.includes('/submissions'))) return 'submitted';
    if (path.includes('/assessments/past')) return 'past';
    if (path.includes('/assessments/detail')) return 'detail';
    return 'upcoming';
  });

  // Selected assessment ID for detail view
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<number | null>(null);

  // Data states
  const [upcomingAssignments, setUpcomingAssignments] = useState<AssignmentItem[]>([]);
  const [upcomingSummary, setUpcomingSummary] = useState<{ total: number; pending: number; submitted: number; overdue: number }>({
    total: 0,
    pending: 0,
    submitted: 0,
    overdue: 0
  });
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([]);
  const [pastAssessments, setPastAssessments] = useState<PastAssessmentItem[]>([]);
  const [academicTerms, setAcademicTerms] = useState<any[]>([]);

  // Assessment detail state
  const [detailData, setDetailData] = useState<AssessmentDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Global loading & error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab 5.1 Filters
  const [upcomingSubjectFilter, setUpcomingSubjectFilter] = useState<string>('all');
  const [upcomingTypeFilter, setUpcomingTypeFilter] = useState<string>('all');
  const [upcomingStatusFilter, setUpcomingStatusFilter] = useState<'all' | 'pending' | 'submitted' | 'overdue'>('all');

  // Tab 5.2 Filters
  const [submittedSubjectFilter, setSubmittedSubjectFilter] = useState<string>('all');
  const [submittedStatusFilter, setSubmittedStatusFilter] = useState<string>('all');

  // Tab 5.3 Filters
  const [pastTermFilter, setPastTermFilter] = useState<string>('all');
  const [pastSubjectFilter, setPastSubjectFilter] = useState<string>('all');

  // Submission workspace state (inside Tab 5.4)
  const [submissionText, setSubmissionText] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    mimeType: string;
    base64: string;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [downloadingSubmissionId, setDownloadingSubmissionId] = useState<number | null>(null);

  const formatFileSize = (bytes?: number | null): string => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDownloadSubmissionFile = async (submissionId: number, fileName?: string | null) => {
    try {
      setDownloadingSubmissionId(submissionId);
      await api.downloadStudentSubmissionFile(submissionId, fileName || 'submitted_file');
    } catch (err: any) {
      alert(`Download Error: ${err.message || 'Unable to download file'}`);
    } finally {
      setDownloadingSubmissionId(null);
    }
  };

  // URL route sync helper
  const handleTabChange = (key: string) => {
    const newTab = key as 'upcoming' | 'submitted' | 'past' | 'detail';
    setActiveTab(newTab);
    const target = `/student/assessments/${newTab}`;
    if (window.location.pathname !== target) {
      window.history.pushState(null, '', target);
    }
  };

  // Browser back/forward navigation support
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname.toLowerCase();
      if (path.includes('/assessments/submitted') || path.includes('/submissions')) {
        setActiveTab('submitted');
      } else if (path.includes('/assessments/past')) {
        setActiveTab('past');
      } else if (path.includes('/assessments/detail')) {
        setActiveTab('detail');
      } else {
        setActiveTab('upcoming');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [upcomingRes, submittedRes, pastRes] = await Promise.all([
        api.getStudentUpcomingAssignments(),
        api.getStudentSubmittedAssignments(),
        api.getStudentPastAssessments()
      ]);

      setUpcomingAssignments(upcomingRes?.assignments || []);
      setUpcomingSummary(upcomingRes?.summary || { total: 0, pending: 0, submitted: 0, overdue: 0 });
      setSubmissions(submittedRes?.submissions || []);
      setPastAssessments(pastRes?.assessments || []);
      setAcademicTerms(pastRes?.terms || []);

      // If no detail selected yet, pre-select first upcoming assignment
      if (!selectedAssessmentId && upcomingRes?.assignments?.length) {
        setSelectedAssessmentId(upcomingRes.assignments[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load assessment data:', err);
      setError(err?.message || 'Failed to load assignments and assessment records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch assessment detail when selectedAssessmentId changes
  const loadAssessmentDetail = async (id: number) => {
    setLoadingDetail(true);
    setDetailError(null);
    setSubmitSuccess(null);
    setSubmitError(null);
    try {
      const data = await api.getStudentAssessmentDetail(id);
      setDetailData(data);
      setSubmissionText(data.content_text || '');
    } catch (err: any) {
      console.error('Failed to load assessment detail:', err);
      setDetailError(err?.message || 'Failed to retrieve assessment details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (selectedAssessmentId) {
      loadAssessmentDetail(selectedAssessmentId);
    }
  }, [selectedAssessmentId]);

  const handleOpenDetail = (id: number) => {
    setSelectedAssessmentId(id);
    handleTabChange('detail');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setFileError('File size exceeds the maximum limit of 15 MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string) || '';
      setSelectedFile({
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        base64
      });
    };
    reader.onerror = () => {
      setFileError('Failed to read file from disk.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssessmentId) return;
    const trimmed = submissionText.trim();
    if (!trimmed && !selectedFile) {
      setSubmitError('Please enter coursework response text or choose a solution attachment.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const payload: any = {};
      if (trimmed) payload.contentText = trimmed;
      if (selectedFile) {
        payload.file = {
          originalName: selectedFile.name,
          mimeType: selectedFile.mimeType,
          dataBase64: selectedFile.base64
        };
      }

      const res = await api.submitStudentAssignment(selectedAssessmentId, payload);
      setSubmitSuccess(res?.message || 'Assignment submitted successfully!');
      setSelectedFile(null);
      const fileInput = document.getElementById('submissionFileInput') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      // Reload detail and lists to reflect updated status
      await loadAssessmentDetail(selectedAssessmentId);
      loadData();
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to submit assignment. Please check deadlines and retry.');
    } finally {
      setSubmitting(false);
    }
  };

  // Distinct subjects list for dropdown filters
  const subjectsList = useMemo(() => {
    const map = new Map<number, string>();
    upcomingAssignments.forEach((a) => map.set(a.subject_id, a.subject_name));
    submissions.forEach((s) => map.set(s.subject_id, s.subject_name));
    pastAssessments.forEach((p) => map.set(p.subject_id, p.subject_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [upcomingAssignments, submissions, pastAssessments]);

  // Filtered upcoming assignments (Subject, Type, and Status filters)
  const filteredUpcoming = useMemo(() => {
    return upcomingAssignments.filter((a) => {
      if (upcomingSubjectFilter !== 'all' && a.subject_id !== Number(upcomingSubjectFilter)) return false;
      if (upcomingStatusFilter !== 'all' && a.status !== upcomingStatusFilter) return false;
      if (upcomingTypeFilter !== 'all' && a.type !== upcomingTypeFilter) return false;
      return true;
    });
  }, [upcomingAssignments, upcomingSubjectFilter, upcomingStatusFilter, upcomingTypeFilter]);

  // Filtered submitted assignments
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((s) => {
      if (submittedSubjectFilter !== 'all' && s.subject_id !== Number(submittedSubjectFilter)) return false;
      if (submittedStatusFilter !== 'all' && s.submission_status !== submittedStatusFilter) return false;
      return true;
    });
  }, [submissions, submittedSubjectFilter, submittedStatusFilter]);

  // Filtered past assessments
  const filteredPast = useMemo(() => {
    return pastAssessments.filter((p) => {
      if (pastSubjectFilter !== 'all' && p.subject_id !== Number(pastSubjectFilter)) return false;
      if (pastTermFilter !== 'all' && p.term_id !== Number(pastTermFilter)) return false;
      return true;
    });
  }, [pastAssessments, pastSubjectFilter, pastTermFilter]);

  const tabs: TabItem[] = useMemo(() => {
    const list: TabItem[] = [
      {
        key: 'upcoming',
        label: 'Upcoming',
        badge: upcomingSummary.pending > 0 ? upcomingSummary.pending : undefined,
        icon: <span>📝</span>
      }
    ];

    if (scopeA) {
      list.push({
        key: 'submitted',
        label: 'Submitted & Graded',
        badge: submissions.length > 0 ? submissions.length : undefined,
        icon: <span>📤</span>
      });
    }

    list.push({
      key: 'past',
      label: 'Past Assessments',
      badge: pastAssessments.length > 0 ? pastAssessments.length : undefined,
      icon: <span>📚</span>
    });

    list.push({
      key: 'detail',
      label: scopeA ? 'Assessment Detail & Submit' : 'Assessment Detail & Rubric',
      icon: <span>✍️</span>
    });

    return list;
  }, [upcomingSummary.pending, submissions.length, pastAssessments.length, scopeA]);

  if (loading) {
    return (
      <div className="student-page-container" style={{ padding: '24px' }}>
        <StudentSpinner message="Loading published assignments, deadlines, and assessment records..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="student-page-container" style={{ padding: '24px' }}>
        <StudentErrorState message={error} onRetry={loadData} />
      </div>
    );
  }

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
            <span style={{ fontSize: '28px' }}>✍️</span>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }}>
              Assignments & Assessments
            </h1>
          </div>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: '14px', maxWidth: '580px', lineHeight: 1.5 }}>
            View published homework, online tasks, and continuous assessments. Track deadlines and submit your coursework securely.
          </p>
        </div>

        {/* Quick KPI Badge */}
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
              Action Needed
            </div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: upcomingSummary.pending > 0 ? '#FBBF24' : '#4ADE80' }}>
              {upcomingSummary.pending} Due
            </div>
          </div>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '50%',
            background: upcomingSummary.pending > 0 ? 'rgba(251, 191, 36, 0.2)' : 'rgba(74, 222, 128, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px'
          }}>
            {upcomingSummary.pending > 0 ? '⏳' : '✨'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <StudentTabs tabs={tabs} activeKey={activeTab} onChange={handleTabChange} ariaLabel="Assessment subpage tabs" />

      {/* ===================================================================== */}
      {/* TAB 5.1: UPCOMING */}
      {/* ===================================================================== */}
      {activeTab === 'upcoming' && (
        <div>
          {/* Summary KPI Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px 20px' }}>
              <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Total Active</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{upcomingSummary.total}</div>
            </div>
            <div style={{ background: '#FFFBEB', border: '1px solid #FEF08A', borderRadius: '14px', padding: '16px 20px' }}>
              <div style={{ fontSize: '12px', color: '#92400E', fontWeight: 600 }}>Pending Submission</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>{upcomingSummary.pending}</div>
            </div>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '14px', padding: '16px 20px' }}>
              <div style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>Submitted</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>{upcomingSummary.submitted}</div>
            </div>
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '14px', padding: '16px 20px' }}>
              <div style={{ fontSize: '12px', color: '#991B1B', fontWeight: 600 }}>Overdue</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>{upcomingSummary.overdue}</div>
            </div>
          </div>

          {/* Filters Bar */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            {/* Status Filter Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'All Upcoming' },
                { key: 'pending', label: 'Pending' },
                { key: 'submitted', label: 'Submitted' },
                { key: 'overdue', label: 'Overdue' }
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setUpcomingStatusFilter(f.key as any)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: upcomingStatusFilter === f.key ? '2px solid #1F3A5F' : '1px solid #E2E8F0',
                    background: upcomingStatusFilter === f.key ? '#1F3A5F' : '#FFFFFF',
                    color: upcomingStatusFilter === f.key ? '#FFFFFF' : '#475569',
                    fontSize: '13px',
                    fontWeight: upcomingStatusFilter === f.key ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              {/* Type Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="upcomingTypeSelect" style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Type:</label>
                <select
                  id="upcomingTypeSelect"
                  value={upcomingTypeFilter}
                  onChange={(e) => setUpcomingTypeFilter(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1E293B',
                    background: '#FFFFFF'
                  }}
                >
                  <option value="all">All Types</option>
                  <option value="assignment">Homework & Assignments</option>
                  <option value="quiz">Quizzes</option>
                  <option value="test">Tests & Exams</option>
                  <option value="project">Projects & Practicals</option>
                </select>
              </div>

              {/* Subject Dropdown */}
              {subjectsList.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label htmlFor="upcomingSubjectSelect" style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Subject:</label>
                  <select
                    id="upcomingSubjectSelect"
                    value={upcomingSubjectFilter}
                    onChange={(e) => setUpcomingSubjectFilter(e.target.value)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: '#1E293B',
                      background: '#FFFFFF'
                    }}
                  >
                    <option value="all">All Subjects</option>
                    {subjectsList.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* List of Upcoming Assessments */}
          {filteredUpcoming.length === 0 ? (
            <StudentEmptyState
              icon="🎉"
              title="No Upcoming Assignments"
              description="You have no pending assignments matching the selected filters. Great job staying up to date!"
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {filteredUpcoming.map((item) => {
                const dueDate = new Date(item.due_at);
                const isOverdue = item.is_overdue;

                return (
                  <div
                    key={item.id}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '14px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div>
                      {/* Top Badges */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          background: '#EFF6FF',
                          color: '#1E40AF',
                          padding: '3px 8px',
                          borderRadius: '6px'
                        }}>
                          {item.subject_name}
                        </span>

                        <span style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '999px',
                          textTransform: 'uppercase',
                          background: item.status === 'graded' ? '#DCFCE7' : item.status === 'submitted' ? '#E0F2FE' : isOverdue ? '#FEE2E2' : '#FEF3C7',
                          color: item.status === 'graded' ? '#166534' : item.status === 'submitted' ? '#0369A1' : isOverdue ? '#991B1B' : '#92400E'
                        }}>
                          {item.status}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                        {item.title}
                      </h3>

                      {/* Instructions snippet */}
                      {item.instructions && (
                        <p style={{
                          margin: '0 0 14px',
                          fontSize: '13px',
                          color: '#64748B',
                          lineHeight: 1.4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {item.instructions}
                        </p>
                      )}

                      {/* Details Grid */}
                      <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                        <div>👨‍🏫 Teacher: <strong>{item.teacher_name}</strong></div>
                        <div>🎯 Max Score: <strong>{item.max_score} pts</strong></div>
                        <div style={{ color: isOverdue ? '#DC2626' : '#2563EB', fontWeight: 600 }}>
                          ⏰ Due: {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ({item.days_remaining > 0 ? `${item.days_remaining}d left` : isOverdue ? `${Math.abs(item.days_remaining)}d overdue` : 'Due today'})
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(item.id)}
                      style={{
                        width: '100%',
                        padding: '9px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#1F3A5F',
                        color: '#FFFFFF',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      {item.submission_id ? 'View My Submission & Feedback' : 'Open Details & Submit Work →'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5.2: SUBMITTED & GRADED */}
      {/* ===================================================================== */}
      {activeTab === 'submitted' && (
        <div>
          {/* Filters Bar */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            {/* Status Filter */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: 'All Submissions' },
                { key: 'graded', label: 'Graded' },
                { key: 'submitted', label: 'Under Review' }
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setSubmittedStatusFilter(f.key)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: submittedStatusFilter === f.key ? '2px solid #1F3A5F' : '1px solid #E2E8F0',
                    background: submittedStatusFilter === f.key ? '#1F3A5F' : '#FFFFFF',
                    color: submittedStatusFilter === f.key ? '#FFFFFF' : '#475569',
                    fontSize: '13px',
                    fontWeight: submittedStatusFilter === f.key ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Subject Filter */}
            {subjectsList.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="submittedSubjectSelect" style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Subject:</label>
                <select
                  id="submittedSubjectSelect"
                  value={submittedSubjectFilter}
                  onChange={(e) => setSubmittedSubjectFilter(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1E293B',
                    background: '#FFFFFF'
                  }}
                >
                  <option value="all">All Subjects</option>
                  {subjectsList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* List of Submissions */}
          {filteredSubmissions.length === 0 ? (
            <StudentEmptyState
              icon="📤"
              title="No Submissions Found"
              description="No coursework submissions matched the selected filters."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredSubmissions.map((sub) => {
                const subDate = new Date(sub.submitted_at);
                const hasScore = sub.obtained_score !== null && sub.obtained_score !== undefined;

                return (
                  <div
                    key={sub.id}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '14px',
                      padding: '20px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, background: '#EFF6FF', color: '#1E40AF', padding: '2px 8px', borderRadius: '6px' }}>
                            {sub.subject_name}
                          </span>
                          {sub.is_late && (
                            <span style={{ fontSize: '11px', fontWeight: 700, background: '#FEE2E2', color: '#991B1B', padding: '2px 6px', borderRadius: '4px' }}>
                              Late Submission
                            </span>
                          )}
                          <span style={{ fontSize: '12px', color: '#64748B' }}>
                            Submitted: {subDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <h3 style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
                          {sub.assignment_title}
                        </h3>

                        <div style={{ fontSize: '13px', color: '#64748B' }}>
                          Teacher: <strong>{sub.teacher_name}</strong> &bull; Max Mark: {sub.max_score} pts
                        </div>
                      </div>

                      {/* Score or Status Badge */}
                      <div style={{ textAlign: 'right' }}>
                        {hasScore ? (
                          <div style={{
                            background: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                            borderRadius: '10px',
                            padding: '8px 16px',
                            display: 'inline-block'
                          }}>
                            <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                              Graded Score
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 900, color: '#15803D' }}>
                              {sub.obtained_score} / {sub.max_score} ({sub.percentage}%)
                            </div>
                          </div>
                        ) : (
                          <span style={{
                            background: '#FEF3C7',
                            color: '#92400E',
                            padding: '6px 14px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: 800
                          }}>
                            Awaiting Teacher Review
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Feedback block */}
                    {sub.feedback && (
                      <div style={{
                        marginTop: '14px',
                        background: '#F8FAFC',
                        borderLeft: '4px solid #3B82F6',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        fontSize: '13px',
                        color: '#334155'
                      }}>
                        <strong>Teacher Feedback:</strong> <em>"{sub.feedback}"</em>
                      </div>
                    )}

                    {/* Attached solution file download action badge */}
                    {(sub.document_id || sub.file_name) ? (
                      <div style={{
                        marginTop: '14px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '220px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            background: '#EFF6FF',
                            color: '#1D4ED8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            flexShrink: 0
                          }}>
                            📄
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E293B', wordBreak: 'break-all' }}>
                              {sub.file_name || 'My Submitted File'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                              Submitted Attachment &bull; {formatFileSize(sub.file_size)}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDownloadSubmissionFile(sub.id, sub.file_name)}
                          disabled={downloadingSubmissionId === sub.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: downloadingSubmissionId === sub.id ? '#94A3B8' : '#1F3A5F',
                            color: '#FFFFFF',
                            border: 'none',
                            padding: '7px 16px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: downloadingSubmissionId === sub.id ? 'not-allowed' : 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {downloadingSubmissionId === sub.id ? (
                            <>⏳ Downloading...</>
                          ) : (
                            <>
                              <span>📥</span>
                              <span>Download Submitted File</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : sub.content_text ? (
                      <div style={{
                        marginTop: '12px',
                        padding: '10px 14px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#64748B'
                      }}>
                        📝 <strong>Written Response:</strong> "{sub.content_text.length > 120 ? sub.content_text.slice(0, 120) + '...' : sub.content_text}"
                      </div>
                    ) : null}

                    {/* Action link */}
                    <div style={{ marginTop: '14px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(sub.assignment_id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#1F3A5F',
                          fontWeight: 700,
                          fontSize: '13px',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        Open Full Assessment Detail & Answers &rarr;
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5.3: PAST ASSESSMENTS */}
      {/* ===================================================================== */}
      {activeTab === 'past' && (
        <div>
          {/* Filters Bar */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            {/* Term Filter */}
            {academicTerms.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="pastTermSelect" style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Term:</label>
                <select
                  id="pastTermSelect"
                  value={pastTermFilter}
                  onChange={(e) => setPastTermFilter(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1E293B',
                    background: '#FFFFFF'
                  }}
                >
                  <option value="all">All Academic Terms</option>
                  {academicTerms.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Subject Filter */}
            {subjectsList.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label htmlFor="pastSubjectSelect" style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Subject:</label>
                <select
                  id="pastSubjectSelect"
                  value={pastSubjectFilter}
                  onChange={(e) => setPastSubjectFilter(e.target.value)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#1E293B',
                    background: '#FFFFFF'
                  }}
                >
                  <option value="all">All Subjects</option>
                  {subjectsList.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* List of Past Assessments */}
          {filteredPast.length === 0 ? (
            <StudentEmptyState
              icon="📚"
              title="No Past Assessments Recorded"
              description="No closed or completed assessments matched the selected term and subject filters."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {filteredPast.map((item) => {
                const dateStr = item.due_at || item.assessment_date;
                const d = dateStr ? new Date(dateStr) : null;
                const hasScore = item.obtained_score !== null && item.obtained_score !== undefined;

                return (
                  <div
                    key={`${item.type_code}-${item.id}`}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '14px',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div>
                      {/* Top Badges */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, background: '#EFF6FF', color: '#1E40AF', padding: '3px 8px', borderRadius: '6px' }}>
                          {item.subject_name}
                        </span>

                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#F1F5F9',
                          color: '#475569'
                        }}>
                          {item.type_name}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                        {item.title}
                      </h3>

                      {/* Metadata */}
                      <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                        <div>👨‍🏫 Teacher: <strong>{item.teacher_name}</strong></div>
                        <div>🎯 Max Score: <strong>{item.max_score} pts</strong> {item.weight ? `(Weight: ${item.weight}%)` : ''}</div>
                        {d && (
                          <div>📅 Date: {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        )}
                        <div>
                          Status: {item.is_submitted ? '✅ Submitted' : '❌ Not Submitted'}
                        </div>
                      </div>
                    </div>

                    {/* Result Card */}
                    <div style={{
                      background: hasScore ? '#F0FDF4' : '#F8FAFC',
                      border: hasScore ? '1px solid #BBF7D0' : '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: hasScore ? '#166534' : '#64748B' }}>
                        {hasScore ? 'Published Result' : 'Official Mark'}
                      </span>
                      <span style={{ fontSize: '16px', fontWeight: 900, color: hasScore ? '#15803D' : '#94A3B8' }}>
                        {hasScore ? `${item.obtained_score} / ${item.max_score} (${item.percentage}%)` : 'Not Published'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5.4: ASSESSMENT DETAIL & SUBMIT WORKSPACE */}
      {/* ===================================================================== */}
      {activeTab === 'detail' && (
        <div>
          {loadingDetail ? (
            <StudentSpinner message="Retrieving assessment instructions and attachments..." />
          ) : detailError ? (
            <StudentErrorState message={detailError} onRetry={() => selectedAssessmentId && loadAssessmentDetail(selectedAssessmentId)} />
          ) : !detailData ? (
            <StudentEmptyState
              icon="✍️"
              title="No Assessment Selected"
              description="Please choose an assignment from the Upcoming or Past tabs to view instructions and submit your work."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 2fr) minmax(280px, 1fr)', gap: '24px' }}>
              {/* Left Column: Full Instructions & Teacher Attachments */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
              }}>
                {/* Header Information */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    background: '#EFF6FF',
                    color: '#1E40AF',
                    padding: '4px 10px',
                    borderRadius: '8px'
                  }}>
                    {detailData.subject_name} ({detailData.subject_code})
                  </span>

                  <span style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    padding: '4px 12px',
                    borderRadius: '999px',
                    background: detailData.is_overdue ? '#FEE2E2' : '#FEF3C7',
                    color: detailData.is_overdue ? '#991B1B' : '#92400E'
                  }}>
                    {detailData.is_overdue ? 'Deadline Expired' : 'Open for Submission'}
                  </span>
                </div>

                <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: 800, color: '#0F172A' }}>
                  {detailData.title}
                </h2>

                {/* Metadata Row */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '16px',
                  fontSize: '13px',
                  color: '#475569',
                  background: '#F8FAFC',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  marginBottom: '20px'
                }}>
                  <div>👨‍🏫 Instructor: <strong>{detailData.teacher_name}</strong></div>
                  <div>🎯 Maximum Mark: <strong>{detailData.max_score} pts</strong></div>
                  <div>⏰ Deadline: <strong>{new Date(detailData.due_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></div>
                  <div>Late Submissions: <strong>{detailData.allow_late ? 'Allowed' : 'Disallowed'}</strong></div>
                </div>

                {/* Instructions Section */}
                <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                  Assignment Instructions & Rubric
                </h3>
                <div style={{
                  fontSize: '14px',
                  lineHeight: 1.6,
                  color: '#334155',
                  background: '#FFFFFF',
                  border: '1px solid #F1F5F9',
                  borderRadius: '10px',
                  padding: '16px',
                  marginBottom: '24px',
                  whiteSpace: 'pre-wrap'
                }}>
                  {detailData.instructions || 'No detailed instructions provided by instructor.'}
                </div>

                {/* Teacher Attachments / Materials */}
                <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                  Teacher Attachments & Class Resources ({detailData.attachments?.length || 0})
                </h3>
                {detailData.attachments?.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0 }}>No supplementary files attached for this assignment.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {detailData.attachments.map((mat) => (
                      <div
                        key={mat.id}
                        style={{
                          border: '1px solid #E2E8F0',
                          borderRadius: '8px',
                          padding: '10px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: '#F8FAFC'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>
                            📄 {mat.title}
                          </div>
                          {mat.original_name && (
                            <div style={{ fontSize: '11px', color: '#64748B' }}>
                              {mat.original_name} {mat.size_bytes ? `(${(mat.size_bytes / 1024).toFixed(1)} KB)` : ''}
                            </div>
                          )}
                        </div>

                        {mat.url && (
                          <a
                            href={mat.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#2563EB',
                              textDecoration: 'none'
                            }}
                          >
                            Open Link &rarr;
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Submission & Review Workspace */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Existing Submission Status Card */}
                {detailData.submission_id && (
                  <div style={{
                    background: '#F0FDF4',
                    border: '1.5px solid #BBF7D0',
                    borderRadius: '16px',
                    padding: '20px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>
                        Work Submitted
                      </span>
                      {detailData.is_late && (
                        <span style={{ fontSize: '11px', fontWeight: 800, background: '#FEE2E2', color: '#991B1B', padding: '2px 6px', borderRadius: '4px' }}>
                          Late
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '13px', color: '#166534', marginBottom: '12px' }}>
                      Submitted on: {new Date(detailData.submitted_at!).toLocaleString()}
                    </div>

                    {detailData.obtained_score !== null && detailData.obtained_score !== undefined ? (
                      <div style={{
                        background: '#FFFFFF',
                        border: '1px solid #86EFAC',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        marginBottom: '10px'
                      }}>
                        <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>TEACHER GRADE</div>
                        <div style={{ fontSize: '20px', fontWeight: 900, color: '#15803D' }}>
                          {detailData.obtained_score} / {detailData.max_score} pts
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#047857', marginBottom: '10px', fontStyle: 'italic' }}>
                        Under teacher review (Grade pending)
                      </div>
                    )}

                    {detailData.feedback && (
                      <div style={{ fontSize: '12px', color: '#1E293B', background: '#FFFFFF', padding: '10px', borderRadius: '8px', border: '1px solid #86EFAC', marginBottom: '10px' }}>
                        <strong>Feedback:</strong> "{detailData.feedback}"
                      </div>
                    )}

                    {/* Attached solution file download action badge */}
                    {(detailData.submission_file_name || detailData.document_id) && (
                      <div style={{
                        marginTop: '12px',
                        background: '#F0FDF4',
                        border: '1px solid #BBF7D0',
                        borderRadius: '10px',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '220px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '8px',
                            background: '#DCFCE7',
                            color: '#15803D',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            flexShrink: 0
                          }}>
                            📄
                          </div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534', wordBreak: 'break-all' }}>
                              {detailData.submission_file_name || 'My Submitted File'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#15803D', marginTop: '2px' }}>
                              Submitted Attachment &bull; {formatFileSize(detailData.submission_file_size)}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDownloadSubmissionFile(detailData.submission_id || detailData.id, detailData.submission_file_name)}
                          disabled={downloadingSubmissionId === (detailData.submission_id || detailData.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: downloadingSubmissionId === (detailData.submission_id || detailData.id) ? '#94A3B8' : '#15803D',
                            color: '#FFFFFF',
                            border: 'none',
                            padding: '7px 16px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: downloadingSubmissionId === (detailData.submission_id || detailData.id) ? 'not-allowed' : 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                          }}
                        >
                          {downloadingSubmissionId === (detailData.submission_id || detailData.id) ? (
                            <>⏳ Downloading...</>
                          ) : (
                            <>
                              <span>📥</span>
                              <span>Download Submitted File</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Submission Form Workspace */}
                <div style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '16px',
                  padding: '20px'
                }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                    {scopeA ? (detailData.submission_id ? 'Update / Resubmit Coursework' : 'Submit Your Assignment') : 'Submission Policy'}
                  </h3>

                  {!scopeA ? (
                    <div style={{
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '16px',
                      color: '#475569',
                      fontSize: '13px',
                      lineHeight: 1.5
                    }}>
                      <div style={{ fontWeight: 700, color: '#1E293B', marginBottom: '4px' }}>
                        ℹ️ In-Person Coursework Submission
                      </div>
                      Online digital assignment submission is not active for this school academic term. Please complete your coursework and submit physical work or worksheets directly to your instructor during scheduled periods.
                    </div>
                  ) : (
                    <>
                      {submitSuccess && (
                        <div style={{ background: '#DCFCE7', border: '1px solid #86EFAC', color: '#166534', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '12px' }}>
                          ✅ {submitSuccess}
                        </div>
                      )}

                      {submitError && (
                        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '12px' }}>
                          ⚠️ {submitError}
                        </div>
                      )}

                      {!detailData.can_submit ? (
                        <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', color: '#9F1239', borderRadius: '8px', padding: '12px 14px', fontSize: '13px' }}>
                          🔒 Submissions are closed. The deadline for this assignment has expired and late submissions are disallowed.
                        </div>
                      ) : (
                        <form onSubmit={handleSubmitWork}>
                          <div style={{ marginBottom: '14px' }}>
                            <label htmlFor="submissionTextarea" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                              Written Work / Solution Notes:
                            </label>
                            <textarea
                              id="submissionTextarea"
                              rows={6}
                              value={submissionText}
                              onChange={(e) => setSubmissionText(e.target.value)}
                              placeholder="Type or paste your complete solution, essay text, or project report here..."
                              style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1.5px solid #CBD5E1',
                                fontSize: '13px',
                                lineHeight: 1.5,
                                color: '#0F172A',
                                fontFamily: 'inherit'
                              }}
                            />
                            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px', textAlign: 'right' }}>
                              {submissionText.length} characters
                            </div>
                          </div>

                          {/* File Upload Attachment Area */}
                          <div style={{ marginBottom: '16px' }}>
                            <label htmlFor="submissionFileInput" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                              Upload Solution Attachment (PDF, Word, Image, ZIP max 15MB):
                            </label>
                            <input
                              id="submissionFileInput"
                              type="file"
                              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt,.zip"
                              onChange={handleFileChange}
                              style={{
                                display: 'block',
                                width: '100%',
                                fontSize: '12px',
                                color: '#475569',
                                border: '1px solid #CBD5E1',
                                borderRadius: '8px',
                                padding: '8px',
                                background: '#F8FAFC'
                              }}
                            />
                            {fileError && (
                              <div style={{ color: '#DC2626', fontSize: '12px', marginTop: '4px', fontWeight: 600 }}>
                                ⚠️ {fileError}
                              </div>
                            )}
                            {selectedFile && (
                              <div style={{
                                marginTop: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                color: '#1E40AF'
                              }}>
                                <span>📄 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFile(null);
                                    const input = document.getElementById('submissionFileInput') as HTMLInputElement;
                                    if (input) input.value = '';
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#DC2626',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>

                          <button
                            type="submit"
                            disabled={submitting}
                            style={{
                              width: '100%',
                              padding: '10px 18px',
                              borderRadius: '8px',
                              border: 'none',
                              background: submitting ? '#94A3B8' : '#1F3A5F',
                              color: '#FFFFFF',
                              fontWeight: 700,
                              fontSize: '14px',
                              cursor: submitting ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {submitting ? 'Submitting coursework...' : detailData.submission_id ? 'Update Existing Submission' : 'Submit Assignment Now'}
                          </button>
                        </form>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
