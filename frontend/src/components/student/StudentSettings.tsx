import React, { useState, useEffect, type FormEvent } from 'react';
import { api } from '../../api/client';
import { StudentTabs, StudentSpinner, StudentErrorState, StudentEmptyState } from './StudentCommon';

interface StudentSettingsProps {
  onPasswordChanged?: () => void;
  showToast: (msg: string) => void;
  initialTab?: 'password' | 'sessions' | 'preferences';
}

export const StudentSettings: React.FC<StudentSettingsProps> = ({
  onPasswordChanged,
  showToast,
  initialTab = 'password'
}) => {
  const [activeTab, setActiveTab] = useState<'password' | 'sessions' | 'preferences'>(initialTab);

  // Password tab state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Sessions tab state
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Preferences tab state
  const [preferences, setPreferences] = useState<any>({
    notifications: {
      results: true,
      assignments: true,
      timetable: true,
      announcements: true,
      attendance: true,
      fees: true
    },
    language: 'en',
    display: {
      highContrast: false,
      fontSize: 'normal'
    }
  });
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'sessions') {
      loadSessions();
    } else if (activeTab === 'preferences') {
      loadPreferences();
    }
  }, [activeTab]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const data = await api.getStudentSessions();
      setSessions(data || []);
    } catch (err: any) {
      setSessionsError(err.message || 'Failed to load active sessions.');
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadPreferences = async () => {
    setPrefsLoading(true);
    setPrefsError(null);
    try {
      const data = await api.getStudentPreferences();
      if (data) setPreferences(data);
    } catch (err: any) {
      setPrefsError(err.message || 'Failed to load preferences.');
    } finally {
      setPrefsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      return;
    }

    setPasswordLoading(true);
    try {
      await api.changeStudentPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Password updated successfully. Other device sessions were revoked.');
      if (onPasswordChanged) onPasswordChanged();
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleRevokeSession = async (id: number) => {
    if (!confirm('Are you sure you want to end this login session?')) return;
    try {
      await api.revokeStudentSession(id);
      showToast('Session ended successfully.');
      loadSessions();
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleRevokeOthers = async () => {
    if (!confirm('End all other active sessions across your phones and computers?')) return;
    try {
      const res = await api.revokeOtherStudentSessions();
      showToast(res.message || 'All other sessions ended.');
      loadSessions();
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    }
  };

  const handleSavePreferences = async (e: FormEvent) => {
    e.preventDefault();
    setPrefsSaving(true);
    try {
      await api.saveStudentPreferences(preferences);
      showToast('Preferences saved successfully.');
    } catch (err: any) {
      showToast(`Save failed: ${err.message}`);
    } finally {
      setPrefsSaving(false);
    }
  };

  const passwordStrength = {
    length: newPassword.length >= 8,
    hasUpper: /[A-Z]/.test(newPassword),
    hasLower: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword)
  };

  return (
    <div className="student-settings-container">
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 6px', color: '#1F3A5F', fontSize: '22px', fontWeight: 800 }}>
          Settings &amp; Security
        </h2>
        <p style={{ margin: 0, color: '#64748B', fontSize: '14px' }}>
          Manage your student account credentials, active device sessions, and portal display preferences.
        </p>
      </div>

      <StudentTabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as any)}
        tabs={[
          { key: 'password', label: 'Password & Credentials' },
          { key: 'sessions', label: 'Active Device Sessions', badge: sessions.length || undefined },
          { key: 'preferences', label: 'Portal Preferences' }
        ]}
      />

      {/* 11.1 PASSWORD TAB */}
      {activeTab === 'password' && (
        <div style={{ maxWidth: '540px', background: '#fff', padding: '28px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <h3 style={{ margin: '0 0 16px', color: '#1E293B', fontSize: '16px', fontWeight: 700 }}>
            Change Account Password
          </h3>
          <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>
            Changing your password terminates all other active web and mobile sessions immediately for account security.
          </p>

          {passwordError && (
            <StudentErrorState title="Password Update Error" message={passwordError} />
          )}

          <form onSubmit={handlePasswordSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Current Password <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                New Password <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Choose a strong new password"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px' }}
              />

              {/* Password strength checklist */}
              {newPassword && (
                <div style={{ marginTop: '10px', padding: '12px', background: '#F8FAFC', borderRadius: '8px', fontSize: '12px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '6px', color: '#475569' }}>Password Strength:</div>
                  <div style={{ color: passwordStrength.length ? '#16A34A' : '#94A3B8' }}>
                    {passwordStrength.length ? '✓' : '○'} At least 8 characters
                  </div>
                  <div style={{ color: passwordStrength.hasUpper ? '#16A34A' : '#94A3B8' }}>
                    {passwordStrength.hasUpper ? '✓' : '○'} Uppercase letter (A–Z)
                  </div>
                  <div style={{ color: passwordStrength.hasLower ? '#16A34A' : '#94A3B8' }}>
                    {passwordStrength.hasLower ? '✓' : '○'} Lowercase letter (a–z)
                  </div>
                  <div style={{ color: passwordStrength.hasNumber ? '#16A34A' : '#94A3B8' }}>
                    {passwordStrength.hasNumber ? '✓' : '○'} Number (0–9)
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Confirm New Password <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <button
              type="submit"
              disabled={passwordLoading}
              style={{
                background: '#1F3A5F',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '14px',
                cursor: passwordLoading ? 'not-allowed' : 'pointer',
                opacity: passwordLoading ? 0.7 : 1
              }}
            >
              {passwordLoading ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        </div>
      )}

      {/* 11.2 ACTIVE SESSIONS TAB */}
      {activeTab === 'sessions' && (
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: '0 0 4px', color: '#1E293B', fontSize: '16px', fontWeight: 700 }}>
                Active Logged-in Devices
              </h3>
              <p style={{ margin: 0, color: '#64748B', fontSize: '13px' }}>
                All devices currently holding a valid authenticated session for your account.
              </p>
            </div>
            {sessions.length > 1 && (
              <button
                type="button"
                onClick={handleRevokeOthers}
                style={{
                  background: '#FEE2E2',
                  color: '#DC2626',
                  border: '1px solid #FCA5A5',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                End All Other Sessions
              </button>
            )}
          </div>

          {sessionsLoading ? (
            <StudentSpinner message="Retrieving active device sessions..." />
          ) : sessionsError ? (
            <StudentErrorState message={sessionsError} onRetry={loadSessions} />
          ) : sessions.length === 0 ? (
            <StudentEmptyState icon="📱" title="No Active Sessions" description="No active sessions recorded." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    background: sess.isCurrent ? '#F0F9FF' : '#F8FAFC'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ fontSize: '26px' }}>{sess.isCurrent ? '💻' : '📱'}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B' }}>
                          {sess.userAgent || 'Unknown Device / Browser'}
                        </span>
                        {sess.isCurrent && (
                          <span style={{ background: '#0284C7', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>
                            Current Device
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748B' }}>
                        IP: <code>{sess.ipAddress || 'Localhost'}</code> &bull; Signed in: {new Date(sess.issuedAt).toLocaleString()} &bull; Last Active: {new Date(sess.lastSeenAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {!sess.isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(sess.id)}
                      style={{
                        background: '#fff',
                        border: '1px solid #CBD5E1',
                        color: '#DC2626',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 11.3 PREFERENCES TAB */}
      {activeTab === 'preferences' && (
        <form onSubmit={handleSavePreferences} style={{ maxWidth: '600px', background: '#fff', padding: '28px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          <h3 style={{ margin: '0 0 16px', color: '#1E293B', fontSize: '16px', fontWeight: 700 }}>
            Notification &amp; Display Preferences
          </h3>

          {prefsLoading ? (
            <StudentSpinner message="Loading preferences..." />
          ) : prefsError ? (
            <StudentErrorState message={prefsError} onRetry={loadPreferences} />
          ) : (
            <>
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#334155', marginBottom: '12px' }}>
                  In-App Notification Alerts:
                </div>
                {[
                  { key: 'results', label: 'Published examination & term results' },
                  { key: 'assignments', label: 'New assessments & approaching deadlines' },
                  { key: 'timetable', label: 'Timetable substitutions and schedule notices' },
                  { key: 'attendance', label: 'Absence alerts and attendance corrections' },
                  { key: 'announcements', label: 'School-wide and grade announcements' },
                  { key: 'fees', label: 'Invoice issues and payment confirmations' }
                ].map((item) => (
                  <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', cursor: 'pointer', fontSize: '13px', color: '#475569' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(preferences?.notifications?.[item.key])}
                      onChange={(e) => {
                        setPreferences({
                          ...preferences,
                          notifications: {
                            ...preferences.notifications,
                            [item.key]: e.target.checked
                          }
                        });
                      }}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '14px', color: '#334155', marginBottom: '8px' }}>
                  Display Text Size:
                </label>
                <select
                  value={preferences?.display?.fontSize || 'normal'}
                  onChange={(e) => {
                    setPreferences({
                      ...preferences,
                      display: {
                        ...preferences.display,
                        fontSize: e.target.value
                      }
                    });
                  }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '13px' }}
                >
                  <option value="compact">Compact (High Information Density)</option>
                  <option value="normal">Normal (Standard)</option>
                  <option value="large">Large (High Readability)</option>
                </select>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#334155', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(preferences?.display?.highContrast)}
                    onChange={(e) => {
                      setPreferences({
                        ...preferences,
                        display: {
                          ...preferences.display,
                          highContrast: e.target.checked
                        }
                      });
                    }}
                  />
                  <span>Enable High Contrast Accessibility Mode</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={prefsSaving}
                style={{
                  background: '#1F3A5F',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: prefsSaving ? 'not-allowed' : 'pointer'
                }}
              >
                {prefsSaving ? 'Saving...' : 'Save Preferences'}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
};

export default StudentSettings;
