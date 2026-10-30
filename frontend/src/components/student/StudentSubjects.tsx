import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../api/client';
import {
  StudentTabs,
  StudentSpinner,
  StudentEmptyState,
  StudentErrorState,
  type TabItem
} from './StudentCommon';

interface SubjectItem {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  name_am?: string | null;
  description?: string | null;
  teaching_assignment_id: number;
  staff_id: number;
  teacher_name: string;
  teacher_email?: string | null;
  teacher_phone?: string | null;
  periods_per_week: number;
  stream: string;
  is_compulsory: number;
  pass_mark?: number | null;
  materials_count: number;
  assignments_count: number;
}

interface SectionSummary {
  total_subjects: number;
  total_periods: number;
  section_name: string;
  stream: string;
  grade_name?: string;
}

interface SubjectDetailData {
  subject: {
    teaching_assignment_id: number;
    subject_id: number;
    subject_code: string;
    subject_name: string;
    name_am?: string | null;
    description?: string | null;
    staff_id: number;
    teacher_name: string;
    teacher_email?: string | null;
    teacher_phone?: string | null;
    teacher_title?: string | null;
    teacher_department?: string | null;
    periods_per_week: number;
    stream: string;
    is_compulsory: number;
    pass_mark?: number | null;
    missing_mark_rule?: string | null;
  };
  assignments: Array<{
    id: number;
    title: string;
    instructions?: string | null;
    due_at?: string | null;
    allow_late: number;
    max_score: number;
    status: string;
    published_at?: string | null;
    term_name?: string | null;
  }>;
  materials: Array<{
    id: number;
    title: string;
    description?: string | null;
    url?: string | null;
    document_id?: number | null;
    original_name?: string | null;
    mime_type?: string | null;
    size_bytes?: number | null;
    uploaded_by_name?: string | null;
    created_at: string;
  }>;
  published_results: Array<{
    id: number;
    total_score: number;
    letter_grade: string;
    grade_points: number;
    is_pass: number;
    subject_rank?: number | null;
    term_name: string;
    published_at?: string | null;
  }>;
}

interface MaterialItem {
  id: number;
  title: string;
  category: string;
  description: string;
  url?: string | null;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  document_id?: number | null;
  original_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  uploaded_by: string;
  created_at: string;
}

interface StudentSubjectsProps {
  initialTab?: string;
  initialSubjectId?: number | null;
  onNavigateTab?: (tab: string) => void;
}

