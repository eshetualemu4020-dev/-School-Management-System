import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../../api/client';

interface TeacherProfileProps {
  onShowToast: (msg: string) => void;
}

export default function TeacherProfile({ onShowToast }: TeacherProfileProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'qualifications' | 'sessions' | 'activity' | 'security'>('profile');
  const [profileData, setProfileData] = useState<any | null>(null);
  const [qualifications, setQualifications] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activityTrail, setActivityTrail] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const fetchProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getTeacherSelfProfile();
      setProfileData(res.profile);
      setQualifications(res.qualifications || []);
      setSessions(res.activeSessions || []);
      setActivityTrail(res.activityTrail || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load profile.');
      onShowToast('Error loading profile.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleRevokeSession = async (sessionId: number) => {
    if (!window.confirm('Are you sure you want to log out this active device session?')) return;
    try {
      await api.revokeTeacherSession(sessionId);
      onShowToast('Session revoked successfully.');
      fetchProfile();
    } catch (err: any) {
      alert(`Failed to revoke session: ${err.message}`);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setIsChangingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      onShowToast('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Password update failed.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div>
      <div className="page-header-row">
        <div>
          <div className="page-breadcrumb">
            <span>Teacher Portal</span> / <span>Account</span> / <span>My Profile</span>
          </div>
          <h2 className="page-title">Teacher Profile &amp; Account Settings</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={`btn-${activeTab === 'profile' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('profile')}
          >
            Employment &amp; Bio
          </button>
          <button
            type="button"
            className={`btn-${activeTab === 'qualifications' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('qualifications')}
          >
            Qualifications ({qualifications.length})
          </button>
          <button
            type="button"
            className={`btn-${activeTab === 'sessions' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('sessions')}
          >
            Active Sessions ({sessions.length})
          </button>
          <button
            type="button"
            className={`btn-${activeTab === 'activity' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('activity')}
          >
            Activity Trail ({activityTrail.length})
          </button>
          <button
            type="button"
            className={`btn-${activeTab === 'security' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveTab('security')}
          >
            Security &amp; Password
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
          <div className="spinner" style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '28px', height: '28px' }}></div>
          <p>Loading teacher account profile from MySQL...</p>
        </div>
      ) : error ? (
        <div className="alert-banner alert-danger">
          <span>⚠️ {error}</span>
        </div>
      ) : !profileData ? (
        <div className="alert-banner alert-danger">
          <span>Unable to locate staff profile for this user account.</span>
        </div>
      ) : activeTab === 'profile' ? (
        /* EMPLOYMENT & CONTACT (READ-ONLY HR DATA) */
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 340px', gap: '24px' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: 800, color: '#1F3A5F', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
              Personal &amp; Contact Details
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Full Name</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1F3A5F' }}>{profileData.full_name}</div>
                {profileData.name_am && (
                  <span style={{ fontSize: '12px', color: '#64748B' }}>{profileData.name_am}</span>
                )}
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Portal Username</span>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#2E6DA4' }}>@{profileData.username}</div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Contact Email</span>
                <div style={{ fontSize: '14px', color: '#334155' }}>{profileData.email || '—'}</div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Mobile Phone</span>
                <div style={{ fontSize: '14px', color: '#334155' }}>{profileData.phone || '—'}</div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Gender</span>
                <div style={{ fontSize: '14px', color: '#334155', textTransform: 'capitalize' }}>{profileData.gender || '—'}</div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Date of Birth</span>
                <div style={{ fontSize: '14px', color: '#334155' }}>
                  {profileData.date_of_birth ? new Date(profileData.date_of_birth).toLocaleDateString() : '—'}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
              <div className="rules-hint-box">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  Employment and identity data are managed by the school Registrar &amp; HR. To update contact numbers, please submit an administrative request.
                </span>
              </div>
            </div>
          </div>

          {/* EMPLOYMENT CARD */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '24px', height: 'fit-content' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 800, color: '#1F3A5F', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
              Employment Record
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Employee Number</span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#1F3A5F' }}>{profileData.employee_no}</div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Staff Designation</span>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#2A7F62' }}>{profileData.job_title || 'Faculty Teacher'}</div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Department</span>
                <div style={{ fontSize: '14px', color: '#334155' }}>{profileData.department || 'Academic Department'}</div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Contract Type</span>
                <div style={{ fontSize: '14px', color: '#334155', textTransform: 'capitalize' }}>{profileData.contract_type || 'Permanent'}</div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Date of Appointment</span>
                <div style={{ fontSize: '14px', color: '#334155' }}>
                  {profileData.hire_date ? new Date(profileData.hire_date).toLocaleDateString() : '—'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Employment Status</span>
                <span className="badge-solid badge-emerald">
                  {(profileData.employment_status || 'active').toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : activeTab === 'qualifications' ? (
        /* QUALIFICATIONS & CERTIFICATES */
        <div className="data-table-container">
          <table className="spec-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Degree / Certificate</th>
                <th>Award Level</th>
                <th>Institution</th>
                <th>Field of Study</th>
                <th>Award Date</th>
                <th>Grade / GPA</th>
                <th style={{ textAlign: 'center' }}>HR Verification</th>
              </tr>
            </thead>
            <tbody>
              {qualifications.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                    No qualifications currently recorded. Contact HR/Registrar to archive academic diplomas.
                  </td>
                </tr>
              ) : (
                qualifications.map((q, idx) => (
                  <tr key={q.id}>
                    <td style={{ color: '#64748B', fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ fontWeight: 700, color: '#1F3A5F' }}>
                      {q.title}
                      {q.registration_no && (
                        <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 400 }}>
                          Cert #: {q.registration_no}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="badge-solid badge-blue" style={{ textTransform: 'uppercase' }}>
                        {q.qualification_level}
                      </span>
                    </td>
                    <td>{q.institution}</td>
                    <td>{q.field_of_study || '—'}</td>
                    <td>{q.award_date ? new Date(q.award_date).toLocaleDateString() : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{q.grade_or_class || '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`badge-solid ${q.verification_status === 'verified' ? 'badge-emerald' : 'badge-amber'}`}>
                        {(q.verification_status || 'verified').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'sessions' ? (
        /* ACTIVE DEVICE SESSIONS */
        <div>
          <div className="rules-hint-box" style={{ marginBottom: '16px' }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>
              Manage your active authenticated sessions stored in <code>refresh_sessions</code>. If you suspect unauthorized access, click "Revoke Session" immediately.
            </span>
          </div>

          <div className="data-table-container">
            <table className="spec-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>IP Address</th>
                  <th>Client / User Agent</th>
                  <th>Session Started</th>
                  <th>Expires At</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((sess, idx) => (
                  <tr key={sess.id}>
                    <td style={{ color: '#64748B' }}>{idx + 1}</td>
                    <td style={{ fontWeight: 600, color: '#1F3A5F' }}>{sess.ip_address || '127.0.0.1'}</td>
                    <td style={{ fontSize: '12px', color: '#475569', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {sess.user_agent || 'Standard Web Browser'}
                    </td>
                    <td style={{ fontSize: '12px', color: '#64748B' }}>
                      {new Date(sess.created_at).toLocaleString()}
                    </td>
                    <td style={{ fontSize: '12px', color: '#64748B' }}>
                      {new Date(sess.expires_at).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        onClick={() => handleRevokeSession(sess.id)}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'activity' ? (
        /* AUDIT ACTIVITY TRAIL */
        <div>
          <div className="rules-hint-box" style={{ marginBottom: '16px' }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Your recent immutable audit log trail recorded in <code>audit_logs</code>. Shows marks entries, attendance records, and administrative requests.
            </span>
          </div>

          <div className="data-table-container">
            <table className="spec-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Timestamp (UTC)</th>
                  <th>Action</th>
                  <th>Entity Type</th>
                  <th>Target ID</th>
                </tr>
              </thead>
              <tbody>
                {activityTrail.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                      No recent activity events recorded.
                    </td>
                  </tr>
                ) : (
                  activityTrail.map((act, idx) => (
                    <tr key={act.id}>
                      <td style={{ color: '#64748B' }}>{idx + 1}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: '#64748B' }}>
                        {new Date(act.created_at).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{act.action}</td>
                      <td>
                        <span className="badge-solid badge-slate">{act.entity_type}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>#{act.entity_id || 'N/A'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* SECURITY: CHANGE PASSWORD */
        <div style={{ maxWidth: '480px', background: '#FFFFFF', padding: '24px', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '17px', fontWeight: 800, color: '#1F3A5F' }}>
            Change Account Password
          </h3>

          {passwordError && (
            <div className="alert-banner alert-danger" style={{ marginBottom: '16px' }}>
              <span>⚠️ {passwordError}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="input-label" htmlFor="currentPasswordInput">Current Password</label>
              <input
                id="currentPasswordInput"
                type="password"
                className="form-input"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="input-label" htmlFor="newPasswordInput">New Password (min. 8 characters)</label>
              <input
                id="newPasswordInput"
                type="password"
                className="form-input"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="input-label" htmlFor="confirmPasswordInput">Confirm New Password</label>
              <input
                id="confirmPasswordInput"
                type="password"
                className="form-input"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <div style={{ marginTop: '10px' }}>
              <button type="submit" className="btn-primary" disabled={isChangingPassword} style={{ width: '100%', justifyContent: 'center' }}>
                {isChangingPassword ? 'Updating Password...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

