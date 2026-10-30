import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import {
  StudentTabs,
  StudentSpinner,
  StudentEmptyState,
  StudentErrorState,
  type TabItem
} from './StudentCommon';

type ProfileTab = 'personal' | 'guardians' | 'corrections';

const TAB_ITEMS: TabItem[] = [
  { key: 'personal', label: 'Personal Info', icon: '🪪' },
  { key: 'guardians', label: 'Guardians & Contacts', icon: '👪' },
  { key: 'corrections', label: 'Correction Requests', icon: '📝' }
];

/** Fields the registrar owns — students must use a correction request instead. */
const CORRECTION_FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'first_name', label: 'First name' },
  { value: 'father_name', label: 'Father name' },
  { value: 'grandfather_name', label: 'Grandfather name' },
  { value: 'date_of_birth', label: 'Date of birth' },
  { value: 'gender', label: 'Gender' },
  { value: 'nationality', label: 'Nationality' }
];

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const statusColor = (status: string) => {
  switch (status) {
    case 'ready':
    case 'approved':
      return { bg: '#DCFCE7', fg: '#166534' };
    case 'rejected':
      return { bg: '#FEE2E2', fg: '#991B1B' };
    case 'in_review':
      return { bg: '#FEF3C7', fg: '#92400E' };
    case 'cancelled':
      return { bg: '#F1F5F9', fg: '#475569' };
    default:
      return { bg: '#DBEAFE', fg: '#1E40AF' };
  }
};

const labelize = (value: string) => value.replace(/_/g, ' ');

const Field: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div style={{ padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#64748B' }}>
      {label}
    </div>
    <div style={{ marginTop: '4px', fontSize: '14px', fontWeight: 600, color: '#1E293B', wordBreak: 'break-word' }}>
      {value || '—'}
    </div>
    {hint && <div style={{ marginTop: '4px', fontSize: '11px', color: '#94A3B8' }}>{hint}</div>}
  </div>
);

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: '8px',
  border: '1px solid #CBD5E1',
  fontSize: '14px',
  color: '#1E293B',
  background: '#fff',
  boxSizing: 'border-box'
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 700,
  color: '#334155',
  marginBottom: '6px'
};

const buttonStyle: React.CSSProperties = {
  background: '#1F3A5F',
  color: '#fff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '13px',
  cursor: 'pointer'
};

