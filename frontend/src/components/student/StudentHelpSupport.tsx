import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { StudentTabs, StudentSpinner, StudentEmptyState, StudentErrorState, type TabItem } from './StudentCommon';

type TicketStatus = 'open' | 'answered' | 'closed';

interface Ticket {
  id: number;
  category: string;
  subject: string;
  message: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  reply_count: number;
  is_answered: boolean;
  last_staff_reply_at: string | null;
}

interface TicketDetail extends Omit<Ticket, 'reply_count' | 'is_answered' | 'last_staff_reply_at' | 'status'> {
  status: string;
  replies: Array<{
    id: number;
    sender_role: string;
    sender_username: string | null;
    reply_text: string;
    created_at: string;
  }>;
}

type TabKey = 'new' | 'mine' | 'faq';

type SupportSummary = { total: number; open: number; answered: number; closed: number };

const tabItems: TabItem[] = [
  { key: 'new', label: 'Contact Support', icon: '✉️' },
  { key: 'mine', label: 'My Requests', icon: '🗂️' },
  { key: 'faq', label: 'FAQ & Policies', icon: '❓' }
];

const studentCategories = [
  { id: 'academic', label: 'Academic & Results', icon: '📘' },
  { id: 'fees', label: 'Fees & Payments', icon: '💳' },
  { id: 'admissions', label: 'Admissions & Profile', icon: '🏫' },
  { id: 'technical', label: 'Technical / Portal Access', icon: '🛠️' },
  { id: 'other', label: 'Something Else', icon: '💬' }
];

const FAQS = [
  {
    q: 'How do I get my official transcript?',
    a: 'Open "Report Cards & Docs", choose the transcript request type, then select download or collect. Transcripts are normally prepared within 3 working days.'
  },
  {
    q: 'My results are not showing. What should I do?',
    a: 'Results appear only after the teacher publishes them for the term. If your class already received results and yours are missing, raise a request under "Academic & Results".'
  },
  {
    q: 'How is my attendance rate calculated?',
    a: 'The rate counts marked periods. Late arrivals still count as attended, while excused absences are reported separately and do not reduce the rate the same way an unexcused absence does.'
  },
  {
    q: 'I am asked for fees I believe I already paid.',
    a: 'Payments appear once the finance office posts them. If a posted payment is missing from your balance, submit a request under "Fees & Payments" with the receipt number.'
  },
  {
    q: 'I forgot my portal password.',
    a: 'Use "Forgot password" on the sign-in screen to receive a reset link at your school email. If the link does not arrive, submit a "Technical / Portal Access" request.'
  }
];

