import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';
import { StudentTabs, StudentSpinner, StudentEmptyState, StudentErrorState, type TabItem } from './StudentCommon';

interface ComponentAssessment {
  mark_id: number;
  assessment_id: number;
  title: string;
  type_code: string;
  type_name: string;
  max_score: number;
  weight: number;
  score: number | null;
  percentage: number | null;
  feedback?: string | null;
  assessment_date?: string;
  is_corrected: boolean;
  old_score?: number | null;
  correction_reason?: string | null;
  corrected_at?: string | null;
}

interface SubjectResultsItem {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  credit_hours: number;
  letter_grade: string | null;
  total_score: number | null;
  is_pass: boolean | null;
  subject_rank: number | null;
  components_count: number;
  weighted_total: number;
  components: ComponentAssessment[];
}

interface TermSummaryData {
  academicYears: Array<{ id: number; name: string; label_ec?: string; is_current: boolean }>;
  selectedAcademicYearId: number;
  terms: Array<{ id: number; name: string; is_current: boolean }>;
  selectedTermId: number;
  termGpa: number;
  termAverage: number;
  annualAverage: number;
  rank: number;
  classSize: number;
  attendanceRate: number;
  standing: string;
  totalSubjects: number;
  passedSubjects: number;
  academicYearName: string;
  results: Array<{
    id: number;
    subject_id: number;
    subject_code: string;
    subject_name: string;
    subject_name_am?: string;
    credit_hours: number;
    total_score: number;
    letter_grade: string;
    grade_points: number;
    is_pass: boolean;
    subject_rank?: number;
  }>;
}

interface ProgressAndTrendsData {
  hasSufficientTrendData: boolean;
  trendDataNotice?: string | null;
  termByTerm: Array<{
    term_id: number;
    term_name: string;
    term_no: number;
    average_score: number;
    gpa: number;
  }>;
  perSubjectTrend: Array<{
    subject_id: number;
    subject_code: string;
    subject_name: string;
    latestScore: number;
    previousScore?: number | null;
    delta: number;
    trend: 'improving' | 'steady' | 'declining';
    terms: Array<{ term_name: string; score: number }>;
  }>;
  strongestSubjects: any[];
  subjectsNeedingAttention: any[];
  attendanceTrend: Array<{ period: string; rate: number }>;
}

interface StudentResultsProps {
  initialTab?: 'my_results' | 'summary' | 'trends';
}

