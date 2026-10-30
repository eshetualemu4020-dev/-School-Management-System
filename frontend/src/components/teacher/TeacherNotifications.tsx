import { useState, useEffect } from 'react';
import { api } from '../../api/client';

interface TeacherNotificationsProps {
  onShowToast: (msg: string) => void;
}

export default function TeacherNotifications({ onShowToast }: TeacherNotificationsProps) {
  const [activeTab, setActiveTab] = useState<'notifications' | 'announcements'>('notifications');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [filterRead, setFilterRead] = useState<'all' | 'unread' | 'read'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [notifs, anns] = await Promise.all([
        api.getNotifications().catch(() => []),
        api.getAnnouncements().catch(() => [])
      ]);
      setNotifications(notifs || []);
      setAnnouncements(anns || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load notifications.');
      onShowToast('Error loading notifications.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMarkRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      onShowToast('Notification marked as read.');
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: new Date().toISOString() }))
      );
      onShowToast('All notifications marked as read.');
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    }
  };

  const filteredNotifs = notifications.filter((n) => {
    if (filterRead === 'unread') return !n.read_at;
    if (filterRead === 'read') return !!n.read_at;
    return true;
  });

  return (
    <div>
      <div className="page-header-row">
        <div>
          <div className="page-breadcrumb">
            <span>Teacher Portal</span> / <span>Communications</span> / <span>Notifications</span>
          </div>
          <h2 className="page-title">Notification &amp; Announcement Hub</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className={`btn-${activeTab === 'notifications' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('notifications')}
          >
            My Notifications ({notifications.filter((n) => !n.read_at).length} unread)
          </button>
          <button
            type="button"
            className={`btn-${activeTab === 'announcements' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('announcements')}
          >
            School Announcements ({announcements.length})
          </button>
          {activeTab === 'notifications' && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleMarkAllRead}
              disabled={notifications.filter((n) => !n.read_at).length === 0}
            >
              ✓ Mark All as Read
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
          <div className="spinner" style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '28px', height: '28px' }}></div>
          <p>Loading notifications from MySQL...</p>
        </div>
      ) : error ? (
        <div className="alert-banner alert-danger">
          <span>⚠️ {error}</span>
        </div>
      ) : activeTab === 'notifications' ? (
        <div>
          {/* FILTER TOOLBAR */}
          <div className="filter-toolbar-card" style={{ marginBottom: '16px' }}>
            <div className="filter-group-row">
              <div className="filter-item">
                <label className="filter-label" htmlFor="notifFilterSelect">Filter Read Status:</label>
                <select
                  id="notifFilterSelect"
                  className="filter-select"
                  value={filterRead}
                  onChange={(e) => setFilterRead(e.target.value as any)}
                >
                  <option value="all">All Notifications</option>
                  <option value="unread">Unread Only</option>
                  <option value="read">Read Only</option>
                </select>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: '#64748B' }}>
              Showing {filteredNotifs.length} items
            </div>
          </div>

          {filteredNotifs.length === 0 ? (
            <div style={{ background: '#FFFFFF', padding: '40px', borderRadius: '12px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>🔔</div>
              <h3 style={{ color: '#1F3A5F', marginBottom: '8px' }}>No Notifications</h3>
              <p style={{ color: '#64748B' }}>You're all caught up! No notifications match the selected filter.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredNotifs.map((n) => (
                <div
                  key={n.id}
                  style={{
                    background: n.read_at ? '#FFFFFF' : '#F0F7FF',
                    border: `1px solid ${n.read_at ? '#E2E8F0' : '#BFDBFE'}`,
                    borderLeft: `4px solid ${n.read_at ? '#94A3B8' : '#2E6DA4'}`,
                    borderRadius: '10px',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}
                >
                  <div style={{ flex: 1, marginRight: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '14px', color: '#1F3A5F' }}>{n.title}</strong>
                      {!n.read_at && (
                        <span className="badge-solid badge-blue" style={{ fontSize: '10px' }}>NEW</span>
                      )}
                      <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                        {new Date(n.created_at).toLocaleDateString()} {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {n.body && (
                      <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.4 }}>
                        {n.body}
                      </p>
                    )}
                  </div>
                  <div>
                    {!n.read_at ? (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => handleMarkRead(n.id)}
                      >
                        Mark Read
                      </button>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#94A3B8' }}>Read</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* OFFICIAL ANNOUNCEMENTS */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {announcements.length === 0 ? (
            <div style={{ background: '#FFFFFF', padding: '40px', borderRadius: '12px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>📢</div>
              <h3 style={{ color: '#1F3A5F', marginBottom: '8px' }}>No Announcements</h3>
              <p style={{ color: '#64748B' }}>No official school announcements are published at this time.</p>
            </div>
          ) : (
            announcements.map((ann) => (
              <div
                key={ann.id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderLeft: '4px solid #1F3A5F',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#1F3A5F' }}>
                    {ann.title}
                  </h4>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>
                    Published: {new Date(ann.published_at || ann.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {ann.body}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
