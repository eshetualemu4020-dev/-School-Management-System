import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { api } from '../../api/client';

interface TeacherWelfareProps {
  assignedClasses: any[];
  onShowToast: (msg: string) => void;
  onNavigate?: (tab: string, params?: any) => void;
}

interface DisciplineRecord {
  id: number;
  student_id: number;
  enrollment_id?: number;
  incident_date: string;
  category: string;
  severity: 'minor' | 'moderate' | 'serious';
  description: string;
  action_taken?: string | null;
  created_at: string;
  updated_at?: string;
  admission_no: string;
  student_name: string;
  gender?: string;
  section_id?: number;
  section_name?: string;
  grade_name?: string;
}

// Categories for Disciplinary Infractions
const INFRACTION_CATEGORIES = [
  'Class Disruption & Noise',
  'Late Arrival / Truancy',
  'Incomplete Academic Work / Non-Submission',
  'Disrespect / Non-Compliance with Instructions',
  'Device / Mobile Phone Violation',
  'Peer Bullying / Verbal Conflict',
  'Dress Code & Grooming Non-Compliance',
  'Property Damage / Careless Behavior',
  'Other Disciplinary Observation'
];

// Categories for Commendations / Merits
const COMMENDATION_CATEGORIES = [
  'Positive Commendation / Academic Excellence',
  'Positive Leadership & Role Model',
  'Peer Support & Team Collaboration',
  'Remarkable Behavior Improvement',
  'Outstanding Classroom Etiquette',
  'Community & School Spirit'
];

