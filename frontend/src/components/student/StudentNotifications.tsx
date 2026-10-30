import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { StudentTabs, StudentSpinner, StudentEmptyState, StudentErrorState, type TabItem } from './StudentCommon';

interface Notice {
  id: number;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

interface Announcement {
  id: number;
  title: string;
  body: string | null;
  published_at: string;
}

type FilterKey = 'all' | 'unread' | 'announcements';

const filterTabs: TabItem[] = [
  { key: 'all', label: 'All Notices', icon: '📥' },
  { key: 'unread', label: 'Unread', icon: '🔔' },
  { key: 'announcements', label: 'School Announcements', icon: '📢' }
];

const typeMeta = (type: string): { icon: string; label: string; color: string } => {
  switch (type) {
    case 'announcement':
      return { icon: '📢', label: 'Announcement', color: '#1D4ED8' };
    case 'DOCUMENT_REQUEST':
      return { icon: '📑', label: 'Document request', color: '#7C3AED' };
    case 'RESULT':
      return { icon: '📈', label: 'Result', color: '#047857' };
    case 'ATTENDANCE':
      return { icon: '📋', label: 'Attendance', color: '#B45309' };
    case 'FEE':
      return { icon: '💰', label: 'Fees', color: '#B91C1C' };
    default:
      return { icon: '♢', label: type.split('_').join(' ').toLowerCase(), color: '#475569' };
  }
};

const formatDate = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const Banner: React.FC<{ unread: number; total: number }> = ({ unread, total }) => (
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
        <span style={{ fontSize: '28px' }}>🔔</span>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }}>
          Notifications & Announcements
        </h1>
      </div>
      <p style={{ margin: 0, color: '#94A3B8', fontSize: '14px', maxWidth: '580px', lineHeight: 1.5 }}>
        Notices delivered to your school account, plus announcements published for your grade and stream.
      </p>
    </div>
    <div style={{
      background: 'rgba(255, 255, 255, 0.08)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      borderRadius: '14px',
      padding: '14px 20px',
      display: 'flex',
      gap: '24px'
    }}>
      <div>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#93C5FD', fontWeight: 700 }}>Unread</div>
        <div style={{ fontSize: '28px', fontWeight: 900, color: unread > 0 ? '#FBBF24' : '#4ADE80' }}>{unread}</div>
      </div>
      <div>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#93C5FD', fontWeight: 700 }}>Total</div>
        <div style={{ fontSize: '28px', fontWeight: 900 }}>{total}</div>
      </div>
    </div>
 </div>
);