export const StudentResults: React.FC<StudentResultsProps> = ({ initialTab = 'my_results' }) => {
  // Sync tab with URL parameter or route state
  const [activeTab, setActiveTab] = useState<'my_results' | 'summary' | 'trends'>(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'my_results' || tabParam === 'summary' || tabParam === 'trends') {
      return tabParam;
    }
    return initialTab;
  });

  // Global filters
  const [terms, setTerms] = useState<Array<{ id: number; name: string; is_current: boolean }>>([]);
  const [selectedTermId, setSelectedTermId] = useState<number | undefined>(undefined);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [academicYears, setAcademicYears] = useState<Array<{ id: number; name: string; is_current: boolean }>>([]);
  const [selectedYearId, setSelectedYearId] = useState<number | undefined>(undefined);

  // Tab 1 Data: My Results
  const [myResultsSubjects, setMyResultsSubjects] = useState<SubjectResultsItem[]>([]);
  const [expandedSubjectId, setExpandedSubjectId] = useState<number | null>(null);

  // Tab 2 Data: Term Summary
  const [summaryData, setSummaryData] = useState<TermSummaryData | null>(null);

  // Tab 3 Data: Progress & Trends
  const [progressData, setProgressData] = useState<ProgressAndTrendsData | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync tab changes to URL
  const handleTabChange = (key: string) => {
    const valid = key as 'my_results' | 'summary' | 'trends';
    setActiveTab(valid);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', valid);
    window.history.replaceState({}, '', url.toString());
  };

  // Fetch all initial results data
  const fetchData = async (termId?: number, subjectId?: number, yearId?: number) => {
    setLoading(true);
    setError(null);
    try {
      const [resultsRes, summaryRes, progressRes] = await Promise.all([
        api.getStudentMyResults({ termId, subjectId }),
        api.getStudentTermSummary({ termId, academicYearId: yearId }),
        api.getStudentProgressAndTrends({ academicYearId: yearId })
      ]);

      if (resultsRes?.terms?.length) {
        setTerms(resultsRes.terms);
        if (!selectedTermId && resultsRes.selectedTermId) {
          setSelectedTermId(resultsRes.selectedTermId);
        }
      }
      setMyResultsSubjects(resultsRes?.subjects || []);
      if (resultsRes?.subjects?.length && expandedSubjectId === null) {
        setExpandedSubjectId(resultsRes.subjects[0].subject_id);
      }

      setSummaryData(summaryRes);
      if (summaryRes?.academicYears?.length) {
        setAcademicYears(summaryRes.academicYears);
        if (!selectedYearId && summaryRes.selectedAcademicYearId) {
          setSelectedYearId(summaryRes.selectedAcademicYearId);
        }
      }

      setProgressData(progressRes);
    } catch (err: any) {
      console.error('Failed to load academic results:', err);
      setError(err?.message || 'Failed to load verified academic results from registrar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedTermId, selectedSubjectId !== 'all' ? Number(selectedSubjectId) : undefined, selectedYearId);
  }, [selectedTermId, selectedSubjectId, selectedYearId]);

  const handlePrintSlip = () => {
    window.print();
  };

  const getGradeColor = (grade?: string | null) => {
    switch (grade) {
      case 'A':
      case 'A+':
        return { bg: '#DCFCE7', text: '#166534', border: '#86EFAC' };
      case 'B':
      case 'B+':
        return { bg: '#EFF6FF', text: '#1E40AF', border: '#93C5FD' };
      case 'C':
      case 'C+':
        return { bg: '#FEF9C3', text: '#854D0E', border: '#FDE047' };
      case 'D':
        return { bg: '#FFEDD5', text: '#9A3412', border: '#FDBA74' };
      default:
        return { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' };
    }
  };

  const tabs: TabItem[] = useMemo(() => {
    return [
      {
        key: 'my_results',
        label: 'My Results',
        icon: <span>📝</span>,
        badge: myResultsSubjects.length > 0 ? `${myResultsSubjects.length} Subjects` : undefined
      },
      {
        key: 'summary',
        label: 'Term Summary',
        icon: <span>📜</span>,
        badge: summaryData?.termGpa ? `GPA ${summaryData.termGpa.toFixed(2)}` : undefined
      },
      {
        key: 'trends',
        label: 'Progress & Trends',
        icon: <span>📈</span>,
        badge: summaryData?.rank ? `#${summaryData.rank} in Class` : undefined
      }
    ];
  }, [myResultsSubjects.length, summaryData?.termGpa, summaryData?.rank]);

  return (
    <div className="student-results-page" style={{ maxWidth: '1240px', margin: '0 auto', paddingBottom: '36px' }}>
      {/* PRINT-SPECIFIC CSS */}
      <style>{`
        @media print {
          body {
            background: #FFFFFF !important;
            color: #000000 !important;
            font-size: 12pt !important;
          }
          nav, aside, header, .student-navbar, .student-sidebar, .results-no-print, button, select, input {
            display: none !important;
          }
          .student-results-page {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .results-print-header {
            display: block !important;
            margin-bottom: 24px;
            text-align: center;
            border-bottom: 2px solid #000000;
            padding-bottom: 14px;
          }
          .results-print-footer {
            display: block !important;
            margin-top: 48px;
            border-top: 1px dashed #666666;
            padding-top: 24px;
          }
          table {
            border: 1px solid #000000 !important;
            width: 100% !important;
          }
          th, td {
            border: 1px solid #CCCCCC !important;
            color: #000000 !important;
            padding: 8px 10px !important;
          }
        }
        @media screen {
          .results-print-header, .results-print-footer {
            display: none;
          }
        }
      `}</style>

      {/* PRINT-ONLY OFFICIAL HEADER */}
      <div className="results-print-header">
        <h1 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 900, textTransform: 'uppercase' }}>
          High School &amp; Preparatory School Management System
        </h1>
        <div style={{ fontSize: '13px', color: '#333333' }}>
          Official Ministry of Education Certified Student Grade Slip &amp; Academic Report
        </div>
        <div style={{ fontSize: '12px', marginTop: '6px' }}>
          Academic Year: <strong>{summaryData?.academicYearName || '2026/27 (2019 E.C.)'}</strong> &bull; Term: <strong>{terms.find((t) => t.id === selectedTermId)?.name || 'Semester 1'}</strong>
        </div>
      </div>

      {/* HEADER BANNER */}
      <div className="results-no-print" style={{
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
            <span style={{ fontSize: '28px' }}>🏆</span>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }}>
              Academic Results &amp; Progress
            </h1>
          </div>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: '14px', maxWidth: '640px', lineHeight: 1.5 }}>
            Published coursework marks, certified term grade summaries, and comparative performance trends verified by the registrar office.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {summaryData?.rank && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: '12px 18px',
              backdropFilter: 'blur(8px)',
              textAlign: 'right'
            }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#93C5FD', fontWeight: 700 }}>
                Class Standing
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: '#FCD34D' }}>
                Rank #{summaryData.rank} <span style={{ fontSize: '14px', color: '#CBD5E1', fontWeight: 600 }}>of {summaryData.classSize}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handlePrintSlip}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.12)',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              transition: 'background 0.2s'
            }}
          >
            <span>🖨️</span>
            <span>Print Grade Slip</span>
          </button>
        </div>
      </div>

      {/* TABS COMPONENT */}
      <div className="results-no-print" style={{ marginBottom: '20px' }}>
        <StudentTabs
          tabs={tabs}
          activeKey={activeTab}
          onChange={handleTabChange}
          ariaLabel="Results subpage navigation"
        />
      </div>

      {loading ? (
        <StudentSpinner message="Retrieving officially verified academic records from registrar database..." />
      ) : error ? (
        <StudentErrorState message={error} onRetry={() => fetchData(selectedTermId, selectedSubjectId !== 'all' ? Number(selectedSubjectId) : undefined, selectedYearId)} />
      ) : (
        <>
          {/* ========================================================================= */}
          {/* TAB 1: MY RESULTS (MASTER PROMPT 6.1) */}
          {/* ========================================================================= */}
          {activeTab === 'my_results' && (
            <div>
              {/* FILTER BAR */}
              <div className="results-no-print" style={{
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {/* Term Selector */}
                  {terms.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label htmlFor="myResultsTermSelect" style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                        Term:
                      </label>
                      <select
                        id="myResultsTermSelect"
                        value={selectedTermId || ''}
                        onChange={(e) => setSelectedTermId(Number(e.target.value))}
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
                        {terms.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.is_current ? '(Current)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Subject Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label htmlFor="myResultsSubjectSelect" style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                      Subject:
                    </label>
                    <select
                      id="myResultsSubjectSelect"
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
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
                      <option value="all">All Enrolled Subjects</option>
                      {myResultsSubjects.map((s) => (
                        <option key={s.subject_id} value={s.subject_id}>
                          {s.subject_name} ({s.subject_code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                  🛡️ Only published &amp; certified marks are displayed
                </div>
              </div>

              {/* LIST OF SUBJECTS WITH FORMATIVE COMPONENT MARKS */}
              {myResultsSubjects.length === 0 ? (
                <StudentEmptyState
                  icon="📝"
                  title="No Coursework Results Available"
                  description="No approved assessment marks found for the selected term and subject."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {myResultsSubjects.map((sub) => {
                    const isExpanded = expandedSubjectId === sub.subject_id;
                    const gradeStyle = getGradeColor(sub.letter_grade);

                    return (
                      <div
                        key={sub.subject_id}
                        style={{
                          background: '#FFFFFF',
                          borderRadius: '12px',
                          border: '1px solid #E2E8F0',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                          overflow: 'hidden'
                        }}
                      >
                        {/* ACCORDION HEADER */}
                        <div
                          onClick={() => setExpandedSubjectId(isExpanded ? null : sub.subject_id)}
                          style={{
                            padding: '18px 24px',
                            background: isExpanded ? '#F8FAFC' : '#FFFFFF',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px',
                            borderBottom: isExpanded ? '1px solid #E2E8F0' : 'none',
                            userSelect: 'none'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{
                              background: '#1F3A5F',
                              color: '#FFFFFF',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 800
                            }}>
                              {sub.subject_code}
                            </span>
                            <h3 style={{ margin: 0, color: '#0F172A', fontSize: '16px', fontWeight: 800 }}>
                              {sub.subject_name}
                            </h3>
                            <span style={{ fontSize: '12px', color: '#64748B' }}>
                              ({sub.components_count} assessment{sub.components_count === 1 ? '' : 's'})
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            {sub.letter_grade && (
                              <span style={{
                                width: '30px',
                                height: '30px',
                                lineHeight: '30px',
                                borderRadius: '50%',
                                background: gradeStyle.bg,
                                color: gradeStyle.text,
                                border: `1px solid ${gradeStyle.border}`,
                                fontWeight: 800,
                                fontSize: '13px',
                                textAlign: 'center'
                              }}>
                                {sub.letter_grade}
                              </span>
                            )}

                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748B', fontWeight: 700, display: 'block' }}>
                                Weighted Total
                              </span>
                              <span style={{ fontSize: '18px', fontWeight: 900, color: '#15803D' }}>
                                {sub.weighted_total} / 100
                              </span>
                            </div>

                            <span style={{ fontSize: '16px', color: '#94A3B8', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                              ▼
                            </span>
                          </div>
                        </div>

                        {/* ACCORDION TABLE */}
                        {isExpanded && (
                          <div style={{ padding: '20px 24px' }}>
                            {sub.components.length === 0 ? (
                              <p style={{ color: '#64748B', fontSize: '13px', margin: 0 }}>
                                No individual formative assessments published yet for this course.
                              </p>
                            ) : (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                  <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #CBD5E1', color: '#475569', fontSize: '11px', textTransform: 'uppercase' }}>
                                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Assessment Title</th>
                                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Type</th>
                                      <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Weight</th>
                                      <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Score &amp; Max</th>
                                      <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Percentage</th>
                                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700 }}>Teacher Feedback &amp; Audit</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sub.components.map((c) => (
                                      <tr key={c.mark_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#1E293B' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>{c.title}</span>
                                            {c.is_corrected && (
                                              <span
                                                title={`Corrected from ${c.old_score}. Reason: ${c.correction_reason || 'Mark revision'}`}
                                                style={{
                                                  background: '#FEF3C7',
                                                  color: '#92400E',
                                                  border: '1px solid #FDE68A',
                                                  padding: '2px 6px',
                                                  borderRadius: '4px',
                                                  fontSize: '10px',
                                                  fontWeight: 800
                                                }}
                                              >
                                                ⚠️ Corrected
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td style={{ padding: '12px 14px' }}>
                                          <span style={{ background: '#EFF6FF', color: '#1E40AF', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                                            {c.type_name || c.type_code}
                                          </span>
                                        </td>
                                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#64748B' }}>
                                          {c.weight}%
                                        </td>
                                        <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 800, color: '#1E293B' }}>
                                          {c.score !== null ? `${c.score} / ${c.max_score}` : '-'}
                                        </td>
                                        <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#15803D' }}>
                                          {c.percentage !== null ? `${c.percentage}%` : '-'}
                                        </td>
                                        <td style={{ padding: '12px 14px', color: '#475569', fontSize: '12px' }}>
                                          {c.feedback && (
                                            <div style={{ fontStyle: 'italic', marginBottom: c.is_corrected ? '4px' : '0' }}>
                                              "{c.feedback}"
                                            </div>
                                          )}
                                          {c.is_corrected && (
                                            <div style={{ color: '#B45309', fontSize: '11px', fontWeight: 600 }}>
                                              Audit notice: Adjusted from {c.old_score} ({c.correction_reason || 'Score revised'})
                                            </div>
                                          )}
                                          {!c.feedback && !c.is_corrected && <span style={{ color: '#94A3B8' }}>&mdash;</span>}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: TERM SUMMARY (MASTER PROMPT 6.2) */}
          {/* ========================================================================= */}
          {activeTab === 'summary' && (
            <div>
              {/* FILTERS BAR */}
              <div className="results-no-print" style={{
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {/* Academic Year Selector */}
                  {academicYears.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label htmlFor="summaryYearSelect" style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                        Academic Year:
                      </label>
                      <select
                        id="summaryYearSelect"
                        value={selectedYearId || ''}
                        onChange={(e) => setSelectedYearId(Number(e.target.value))}
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
                        {academicYears.map((y) => (
                          <option key={y.id} value={y.id}>
                            {y.name} {y.is_current ? '(Current)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Term Selector */}
                  {terms.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <label htmlFor="summaryTermSelect" style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                        Term:
                      </label>
                      <select
                        id="summaryTermSelect"
                        value={selectedTermId || ''}
                        onChange={(e) => setSelectedTermId(Number(e.target.value))}
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
                        {terms.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} {t.is_current ? '(Current)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handlePrintSlip}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#1E293B',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <span>🖨️</span>
                  <span>Print Certified Grade Slip</span>
                </button>
              </div>

              {/* SUMMARY HERO CARDS GRID */}
              {summaryData && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '16px',
                  marginBottom: '24px'
                }}>
                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Term Average</div>
                    <div style={{ fontSize: '28px', fontWeight: 900, color: '#1F3A5F', marginTop: '4px' }}>
                      {summaryData.termAverage.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '12px', color: '#10B981', marginTop: '2px', fontWeight: 600 }}>
                      {summaryData.passedSubjects} of {summaryData.totalSubjects} Passed
                    </div>
                  </div>

                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Annual Average</div>
                    <div style={{ fontSize: '28px', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>
                      {summaryData.annualAverage.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                      Across published terms
                    </div>
                  </div>

                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Section Rank</div>
                    <div style={{ fontSize: '28px', fontWeight: 900, color: '#D97706', marginTop: '4px' }}>
                      #{summaryData.rank} <span style={{ fontSize: '16px', color: '#94A3B8', fontWeight: 600 }}>/ {summaryData.classSize}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#D97706', marginTop: '2px', fontWeight: 600 }}>
                      1224 Standard Rank
                    </div>
                  </div>

                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Attendance Rate</div>
                    <div style={{ fontSize: '28px', fontWeight: 900, color: summaryData.attendanceRate >= 85 ? '#15803D' : '#DC2626', marginTop: '4px' }}>
                      {summaryData.attendanceRate.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                      Active semester audit
                    </div>
                  </div>

                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Official Term GPA</div>
                    <div style={{ fontSize: '28px', fontWeight: 900, color: '#2563EB', marginTop: '4px' }}>
                      {summaryData.termGpa.toFixed(2)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#2563EB', marginTop: '2px', fontWeight: 700 }}>
                      {summaryData.standing}
                    </div>
                  </div>
                </div>
              )}

              {/* REPORT SLIP TABLE */}
              {!summaryData || summaryData.results.length === 0 ? (
                <StudentEmptyState
                  icon="📜"
                  title="No Published Report Slip"
                  description="Official term results for this academic period have not been published by the registrar yet."
                />
              ) : (
                <div style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#F8FAFC'
                  }}>
                    <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '15px' }}>
                      Official Term Grade Report Slip &mdash; {terms.find((t) => t.id === selectedTermId)?.name || 'Semester 1'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>
                      Certified By: Registrar &amp; Examination Committee
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', color: '#475569', fontSize: '12px', textTransform: 'uppercase' }}>
                          <th style={{ padding: '12px 16px', fontWeight: 700 }}>Code</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700 }}>Subject Name</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Credits</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Total Score</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Grade</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Points</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Class Rank</th>
                          <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>Pass / Fail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryData.results.map((row) => {
                          const gradeStyle = getGradeColor(row.letter_grade);
                          return (
                            <tr key={row.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                              <td style={{ padding: '14px 16px', fontWeight: 700, color: '#1F3A5F' }}>
                                {row.subject_code}
                              </td>
                              <td style={{ padding: '14px 16px' }}>
                                <div style={{ fontWeight: 600, color: '#1E293B' }}>{row.subject_name}</div>
                                {row.subject_name_am && (
                                  <div style={{ fontSize: '12px', color: '#64748B' }}>{row.subject_name_am}</div>
                                )}
                              </td>
                              <td style={{ padding: '14px 16px', textAlign: 'center', color: '#64748B' }}>
                                {row.credit_hours || 3}
                              </td>
                              <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, fontSize: '16px', color: '#1E293B' }}>
                                {row.total_score}
                              </td>
                              <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-block',
                                  width: '32px',
                                  height: '32px',
                                  lineHeight: '32px',
                                  borderRadius: '50%',
                                  background: gradeStyle.bg,
                                  color: gradeStyle.text,
                                  border: `1px solid ${gradeStyle.border}`,
                                  fontWeight: 800,
                                  fontSize: '14px',
                                  textAlign: 'center'
                                }}>
                                  {row.letter_grade}
                                </span>
                              </td>
                              <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>
                                {Number(row.grade_points).toFixed(2)}
                              </td>
                              <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: '#1E40AF' }}>
                                {row.subject_rank ? `#${row.subject_rank}` : '-'}
                              </td>
                              <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                {row.is_pass ? (
                                  <span style={{ background: '#DCFCE7', color: '#166534', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>
                                    PASS
                                  </span>
                                ) : (
                                  <span style={{ background: '#FEE2E2', color: '#991B1B', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 700 }}>
                                    FAIL
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{
                    padding: '16px 20px',
                    background: '#F8FAFC',
                    borderTop: '1px solid #E2E8F0',
                    fontSize: '12px',
                    color: '#64748B'
                  }}>
                    ℹ️ Standard secondary school grading policy: A (4.0), B (3.0), C (2.0), D (1.0), F (0.0). Results have been validated and approved for official publication.
                  </div>
                </div>
              )}

              {/* PRINT SIGNATURE FOOTER */}
              <div className="results-print-footer">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '36px' }}>
                  <div style={{ textAlign: 'center', width: '220px' }}>
                    <div style={{ borderBottom: '1px solid #000000', height: '40px' }} />
                    <div style={{ fontSize: '12px', marginTop: '6px', fontWeight: 700 }}>Homeroom Teacher Signature</div>
                  </div>
                  <div style={{ textAlign: 'center', width: '220px' }}>
                    <div style={{ borderBottom: '1px solid #000000', height: '40px' }} />
                    <div style={{ fontSize: '12px', marginTop: '6px', fontWeight: 700 }}>School Principal / Registrar</div>
                  </div>
                  <div style={{ textAlign: 'center', width: '180px' }}>
                    <div style={{ borderBottom: '1px solid #000000', height: '40px' }} />
                    <div style={{ fontSize: '12px', marginTop: '6px', fontWeight: 700 }}>Official Stamp &amp; Date</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: PROGRESS & TRENDS (MASTER PROMPT 6.3) */}
          {/* ========================================================================= */}
          {activeTab === 'trends' && (
            <div>
              {/* ACADEMIC YEAR FILTER */}
              <div className="results-no-print" style={{
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label htmlFor="trendsYearSelect" style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                    Academic Year:
                  </label>
                  <select
                    id="trendsYearSelect"
                    value={selectedYearId || ''}
                    onChange={(e) => setSelectedYearId(Number(e.target.value))}
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
                    {academicYears.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name} {y.is_current ? '(Current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                  📊 Multi-term longitudinal progress &amp; course trajectories
                </div>
              </div>

              {/* DATA THRESHOLD EXPLANATION NOTICE */}
              {progressData && !progressData.hasSufficientTrendData && progressData.trendDataNotice && (
                <div style={{
                  background: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <span style={{ fontSize: '24px' }}>ℹ️</span>
                  <div style={{ fontSize: '13px', color: '#1E40AF', lineHeight: 1.5 }}>
                    <strong>Longitudinal Analytics Threshold:</strong> {progressData.trendDataNotice}
                  </div>
                </div>
              )}

              {/* TERM PROGRESSION OVERVIEW */}
              {progressData && progressData.termByTerm.length > 0 && (
                <div style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '24px',
                  marginBottom: '20px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                    Term-by-Term Average Progression
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                    {progressData.termByTerm.map((t) => (
                      <div
                        key={t.term_id}
                        style={{
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '10px',
                          padding: '16px 20px'
                        }}
                      >
                        <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                          {t.term_name}
                        </div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: '#1F3A5F', margin: '4px 0' }}>
                          {t.average_score.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: '13px', color: '#2563EB', fontWeight: 700 }}>
                          Term GPA: {t.gpa.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STRONGEST COURSES & SUBJECTS NEEDING ATTENTION */}
              {progressData && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                  {/* STRONGEST COURSES */}
                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    borderLeft: '6px solid #10B981',
                    padding: '20px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#059669', textTransform: 'uppercase', marginBottom: '10px' }}>
                      🌟 Strongest Subjects
                    </div>
                    {progressData.strongestSubjects.length === 0 ? (
                      <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>No course records available.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {progressData.strongestSubjects.map((s: any) => (
                          <div key={s.subject_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong style={{ color: '#1E293B', fontSize: '14px' }}>{s.subject_name}</strong>
                              <span style={{ fontSize: '12px', color: '#64748B', marginLeft: '6px' }}>({s.subject_code})</span>
                            </div>
                            <span style={{ background: '#DCFCE7', color: '#166534', fontWeight: 800, fontSize: '13px', padding: '3px 10px', borderRadius: '8px' }}>
                              {s.latestScore}%
                            </span>
                          </div>
                        ))}
                        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#059669', fontStyle: 'italic' }}>
                          Exemplary mastery shown in these subjects. Maintain consistent revision.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* SUBJECTS NEEDING ATTENTION */}
                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    borderLeft: '6px solid #F59E0B',
                    padding: '20px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#D97706', textTransform: 'uppercase', marginBottom: '10px' }}>
                      🎯 Recommended Focus Subjects
                    </div>
                    {progressData.subjectsNeedingAttention.length === 0 ? (
                      <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>All enrolled subjects meet high distinction criteria!</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {progressData.subjectsNeedingAttention.map((s: any) => (
                          <div key={s.subject_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong style={{ color: '#1E293B', fontSize: '14px' }}>{s.subject_name}</strong>
                              <span style={{ fontSize: '12px', color: '#64748B', marginLeft: '6px' }}>({s.subject_code})</span>
                            </div>
                            <span style={{ background: '#FEF3C7', color: '#92400E', fontWeight: 800, fontSize: '13px', padding: '3px 10px', borderRadius: '8px' }}>
                              {s.latestScore}%
                            </span>
                          </div>
                        ))}
                        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#B45309', fontStyle: 'italic' }}>
                          Target these courses for homework practice and teacher tutorials to elevate your overall semester GPA.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PER-SUBJECT PROGRESSION & ATTENDANCE TRAJECTORY */}
              {progressData && progressData.perSubjectTrend.length > 0 && (
                <div style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '24px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>
                    Per-Subject Score &amp; Performance Trend
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {progressData.perSubjectTrend.map((s) => {
                      const score = s.latestScore;
                      const barColor = score >= 80 ? '#10B981' : score >= 60 ? '#3B82F6' : score >= 50 ? '#F59E0B' : '#EF4444';

                      return (
                        <div key={s.subject_id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 700, color: '#1E293B', fontSize: '14px' }}>
                                {s.subject_name} ({s.subject_code})
                              </span>
                              <span style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: s.trend === 'improving' ? '#DCFCE7' : s.trend === 'declining' ? '#FEE2E2' : '#F1F5F9',
                                color: s.trend === 'improving' ? '#166534' : s.trend === 'declining' ? '#991B1B' : '#475569'
                              }}>
                                {s.trend === 'improving' ? '↗ Improving' : s.trend === 'declining' ? '↘ Needs Focus' : '→ Steady'}
                              </span>
                            </div>

                            <span style={{ fontWeight: 800, color: barColor, fontSize: '14px' }}>
                              {score}%
                            </span>
                          </div>

                          <div style={{ background: '#F1F5F9', borderRadius: '999px', height: '10px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${Math.min(score, 100)}%`,
                                height: '100%',
                                background: barColor,
                                borderRadius: '999px',
                                transition: 'width 0.4s ease'
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
