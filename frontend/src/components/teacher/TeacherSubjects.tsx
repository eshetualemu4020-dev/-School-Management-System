import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client';

interface TeacherSubjectsProps {
  onShowToast: (msg: string) => void;
  onNavigate?: (tab: string, params?: any) => void;
}

interface SyllabusTopic {
  id: string;
  title: string;
  status: 'planned' | 'in_progress' | 'completed';
  completedAt?: string | null;
}

interface SyllabusUnit {
  id: string;
  unitNumber: number;
  title: string;
  topics: SyllabusTopic[];
}

export default function TeacherSubjects({ onShowToast, onNavigate }: TeacherSubjectsProps) {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<any | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');

  // Detail panel active tab
  const [detailTab, setDetailTab] = useState<'syllabus' | 'students' | 'actions'>('syllabus');

  // Enrolled learners state
  const [sectionStudents, setSectionStudents] = useState<any[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(false);
  const [studentSearch, setStudentSearch] = useState('');

  // Syllabus state
  const [syllabusUnits, setSyllabusUnits] = useState<SyllabusUnit[]>([]);
  const [teacherNotes, setTeacherNotes] = useState<string>('');
  const [notesSaved, setNotesSaved] = useState<boolean>(false);

  // New topic form modal
  const [showAddTopicModal, setShowAddTopicModal] = useState<boolean>(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [newTopicTitle, setNewTopicTitle] = useState('');

  const fetchSubjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getSubjectsDetailed();
      setSubjects(data || []);
      if (data && data.length > 0) {
        setSelectedSubject((prev: any) => {
          if (!prev) return data[0];
          const exists = data.find((s: any) => s.subject_id === prev.subject_id && s.section_id === prev.section_id);
          return exists || data[0];
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load assigned subjects from database.');
      onShowToast('Error loading subjects.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchSubjects();
  }, []);

  // Generate or load curriculum units when selectedSubject changes
  useEffect(() => {
    if (!selectedSubject) {
      setSyllabusUnits([]);
      setTeacherNotes('');
      return;
    }

    const storageKey = `hspsms_curriculum_progress_${selectedSubject.subject_id}_${selectedSubject.section_id}`;
    const notesKey = `hspsms_curriculum_notes_${selectedSubject.subject_id}_${selectedSubject.section_id}`;

    const savedUnits = localStorage.getItem(storageKey);
    const savedNotes = localStorage.getItem(notesKey) || '';
    setTeacherNotes(savedNotes);

    if (savedUnits) {
      try {
        setSyllabusUnits(JSON.parse(savedUnits));
        return;
      } catch {
        // Fall back to template
      }
    }

    // Generate standard default curriculum units tailored to the subject
    const subjectName = selectedSubject.subject_name || 'Subject';
    const defaultUnits: SyllabusUnit[] = [
      {
        id: 'unit-1',
        unitNumber: 1,
        title: `Introduction & Foundational Principles of ${subjectName}`,
        topics: [
          { id: 't-1-1', title: 'Course Overview, Objectives & Academic Guidelines', status: 'completed', completedAt: '2026-09-20' },
          { id: 't-1-2', title: 'Fundamental Definitions, Theories & Methodologies', status: 'completed', completedAt: '2026-10-02' },
          { id: 't-1-3', title: 'Core Vocabulary, Historical Context & Principles', status: 'in_progress' }
        ]
      },
      {
        id: 'unit-2',
        unitNumber: 2,
        title: 'Theoretical Models & Analytical Concepts',
        topics: [
          { id: 't-2-1', title: 'In-Depth Exploration of Core Structural Concepts', status: 'in_progress' },
          { id: 't-2-2', title: 'Quantitative / Qualitative Problem-Solving Techniques', status: 'planned' },
          { id: 't-2-3', title: 'Practical Demonstrations, Experiments & Analysis', status: 'planned' }
        ]
      },
      {
        id: 'unit-3',
        unitNumber: 3,
        title: 'Applied Studies, Exercises & Real-World Synthesis',
        topics: [
          { id: 't-3-1', title: 'Integrated Case Studies & Laboratory / Workshop Modules', status: 'planned' },
          { id: 't-3-2', title: 'Mid-Term Assessment Review & Formative Checkpoint', status: 'planned' },
          { id: 't-3-3', title: 'Collaborative Group Projects & Problem Sets', status: 'planned' }
        ]
      },
      {
        id: 'unit-4',
        unitNumber: 4,
        title: 'Advanced Synthesis, Examination Prep & Mastery',
        topics: [
          { id: 't-4-1', title: 'Comprehensive Curriculum Synthesis & Cross-Topic Review', status: 'planned' },
          { id: 't-4-2', title: 'Summative Assessment & Final Academic Evaluation', status: 'planned' }
        ]
      }
    ];

    setSyllabusUnits(defaultUnits);
    localStorage.setItem(storageKey, JSON.stringify(defaultUnits));
  }, [selectedSubject]);

  // Load enrolled students when students tab is activated or selected subject changes
  useEffect(() => {
    if (!selectedSubject || detailTab !== 'students') return;

    let isMounted = true;
    setIsLoadingStudents(true);

    api.getSectionStudents(selectedSubject.section_id)
      .then((students) => {
        if (isMounted) {
          setSectionStudents(students || []);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSectionStudents([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingStudents(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedSubject, detailTab]);

  // Save syllabus changes to localStorage
  const saveSyllabusUnits = (newUnits: SyllabusUnit[]) => {
    setSyllabusUnits(newUnits);
    if (selectedSubject) {
      const storageKey = `hspsms_curriculum_progress_${selectedSubject.subject_id}_${selectedSubject.section_id}`;
      localStorage.setItem(storageKey, JSON.stringify(newUnits));
    }
  };

  // Toggle topic status: planned -> in_progress -> completed -> planned
  const handleToggleTopicStatus = (unitId: string, topicId: string) => {
    const updated = syllabusUnits.map((unit) => {
      if (unit.id !== unitId) return unit;
      return {
        ...unit,
        topics: unit.topics.map((t) => {
          if (t.id !== topicId) return t;
          let nextStatus: 'planned' | 'in_progress' | 'completed' = 'in_progress';
          let completedAt = t.completedAt;
          if (t.status === 'planned') {
            nextStatus = 'in_progress';
            completedAt = null;
          } else if (t.status === 'in_progress') {
            nextStatus = 'completed';
            completedAt = new Date().toISOString().split('T')[0];
          } else {
            nextStatus = 'planned';
            completedAt = null;
          }
          return { ...t, status: nextStatus, completedAt };
        })
      };
    });
    saveSyllabusUnits(updated);
    onShowToast('Topic status updated.');
  };

  // Add custom topic to a unit
  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicTitle.trim() || !selectedUnitId) return;

    const newTopic: SyllabusTopic = {
      id: `topic-${Date.now()}`,
      title: newTopicTitle.trim(),
      status: 'planned'
    };

    const updated = syllabusUnits.map((u) => {
      if (u.id === selectedUnitId) {
        return { ...u, topics: [...u.topics, newTopic] };
      }
      return u;
    });

    saveSyllabusUnits(updated);
    setNewTopicTitle('');
    setShowAddTopicModal(false);
    onShowToast('New syllabus topic added.');
  };

  // Save teacher remarks
  const handleSaveNotes = () => {
    if (selectedSubject) {
      const notesKey = `hspsms_curriculum_notes_${selectedSubject.subject_id}_${selectedSubject.section_id}`;
      localStorage.setItem(notesKey, teacherNotes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
      onShowToast('Subject teaching notes saved.');
    }
  };

  // Calculations for KPI cards & progress
  const kpiData = useMemo(() => {
    const totalPeriods = subjects.reduce((sum, s) => sum + (Number(s.periods_per_week) || 4), 0);
    const totalStudents = subjects.reduce((sum, s) => sum + (Number(s.student_count) || 0), 0);
    const uniqueSubjects = new Set(subjects.map((s) => s.subject_id)).size;
    const uniqueSections = new Set(subjects.map((s) => s.section_id)).size;
    return { totalPeriods, totalStudents, uniqueSubjects, uniqueSections };
  }, [subjects]);

  const syllabusProgress = useMemo(() => {
    let totalTopics = 0;
    let completedTopics = 0;
    let inProgressTopics = 0;

    syllabusUnits.forEach((unit) => {
      unit.topics.forEach((t) => {
        totalTopics += 1;
        if (t.status === 'completed') completedTopics += 1;
        if (t.status === 'in_progress') inProgressTopics += 1;
      });
    });

    const percent = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
    return { totalTopics, completedTopics, inProgressTopics, percent };
  }, [syllabusUnits]);

  // Filtered subjects
  const filteredSubjects = useMemo(() => {
    return subjects.filter((s) => {
      const matchSearch =
        !searchQuery ||
        s.subject_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.subject_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.section_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.grade_name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchGrade = gradeFilter === 'all' || String(s.grade_level) === gradeFilter;

      return matchSearch && matchGrade;
    });
  }, [subjects, searchQuery, gradeFilter]);

  // Filtered section students
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return sectionStudents;
    const q = studentSearch.toLowerCase();
    return sectionStudents.filter((st) => {
      const fullName = `${st.first_name || ''} ${st.father_name || ''} ${st.grand_father_name || ''}`.toLowerCase();
      const adm = (st.admission_no || '').toLowerCase();
      return fullName.includes(q) || adm.includes(q);
    });
  }, [sectionStudents, studentSearch]);

  const uniqueGrades = useMemo(() => {
    const grades = new Map<number, string>();
    subjects.forEach((s) => {
      if (s.grade_level) grades.set(s.grade_level, s.grade_name);
    });
    return Array.from(grades.entries()).sort((a, b) => a[0] - b[0]);
  }, [subjects]);

  return (
    <div>
      {/* 1. PAGE HEADER */}
      <div className="page-header-row">
        <div>
          <div className="page-breadcrumb">
            <span>Teacher Portal</span> / <span>Curriculum</span> / <span>My Subjects</span>
          </div>
          <h2 className="page-title">Assigned Teaching Subjects &amp; Syllabus</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" className="btn-secondary" onClick={fetchSubjects}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Data
          </button>
        </div>
      </div>

      {/* 2. KPI METRICS OVERVIEW */}
      <div className="report-kpi-grid" style={{ marginBottom: '24px' }}>
        <div className="report-kpi-card">
          <div className="kpi-title">Assigned Subjects</div>
          <div className="kpi-value">{kpiData.uniqueSubjects}</div>
          <div className="kpi-subtitle">Distinct curriculum courses</div>
        </div>
        <div className="report-kpi-card">
          <div className="kpi-title">Active Sections</div>
          <div className="kpi-value">{kpiData.uniqueSections}</div>
          <div className="kpi-subtitle">Classes taught this term</div>
        </div>
        <div className="report-kpi-card">
          <div className="kpi-title">Weekly Load</div>
          <div className="kpi-value">{kpiData.totalPeriods} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>hrs/wk</span></div>
          <div className="kpi-subtitle">Scheduled periods per week</div>
        </div>
        <div className="report-kpi-card">
          <div className="kpi-title">Enrolled Learners</div>
          <div className="kpi-value" style={{ color: '#2A7F62' }}>{kpiData.totalStudents}</div>
          <div className="kpi-subtitle">Total students across all sections</div>
        </div>
      </div>

      {/* 3. MAIN WORKSPACE */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
          <div className="spinner" style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '32px', height: '32px' }}></div>
          <p style={{ fontWeight: 600 }}>Loading assigned subjects and curriculum from database...</p>
        </div>
      ) : error ? (
        <div className="alert-banner alert-danger">
          <span>⚠️ {error}</span>
        </div>
      ) : subjects.length === 0 ? (
        <div style={{ background: '#FFFFFF', padding: '40px', borderRadius: '12px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
          <h3 style={{ color: '#1F3A5F', marginBottom: '8px' }}>No Subjects Assigned</h3>
          <p style={{ color: '#64748B' }}>You have not been assigned to teach any subjects for the active academic year.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.2fr)', gap: '24px', alignItems: 'start' }}>
          
          {/* LEFT COLUMN: SUBJECTS LIST & FILTERS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: '10px', background: '#FFFFFF', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search subject, section, or grade..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '13px' }}
                />
              </div>
              {uniqueGrades.length > 1 && (
                <select
                  className="form-select"
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  style={{ width: '140px', fontSize: '13px' }}
                >
                  <option value="all">All Grades</option>
                  {uniqueGrades.map(([lvl, name]) => (
                    <option key={lvl} value={String(lvl)}>{name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Subjects Table */}
            <div className="data-table-container" style={{ margin: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <table className="spec-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Subject &amp; Code</th>
                    <th>Class Section</th>
                    <th>Periods</th>
                    <th>Learners</th>
                    <th style={{ textAlign: 'right' }}>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubjects.map((s, idx) => {
                    const isSelected = selectedSubject?.subject_id === s.subject_id && selectedSubject?.section_id === s.section_id;
                    return (
                      <tr
                        key={`${s.subject_id}-${s.section_id}`}
                        style={{
                          background: isSelected ? '#EFF6FF' : undefined,
                          borderLeft: isSelected ? '4px solid #2563EB' : '4px solid transparent',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSelectedSubject(s)}
                      >
                        <td style={{ color: '#64748B', fontWeight: 600 }}>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#1F3A5F', fontSize: '13px' }}>{s.subject_name}</div>
                          <span style={{ fontSize: '11px', color: '#64748B' }}>
                            Code: <strong>{s.subject_code}</strong> {s.name_am ? `• ${s.name_am}` : ''}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '13px' }}>{s.section_name}</div>
                          <span style={{ fontSize: '11px', color: '#64748B' }}>{s.grade_name}</span>
                        </td>
                        <td>
                          <span className="counter-pill counter-present" style={{ padding: '2px 8px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                            {s.periods_per_week || 4} hrs/wk
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: '#2A7F62', fontSize: '13px' }}>
                          {s.student_count}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className={`btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSubject(s);
                            }}
                          >
                            Inspect &rarr;
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredSubjects.length === 0 && (
              <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '10px', textAlign: 'center', border: '1px solid #E2E8F0', color: '#64748B' }}>
                No subjects matching "{searchQuery}".
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: DETAIL WORKSPACE FOR SELECTED SUBJECT */}
          {selectedSubject && (
            <div style={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '14px', padding: '24px', boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)' }}>
              
              {/* Subject Title & Badges */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '16px', marginBottom: '18px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1F3A5F' }}>
                      {selectedSubject.subject_name}
                    </h3>
                    <span className="badge-solid badge-blue" style={{ fontSize: '11px', fontWeight: 700 }}>
                      {selectedSubject.subject_code}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748B' }}>
                    <strong>{selectedSubject.grade_name}</strong> &bull; Section <strong>{selectedSubject.section_name}</strong> &bull; {selectedSubject.periods_per_week || 4} periods/wk
                  </div>
                </div>

                <span style={{ fontSize: '11px', fontWeight: 700, background: '#EFF6FF', color: '#2563EB', padding: '4px 10px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
                  {selectedSubject.is_compulsory ? 'Core Curriculum' : 'Elective'}
                </span>
              </div>

              {/* Sub-Tabs Navigation */}
              <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #F1F5F9', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={() => setDetailTab('syllabus')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: 'transparent',
                    borderBottom: detailTab === 'syllabus' ? '2px solid #2563EB' : '2px solid transparent',
                    color: detailTab === 'syllabus' ? '#2563EB' : '#64748B',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    marginBottom: '-2px'
                  }}
                >
                  📘 Curriculum &amp; Syllabus
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('students')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: 'transparent',
                    borderBottom: detailTab === 'students' ? '2px solid #2563EB' : '2px solid transparent',
                    color: detailTab === 'students' ? '#2563EB' : '#64748B',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    marginBottom: '-2px'
                  }}
                >
                  👥 Enrolled Learners ({selectedSubject.student_count})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('actions')}
                  style={{
                    padding: '8px 14px',
                    border: 'none',
                    background: 'transparent',
                    borderBottom: detailTab === 'actions' ? '2px solid #2563EB' : '2px solid transparent',
                    color: detailTab === 'actions' ? '#2563EB' : '#64748B',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    marginBottom: '-2px'
                  }}
                >
                  ⚡ Quick Actions
                </button>
              </div>

              {/* TAB 1: CURRICULUM & SYLLABUS TRACKER */}
              {detailTab === 'syllabus' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  
                  {/* Progress Header Box */}
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1F3A5F' }}>
                        Curriculum Syllabus Coverage
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#2563EB' }}>
                        {syllabusProgress.percent}% Complete ({syllabusProgress.completedTopics}/{syllabusProgress.totalTopics} Topics)
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: '10px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${syllabusProgress.percent}%`,
                          height: '100%',
                          background: syllabusProgress.percent === 100 ? '#10B981' : '#2563EB',
                          transition: 'width 0.4s ease'
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '11px', color: '#64748B' }}>
                      <span>✅ {syllabusProgress.completedTopics} Completed</span>
                      <span>🔄 {syllabusProgress.inProgressTopics} In Progress</span>
                      <span>⏳ {syllabusProgress.totalTopics - syllabusProgress.completedTopics - syllabusProgress.inProgressTopics} Planned</span>
                    </div>
                  </div>

                  {/* Syllabus Units Accordion / List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
                        Course Units &amp; Learning Objectives
                      </span>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => {
                          if (syllabusUnits.length > 0) {
                            setSelectedUnitId(syllabusUnits[0].id);
                          }
                          setShowAddTopicModal(true);
                        }}
                      >
                        + Add Custom Topic
                      </button>
                    </div>

                    {syllabusUnits.map((unit) => {
                      const completedInUnit = unit.topics.filter((t) => t.status === 'completed').length;
                      const unitPercent = unit.topics.length > 0 ? Math.round((completedInUnit / unit.topics.length) * 100) : 0;

                      return (
                        <div key={unit.id} style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F1F5F9', padding: '10px 14px' }}>
                            <div>
                              <strong style={{ fontSize: '13px', color: '#1F3A5F' }}>
                                Unit {unit.unitNumber}: {unit.title}
                              </strong>
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: unitPercent === 100 ? '#10B981' : '#475569' }}>
                              {completedInUnit}/{unit.topics.length} Done ({unitPercent}%)
                            </span>
                          </div>

                          <div style={{ padding: '8px 12px', background: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {unit.topics.map((topic) => (
                              <div
                                key={topic.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '8px 10px',
                                  background: topic.status === 'completed' ? '#F0FDF4' : topic.status === 'in_progress' ? '#EFF6FF' : '#F8FAFC',
                                  borderRadius: '6px',
                                  border: '1px solid',
                                  borderColor: topic.status === 'completed' ? '#DCFCE7' : topic.status === 'in_progress' ? '#DBEAFE' : '#F1F5F9'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleTopicStatus(unit.id, topic.id)}
                                    title="Click to cycle status: Planned -> In Progress -> Completed"
                                    style={{
                                      width: '22px',
                                      height: '22px',
                                      borderRadius: '50%',
                                      border: topic.status === 'completed' ? '2px solid #10B981' : topic.status === 'in_progress' ? '2px solid #2563EB' : '2px solid #CBD5E1',
                                      background: topic.status === 'completed' ? '#10B981' : topic.status === 'in_progress' ? '#DBEAFE' : '#FFFFFF',
                                      color: topic.status === 'completed' ? '#FFFFFF' : '#2563EB',
                                      display: 'grid',
                                      placeItems: 'center',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      fontWeight: 800,
                                      padding: 0
                                    }}
                                  >
                                    {topic.status === 'completed' ? '✓' : topic.status === 'in_progress' ? '•' : ''}
                                  </button>
                                  <div>
                                    <div style={{ fontSize: '13px', fontWeight: 600, color: topic.status === 'completed' ? '#166534' : '#1E293B' }}>
                                      {topic.title}
                                    </div>
                                    {topic.completedAt && (
                                      <span style={{ fontSize: '10px', color: '#16A34A' }}>
                                        Finished: {topic.completedAt}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleToggleTopicStatus(unit.id, topic.id)}
                                  style={{
                                    border: 'none',
                                    borderRadius: '12px',
                                    padding: '3px 9px',
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: topic.status === 'completed' ? '#DCFCE7' : topic.status === 'in_progress' ? '#DBEAFE' : '#F1F5F9',
                                    color: topic.status === 'completed' ? '#166534' : topic.status === 'in_progress' ? '#1E40AF' : '#64748B'
                                  }}
                                >
                                  {topic.status === 'completed' ? 'Completed' : topic.status === 'in_progress' ? 'In Progress' : 'Planned'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Teacher Teaching Notes */}
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1F3A5F' }}>
                        Teacher's Subject Log &amp; Pedagogical Notes
                      </span>
                      {notesSaved && (
                        <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 700 }}>
                          ✓ Notes Saved
                        </span>
                      )}
                    </div>
                    <textarea
                      className="input-field"
                      rows={3}
                      placeholder="Add reflections, homework reminders, or curriculum pace notes for this section..."
                      value={teacherNotes}
                      onChange={(e) => setTeacherNotes(e.target.value)}
                      style={{ width: '100%', fontSize: '12px', lineHeight: 1.5, resize: 'vertical', marginBottom: '8px' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn-secondary btn-sm" onClick={handleSaveNotes}>
                        Save Subject Notes
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ENROLLED LEARNERS ROSTER */}
              {detailTab === 'students' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <strong style={{ fontSize: '14px', color: '#1F3A5F' }}>
                        Enrolled Class Roster ({filteredStudents.length} Students)
                      </strong>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        Active enrollment in Section {selectedSubject.section_name} ({selectedSubject.grade_name})
                      </div>
                    </div>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Filter student by name / admission..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      style={{ width: '220px', padding: '6px 10px', fontSize: '12px' }}
                    />
                  </div>

                  {isLoadingStudents ? (
                    <div style={{ textAlign: 'center', padding: '40px 10px', color: '#64748B' }}>
                      <div className="spinner" style={{ margin: '0 auto 10px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '24px', height: '24px' }}></div>
                      <p style={{ fontSize: '12px' }}>Loading learners for this section...</p>
                    </div>
                  ) : filteredStudents.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: '#64748B', background: '#F8FAFC', borderRadius: '8px' }}>
                      {studentSearch ? 'No students match your filter.' : 'No active student records found for this section.'}
                    </div>
                  ) : (
                    <div className="data-table-container" style={{ maxHeight: '380px', overflowY: 'auto', margin: 0 }}>
                      <table className="spec-table" style={{ fontSize: '12px' }}>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Adm. No</th>
                            <th>Learner Name</th>
                            <th>Gender</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredStudents.map((st, idx) => {
                            const fullName = `${st.first_name || ''} ${st.father_name || ''} ${st.grand_father_name || ''}`.trim() || 'Student';
                            return (
                              <tr key={st.student_id || st.id || idx}>
                                <td style={{ color: '#64748B' }}>{idx + 1}</td>
                                <td>
                                  <strong style={{ color: '#2563EB' }}>{st.admission_no}</strong>
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600, color: '#1E293B' }}>{fullName}</div>
                                </td>
                                <td>
                                  <span style={{ textTransform: 'capitalize', color: '#475569' }}>
                                    {st.gender || '-'}
                                  </span>
                                </td>
                                <td>
                                  <span className="counter-pill counter-present" style={{ padding: '2px 6px', fontSize: '10px' }}>
                                    {st.status || 'Active'}
                                  </span>
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

              {/* TAB 3: QUICK ACADEMIC ACTIONS */}
              {detailTab === 'actions' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                  
                  {/* Action 1: Attendance */}
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', background: '#F8FAFC' }}>
                    <div style={{ fontSize: '20px', marginBottom: '8px' }}>📋</div>
                    <strong style={{ fontSize: '14px', color: '#1F3A5F', display: 'block', marginBottom: '4px' }}>
                      Class Attendance
                    </strong>
                    <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px', minHeight: '36px' }}>
                      Record daily or period attendance for Section {selectedSubject.section_name}.
                    </p>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      style={{ width: '100%' }}
                      onClick={() => {
                        if (onNavigate) {
                          onNavigate('attendance', { sectionId: selectedSubject.section_id, subjectId: selectedSubject.subject_id });
                        }
                      }}
                    >
                      Record Attendance &rarr;
                    </button>
                  </div>

                  {/* Action 2: Enter Marks */}
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', background: '#F8FAFC' }}>
                    <div style={{ fontSize: '20px', marginBottom: '8px' }}>📝</div>
                    <strong style={{ fontSize: '14px', color: '#1F3A5F', display: 'block', marginBottom: '4px' }}>
                      Mark Entry &amp; Scores
                    </strong>
                    <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px', minHeight: '36px' }}>
                      Input exam, quiz, and project marks for this subject.
                    </p>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      style={{ width: '100%' }}
                      onClick={() => {
                        if (onNavigate) {
                          onNavigate('marks', { sectionId: selectedSubject.section_id, subjectId: selectedSubject.subject_id });
                        }
                      }}
                    >
                      Open Gradebook &rarr;
                    </button>
                  </div>

                  {/* Action 3: Create Assessment */}
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', background: '#F8FAFC' }}>
                    <div style={{ fontSize: '20px', marginBottom: '8px' }}>🎯</div>
                    <strong style={{ fontSize: '14px', color: '#1F3A5F', display: 'block', marginBottom: '4px' }}>
                      Create Assessment
                    </strong>
                    <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px', minHeight: '36px' }}>
                      Create a test, homework, or exam for {selectedSubject.subject_name}.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      style={{ width: '100%' }}
                      onClick={() => {
                        if (onNavigate) {
                          onNavigate('assessments', { openCreateModal: true, sectionId: selectedSubject.section_id });
                        }
                      }}
                    >
                      + New Assessment
                    </button>
                  </div>

                  {/* Action 4: Lesson Notes */}
                  <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', background: '#F8FAFC' }}>
                    <div style={{ fontSize: '20px', marginBottom: '8px' }}>📚</div>
                    <strong style={{ fontSize: '14px', color: '#1F3A5F', display: 'block', marginBottom: '4px' }}>
                      Lesson Materials
                    </strong>
                    <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px', minHeight: '36px' }}>
                      Upload and distribute teaching notes, slide decks, or files.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      style={{ width: '100%' }}
                      onClick={() => {
                        if (onNavigate) {
                          onNavigate('lessons', { sectionId: selectedSubject.section_id });
                        }
                      }}
                    >
                      Manage Lessons &rarr;
                    </button>
                  </div>

                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD CUSTOM SYLLABUS TOPIC */}
      {showAddTopicModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '24px', maxWidth: '440px', width: '92%', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 800, color: '#1F3A5F' }}>
              Add Learning Topic to Syllabus
            </h3>
            <form onSubmit={handleAddTopic} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="input-label" htmlFor="topicUnitSelect">Assign to Unit</label>
                <select
                  id="topicUnitSelect"
                  className="form-select"
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  required
                >
                  {syllabusUnits.map((u) => (
                    <option key={u.id} value={u.id}>Unit {u.unitNumber}: {u.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label" htmlFor="topicTitleInput">Topic / Objective Title</label>
                <input
                  id="topicTitleInput"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Chapter 4: Quadratic Systems &amp; Graphs"
                  value={newTopicTitle}
                  onChange={(e) => setNewTopicTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddTopicModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
