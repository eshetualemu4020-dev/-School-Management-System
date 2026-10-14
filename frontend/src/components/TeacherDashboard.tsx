import { useState, useEffect, useId, useMemo, type FormEvent } from 'react'
import '../TeacherDashboard.css'
import { api } from '../api/client'
import TeacherReports from './TeacherReports'

interface TeacherDashboardProps {
  teacherName?: string
  teacherUsername?: string
  onLogout: () => void
}

interface AssignedClass {
  teaching_assignment_id: number
  section_id: number
  section_name: string
  grade_level: number
  grade_name: string
  subject_id: number
  subject_name: string
  subject_code: string
  stream: string
  student_count: number
  capacity: number
}

interface StudentAttendanceRecord {
  enrollmentId: number
  studentId: number
  admissionNo: string
  studentName: string
  rollNo: number
  statusCode: 'present' | 'absent' | 'late' | 'excused'
  note: string
}

interface AssessmentItem {
  id: number
  title: string
  max_score: number
  weight: number
  assessment_date: string
  status: 'draft' | 'open' | 'closed'
  section_id: number
  section_name: string
  subject_id?: number
  subject_name: string
  assessment_type_name: string
  term_name?: string
  marks_submission_status?: 'draft' | 'submitted' | 'locked'
  submission_count?: number
}

interface StudentMarkRecord {
  enrollmentId: number
  studentId: number
  admissionNo: string
  studentName: string
  rollNo: number
  score: string
  feedback: string
  status: 'draft' | 'submitted' | 'locked'
}

interface TeacherSubject {
  id: number
  code: string
  name: string
  name_am?: string
}

interface AcademicTerm {
  id: number
  academic_year_id: number
  name: string
  start_date: string
  end_date: string
  is_active: boolean
}

