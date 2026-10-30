import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { LinkedChild } from './MyChildrenDirectory';

interface CommunicationNoticesProps {
  verifiedChildren: LinkedChild[];
  selectedStudentId: number | null;
  onSelectStudentFilter?: (studentId: number | null) => void;
}

export default function CommunicationNotices({
  verifiedChildren,
  selectedStudentId: initialStudentId
}: CommunicationNoticesProps) {
  // Navigation / Tab state
  const [activeSubTab, setActiveSubTab] = useState<'announcements' | 'messages' | 'meetings'>('announcements');
  const [filterStudentId, setFilterStudentId] = useState<number | null>(initialStudentId || null);
  const [searchQuery, setSearchQuery] = useState('');

  // Data state
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [meetingRequests, setMeetingRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Conference Request State
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingChildId, setMeetingChildId] = useState<number>(verifiedChildren[0]?.student_id || 0);
  const [availableTeachers, setAvailableTeachers] = useState<any[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [selectedTeacherStaffId, setSelectedTeacherStaffId] = useState<number | ''>('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('14:30');
  const [meetingAgenda, setMeetingAgenda] = useState('');
  const [submittingMeeting, setSubmittingMeeting] = useState(false);
  const [meetingMsg, setMeetingMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Load communications data
  useEffect(() => {
    void loadAllCommunication();
  }, [filterStudentId]);

  // Load teachers when meeting modal opens or child changes
  useEffect(() => {
    if (showMeetingModal && meetingChildId) {
      void loadChildTeachers(meetingChildId);
    }
  }, [showMeetingModal, meetingChildId]);

  const loadAllCommunication = async () => {
    setLoading(true);
    setError(null);
    try {
      const studentParam = filterStudentId || undefined;
      const [annRes, msgRes, meetRes] = await Promise.all([
        api.getParentAnnouncements(studentParam).catch(() => ({ announcements: [] })),
        api.getParentCommunications(studentParam).catch(() => ({ messages: [] })),
        api.getParentMeetingRequests(studentParam).catch(() => ({ meetingRequests: [] }))
      ]);

      setAnnouncements(annRes.announcements || []);
      setMessages(msgRes.messages || []);
      setMeetingRequests(meetRes.meetingRequests || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load school communication.');
    } finally {
      setLoading(false);
    }
  };

  const loadChildTeachers = async (studentId: number) => {
    setLoadingTeachers(true);
    try {
      const res = await api.getParentChildTeachers(studentId);
      const list = res.teachers || [];
      setAvailableTeachers(list);
      if (list.length > 0) {
        setSelectedTeacherStaffId(list[0].staff_id);
      }
    } catch (err: any) {
      console.error('Failed to load child teachers:', err);
    } finally {
      setLoadingTeachers(false);
    }
  };

  const handleSubmitMeeting = async (e: FormEvent) => {
    e.preventDefault();
    if (!meetingChildId || !selectedTeacherStaffId || !meetingDate || !meetingTime || !meetingAgenda.trim()) {
      setMeetingMsg({ text: 'Please fill in all conference request fields.', type: 'error' });
      return;
    }

    setSubmittingMeeting(true);
    setMeetingMsg(null);
    try {
      const res = await api.createParentMeetingRequest({
        studentId: Number(meetingChildId),
        teacherStaffId: Number(selectedTeacherStaffId),
        requestedDate: meetingDate,
        requestedTime: meetingTime,
        agenda: meetingAgenda
      });

      setMeetingMsg({
        text: res.message || 'Meeting request submitted to instructor successfully.',
        type: 'success'
      });
      setMeetingAgenda('');
      setTimeout(() => {
        setShowMeetingModal(false);
        setMeetingMsg(null);
        void loadAllCommunication();
      }, 1200);
    } catch (err: any) {
      setMeetingMsg({ text: err.message || 'Failed to schedule conference request.', type: 'error' });
    } finally {
      setSubmittingMeeting(false);
    }
  };

  // Filtered lists based on search
  const filteredAnnouncements = useMemo(() => {
    if (!searchQuery.trim()) return announcements;
    const q = searchQuery.toLowerCase();
    return announcements.filter(
      (a) => a.title?.toLowerCase().includes(q) || a.body?.toLowerCase().includes(q)
    );
  }, [announcements, searchQuery]);

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(
      (m) =>
        m.subject?.toLowerCase().includes(q) ||
        m.message?.toLowerCase().includes(q) ||
        m.teacher_name?.toLowerCase().includes(q) ||
        m.student_name?.toLowerCase().includes(q)
    );
  }, [messages, searchQuery]);

  const filteredMeetings = useMemo(() => {
    if (!searchQuery.trim()) return meetingRequests;
    const q = searchQuery.toLowerCase();
    return meetingRequests.filter(
      (r) =>
        r.agenda?.toLowerCase().includes(q) ||
        r.teacher_name?.toLowerCase().includes(q) ||
        r.student_name?.toLowerCase().includes(q) ||
        r.status?.toLowerCase().includes(q)
    );
  }, [meetingRequests, searchQuery]);

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* 1. PAGE HEADER */}
      <div className="sh-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 className="sh-page-title">Communication &amp; Official Notices</h2>
          <p className="sh-page-desc">
            Institutional school circulars, direct messages from faculty, and parent-teacher meeting schedules
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowMeetingModal(true)}
          style={{
            background: '#1F3A5F',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 18px',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 2px 4px rgba(31, 58, 95, 0.15)'
          }}
        >
          <span>🗓️</span> Request Teacher Conference
        </button>
      </div>

      {/* 2. CHILD AUDIENCE FILTER & SEARCH CONTROLS */}
      <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
        {/* Child Audience Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>Filter Audience:</span>
          <button
            type="button"
            onClick={() => setFilterStudentId(null)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: filterStudentId === null ? '2px solid #2563EB' : '1px solid #CBD5E1',
              background: filterStudentId === null ? '#EFF6FF' : '#FFFFFF',
              color: filterStudentId === null ? '#1E40AF' : '#475569',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            🏫 All Wards &amp; School Notices
          </button>

          {verifiedChildren.map((c) => {
            const isSelected = filterStudentId === c.student_id;
            return (
              <button
                key={c.student_id}
                type="button"
                onClick={() => setFilterStudentId(c.student_id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: isSelected ? '2px solid #2563EB' : '1px solid #CBD5E1',
                  background: isSelected ? '#EFF6FF' : '#FFFFFF',
                  color: isSelected ? '#1E40AF' : '#475569',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>🎓</span>
                <span>{c.first_name} {c.father_name}</span>
                <span style={{ fontSize: '11px', opacity: 0.8 }}>({c.grade_name || `Grade ${c.grade_level}`})</span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ marginLeft: 'auto', minWidth: '240px', flex: '0 1 300px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notices, keywords, or teachers..."
            style={{
              width: '100%',
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '13px'
            }}
          />
        </div>
      </div>

      {/* 3. COMMUNICATION SUB-TABS */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #E2E8F0', paddingBottom: '12px' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('announcements')}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            border: 'none',
            background: activeSubTab === 'announcements' ? '#1F3A5F' : 'transparent',
            color: activeSubTab === 'announcements' ? '#FFFFFF' : '#475569',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>📢</span>
          <span>School Circulars &amp; Notices</span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '10px',
            background: activeSubTab === 'announcements' ? '#3B82F6' : '#E2E8F0',
            color: activeSubTab === 'announcements' ? '#FFFFFF' : '#475569'
          }}>
            {filteredAnnouncements.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('messages')}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            border: 'none',
            background: activeSubTab === 'messages' ? '#1F3A5F' : 'transparent',
            color: activeSubTab === 'messages' ? '#FFFFFF' : '#475569',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>💬</span>
          <span>Messages from Teachers</span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '10px',
            background: activeSubTab === 'messages' ? '#3B82F6' : '#E2E8F0',
            color: activeSubTab === 'messages' ? '#FFFFFF' : '#475569'
          }}>
            {filteredMessages.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('meetings')}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            border: 'none',
            background: activeSubTab === 'meetings' ? '#1F3A5F' : 'transparent',
            color: activeSubTab === 'meetings' ? '#FFFFFF' : '#475569',
            fontWeight: 700,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>🗓️</span>
          <span>Conferences &amp; Meeting Requests</span>
          <span style={{
            fontSize: '11px',
            padding: '2px 8px',
            borderRadius: '10px',
            background: activeSubTab === 'meetings' ? '#3B82F6' : '#E2E8F0',
            color: activeSubTab === 'meetings' ? '#FFFFFF' : '#475569'
          }}>
            {filteredMeetings.length}
          </span>
        </button>
      </div>

      {/* ERROR / LOADING ALERTS */}
      {error && (
        <div className="sh-alert sh-alert-error" style={{ marginBottom: '20px' }}>
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '16px', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          <div className="sh-spinner" style={{ width: '36px', height: '36px', border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
          <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 500 }}>
            Fetching verified school communications and circulars...
          </span>
        </div>
      ) : (
        <>
          {/* ============================================================== */}
          {/* TAB A: SCHOOL ANNOUNCEMENTS                                    */}
          {/* ============================================================== */}
          {activeSubTab === 'announcements' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredAnnouncements.length > 0 ? (
                filteredAnnouncements.map((ann) => (
                  <div
                    key={ann.id}
                    className="sh-panel"
                    style={{
                      borderLeft: '4px solid #2563EB',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                        {ann.title}
                      </h3>
                      <span className="sh-badge sh-badge-blue">
                        Published {new Date(ann.published_at || ann.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <p style={{ margin: '4px 0', fontSize: '14px', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {ann.body || ann.content}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#94A3B8', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
                      <span>
                        Issuing Authority: <strong>{ann.published_by_name || 'Office of Administration'}</strong>
                      </span>
                      <span>Institutional Official Notice</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="sh-panel" style={{ padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📢</div>
                  <h4 style={{ margin: 0, color: '#0F172A', fontSize: '15px', fontWeight: 700 }}>No Announcements Found</h4>
                  <p style={{ color: '#64748B', fontSize: '13px', margin: '4px 0 0 0' }}>
                    There are no published circulars matching your current filter criteria.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB B: TEACHER MESSAGES                                        */}
          {/* ============================================================== */}
          {activeSubTab === 'messages' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredMessages.length > 0 ? (
                filteredMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="sh-panel"
                    style={{
                      borderLeft: '4px solid #10B981',
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                          {msg.subject}
                        </h3>
                        <div style={{ fontSize: '12px', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
                          Concerning: {msg.student_name ? `${msg.student_name} (${msg.admission_no})` : 'Student Ward'}
                        </div>
                      </div>
                      <span className="sh-badge sh-badge-emerald">
                        {new Date(msg.sent_at || msg.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: '14px', color: '#334155', lineHeight: 1.6, background: '#F8FAFC', padding: '12px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      {msg.message}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#64748B' }}>
                      <div>
                        Sent by: <strong>{msg.teacher_name}</strong> &bull; {msg.teacher_email || 'Teacher Staff'}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (msg.student_id) setMeetingChildId(msg.student_id);
                          setShowMeetingModal(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563EB',
                          fontWeight: 600,
                          fontSize: '12px',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        Schedule Follow-up Meeting &rarr;
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="sh-panel" style={{ padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>💬</div>
                  <h4 style={{ margin: 0, color: '#0F172A', fontSize: '15px', fontWeight: 700 }}>No Direct Teacher Messages</h4>
                  <p style={{ color: '#64748B', fontSize: '13px', margin: '4px 0 0 0' }}>
                    Your child's instructors have not dispatched any personal notes or messages to your account yet.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB C: MEETING REQUESTS & CONFERENCES                          */}
          {/* ============================================================== */}
          {activeSubTab === 'meetings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredMeetings.length > 0 ? (
                filteredMeetings.map((req) => (
                  <div
                    key={req.id}
                    className="sh-panel"
                    style={{
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      borderLeft: `4px solid ${
                        req.status === 'confirmed'
                          ? '#10B981'
                          : req.status === 'completed'
                          ? '#2563EB'
                          : req.status === 'cancelled'
                          ? '#EF4444'
                          : '#F59E0B'
                      }`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>
                          Conference Request #{req.id}
                        </span>
                        <h3 style={{ margin: '2px 0 0 0', fontSize: '15px', fontWeight: 700, color: '#0F172A' }}>
                          Meeting with {req.teacher_name}
                        </h3>
                        <div style={{ fontSize: '12px', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
                          Regarding: {req.student_name} ({req.admission_no})
                        </div>
                      </div>

                      <span
                        className={`sh-badge ${
                          req.status === 'confirmed'
                            ? 'sh-badge-emerald'
                            : req.status === 'completed'
                            ? 'sh-badge-blue'
                            : req.status === 'cancelled'
                            ? 'sh-badge-rose'
                            : 'sh-badge-amber'
                        }`}
                        style={{ textTransform: 'uppercase', fontSize: '11px', fontWeight: 700 }}
                      >
                        {req.status}
                      </span>
                    </div>

                    <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Discussion Agenda:
                      </div>
                      <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
                        {req.agenda}
                      </div>
                    </div>

                    {req.meeting_notes && (
                      <div style={{ background: '#F0FDF4', padding: '12px 14px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '4px' }}>
                          Instructor Conference Notes:
                        </div>
                        <div style={{ fontSize: '13px', color: '#15803D' }}>
                          {req.meeting_notes}
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
                      <div>
                        📅 Scheduled: <strong>{new Date(req.requested_date).toLocaleDateString()}</strong> at <strong>{req.requested_time}</strong>
                      </div>
                      <div>
                        Submitted {new Date(req.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="sh-panel" style={{ padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗓️</div>
                  <h4 style={{ margin: 0, color: '#0F172A', fontSize: '15px', fontWeight: 700 }}>No Meeting Requests Recorded</h4>
                  <p style={{ color: '#64748B', fontSize: '13px', margin: '4px 0 16px 0' }}>
                    You have not scheduled any parent-teacher conferences. Use the button below to request an appointment.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowMeetingModal(true)}
                    style={{
                      background: '#1F3A5F',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '10px 20px',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    Request Meeting with Teacher
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 4. SCHEDULE CONFERENCE MODAL */}
      {showMeetingModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '14px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                🗓️ Schedule Parent-Teacher Conference
              </h3>
              <button
                type="button"
                onClick={() => setShowMeetingModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748B' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitMeeting} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {meetingMsg && (
                <div className={`sh-alert sh-alert-${meetingMsg.type}`}>
                  <span>{meetingMsg.text}</span>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Select Student
                </label>
                <select
                  value={meetingChildId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setMeetingChildId(id);
                    void loadChildTeachers(id);
                  }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  required
                >
                  {verifiedChildren.map((c) => (
                    <option key={c.student_id} value={c.student_id}>
                      {c.first_name} {c.father_name} (ID: {c.admission_no} &bull; {c.grade_name || `Grade ${c.grade_level}`})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Target Teacher / Instructor
                </label>
                <select
                  value={selectedTeacherStaffId}
                  onChange={(e) => setSelectedTeacherStaffId(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                  required
                  disabled={loadingTeachers || availableTeachers.length === 0}
                >
                  {loadingTeachers ? (
                    <option>Loading assigned teachers...</option>
                  ) : availableTeachers.length > 0 ? (
                    availableTeachers.map((t) => (
                      <option key={t.staff_id} value={t.staff_id}>
                        {t.teacher_name} &bull; {t.subject_name}
                      </option>
                    ))
                  ) : (
                    <option value="">No assigned teachers found for section</option>
                  )}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Preferred Date
                  </label>
                  <input
                    type="date"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                    Preferred Time
                  </label>
                  <input
                    type="time"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                  Conference Agenda / Reason
                </label>
                <textarea
                  rows={3}
                  value={meetingAgenda}
                  onChange={(e) => setMeetingAgenda(e.target.value)}
                  placeholder="Explain what academic topic or student matter you would like to discuss..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '13px', resize: 'vertical' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowMeetingModal(false)}
                  style={{
                    background: '#F1F5F9',
                    color: '#475569',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingMeeting}
                  style={{
                    background: '#1F3A5F',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  {submittingMeeting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

