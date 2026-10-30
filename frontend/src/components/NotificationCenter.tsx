import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'

type Notice = {
  id: number
  title: string
  body: string | null
  type: string
  read_at: string | null
  created_at: string
}

export default function NotificationCenter() {
  const [items, setItems] = useState<Notice[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unreadCount = items.filter((item) => !item.read_at).length

  const refresh = useCallback(async () => {
    try {
      setItems(await api.getNotifications())
      setError(null)
    } catch (err: any) {
      setError(err.message || 'Notifications could not be loaded.')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const markRead = async (item: Notice) => {
    if (item.read_at) return
    try {
      await api.markNotificationRead(item.id)
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry))
    } catch (err: any) {
      setError(err.message || 'Notification could not be marked as read.')
    }
  }

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead()
      const now = new Date().toISOString()
      setItems((current) => current.map((item) => item.read_at ? item : { ...item, read_at: now }))
    } catch (err: any) {
      setError(err.message || 'Notifications could not be marked as read.')
    }
  }

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 1300, fontFamily: 'inherit' }}>
      {open && <section aria-label="Notifications" style={{ width: 'min(380px, calc(100vw - 32px))', maxHeight: 'min(70vh, 560px)', overflow: 'hidden', marginBottom: 10, background: '#fff', color: '#1E293B', border: '1px solid #CBD5E1', borderRadius: 14, boxShadow: '0 14px 38px rgba(15, 23, 42, .22)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid #E2E8F0' }}>
          <strong>Notifications {unreadCount > 0 && <span style={{ color: '#2563EB' }}>({unreadCount} unread)</span>}</strong>
          {unreadCount > 0 && <button type="button" onClick={() => void markAllRead()} style={{ border: 0, background: 'none', color: '#2563EB', cursor: 'pointer', fontSize: 12 }}>Mark all read</button>}
        </header>
        {error && <div role="alert" style={{ padding: '10px 16px', color: '#B91C1C', fontSize: 12 }}>{error}</div>}
        <div style={{ maxHeight: 'min(60vh, 480px)', overflowY: 'auto' }}>
          {items.length === 0 ? <p style={{ padding: '18px 16px', margin: 0, color: '#64748B', fontSize: 13 }}>You have no notifications.</p> : items.map((item) => (
            <button key={item.id} type="button" onClick={() => void markRead(item)} style={{ display: 'block', width: '100%', padding: '13px 16px', textAlign: 'left', border: 0, borderBottom: '1px solid #F1F5F9', background: item.read_at ? '#fff' : '#EFF6FF', cursor: 'pointer', color: '#1E293B' }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}><strong style={{ fontSize: 13 }}>{item.title}</strong><time style={{ color: '#64748B', whiteSpace: 'nowrap', fontSize: 10 }}>{new Date(item.created_at).toLocaleString()}</time></span>
              {item.body && <span style={{ display: 'block', marginTop: 5, fontSize: 12, lineHeight: 1.45, color: '#475569' }}>{item.body}</span>}
            </button>
          ))}
        </div>
      </section>}
      <button type="button" aria-expanded={open} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} onClick={() => setOpen((value) => !value)} style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', padding: '10px 14px', color: '#fff', background: '#1F3A5F', border: '1px solid #1F3A5F', borderRadius: 999, boxShadow: '0 5px 16px rgba(15, 23, 42, .25)', cursor: 'pointer', fontWeight: 600 }}>
        <span aria-hidden="true">♢</span> Notifications {unreadCount > 0 && <span style={{ minWidth: 20, height: 20, display: 'inline-grid', placeItems: 'center', borderRadius: 999, background: '#DC2626', fontSize: 11 }}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
    </div>
  )
}