export const StudentProfile: React.FC<{
  showToast: (message: string) => void;
  onNavigateTab?: (page: string) => void;
}> = ({ showToast, onNavigateTab }) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>(() => {
    const path = window.location.pathname.replace(/\/$/, '');
    if (path.endsWith('/guardians')) return 'guardians';
    if (path.endsWith('/corrections')) return 'corrections';
    return 'personal';
  });

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>(null);

  // Personal edit form
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ phone: '', email: '', region: '', city: '', address: '' });
  const [formError, setFormError] = useState<string | null>(null);

  // Photo
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingPhoto, setPendingPhoto] = useState<{ originalName: string; mimeType: string; dataBase64: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoVersion, setPhotoVersion] = useState(Date.now());
  const [photoMissing, setPhotoMissing] = useState(false);

  // Guardians
  const [guardians, setGuardians] = useState<any[]>([]);
  const [guardianPolicy, setGuardianPolicy] = useState<any>(null);
  const [guardianError, setGuardianError] = useState<string | null>(null);
  const [guardianLoading, setGuardianLoading] = useState(true);

  // Correction requests
  const [requests, setRequests] = useState<any[]>([]);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [correctionForm, setCorrectionForm] = useState({ field: 'first_name', requestedValue: '', reason: '' });
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const setTab = (key: string) => {
    const next = key as ProfileTab;
    setActiveTab(next);
    const suffix = next === 'personal' ? '' : `/${next}`;
    const target = `/student/profile${suffix}`;
    if (window.location.pathname !== target) {
      window.history.pushState(null, '', target);
    }
  };

  const hydrateForm = useCallback((data: any) => {
    setForm({
      phone: data?.phone || '',
      email: data?.email || '',
      region: data?.region || '',
      city: data?.city || '',
      address: data?.address || ''
    });
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getStudentProfile();
      setProfile(data);
      hydrateForm(data);
      const status = String(data?.student_status || data?.status || '').toLowerCase();
      setReadOnlyReason(
        status && status !== 'active' && status !== 'applicant'
          ? `Your account is read-only because your status is “${status}”. The school office manages further changes.`
          : null
      );
      setPhotoMissing(false);
    } catch (err: any) {
      setError(err?.message || 'Your profile could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [hydrateForm]);

  const loadGuardians = useCallback(async () => {
    setGuardianLoading(true);
    setGuardianError(null);
    try {
      const data = await api.getStudentGuardians();
      setGuardians(Array.isArray(data?.guardians) ? data.guardians : []);
      setGuardianPolicy(data?.policy || null);
    } catch (err: any) {
      setGuardianError(err?.message || 'Guardian contacts could not be loaded.');
    } finally {
      setGuardianLoading(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const data = await api.getStudentRequests();
      const all = Array.isArray(data?.requests) ? data.requests : [];
      setRequests(all.filter((r: any) => r.request_type === 'profile_correction'));
    } catch (err: any) {
      setRequestsError(err?.message || 'Correction requests could not be loaded.');
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    void loadGuardians();
    void loadRequests();
  }, [loadProfile, loadGuardians, loadRequests]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const result = await api.updateStudentProfile({
        phone: form.phone.trim(),
        email: form.email.trim(),
        region: form.region.trim(),
        city: form.city.trim(),
        address: form.address.trim()
      });
      showToast(result?.message || 'Your contact details were saved.');
      setEditing(false);
      // Reflect the saved values immediately, then re-sync from the server so the
      // screen can never silently disagree with the database.
      setProfile((prev: any) => ({
        ...prev,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        region: form.region.trim() || null,
        city: form.city.trim() || null,
        address: form.address.trim() || null
      }));
      hydrateForm({
        phone: form.phone.trim(),
        email: form.email.trim(),
        region: form.region.trim(),
        city: form.city.trim(),
        address: form.address.trim()
      });
      await loadProfile();
    } catch (err: any) {
      setFormError(err?.message || 'Your changes could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoPicked = (file: File | null) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setFormError('Choose a JPEG or PNG image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingPhoto({ originalName: file.name, mimeType: file.type, dataBase64: reader.result });
        setFormError(null);
      } else {
        setFormError('The selected photo could not be read.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = async () => {
    if (!pendingPhoto) return;
    setPhotoBusy(true);
    setFormError(null);
    try {
      await api.uploadStudentProfilePhoto(pendingPhoto);
      setPendingPhoto(null);
      setPhotoMissing(false);
      setPhotoVersion(Date.now());
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast('Profile photo updated.');
      await loadProfile();
    } catch (err: any) {
      setFormError(err?.message || 'The photo could not be uploaded.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePhotoRemove = async () => {
    setPhotoBusy(true);
    setFormError(null);
    try {
      await api.removeStudentProfilePhoto();
      setPendingPhoto(null);
      setPhotoMissing(true);
      setPhotoVersion(Date.now());
      showToast('Profile photo removed.');
      await loadProfile();
    } catch (err: any) {
      setFormError(err?.message || 'The photo could not be removed.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCorrectionError(null);
    const wanted = correctionForm.requestedValue.trim();
    if (!wanted) {
      setCorrectionError('Enter the value you believe is correct.');
      return;
    }
    setCorrectionSubmitting(true);
    try {
      const result = await api.submitStudentRequest({
        requestType: 'profile_correction',
        purpose: `Correction of ${labelize(correctionForm.field)}`,
        reason: correctionForm.reason.trim() || undefined,
        copiesRequested: 1,
        deliveryMethod: 'download',
        ...(correctionForm.field ? { correctionField: correctionForm.field, requestedValue: wanted } : {})
      } as any);
      showToast(result?.message || 'Your correction request was submitted.');
      setCorrectionForm({ field: 'first_name', requestedValue: '', reason: '' });
      await loadRequests();
    } catch (err: any) {
      setCorrectionError(err?.message || 'The correction request could not be submitted.');
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const fullName = useMemo(() => {
    if (!profile) return '';
    return [profile.first_name, profile.father_name, profile.grandfather_name].filter(Boolean).join(' ');
  }, [profile]);

  const photoSrc = pendingPhoto?.dataBase64 || api.getStudentProfilePhotoUrl(photoVersion);

  if (loading && !profile) {
    return <StudentSpinner message="Loading your profile..." />;
  }

  if (error && !profile) {
    return <StudentErrorState title="Profile unavailable" message={error} onRetry={loadProfile} />;
  }

  return (
    <div style={{ paddingBottom: '96px' }}>
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #1E3A8A 100%)',
          color: '#fff',
          borderRadius: '16px',
          padding: '24px 28px',
          marginBottom: '20px',
          display: 'flex',
          gap: '20px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ position: 'relative' }}>
          {!pendingPhoto && !photoMissing && profile?.photo_document_id ? (
            <img
              src={photoSrc}
              alt={`${fullName} profile`}
              onError={() => setPhotoMissing(true)}
              style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.25)' }}
            />
          ) : pendingPhoto ? (
            <img
              src={pendingPhoto.dataBase64}
              alt="Selected profile photo preview"
              style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: '3px solid #FBBF24' }}
            />
          ) : (
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)',
                border: '3px solid rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
                fontWeight: 800
              }}
            >
              {(fullName || 'S').charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800 }}>{fullName || 'Student'}</h1>
          <p style={{ margin: '4px 0 0', color: '#CBD5E1', fontSize: '13px' }}>
            {profile?.admission_no} · {profile?.grade_name || 'No grade'}
            {profile?.section_name ? ` · Section ${profile.section_name}` : ''}
            {profile?.academic_year_name ? ` · ${profile.academic_year_name}` : ''}
          </p>
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '999px',
                padding: '3px 10px',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              {labelize(String(profile?.student_status || profile?.status || 'unknown'))}
            </span>
            {readOnlyReason && (
              <span
                style={{
                  background: 'rgba(251,191,36,0.18)',
                  border: '1px solid rgba(251,191,36,0.45)',
                  color: '#FDE68A',
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '11px',
                  fontWeight: 700
                }}
              >
                Read-only
              </span>
            )}
          </div>
        </div>
      </div>

      {readOnlyReason && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            background: '#FFFBEB',
            border: '1px solid #FCD34D',
            borderRadius: '10px',
            color: '#92400E',
            fontSize: '13px',
            marginBottom: '16px'
          }}
        >
          {readOnlyReason}
        </div>
      )}

      <StudentTabs tabs={TAB_ITEMS} activeKey={activeTab} onChange={setTab} ariaLabel="Profile tabs" />

      {/* ---------------- 12.1 Personal Info ---------------- */}
      {activeTab === 'personal' && (
        <div>
          {error && <StudentErrorState title="Profile error" message={error} onRetry={loadProfile} />}

          <section
            style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '18px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>Official record</h2>
              <span style={{ fontSize: '12px', color: '#64748B' }}>Maintained by the Office of the Registrar</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', marginTop: '14px' }}>
              <Field label="Student number" value={profile?.admission_no} />
              <Field label="Full name" value={fullName} />
              <Field label="Gender" value={labelize(String(profile?.gender || ''))} />
              <Field label="Date of birth" value={formatDate(profile?.date_of_birth)} />
              <Field label="Grade" value={profile?.grade_name} />
              <Field label="Section" value={profile?.section_name} />
              <Field label="Enrollment status" value={labelize(String(profile?.enrollment_status || profile?.student_status || ''))} />
              <Field label="Academic year" value={profile?.academic_year_name} />
              <Field label="Nationality" value={profile?.nationality} />
              <Field label="Admission date" value={formatDate(profile?.admission_date)} />
            </div>
          </section>

          <section
            style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '20px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>Contact details you can edit</h2>
              {!editing && !readOnlyReason && (
                <button type="button" style={buttonStyle} onClick={() => setEditing(true)}>
                  Edit contact details
                </button>
              )}
            </div>

            {formError && (
              <div role="alert" style={{ marginTop: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, color: '#991B1B', fontSize: 13 }}>
                {formError}
              </div>
            )}

            {!editing ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', marginTop: '14px' }}>
                <Field label="Phone" value={profile?.phone} />
                <Field label="Personal email" value={profile?.email} />
                <Field label="Region" value={profile?.region} />
                <Field label="City" value={profile?.city} />
                <Field label="Home address" value={profile?.address} />
              </div>
            ) : (
              <form onSubmit={handleSave} style={{ marginTop: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                  <div>
                    <label style={labelStyle} htmlFor="pf-phone">Phone</label>
                    <input id="pf-phone" style={inputStyle} value={form.phone} maxLength={30}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="pf-email">Personal email</label>
                    <input id="pf-email" type="email" style={inputStyle} value={form.email} maxLength={190}
                      onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="pf-region">Region</label>
                    <input id="pf-region" style={inputStyle} value={form.region} maxLength={80}
                      onChange={(e) => setForm({ ...form, region: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="pf-city">City</label>
                    <input id="pf-city" style={inputStyle} value={form.city} maxLength={80}
                      onChange={(e) => setForm({ ...form, city: e.target.value })} />
                  </div>
                </div>
                <div style={{ marginTop: '12px' }}>
                  <label style={labelStyle} htmlFor="pf-address">Home address</label>
                  <textarea id="pf-address" style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={form.address}
                    maxLength={255} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <button
                    type="submit"
                    style={{ ...buttonStyle, opacity: saving ? 0.7 : 1, position: 'relative', zIndex: 2 }}
                    disabled={saving}
                    aria-busy={saving}
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setFormError(null);
                      hydrateForm(profile);
                    }}
                    style={{ ...buttonStyle, background: '#E2E8F0', color: '#334155' }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: '12px', color: '#64748B' }}>
                  Name, date of birth, grade and section are official and can only be corrected through a correction request.
                </p>
              </form>
            )}
          </section>

          <section
            style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '20px',
              marginTop: '18px'
            }}
          >
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>Profile photo</h2>
            <p style={{ margin: '6px 0 14px', fontSize: '13px', color: '#64748B' }}>
              JPEG or PNG, up to 5 MB. Your photo is stored privately and only shown to authorised school staff.
            </p>

            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Live preview of the photo that will be / is stored */}
              {pendingPhoto || (profile?.photo_document_id && !photoMissing) ? (
                <img
                  src={pendingPhoto ? pendingPhoto.dataBase64 : photoSrc}
                  alt="Profile photo preview"
                  onError={() => setPhotoMissing(true)}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: pendingPhoto ? '3px solid #FBBF24' : '3px solid #CBD5E1',
                    background: '#F1F5F9'
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    border: '2px dashed #CBD5E1',
                    background: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    color: '#94A3B8'
                  }}
                  aria-hidden="true"
                >
                  👤
                </div>
              )}

              <div>
                <input
                  ref={fileInputRef}
                  id="pf-photo"
                  type="file"
                  accept="image/jpeg,image/png"
                  style={{ display: 'none' }}
                  onChange={(e) => handlePhotoPicked(e.target.files?.[0] || null)}
                />
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    style={{
                      ...buttonStyle,
                      background: '#E2E8F0',
                      color: '#334155',
                      opacity: photoBusy || readOnlyReason ? 0.6 : 1
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoBusy || Boolean(readOnlyReason)}
                  >
                    {pendingPhoto ? 'Choose a different photo' : profile?.photo_document_id ? 'Change photo' : 'Choose photo'}
                  </button>

                  {pendingPhoto && (
                    <button
                      type="button"
                      style={{ ...buttonStyle, opacity: photoBusy ? 0.7 : 1 }}
                      onClick={handlePhotoUpload}
                      disabled={photoBusy}
                    >
                      {photoBusy ? 'Uploading…' : 'Save this photo'}
                    </button>
                  )}

                  {profile?.photo_document_id && !pendingPhoto && (
                    <button
                      type="button"
                      style={{ ...buttonStyle, background: '#FEE2E2', color: '#991B1B', opacity: photoBusy ? 0.6 : 1 }}
                      onClick={handlePhotoRemove}
                      disabled={photoBusy || Boolean(readOnlyReason)}
                    >
                      Remove photo
                    </button>
                  )}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#64748B' }}>
                  {pendingPhoto
                    ? `Selected: ${pendingPhoto.originalName}. Click “Save this photo” to apply it.`
                    : profile?.photo_document_id
                      ? 'Your current photo is shown above.'
                      : 'No photo on file yet.'}
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ---------------- 12.2 Guardians & Contacts ---------------- */}
      {activeTab === 'guardians' && (
        <div>
          {guardianLoading && <StudentSpinner message="Loading guardian contacts..." />}
          {guardianError && !guardianLoading && (
            <StudentErrorState title="Guardians unavailable" message={guardianError} onRetry={loadGuardians} />
          )}

          {!guardianLoading && !guardianError && guardians.length === 0 && (
            <StudentEmptyState
              icon="👪"
              title="No guardians linked yet"
              description="The registrar has not linked a guardian to your record. Contact the school office if this is incorrect."
            />
          )}

          {!guardianLoading && !guardianError && guardians.length > 0 && (
            <div style={{ display: 'grid', gap: '12px' }}>
              {guardians.map((g, index) => (
                <div
                  key={`${g.name}-${index}`}
                  style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px 18px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#1E293B' }}>{g.name || 'Guardian'}</div>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: 2, textTransform: 'capitalize' }}>
                        {g.relationship}
                        {g.is_primary ? ' · Primary guardian' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      {g.is_emergency_contact && (
                        <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                          Emergency contact
                        </span>
                      )}
                      <span
                        style={{
                          background: g.verified ? '#DCFCE7' : '#F1F5F9',
                          color: g.verified ? '#166534' : '#475569',
                          borderRadius: 999,
                          padding: '3px 10px',
                          fontSize: 11,
                          fontWeight: 700
                        }}
                      >
                        {g.verified ? 'Verified' : 'Not verified'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 12 }}>
                    <Field
                      label="Phone"
                      value={g.phone}
                      hint={g.phone ? undefined : 'Contact details are shown for emergency contacts only'}
                    />
                    <Field
                      label="Email"
                      value={g.email}
                      hint={g.email ? undefined : 'Contact details are shown for emergency contacts only'}
                    />
                  </div>
                </div>
              ))}

              {guardianPolicy?.showsContactForEmergencyOnly && (
                <p style={{ margin: 0, fontSize: '12px', color: '#64748B' }}>
                  For privacy, guardian phone and email are shown only for your emergency contact. Guardian records are read-only for students.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---------------- 12.4 Correction Requests ---------------- */}
      {activeTab === 'corrections' && (
        <div>
          <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginBottom: '18px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>Request a correction</h2>
            <p style={{ margin: '6px 0 14px', fontSize: '13px', color: '#64748B' }}>
              Official details cannot be edited directly. Submit a request and the registrar will review it; your record
              does not change until the request is approved and applied.
            </p>

            {readOnlyReason ? (
              <div role="status" style={{ padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, color: '#92400E', fontSize: 13 }}>
                {readOnlyReason}
              </div>
            ) : (
              <form onSubmit={handleCorrectionSubmit}>
                {correctionError && (
                  <div role="alert" style={{ marginBottom: 12, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, color: '#991B1B', fontSize: 13 }}>
                    {correctionError}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={labelStyle} htmlFor="cf-field">Field to correct</label>
                    <select
                      id="cf-field"
                      style={inputStyle}
                      value={correctionForm.field}
                      onChange={(e) => setCorrectionForm({ ...correctionForm, field: e.target.value })}
                    >
                      {CORRECTION_FIELD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="cf-current">Current value</label>
                    <input
                      id="cf-current"
                      style={{ ...inputStyle, background: '#F1F5F9', color: '#475569' }}
                      value={String(profile?.[correctionForm.field] ?? '')}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="cf-requested">Correct value</label>
                    <input
                      id="cf-requested"
                      style={inputStyle}
                      maxLength={255}
                      value={correctionForm.requestedValue}
                      onChange={(e) => setCorrectionForm({ ...correctionForm, requestedValue: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle} htmlFor="cf-reason">Reason</label>
                  <textarea
                    id="cf-reason"
                    style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                    maxLength={500}
                    value={correctionForm.reason}
                    onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                    placeholder="Explain why this detail needs correcting, e.g. spelling error on the birth certificate."
                  />
                </div>
                <div style={{ marginTop: 14 }}>
                  <button type="submit" style={{ ...buttonStyle, opacity: correctionSubmitting ? 0.7 : 1 }} disabled={correctionSubmitting}>
                    {correctionSubmitting ? 'Submitting…' : 'Submit correction request'}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1E293B' }}>My correction requests</h2>
              <button
                type="button"
                onClick={() => { void loadRequests(); }}
                style={{ ...buttonStyle, background: '#E2E8F0', color: '#334155' }}
              >
                Refresh
              </button>
            </div>

            {requestsLoading && <StudentSpinner message="Loading correction requests..." />}
            {requestsError && !requestsLoading && (
              <StudentErrorState title="Requests unavailable" message={requestsError} onRetry={loadRequests} />
            )}

            {!requestsLoading && !requestsError && requests.length === 0 && (
              <StudentEmptyState
                icon="📝"
                title="No correction requests yet"
                description="When you request a correction to an official detail, its progress will appear here."
              />
            )}

            {!requestsLoading && !requestsError && requests.length > 0 && (
              <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
                {requests.map((request) => {
                  const colors = statusColor(request.status);
                  return (
                    <div key={request.id} style={{ border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1E293B' }}>
                          {labelize(String(request.correction_field || request.request_type))}
                          {request.requested_value ? ` → ${request.requested_value}` : ''}
                        </div>
                        <span style={{ background: colors.bg, color: colors.fg, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700, textTransform: 'capitalize' }}>
                          {labelize(String(request.status))}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                        Ref {request.request_no} · Submitted {formatDateTime(request.created_at)}
                        {request.current_value ? ` · Current: ${request.current_value}` : ''}
                      </div>
                      {request.decision_note && (
                        <div style={{ marginTop: 8, padding: '8px 10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, color: '#334155' }}>
                          Registrar note: {request.decision_note}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p style={{ margin: '14px 0 0', fontSize: 12, color: '#64748B' }}>
              Looking for transcripts or certificates?{' '}
              <button
                type="button"
                onClick={() => onNavigateTab?.('documents')}
                style={{ background: 'none', border: 'none', color: '#1D4ED8', fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 12 }}
              >
                Open Report Cards &amp; Documents
              </button>
            </p>
          </section>
        </div>
      )}
    </div>
  );
};

export default StudentProfile;
