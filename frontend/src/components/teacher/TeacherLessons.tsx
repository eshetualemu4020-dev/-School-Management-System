import { useState, useEffect, useMemo, type FormEvent, type ChangeEvent } from 'react';
import { api } from '../../api/client';

interface TeacherLessonsProps {
  assignedClasses: any[];
  onShowToast: (msg: string) => void;
}

export type ResourceCategory =
  | 'all'
  | 'lecture_notes'
  | 'worksheet'
  | 'slides'
  | 'lesson_plan'
  | 'lab_manual'
  | 'revision_guide'
  | 'other';

const CATEGORY_LABELS: Record<string, string> = {
  lecture_notes: '📄 Lecture Notes & Handouts',
  worksheet: '📝 Worksheets & Problem Sets',
  slides: '📊 Slide Presentations',
  lesson_plan: '📋 Structured Lesson Plans',
  lab_manual: '🧪 Lab & Practical Guides',
  revision_guide: '🎯 Exam Revision & Prep',
  other: '📚 General Reference Material'
};

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default function TeacherLessons({ assignedClasses, onShowToast }: TeacherLessonsProps) {
  const [resources, setResources] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ResourceCategory>('all');
  const [selectedVisibility, setSelectedVisibility] = useState<'all' | 'section' | 'staff_only'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'link'>('file');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<string>('lecture_notes');
  const [newUnitTopic, setNewUnitTopic] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newVisibility, setNewVisibility] = useState<'section' | 'staff_only'>('section');
  const [newAssignmentId, setNewAssignmentId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    originalName: string;
    mimeType: string;
    dataBase64: string;
    sizeBytes: number;
  } | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Edit Modal State
  const [editingResource, setEditingResource] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('lecture_notes');
  const [editUnitTopic, setEditUnitTopic] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editVisibility, setEditVisibility] = useState<'section' | 'staff_only'>('section');
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchResources = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getLearningResources({
        sectionId: selectedSectionId || undefined,
        subjectId: selectedSubjectId || undefined,
        search: searchQuery.trim() || undefined
      });
      setResources(data || []);
      if (assignedClasses.length > 0 && !newAssignmentId) {
        setNewAssignmentId(assignedClasses[0].teaching_assignment_id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load teaching materials.');
      onShowToast('Error loading materials.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchResources();
  }, [selectedSectionId, selectedSubjectId]);

  // Handle local file selection and convert to Base64
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      alert('Selected file exceeds the maximum allowed size of 25MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setSelectedFile({
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        dataBase64: result,
        sizeBytes: file.size
      });
      if (!newTitle.trim()) {
        const titleFromFilename = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setNewTitle(titleFromFilename);
      }
    };
    reader.onerror = () => {
      alert('Failed to read the file from disk.');
    };
    reader.readAsDataURL(file);
  };

  const handleCreateResource = async (e: FormEvent) => {
    e.preventDefault();
    if (!newAssignmentId) {
      alert('Please select a target class assignment.');
      return;
    }
    if (!newTitle.trim()) {
      alert('Please provide a title for the teaching material.');
      return;
    }

    if (uploadMode === 'file' && !selectedFile) {
      alert('Please select a file to upload from your computer.');
      return;
    }
    if (uploadMode === 'link' && !newUrl.trim()) {
      alert('Please enter a valid external web link (e.g. Google Drive, YouTube, Portal).');
      return;
    }

    // Embed structured category and unit metadata into description
    const formattedDescription = JSON.stringify({
      category: newCategory,
      unitTopic: newUnitTopic.trim(),
      userText: newDescription.trim()
    });

    setIsUploading(true);
    try {
      await api.createLearningResource({
        teachingAssignmentId: newAssignmentId,
        title: newTitle.trim(),
        description: formattedDescription,
        url: uploadMode === 'link' ? newUrl.trim() : undefined,
        file: uploadMode === 'file' && selectedFile ? {
          originalName: selectedFile.originalName,
          mimeType: selectedFile.mimeType,
          dataBase64: selectedFile.dataBase64
        } : undefined,
        visibility: newVisibility
      });

      onShowToast('Teaching material added to library!');
      setShowUploadModal(false);
      setNewTitle('');
      setNewUnitTopic('');
      setNewDescription('');
      setNewUrl('');
      setSelectedFile(null);
      void fetchResources();
    } catch (err: any) {
      alert(`Failed to add resource: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpenEdit = (res: any) => {
    setEditingResource(res);
    setEditTitle(res.title || '');
    setEditVisibility(res.visibility || 'section');
    setEditUrl(res.url || '');

    // Parse category and unit metadata from description if present
    try {
      const parsed = JSON.parse(res.description || '{}');
      if (parsed && typeof parsed === 'object' && parsed.category) {
        setEditCategory(parsed.category || 'lecture_notes');
        setEditUnitTopic(parsed.unitTopic || '');
        setEditDescription(parsed.userText || '');
        return;
      }
    } catch {
      // Plain text description
    }
    setEditCategory('lecture_notes');
    setEditUnitTopic('');
    setEditDescription(res.description || '');
  };

  const handleUpdateResource = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingResource) return;
    if (!editTitle.trim()) {
      alert('Resource title cannot be empty.');
      return;
    }

    const formattedDescription = JSON.stringify({
      category: editCategory,
      unitTopic: editUnitTopic.trim(),
      userText: editDescription.trim()
    });

    setIsUpdating(true);
    try {
      await api.updateLearningResource(editingResource.id, {
        title: editTitle.trim(),
        description: formattedDescription,
        url: editUrl.trim() || undefined,
        visibility: editVisibility
      });

      onShowToast('Material updated successfully!');
      setEditingResource(null);
      void fetchResources();
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteResource = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this teaching material? This will permanently remove the record and any uploaded files.')) {
      return;
    }
    try {
      await api.deleteLearningResource(id);
      onShowToast('Material deleted from library.');
      void fetchResources();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  // Helper to parse description metadata
  const parseResourceMeta = (res: any) => {
    try {
      const parsed = JSON.parse(res.description || '{}');
      if (parsed && typeof parsed === 'object' && parsed.category) {
        return {
          category: parsed.category || 'other',
          unitTopic: parsed.unitTopic || '',
          cleanDescription: parsed.userText || ''
        };
      }
    } catch {
      // Fallback
    }
    return {
      category: 'other',
      unitTopic: '',
      cleanDescription: res.description || ''
    };
  };

  // KPI Calculations
  const kpiData = useMemo(() => {
    const totalCount = resources.length;
    const filesCount = resources.filter((r) => r.document_id).length;
    const linksCount = resources.filter((r) => r.url).length;
    const studentAccessible = resources.filter((r) => r.visibility === 'section').length;
    const uniqueSections = new Set(resources.map((r) => r.section_id)).size;
    return { totalCount, filesCount, linksCount, studentAccessible, uniqueSections };
  }, [resources]);

  // Derived filter options
  const uniqueSubjects = useMemo(() => {
    const subjectsMap = new Map<number, string>();
    assignedClasses.forEach((c) => {
      if (c.subject_id) subjectsMap.set(c.subject_id, c.subject_name);
    });
    return Array.from(subjectsMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [assignedClasses]);

  // Filtered resources
  const filteredResources = useMemo(() => {
    return resources.filter((r) => {
      const meta = parseResourceMeta(r);

      const matchesCategory = selectedCategory === 'all' || meta.category === selectedCategory;
      const matchesVisibility = selectedVisibility === 'all' || r.visibility === selectedVisibility;
      const matchesSearch =
        !searchQuery.trim() ||
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        meta.cleanDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
        meta.unitTopic.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.file_name && r.file_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.subject_name && r.subject_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.section_name && r.section_name.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesCategory && matchesVisibility && matchesSearch;
    });
  }, [resources, selectedCategory, selectedVisibility, searchQuery]);

  return (
    <div>
      {/* 1. PAGE HEADER */}
      <div className="page-header-row">
        <div>
          <div className="page-breadcrumb">
            <span>Teacher Portal</span> / <span>Academics</span> / <span>Lessons &amp; Teaching Materials</span>
          </div>
          <h2 className="page-title">Lessons &amp; Teaching Materials Library</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setSelectedFile(null);
              setNewTitle('');
              setNewDescription('');
              setNewUnitTopic('');
              setNewUrl('');
              setShowUploadModal(true);
            }}
          >
            + Upload / Add Teaching Material
          </button>
        </div>
      </div>

      {/* 2. KPI METRICS OVERVIEW */}
      <div className="report-kpi-grid" style={{ marginBottom: '20px' }}>
        <div className="report-kpi-card">
          <div className="kpi-title">Total Library Items</div>
          <div className="kpi-value">{kpiData.totalCount}</div>
          <div className="kpi-subtitle">Active handouts &amp; references</div>
        </div>
        <div className="report-kpi-card">
          <div className="kpi-title">Uploaded Files</div>
          <div className="kpi-value" style={{ color: '#2563EB' }}>{kpiData.filesCount}</div>
          <div className="kpi-subtitle">PDFs, Word docs &amp; presentations</div>
        </div>
        <div className="report-kpi-card">
          <div className="kpi-title">Digital Links</div>
          <div className="kpi-value" style={{ color: '#059669' }}>{kpiData.linksCount}</div>
          <div className="kpi-subtitle">Web, video &amp; drive portals</div>
        </div>
        <div className="report-kpi-card">
          <div className="kpi-title">Student Accessible</div>
          <div className="kpi-value" style={{ color: '#16A34A' }}>{kpiData.studentAccessible}</div>
          <div className="kpi-subtitle">Shared directly with classes</div>
        </div>
      </div>

      {/* 3. MULTI-LEVEL FILTER & SEARCH TOOLBAR */}
      <div className="filter-toolbar-card" style={{ marginBottom: '24px', padding: '16px 20px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'end' }}>
          
          {/* Keyword Search */}
          <div>
            <label className="filter-label" htmlFor="resSearchInput">Search Materials:</label>
            <input
              id="resSearchInput"
              type="text"
              className="input-field"
              placeholder="Search by topic, title, keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%', fontSize: '13px', padding: '8px 12px' }}
            />
          </div>

          {/* Filter by Section */}
          <div>
            <label className="filter-label" htmlFor="lessonsSectionSelect">Target Section:</label>
            <select
              id="lessonsSectionSelect"
              className="form-select"
              value={selectedSectionId || ''}
              onChange={(e) => setSelectedSectionId(e.target.value ? Number(e.target.value) : null)}
              style={{ width: '100%', fontSize: '13px' }}
            >
              <option value="">All Assigned Sections</option>
              {assignedClasses.map((c) => (
                <option key={`${c.section_id}-${c.subject_id}`} value={c.section_id}>
                  {c.section_name} — {c.subject_name} ({c.grade_name})
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Subject */}
          {uniqueSubjects.length > 1 && (
            <div>
              <label className="filter-label" htmlFor="lessonsSubjectSelect">Target Subject:</label>
              <select
                id="lessonsSubjectSelect"
                className="form-select"
                value={selectedSubjectId || ''}
                onChange={(e) => setSelectedSubjectId(e.target.value ? Number(e.target.value) : null)}
                style={{ width: '100%', fontSize: '13px' }}
              >
                <option value="">All Subjects</option>
                {uniqueSubjects.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Filter by Category */}
          <div>
            <label className="filter-label" htmlFor="lessonsCategorySelect">Material Type:</label>
            <select
              id="lessonsCategorySelect"
              className="form-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as ResourceCategory)}
              style={{ width: '100%', fontSize: '13px' }}
            >
              <option value="all">All Document Types</option>
              <option value="lecture_notes">📄 Lecture Notes</option>
              <option value="worksheet">📝 Worksheets &amp; Exercises</option>
              <option value="slides">📊 Slide Presentations</option>
              <option value="lesson_plan">📋 Structured Lesson Plans</option>
              <option value="lab_manual">🧪 Lab Manuals</option>
              <option value="revision_guide">🎯 Exam Revision</option>
              <option value="other">📚 General Resources</option>
            </select>
          </div>

          {/* Filter by Visibility */}
          <div>
            <label className="filter-label" htmlFor="lessonsVisibilitySelect">Audience:</label>
            <select
              id="lessonsVisibilitySelect"
              className="form-select"
              value={selectedVisibility}
              onChange={(e) => setSelectedVisibility(e.target.value as any)}
              style={{ width: '100%', fontSize: '13px' }}
            >
              <option value="all">All Audiences</option>
              <option value="section">Student Accessible</option>
              <option value="staff_only">Staff Only</option>
            </select>
          </div>

        </div>
      </div>

      {/* 4. MATERIALS CONTENT GRID */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
          <div className="spinner" style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '32px', height: '32px' }}></div>
          <p style={{ fontWeight: 600 }}>Loading materials library from server...</p>
        </div>
      ) : error ? (
        <div className="alert-banner alert-danger">
          <span>⚠️ {error}</span>
        </div>
      ) : filteredResources.length === 0 ? (
        <div style={{ background: '#FFFFFF', padding: '50px 20px', borderRadius: '12px', textAlign: 'center', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>📚</div>
          <h3 style={{ color: '#1F3A5F', marginBottom: '8px' }}>No Teaching Materials Found</h3>
          <p style={{ color: '#64748B', maxWidth: '440px', margin: '0 auto 20px', fontSize: '13px', lineHeight: 1.5 }}>
            {searchQuery || selectedCategory !== 'all' || selectedSectionId
              ? 'No teaching materials match your active filter criteria. Try adjusting your search query.'
              : 'Upload syllabus notes, handouts, worksheets, or lesson plans for your assigned classes.'}
          </p>
          <button type="button" className="btn-primary" onClick={() => setShowUploadModal(true)}>
            + Add First Material
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {filteredResources.map((res) => {
            const meta = parseResourceMeta(res);
            const isFile = Boolean(res.document_id);

            return (
              <div
                key={res.id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                }}
              >
                <div>
                  {/* Top Header: Category Tag & Audience Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, background: '#F1F5F9', color: '#334155', padding: '3px 8px', borderRadius: '6px' }}>
                      {CATEGORY_LABELS[meta.category] || '📚 Teaching Material'}
                    </span>
                    <span className={`badge-solid ${res.visibility === 'staff_only' ? 'badge-amber' : 'badge-emerald'}`} style={{ fontSize: '10px' }}>
                      {res.visibility === 'staff_only' ? 'STAFF ONLY' : 'STUDENT ACCESSIBLE'}
                    </span>
                  </div>

                  {/* Resource Title */}
                  <h4 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: '#1F3A5F', lineHeight: 1.35 }}>
                    {res.title}
                  </h4>

                  {/* Subject, Grade & Section */}
                  <div style={{ fontSize: '12px', color: '#2563EB', fontWeight: 600, marginBottom: '8px' }}>
                    {res.subject_name} &bull; Section {res.section_name} {res.grade_name ? `(${res.grade_name})` : ''}
                  </div>

                  {/* Unit / Topic Tag if specified */}
                  {meta.unitTopic && (
                    <div style={{ display: 'inline-block', fontSize: '11px', color: '#0F766E', background: '#CCFBF1', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, marginBottom: '10px' }}>
                      📌 {meta.unitTopic}
                    </div>
                  )}

                  {/* Description */}
                  {meta.cleanDescription && (
                    <p style={{ fontSize: '13px', color: '#64748B', margin: '0 0 14px', lineHeight: 1.45, maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {meta.cleanDescription}
                    </p>
                  )}

                  {/* Attached File Badge / Info */}
                  {isFile ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '14px' }}>
                      <span style={{ fontSize: '18px' }}>📎</span>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {res.file_name || 'Uploaded Document'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748B' }}>
                          {formatBytes(res.file_size_bytes)} &bull; {res.file_mime_type?.split('/')[1]?.toUpperCase() || 'DOCUMENT'}
                        </div>
                      </div>
                    </div>
                  ) : res.url ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '14px' }}>
                      <span style={{ fontSize: '18px' }}>🔗</span>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#2563EB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {res.url}
                        </div>
                        <div style={{ fontSize: '10px', color: '#64748B' }}>
                          External Web Resource
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Card Footer Actions */}
                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                    {new Date(res.created_at).toLocaleDateString()}
                  </span>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    {isFile ? (
                      <a
                        href={api.getLearningResourceDownloadUrl(res.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary btn-sm"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        📥 Open / Download
                      </a>
                    ) : res.url ? (
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary btn-sm"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        🔗 Open Link &rarr;
                      </a>
                    ) : null}

                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => handleOpenEdit(res)}
                      title="Edit material details"
                    >
                      ✏️ Edit
                    </button>

                    <button
                      type="button"
                      className="btn-danger btn-sm"
                      onClick={() => handleDeleteResource(res.id)}
                      title="Delete material"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. MODAL: UPLOAD / ADD MATERIAL */}
      {showUploadModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '580px', width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800, color: '#1F3A5F' }}>
              Add Teaching Material to Library
            </h3>

            {/* Upload Method Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', borderBottom: '2px solid #F1F5F9' }}>
              <button
                type="button"
                onClick={() => setUploadMode('file')}
                style={{
                  padding: '8px 14px',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: uploadMode === 'file' ? '2px solid #2563EB' : '2px solid transparent',
                  color: uploadMode === 'file' ? '#2563EB' : '#64748B',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  marginBottom: '-2px'
                }}
              >
                📁 Local File Upload (PDF, Slides, Docs)
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('link')}
                style={{
                  padding: '8px 14px',
                  border: 'none',
                  background: 'transparent',
                  borderBottom: uploadMode === 'link' ? '2px solid #2563EB' : '2px solid transparent',
                  color: uploadMode === 'link' ? '#2563EB' : '#64748B',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  marginBottom: '-2px'
                }}
              >
                🔗 External Educational Web Link
              </button>
            </div>

            <form onSubmit={handleCreateResource} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Target Class & Subject */}
              <div>
                <label className="input-label" htmlFor="resAssignmentSelect">Target Class &amp; Subject Assignment *</label>
                <select
                  id="resAssignmentSelect"
                  className="form-select"
                  value={newAssignmentId || ''}
                  onChange={(e) => setNewAssignmentId(Number(e.target.value))}
                  required
                >
                  {assignedClasses.map((c) => (
                    <option key={c.teaching_assignment_id} value={c.teaching_assignment_id}>
                      {c.section_name} — {c.subject_name} ({c.grade_name})
                    </option>
                  ))}
                </select>
              </div>

              {/* Material Type / Category */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="input-label" htmlFor="resCategorySelect">Document Type *</label>
                  <select
                    id="resCategorySelect"
                    className="form-select"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    required
                  >
                    <option value="lecture_notes">📄 Lecture Notes</option>
                    <option value="worksheet">📝 Worksheet / Exercise</option>
                    <option value="slides">📊 Slide Presentation</option>
                    <option value="lesson_plan">📋 Structured Lesson Plan</option>
                    <option value="lab_manual">🧪 Lab &amp; Practical Guide</option>
                    <option value="revision_guide">🎯 Exam Revision Guide</option>
                    <option value="other">📚 General Reference</option>
                  </select>
                </div>

                <div>
                  <label className="input-label" htmlFor="resUnitInput">Curriculum Unit / Chapter (Optional)</label>
                  <input
                    id="resUnitInput"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Unit 2: Mechanics &amp; Motion"
                    value={newUnitTopic}
                    onChange={(e) => setNewUnitTopic(e.target.value)}
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="input-label" htmlFor="resTitleInput">Resource Title *</label>
                <input
                  id="resTitleInput"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Newton's Laws Problem Set &amp; Formulas"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              {/* FILE UPLOAD MODE */}
              {uploadMode === 'file' ? (
                <div>
                  <label className="input-label" htmlFor="resFileInput">Select File from Computer (PDF, Word, PPTX, Images up to 25MB) *</label>
                  <input
                    id="resFileInput"
                    type="file"
                    className="form-input"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    required
                  />
                  {selectedFile && (
                    <div style={{ marginTop: '6px', fontSize: '12px', color: '#16A34A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>✓ Ready to upload:</span>
                      <strong>{selectedFile.originalName}</strong>
                      <span>({formatBytes(selectedFile.sizeBytes)})</span>
                    </div>
                  )}
                </div>
              ) : (
                /* WEB LINK MODE */
                <div>
                  <label className="input-label" htmlFor="resUrlInput">Digital Web Link (Google Drive, YouTube, Educational URL) *</label>
                  <input
                    id="resUrlInput"
                    type="url"
                    className="form-input"
                    placeholder="https://drive.google.com/... or https://youtu.be/..."
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* Description */}
              <div>
                <label className="input-label" htmlFor="resDescInput">Pedagogical Description &amp; Instructions</label>
                <textarea
                  id="resDescInput"
                  className="form-input"
                  rows={2}
                  placeholder="Describe what students or faculty should focus on in this material..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>

              {/* Audience Visibility */}
              <div>
                <label className="input-label" htmlFor="resVisibilitySelect">Audience Access *</label>
                <select
                  id="resVisibilitySelect"
                  className="form-select"
                  value={newVisibility}
                  onChange={(e) => setNewVisibility(e.target.value as any)}
                >
                  <option value="section">Section Students &amp; Faculty (Accessible to enrolled learners)</option>
                  <option value="staff_only">Staff Only (Teaching notes &amp; internal faculty material)</option>
                </select>
              </div>

              {/* Submit / Cancel Buttons */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isUploading}>
                  {isUploading ? 'Uploading & Processing...' : 'Save to Library'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: EDIT MATERIAL */}
      {editingResource && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '540px', width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800, color: '#1F3A5F' }}>
              Edit Teaching Material
            </h3>
            <form onSubmit={handleUpdateResource} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div>
                <label className="input-label" htmlFor="editTitleInput">Resource Title *</label>
                <input
                  id="editTitleInput"
                  type="text"
                  className="form-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="input-label" htmlFor="editCategorySelect">Document Type</label>
                  <select
                    id="editCategorySelect"
                    className="form-select"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                  >
                    <option value="lecture_notes">📄 Lecture Notes</option>
                    <option value="worksheet">📝 Worksheet / Exercise</option>
                    <option value="slides">📊 Slide Presentation</option>
                    <option value="lesson_plan">📋 Structured Lesson Plan</option>
                    <option value="lab_manual">🧪 Lab &amp; Practical Guide</option>
                    <option value="revision_guide">🎯 Exam Revision Guide</option>
                    <option value="other">📚 General Reference</option>
                  </select>
                </div>

                <div>
                  <label className="input-label" htmlFor="editUnitInput">Curriculum Unit / Chapter</label>
                  <input
                    id="editUnitInput"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Unit 3"
                    value={editUnitTopic}
                    onChange={(e) => setEditUnitTopic(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="input-label" htmlFor="editDescInput">Description / Chapter Notes</label>
                <textarea
                  id="editDescInput"
                  className="form-input"
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>

              {editingResource.url && (
                <div>
                  <label className="input-label" htmlFor="editUrlInput">External Web Link</label>
                  <input
                    id="editUrlInput"
                    type="url"
                    className="form-input"
                    value={editUrl}
                    onChange={(e) => setEditUrl(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="input-label" htmlFor="editVisibilitySelect">Audience Access</label>
                <select
                  id="editVisibilitySelect"
                  className="form-select"
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value as any)}
                >
                  <option value="section">Section Students &amp; Faculty (Accessible to enrolled learners)</option>
                  <option value="staff_only">Staff Only (Teaching notes &amp; internal faculty material)</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingResource(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isUpdating}>
                  {isUpdating ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