export default function TeacherDashboard({
  teacherName = 'Teacher',
  teacherUsername = '',
  onLogout
}: TeacherDashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'marks' | 'classes' | 'timetable' | 'reports'>('overview')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Core Data from MySQL
  const [assignedClasses, setAssignedClasses] = useState<AssignedClass[]>([])
  const [teacherSubjects, setTeacherSubjects] = useState<TeacherSubject[]>([])
  const [terms, setTerms] = useState<AcademicTerm[]>([])
  const [timetable, setTimetable] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [overviewMetrics, setOverviewMetrics] = useState<{
    assignedSections: number
    assignedClasses: number
    todayAttendanceRecorded: number
    totalAssessments: number
    draftAssessments: number
  }>({
    assignedSections: 0,
    assignedClasses: 0,
    todayAttendanceRecorded: 0,
    totalAssessments: 0,
    draftAssessments: 0
  })

  // Attendance State with Subject Selector
  const [attSubjectId, setAttSubjectId] = useState<number | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
  const [attDate, setAttDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [attendanceList, setAttendanceList] = useState<StudentAttendanceRecord[]>([])
  const [attIsLocked, setAttIsLocked] = useState<boolean>(false)
  const [attIsSaving, setAttIsSaving] = useState<boolean>(false)

  // Marks State with Filters & Assessment List View
  const [marksFilterSubjectId, setMarksFilterSubjectId] = useState<number | null>(null)
  const [marksFilterSectionId, setMarksFilterSectionId] = useState<number | null>(null)
  const [marksFilterTermId, setMarksFilterTermId] = useState<number | null>(null)
  const [marksViewMode, setMarksViewMode] = useState<'list' | 'entry'>('list')
  const [isAssessmentsLoading, setIsAssessmentsLoading] = useState<boolean>(false)
  const [assessmentsError, setAssessmentsError] = useState<string | null>(null)
  const [assessments, setAssessments] = useState<AssessmentItem[]>([])
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<number | null>(null)
  const [activeAssessment, setActiveAssessment] = useState<AssessmentItem | null>(null)
  const [marksList, setMarksList] = useState<StudentMarkRecord[]>([])
  const [marksIsSaving, setMarksIsSaving] = useState<boolean>(false)
  const [isDirtyMarks, setIsDirtyMarks] = useState<boolean>(false)

  // Create Assessment Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false)
  const [assessmentTypes, setAssessmentTypes] = useState<any[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newAssignmentId, setNewAssignmentId] = useState<number | null>(null)
  const [newTermId, setNewTermId] = useState<number | null>(null)
  const [newMaxScore, setNewMaxScore] = useState('30')
  const [newWeight, setNewWeight] = useState('30')
  const [newTypeId, setNewTypeId] = useState<number>(4)

  // Accessibility IDs
  const searchInputId = useId()
  const attSubSelectId = useId()
  const attSectionId = useId()
  const attDateId = useId()
  const marksSubjectFilterId = useId()
  const marksSectionFilterId = useId()
  const marksTermFilterId = useId()

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // Load teacher dashboard and initial assigned classes & subjects from MySQL
  const loadInitialData = async () => {
    setIsLoading(true)
    setApiError(null)
    try {
      const [dashData, classes, subjectsList, termsList, types] = await Promise.all([
        api.getDashboard(),
        api.getAssignedClasses(),
        api.getTeacherSubjects().catch(() => []),
        api.getTerms().catch(() => []),
        api.getAssessmentTypes().catch(() => [])
      ])

      setOverviewMetrics(dashData.overview)
      setAssignedClasses(classes)
      setTeacherSubjects(subjectsList)
      setTerms(termsList)
      setTimetable(dashData.timetable || [])
      setAnnouncements(dashData.announcements || [])
      setAssessmentTypes(types)

      if (classes.length > 0) {
        setSelectedSectionId(classes[0].section_id)
        setNewAssignmentId(classes[0].teaching_assignment_id)
      }
      if (termsList.length > 0) {
        const activeTerm = termsList.find((t: any) => t.is_active) || termsList[0]
        setNewTermId(activeTerm.id)
      }
    } catch (err: any) {
      setApiError(err.message || 'Failed to connect to backend server.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadInitialData()
  }, [])

  // Attendance: Filter available sections based on selected Subject
  const availableAttSections = useMemo(() => {
    if (!attSubjectId) return assignedClasses
    return assignedClasses.filter((c) => c.subject_id === attSubjectId)
  }, [assignedClasses, attSubjectId])

  // Sync section if attSubjectId causes selectedSectionId to be invalid
  useEffect(() => {
    if (availableAttSections.length > 0) {
      const exists = availableAttSections.some((c) => c.section_id === selectedSectionId)
      if (!exists) {
        setSelectedSectionId(availableAttSections[0].section_id)
      }
    }
  }, [availableAttSections, selectedSectionId])

  // Load attendance session & roster for selected section, subject and date
  useEffect(() => {
    if (!selectedSectionId) return

    const loadAttendance = async () => {
      try {
        const activeClass = assignedClasses.find(
          (c) => c.section_id === selectedSectionId && (!attSubjectId || c.subject_id === attSubjectId)
        ) || assignedClasses.find((c) => c.section_id === selectedSectionId)
        const subId = attSubjectId || (activeClass ? activeClass.subject_id : undefined)

        const sessionData = await api.getAttendanceSession(selectedSectionId, attDate, subId)

        if (sessionData && sessionData.records && sessionData.records.length > 0) {
          // Found existing session in MySQL
          setAttIsLocked(sessionData.session.status === 'locked' || sessionData.session.status === 'submitted')
          setAttendanceList(
            sessionData.records.map((r: any) => ({
              enrollmentId: r.enrollment_id,
              studentId: r.student_id,
              admissionNo: r.admission_no,
              studentName: r.student_name,
              rollNo: r.roll_no || 0,
              statusCode: r.status_code || 'present',
              note: r.note || ''
            }))
          )
        } else {
          // No session yet for this date: load student enrollment roster
          const students = await api.getSectionStudents(selectedSectionId)
          setAttIsLocked(false)
          setAttendanceList(
            students.map((s: any, idx: number) => ({
              enrollmentId: s.enrollment_id,
              studentId: s.student_id,
              admissionNo: s.admission_no,
              studentName: s.full_name,
              rollNo: s.roll_no || idx + 1,
              statusCode: 'present',
              note: ''
            }))
          )
        }
      } catch (err: any) {
        showToast(`Error loading attendance: ${err.message}`)
      }
    }

    loadAttendance()
  }, [selectedSectionId, attDate, attSubjectId, assignedClasses])

  // Filter sections available for Marks filter toolbar based on selected Subject
  const availableMarksSections = useMemo(() => {
    if (!marksFilterSubjectId) return assignedClasses
    return assignedClasses.filter((c) => c.subject_id === marksFilterSubjectId)
  }, [assignedClasses, marksFilterSubjectId])

  // Load assessments when marks tab is active or filters change
  const fetchAssessmentsList = async () => {
    setIsAssessmentsLoading(true)
    setAssessmentsError(null)
    try {
      const list = await api.getAssessments({
        subjectId: marksFilterSubjectId || undefined,
        sectionId: marksFilterSectionId || undefined,
        termId: marksFilterTermId || undefined
      })
      setAssessments(list)
    } catch (err: any) {
      setAssessmentsError(err.message || 'Failed to load assessments.')
    } finally {
      setIsAssessmentsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'marks' || activeTab === 'overview') {
      fetchAssessmentsList()
    }
  }, [activeTab, marksFilterSubjectId, marksFilterSectionId, marksFilterTermId])

  // Load assessment details and marks when selecting an assessment for entry
  const handleOpenAssessment = async (assessment: AssessmentItem) => {
    if (isDirtyMarks) {
      const confirmLeave = window.confirm('You have unsaved marks changes. Do you want to discard them and open this assessment?')
      if (!confirmLeave) return
    }

    setSelectedAssessmentId(assessment.id)
    setActiveAssessment(assessment)
    setIsDirtyMarks(false)
    setMarksViewMode('entry')

    try {
      const data = await api.getAssessmentDetails(assessment.id)
      setActiveAssessment(data.assessment)
      setMarksList(
        data.marks.map((m: any, idx: number) => ({
          enrollmentId: m.enrollment_id,
          studentId: m.student_id,
          admissionNo: m.admission_no,
          studentName: m.student_name,
          rollNo: m.roll_no || idx + 1,
          score: m.score !== null && m.score !== undefined ? String(m.score) : '',
          feedback: m.feedback || '',
          status: m.status || 'draft'
        }))
      )
    } catch (err: any) {
      showToast(`Failed to load marks: ${err.message}`)
    }
  }

  const handleBackToAssessmentList = () => {
    if (isDirtyMarks) {
      const confirmLeave = window.confirm('You have unsaved marks changes. Discard and return to assessment list?')
      if (!confirmLeave) return
    }
    setIsDirtyMarks(false)
    setMarksViewMode('list')
    fetchAssessmentsList()
  }

  // Attendance Handlers
  const handleStatusChange = (enrollmentId: number, statusCode: 'present' | 'absent' | 'late' | 'excused') => {
    if (attIsLocked) return
    setAttendanceList((prev) =>
      prev.map((s) => (s.enrollmentId === enrollmentId ? { ...s, statusCode } : s))
    )
  }

  const handleRemarkChange = (enrollmentId: number, note: string) => {
    if (attIsLocked) return
    setAttendanceList((prev) =>
      prev.map((s) => (s.enrollmentId === enrollmentId ? { ...s, note } : s))
    )
  }

  const markAllPresent = () => {
    if (attIsLocked) return
    setAttendanceList((prev) => prev.map((s) => ({ ...s, statusCode: 'present' })))
    showToast('All students marked as Present!')
  }

  const handleSaveAttendance = async () => {
    if (!selectedSectionId || attendanceList.length === 0) return
    setAttIsSaving(true)
    try {
      const activeClass = assignedClasses.find(
        (c) => c.section_id === selectedSectionId && (!attSubjectId || c.subject_id === attSubjectId)
      ) || assignedClasses.find((c) => c.section_id === selectedSectionId)
      const subId = attSubjectId || (activeClass ? activeClass.subject_id : null)

      const payload = {
        sectionId: selectedSectionId,
        attendanceDate: attDate,
        subjectId: subId,
        status: 'submitted' as const,
        records: attendanceList.map((s) => ({
          enrollmentId: s.enrollmentId,
          statusCode: s.statusCode,
          note: s.note
        }))
      }

      await api.recordAttendance(payload)
      setAttIsLocked(true)
      showToast('Attendance saved persistently in MySQL!')
      const dash = await api.getDashboard()
      setOverviewMetrics(dash.overview)
    } catch (err: any) {
      alert(`Attendance Save Failed: ${err.message}`)
    } finally {
      setAttIsSaving(false)
    }
  }

  // Attendance Counters
  const counts = {
    present: attendanceList.filter((s) => s.statusCode === 'present').length,
    absent: attendanceList.filter((s) => s.statusCode === 'absent').length,
    late: attendanceList.filter((s) => s.statusCode === 'late').length,
    excused: attendanceList.filter((s) => s.statusCode === 'excused').length
  }

  // Marks Handlers
  const maxScore = activeAssessment ? Number(activeAssessment.max_score) : 30

  const handleScoreChange = (enrollmentId: number, score: string) => {
    setIsDirtyMarks(true)
    setMarksList((prev) =>
      prev.map((m) => (m.enrollmentId === enrollmentId ? { ...m, score } : m))
    )
  }

  const handleFeedbackChange = (enrollmentId: number, feedback: string) => {
    setIsDirtyMarks(true)
    setMarksList((prev) =>
      prev.map((m) => (m.enrollmentId === enrollmentId ? { ...m, feedback } : m))
    )
  }

  const hasInvalidScore = marksList.some((m) => {
    if (!m.score) return false
    const num = parseFloat(m.score)
    return isNaN(num) || num < 0 || num > maxScore
  })

  const handleSaveMarks = async (status: 'draft' | 'submitted') => {
    if (!selectedAssessmentId) return
    if (hasInvalidScore) {
      alert(`Validation Error: Please resolve scores exceeding ${maxScore} or negative scores before saving.`)
      return
    }

    setMarksIsSaving(true)
    try {
      const recordsToSave = marksList
        .filter((m) => m.score !== '')
        .map((m) => ({
          enrollmentId: m.enrollmentId,
          score: parseFloat(m.score),
          feedback: m.feedback,
          markStatus: 'scored' as const
        }))

      if (recordsToSave.length === 0) {
        alert('Please enter at least one student mark before saving.')
        setMarksIsSaving(false)
        return
      }

      await api.saveMarks(selectedAssessmentId, status, recordsToSave)
      setIsDirtyMarks(false)

      if (status === 'submitted') {
        showToast('Marks successfully submitted for review!')
      } else {
        showToast('Marks draft persistently saved in MySQL!')
      }

      // Refresh data from server
      const updated = await api.getAssessmentDetails(selectedAssessmentId)
      setActiveAssessment(updated.assessment)
      setMarksList(
        updated.marks.map((m: any, idx: number) => ({
          enrollmentId: m.enrollment_id,
          studentId: m.student_id,
          admissionNo: m.admission_no,
          studentName: m.student_name,
          rollNo: m.roll_no || idx + 1,
          score: m.score !== null && m.score !== undefined ? String(m.score) : '',
          feedback: m.feedback || '',
          status: m.status || status
        }))
      )
    } catch (err: any) {
      alert(`Marks Save Error: ${err.message}`)
    } finally {
      setMarksIsSaving(false)
    }
  }

  const handleCreateAssessment = async (e: FormEvent) => {
    e.preventDefault()
    if (!newAssignmentId) {
      alert('Please select a teaching assignment (class & subject).')
      return
    }

    const termIdToUse = newTermId || (terms.length > 0 ? terms[0].id : 1)

    try {
      await api.createAssessment({
        teachingAssignmentId: newAssignmentId,
        termId: termIdToUse,
        assessmentTypeId: newTypeId,
        title: newTitle,
        maxScore: parseFloat(newMaxScore),
        weight: parseFloat(newWeight),
        assessmentDate: new Date().toISOString().split('T')[0]
      })

      setShowCreateModal(false)
      setNewTitle('')
      showToast('New assessment created in MySQL!')
      fetchAssessmentsList()
    } catch (err: any) {
      alert(`Failed to create assessment: ${err.message}`)
    }
  }

  const currentClassInfo = assignedClasses.find((c) => c.section_id === selectedSectionId)

  return (
    <div className="teacher-shell">
      {/* 1. TOP BAR */}
      <header className="teacher-topbar">
        <div className="topbar-brand">
          <div className="topbar-logo-box">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>
          <div className="topbar-title">
            <h1>HSPSMS PORTAL</h1>
            <span>High School &amp; Preparatory School ERP</span>
          </div>
        </div>

        <div className="topbar-search">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id={searchInputId}
            name="topbarSearch"
            type="text"
            placeholder="Search students, subjects, exams..."
            aria-label="Global search students, subjects, exams"
          />
        </div>

        <div className="topbar-actions">
          <div className="user-profile-badge">
            <div className="user-avatar">{teacherName.charAt(0).toUpperCase()}</div>
            <div className="user-details">
              <div className="user-name">{teacherName}</div>
              <div className="user-role-label">Teacher / Faculty ({teacherUsername})</div>
            </div>
          </div>

          <button type="button" className="topbar-logout-btn" onClick={onLogout}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      {/* 2. BODY LAYOUT */}
      <div className="teacher-layout">
        {/* SIDEBAR NAVIGATION */}
        <aside className="teacher-sidebar">
          <nav className="sidebar-nav">
            <div className="sidebar-nav-title">Teacher Menu</div>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'attendance' ? 'active' : ''}`}
              onClick={() => setActiveTab('attendance')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <span>Attendance</span>
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'marks' ? 'active' : ''}`}
              onClick={() => setActiveTab('marks')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>Marks Entry</span>
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Teacher Reports</span>
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'classes' ? 'active' : ''}`}
              onClick={() => setActiveTab('classes')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span>My Classes ({assignedClasses.length})</span>
            </button>

            <button
              type="button"
              className={`sidebar-tab-btn ${activeTab === 'timetable' ? 'active' : ''}`}
              onClick={() => setActiveTab('timetable')}
            >
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Timetable ({timetable.length})</span>
            </button>
          </nav>

          <div className="sidebar-footer-card">
            <h4>Assigned Stream</h4>
            <p>{currentClassInfo ? `${currentClassInfo.grade_name} ${currentClassInfo.stream !== 'none' ? currentClassInfo.stream.replace('_', ' ') : ''}` : 'General Curriculum'}</p>
            <p style={{ marginTop: '4px', color: '#1F3A5F', fontWeight: 600 }}>
              {currentClassInfo ? `${currentClassInfo.subject_name} (${currentClassInfo.subject_code})` : 'Physics Department'}
            </p>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="teacher-content">
          {apiError && (
            <div className="alert-banner alert-danger" style={{ marginBottom: '20px' }}>
              <span>⚠️ {apiError}</span>
            </div>
          )}

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
              <div className="spinner" style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '28px', height: '28px' }}></div>
              <p>Fetching real database records from MySQL...</p>
            </div>
          ) : assignedClasses.length === 0 ? (
            <div style={{ background: '#FFFFFF', padding: '40px', borderRadius: '12px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
              <h3 style={{ color: '#1F3A5F', marginBottom: '8px' }}>No Classes Assigned</h3>
              <p style={{ color: '#64748B' }}>No teaching classes or subjects have been assigned to your account for the active academic year.</p>
            </div>
          ) : (
            <>
              {/* ============================================================== */}
              {/* TAB: TEACHER REPORTS (TASK A) */}
              {/* ============================================================== */}
              {activeTab === 'reports' && (
                <TeacherReports
                  teacherSubjects={teacherSubjects}
                  assignedClasses={assignedClasses}
                  onShowToast={showToast}
                />
              )}

              {/* ============================================================== */}
              {/* TAB: ATTENDANCE (WITH SUBJECT SELECTOR - TASK B) */}
              {/* ============================================================== */}
              {activeTab === 'attendance' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Teacher Portal</span> / <span>Attendance</span>
                      </div>
                      <h2 className="page-title">Record Attendance</h2>
                    </div>
                  </div>

                  {/* TOOLBAR CONTROLS WITH SUBJECT SELECTOR */}
                  <div className="filter-toolbar-card">
                    <div className="filter-group-row">
                      {/* Subject Selector */}
                      <div className="filter-item">
                        <label className="filter-label" htmlFor={attSubSelectId}>Subject:</label>
                        <select
                          id={attSubSelectId}
                          className="filter-select"
                          value={attSubjectId || ''}
                          onChange={(e) => {
                            const subId = e.target.value ? Number(e.target.value) : null
                            setAttSubjectId(subId)
                          }}
                        >
                          <option value="">All Assigned Subjects</option>
                          {teacherSubjects.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Section Selector */}
                      <div className="filter-item">
                        <label className="filter-label" htmlFor={attSectionId}>Section:</label>
                        <select
                          id={attSectionId}
                          className="filter-select"
                          value={selectedSectionId || ''}
                          onChange={(e) => setSelectedSectionId(Number(e.target.value))}
                        >
                          {availableAttSections.map((c) => (
                            <option key={`${c.section_id}-${c.subject_id}`} value={c.section_id}>
                              {c.section_name} ({c.subject_name})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Date Picker */}
                      <div className="filter-item">
                        <label className="filter-label" htmlFor={attDateId}>Date:</label>
                        <input
                          id={attDateId}
                          type="date"
                          className="filter-date-input"
                          value={attDate}
                          onChange={(e) => setAttDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={markAllPresent}
                        disabled={attIsLocked}
                      >
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Mark All Present
                      </button>
                      {attIsLocked && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ borderColor: '#B7791F', color: '#B7791F' }}
                          onClick={() => {
                            setAttIsLocked(false)
                            showToast('Unlocked for authorized corrections.')
                          }}
                        >
                          Request Correction
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ATTENDANCE TABLE */}
                  <div className="data-table-container">
                    <table className="spec-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>#</th>
                          <th style={{ width: '220px' }}>Student Name</th>
                          <th style={{ width: '80px', textAlign: 'center' }}>Present</th>
                          <th style={{ width: '80px', textAlign: 'center' }}>Absent</th>
                          <th style={{ width: '80px', textAlign: 'center' }}>Late</th>
                          <th style={{ width: '80px', textAlign: 'center' }}>Excused</th>
                          <th>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceList.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                              No enrolled students found for this section.
                            </td>
                          </tr>
                        ) : (
                          attendanceList.map((student, idx) => (
                            <tr key={student.enrollmentId}>
                              <td style={{ color: '#64748B', fontWeight: 600 }}>{idx + 1}</td>
                              <td style={{ fontWeight: 600, color: '#1F3A5F' }}>
                                {student.studentName}
                                <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 400 }}>
                                  {student.admissionNo}
                                </span>
                              </td>
                              <td className="radio-cell">
                                <input
                                  type="radio"
                                  name={`att_${student.enrollmentId}`}
                                  checked={student.statusCode === 'present'}
                                  onChange={() => handleStatusChange(student.enrollmentId, 'present')}
                                  disabled={attIsLocked}
                                  aria-label={`Mark ${student.studentName} as Present`}
                                />
                              </td>
                              <td className="radio-cell">
                                <input
                                  type="radio"
                                  name={`att_${student.enrollmentId}`}
                                  checked={student.statusCode === 'absent'}
                                  onChange={() => handleStatusChange(student.enrollmentId, 'absent')}
                                  disabled={attIsLocked}
                                  aria-label={`Mark ${student.studentName} as Absent`}
                                />
                              </td>
                              <td className="radio-cell">
                                <input
                                  type="radio"
                                  name={`att_${student.enrollmentId}`}
                                  checked={student.statusCode === 'late'}
                                  onChange={() => handleStatusChange(student.enrollmentId, 'late')}
                                  disabled={attIsLocked}
                                  aria-label={`Mark ${student.studentName} as Late`}
                                />
                              </td>
                              <td className="radio-cell">
                                <input
                                  type="radio"
                                  name={`att_${student.enrollmentId}`}
                                  checked={student.statusCode === 'excused'}
                                  onChange={() => handleStatusChange(student.enrollmentId, 'excused')}
                                  disabled={attIsLocked}
                                  aria-label={`Mark ${student.studentName} as Excused`}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="table-input"
                                  placeholder="Add reason or remark..."
                                  value={student.note}
                                  onChange={(e) => handleRemarkChange(student.enrollmentId, e.target.value)}
                                  disabled={attIsLocked}
                                  aria-label={`Remarks for ${student.studentName}`}
                                />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* SUMMARY BAR & SAVE BUTTON */}
                  <div className="table-summary-bar">
                    <div className="summary-counters">
                      <span>Summary:</span>
                      <span className="counter-pill counter-present">Present {counts.present}</span>
                      <span className="counter-pill counter-absent">Absent {counts.absent}</span>
                      <span className="counter-pill counter-late">Late {counts.late}</span>
                      <span className="counter-pill counter-excused">Excused {counts.excused}</span>
                    </div>

                    <div>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleSaveAttendance}
                        disabled={attIsLocked || attIsSaving || attendanceList.length === 0}
                      >
                        {attIsSaving ? (
                          <span>Saving to MySQL...</span>
                        ) : attIsLocked ? (
                          <span>🔒 Session Saved &amp; Locked</span>
                        ) : (
                          <>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                            </svg>
                            <span>Save Attendance to MySQL</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="rules-hint-box">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ flexShrink: 0 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      <strong>Attendance Integrity:</strong> Records save persistently in MySQL. Only assigned sections and subjects can be recorded. Once saved, records are locked against tampering and produce audit log entries.
                    </span>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB: MARKS ENTRY (WITH ASSESSMENT LIST & SUBJECT SELECTOR - TASKS B & C) */}
              {/* ============================================================== */}
              {activeTab === 'marks' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Teacher Portal</span> / <span>Examinations</span> / <span>Marks Entry</span>
                      </div>
                      <h2 className="page-title">
                        {marksViewMode === 'entry' ? `Scoring: ${activeAssessment?.title || 'Assessment'}` : 'Assessments & Marks Entry'}
                      </h2>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => setShowCreateModal(true)}
                      >
                        + Create Assessment
                      </button>
                    </div>
                  </div>

                  {/* FILTER TOOLBAR: SUBJECT, SECTION & TERM SELECTORS */}
                  <div className="filter-toolbar-card" style={{ marginBottom: '20px' }}>
                    <div className="filter-group-row">
                      {/* Subject Selector */}
                      <div className="filter-item">
                        <label className="filter-label" htmlFor={marksSubjectFilterId}>Subject:</label>
                        <select
                          id={marksSubjectFilterId}
                          className="filter-select"
                          value={marksFilterSubjectId || ''}
                          onChange={(e) => {
                            const subId = e.target.value ? Number(e.target.value) : null
                            setMarksFilterSubjectId(subId)
                          }}
                        >
                          <option value="">All Assigned Subjects</option>
                          {teacherSubjects.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Section Selector */}
                      <div className="filter-item">
                        <label className="filter-label" htmlFor={marksSectionFilterId}>Section:</label>
                        <select
                          id={marksSectionFilterId}
                          className="filter-select"
                          value={marksFilterSectionId || ''}
                          onChange={(e) => setMarksFilterSectionId(e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">All Assigned Sections</option>
                          {availableMarksSections.map((c) => (
                            <option key={`${c.section_id}-${c.subject_id}`} value={c.section_id}>
                              {c.section_name} ({c.subject_name})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Term Selector */}
                      <div className="filter-item">
                        <label className="filter-label" htmlFor={marksTermFilterId}>Term:</label>
                        <select
                          id={marksTermFilterId}
                          className="filter-select"
                          value={marksFilterTermId || ''}
                          onChange={(e) => setMarksFilterTermId(e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">All Terms</option>
                          {terms.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} {t.is_active ? '(Active)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(marksFilterSubjectId || marksFilterSectionId || marksFilterTermId) && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                          onClick={() => {
                            setMarksFilterSubjectId(null)
                            setMarksFilterSectionId(null)
                            setMarksFilterTermId(null)
                          }}
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </div>

                  {/* VIEW 1: ASSESSMENT LIST (VISIBLE, FUNCTIONAL - TASK C FIX) */}
                  {marksViewMode === 'list' && (
                    <div className="assessment-list-container">
                      <div className="assessment-list-header">
                        <div className="assessment-list-title">
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <span>Assigned Assessments ({assessments.length})</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748B' }}>
                          Select an assessment below to score students or update marks
                        </div>
                      </div>

                      {isAssessmentsLoading ? (
                        <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748B' }}>
                          <div className="spinner" style={{ margin: '0 auto 12px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '24px', height: '24px' }}></div>
                          <p>Loading assessments from database...</p>
                        </div>
                      ) : assessmentsError ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#C0392B' }}>
                          <p>Error: {assessmentsError}</p>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ marginTop: '10px' }}
                            onClick={fetchAssessmentsList}
                          >
                            Retry Loading
                          </button>
                        </div>
                      ) : assessments.length === 0 ? (
                        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748B' }}>
                          <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#CBD5E1" style={{ margin: '0 auto 12px' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <h4 style={{ color: '#1F3A5F', fontSize: '15px', marginBottom: '6px' }}>No Assessments Found</h4>
                          <p style={{ fontSize: '13px', maxWidth: '400px', margin: '0 auto 16px' }}>
                            No assessments match the selected filters. Use "+ Create Assessment" above to record a new assessment for your students.
                          </p>
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => setShowCreateModal(true)}
                          >
                            + Create Assessment
                          </button>
                        </div>
                      ) : (
                        <div className="data-table-container">
                          <table className="spec-table">
                            <thead>
                              <tr>
                                <th style={{ width: '40px' }}>#</th>
                                <th>Assessment Title</th>
                                <th>Subject</th>
                                <th>Section</th>
                                <th>Term</th>
                                <th style={{ textAlign: 'center' }}>Max Score</th>
                                <th style={{ textAlign: 'center' }}>Weight</th>
                                <th>Date</th>
                                <th style={{ textAlign: 'center' }}>Workflow Status</th>
                                <th style={{ textAlign: 'right', width: '130px' }}>Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {assessments.map((a, idx) => {
                                const status = a.marks_submission_status || a.status || 'draft'
                                return (
                                  <tr key={a.id}>
                                    <td style={{ color: '#64748B', fontWeight: 600 }}>{idx + 1}</td>
                                    <td>
                                      <div style={{ fontWeight: 700, color: '#1F3A5F' }}>{a.title}</div>
                                      <span style={{ fontSize: '11px', color: '#64748B' }}>{a.assessment_type_name || 'Standard Assessment'}</span>
                                    </td>
                                    <td style={{ fontWeight: 600 }}>{a.subject_name}</td>
                                    <td>{a.section_name}</td>
                                    <td>{a.term_name || 'Active Term'}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 700, color: '#1F3A5F' }}>{a.max_score}</td>
                                    <td style={{ textAlign: 'center' }}>{a.weight}%</td>
                                    <td style={{ color: '#64748B', fontSize: '12px' }}>
                                      {a.assessment_date ? new Date(a.assessment_date).toLocaleDateString() : '—'}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                      <span className={`status-badge status-${status}`}>
                                        {status.toUpperCase()}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      <button
                                        type="button"
                                        className="btn-primary"
                                        style={{ padding: '6px 14px', fontSize: '12px', whiteSpace: 'nowrap' }}
                                        onClick={() => handleOpenAssessment(a)}
                                      >
                                        Enter Marks &rarr;
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* VIEW 2: MARKS ENTRY ROSTER (ACTIVE ASSESSMENT SCORING) */}
                  {marksViewMode === 'entry' && activeAssessment && (
                    <div>
                      {/* ACTIVE ASSESSMENT BANNER WITH BACK BUTTON */}
                      <div className="assessment-active-banner">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ background: '#FFFFFF', color: '#1F3A5F', borderColor: '#FFFFFF', padding: '6px 14px', fontSize: '12px' }}
                            onClick={handleBackToAssessmentList}
                          >
                            &larr; Back to Assessments
                          </button>
                          <div className="assessment-active-details">
                            <div className="assessment-active-title">
                              {activeAssessment.title}
                            </div>
                            <div className="assessment-active-badges">
                              <span className="active-meta-pill">Subject: {activeAssessment.subject_name}</span>
                              <span className="active-meta-pill">Section: {activeAssessment.section_name}</span>
                              <span className="active-meta-pill">Max: {maxScore} pts</span>
                              <span className="active-meta-pill">Weight: {activeAssessment.weight}%</span>
                              {activeAssessment.term_name && (
                                <span className="active-meta-pill">{activeAssessment.term_name}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>Workflow Status:</span>
                          <span className={`status-badge status-${marksList[0]?.status || activeAssessment.marks_submission_status || 'draft'}`}>
                            {(marksList[0]?.status || activeAssessment.marks_submission_status || 'draft').toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* MARKS ENTRY TABLE */}
                      <div className="data-table-container">
                        <table className="spec-table">
                          <thead>
                            <tr>
                              <th style={{ width: '40px' }}>#</th>
                              <th style={{ width: '220px' }}>Student</th>
                              <th style={{ width: '280px' }}>Score (0–{maxScore})</th>
                              <th>Feedback</th>
                            </tr>
                          </thead>
                          <tbody>
                            {marksList.length === 0 ? (
                              <tr>
                                <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                                  No enrolled students found for this assessment roster.
                                </td>
                              </tr>
                            ) : (
                              marksList.map((m, idx) => {
                                const scoreNum = parseFloat(m.score)
                                const isExceeded = !isNaN(scoreNum) && scoreNum > maxScore
                                const isNegative = !isNaN(scoreNum) && scoreNum < 0

                                return (
                                  <tr key={m.enrollmentId}>
                                    <td style={{ color: '#64748B', fontWeight: 600 }}>{idx + 1}</td>
                                    <td style={{ fontWeight: 600, color: '#1F3A5F' }}>
                                      {m.studentName}
                                      <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 400 }}>
                                        {m.admissionNo}
                                      </span>
                                    </td>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <input
                                          type="number"
                                          step="0.5"
                                          className={`score-input ${isExceeded || isNegative ? 'error' : ''}`}
                                          value={m.score}
                                          onChange={(e) => handleScoreChange(m.enrollmentId, e.target.value)}
                                          disabled={m.status === 'locked' || marksIsSaving}
                                          aria-label={`Score for ${m.studentName}`}
                                        />

                                        {isExceeded && (
                                          <span className="inline-error-badge">
                                            Score {m.score} exceeds maximum {maxScore}
                                          </span>
                                        )}

                                        {isNegative && (
                                          <span className="inline-error-badge">
                                            Score cannot be negative
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td>
                                      <input
                                        type="text"
                                        className="table-input"
                                        placeholder="Feedback on student performance..."
                                        value={m.feedback}
                                        onChange={(e) => handleFeedbackChange(m.enrollmentId, e.target.value)}
                                        disabled={m.status === 'locked' || marksIsSaving}
                                        aria-label={`Feedback for ${m.studentName}`}
                                      />
                                    </td>
                                  </tr>
                                )
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* ACTION BUTTONS */}
                      <div className="table-summary-bar">
                        <div style={{ fontSize: '13px', color: '#64748B' }}>
                          {hasInvalidScore ? (
                            <span style={{ color: '#C0392B', fontWeight: 600 }}>
                              ⚠️ Validation Error: Resolve marks exceeding max limit before submission.
                            </span>
                          ) : (
                            <span>All marks within valid boundaries (0 to {maxScore}).</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => handleSaveMarks('draft')}
                            disabled={marksIsSaving || hasInvalidScore}
                          >
                            Save Draft to MySQL
                          </button>

                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => handleSaveMarks('submitted')}
                            disabled={marksIsSaving || hasInvalidScore}
                          >
                            Submit for Approval
                          </button>
                        </div>
                      </div>

                      <div className="rules-hint-box">
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ flexShrink: 0 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>
                          <strong>Workflow Lifecycle:</strong> <code>draft &gt; submitted &gt; approved &gt; published</code>. Results saved to MySQL database with decimal precision. Submitted marks await Principal review.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB: OVERVIEW */}
              {/* ============================================================== */}
              {activeTab === 'overview' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Teacher Portal</span> / <span>Dashboard</span>
                      </div>
                      <h2 className="page-title">Welcome back, {teacherName}</h2>
                    </div>
                    <div className="spec-reference-tag">Live MySQL 8 Connected</div>
                  </div>

                  {/* REAL METRIC CARDS FROM MYSQL */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ background: '#FFFFFF', padding: '18px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Assigned Classes</div>
                      <div style={{ fontSize: '26px', fontWeight: 700, color: '#1F3A5F', margin: '4px 0' }}>
                        {overviewMetrics.assignedClasses} Classes
                      </div>
                      <div style={{ fontSize: '11px', color: '#2A7F62' }}>{overviewMetrics.assignedSections} Distinct Sections</div>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '18px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Today's Attendance</div>
                      <div style={{ fontSize: '26px', fontWeight: 700, color: '#B7791F', margin: '4px 0' }}>
                        {overviewMetrics.todayAttendanceRecorded > 0 ? 'Recorded' : 'Pending'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {overviewMetrics.todayAttendanceRecorded} session(s) logged today
                      </div>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '18px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Assessments Created</div>
                      <div style={{ fontSize: '26px', fontWeight: 700, color: '#2E6DA4', margin: '4px 0' }}>
                        {overviewMetrics.totalAssessments} Total
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {overviewMetrics.draftAssessments} in draft state
                      </div>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '18px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Weekly Schedule</div>
                      <div style={{ fontSize: '26px', fontWeight: 700, color: '#1F3A5F', margin: '4px 0' }}>
                        {timetable.length} Lessons
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>Active term timetable</div>
                    </div>
                  </div>

                  {/* REAL ANNOUNCEMENTS FROM DATABASE */}
                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1F3A5F', marginBottom: '14px' }}>
                      Official School Announcements
                    </h3>
                    {announcements.length === 0 ? (
                      <p style={{ color: '#64748B', fontSize: '13px' }}>No announcements published at this time.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {announcements.map((ann) => (
                          <div key={ann.id} style={{ borderLeft: '3px solid #2E6DA4', paddingLeft: '12px' }}>
                            <div style={{ fontWeight: 600, color: '#1F3A5F', fontSize: '14px' }}>{ann.title}</div>
                            <p style={{ color: '#64748B', fontSize: '13px', margin: '4px 0' }}>{ann.body}</p>
                            <span style={{ fontSize: '11px', color: '#94A3B8' }}>Published: {new Date(ann.published_at).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* QUICK LAUNCHERS */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1F3A5F', marginBottom: '8px' }}>
                        Take Daily Attendance
                      </h3>
                      <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
                        Record attendance for assigned sections connected to MySQL.
                      </p>
                      <button type="button" className="btn-primary" onClick={() => setActiveTab('attendance')}>
                        Open Attendance Grid &rarr;
                      </button>
                    </div>

                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1F3A5F', marginBottom: '8px' }}>
                        Score Student Assessments
                      </h3>
                      <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
                        Enter marks with real-time range validation (0–{maxScore}) and submit for review.
                      </p>
                      <button type="button" className="btn-secondary" onClick={() => setActiveTab('marks')}>
                        Open Marks Entry Matrix &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB: MY CLASSES */}
              {/* ============================================================== */}
              {activeTab === 'classes' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Teacher Portal</span> / <span>My Classes</span>
                      </div>
                      <h2 className="page-title">Authorized Teaching Assignments</h2>
                    </div>
                  </div>

                  <div className="data-table-container">
                    <table className="spec-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Class / Section</th>
                          <th>Grade</th>
                          <th>Subject</th>
                          <th>Stream</th>
                          <th>Enrolled Students</th>
                          <th>Capacity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignedClasses.map((c, idx) => (
                          <tr key={c.teaching_assignment_id}>
                            <td style={{ color: '#64748B' }}>{idx + 1}</td>
                            <td style={{ fontWeight: 600, color: '#1F3A5F' }}>{c.section_name}</td>
                            <td>{c.grade_name}</td>
                            <td style={{ fontWeight: 600 }}>{c.subject_name} ({c.subject_code})</td>
                            <td>
                              <span style={{ textTransform: 'capitalize' }}>
                                {c.stream !== 'none' ? c.stream.replace('_', ' ') : 'General'}
                              </span>
                            </td>
                            <td>
                              <strong style={{ color: '#2A7F62' }}>{c.student_count}</strong> active
                            </td>
                            <td>{c.capacity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ============================================================== */}
              {/* TAB: TIMETABLE */}
              {/* ============================================================== */}
              {activeTab === 'timetable' && (
                <div>
                  <div className="page-header-row">
                    <div>
                      <div className="page-breadcrumb">
                        <span>Teacher Portal</span> / <span>Timetable</span>
                      </div>
                      <h2 className="page-title">Weekly Teaching Schedule</h2>
                    </div>
                  </div>

                  {timetable.length === 0 ? (
                    <div style={{ background: '#FFFFFF', padding: '30px', borderRadius: '10px', textAlign: 'center', color: '#64748B' }}>
                      No scheduled lessons found for the current term in MySQL.
                    </div>
                  ) : (
                    <div className="data-table-container">
                      <table className="spec-table">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th>Time</th>
                            <th>Period</th>
                            <th>Section</th>
                            <th>Subject</th>
                            <th>Room</th>
                          </tr>
                        </thead>
                        <tbody>
                          {timetable.map((t) => {
                            const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                            const dayName = days[t.day_of_week - 1] || `Day ${t.day_of_week}`
                            return (
                              <tr key={t.id}>
                                <td style={{ fontWeight: 600, color: '#1F3A5F' }}>{dayName}</td>
                                <td>{t.start_time.substring(0, 5)} - {t.end_time.substring(0, 5)}</td>
                                <td><span className="assessment-meta-tag">{t.slot_label}</span></td>
                                <td style={{ fontWeight: 600 }}>{t.section_name}</td>
                                <td>{t.subject_name} ({t.subject_code})</td>
                                <td>{t.room_name || 'Main Hall'} ({t.building || 'Block A'})</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* CREATE ASSESSMENT MODAL (WITH ASSIGNMENT & TERM SELECTOR FROM MYSQL) */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '480px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1F3A5F', marginBottom: '16px' }}>Create New Assessment</h3>
            <form onSubmit={handleCreateAssessment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="input-label" htmlFor="newAssignmentSelect">Teaching Assignment (Class &amp; Subject)</label>
                <select
                  id="newAssignmentSelect"
                  className="form-select"
                  value={newAssignmentId || ''}
                  onChange={(e) => setNewAssignmentId(Number(e.target.value))}
                  required
                >
                  {assignedClasses.map((c) => (
                    <option key={c.teaching_assignment_id} value={c.teaching_assignment_id}>
                      {c.section_name} — {c.subject_name} ({c.grade_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label" htmlFor="newTermSelect">Academic Term</label>
                <select
                  id="newTermSelect"
                  className="form-select"
                  value={newTermId || ''}
                  onChange={(e) => setNewTermId(Number(e.target.value))}
                  required
                >
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label" htmlFor="newTitleInput">Assessment Title</label>
                <input
                  id="newTitleInput"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Midterm Physics Examination"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="input-label" htmlFor="newTypeSelect">Assessment Type</label>
                <select
                  id="newTypeSelect"
                  className="form-select"
                  value={newTypeId}
                  onChange={(e) => setNewTypeId(Number(e.target.value))}
                >
                  {assessmentTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="input-label" htmlFor="newMaxScoreInput">Max Score</label>
                  <input
                    id="newMaxScoreInput"
                    type="number"
                    className="form-input"
                    value={newMaxScore}
                    onChange={(e) => setNewMaxScore(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="newWeightInput">Weight (%)</label>
                  <input
                    id="newWeightInput"
                    type="number"
                    className="form-input"
                    value={newWeight}
                    onChange={(e) => setNewWeight(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Assessment to MySQL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="toast-success">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
