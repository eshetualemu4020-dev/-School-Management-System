import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { api } from '../../api/client';

interface TeacherCommunicationProps {
  assignedClasses?: any[];
  onShowToast: (msg: string) => void;
  initialContext?: { studentId?: number; studentName?: string } | null;
  onClearContext?: () => void;
}

interface GuardianContact {
  guardian_id: number;
  guardian_name: string;
  guardian_phone?: string;
  guardian_email?: string;
  relationship?: string;
  student_id: number;
  admission_no: string;
  student_name: string;
  section_id?: number;
  section_name?: string;
  grade_name?: string;
}

interface MessageRecord {
  id: number;
  recipient_role: 'guardian' | 'administration' | 'colleague';
  subject: string;
  message: string;
  sent_at: string;
  guardian_id?: number;
  student_id?: number;
  guardian_name?: string;
  guardian_phone?: string;
  student_name?: string;
  admission_no?: string;
  section_name?: string;
}

interface MeetingRecord {
  id: number;
  guardian_id: number;
  student_id: number;
  requested_date: string;
  requested_time: string;
  agenda: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  meeting_notes?: string | null;
  created_at: string;
  updated_at?: string;
  guardian_name: string;
  guardian_phone?: string;
  guardian_email?: string;
  relationship?: string;
  student_name: string;
  admission_no: string;
  section_name?: string;
}