export const StudentSubjects: React.FC<StudentSubjectsProps> = ({
  initialTab = 'my-subjects',
  initialSubjectId = null
}) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(initialSubjectId);

  // Data states
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [subjectsList, setSubjectsList] = useState<SubjectItem[]>([]);
  const [summary, setSummary] = useState<SectionSummary | null>(null);

  // Subject Detail states
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [subjectDetail, setSubjectDetail] = useState<SubjectDetailData | null>(null);

  // Materials states
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);
  const [materialsList, setMaterialsList] = useState<MaterialItem[]>([]);
  const [materialFilterSubject, setMaterialFilterSubject] = useState<string>('all');
  const [materialFilterCategory, setMaterialFilterCategory] = useState<string>('all');
  const [materialSearchQuery, setMaterialSearchQuery] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Subject search & filter
  const [subjectSearch, setSubjectSearch] = useState('');
  const [compulsoryFilter, setCompulsoryFilter] = useState<'all' | 'compulsory' | 'elective'>('all');

  // Load Subjects (Tab 2.1)
  const fetchSubjects = useCallback(async () => {
    setLoadingSubjects(true);
    setSubjectsError(null);
    try {
      const data = await api.getStudentSubjects();
      setSubjectsList(data?.subjects || []);
      setSummary(data?.summary || null);

      // Default select first subject if none selected yet
      if (!selectedSubjectId && data?.subjects?.length > 0) {
        setSelectedSubjectId(data.subjects[0].subject_id);
      }
    } catch (err: any) {
      setSubjectsError(err.message || 'Unable to connect to academic servers.');
    } finally {
      setLoadingSubjects(false);
    }
  }, [selectedSubjectId]);

  // Load Subject Detail (Tab 2.2)
  const fetchSubjectDetail = useCallback(async (subjectId: number) => {
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const data = await api.getStudentSubjectDetail(subjectId);
      setSubjectDetail(data || null);
    } catch (err: any) {
      setDetailError(err.message || 'Unable to load subject details.');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Load Learning Materials (Tab 2.3)
  const fetchMaterials = useCallback(async () => {
    setLoadingMaterials(true);
    setMaterialsError(null);
    try {
      const subjectId = materialFilterSubject !== 'all' ? Number(materialFilterSubject) : undefined;
      const search = materialSearchQuery.trim() || undefined;
      const data = await api.getStudentMaterials({ subjectId, search });
      setMaterialsList(data || []);
    } catch (err: any) {
      setMaterialsError(err.message || 'Unable to load learning materials.');
    } finally {
      setLoadingMaterials(false);
    }
  }, [materialFilterSubject, materialSearchQuery]);

  // Initial load
  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  // Ensure selectedSubjectId is set when subjectsList arrives
  useEffect(() => {
    if (subjectsList.length > 0) {
      if (!selectedSubjectId || !subjectsList.some((s) => s.subject_id === selectedSubjectId)) {
        setSelectedSubjectId(subjectsList[0].subject_id);
      }
    }
  }, [subjectsList, selectedSubjectId]);

  // Fetch detail when tab or selected subject changes
  useEffect(() => {
    if (activeTab === 'subject-detail' && selectedSubjectId) {
      fetchSubjectDetail(selectedSubjectId);
    }
  }, [activeTab, selectedSubjectId, fetchSubjectDetail]);

  // Fetch materials when tab is materials
  useEffect(() => {
    if (activeTab === 'materials') {
      fetchMaterials();
    }
  }, [activeTab, fetchMaterials]);

  // Download handler
  const handleDownloadMaterial = async (item: MaterialItem) => {
    if (item.url && !item.document_id) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }

    setDownloadingId(item.id);
    try {
      const downloadUrl = api.getStudentMaterialDownloadUrl(item.id);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = item.original_name || `${item.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      alert(`Download Error: ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Filtered subjects for Tab 2.1
  const filteredSubjects = useMemo(() => {
    return subjectsList.filter((sub) => {
      const matchesSearch =
        sub.subject_name.toLowerCase().includes(subjectSearch.toLowerCase()) ||
        sub.subject_code.toLowerCase().includes(subjectSearch.toLowerCase()) ||
        (sub.teacher_name && sub.teacher_name.toLowerCase().includes(subjectSearch.toLowerCase()));

      const matchesCompulsory =
        compulsoryFilter === 'all' ||
        (compulsoryFilter === 'compulsory' && sub.is_compulsory === 1) ||
        (compulsoryFilter === 'elective' && sub.is_compulsory === 0);

      return matchesSearch && matchesCompulsory;
    });
  }, [subjectsList, subjectSearch, compulsoryFilter]);

  // Filtered materials for Tab 2.3
  const filteredMaterials = useMemo(() => {
    return materialsList.filter((m) => {
      const matchesCategory =
        materialFilterCategory === 'all' || m.category.toLowerCase() === materialFilterCategory.toLowerCase();
      return matchesCategory;
    });
  }, [materialsList, materialFilterCategory]);

  const tabs: TabItem[] = [
    {
      key: 'my-subjects',
      label: 'My Subjects',
      badge: subjectsList.length,
      icon: <span>📚</span>
    },
    {
      key: 'subject-detail',
      label: 'Subject Detail',
      icon: <span>🔍</span>
    },
    {
      key: 'materials',
      label: 'Learning Materials',
      badge: materialsList.length > 0 ? materialsList.length : undefined,
      icon: <span>📑</span>
    }
  ];

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="student-subjects-page" style={{ padding: '4px 0 32px' }}>
      {/* Page Title & Addis Ababa Academic Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: '0 0 6px' }}>
          Subjects & Learning Materials
        </h1>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
          Manage your enrolled subjects, syllabi, teacher contacts, and authorized classroom resources.
        </p>
      </div>

      {/* Tabs navigation */}
      <StudentTabs
        tabs={tabs}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
        ariaLabel="Subjects and Materials Tabs"
      />

      {/* ========================================================= */}
      {/* TAB 2.1: MY SUBJECTS */}
      {/* ========================================================= */}
      {activeTab === 'my-subjects' && (
        <div role="tabpanel" id="tabpanel-my-subjects" aria-labelledby="tab-my-subjects">
          {loadingSubjects ? (
            <StudentSpinner message="Fetching your enrolled subjects and weekly period allocations..." />
          ) : subjectsError ? (
            <StudentErrorState message={subjectsError} onRetry={fetchSubjects} />
          ) : (
            <>
              {/* Section Overview Bar */}
              {summary && (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%)',
                    borderRadius: '14px',
                    padding: '20px 24px',
                    color: '#fff',
                    marginBottom: '24px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    boxShadow: '0 4px 14px rgba(30, 58, 138, 0.15)'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', color: '#93C5FD', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Enrolled Classroom Section
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 800, marginTop: '2px' }}>
                      {summary.section_name || 'Placement Pending'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#CBD5E1', marginTop: '4px' }}>
                      Stream: <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{summary.stream.replace('_', ' ')}</span>
                      {summary.grade_name && ` • ${summary.grade_name}`}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '10px 18px', borderRadius: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', fontWeight: 800 }}>{summary.total_subjects}</div>
                      <div style={{ fontSize: '12px', color: '#93C5FD' }}>Active Subjects</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '10px 18px', borderRadius: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '22px', fontWeight: 800 }}>{summary.total_periods}</div>
                      <div style={{ fontSize: '12px', color: '#93C5FD' }}>Periods / Week</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Filters & Search Toolbar */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '20px'
                }}
              >
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: '1', minWidth: '260px', maxWidth: '420px' }}>
                  <input
                    type="text"
                    placeholder="Search subject code, name or teacher..."
                    value={subjectSearch}
                    onChange={(e) => setSubjectSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 14px',
                      borderRadius: '8px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                  {subjectSearch && (
                    <button
                      type="button"
                      onClick={() => setSubjectSearch('')}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8' }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['all', 'compulsory', 'elective'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCompulsoryFilter(mode)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '999px',
                        border: '1px solid',
                        borderColor: compulsoryFilter === mode ? '#1E3A8A' : '#CBD5E1',
                        background: compulsoryFilter === mode ? '#1E3A8A' : '#fff',
                        color: compulsoryFilter === mode ? '#fff' : '#475569',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {mode === 'all' ? 'All Subjects' : mode === 'compulsory' ? 'Compulsory' : 'Elective'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subjects Grid */}
              {filteredSubjects.length === 0 ? (
                <StudentEmptyState
                  icon="📚"
                  title={subjectSearch ? 'No subjects matched your search' : 'No subjects enrolled'}
                  description={
                    subjectSearch
                      ? `No subject matching "${subjectSearch}" was found in your curriculum.`
                      : 'Your section has not been assigned subjects for this academic year yet. Please contact the Registrar Office.'
                  }
                  action={subjectSearch ? { label: 'Clear Filter', onClick: () => setSubjectSearch('') } : undefined}
                />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '20px'
                  }}
                >
                  {filteredSubjects.map((sub) => (
                    <div
                      key={sub.subject_id}
                      style={{
                        background: '#fff',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'transform 0.2s, box-shadow 0.2s'
                      }}
                    >
                      {/* Card Header */}
                      <div
                        style={{
                          padding: '16px 20px',
                          borderBottom: '1px solid #F1F5F9',
                          background: '#F8FAFC',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              background: '#1E3A8A',
                              color: '#fff',
                              fontWeight: 800,
                              fontSize: '13px',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              letterSpacing: '0.05em'
                            }}
                          >
                            {sub.subject_code}
                          </span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '16px', color: '#0F172A' }}>
                              {sub.subject_name}
                            </div>
                            {sub.name_am && (
                              <div style={{ fontSize: '13px', color: '#64748B' }}>{sub.name_am}</div>
                            )}
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '999px',
                            background: sub.is_compulsory ? '#EFF6FF' : '#F1F5F9',
                            color: sub.is_compulsory ? '#1D4ED8' : '#475569'
                          }}
                        >
                          {sub.is_compulsory ? 'Compulsory' : 'Elective'}
                        </span>
                      </div>

                      {/* Card Body */}
                      <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Teacher Info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F8FAFC', padding: '10px 14px', borderRadius: '8px' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: '#DBEAFE',
                              color: '#1E40AF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '14px'
                            }}
                          >
                            {sub.teacher_name ? sub.teacher_name.charAt(0).toUpperCase() : 'T'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 500 }}>Assigned Teacher</div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {sub.teacher_name || 'Department Assigned'}
                            </div>
                          </div>
                          {sub.teacher_email && (
                            <a
                              href={`mailto:${sub.teacher_email}`}
                              title={`Email ${sub.teacher_name}`}
                              style={{ color: '#2563EB', fontSize: '16px', textDecoration: 'none', padding: '4px' }}
                            >
                              ✉️
                            </a>
                          )}
                        </div>

                        {/* Subject Stats */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                          <div style={{ border: '1px solid #E2E8F0', padding: '8px 12px', borderRadius: '6px' }}>
                            <div style={{ color: '#64748B', fontSize: '11px', fontWeight: 500 }}>Weekly Periods</div>
                            <div style={{ fontWeight: 700, color: '#0F172A' }}>{sub.periods_per_week} periods/wk</div>
                          </div>
                          <div style={{ border: '1px solid #E2E8F0', padding: '8px 12px', borderRadius: '6px' }}>
                            <div style={{ color: '#64748B', fontSize: '11px', fontWeight: 500 }}>Passing Mark</div>
                            <div style={{ fontWeight: 700, color: '#059669' }}>{sub.pass_mark ? `${sub.pass_mark}%` : '50%'}</div>
                          </div>
                          <div style={{ border: '1px solid #E2E8F0', padding: '8px 12px', borderRadius: '6px' }}>
                            <div style={{ color: '#64748B', fontSize: '11px', fontWeight: 500 }}>Materials</div>
                            <div style={{ fontWeight: 700, color: '#1E3A8A' }}>{sub.materials_count} available</div>
                          </div>
                          <div style={{ border: '1px solid #E2E8F0', padding: '8px 12px', borderRadius: '6px' }}>
                            <div style={{ color: '#64748B', fontSize: '11px', fontWeight: 500 }}>Assignments</div>
                            <div style={{ fontWeight: 700, color: '#B45309' }}>{sub.assignments_count} active</div>
                          </div>
                        </div>
                      </div>

                      {/* Card Actions Footer */}
                      <div
                        style={{
                          padding: '12px 20px',
                          borderTop: '1px solid #F1F5F9',
                          background: '#FAFAFA',
                          display: 'flex',
                          gap: '10px',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSubjectId(sub.subject_id);
                            setActiveTab('subject-detail');
                          }}
                          style={{
                            background: '#1E3A8A',
                            color: '#fff',
                            border: 'none',
                            padding: '8px 14px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Subject Detail & Syllabus →
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMaterialFilterSubject(String(sub.subject_id));
                            setActiveTab('materials');
                          }}
                          style={{
                            background: '#fff',
                            color: '#1E3A8A',
                            border: '1px solid #CBD5E1',
                            padding: '7px 12px',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Materials ({sub.materials_count})
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2.2: SUBJECT DETAIL */}
      {/* ========================================================= */}
      {activeTab === 'subject-detail' && (
        <div role="tabpanel" id="tabpanel-subject-detail" aria-labelledby="tab-subject-detail">
          {/* Top navigation / Subject Selector Bar */}
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              padding: '16px 20px',
              marginBottom: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}
          >
            {/* Header row with Back button and Dropdown */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '14px',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: subjectsList.length > 0 ? '14px' : '0'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('my-subjects')}
                  style={{
                    background: '#F1F5F9',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    color: '#1E293B',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  ← All Subjects
                </button>
                <span style={{ color: '#CBD5E1' }}>|</span>
                <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 600 }}>Choose Subject:</span>
                <select
                  aria-label="Choose Enrolled Subject"
                  value={selectedSubjectId || ''}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id) setSelectedSubjectId(id);
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1.5px solid #3B82F6',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#0F172A',
                    background: '#FFFFFF',
                    outline: 'none',
                    minWidth: '240px',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                  }}
                >
                  {loadingSubjects ? (
                    <option value="" disabled>Loading enrolled subjects...</option>
                  ) : subjectsList.length === 0 ? (
                    <option value="" disabled>No subjects assigned — Placement pending</option>
                  ) : (
                    <>
                      <option value="" disabled>-- Select Enrolled Subject --</option>
                      {subjectsList.map((s) => (
                        <option
                          key={s.subject_id}
                          value={s.subject_id}
                          style={{ color: '#0F172A', background: '#FFFFFF', padding: '6px' }}
                        >
                          {s.subject_code} - {s.subject_name} ({s.teacher_name})
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {subjectDetail && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span
                    style={{
                      background: '#EFF6FF',
                      color: '#1E40AF',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 700
                    }}
                  >
                    {subjectDetail.subject.periods_per_week} periods/week
                  </span>
                  <span
                    style={{
                      background: '#F0FDF4',
                      color: '#166534',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      fontWeight: 700
                    }}
                  >
                    Pass: {subjectDetail.subject.pass_mark || 50}%
                  </span>
                </div>
              )}
            </div>

            {/* Visual Subject Quick-Pills Bar (Visible list of options so nothing is hidden!) */}
            {subjectsList.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  overflowX: 'auto',
                  paddingTop: '12px',
                  borderTop: '1px solid #F1F5F9'
                }}
              >
                {subjectsList.map((s) => {
                  const isSelected = selectedSubjectId === s.subject_id;
                  return (
                    <button
                      key={s.subject_id}
                      type="button"
                      onClick={() => setSelectedSubjectId(s.subject_id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '7px 14px',
                        borderRadius: '8px',
                        border: '1.5px solid',
                        borderColor: isSelected ? '#1E3A8A' : '#E2E8F0',
                        background: isSelected ? '#1E3A8A' : '#F8FAFC',
                        color: isSelected ? '#FFFFFF' : '#334155',
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: '13px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 2px 4px rgba(30, 58, 138, 0.2)' : 'none'
                      }}
                    >
                      <span
                        style={{
                          background: isSelected ? 'rgba(255,255,255,0.2)' : '#E2E8F0',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}
                      >
                        {s.subject_code}
                      </span>
                      <span>{s.subject_name}</span>
                      {isSelected && <span>✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {loadingDetail ? (
            <StudentSpinner message="Loading subject syllabus, assessments, and learning materials..." />
          ) : detailError ? (
            <StudentErrorState
              title="Subject Detail Unavailable"
              message={detailError}
              onRetry={() => selectedSubjectId && fetchSubjectDetail(selectedSubjectId)}
            />
          ) : subjectDetail ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Subject Banner */}
              <div
                style={{
                  background: '#fff',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '24px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '20px',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span
                      style={{
                        background: '#1E3A8A',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '14px',
                        padding: '4px 10px',
                        borderRadius: '6px'
                      }}
                    >
                      {subjectDetail.subject.subject_code}
                    </span>
                    <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                      {subjectDetail.subject.subject_name}
                    </h2>
                    {subjectDetail.subject.name_am && (
                      <span style={{ fontSize: '16px', color: '#64748B' }}>
                        ({subjectDetail.subject.name_am})
                      </span>
                    )}
                  </div>

                  <p style={{ margin: '8px 0 0', color: '#475569', fontSize: '14px', maxWidth: '640px', lineHeight: 1.6 }}>
                    {subjectDetail.subject.description || 'Comprehensive national curriculum course syllabus adhering to Ethiopian Ministry of Education standards.'}
                  </p>
                </div>

                {/* Teacher Card */}
                <div
                  style={{
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    padding: '16px',
                    minWidth: '260px'
                  }}
                >
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748B', fontWeight: 700, letterSpacing: '0.05em' }}>
                    Instructor & Department
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>
                    {subjectDetail.subject.teacher_name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748B' }}>
                    {subjectDetail.subject.teacher_department || 'Faculty of Science'}
                    {subjectDetail.subject.teacher_title && ` • ${subjectDetail.subject.teacher_title}`}
                  </div>

                  {subjectDetail.subject.teacher_email && (
                    <div style={{ marginTop: '8px', fontSize: '13px' }}>
                      <a href={`mailto:${subjectDetail.subject.teacher_email}`} style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 500 }}>
                        ✉️ {subjectDetail.subject.teacher_email}
                      </a>
                    </div>
                  )}
                  {subjectDetail.subject.teacher_phone && (
                    <div style={{ marginTop: '4px', fontSize: '13px', color: '#64748B' }}>
                      📞 {subjectDetail.subject.teacher_phone}
                    </div>
                  )}
                </div>
              </div>

              {/* Grid: Assessments & Results + Materials */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                {/* Published Assessments */}
                <div
                  style={{
                    background: '#fff',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '20px'
                  }}
                >
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Published Assessments</span>
                    <span style={{ fontSize: '12px', background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '999px' }}>
                      {subjectDetail.assignments.length} Total
                    </span>
                  </h3>

                  {subjectDetail.assignments.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px 16px', color: '#64748B', fontSize: '14px', background: '#F8FAFC', borderRadius: '8px' }}>
                      📭 No published assessments or homework assignments for this subject at this time.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {subjectDetail.assignments.map((ass) => (
                        <div
                          key={ass.id}
                          style={{
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            padding: '14px',
                            background: '#F8FAFC'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', color: '#0F172A' }}>{ass.title}</div>
                            <span style={{ fontSize: '11px', fontWeight: 700, background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '4px' }}>
                              Max: {ass.max_score} pts
                            </span>
                          </div>

                          {ass.instructions && (
                            <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#475569', lineHeight: 1.4 }}>
                              {ass.instructions}
                            </p>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '12px', color: '#64748B' }}>
                            <span>Due: {ass.due_at ? new Date(ass.due_at).toLocaleDateString() : 'No hard deadline'}</span>
                            {ass.allow_late ? (
                              <span style={{ color: '#D97706' }}>Late submissions accepted</span>
                            ) : (
                              <span style={{ color: '#991B1B' }}>Strict deadline</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Published Results & Academic Progress */}
                <div
                  style={{
                    background: '#fff',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '20px'
                  }}
                >
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: '0 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Official Published Results</span>
                    <span style={{ fontSize: '12px', background: '#DCFCE7', color: '#166534', padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>
                      Verified Only
                    </span>
                  </h3>

                  {subjectDetail.published_results.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '28px 16px', color: '#64748B', fontSize: '14px', background: '#F8FAFC', borderRadius: '8px' }}>
                      🔒 Final results for this semester are currently in review or grading and have not yet been officially published.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {subjectDetail.published_results.map((res) => (
                        <div
                          key={res.id}
                          style={{
                            border: '1px solid #BBF7D0',
                            borderRadius: '8px',
                            padding: '14px',
                            background: '#F0FDF4'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#166534' }}>{res.term_name}</span>
                            <span style={{ fontSize: '18px', fontWeight: 800, color: '#15803D' }}>{res.letter_grade}</span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '10px', textAlign: 'center', fontSize: '12px' }}>
                            <div style={{ background: '#fff', padding: '6px', borderRadius: '6px', border: '1px solid #DCFCE7' }}>
                              <div style={{ color: '#64748B' }}>Total Score</div>
                              <div style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>{res.total_score}%</div>
                            </div>
                            <div style={{ background: '#fff', padding: '6px', borderRadius: '6px', border: '1px solid #DCFCE7' }}>
                              <div style={{ color: '#64748B' }}>GPA Points</div>
                              <div style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>{res.grade_points}</div>
                            </div>
                            <div style={{ background: '#fff', padding: '6px', borderRadius: '6px', border: '1px solid #DCFCE7' }}>
                              <div style={{ color: '#64748B' }}>Class Rank</div>
                              <div style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>
                                {res.subject_rank ? `#${res.subject_rank}` : 'N/A'}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Security notice */}
                  <div style={{ marginTop: '14px', padding: '8px 12px', background: '#F1F5F9', borderRadius: '6px', fontSize: '12px', color: '#64748B' }}>
                    🛡️ <strong>Integrity Standard:</strong> Draft assessments and unverified marks remain hidden until ratified by the School Academic Committee.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <StudentEmptyState
              icon="🔍"
              title="No Subject Selected"
              description="Please select a subject from your enrolled list to inspect its syllabus and materials."
              action={{ label: 'Back to Subjects', onClick: () => setActiveTab('my-subjects') }}
            />
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2.3: LEARNING MATERIALS */}
      {/* ========================================================= */}
      {activeTab === 'materials' && (
        <div role="tabpanel" id="tabpanel-materials" aria-labelledby="tab-materials">
          {/* Filters Bar */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '16px 20px',
              marginBottom: '20px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '14px',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            {/* Search */}
            <div style={{ flex: '1', minWidth: '240px', maxWidth: '380px' }}>
              <input
                type="text"
                placeholder="Search material title, topic or keyword..."
                value={materialSearchQuery}
                onChange={(e) => setMaterialSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            {/* Subject Dropdown Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Subject:</span>
              <select
                value={materialFilterSubject}
                onChange={(e) => setMaterialFilterSubject(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#0F172A',
                  outline: 'none',
                  background: '#fff'
                }}
              >
                <option value="all">All Enrolled Subjects</option>
                {subjectsList.map((s) => (
                  <option key={s.subject_id} value={s.subject_id}>
                    {s.subject_code} - {s.subject_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {(['all', 'worksheet', 'lecture_notes', 'syllabus', 'past_paper'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setMaterialFilterCategory(cat)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '999px',
                    border: '1px solid',
                    borderColor: materialFilterCategory === cat ? '#1E3A8A' : '#CBD5E1',
                    background: materialFilterCategory === cat ? '#1E3A8A' : '#fff',
                    color: materialFilterCategory === cat ? '#fff' : '#475569',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {cat === 'all'
                    ? 'All Types'
                    : cat === 'worksheet'
                    ? 'Worksheets'
                    : cat === 'lecture_notes'
                    ? 'Lecture Notes'
                    : cat === 'syllabus'
                    ? 'Syllabi'
                    : 'Past Papers'}
                </button>
              ))}
            </div>
          </div>

          {/* Materials Content */}
          {loadingMaterials ? (
            <StudentSpinner message="Retrieving authorized classroom materials and notes..." />
          ) : materialsError ? (
            <StudentErrorState message={materialsError} onRetry={fetchMaterials} />
          ) : filteredMaterials.length === 0 ? (
            <StudentEmptyState
              icon="📑"
              title={materialSearchQuery || materialFilterSubject !== 'all' ? 'No matching materials found' : 'No learning materials uploaded yet'}
              description={
                materialSearchQuery || materialFilterSubject !== 'all'
                  ? 'Try modifying your search query or subject filter to find files.'
                  : 'Your teachers have not uploaded lecture notes or resources for your section yet. Checked back soon!'
              }
              action={
                materialSearchQuery || materialFilterSubject !== 'all'
                  ? {
                      label: 'Reset Filters',
                      onClick: () => {
                        setMaterialSearchQuery('');
                        setMaterialFilterSubject('all');
                        setMaterialFilterCategory('all');
                      }
                    }
                  : undefined
              }
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredMaterials.map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: '#fff',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0',
                    padding: '16px 20px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1', minWidth: '280px' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '8px',
                        background: '#EFF6FF',
                        color: '#1E3A8A',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px'
                      }}
                    >
                      {item.url && !item.document_id ? '🔗' : '📄'}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '15px', color: '#0F172A' }}>
                          {item.title}
                        </span>
                        <span
                          style={{
                            background: '#F1F5F9',
                            color: '#475569',
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px'
                          }}
                        >
                          {item.subject_code}
                        </span>
                        <span
                          style={{
                            background: '#E0F2FE',
                            color: '#0369A1',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            textTransform: 'capitalize'
                          }}
                        >
                          {item.category.replace('_', ' ')}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                        Uploaded by <strong style={{ color: '#334155' }}>{item.uploaded_by || 'Teacher'}</strong> • {new Date(item.created_at).toLocaleDateString()}
                        {item.size_bytes ? ` • ${formatFileSize(item.size_bytes)}` : ''}
                      </div>

                      {item.description && (
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px', fontStyle: 'italic' }}>
                          "{item.description}"
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Download / Open Action */}
                  <div>
                    <button
                      type="button"
                      disabled={downloadingId === item.id}
                      onClick={() => handleDownloadMaterial(item)}
                      style={{
                        background: item.url && !item.document_id ? '#2563EB' : '#1E3A8A',
                        color: '#fff',
                        border: 'none',
                        padding: '9px 18px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: downloadingId === item.id ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    >
                      {downloadingId === item.id ? (
                        <span>Downloading...</span>
                      ) : item.url && !item.document_id ? (
                        <span>Open Link ↗</span>
                      ) : (
                        <span>Download 📥</span>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentSubjects;