export default function TeacherWelfare({
  assignedClasses,
  onShowToast,
  onNavigate
}: TeacherWelfareProps) {
  const [records, setRecords] = useState<DisciplineRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'all' | 'infractions' | 'merits' | 'serious'>('all');

  // Filter toolbar state
  const [filterSectionId, setFilterSectionId] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Report Modal State
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [reportType, setReportType] = useState<'infraction' | 'commendation'>('infraction');
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null);
  const [studentsInSelectedSection, setStudentsInSelectedSection] = useState<any[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState<boolean>(false);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [incidentDate, setIncidentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<string>(INFRACTION_CATEGORIES[0]);
  const [severity, setSeverity] = useState<'minor' | 'moderate' | 'serious'>('minor');
  const [description, setDescription] = useState<string>('');
  const [actionTaken, setActionTaken] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Detail Drawer / Modal State
  const [inspectRecord, setInspectRecord] = useState<DisciplineRecord | null>(null);

  // Edit / Update Follow-Up Modal State
  const [editRecord, setEditRecord] = useState<DisciplineRecord | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editSeverity, setEditSeverity] = useState<'minor' | 'moderate' | 'serious'>('minor');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editActionTaken, setEditActionTaken] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Helper to distinguish commendations
  const isCommendation = (cat: string) => {
    const c = (cat || '').toLowerCase();
    return (
      c.includes('commendation') ||
      c.includes('merit') ||
      c.includes('excellence') ||
      c.includes('leadership') ||
      c.includes('improvement') ||
      c.includes('etiquette') ||
      c.includes('spirit') ||
      c.includes('positive')
    );
  };

  // Unique sections from assignedClasses
  const uniqueSections = useMemo(() => {
    const map = new Map<number, { id: number; name: string; gradeName?: string }>();
    assignedClasses.forEach((c) => {
      if (c.section_id && !map.has(c.section_id)) {
        map.set(c.section_id, {
          id: c.section_id,
          name: c.section_name || `Section ${c.section_id}`,
          gradeName: c.grade_name || ''
        });
      }
    });
    return Array.from(map.values());
  }, [assignedClasses]);

  // Fetch discipline records from backend
  const fetchRecords = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getDisciplineRecords();
      setRecords(data || []);

      if (uniqueSections.length > 0 && !selectedSectionId) {
        setSelectedSectionId(uniqueSections[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load welfare records.');
      onShowToast('Error loading welfare records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // When selected section changes for modal, load student roster
  useEffect(() => {
    if (!selectedSectionId) return;
    const loadStudents = async () => {
      setIsLoadingStudents(true);
      try {
        const list = await api.getSectionStudents(selectedSectionId);
        setStudentsInSelectedSection(list || []);
        if (list && list.length > 0) {
          setSelectedStudentId(list[0].student_id);
        } else {
          setSelectedStudentId(null);
        }
      } catch (err: any) {
        console.error('Failed to load students for section:', err);
      } finally {
        setIsLoadingStudents(false);
      }
    };
    loadStudents();
  }, [selectedSectionId]);

  // Switch report type updates categories
  const handleTypeSwitch = (type: 'infraction' | 'commendation') => {
    setReportType(type);
    if (type === 'commendation') {
      setCategory(COMMENDATION_CATEGORIES[0]);
      setSeverity('minor');
    } else {
      setCategory(INFRACTION_CATEGORIES[0]);
      setSeverity('minor');
    }
  };

  // Submit new incident / commendation
  const handleReportSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      alert('Please select a student.');
      return;
    }
    if (!description.trim()) {
      alert('Please provide an incident or observation description.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.reportDisciplineIncident({
        studentId: selectedStudentId,
        incidentDate,
        category,
        severity,
        description: description.trim(),
        actionTaken: actionTaken.trim() || undefined
      });

      onShowToast(
        reportType === 'commendation'
          ? '🌟 Student commendation awarded and logged in official profile!'
          : '🛡️ Disciplinary record registered and sent to student file.'
      );

      setShowReportModal(false);
      setDescription('');
      setActionTaken('');
      setIncidentDate(new Date().toISOString().split('T')[0]);
      await fetchRecords();
    } catch (err: any) {
      alert(`Failed to report incident: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (rec: DisciplineRecord) => {
    setEditRecord(rec);
    setEditDate(rec.incident_date ? rec.incident_date.split('T')[0] : '');
    setEditCategory(rec.category || '');
    setEditSeverity(rec.severity || 'minor');
    setEditDescription(rec.description || '');
    setEditActionTaken(rec.action_taken || '');
  };

  // Handle Update Submit
  const handleUpdateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editRecord) return;
    setIsUpdating(true);
    try {
      await api.updateDisciplineRecord(editRecord.id, {
        incidentDate: editDate,
        category: editCategory,
        severity: editSeverity,
        description: editDescription.trim(),
        actionTaken: editActionTaken.trim() || undefined
      });
      onShowToast('Discipline record updated successfully!');
      setEditRecord(null);
      if (inspectRecord?.id === editRecord.id) {
        setInspectRecord((prev) =>
          prev
            ? {
                ...prev,
                incident_date: editDate,
                category: editCategory,
                severity: editSeverity,
                description: editDescription.trim(),
                action_taken: editActionTaken.trim() || null,
                updated_at: new Date().toISOString()
              }
            : null
        );
      }
      await fetchRecords();
    } catch (err: any) {
      alert(`Failed to update record: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle Delete
  const handleDeleteRecord = async (rec: DisciplineRecord) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete the welfare record for ${rec.student_name}? This action cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await api.deleteDisciplineRecord(rec.id);
      onShowToast('Discipline record removed.');
      if (inspectRecord?.id === rec.id) setInspectRecord(null);
      await fetchRecords();
    } catch (err: any) {
      alert(`Failed to delete record: ${err.message}`);
    }
  };

  // Navigate to contact guardian
  const handleContactGuardian = (rec: DisciplineRecord) => {
    if (onNavigate) {
      onShowToast(`Redirecting to communication portal for ${rec.student_name}...`);
      onNavigate('communication', {
        studentId: rec.student_id,
        studentName: rec.student_name
      });
    } else {
      alert(`Contact parent for ${rec.student_name} (${rec.admission_no}) via the Communication tab.`);
    }
  };

  // Computed metrics
  const metrics = useMemo(() => {
    let commendations = 0;
    let minorWarnings = 0;
    let seriousCases = 0;

    records.forEach((r) => {
      if (isCommendation(r.category)) {
        commendations++;
      } else if (r.severity === 'serious') {
        seriousCases++;
      } else {
        minorWarnings++;
      }
    });

    return {
      total: records.length,
      commendations,
      minorWarnings,
      seriousCases
    };
  }, [records]);

  // Filtered list
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Tab filter
      if (activeTab === 'infractions' && isCommendation(r.category)) return false;
      if (activeTab === 'merits' && !isCommendation(r.category)) return false;
      if (activeTab === 'serious' && r.severity !== 'serious') return false;

      // Section filter
      if (filterSectionId !== 'all' && String(r.section_id) !== filterSectionId) {
        return false;
      }

      // Severity filter
      if (filterSeverity !== 'all' && r.severity !== filterSeverity) {
        return false;
      }

      // Category filter
      if (filterCategory !== 'all' && r.category !== filterCategory) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (r.student_name || '').toLowerCase().includes(q);
        const matchesAdm = (r.admission_no || '').toLowerCase().includes(q);
        const matchesDesc = (r.description || '').toLowerCase().includes(q);
        const matchesAction = (r.action_taken || '').toLowerCase().includes(q);
        const matchesCat = (r.category || '').toLowerCase().includes(q);
        if (!matchesName && !matchesAdm && !matchesDesc && !matchesAction && !matchesCat) {
          return false;
        }
      }

      return true;
    });
  }, [records, activeTab, filterSectionId, filterSeverity, filterCategory, searchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* PAGE HEADER */}
      <div className="page-header-row" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="page-breadcrumb">
            <span>Teacher Portal</span> / <span>Pastoral Care</span> / <span>Student Welfare &amp; Behavior</span>
          </div>
          <h2 className="page-title" style={{ margin: '4px 0 6px' }}>Student Welfare &amp; Behavior Register</h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #64748B)' }}>
            Official pastoral log for tracking behavioral observations, corrective actions, and positive student merits for your learners.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={fetchRecords}
            title="Refresh records from database"
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
            onClick={() => {
              handleTypeSwitch('infraction');
              setShowReportModal(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Log Observation / Commendation
          </button>
        </div>
      </div>

      {/* CONFIDENTIALITY POLICY BANNER */}
      <div
        style={{
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#D97706" style={{ flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <div style={{ fontSize: '13px', color: 'var(--text-primary, #334155)', lineHeight: '1.45' }}>
          <strong>Pastoral Care &amp; Child Protection Protocol:</strong> You are viewing records you personally authored for active learners in your classes. Confidential clinical or administrative counseling files remain strictly restricted to certified pastoral officers to ensure maximum student dignity and compliance.
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
        {/* Total Records */}
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
              Total Logged
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)', marginTop: '2px' }}>
              {metrics.total}
            </div>
          </div>
        </div>

        {/* Positive Commendations */}
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
              background: '#ECFDF5',
              color: '#059669',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px'
            }}
          >
            ⭐
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Merits &amp; Commendations
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#065F46', marginTop: '2px' }}>
              {metrics.commendations}
            </div>
          </div>
        </div>

        {/* Minor / Moderate Guidance */}
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
            ⚠️
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Warnings &amp; Guidance
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#92400E', marginTop: '2px' }}>
              {metrics.minorWarnings}
            </div>
          </div>
        </div>

        {/* Serious Incidents */}
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
            🚨
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Serious Referrals
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#991B1B', marginTop: '2px' }}>
              {metrics.seriousCases}
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
            All Logs ({records.length})
          </button>
          <button
            type="button"
            className={activeTab === 'infractions' ? 'btn-primary' : 'btn-outline'}
            style={{ padding: '6px 14px', fontSize: '13px' }}
            onClick={() => setActiveTab('infractions')}
          >
            Disciplinary Infractions ({records.length - metrics.commendations})
          </button>
          <button
            type="button"
            className={activeTab === 'merits' ? 'btn-primary' : 'btn-outline'}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              ...(activeTab === 'merits' ? { background: '#059669', borderColor: '#059669' } : {})
            }}
            onClick={() => setActiveTab('merits')}
          >
            ⭐ Commendations &amp; Merits ({metrics.commendations})
          </button>
          <button
            type="button"
            className={activeTab === 'serious' ? 'btn-primary' : 'btn-outline'}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              ...(activeTab === 'serious' ? { background: '#DC2626', borderColor: '#DC2626' } : {})
            }}
            onClick={() => setActiveTab('serious')}
          >
            🚨 Serious Referrals ({metrics.seriousCases})
          </button>
        </div>

        {/* Filter Toolbar Controls */}
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
              placeholder="Search student, adm #, note..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '36px', height: '38px', fontSize: '13px', width: '100%' }}
            />
          </div>

          {/* Section Filter */}
          <div>
            <select
              className="form-select"
              value={filterSectionId}
              onChange={(e) => setFilterSectionId(e.target.value)}
              style={{ height: '38px', fontSize: '13px', width: '100%' }}
            >
              <option value="all">All Assigned Classes ({uniqueSections.length})</option>
              {uniqueSections.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} {s.gradeName ? `(${s.gradeName})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Severity Filter */}
          <div>
            <select
              className="form-select"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              style={{ height: '38px', fontSize: '13px', width: '100%' }}
            >
              <option value="all">All Severities</option>
              <option value="minor">Minor Warning</option>
              <option value="moderate">Moderate Disruption</option>
              <option value="serious">Serious Referral</option>
            </select>
          </div>

          {/* Reset Filters */}
          {(filterSectionId !== 'all' || filterSeverity !== 'all' || filterCategory !== 'all' || searchQuery.trim()) && (
            <div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setFilterSectionId('all');
                  setFilterSeverity('all');
                  setFilterCategory('all');
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

      {/* RECORDS LISTING */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
          <div
            className="spinner"
            style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '32px', height: '32px' }}
          ></div>
          <p style={{ fontWeight: 600 }}>Loading official welfare registers from database...</p>
        </div>
      ) : error ? (
        <div className="alert-banner alert-danger">
          <span>⚠️ {error}</span>
          <button type="button" className="btn-outline" onClick={fetchRecords} style={{ marginLeft: '12px' }}>
            Try Again
          </button>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div
          style={{
            background: 'var(--bg-card, #FFFFFF)',
            padding: '48px 24px',
            borderRadius: '12px',
            textAlign: 'center',
            border: '1px solid var(--border-color, #E2E8F0)'
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>
            {activeTab === 'merits' ? '⭐' : activeTab === 'serious' ? '🛡️' : '📋'}
          </div>
          <h3 style={{ color: 'var(--text-primary, #1F3A5F)', margin: '0 0 8px', fontSize: '18px' }}>
            No Behavior Records Found
          </h3>
          <p style={{ color: 'var(--text-secondary, #64748B)', maxWidth: '460px', margin: '0 auto 20px', fontSize: '13px' }}>
            {searchQuery || filterSectionId !== 'all' || filterSeverity !== 'all'
              ? 'No welfare entries match your current search and filter parameters.'
              : 'You have not recorded any disciplinary observations or commendations for this category.'}
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            {(searchQuery || filterSectionId !== 'all' || filterSeverity !== 'all') && (
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setFilterSectionId('all');
                  setFilterSeverity('all');
                  setFilterCategory('all');
                  setSearchQuery('');
                }}
              >
                Clear Filters
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                handleTypeSwitch(activeTab === 'merits' ? 'commendation' : 'infraction');
                setShowReportModal(true);
              }}
            >
              + Log New Record
            </button>
          </div>
        </div>
      ) : (
        <div className="data-table-container" style={{ background: 'var(--bg-card, #FFFFFF)', borderRadius: '12px', overflow: 'hidden' }}>
          <table className="spec-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th style={{ width: '110px' }}>Date</th>
                <th>Learner</th>
                <th>Category</th>
                <th style={{ textAlign: 'center', width: '120px' }}>Type / Severity</th>
                <th>Observation Note</th>
                <th>Follow-Up Action</th>
                <th style={{ textAlign: 'right', width: '160px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((inc, idx) => {
                const merit = isCommendation(inc.category);
                return (
                  <tr key={inc.id} style={{ borderBottom: '1px solid var(--border-color, #E2E8F0)' }}>
                    <td style={{ color: '#64748B', fontWeight: 600, fontSize: '13px' }}>{idx + 1}</td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-primary, #1F3A5F)', fontWeight: 600, fontSize: '13px' }}>
                      {new Date(inc.incident_date).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary, #1F3A5F)', fontSize: '14px' }}>
                        {inc.student_name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                        <span style={{ fontWeight: 600 }}>{inc.admission_no}</span>
                        {inc.section_name && (
                          <span
                            style={{
                              background: '#F1F5F9',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              color: '#334155',
                              fontWeight: 500
                            }}
                          >
                            {inc.section_name} {inc.grade_name ? `• ${inc.grade_name}` : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: merit ? '#065F46' : 'var(--text-primary, #1E293B)' }}>
                        {merit ? `⭐ ${inc.category}` : inc.category}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {merit ? (
                        <span
                          style={{
                            background: '#ECFDF5',
                            color: '#065F46',
                            border: '1px solid #A7F3D0',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                            display: 'inline-block'
                          }}
                        >
                          MERIT AWARD
                        </span>
                      ) : (
                        <span
                          className={`badge-solid ${
                            inc.severity === 'serious'
                              ? 'badge-rose'
                              : inc.severity === 'moderate'
                              ? 'badge-amber'
                              : 'badge-blue'
                          }`}
                          style={{ fontSize: '11px', fontWeight: 700 }}
                        >
                          {inc.severity?.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td style={{ maxWidth: '280px', fontSize: '13px', color: 'var(--text-primary, #334155)', lineHeight: '1.4' }}>
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical'
                        }}
                      >
                        {inc.description}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: '#64748B', maxWidth: '200px' }}>
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          fontStyle: inc.action_taken ? 'normal' : 'italic'
                        }}
                      >
                        {inc.action_taken || (merit ? 'Logged in student achievement portfolio' : 'Pending pastoral resolution')}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {/* Inspect Details */}
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => setInspectRecord(inc)}
                          title="View Full Incident Details"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          View
                        </button>

                        {/* Edit Record */}
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => openEditModal(inc)}
                          title="Edit follow-up and notes"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          Edit
                        </button>

                        {/* Contact Guardian (if serious or desired) */}
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => handleContactGuardian(inc)}
                          title="Contact Student's Parent / Guardian"
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            color: inc.severity === 'serious' ? '#DC2626' : undefined,
                            borderColor: inc.severity === 'serious' ? '#FECACA' : undefined
                          }}
                        >
                          Contact Parent
                        </button>

                        {/* Delete Record */}
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => handleDeleteRecord(inc)}
                          title="Delete Record"
                          style={{ padding: '4px 8px', fontSize: '12px', color: '#DC2626' }}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* INSPECT DETAIL MODAL */}
      {inspectRecord && (
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: isCommendation(inspectRecord.category) ? '#059669' : '#DC2626'
                  }}
                >
                  {isCommendation(inspectRecord.category) ? '⭐ Positive Commendation' : '🛡️ Disciplinary Record'}
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)' }}>
                  {inspectRecord.student_name}
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Admission: <strong>{inspectRecord.admission_no}</strong> • Class:{' '}
                  <strong>{inspectRecord.section_name || 'N/A'}</strong>
                </div>
              </div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setInspectRecord(null)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--border-color, #E2E8F0)', paddingTop: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>INCIDENT DATE</div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary, #1F3A5F)', marginTop: '2px' }}>
                    {new Date(inspectRecord.incident_date).toLocaleDateString(undefined, {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>SEVERITY LEVEL</div>
                  <div style={{ marginTop: '2px' }}>
                    {isCommendation(inspectRecord.category) ? (
                      <span
                        style={{
                          background: '#ECFDF5',
                          color: '#065F46',
                          border: '1px solid #A7F3D0',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}
                      >
                        MERIT AWARD
                      </span>
                    ) : (
                      <span
                        className={`badge-solid ${
                          inspectRecord.severity === 'serious'
                            ? 'badge-rose'
                            : inspectRecord.severity === 'moderate'
                            ? 'badge-amber'
                            : 'badge-blue'
                        }`}
                        style={{ fontSize: '11px', fontWeight: 700 }}
                      >
                        {inspectRecord.severity?.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>CATEGORY</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary, #1F3A5F)', marginTop: '2px' }}>
                  {inspectRecord.category}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>OBSERVATION DESCRIPTION</div>
                <div
                  style={{
                    background: 'var(--bg-subtle, #F8FAFC)',
                    border: '1px solid var(--border-color, #E2E8F0)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    color: 'var(--text-primary, #334155)',
                    marginTop: '4px',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {inspectRecord.description}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 600 }}>ACTION TAKEN / RESOLUTION</div>
                <div
                  style={{
                    background: 'var(--bg-subtle, #F8FAFC)',
                    border: '1px solid var(--border-color, #E2E8F0)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    color: inspectRecord.action_taken ? 'var(--text-primary, #334155)' : '#94A3B8',
                    marginTop: '4px',
                    fontStyle: inspectRecord.action_taken ? 'normal' : 'italic'
                  }}
                >
                  {inspectRecord.action_taken || 'No explicit follow-up registered yet. Click below to add resolution notes.'}
                </div>
              </div>

              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '6px' }}>
                Record ID: #{inspectRecord.id} • Created: {new Date(inspectRecord.created_at).toLocaleString()}
                {inspectRecord.updated_at && (
                  <span> • Last Updated: {new Date(inspectRecord.updated_at).toLocaleString()}</span>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid var(--border-color, #E2E8F0)', paddingTop: '16px' }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  openEditModal(inspectRecord);
                }}
              >
                ✏️ Edit Record / Follow-Up
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => handleContactGuardian(inspectRecord)}
              >
                💬 Contact Guardian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT NEW INCIDENT / COMMENDATION MODAL */}
      {showReportModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 140
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
                Log Behavior Record or Commendation
              </h3>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setShowReportModal(false)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>

            {/* Switch Record Type: Infraction vs Commendation */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
                background: '#F1F5F9',
                padding: '4px',
                borderRadius: '8px',
                marginBottom: '18px'
              }}
            >
              <button
                type="button"
                onClick={() => handleTypeSwitch('infraction')}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  background: reportType === 'infraction' ? '#FFFFFF' : 'transparent',
                  color: reportType === 'infraction' ? '#DC2626' : '#64748B',
                  boxShadow: reportType === 'infraction' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                🚨 Disciplinary Infraction
              </button>
              <button
                type="button"
                onClick={() => handleTypeSwitch('commendation')}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                  background: reportType === 'commendation' ? '#FFFFFF' : 'transparent',
                  color: reportType === 'commendation' ? '#059669' : '#64748B',
                  boxShadow: reportType === 'commendation' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                ⭐ Positive Commendation
              </button>
            </div>

            <form onSubmit={handleReportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="input-label" htmlFor="welfSectionSelect">Select Class / Section</label>
                <select
                  id="welfSectionSelect"
                  className="form-select"
                  value={selectedSectionId || ''}
                  onChange={(e) => setSelectedSectionId(Number(e.target.value))}
                  required
                >
                  {uniqueSections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.gradeName ? `(${c.gradeName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label" htmlFor="welfStudentSelect">
                  Select Student {isLoadingStudents && <span style={{ fontSize: '11px', color: '#2563EB' }}>(Loading class roster...)</span>}
                </label>
                <select
                  id="welfStudentSelect"
                  className="form-select"
                  value={selectedStudentId || ''}
                  onChange={(e) => setSelectedStudentId(Number(e.target.value))}
                  required
                  disabled={isLoadingStudents || studentsInSelectedSection.length === 0}
                >
                  {studentsInSelectedSection.length === 0 ? (
                    <option value="">No enrolled students in this section</option>
                  ) : (
                    studentsInSelectedSection.map((s) => (
                      <option key={s.student_id} value={s.student_id}>
                        {s.full_name} ({s.admission_no})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="input-label" htmlFor="welfDateInput">Date of Observation</label>
                  <input
                    id="welfDateInput"
                    type="date"
                    className="form-input"
                    value={incidentDate}
                    onChange={(e) => setIncidentDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="welfSeveritySelect">
                    {reportType === 'commendation' ? 'Recognition Level' : 'Severity Level'}
                  </label>
                  {reportType === 'commendation' ? (
                    <select
                      id="welfSeveritySelect"
                      className="form-select"
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as any)}
                    >
                      <option value="minor">Classroom Merit Award</option>
                      <option value="moderate">Departmental Recognition</option>
                      <option value="serious">Principal / School-wide Honors</option>
                    </select>
                  ) : (
                    <select
                      id="welfSeveritySelect"
                      className="form-select"
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value as any)}
                    >
                      <option value="minor">Minor (Classroom warning)</option>
                      <option value="moderate">Moderate (Repeated disruption / Detention)</option>
                      <option value="serious">Serious (Dean &amp; Parent Referral)</option>
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="input-label" htmlFor="welfCategorySelect">Category</label>
                <select
                  id="welfCategorySelect"
                  className="form-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                >
                  {(reportType === 'commendation' ? COMMENDATION_CATEGORIES : INFRACTION_CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label" htmlFor="welfDescInput">Detailed Observation / Narrative</label>
                <textarea
                  id="welfDescInput"
                  className="form-input"
                  rows={3}
                  placeholder={
                    reportType === 'commendation'
                      ? 'Objectively describe the student exceptional conduct, leadership, project effort, or peer assistance...'
                      : 'Objectively describe the disruptive behavior, time, and classroom impact...'
                  }
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="input-label" htmlFor="welfActionInput">
                  {reportType === 'commendation' ? 'Recognition Awarded (Optional)' : 'Immediate Action Taken (Optional)'}
                </label>
                <input
                  id="welfActionInput"
                  type="text"
                  className="form-input"
                  placeholder={
                    reportType === 'commendation'
                      ? 'e.g. Merit badge awarded, commended before class, portfolio note added'
                      : 'e.g. Verbal coaching given, seat relocated, homework extension with contract'
                  }
                  value={actionTaken}
                  onChange={(e) => setActionTaken(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowReportModal(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting || !selectedStudentId}
                  style={reportType === 'commendation' ? { background: '#059669', borderColor: '#059669' } : {}}
                >
                  {isSubmitting
                    ? 'Submitting...'
                    : reportType === 'commendation'
                    ? '⭐ Record Commendation'
                    : 'Submit to Student File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT / UPDATE RECORD MODAL */}
      {editRecord && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 145
          }}
        >
          <div
            style={{
              background: 'var(--bg-card, #FFFFFF)',
              borderRadius: '16px',
              padding: '28px',
              maxWidth: '540px',
              width: '95%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid var(--border-color, #E2E8F0)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)' }}>
                  Update Record &amp; Follow-Up Note
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Student: <strong>{editRecord.student_name}</strong> ({editRecord.admission_no})
                </div>
              </div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setEditRecord(null)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="input-label" htmlFor="editDateInput">Incident Date</label>
                  <input
                    id="editDateInput"
                    type="date"
                    className="form-input"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="editSeveritySelect">Severity</label>
                  <select
                    id="editSeveritySelect"
                    className="form-select"
                    value={editSeverity}
                    onChange={(e) => setEditSeverity(e.target.value as any)}
                  >
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="serious">Serious</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="input-label" htmlFor="editCategoryInput">Category</label>
                <input
                  id="editCategoryInput"
                  type="text"
                  className="form-input"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="input-label" htmlFor="editDescInput">Observation Description</label>
                <textarea
                  id="editDescInput"
                  className="form-input"
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="input-label" htmlFor="editActionInput">Action Taken / Resolution Follow-Up Notes</label>
                <textarea
                  id="editActionInput"
                  className="form-input"
                  rows={2}
                  placeholder="Record outcome of guardian meeting, counseling notes, or student behavioral improvement..."
                  value={editActionTaken}
                  onChange={(e) => setEditActionTaken(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditRecord(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isUpdating}>
                  {isUpdating ? 'Saving Changes...' : 'Save Updates'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
