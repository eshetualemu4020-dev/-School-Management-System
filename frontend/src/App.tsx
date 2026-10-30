import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import './App.css'
import TeacherDashboard from './components/TeacherDashboard'
import AdminDashboard from './components/AdminDashboard'
import StudentDashboard from './components/StudentDashboard'
import LibrarianDashboard from './components/LibrarianDashboard'
import RegistrarDashboard from './components/RegistrarDashboard'
import ParentDashboard from './components/ParentDashboard'
import NotificationCenter from './components/NotificationCenter'
import { api } from './api/client'

type AuthMode = 'signin' | 'register'

type PublicHome = {
  school: {
    name: string
    tagline: string
    motto: string
    address: string
    phone: string
    email: string
    heroTitle: string
    heroSubtitle: string
    ctaLabel: string
  }
  stats: {
    students: number
    teachers: number
    programs: number
    community: number
  }
  highlights: Array<{ title: string; description: string }>
  announcements: Array<{
    id: number
    title: string
    body: string
    publishedAt: string | null
  }>
}

type AuthenticatedUser = {
  id: number
  username: string
  email: string
  role: string
  permissions: string[]
  staffName?: string
  mustChangePassword?: boolean
}

const defaultPublicHome: PublicHome = {
  school: {
    name: 'Ketema Nigus Secondary & Preparatory School',
    tagline: 'Excellence in Secondary & Preparatory Education (Grades 9–12)',
    motto: 'Knowledge, Integrity and National Leadership',
    address: 'Kebele 14, Main Campus, Harar, Ethiopia',
    phone: '+251 25 666 1234',
    email: 'admissions@ketemanigus.edu.et',
    heroTitle: 'Nurturing Ethiopia’s Next Generation of Leaders',
    heroSubtitle: 'Premier secondary education featuring specialized Natural Science & Social Science preparatory streams, modern digital classrooms, and holistic student development.',
    ctaLabel: 'Apply for 2026/27 Admission'
  },
  stats: {
    students: 1850,
    teachers: 95,
    programs: 8,
    community: 24
  },
  highlights: [
    { title: 'Academic Excellence', description: 'Standards-based national curriculum pathways for Grades 9–12 with proven examination outcomes.' },
    { title: 'Student Mentorship & Pastoral Care', description: 'Personalized academic counseling, daily attendance follow-ups, and proactive guardian alerts.' },
    { title: 'Modern STEM & Digital Labs', description: 'Fully equipped science laboratories, modern ICT suites, and comprehensive digital library services.' }
  ],
  announcements: [
    {
      id: 6,
      title: 'National Examination Prep & STEM Laboratories Enhancement',
      body: 'Supplementary weekend tutorial sessions and upgraded Physics, Chemistry, and ICT laboratory schedules have commenced for Grade 12 students.',
      publishedAt: new Date().toISOString()
    },
    {
      id: 5,
      title: '2026/27 Academic Year Admission & Stream Registration Open',
      body: 'Prospective Grade 9 applicants and incoming Grade 11 preparatory stream candidates (Natural & Social Sciences) may now submit documents online or visit the registrar office at Main Campus.',
      publishedAt: new Date(Date.now() - 3600000).toISOString()
    }
  ]
}

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginRole, setLoginRole] = useState<'student' | 'guardian' | 'teacher' | 'registrar' | 'librarian' | 'administrator'>('student')
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [authenticatedUser, setAuthenticatedUser] = useState<AuthenticatedUser | null>(null)
  const [dashboardTheme, setDashboardTheme] = useState<'light' | 'dark'>('light')
  const [themeToggleAnchor, setThemeToggleAnchor] = useState<HTMLElement | null>(null)
  const [publicHome, setPublicHome] = useState<PublicHome | null>(null)
  const [regRole, setRegRole] = useState<'student' | 'guardian'>('student')
  const [regFirstName, setRegFirstName] = useState('')
  const [regLastName, setRegLastName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [regGrade, setRegGrade] = useState('9')
  const [regStream, setRegStream] = useState('Natural Science')
  const [regIdNumber, setRegIdNumber] = useState('')
  const [forgotModalOpen, setForgotModalOpen] = useState(false)
  const [forgotSubmitted, setForgotSubmitted] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMessage, setForgotMessage] = useState('')
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSubmitted, setResetSubmitted] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [requiredCurrentPassword, setRequiredCurrentPassword] = useState('')
  const [requiredNewPassword, setRequiredNewPassword] = useState('')
  const [requiredConfirmPassword, setRequiredConfirmPassword] = useState('')
  const [requiredPasswordError, setRequiredPasswordError] = useState<string | null>(null)
  const [requiredPasswordLoading, setRequiredPasswordLoading] = useState(false)

  // Two-Factor Authentication (MFA) state
  const [showMfaModal, setShowMfaModal] = useState(false)
  const [mfaTempToken, setMfaTempToken] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [mfaLoading, setMfaLoading] = useState(false)

  // Browser Path Tracking for Protected Routes & Shared Pages
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname)

  useEffect(() => {
    const onPopState = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])



  useEffect(() => {
    const loadHome = async () => {
      try {
        const data = await api.getPublicHome()
        setPublicHome(data)
      } catch (error) {
        console.error('Failed to load public home data:', error)
      }
    }

    void loadHome()
  }, [])

  useEffect(() => {
    if (!authenticatedUser) return
    const savedTheme = localStorage.getItem(`hspsms-theme:${authenticatedUser.id}`)
    setDashboardTheme(savedTheme === 'dark' ? 'dark' : 'light')

    const updateAnchor = () => {
      const anchor = document.querySelector<HTMLElement>('.user-profile-badge, .sh-user-badge')
      setThemeToggleAnchor((prev) => (prev === anchor ? prev : anchor))
    }

    updateAnchor()
    const observer = new MutationObserver(updateAnchor)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      setThemeToggleAnchor(null)
    }
  }, [authenticatedUser?.id])

  useEffect(() => {
    const tokenFromLink = new URLSearchParams(window.location.search).get('resetToken')
    if (tokenFromLink) {
      setResetToken(tokenFromLink)
      window.history.replaceState({}, '', window.location.pathname)
    }

    void api.getMe().then((user) => {
      if (user?.id) {
        setAuthenticatedUser({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.roles?.[0] || user.role || 'student',
          permissions: user.permissions || [],
          staffName: user.staff?.fullName || user.staffName || undefined,
          mustChangePassword: Boolean((user as any).mustChangePassword)
        })
      }
    }).catch((error: any) => {
      if (error.code === 'SESSION_EXPIRED' || error.code === 'INVALID_TOKEN') {
        setErrorMessage('Your session has expired. Please sign in again.')
      }
    })
  }, [])


  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const result = await api.login(username.trim(), password, rememberMe, loginRole)

      if (result.mfaRequired && result.tempToken) {
        setMfaTempToken(result.tempToken)
        setShowMfaModal(true)
        setMfaError(null)
        setMfaCode('')
        return
      }

      // The account's real role comes from the database and always wins. The role
      // selector is only a convenience; a correct password must never be refused
      // because it was left on the wrong option.
      const accountRoles: string[] = result.user.roles || []
      const primaryRole = accountRoles[0] || loginRole
      const expectedRole = loginRole === 'guardian' ? 'parent' : loginRole
      const hasExpectedRole = accountRoles.some(
        (r) => r === expectedRole || (expectedRole === 'parent' && r === 'guardian')
      )
      if (accountRoles.length > 0 && !hasExpectedRole) {
        setErrorMessage(
          (result as any).roleWarning ||
            `You are signed in as ${primaryRole}. The selected role does not match your account.`
        )
      }

      setAuthenticatedUser({
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        role: primaryRole,
        permissions: result.user.permissions || [],
        staffName: result.user.staff?.fullName || undefined,
        mustChangePassword: Boolean(result.mustChangePassword ?? (result.user as any)?.mustChangePassword)
      })

      setUsername('')
      setPassword('')
    } catch (error: any) {
      setErrorMessage(error.message || 'Unable to sign in.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMfaSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!mfaTempToken || !mfaCode.trim()) return

    setMfaLoading(true)
    setMfaError(null)

    try {
      const result = await api.authenticate2FA(mfaTempToken, mfaCode.trim(), rememberMe)
      setAuthenticatedUser({
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        role: result.user.roles?.[0] || 'student',
        permissions: result.user.permissions || [],
        staffName: result.user.staff?.fullName || undefined,
        mustChangePassword: Boolean((result as any).mustChangePassword ?? (result.user as any)?.mustChangePassword)
      })
      setShowMfaModal(false)
      setMfaTempToken(null)
      setMfaCode('')
      setUsername('')
      setPassword('')
    } catch (error: any) {
      setMfaError(error.message || 'Invalid authentication code. Please try again.')
    } finally {
      setMfaLoading(false)
    }
  }

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!regFirstName.trim() || !regLastName.trim()) {
      setErrorMessage('Please provide both first and last name.')
      return
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Passwords do not match.')
      return
    }

    setIsLoading(true)

    try {
      const result = await api.registerPublic({
        firstName: regFirstName,
        lastName: regLastName,
        email: regEmail,
        phone: regPhone,
        password: regPassword,
        role: regRole,
        idNumber: regIdNumber
      })

      if (!result.pendingApproval) {
        setAuthenticatedUser({
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          role: result.user.roles?.[0] || regRole,
          permissions: result.user.permissions || []
        })
      }

      setRegFirstName('')
      setRegLastName('')
      setRegEmail('')
      setRegPhone('')
      setRegPassword('')
      setRegConfirmPassword('')
      setRegIdNumber('')
      setSuccessMessage(result.pendingApproval
        ? 'Your staff account request was submitted. Sign-in will be available after school administrator approval.'
        : 'Registration successful.')
    } catch (error: any) {
      setErrorMessage(error.message || 'Unable to create the account.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setForgotError(null)
    setForgotLoading(true)

    try {
      const result = await api.requestPasswordReset(forgotEmail.trim())
      setForgotMessage(result.message)
      setForgotSubmitted(true)
    } catch (error: any) {
      setForgotError(error.message || 'Unable to send password reset email.')
    } finally {
      setForgotLoading(false)
    }
  }

  const handleLogout = () => {
    void api.logout().catch(() => undefined)
    setAuthenticatedUser(null)
    setRequiredCurrentPassword('')
    setRequiredNewPassword('')
    setRequiredConfirmPassword('')
    setRequiredPasswordError(null)
    setErrorMessage(null)
    setSuccessMessage(null)
    setAuthMode('signin')
  }

  const handleRequiredPasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setRequiredPasswordError(null)
    if (requiredNewPassword !== requiredConfirmPassword) {
      setRequiredPasswordError('The new passwords do not match.')
      return
    }
    if (requiredNewPassword.length < 8 || !/[A-Z]/.test(requiredNewPassword) || !/[a-z]/.test(requiredNewPassword) || !/[0-9]/.test(requiredNewPassword)) {
      setRequiredPasswordError('Use at least 8 characters with an uppercase letter, a lowercase letter, and a number.')
      return
    }
    setRequiredPasswordLoading(true)
    try {
      await api.changePassword(requiredCurrentPassword, requiredNewPassword)
      setAuthenticatedUser((current) => current ? { ...current, mustChangePassword: false } : current)
      setRequiredCurrentPassword('')
      setRequiredNewPassword('')
      setRequiredConfirmPassword('')
    } catch (error: any) {
      setRequiredPasswordError(error.message || 'Unable to change the password.')
    } finally {
      setRequiredPasswordLoading(false)
    }
  }

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setResetError(null)
    if (resetPasswordValue !== resetPasswordConfirm) {
      setResetError('Passwords do not match.')
      return
    }

    setResetLoading(true)
    try {
      await api.resetPassword(resetToken || '', resetPasswordValue)
      setResetSubmitted(true)
      setResetPasswordValue('')
      setResetPasswordConfirm('')
    } catch (error: any) {
      setResetError(error.message || 'This reset link is invalid or expired.')
    } finally {
      setResetLoading(false)
    }
  }

  const home = publicHome || defaultPublicHome

  // 1. Shared Page: 404 Not Found (/404)
  if (currentPath === '/404') {
    return (
      <main className="auth-access-message" role="status" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>🔍</div>
        <div style={{ display: 'inline-block', padding: '4px 12px', background: '#FEE2E2', color: '#DC2626', borderRadius: '999px', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
          404 NOT FOUND
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1E293B', marginBottom: '8px' }}>Page Not Found</h1>
        <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '440px', marginBottom: '20px' }}>
          The requested URL <code>{currentPath}</code> does not exist on this school management portal.
        </p>
        <button
          type="button"
          className="submit-btn"
          style={{ maxWidth: '220px' }}
          onClick={() => {
            const dest = authenticatedUser ? (authenticatedUser.role === 'teacher' ? '/teacher/dashboard' : '/') : '/';
            window.history.pushState(null, '', dest);
            setCurrentPath(dest);
          }}
        >
          Return to Portal
        </button>
      </main>
    )
  }

  // 2. Shared Page: Unauthorized 403 (/unauthorized)
  if (currentPath === '/unauthorized') {
    return (
      <main className="auth-access-message" role="status" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>🚫</div>
        <div style={{ display: 'inline-block', padding: '4px 12px', background: '#FEE2E2', color: '#DC2626', borderRadius: '999px', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
          403 UNAUTHORIZED
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1E293B', marginBottom: '8px' }}>Access Denied</h1>
        <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '440px', marginBottom: '20px' }}>
          {authenticatedUser
            ? <>Account <strong>@{authenticatedUser.username}</strong> with role <code>{authenticatedUser.role}</code> does not have authorization to view this resource.</>
            : <>You must be signed in with an authorized faculty or staff account to access this page.</>}
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          {authenticatedUser && (
            <button
              type="button"
              className="submit-btn"
              style={{ maxWidth: '200px' }}
              onClick={() => {
                const dest = authenticatedUser.role === 'teacher' ? '/teacher/dashboard' : '/';
                window.history.pushState(null, '', dest);
                setCurrentPath(dest);
              }}
            >
              My Dashboard
            </button>
          )}
          <button type="button" className="submit-btn" style={{ maxWidth: '160px', background: '#64748B' }} onClick={handleLogout}>
            {authenticatedUser ? 'Sign Out' : 'Sign In'}
          </button>
        </div>
      </main>
    )
  }

  // 3. Teacher Route Protection Guard (/teacher/*) for Authenticated Non-Teachers
  if (authenticatedUser && currentPath.startsWith('/teacher') && authenticatedUser.role.toLowerCase() !== 'teacher') {
    return (
      <main className="auth-access-message" role="status" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>🚫</div>
        <div style={{ display: 'inline-block', padding: '4px 12px', background: '#FEE2E2', color: '#DC2626', borderRadius: '999px', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
          403 FORBIDDEN
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1E293B', marginBottom: '8px' }}>Teacher Portal Access Restricted</h1>
        <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '440px', marginBottom: '20px' }}>
          Account <strong>@{authenticatedUser.username}</strong> is signed in as <code>{authenticatedUser.role}</code>. The requested teacher route <code>{currentPath}</code> is strictly restricted to assigned teaching faculty.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="submit-btn"
            style={{ maxWidth: '200px' }}
            onClick={() => {
              window.history.pushState(null, '', '/');
              setCurrentPath('/');
            }}
          >
            Go to My Dashboard
          </button>
          <button type="button" className="submit-btn" style={{ maxWidth: '160px', background: '#64748B' }} onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </main>
    )
  }

  // 3b. Student Route Protection Guard (/student/*) for Authenticated Non-Students
  if (authenticatedUser && currentPath.startsWith('/student') && authenticatedUser.role.toLowerCase() !== 'student') {
    return (
      <main className="auth-access-message" role="status" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: '24px', textAlign: 'center' }}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>🚫</div>
        <div style={{ display: 'inline-block', padding: '4px 12px', background: '#FEE2E2', color: '#DC2626', borderRadius: '999px', fontSize: '12px', fontWeight: 700, marginBottom: '12px' }}>
          403 FORBIDDEN
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1E293B', marginBottom: '8px' }}>Student Portal Access Restricted</h1>
        <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '440px', marginBottom: '20px' }}>
          Account <strong>@{authenticatedUser.username}</strong> is signed in as <code>{authenticatedUser.role}</code>. The requested student route <code>{currentPath}</code> is strictly restricted to enrolled students.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="submit-btn"
            style={{ maxWidth: '200px' }}
            onClick={() => {
              window.history.pushState(null, '', '/');
              setCurrentPath('/');
            }}
          >
            Go to My Dashboard
          </button>
          <button type="button" className="submit-btn" style={{ maxWidth: '160px', background: '#64748B' }} onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </main>
    )
  }

  // 4. Shared Page: Forced or Voluntary Password Change (/change-password)
  if (authenticatedUser && (authenticatedUser.mustChangePassword || currentPath === '/change-password')) {
    return (
      <main className="auth-access-message" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: '24px' }}>
        <form onSubmit={handleRequiredPasswordChange} style={{ width: 'min(100%, 440px)', padding: '32px', borderRadius: '16px', background: '#fff', boxShadow: '0 12px 36px rgba(15, 23, 42, .12)' }}>
          <h1 style={{ margin: '0 0 8px', color: '#1E3A5F', fontSize: '24px' }}>
            {authenticatedUser.mustChangePassword ? 'Set your new password' : 'Change account password'}
          </h1>
          <p style={{ margin: '0 0 24px', color: '#64748B' }}>
            {authenticatedUser.mustChangePassword
              ? 'For account security, change your temporary password before continuing.'
              : 'Enter your current password and choose a secure new password.'}
          </p>
          {requiredPasswordError && <div role="alert" style={{ marginBottom: '16px', color: '#B91C1C' }}>{requiredPasswordError}</div>}
          <label style={{ display: 'block', marginBottom: '16px', color: '#334155' }}>Current password
            <input required type="password" autoComplete="current-password" value={requiredCurrentPassword} onChange={(event) => setRequiredCurrentPassword(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '11px 12px', border: '1px solid #CBD5E1', borderRadius: '8px' }} />
          </label>
          <label style={{ display: 'block', marginBottom: '16px', color: '#334155' }}>New password
            <input required type="password" autoComplete="new-password" value={requiredNewPassword} onChange={(event) => setRequiredNewPassword(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '11px 12px', border: '1px solid #CBD5E1', borderRadius: '8px' }} />
          </label>
          <label style={{ display: 'block', marginBottom: '20px', color: '#334155' }}>Confirm new password
            <input required type="password" autoComplete="new-password" value={requiredConfirmPassword} onChange={(event) => setRequiredConfirmPassword(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '6px', padding: '11px 12px', border: '1px solid #CBD5E1', borderRadius: '8px' }} />
          </label>
          <button type="submit" disabled={requiredPasswordLoading} className="submit-btn" style={{ width: '100%' }}>{requiredPasswordLoading ? 'Updating…' : 'Update password'}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
            {!authenticatedUser.mustChangePassword && (
              <button
                type="button"
                onClick={() => {
                  const dest = authenticatedUser.role === 'teacher' ? '/teacher/dashboard' : '/';
                  window.history.pushState(null, '', dest);
                  setCurrentPath(dest);
                }}
                style={{ border: 0, background: 'transparent', color: '#2563EB', cursor: 'pointer', fontSize: '14px' }}
              >
                &larr; Back to Dashboard
              </button>
            )}
            <button type="button" onClick={handleLogout} style={{ border: 0, background: 'transparent', color: '#475569', cursor: 'pointer', fontSize: '14px' }}>Sign out</button>
          </div>
        </form>
      </main>
    )
  }

  if (authenticatedUser) {
    const role = authenticatedUser.role.toLowerCase()

    const Dashboard =
      role === 'administrator' || role === 'system_admin' || role === 'principal' || role === 'accountant'
        ? AdminDashboard
        : role === 'teacher'
          ? TeacherDashboard
          : role === 'student'
            ? StudentDashboard
            : role === 'librarian'
              ? LibrarianDashboard
              : role === 'registrar'
                ? RegistrarDashboard
                  : role === 'guardian'
                  ? ParentDashboard
                  : null

    if (!Dashboard) {
      return (
        <main className="auth-access-message" role="status" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>Access Denied (/unauthorized)</h1>
          <p style={{ fontSize: '14px', color: '#64748B', maxWidth: '440px', marginBottom: '20px' }}>
            Account <strong>@{authenticatedUser.username}</strong> with role <code>{authenticatedUser.role}</code> does not have an active portal dashboard assigned. Please contact the school administrator.
          </p>
          <button type="button" className="submit-btn" style={{ maxWidth: '200px' }} onClick={handleLogout}>Sign out to Login</button>
        </main>
      )
    }

    const dashboardUser = { username: authenticatedUser.username, role: authenticatedUser.role, permissions: authenticatedUser.permissions, staffName: authenticatedUser.staffName }
    const dashboard = Dashboard === AdminDashboard
      ? <AdminDashboard user={dashboardUser} onLogout={handleLogout} />
      : Dashboard === TeacherDashboard
        ? <TeacherDashboard teacherName={authenticatedUser.username} teacherUsername={authenticatedUser.username} onLogout={handleLogout} />
        : Dashboard === StudentDashboard
          ? <StudentDashboard user={dashboardUser} onLogout={handleLogout} />
          : Dashboard === LibrarianDashboard
            ? <LibrarianDashboard user={dashboardUser} onLogout={handleLogout} />
            : Dashboard === RegistrarDashboard
              ? <RegistrarDashboard user={dashboardUser} onLogout={handleLogout} />
              : <ParentDashboard user={dashboardUser} onLogout={handleLogout} />

    return (
      <div className="dashboard-theme-root" data-dashboard-theme={dashboardTheme}>
        {dashboard}
        {/* Dashboards with their own topbar bell icon (Admin & Teacher) do not use the floating widget. */}
        {Dashboard !== AdminDashboard && Dashboard !== TeacherDashboard && <NotificationCenter />}
        {themeToggleAnchor && createPortal(<button
          type="button"
          className="dashboard-theme-toggle"
          aria-label={`Switch to ${dashboardTheme === 'dark' ? 'light' : 'dark'} theme`}
          aria-pressed={dashboardTheme === 'dark'}
          onClick={() => {
            const nextTheme = dashboardTheme === 'dark' ? 'light' : 'dark'
            setDashboardTheme(nextTheme)
            localStorage.setItem(`hspsms-theme:${authenticatedUser.id}`, nextTheme)
          }}
        >
          <span aria-hidden="true">{dashboardTheme === 'dark' ? '☀' : '☾'}</span>
        </button>, themeToggleAnchor)}
      </div>
    )
  }

  return (
    <div className="public-shell">
      <header className="public-topbar">
        <div className="public-brand-wrap">
          <div className="hero-logo-icon small">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>

          <div>
            <strong>{home.school.name}</strong>
            <span>{home.school.tagline}</span>
          </div>
        </div>

        <nav className="public-nav" aria-label="Main navigation">
          <a href="#home">Home</a>
          <a href="#about">About</a>
          <a href="#programs">Academic Streams</a>
          <a href="#news">Announcements</a>
          <a href="#contact">Contact</a>
        </nav>

        <button type="button" className="public-nav-cta" onClick={() => {
          setAuthMode('signin')
          document.getElementById('portal')?.scrollIntoView({ behavior: 'smooth' })
        }}>
          Portal Login
        </button>
      </header>

      <main className="public-main" id="home">
        <section className="public-hero" id="about">
          <div className="public-hero-copy">
            <p className="public-kicker">{home.school.tagline}</p>
            <h1>{home.school.heroTitle}</h1>
            <p className="public-subtitle">{home.school.heroSubtitle}</p>

            <div className="public-cta-row" id="admissions">
              <button type="button" className="public-primary-btn" onClick={() => {
                setAuthMode('register')
                document.getElementById('portal')?.scrollIntoView({ behavior: 'smooth' })
              }}>
                {home.school.ctaLabel}
              </button>
              <button type="button" className="public-secondary-btn" onClick={() => {
                setAuthMode('signin')
                document.getElementById('portal')?.scrollIntoView({ behavior: 'smooth' })
              }}>
                Staff Portal
              </button>
            </div>

            <div className="public-metrics">
              <div>
                <strong>{home.stats.students.toLocaleString()}</strong>
                <span>Enrolled Students</span>
              </div>
              <div>
                <strong>{home.stats.teachers}</strong>
                <span>Certified Teachers</span>
              </div>
              <div>
                <strong>{home.stats.programs}</strong>
                <span>Academic Streams</span>
              </div>
              <div>
                <strong>{home.stats.community}+</strong>
                <span>Years of Excellence</span>
              </div>
            </div>
          </div>

          <aside className="public-feature-card">
            <div className="feature-card-header">
              <span>Institutional Creed</span>
              <strong>“{home.school.motto}”</strong>
            </div>

            <ul className="feature-list">
              {home.highlights.map((item) => (
                <li key={item.title}>
                  <span className="feature-dot" aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </section>

        <section className="public-programs" id="programs">
          <div className="section-header">
            <span>Academic Pathways</span>
            <h2>Comprehensive Secondary &amp; Preparatory Education</h2>
            <p className="section-subtitle">
              Fully aligned with the Ethiopian National Curriculum, fostering academic rigor, moral integrity, and practical scientific competence.
            </p>
          </div>

          <div className="programs-grid">
            <div className="program-card">
              <div className="program-badge">Grades 9 &amp; 10</div>
              <h3>General Secondary Foundation</h3>
              <p>Core curriculum covering Mathematics, Biology, Chemistry, Physics, English, National Languages, Social Studies, and ICT to build strong intellectual foundations.</p>
              <ul className="program-points">
                <li>Continuous Assessment &amp; Model Exams</li>
                <li>Stream Orientation &amp; Counseling</li>
                <li>Digital Literacy &amp; Basic Computing</li>
              </ul>
            </div>

            <div className="program-card highlight-card">
              <div className="program-badge badge-accent">Grades 11 &amp; 12</div>
              <h3>Natural Science Preparatory Stream</h3>
              <p>Specialized preparatory track for prospective engineers, medical professionals, computing specialists, and applied natural science scholars.</p>
              <ul className="program-points">
                <li>Advanced Physics, Chemistry &amp; Biology</li>
                <li>Technical Drawing &amp; Engineering Math</li>
                <li>Hands-on Wet &amp; Dry Laboratory Practicals</li>
              </ul>
            </div>

            <div className="program-card">
              <div className="program-badge">Grades 11 &amp; 12</div>
              <h3>Social Science Preparatory Stream</h3>
              <p>Comprehensive humanities and commerce track developing analytical thinking, economic literacy, historical perspective, and civic leadership.</p>
              <ul className="program-points">
                <li>Economics, Geography &amp; History</li>
                <li>General Business &amp; Accounting Intro</li>
                <li>Debate, Rhetoric &amp; Legal Studies Basics</li>
              </ul>
            </div>

            <div className="program-card">
              <div className="program-badge">Campus Facilities</div>
              <h3>Modern STEM &amp; Digital Infrastructure</h3>
              <p>Equipped facilities designed to support modern education, experiential learning, and digital administrative workflows.</p>
              <ul className="program-points">
                <li>Dedicated Chemistry, Physics &amp; Biology Labs</li>
                <li>Automated Digital Library with Lending Tracker</li>
                <li>Online Parent Portal &amp; SMS Absence Alerts</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="public-columns" id="academics">
          <div className="public-news" id="news">
            <div className="section-header">
              <span>School News</span>
              <h2>Latest announcements</h2>
            </div>

            {home.announcements.map((item) => (
              <article key={item.id} className="announcement-item">
                <div className="announcement-tag">Update</div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                {item.publishedAt && (
                  <small>
                    {new Date(item.publishedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </small>
                )}
              </article>
            ))}
          </div>

          <aside className="public-contact-card" id="contact">
            <div className="section-header compact">
              <span>Visit Us</span>
              <h2>Connect with the school</h2>
            </div>

            <div className="contact-list">
              <div>
                <label>Address</label>
                <p>{home.school.address}</p>
              </div>
              <div>
                <label>Phone</label>
                <p>{home.school.phone}</p>
              </div>
              <div>
                <label>Email</label>
                <p>{home.school.email}</p>
              </div>
            </div>
          </aside>
        </section>
      </main>

      <div className="public-auth-shell" id="portal">
        <div className="login-container">
          <div className="login-hero">
            <div>
              <div className="hero-brand">
                <div className="hero-logo-icon">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                  </svg>
                </div>
                <div className="hero-brand-text">
                  <h2>{home.school.name} PORTAL</h2>
                  <span>School Management ERP</span>
                </div>
              </div>

              <div className="hero-main">
                <h1>
                  Unified School <span>ERP System</span>
                </h1>
                <p className="hero-desc">
                  {home.school.motto} Sign in for academic management, attendance, examinations, and school services.
                </p>

                <div className="hero-tags">
                  <div className="hero-tag">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    Grades 9–12
                  </div>
                  <div className="hero-tag">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Natural &amp; Social Streams
                  </div>
                  <div className="hero-tag">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Role-Based Portals
                  </div>
                </div>

                <div className="hero-highlights">
                  <div className="highlight-item">
                    <div className="highlight-dot">
                      <svg fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span>Automated attendance &amp; real-time guardian absence alerts</span>
                  </div>
                  <div className="highlight-item">
                    <div className="highlight-dot">
                      <svg fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span>Stream-aware Grade 11–12 assessments &amp; report cards</span>
                  </div>
                  <div className="highlight-item">
                    <div className="highlight-dot">
                      <svg fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span>Atomic fee invoicing, payment receipts, &amp; Chapa ready</span>
                  </div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.78)' }}>
                    🔒 256-Bit SSL Encrypted • Official Institutional Gateway
                  </div>
                </div>
              </div>
            </div>

            <div className="hero-footer">
              <span>HSPSMS Academic Portal • 2026/27 (2019 E.C.)</span>
              <div className="system-status">
                <span className="status-pulse"></span>
                System Operational • Cloud Verified
              </div>
            </div>
          </div>

          <div className="login-form-panel">
            {!authenticatedUser ? (
              <>
                <div className="auth-mode-switch">
                  <button
                    type="button"
                    className={`auth-mode-tab ${authMode === 'signin' ? 'active' : ''}`}
                    onClick={() => {
                      setAuthMode('signin')
                      setErrorMessage(null)
                    }}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Sign In
                  </button>
                  <button
                    type="button"
                    className={`auth-mode-tab ${authMode === 'register' ? 'active' : ''}`}
                    onClick={() => {
                      setAuthMode('register')
                      setErrorMessage(null)
                      setSuccessMessage(null)
                    }}
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Create as New
                  </button>
                </div>

                {errorMessage && (
                  <div className="alert-banner alert-danger" role="alert" aria-live="polite">
                    <svg className="alert-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{errorMessage}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="alert-banner alert-success">
                    <svg className="alert-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{successMessage}</span>
                  </div>
                )}

                {showMfaModal ? (
                  <div className="mfa-challenge-panel">
                    <div className="form-header">
                      <h2>Two-Factor Verification</h2>
                      <p>Enter the 6-digit code generated by your mobile authenticator app, or an 8-character recovery backup code.</p>
                    </div>

                    {mfaError && (
                      <div className="alert-banner alert-danger" role="alert">
                        <svg className="alert-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{mfaError}</span>
                      </div>
                    )}

                    <form className="login-form" onSubmit={handleMfaSubmit}>
                      <div className="input-group">
                        <label className="input-label" htmlFor="mfa-code">
                          Verification or Backup Code
                        </label>
                        <div className="input-wrapper">
                          <svg className="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <input
                            id="mfa-code"
                            type="text"
                            autoFocus
                            autoComplete="one-time-code"
                            className="form-input"
                            style={{ letterSpacing: '2px', fontFamily: 'monospace', fontSize: '1.2rem', textAlign: 'center' }}
                            placeholder="123456"
                            value={mfaCode}
                            onChange={(e) => setMfaCode(e.target.value.toUpperCase())}
                            required
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="submit-btn"
                        disabled={mfaLoading || !mfaCode.trim()}
                        style={{ marginTop: '16px' }}
                      >
                        {mfaLoading ? 'Verifying...' : 'Verify & Continue'}
                      </button>

                      <button
                        type="button"
                        className="text-btn"
                        style={{ marginTop: '12px', width: '100%', textAlign: 'center', background: 'none', border: 'none', color: 'var(--primary-color, #2563eb)', cursor: 'pointer', padding: '8px' }}
                        onClick={() => {
                          setShowMfaModal(false)
                          setMfaTempToken(null)
                          setMfaCode('')
                          setMfaError(null)
                        }}
                      >
                        ← Back to standard sign in
                      </button>
                    </form>
                  </div>
                ) : authMode === 'signin' ? (
                  <>
                    <div className="form-header">
                      <h2>Sign in to Account</h2>
                      <p>Enter your school account credentials. Your access is loaded securely after sign-in.</p>
                    </div>

                    <form className="login-form" onSubmit={handleLogin}>
                      <div className="input-group">
                        <label className="input-label" htmlFor="loginRole">
                          Sign in as
                        </label>
                        <select
                          id="loginRole"
                          className="form-select"
                          value={loginRole}
                          onChange={(e) => setLoginRole(e.target.value as any)}
                        >
                          <option value="student">Student</option>
                          <option value="guardian">Parent / Guardian</option>
                          <option value="teacher">Teacher / Faculty</option>
                          <option value="registrar">Registrar</option>
                          <option value="librarian">Librarian</option>
                          <option value="administrator">Administrator</option>
                        </select>
                      </div>

                      <div className="input-group">
                        <label className="input-label" htmlFor="username">
                          Username or Email
                        </label>
                        <div className="input-wrapper">
                          <svg className="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7 7z" />
                          </svg>
                          <input
                            id="username"
                            type="text"
                            autoComplete="username"
                            className="form-input"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="input-group">
                        <label className="input-label" htmlFor="password">
                          Password
                        </label>
                        <div className="input-wrapper">
                          <svg className="input-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                          <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            className="form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                          />
                          <button
                            type="button"
                            className="toggle-password-btn"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? (
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                              </svg>
                            ) : (
                              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="form-actions-row">
                        <label className="remember-me">
                          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                          <span>Remember this device</span>
                        </label>
                        <button
                          type="button"
                          className="forgot-password-link"
                          onClick={() => setForgotModalOpen(true)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                          Forgot password?
                        </button>
                      </div>

                      <button type="submit" className="submit-btn" disabled={isLoading}>
                        {isLoading ? (
                          <>
                            <div className="spinner"></div>
                            <span>Authenticating...</span>
                          </>
                        ) : (
                          <>
                            <span>Sign in to Dashboard</span>
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                          </>
                        )}
                      </button>
                    </form>

                    <div className="switch-mode-footer">
                      <span>Don't have an account yet?</span>
                      <button
                        type="button"
                        className="switch-mode-btn"
                        onClick={() => {
                          setAuthMode('register')
                          setErrorMessage(null)
                        }}
                      >
                        Create as new
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-header">
                      <h2>Create as New Account</h2>
                      <p>Choose your role. Staff and administrator accounts require school approval before sign-in.</p>
                    </div>

                    <form className="login-form" onSubmit={handleRegister}>
                      <div className="input-group">
                        <label className="input-label" htmlFor="regRole">
                          Account Role
                        </label>
                        <select id="regRole" className="form-select" value={regRole} onChange={(e) => setRegRole(e.target.value as any)}>
                          <option value="student">Student (Grade 9–12)</option>
                          <option value="guardian">Parent / Guardian</option>
                          <option value="teacher">Teacher / Faculty</option>
                          <option value="registrar">Registrar</option>
                          <option value="librarian">Librarian</option>
                          <option value="administrator">Administrator</option>
                        </select>
                      </div>
                      {regRole !== 'student' && regRole !== 'guardian' && (
                        <div className="alert-banner alert-success" role="status">
                          This role requires approval by a school administrator before the account can sign in.
                        </div>
                      )}

                      <div className="form-row-2col">
                        <div className="input-group">
                          <label className="input-label" htmlFor="regFirstName">
                            First Name
                          </label>
                          <input
                            id="regFirstName"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Hana"
                            style={{ paddingLeft: '14px' }}
                            value={regFirstName}
                            onChange={(e) => setRegFirstName(e.target.value)}
                            required
                          />
                        </div>
                        <div className="input-group">
                          <label className="input-label" htmlFor="regLastName">
                            Last Name
                          </label>
                          <input
                            id="regLastName"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Bekele"
                            style={{ paddingLeft: '14px' }}
                            value={regLastName}
                            onChange={(e) => setRegLastName(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <div className="form-row-2col">
                        <div className="input-group">
                          <label className="input-label" htmlFor="regEmail">
                            Email Address
                          </label>
                          <input
                            id="regEmail"
                            type="email"
                            className="form-input"
                            placeholder="name@example.com"
                            style={{ paddingLeft: '14px' }}
                            value={regEmail}
                            onChange={(e) => setRegEmail(e.target.value)}
                            required
                          />
                        </div>
                        <div className="input-group">
                          <label className="input-label" htmlFor="regPhone">
                            Phone Number
                          </label>
                          <input
                            id="regPhone"
                            type="text"
                            className="form-input"
                            placeholder="+251911223344"
                            style={{ paddingLeft: '14px' }}
                            value={regPhone}
                            onChange={(e) => setRegPhone(e.target.value)}
                          />
                        </div>
                      </div>

                      {regRole === 'student' && (
                        <div className="form-row-2col">
                          <div className="input-group">
                            <label className="input-label" htmlFor="regGrade">
                              Grade Level
                            </label>
                            <select id="regGrade" className="form-select" value={regGrade} onChange={(e) => setRegGrade(e.target.value)}>
                              <option value="9">Grade 9</option>
                              <option value="10">Grade 10</option>
                              <option value="11">Grade 11 (Preparatory)</option>
                              <option value="12">Grade 12 (Preparatory)</option>
                            </select>
                          </div>
                          <div className="input-group">
                            <label className="input-label" htmlFor="regStream">
                              Stream
                            </label>
                            {Number(regGrade) >= 11 ? (
                              <select id="regStream" className="form-select" value={regStream} onChange={(e) => setRegStream(e.target.value)}>
                                <option value="Natural Science">Natural Science</option>
                                <option value="Social Science">Social Science</option>
                              </select>
                            ) : (
                              <input type="text" className="form-input" value="Common Curriculum" disabled style={{ paddingLeft: '14px', background: '#EEF2F6', color: '#64748B' }} />
                            )}
                          </div>
                        </div>
                      )}

                      <div className="input-group">
                        <label className="input-label" htmlFor="regIdNumber">
                          {regRole === 'student'
                            ? 'Admission / Student Number'
                            : regRole === 'guardian'
                              ? 'Student Admission No to Link'
                              : 'Staff / Employee Number'}
                        </label>
                        <input
                          id="regIdNumber"
                          type="text"
                          className="form-input"
                          placeholder={
                            regRole === 'student'
                              ? 'e.g. HS-2026-0457'
                              : regRole === 'guardian'
                                ? 'e.g. HS-2026-0457'
                                : 'e.g. EMP-1044'
                          }
                          style={{ paddingLeft: '14px' }}
                          value={regIdNumber}
                          onChange={(e) => setRegIdNumber(e.target.value)}
                        />
                      </div>

                      <div className="form-row-2col">
                        <div className="input-group">
                          <label className="input-label" htmlFor="regPassword">
                            Password
                          </label>
                          <input
                            id="regPassword"
                            type="password"
                            className="form-input"
                            placeholder="At least 6 characters"
                            style={{ paddingLeft: '14px' }}
                            value={regPassword}
                            onChange={(e) => setRegPassword(e.target.value)}
                            required
                          />
                        </div>
                        <div className="input-group">
                          <label className="input-label" htmlFor="regConfirmPassword">
                            Confirm Password
                          </label>
                          <input
                            id="regConfirmPassword"
                            type="password"
                            className="form-input"
                            placeholder="Re-enter password"
                            style={{ paddingLeft: '14px' }}
                            value={regConfirmPassword}
                            onChange={(e) => setRegConfirmPassword(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <button type="submit" className="submit-btn" disabled={isLoading}>
                        {isLoading ? (
                          <>
                            <div className="spinner"></div>
                            <span>Creating Account...</span>
                          </>
                        ) : (
                          <>
                            <span>Complete Registration</span>
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                          </>
                        )}
                      </button>
                    </form>

                    <div className="switch-mode-footer">
                      <span>Already have an account?</span>
                      <button
                        type="button"
                        className="switch-mode-btn"
                        onClick={() => {
                          setAuthMode('signin')
                          setErrorMessage(null)
                        }}
                      >
                        Sign in to Account
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : null}

            {forgotModalOpen && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(15, 23, 42, 0.6)',
                  backdropFilter: 'blur(4px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 50,
                  padding: '16px'
                }}
              >
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '32px',
                    maxWidth: '420px',
                    width: '100%',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                  }}
                >
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1F3A5F', marginBottom: '8px' }}>
                    Reset Your Password
                  </h3>
                  <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px' }}>
                    Enter the email associated with your school account.
                  </p>

                  {!forgotSubmitted ? (
                    <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {forgotError && (
                        <div className="alert-banner alert-danger" style={{ padding: '8px 12px', fontSize: '12px' }}>
                          <span>{forgotError}</span>
                        </div>
                      )}
                      <label className="input-label" htmlFor="forgotEmail">Email address</label>
                      <input
                        id="forgotEmail"
                        type="email"
                        className="form-input"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={forgotEmail}
                        onChange={(e) => {
                          setForgotEmail(e.target.value)
                          setForgotError(null)
                        }}
                        required
                        style={{ padding: '10px 14px' }}
                      />
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                        <button
                          type="button"
                          className="role-pill"
                          onClick={() => {
                            setForgotModalOpen(false)
                            setForgotSubmitted(false)
                            setForgotEmail('')
                          }}
                        >
                          Cancel
                        </button>
                        <button type="submit" className="submit-btn" disabled={forgotLoading} style={{ height: '38px', padding: '0 16px', fontSize: '13px', margin: 0 }}>
                          {forgotLoading ? 'Requesting…' : 'Send Reset Link'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div>
                      <div className={`alert-banner ${forgotMessage.includes('unavailable') ? 'alert-danger' : 'alert-success'}`} style={{ marginBottom: '16px' }} role="status">
                        <span>{forgotMessage}</span>
                      </div>
                      <button
                        type="button"
                        className="submit-btn"
                        style={{ height: '38px', width: '100%', fontSize: '13px', margin: 0 }}
                        onClick={() => {
                          setForgotModalOpen(false)
                          setForgotSubmitted(false)
                          setForgotEmail('')
                          setForgotMessage('')
                        }}
                      >
                        Back to Sign In
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {resetToken && (
              <div className="auth-modal-backdrop">
                <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
                  <h2 id="reset-title">Choose a new password</h2>
                  {resetSubmitted ? (
                    <>
                      <div className="alert-banner alert-success" role="status">Password updated. Sign in with your new password.</div>
                      <button type="button" className="submit-btn" onClick={() => {
                        setResetToken(null)
                        setResetSubmitted(false)
                        setAuthMode('signin')
                      }}>Return to sign in</button>
                    </>
                  ) : (
                    <form className="login-form" onSubmit={handleResetPassword}>
                      {resetError && <div className="alert-banner alert-danger" role="alert">{resetError}</div>}
                      <div className="input-group">
                        <label className="input-label" htmlFor="newPassword">New password</label>
                        <input id="newPassword" className="form-input" type="password" autoComplete="new-password" minLength={6} value={resetPasswordValue} onChange={(event) => setResetPasswordValue(event.target.value)} required />
                      </div>
                      <div className="input-group">
                        <label className="input-label" htmlFor="confirmNewPassword">Confirm new password</label>
                        <input id="confirmNewPassword" className="form-input" type="password" autoComplete="new-password" minLength={6} value={resetPasswordConfirm} onChange={(event) => setResetPasswordConfirm(event.target.value)} required />
                      </div>
                      <button type="submit" className="submit-btn" disabled={resetLoading}>{resetLoading ? 'Updating…' : 'Update password'}</button>
                    </form>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="footer-col brand-col">
            <div className="public-brand-wrap">
              <div className="hero-logo-icon small">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                </svg>
              </div>
              <div>
                <strong>{home.school.name}</strong>
                <span>{home.school.tagline}</span>
              </div>
            </div>
            <p className="footer-desc">
              Accredited Secondary and Preparatory Institution serving Grades 9 through 12. Committed to rigorous academics, scientific inquiry, and civic excellence.
            </p>
            <div className="footer-cert">
              <span>Federal Democratic Republic of Ethiopia • Ministry of Education Standard</span>
            </div>
          </div>

          <div className="footer-col">
            <h4>Academic Streams</h4>
            <ul>
              <li><a href="#programs">General Secondary (Grades 9–10)</a></li>
              <li><a href="#programs">Natural Science Stream (Grades 11–12)</a></li>
              <li><a href="#programs">Social Science Stream (Grades 11–12)</a></li>
              <li><a href="#programs">STEM &amp; Practical Laboratories</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Institutional Access</h4>
            <ul>
              <li><a href="#portal" onClick={() => setAuthMode('signin')}>Student Gradebook &amp; Portal</a></li>
              <li><a href="#portal" onClick={() => setAuthMode('signin')}>Teacher Academic Workspace</a></li>
              <li><a href="#portal" onClick={() => setAuthMode('signin')}>Guardian Attendance &amp; Fees</a></li>
              <li><a href="#portal" onClick={() => setAuthMode('register')}>New Student Admission Application</a></li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Campus &amp; Office</h4>
            <address className="footer-address">
              <p>📍 {home.school.address}</p>
              <p>📞 {home.school.phone}</p>
              <p>✉️ {home.school.email}</p>
              <p>🕒 Mon – Fri: 8:00 AM – 5:00 PM (EAT)</p>
            </address>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} {home.school.name}. All rights reserved.</p>
          <div className="footer-legal-links">
            <span>High School &amp; Preparatory School Management System (HSPSMS v4.2)</span>
            <span>Privacy &amp; Data Protection Compliant</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