const formatDate = (value: string | null) => {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const statusStyle = (status: TicketStatus) => {
  switch (status) {
    case 'answered':
      return { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0', label: 'Answered' };
    case 'closed':
      return { bg: '#F1F5F9', fg: '#475569', border: '#CBD5E1', label: 'Closed' };
    default:
      return { bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE', label: 'Open' };
  }
};

const Banner: React.FC<{ summary: SupportSummary }> = ({ summary }) => (
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
        <span style={{ fontSize: '28px' }}>💬</span>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }}>Help &amp; Support</h1>
      </div>
      <p style={{ margin: 0, color: '#94A3B8', fontSize: '14px', maxWidth: '580px', lineHeight: 1.5 }}>
        Ask the school office about academics, fees, admissions or portal access. Every reply is kept here for your records.
      </p>
    </div>
    <div style={{
      background: 'rgba(255, 255, 255, 0.08)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      borderRadius: '14px',
      padding: '14px 20px',
      display: 'flex',
      gap: '20px'
    }}>
      {[
        { label: 'Open', value: summary.open, color: '#93C5FD' },
        { label: 'Answered', value: summary.answered, color: '#4ADE80' },
        { label: 'Closed', value: summary.closed, color: '#CBD5E1' }
      ].map((stat) => (
        <div key={stat.label}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#93C5FD', fontWeight: 700 }}>{stat.label}</div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: stat.color }}>{stat.value}</div>
        </div>
      ))}
    </div>
  </div>
);

export const StudentHelpSupport: React.FC<{ showToast: (message: string) => void }> = ({ showToast }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('new');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [summary, setSummary] = useState({ total: 0, open: 0, answered: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState('academic');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [openTicketId, setOpenTicketId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getStudentSupportTickets();
      setTickets(data.tickets || []);
      setSummary(data.summary || { total: 0, open: 0, answered: 0, closed: 0 });
    } catch (err: any) {
      setError(err?.message || 'Support requests could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openTicket = async (id: number) => {
    if (openTicketId === id) {
      setOpenTicketId(null);
      setDetail(null);
      return;
    }
    setOpenTicketId(id);
    setDetail(null);
    try {
      setDetailLoading(true);
      setDetail(await api.getStudentSupportTicket(id));
    } catch (err: any) {
      showToast(err?.message || 'Could not load that request.');
    } finally {
      setDetailLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    if (subject.trim().length < 3) {
      showToast('Please enter a subject of at least 3 characters.');
      return;
    }
    if (message.trim().length < 10) {
      showToast('Please describe your issue in at least 10 characters.');
      return;
    }

    try {
      setSubmitting(true);
      const result = await api.createStudentSupportTicket({
        category,
        subject: subject.trim(),
        message: message.trim()
      });
      setSubject('');
      setMessage('');
      await load();
      setActiveTab('mine');
      showToast(result.message || 'Support request submitted.');
    } catch (err: any) {
      showToast(err?.message || 'Could not submit your request.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeTicket = async (id: number) => {
    try {
      await api.closeStudentSupportTicket(id);
      await load();
      if (openTicketId === id) {
        setDetail((current) => (current ? { ...current, status: 'closed' } : current));
      }
      showToast('Support request closed.');
    } catch (err: any) {
      showToast(err?.message || 'Could not close that request.');
    }
  };

  const tabs = useMemo(
    () => tabItems.map((tab) => (tab.key === 'mine' ? { ...tab, badge: summary.open } : tab)),
    [summary.open]
  );

  if (loading) {
    return (
      <div className="student-page-container" style={{ padding: '24px' }}>
        <StudentSpinner message="Loading your support requests..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="student-page-container" style={{ padding: '24px' }}>
        <StudentErrorState message={error} onRetry={() => void load()} />
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 13px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    fontSize: '14px',
    fontFamily: 'inherit',
    color: '#1E293B',
    boxSizing: 'border-box'
  };

  return (
    <div className="student-page-container" style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      <Banner summary={summary} />

      <StudentTabs tabs={tabs} activeKey={activeTab} onChange={(key) => setActiveTab(key as TabKey)} ariaLabel="Help and support sections" />

      <div style={{ marginTop: '24px' }}>
        {activeTab === 'new' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '20px', alignItems: 'start' }}>
            <form onSubmit={submit} style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '22px 24px'
            }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800, color: '#1E293B' }}>Send a request to the school office</h2>
              <p style={{ margin: '0 0 18px', fontSize: '13px', color: '#64748B' }}>
                Replies from staff appear under “My Requests”. Please avoid sharing passwords.
              </p>

              <label htmlFor="supportCategory" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Topic
              </label>
              <select
                id="supportCategory"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ ...inputStyle, marginBottom: '16px' }}
              >
                {studentCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                ))}
              </select>

              <label htmlFor="supportSubject" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Subject
              </label>
              <input
                id="supportSubject"
                type="text"
                value={subject}
                maxLength={190}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Semester 1 Physics result missing"
                style={{ ...inputStyle, marginBottom: '16px' }}
              />

              <label htmlFor="supportMessage" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                Describe the issue
              </label>
              <textarea
                id="supportMessage"
                value={message}
                rows={6}
                maxLength={5000}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Give as much detail as you can: dates, subject, receipt numbers..."
                style={{ ...inputStyle, resize: 'vertical', marginBottom: '12px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>{message.length}/5000</span>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: submitting ? '#93A3B8' : '#1F3A5F',
                    color: '#fff',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: submitting ? 'wait' : 'pointer'
                  }}
                >
                  {submitting ? 'Sending...' : 'Submit request'}
                </button>
              </div>
            </form>

            <aside style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px 20px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>Before you send</h3>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', lineHeight: 1.7, color: '#475569' }}>
                <li>Check the FAQ tab — most access and result questions are answered there.</li>
                <li>For fees, include the receipt number and payment date.</li>
                <li>Staff reply during working hours; most requests are answered within 2 working days.</li>
              </ul>
            </aside>
          </div>
        )}

        {activeTab === 'mine' && (
          tickets.length === 0 ? (
            <StudentEmptyState
              icon="🗂️"
              title="No support requests yet"
              description="When you contact the school office, your request and every staff reply will appear here."
              action={{ label: 'Contact support', onClick: () => setActiveTab('new') }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {tickets.map((ticket) => {
                const status = statusStyle(ticket.status);
                const expanded = openTicketId === ticket.id;
                return (
                  <div key={ticket.id} style={{
                    background: '#fff',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    overflow: 'hidden'
                  }}>
                    <button
                      type="button"
                      onClick={() => void openTicket(ticket.id)}
                      aria-expanded={expanded}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        background: 'none',
                        border: 0,
                        padding: '16px 20px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        color: '#1E293B'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '14px' }}>
                          #{ticket.id} · {ticket.subject}
                        </strong>
                        <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            color: status.fg,
                            background: status.bg,
                            border: `1px solid ${status.border}`,
                            padding: '2px 9px',
                            borderRadius: '999px'
                          }}>
                            {status.label}
                          </span>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>{expanded ? '▲' : '▼'}</span>
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '6px', fontSize: '12px', color: '#64748B' }}>
                        <span>{ticket.category}</span>
                        <span>Raised {formatDate(ticket.created_at)}</span>
                        <span>{ticket.reply_count} repl{ticket.reply_count === 1 ? 'y' : 'ies'}</span>
                        {ticket.is_answered && <span style={{ color: '#047857', fontWeight: 700 }}>Staff replied {formatDate(ticket.last_staff_reply_at)}</span>}
                      </div>
                    </button>

                    {expanded && (
                      <div style={{ borderTop: '1px solid #F1F5F9', padding: '16px 20px', background: '#FCFDFF' }}>
                        {detailLoading && <p style={{ margin: 0, fontSize: '13px', color: '#64748B' }}>Loading conversation...</p>}
                        {detail && detail.id === ticket.id && (
                          <>
                            <div style={{ background: '#F1F5F9', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '4px' }}>YOU · {formatDate(ticket.created_at)}</div>
                              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: '#334155', whiteSpace: 'pre-line' }}>{ticket.message}</p>
                            </div>

                            {detail.replies.length === 0 ? (
                              <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#64748B' }}>
                                No staff reply yet. You will be notified when the office answers.
                              </p>
                            ) : (
                              detail.replies.map((reply) => {
                                const fromStudent = reply.sender_role === 'student';
                                return (
                                  <div key={reply.id} style={{
                                    margin: '0 0 10px auto',
                                    maxWidth: '85%',
                                    background: fromStudent ? '#EFF6FF' : '#ECFDF5',
                                    border: `1px solid ${fromStudent ? '#BFDBFE' : '#A7F3D0'}`,
                                    borderRadius: '10px',
                                    padding: '10px 14px'
                                  }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: fromStudent ? '#1D4ED8' : '#047857', marginBottom: '4px' }}>
                                      {fromStudent ? 'YOU' : (reply.sender_username || 'School staff').toUpperCase()} · {formatDate(reply.created_at)}
                                    </div>
                                    <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: '#334155', whiteSpace: 'pre-line' }}>{reply.reply_text}</p>
                                  </div>
                                );
                              })
                            )}

                            {ticket.status !== 'closed' && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button
                                  type="button"
                                  onClick={() => void closeTicket(ticket.id)}
                                  style={{
                                    background: '#fff',
                                    color: '#B91C1C',
                                    border: '1px solid #FCA5A5',
                                    padding: '7px 14px',
                                    borderRadius: '8px',
                                    fontWeight: 700,
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Close this request
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {activeTab === 'faq' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {FAQS.map((faq, index) => {
              const open = openFaq === index;
              return (
                <div key={faq.q} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? null : index)}
                    aria-expanded={open}
                    style={{
                      display: 'flex',
                      width: '100%',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      background: 'none',
                      border: 0,
                      padding: '15px 20px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#1E293B'
                    }}
                  >
                    <span>{faq.q}</span>
                    <span style={{ color: '#64748B' }}>{open ? '−' : '+'}</span>
                  </button>
                  {open && (
                    <p style={{ margin: 0, padding: '0 20px 16px', fontSize: '13px', lineHeight: 1.7, color: '#475569' }}>
                      {faq.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentHelpSupport;