export default function TeacherCommunication({
  assignedClasses = [],
  onShowToast,
  initialContext,
  onClearContext
}: TeacherCommunicationProps) {
  const [activeTab, setActiveTab] = useState<'parents' | 'messages' | 'meetings'>('parents');
  const [parents, setParents] = useState<GuardianContact[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter Toolbar
  const [searchParent, setSearchParent] = useState<string>('');
  const [filterSectionId, setFilterSectionId] = useState<string>('all');

  const [searchMessage, setSearchMessage] = useState<string>('');
  const [filterRecipientRole, setFilterRecipientRole] = useState<string>('all');

  const [searchMeeting, setSearchMeeting] = useState<string>('');
  const [filterMeetingStatus, setFilterMeetingStatus] = useState<string>('all');

  // Compose Message Modal
  const [showMessageModal, setShowMessageModal] = useState<boolean>(false);
  const [targetParent, setTargetParent] = useState<GuardianContact | null>(null);
  const [recipientRole, setRecipientRole] = useState<'guardian' | 'administration' | 'colleague'>('guardian');
  const [msgSubject, setMsgSubject] = useState<string>('');
  const [msgBody, setMsgBody] = useState<string>('');
  const [isSendingMsg, setIsSendingMsg] = useState<boolean>(false);

  // View Message Modal
  const [viewMessage, setViewMessage] = useState<MessageRecord | null>(null);

  // Schedule Meeting Request Modal
  const [showMeetingModal, setShowMeetingModal] = useState<boolean>(false);
  const [meetingDate, setMeetingDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [meetingTime, setMeetingTime] = useState<string>('14:30');
  const [meetingAgenda, setMeetingAgenda] = useState<string>('');
  const [isRequestingMeeting, setIsRequestingMeeting] = useState<boolean>(false);

  // Edit / Complete Meeting Notes Modal
  const [editingMeeting, setEditingMeeting] = useState<MeetingRecord | null>(null);
  const [editStatus, setEditStatus] = useState<'pending' | 'confirmed' | 'completed' | 'cancelled'>('pending');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isUpdatingMeeting, setIsUpdatingMeeting] = useState<boolean>(false);

  // Fetch all communication data from backend
  const fetchAll = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [parentList, msgList, meetList] = await Promise.all([
        api.getContactableParents(),
        api.getTeacherCommunications().catch(() => []),
        api.getTeacherMeetingRequests().catch(() => [])
      ]);
      setParents(parentList || []);
      setMessages(msgList || []);
      setMeetings(meetList || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load communication directory.');
      onShowToast('Error loading communication records.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Handle incoming context from Welfare
  useEffect(() => {
    if (initialContext && initialContext.studentName) {
      setActiveTab('parents');
      setSearchParent(initialContext.studentName);
    }
  }, [initialContext]);

  // Unique sections from assignedClasses
  const uniqueSections = useMemo(() => {
    const map = new Map<number, string>();
    assignedClasses.forEach((c) => {
      if (c.section_id && !map.has(c.section_id)) {
        map.set(c.section_id, c.section_name || `Section ${c.section_id}`);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [assignedClasses]);

  // Handlers for Compose
  const handleOpenCompose = (p?: GuardianContact, role: 'guardian' | 'administration' | 'colleague' = 'guardian') => {
    setTargetParent(p || null);
    setRecipientRole(role);
    setMsgSubject(
      p
        ? `Academic Progress Update: ${p.student_name} (${p.admission_no})`
        : role === 'administration'
        ? 'Inquiry to School Administration'
        : 'Teacher Colleague Consultation'
    );
    setMsgBody('');
    setShowMessageModal(true);
  };

  // Handler for Schedule Meeting
  const handleOpenMeeting = (p: GuardianContact) => {
    setTargetParent(p);
    setMeetingAgenda(`Discuss academic progress and learning support plan for ${p.student_name}`);
    setShowMeetingModal(true);
  };

  // Submit Message
  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!msgSubject.trim() || !msgBody.trim()) {
      alert('Please enter both subject and message body.');
      return;
    }
    setIsSendingMsg(true);
    try {
      await api.sendTeacherCommunication({
        guardianId: targetParent?.guardian_id || undefined,
        studentId: targetParent?.student_id || undefined,
        recipientRole,
        subject: msgSubject.trim(),
        message: msgBody.trim()
      });
      onShowToast('Official communication dispatched and logged in outbox!');
      setShowMessageModal(false);
      await fetchAll();
      setActiveTab('messages');
    } catch (err: any) {
      alert(`Failed to send message: ${err.message}`);
    } finally {
      setIsSendingMsg(false);
    }
  };

  // Submit Meeting Request
  const handleRequestMeeting = async (e: FormEvent) => {
    e.preventDefault();
    if (!targetParent || !meetingAgenda.trim()) {
      alert('Please fill out all conference fields.');
      return;
    }
    setIsRequestingMeeting(true);
    try {
      await api.createTeacherMeetingRequest({
        guardianId: targetParent.guardian_id,
        studentId: targetParent.student_id,
        requestedDate: meetingDate,
        requestedTime: meetingTime,
        agenda: meetingAgenda.trim()
      });
      onShowToast('Parent conference request created and sent to guardian!');
      setShowMeetingModal(false);
      await fetchAll();
      setActiveTab('meetings');
    } catch (err: any) {
      alert(`Failed to schedule meeting: ${err.message}`);
    } finally {
      setIsRequestingMeeting(false);
    }
  };

  // Open Edit Meeting Modal
  const openEditMeeting = (m: MeetingRecord) => {
    setEditingMeeting(m);
    setEditStatus(m.status || 'pending');
    setEditNotes(m.meeting_notes || '');
  };

  // Submit Meeting Status / Notes Update
  const handleUpdateMeetingSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingMeeting) return;
    setIsUpdatingMeeting(true);
    try {
      await api.updateTeacherMeetingRequest(editingMeeting.id, {
        status: editStatus,
        meetingNotes: editNotes.trim() || undefined
      });
      onShowToast('Conference record updated with latest minutes & notes!');
      setEditingMeeting(null);
      await fetchAll();
    } catch (err: any) {
      alert(`Failed to update meeting: ${err.message}`);
    } finally {
      setIsUpdatingMeeting(false);
    }
  };

  // Delete Meeting Request
  const handleDeleteMeeting = async (m: MeetingRecord) => {
    if (!confirm(`Are you sure you want to cancel the conference with ${m.guardian_name}?`)) {
      return;
    }
    try {
      await api.deleteTeacherMeetingRequest(m.id);
      onShowToast('Conference appointment cancelled.');
      await fetchAll();
    } catch (err: any) {
      alert(`Failed to cancel conference: ${err.message}`);
    }
  };

  // Delete Message from log
  const handleDeleteMessage = async (m: MessageRecord) => {
    if (!confirm(`Delete message "${m.subject}" from your communication outbox?`)) {
      return;
    }
    try {
      await api.deleteTeacherCommunication(m.id);
      onShowToast('Message record removed from outbox.');
      if (viewMessage?.id === m.id) setViewMessage(null);
      await fetchAll();
    } catch (err: any) {
      alert(`Failed to delete message: ${err.message}`);
    }
  };

  // Computed Metrics
  const metrics = useMemo(() => {
    const upcomingMeetings = meetings.filter((m) => m.status === 'pending' || m.status === 'confirmed').length;
    const completedMeetings = meetings.filter((m) => m.status === 'completed').length;
    return {
      totalParents: parents.length,
      totalMessages: messages.length,
      upcomingMeetings,
      completedMeetings
    };
  }, [parents, messages, meetings]);

  // Filtered Parents
  const filteredParents = useMemo(() => {
    return parents.filter((p) => {
      if (filterSectionId !== 'all' && String(p.section_id) !== filterSectionId) {
        return false;
      }
      if (searchParent.trim()) {
        const q = searchParent.toLowerCase().trim();
        const matchesName = (p.guardian_name || '').toLowerCase().includes(q);
        const matchesStudent = (p.student_name || '').toLowerCase().includes(q);
        const matchesAdm = (p.admission_no || '').toLowerCase().includes(q);
        const matchesPhone = (p.guardian_phone || '').toLowerCase().includes(q);
        if (!matchesName && !matchesStudent && !matchesAdm && !matchesPhone) {
          return false;
        }
      }
      return true;
    });
  }, [parents, filterSectionId, searchParent]);

  // Filtered Messages
  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (filterRecipientRole !== 'all' && m.recipient_role !== filterRecipientRole) {
        return false;
      }
      if (searchMessage.trim()) {
        const q = searchMessage.toLowerCase().trim();
        const matchesSubj = (m.subject || '').toLowerCase().includes(q);
        const matchesMsg = (m.message || '').toLowerCase().includes(q);
        const matchesRecipient = (m.guardian_name || '').toLowerCase().includes(q);
        const matchesStudent = (m.student_name || '').toLowerCase().includes(q);
        if (!matchesSubj && !matchesMsg && !matchesRecipient && !matchesStudent) {
          return false;
        }
      }
      return true;
    });
  }, [messages, filterRecipientRole, searchMessage]);

  // Filtered Meetings
  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (filterMeetingStatus !== 'all' && m.status !== filterMeetingStatus) {
        return false;
      }
      if (searchMeeting.trim()) {
        const q = searchMeeting.toLowerCase().trim();
        const matchesAgenda = (m.agenda || '').toLowerCase().includes(q);
        const matchesGuardian = (m.guardian_name || '').toLowerCase().includes(q);
        const matchesStudent = (m.student_name || '').toLowerCase().includes(q);
        const matchesNotes = (m.meeting_notes || '').toLowerCase().includes(q);
        if (!matchesAgenda && !matchesGuardian && !matchesStudent && !matchesNotes) {
          return false;
        }
      }
      return true;
    });
  }, [meetings, filterMeetingStatus, searchMeeting]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* PAGE HEADER */}
      <div className="page-header-row" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="page-breadcrumb">
            <span>Teacher Portal</span> / <span>Stakeholder Engagement</span> / <span>Communication</span>
          </div>
          <h2 className="page-title" style={{ margin: '4px 0 6px' }}>Parent &amp; Stakeholder Communication</h2>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #64748B)' }}>
            Official directory of verified student guardians, two-way communication outbox, and parent conference management.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={fetchAll}
            title="Refresh communication from database"
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
            onClick={() => handleOpenCompose(undefined, 'administration')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Message Administration
          </button>
        </div>
      </div>

      {/* CONTEXT BANNER IF NAVIGATED FROM WELFARE */}
      {initialContext && initialContext.studentName && (
        <div
          style={{
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#1E40AF' }}>
            <span style={{ fontSize: '18px' }}>🔍</span>
            <span>
              Currently viewing communication contacts for student: <strong>{initialContext.studentName}</strong>
            </span>
          </div>
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              setSearchParent('');
              if (onClearContext) onClearContext();
            }}
            style={{ fontSize: '12px', padding: '4px 10px', background: '#FFFFFF' }}
          >
            Clear Filter (Show All)
          </button>
        </div>
      )}

      {/* POLICY GUARD HINT BOX */}
      <div
        style={{
          background: 'rgba(37, 99, 235, 0.06)',
          border: '1px solid rgba(37, 99, 235, 0.2)',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#2563EB" style={{ flexShrink: 0 }}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <div style={{ fontSize: '13px', color: 'var(--text-primary, #334155)', lineHeight: '1.45' }}>
          <strong>Verified Stakeholder Protection Protocol:</strong> Only legal guardians linked to active learners in your assigned teaching sections or homeroom class are displayed. Messages and conference requests are logged for administrative record-keeping.
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
        {/* Total Guardians */}
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
            👥
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #64748B)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Verified Guardians
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)', marginTop: '2px' }}>
              {metrics.totalParents}
            </div>
          </div>
        </div>

        {/* Messages Outbox */}
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
            ✉️
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Messages Sent
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>
              {metrics.totalMessages}
            </div>
          </div>
        </div>

        {/* Scheduled Conferences */}
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
            📅
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Upcoming Conferences
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#B45309', marginTop: '2px' }}>
              {metrics.upcomingMeetings}
            </div>
          </div>
        </div>

        {/* Completed Conferences */}
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
              background: '#FAF5FF',
              color: '#9333EA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px'
            }}
          >
            📝
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#9333EA', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Completed Consults
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#7E22CE', marginTop: '2px' }}>
              {metrics.completedMeetings}
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA WITH TABS & TOOLBAR */}
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
            className={activeTab === 'parents' ? 'btn-primary' : 'btn-outline'}
            style={{ padding: '6px 14px', fontSize: '13px' }}
            onClick={() => setActiveTab('parents')}
          >
            👥 Authorized Parents Directory ({parents.length})
          </button>
          <button
            type="button"
            className={activeTab === 'messages' ? 'btn-primary' : 'btn-outline'}
            style={{ padding: '6px 14px', fontSize: '13px' }}
            onClick={() => setActiveTab('messages')}
          >
            ✉️ Outbox &amp; Message Log ({messages.length})
          </button>
          <button
            type="button"
            className={activeTab === 'meetings' ? 'btn-primary' : 'btn-outline'}
            style={{ padding: '6px 14px', fontSize: '13px' }}
            onClick={() => setActiveTab('meetings')}
          >
            📅 Conference Schedule ({meetings.length})
          </button>
        </div>

        {/* Tab-Specific Filter Toolbar */}
        {activeTab === 'parents' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'center' }}>
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
                placeholder="Search guardian, student, adm #, phone..."
                value={searchParent}
                onChange={(e) => setSearchParent(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px', height: '38px', fontSize: '13px', width: '100%' }}
              />
            </div>

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
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {(searchParent || filterSectionId !== 'all') && (
              <div>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => {
                    setSearchParent('');
                    setFilterSectionId('all');
                    if (onClearContext) onClearContext();
                  }}
                  style={{ height: '38px', fontSize: '12px', padding: '0 14px' }}
                >
                  ✕ Reset Filters
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'messages' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'center' }}>
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
                placeholder="Search subject, content, recipient..."
                value={searchMessage}
                onChange={(e) => setSearchMessage(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px', height: '38px', fontSize: '13px', width: '100%' }}
              />
            </div>

            <div>
              <select
                className="form-select"
                value={filterRecipientRole}
                onChange={(e) => setFilterRecipientRole(e.target.value)}
                style={{ height: '38px', fontSize: '13px', width: '100%' }}
              >
                <option value="all">All Recipient Categories</option>
                <option value="guardian">Guardians &amp; Parents</option>
                <option value="administration">School Administration</option>
                <option value="colleague">Faculty Colleagues</option>
              </select>
            </div>

            {(searchMessage || filterRecipientRole !== 'all') && (
              <div>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => {
                    setSearchMessage('');
                    setFilterRecipientRole('all');
                  }}
                  style={{ height: '38px', fontSize: '12px', padding: '0 14px' }}
                >
                  ✕ Reset Filters
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'meetings' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', alignItems: 'center' }}>
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
                placeholder="Search agenda, student, guardian, minutes..."
                value={searchMeeting}
                onChange={(e) => setSearchMeeting(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px', height: '38px', fontSize: '13px', width: '100%' }}
              />
            </div>

            <div>
              <select
                className="form-select"
                value={filterMeetingStatus}
                onChange={(e) => setFilterMeetingStatus(e.target.value)}
                style={{ height: '38px', fontSize: '13px', width: '100%' }}
              >
                <option value="all">All Conference Statuses</option>
                <option value="pending">Pending Confirmation</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed (With Notes)</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {(searchMeeting || filterMeetingStatus !== 'all') && (
              <div>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => {
                    setSearchMeeting('');
                    setFilterMeetingStatus('all');
                  }}
                  style={{ height: '38px', fontSize: '12px', padding: '0 14px' }}
                >
                  ✕ Reset Filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* TAB CONTENT TABLES */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
          <div
            className="spinner"
            style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '32px', height: '32px' }}
          ></div>
          <p style={{ fontWeight: 600 }}>Loading communication directory from MySQL...</p>
        </div>
      ) : error ? (
        <div className="alert-banner alert-danger">
          <span>⚠️ {error}</span>
          <button type="button" className="btn-outline" onClick={fetchAll} style={{ marginLeft: '12px' }}>
            Retry
          </button>
        </div>
      ) : activeTab === 'parents' ? (
        /* TAB 1: AUTHORIZED PARENTS DIRECTORY */
        filteredParents.length === 0 ? (
          <div
            style={{
              background: 'var(--bg-card, #FFFFFF)',
              padding: '48px 24px',
              borderRadius: '12px',
              textAlign: 'center',
              border: '1px solid var(--border-color, #E2E8F0)'
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
            <h3 style={{ color: 'var(--text-primary, #1F3A5F)', margin: '0 0 8px', fontSize: '18px' }}>
              No Verified Guardians Found
            </h3>
            <p style={{ color: 'var(--text-secondary, #64748B)', maxWidth: '460px', margin: '0 auto 16px', fontSize: '13px' }}>
              {searchParent || filterSectionId !== 'all'
                ? 'No guardian entries match your current search criteria.'
                : 'No registered guardians found for the students enrolled in your assigned sections.'}
            </p>
            {(searchParent || filterSectionId !== 'all') && (
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setSearchParent('');
                  setFilterSectionId('all');
                  if (onClearContext) onClearContext();
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className="data-table-container" style={{ background: 'var(--bg-card, #FFFFFF)', borderRadius: '12px', overflow: 'hidden' }}>
            <table className="spec-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Legal Guardian</th>
                  <th style={{ width: '120px' }}>Relationship</th>
                  <th>Enrolled Student</th>
                  <th>Class / Section</th>
                  <th>Contact Info</th>
                  <th style={{ textAlign: 'right', width: '180px' }}>Direct Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredParents.map((p, idx) => (
                  <tr key={`${p.guardian_id}-${p.student_id}`} style={{ borderBottom: '1px solid var(--border-color, #E2E8F0)' }}>
                    <td style={{ color: '#64748B', fontWeight: 600, fontSize: '13px' }}>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary, #1F3A5F)', fontSize: '14px' }}>
                        {p.guardian_name}
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748B' }}>Guardian ID: #{p.guardian_id}</span>
                    </td>
                    <td>
                      <span className="badge-solid badge-blue" style={{ textTransform: 'capitalize', fontSize: '11px' }}>
                        {p.relationship || 'Guardian'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary, #1F3A5F)', fontSize: '13px' }}>
                        {p.student_name}
                      </div>
                      <span style={{ fontSize: '11px', color: '#64748B' }}>Adm: {p.admission_no}</span>
                    </td>
                    <td>
                      <span
                        style={{
                          background: '#F1F5F9',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          color: '#334155',
                          fontWeight: 600,
                          fontSize: '12px'
                        }}
                      >
                        {p.section_name} {p.grade_name ? `(${p.grade_name})` : ''}
                      </span>
                    </td>
                    <td>
                      <div style={{ color: '#0F766E', fontWeight: 600, fontSize: '13px' }}>
                        {p.guardian_phone || 'No phone registered'}
                      </div>
                      {p.guardian_email && (
                        <div style={{ fontSize: '11px', color: '#64748B' }}>{p.guardian_email}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => handleOpenCompose(p, 'guardian')}
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                        >
                          ✉️ Message
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => handleOpenMeeting(p)}
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                        >
                          📅 Meet
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : activeTab === 'messages' ? (
        /* TAB 2: SENT MESSAGES OUTBOX */
        filteredMessages.length === 0 ? (
          <div
            style={{
              background: 'var(--bg-card, #FFFFFF)',
              padding: '48px 24px',
              borderRadius: '12px',
              textAlign: 'center',
              border: '1px solid var(--border-color, #E2E8F0)'
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✉️</div>
            <h3 style={{ color: 'var(--text-primary, #1F3A5F)', margin: '0 0 8px', fontSize: '18px' }}>
              No Messages Found
            </h3>
            <p style={{ color: 'var(--text-secondary, #64748B)', maxWidth: '460px', margin: '0 auto 16px', fontSize: '13px' }}>
              {searchMessage || filterRecipientRole !== 'all'
                ? 'No messages match your search criteria.'
                : 'You have not dispatched any messages yet. Use the Parent Directory or Message Administration button to send communication.'}
            </p>
          </div>
        ) : (
          <div className="data-table-container" style={{ background: 'var(--bg-card, #FFFFFF)', borderRadius: '12px', overflow: 'hidden' }}>
            <table className="spec-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th style={{ width: '130px' }}>Sent Date &amp; Time</th>
                  <th>Recipient</th>
                  <th>Student Context</th>
                  <th>Subject</th>
                  <th>Message Preview</th>
                  <th style={{ textAlign: 'right', width: '120px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMessages.map((m, idx) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid var(--border-color, #E2E8F0)' }}>
                    <td style={{ color: '#64748B', fontWeight: 600, fontSize: '13px' }}>{idx + 1}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: '#64748B' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary, #1F3A5F)' }}>
                        {new Date(m.sent_at).toLocaleDateString()}
                      </div>
                      <div>{new Date(m.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary, #1F3A5F)', fontSize: '13px' }}>
                        {m.guardian_name || (m.recipient_role === 'administration' ? 'School Administration' : 'Faculty Colleague')}
                      </div>
                      <span
                        className={`badge-solid ${
                          m.recipient_role === 'administration'
                            ? 'badge-amber'
                            : m.recipient_role === 'colleague'
                            ? 'badge-purple'
                            : 'badge-blue'
                        }`}
                        style={{ fontSize: '10px', textTransform: 'uppercase' }}
                      >
                        {m.recipient_role}
                      </span>
                    </td>
                    <td>
                      {m.student_name ? (
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '13px' }}>{m.student_name}</div>
                          <span style={{ fontSize: '11px', color: '#64748B' }}>
                            {m.admission_no} {m.section_name ? `• ${m.section_name}` : ''}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: '#94A3B8', fontSize: '12px', fontStyle: 'italic' }}>Institutional / General</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: '#2563EB', fontSize: '13px', maxWidth: '200px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.subject}
                      </div>
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
                        {m.message}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => setViewMessage(m)}
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          title="Read full message"
                        >
                          Read
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => handleDeleteMessage(m)}
                          style={{ padding: '4px 8px', fontSize: '12px', color: '#DC2626' }}
                          title="Delete message from outbox"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* TAB 3: CONFERENCE SCHEDULE */
        filteredMeetings.length === 0 ? (
          <div
            style={{
              background: 'var(--bg-card, #FFFFFF)',
              padding: '48px 24px',
              borderRadius: '12px',
              textAlign: 'center',
              border: '1px solid var(--border-color, #E2E8F0)'
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📅</div>
            <h3 style={{ color: 'var(--text-primary, #1F3A5F)', margin: '0 0 8px', fontSize: '18px' }}>
              No Conferences Scheduled
            </h3>
            <p style={{ color: 'var(--text-secondary, #64748B)', maxWidth: '460px', margin: '0 auto 16px', fontSize: '13px' }}>
              {searchMeeting || filterMeetingStatus !== 'all'
                ? 'No conferences match your search filter.'
                : 'No parent conferences scheduled. Click "Meet" next to any parent in the directory to request an appointment.'}
            </p>
          </div>
        ) : (
          <div className="data-table-container" style={{ background: 'var(--bg-card, #FFFFFF)', borderRadius: '12px', overflow: 'hidden' }}>
            <table className="spec-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th style={{ width: '140px' }}>Requested Time</th>
                  <th>Guardian</th>
                  <th>Learner</th>
                  <th>Conference Agenda</th>
                  <th>Meeting Notes / Outcome</th>
                  <th style={{ textAlign: 'center', width: '110px' }}>Status</th>
                  <th style={{ textAlign: 'right', width: '150px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMeetings.map((meet, idx) => (
                  <tr key={meet.id} style={{ borderBottom: '1px solid var(--border-color, #E2E8F0)' }}>
                    <td style={{ color: '#64748B', fontWeight: 600, fontSize: '13px' }}>{idx + 1}</td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-primary, #1F3A5F)', fontWeight: 600, fontSize: '13px' }}>
                      <div>{new Date(meet.requested_date).toLocaleDateString()}</div>
                      <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 500 }}>at {meet.requested_time}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary, #1F3A5F)', fontSize: '13px' }}>
                        {meet.guardian_name}
                      </div>
                      <span style={{ fontSize: '11px', color: '#0F766E', fontWeight: 600 }}>{meet.guardian_phone || '—'}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{meet.student_name}</div>
                      <span style={{ fontSize: '11px', color: '#64748B' }}>{meet.admission_no}</span>
                    </td>
                    <td style={{ maxWidth: '240px', fontSize: '13px', color: 'var(--text-primary, #334155)', lineHeight: '1.4' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {meet.agenda}
                      </div>
                    </td>
                    <td style={{ maxWidth: '220px', fontSize: '12px', color: meet.meeting_notes ? 'var(--text-primary, #334155)' : '#94A3B8', fontStyle: meet.meeting_notes ? 'normal' : 'italic' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {meet.meeting_notes || 'No conference minutes recorded yet'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        className={`badge-solid ${
                          meet.status === 'completed'
                            ? 'badge-emerald'
                            : meet.status === 'confirmed'
                            ? 'badge-blue'
                            : meet.status === 'cancelled'
                            ? 'badge-rose'
                            : 'badge-amber'
                        }`}
                        style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}
                      >
                        {meet.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => openEditMeeting(meet)}
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          title="Record notes or update status"
                        >
                          {meet.status === 'completed' ? 'View Notes' : 'Update / Notes'}
                        </button>
                        <button
                          type="button"
                          className="btn-outline"
                          onClick={() => handleDeleteMeeting(meet)}
                          style={{ padding: '4px 8px', fontSize: '12px', color: '#DC2626' }}
                          title="Cancel Conference"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* VIEW FULL MESSAGE MODAL */}
      {viewMessage && (
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
              maxWidth: '540px',
              width: '95%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid var(--border-color, #E2E8F0)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#2563EB' }}>
                  {viewMessage.recipient_role} Communication
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)' }}>
                  {viewMessage.subject}
                </h3>
              </div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setViewMessage(null)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-color, #E2E8F0)', paddingTop: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                <div>
                  <span style={{ color: '#64748B' }}>Recipient:</span>{' '}
                  <strong>{viewMessage.guardian_name || 'School Administration'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Sent At:</span>{' '}
                  <strong>{new Date(viewMessage.sent_at).toLocaleString()}</strong>
                </div>
              </div>

              {viewMessage.student_name && (
                <div style={{ fontSize: '12px' }}>
                  <span style={{ color: '#64748B' }}>Regarding Student:</span>{' '}
                  <strong>{viewMessage.student_name}</strong> ({viewMessage.admission_no})
                </div>
              )}

              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>MESSAGE CONTENT</div>
                <div
                  style={{
                    background: 'var(--bg-subtle, #F8FAFC)',
                    border: '1px solid var(--border-color, #E2E8F0)',
                    borderRadius: '8px',
                    padding: '14px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    color: 'var(--text-primary, #334155)',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {viewMessage.message}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button type="button" className="btn-secondary" onClick={() => setViewMessage(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPOSE MESSAGE MODAL */}
      {showMessageModal && (
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
              maxWidth: '540px',
              width: '95%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid var(--border-color, #E2E8F0)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)' }}>
                {targetParent ? `Message to ${targetParent.guardian_name}` : 'Send Official Message'}
              </h3>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setShowMessageModal(false)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>

            {targetParent && (
              <div
                style={{
                  background: 'var(--bg-subtle, #F8FAFC)',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, #E2E8F0)',
                  marginBottom: '14px',
                  fontSize: '12px',
                  color: '#64748B'
                }}
              >
                Regarding Student: <strong>{targetParent.student_name}</strong> ({targetParent.admission_no}) • Class:{' '}
                <strong>{targetParent.section_name}</strong> • Phone:{' '}
                <span style={{ color: '#0F766E', fontWeight: 600 }}>{targetParent.guardian_phone || 'None'}</span>
              </div>
            )}

            <form onSubmit={handleSendMessage} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {!targetParent && (
                <div>
                  <label className="input-label" htmlFor="commRecipientRole">Recipient Stakeholder</label>
                  <select
                    id="commRecipientRole"
                    className="form-select"
                    value={recipientRole}
                    onChange={(e) => setRecipientRole(e.target.value as any)}
                  >
                    <option value="administration">School Administration / Principal</option>
                    <option value="colleague">Faculty Colleague / Teacher</option>
                  </select>
                </div>
              )}

              <div>
                <label className="input-label" htmlFor="msgSubjectInput">Message Subject</label>
                <input
                  id="msgSubjectInput"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Mathematics Progress & Homework Advisory"
                  value={msgSubject}
                  onChange={(e) => setMsgSubject(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="input-label" htmlFor="msgBodyInput">Message Body</label>
                <textarea
                  id="msgBodyInput"
                  className="form-input"
                  rows={4}
                  placeholder="Type your official message clearly here..."
                  value={msgBody}
                  onChange={(e) => setMsgBody(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowMessageModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isSendingMsg}>
                  {isSendingMsg ? 'Sending...' : 'Dispatch Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCHEDULE MEETING MODAL */}
      {showMeetingModal && targetParent && (
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
              maxWidth: '520px',
              width: '95%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid var(--border-color, #E2E8F0)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-primary, #1F3A5F)' }}>
                Request Parent-Teacher Conference
              </h3>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setShowMeetingModal(false)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: 'var(--bg-subtle, #F8FAFC)',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #E2E8F0)',
                marginBottom: '14px',
                fontSize: '12px',
                color: '#64748B'
              }}
            >
              Guardian: <strong>{targetParent.guardian_name}</strong> • Student: <strong>{targetParent.student_name}</strong> ({targetParent.admission_no})
            </div>

            <form onSubmit={handleRequestMeeting} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="input-label" htmlFor="meetDateInput">Proposed Date</label>
                  <input
                    id="meetDateInput"
                    type="date"
                    className="form-input"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="meetTimeInput">Proposed Time</label>
                  <input
                    id="meetTimeInput"
                    type="time"
                    className="form-input"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="input-label" htmlFor="meetAgendaInput">Conference Objective &amp; Agenda</label>
                <textarea
                  id="meetAgendaInput"
                  className="form-input"
                  rows={3}
                  value={meetingAgenda}
                  onChange={(e) => setMeetingAgenda(e.target.value)}
                  placeholder="Outline the specific areas of student performance or welfare to discuss..."
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowMeetingModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isRequestingMeeting}>
                  {isRequestingMeeting ? 'Submitting...' : 'Dispatch Conference Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT / UPDATE MEETING MINUTES MODAL */}
      {editingMeeting && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 135
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
                  Conference Minutes &amp; Status
                </h3>
                <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                  Parent: <strong>{editingMeeting.guardian_name}</strong> • Student: <strong>{editingMeeting.student_name}</strong>
                </div>
              </div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setEditingMeeting(null)}
                style={{ padding: '4px 10px', fontSize: '12px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateMeetingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="input-label" htmlFor="editMeetStatusSelect">Conference Status</label>
                <select
                  id="editMeetStatusSelect"
                  className="form-select"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                >
                  <option value="pending">Pending Confirmation</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed (Conference Held)</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="input-label" htmlFor="editMeetNotesInput">
                  Meeting Minutes &amp; Action Plan Notes
                </label>
                <textarea
                  id="editMeetNotesInput"
                  className="form-input"
                  rows={4}
                  placeholder="Record summary of discussion, agreed follow-up actions, and parental commitments..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setEditingMeeting(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isUpdatingMeeting}>
                  {isUpdatingMeeting ? 'Saving...' : 'Save Conference Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