export const StudentNotifications: React.FC<{
  showToast: (message: string) => void;
  onInboxChange?: () => void;
}> = ({ showToast, onInboxChange }) => {
  const [items, setItems] = useState<Notice[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterKey>('all');
  const [busyId, setBusyId] = useState<number | null>(null);

  const unreadCount = items.filter((item) => !item.read_at).length;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Announcements ride along on the student dashboard payload.
      const [inbox, dashboard] = await Promise.all([
        api.getNotifications(),
        api.getStudentDashboard()
      ]);
      setItems(Array.isArray(inbox) ? inbox : []);
      setAnnouncements(Array.isArray(dashboard?.announcements) ? dashboard.announcements : []);
    } catch (err: any) {
      setError(err?.message || 'Notifications could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (item: Notice) => {
    if (item.read_at || busyId) return;
    try {
      setBusyId(item.id);
      await api.markNotificationRead(item.id);
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry
        )
      );
      onInboxChange?.();
    } catch (err: any) {
      showToast(err?.message || 'Could not mark this notification as read.');
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    try {
      const result = await api.markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => (item.read_at ? item : { ...item, read_at: now })));
      onInboxChange?.();
      showToast(`Marked ${result?.updatedCount ?? unreadCount} notification(s) as read.`);
    } catch (err: any) {
      showToast(err?.message || 'Could not mark notifications as read.');
    }
  };

  const visibleNotices = useMemo(() => {
    if (activeTab === 'unread') return items.filter((item) => !item.read_at);
    return items;
  }, [items, activeTab]);

  if (loading) {
    return (
      <div className="student-page-container" style={{ padding: '24px' }}>
        <StudentSpinner message="Loading your notifications and announcements..." />
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

  const tabs = (filterTabs ?? []).map((tab) =>
    tab.key === 'unread' ? { ...tab, badge: unreadCount } : tab
  );

  return (
    <div className="student-page-container" style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      <Banner unread={unreadCount} total={items.length} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <StudentTabs tabs={tabs} activeKey={activeTab} onChange={(key) => setActiveTab(key as FilterKey)} ariaLabel="Notification filters" />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            style={{
              background: unreadCount === 0 ? '#E2E8F0' : '#1F3A5F',
              color: unreadCount === 0 ? '#94A3B8' : '#fff',
              border: 'none',
              padding: '9px 16px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: unreadCount === 0 ? 'not-allowed' : 'pointer',
              marginBottom: '24px'
            }}
          >
            ✓ Mark all as read
          </button>
          <button
            type="button"
            onClick={() => void load()}
            style={{
              background: '#fff',
              color: '#1F3A5F',
              border: '1px solid #CBD5E1',
              padding: '9px 16px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              marginBottom: '24px'
            }}
          >
            ⟳ Refresh
          </button>
        </div>
      </div>

      {activeTab === 'announcements' ? (
        announcements.length === 0 ? (
          <StudentEmptyState icon="📢" title="No announcements" description="No active announcements have been published for your grade and stream yet." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {announcements.map((announcement) => (
              <article key={announcement.id} style={{
                background: '#fff',
                border: '1px solid #E2E8F0',
                borderLeft: '4px solid #1D4ED8',
                borderRadius: '12px',
                padding: '18px 20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>{announcement.title}</h3>
                  <time style={{ fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap' }}>
                    {formatDate(announcement.published_at)}
                  </time>
                </div>
                {announcement.body && (
                  <p style={{ margin: '8px 0 0', fontSize: '13px', lineHeight: 1.6, color: '#475569' }}>
                    {announcement.body}
                  </p>
                )}
              </article>
            ))}
          </div>
        )
      ) : visibleNotices.length === 0 ? (
        <StudentEmptyState
          icon={activeTab === 'unread' ? '✅' : '📭'}
          title={activeTab === 'unread' ? 'You are all caught up' : 'No notifications yet'}
          description={
            activeTab === 'unread'
              ? 'Every notification has been read.'
              : 'Notices about results, attendance, fees and document requests will appear here.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {visibleNotices.map((item) => {
            const meta = typeMeta(item.type);
            const unread = !item.read_at;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => void markRead(item)}
                disabled={!unread || busyId === item.id}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '16px 20px',
                  borderRadius: '12px',
                  border: `1px solid ${unread ? '#BFDBFE' : '#E2E8F0'}`,
                  borderLeft: `4px solid ${unread ? meta.color : '#E2E8F0'}`,
                  background: unread ? '#F8FAFF' : '#fff',
                  cursor: unread ? 'pointer' : 'default',
                  color: '#1E293B',
                  fontFamily: 'inherit'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      color: meta.color,
                      background: `${meta.color}14`,
                      padding: '2px 8px',
                      borderRadius: '999px'
                    }}>
                      {meta.icon} {meta.label}
                    </span>
                    <strong style={{ fontSize: '14px' }}>{item.title}</strong>
                    {unread && (
                      <span aria-label="Unread" style={{
                        width: 8, height: 8, borderRadius: '50%', background: meta.color, display: 'inline-block'
                      }} />
                    )}
                  </span>
                  <time style={{ fontSize: '12px', color: '#64748B', whiteSpace: 'nowrap' }}>
                    {formatDate(item.created_at)}
                  </time>
                </div>
                {item.body && (
                  <p style={{ margin: '8px 0 0', fontSize: '13px', lineHeight: 1.6, color: '#475569', whiteSpace: 'pre-line' }}>
                    {item.body}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentNotifications;
