import { useState, useEffect, useId, useMemo } from 'react'
import { api } from '../api/client'

interface TeacherReportsProps {
  teacherSubjects: Array<{ id: number; code: string; name: string; name_am?: string }>
  assignedClasses: Array<any>
  onShowToast: (msg: string) => void
}

type ReportType =
  | 'attendance'
  | 'marks'
  | 'class_performance'
  | 'student_performance'
  | 'assessment_summary'

export default function TeacherReports({
  teacherSubjects,
  assignedClasses,
  onShowToast
}: TeacherReportsProps) {
  // Filter States
  const [academicYears, setAcademicYears] = useState<any[]>([])
  const [terms, setTerms] = useState<any[]>([])
  const [selectedYearId, setSelectedYearId] = useState<number | null>(null)
  const [selectedTermId, setSelectedTermId] = useState<number | null>(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
  const [reportType, setReportType] = useState<ReportType>('attendance')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [sectionStudents, setSectionStudents] = useState<any[]>([])

  // Execution & Results States
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [reportData, setReportData] = useState<any | null>(null)
  const [appliedFilters, setAppliedFilters] = useState<any | null>(null)

  // Usability States (Search, Sort, Pagination)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [sortField, setSortField] = useState<string>('')
  const [sortAsc, setSortAsc] = useState<boolean>(true)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const pageSize = 15

  // Accessibility IDs
  const yearSelectId = useId()
  const termSelectId = useId()
  const subjectSelectId = useId()
  const sectionSelectId = useId()
  const typeSelectId = useId()
  const startId = useId()
  const endId = useId()
  const studentSelectId = useId()

  // 1. Load Academic Years on Mount
  useEffect(() => {
    const loadYears = async () => {
      try {
        const years = await api.getAcademicYears()
        setAcademicYears(years)
        if (years.length > 0) {
          const current = years.find((y: any) => y.is_current === 1) || years[0]
          setSelectedYearId(current.id)
        }
      } catch (err: any) {
        console.error('Error loading academic years:', err)
      }
    }
    loadYears()
  }, [])

  // 2. Load Terms when Year changes
  useEffect(() => {
    if (!selectedYearId) return
    const loadTerms = async () => {
      try {
        const termsList = await api.getTerms(selectedYearId)
        setTerms(termsList)
        if (termsList.length > 0) {
          const current = termsList.find((t: any) => t.is_current === 1) || termsList[0]
          setSelectedTermId(current.id)
        } else {
          setSelectedTermId(null)
        }
      } catch (err: any) {
        console.error('Error loading terms:', err)
      }
    }
    loadTerms()
  }, [selectedYearId])

  // 3. Filter available classes based on selected subject
  const availableClasses = useMemo(() => {
    if (!selectedSubjectId) {
      // Unique sections
      const seen = new Set<number>()
      return assignedClasses.filter((c) => {
        if (seen.has(c.section_id)) return false
        seen.add(c.section_id)
        return true
      })
    }
    return assignedClasses.filter((c) => c.subject_id === selectedSubjectId)
  }, [selectedSubjectId, assignedClasses])

  // Automatically select first section if current selection is invalid
  useEffect(() => {
    if (availableClasses.length > 0) {
      if (!selectedSectionId || !availableClasses.some((c) => c.section_id === selectedSectionId)) {
        setSelectedSectionId(availableClasses[0].section_id)
      }
    } else {
      setSelectedSectionId(null)
    }
  }, [availableClasses, selectedSectionId])

  // 4. Load section students for single-student reports
  useEffect(() => {
    if (!selectedSectionId) {
      setSectionStudents([])
      setSelectedStudentId(null)
      return
    }
    const loadStudents = async () => {
      try {
        const students = await api.getSectionStudents(selectedSectionId)
        setSectionStudents(students)
      } catch (err) {
        console.error('Error loading students for section:', err)
      }
    }
    loadStudents()
  }, [selectedSectionId])

  // 5. Generate Report Handler
  const handleGenerateReport = async () => {
    if (!selectedSectionId && reportType !== 'assessment_summary') {
      setErrorMessage('Please select a Class / Section to generate this report.')
      return
    }

    setIsLoading(true)
    setErrorMessage(null)
    setReportData(null)
    setCurrentPage(1)

    try {
      let data: any = null
      const currentSection = assignedClasses.find((c) => c.section_id === selectedSectionId)
      const currentSubject = teacherSubjects.find((s) => s.id === selectedSubjectId)
      const currentYear = academicYears.find((y) => y.id === selectedYearId)
      const currentTerm = terms.find((t) => t.id === selectedTermId)

      const filterSummary = {
        year: currentYear?.name || 'All Years',
        term: currentTerm?.name || 'All Terms',
        subject: currentSubject ? `${currentSubject.name} (${currentSubject.code})` : 'All Assigned Subjects',
        section: currentSection?.section_name || 'All Sections',
        reportType,
        dateRange: startDate || endDate ? `${startDate || 'Start'} to ${endDate || 'Present'}` : null
      }

      switch (reportType) {
        case 'attendance':
          data = await api.getAttendanceReport({
            sectionId: selectedSectionId!,
            subjectId: selectedSubjectId || undefined,
            termId: selectedTermId || undefined,
            academicYearId: selectedYearId || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined
          })
          break

        case 'marks':
          data = await api.getMarksReport({
            sectionId: selectedSectionId!,
            subjectId: selectedSubjectId || undefined,
            termId: selectedTermId || undefined,
            academicYearId: selectedYearId || undefined
          })
          break

        case 'class_performance':
          data = await api.getClassPerformanceReport({
            sectionId: selectedSectionId!,
            subjectId: selectedSubjectId || undefined,
            termId: selectedTermId || undefined
          })
          break

        case 'student_performance':
          data = await api.getStudentPerformanceReport({
            sectionId: selectedSectionId!,
            studentId: selectedStudentId || undefined,
            subjectId: selectedSubjectId || undefined,
            termId: selectedTermId || undefined
          })
          break

        case 'assessment_summary':
          data = await api.getAssessmentSummaryReport({
            sectionId: selectedSectionId || undefined,
            subjectId: selectedSubjectId || undefined,
            termId: selectedTermId || undefined,
            academicYearId: selectedYearId || undefined
          })
          break
      }

      setReportData(data)
      setAppliedFilters(filterSummary)
      onShowToast('Report successfully generated from MySQL database.')
    } catch (err: any) {
      console.error('Failed to generate report:', err)
      setErrorMessage(err.message || 'Error executing report query on server.')
    } finally {
      setIsLoading(false)
    }
  }

  // 6. Clear Filters
  const handleClearFilters = () => {
    setSelectedSubjectId(null)
    setStartDate('')
    setEndDate('')
    setSelectedStudentId(null)
    setReportData(null)
    setAppliedFilters(null)
    setErrorMessage(null)
    setSearchQuery('')
  }

  // 7. CSV Export
  const handleExportCSV = () => {
    if (!reportData) return

    let csvContent = ''
    const dateStamp = new Date().toISOString().split('T')[0]
    let filename = `teacher_report_${reportType}_${dateStamp}.csv`

    // Helper to escape CSV cell
    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '""'
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }

    if (reportType === 'attendance' && reportData.records) {
      filename = `attendance_report_${dateStamp}.csv`
      const headers = ['#', 'Admission No', 'Student Name', 'Gender', 'Roll No', 'Total Sessions', 'Present', 'Absent', 'Late', 'Excused', 'Attendance %']
      csvContent += headers.map(escapeCsv).join(',') + '\n'

      reportData.records.forEach((r: any, idx: number) => {
        const row = [
          idx + 1,
          r.admissionNo,
          r.fullName,
          r.gender,
          r.rollNo,
          r.totalSessions,
          r.present,
          r.absent,
          r.late,
          r.excused,
          `${r.attendancePercentage}%`
        ]
        csvContent += row.map(escapeCsv).join(',') + '\n'
      })
    } else if (reportType === 'marks' && reportData.records) {
      filename = `marks_report_${dateStamp}.csv`
      const headers = ['#', 'Admission No', 'Student Name', 'Assessment', 'Type', 'Subject', 'Section', 'Term', 'Score', 'Max Score', 'Percentage %', 'Status', 'Feedback']
      csvContent += headers.map(escapeCsv).join(',') + '\n'

      reportData.records.forEach((r: any, idx: number) => {
        const row = [
          idx + 1,
          r.admissionNo,
          r.fullName,
          r.assessmentName,
          r.assessmentType,
          r.subjectName,
          r.sectionName,
          r.termName,
          r.score !== null ? r.score : 'Unmarked',
          r.maxScore,
          r.percentage !== null ? `${r.percentage}%` : 'N/A',
          r.markStatus,
          r.feedback || ''
        ]
        csvContent += row.map(escapeCsv).join(',') + '\n'
      })
    } else if (reportType === 'class_performance' && reportData.assessments) {
      filename = `class_performance_report_${dateStamp}.csv`
      const headers = ['Assessment', 'Type', 'Subject', 'Section', 'Max Score', 'Weight (%)', 'Enrolled', 'Assessed', 'Missing Marks', 'Average Score', 'Average %', 'Highest', 'Lowest']
      csvContent += headers.map(escapeCsv).join(',') + '\n'

      reportData.assessments.forEach((r: any) => {
        const row = [
          r.assessmentName,
          r.assessmentType,
          r.subjectName,
          r.sectionName,
          r.maxScore,
          r.weight,
          r.totalEnrolled,
          r.assessedCount,
          r.missingMarksCount,
          r.averageScore !== null ? r.averageScore : 'N/A',
          r.averagePercentage !== null ? `${r.averagePercentage}%` : 'N/A',
          r.highestScore !== null ? r.highestScore : 'N/A',
          r.lowestScore !== null ? r.lowestScore : 'N/A'
        ]
        csvContent += row.map(escapeCsv).join(',') + '\n'
      })
    } else if (reportType === 'assessment_summary' && reportData.assessments) {
      filename = `assessment_summary_${dateStamp}.csv`
      const headers = ['Assessment Title', 'Subject', 'Class', 'Term', 'Date', 'Max Score', 'Weight (%)', 'Enrolled', 'Assessed', 'Missing Marks', 'Average Score', 'Average %', 'Status']
      csvContent += headers.map(escapeCsv).join(',') + '\n'

      reportData.assessments.forEach((r: any) => {
        const row = [
          r.assessment_title,
          r.subject_name,
          r.section_name,
          r.term_name,
          r.assessment_date,
          r.max_score,
          r.weight,
          r.students_enrolled,
          r.students_assessed,
          r.missing_marks,
          r.average_score !== null ? r.average_score : 'N/A',
          r.average_percentage !== null ? `${r.average_percentage}%` : 'N/A',
          r.workflow_status
        ]
        csvContent += row.map(escapeCsv).join(',') + '\n'
      })
    } else if (reportType === 'student_performance') {
      filename = `student_performance_${dateStamp}.csv`
      if (reportData.student && reportData.assessments) {
        csvContent += `Student:,${escapeCsv(reportData.student.full_name)},Admission No:,${escapeCsv(reportData.student.admission_no)}\n`
        csvContent += `Section:,${escapeCsv(reportData.student.section_name)},Attendance Rate:,${escapeCsv(`${reportData.attendance?.attendancePercentage || 100}%`)}\n\n`
        const headers = ['Assessment', 'Type', 'Subject', 'Term', 'Max Score', 'Score', 'Percentage %', 'Status', 'Feedback']
        csvContent += headers.map(escapeCsv).join(',') + '\n'

        reportData.assessments.forEach((r: any) => {
          const row = [
            r.assessmentName,
            r.assessmentType,
            r.subjectName,
            r.termName,
            r.maxScore,
            r.score !== null ? r.score : 'Unmarked',
            r.percentage !== null ? `${r.percentage}%` : 'N/A',
            r.markStatus,
            r.feedback || ''
          ]
          csvContent += row.map(escapeCsv).join(',') + '\n'
        })
      } else if (reportData.students) {
        const headers = ['#', 'Admission No', 'Student Name', 'Gender', 'Roll No', 'Completed Assessments', 'Average %']
        csvContent += headers.map(escapeCsv).join(',') + '\n'
        reportData.students.forEach((s: any, idx: number) => {
          const row = [
            idx + 1,
            s.admission_no,
            s.full_name,
            s.gender,
            s.roll_no,
            s.completed_assessments,
            s.average_percentage !== null ? `${s.average_percentage}%` : 'N/A'
          ]
          csvContent += row.map(escapeCsv).join(',') + '\n'
        })
      }
    }

    // Trigger download with UTF-8 BOM
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    onShowToast(`Exported ${filename} successfully.`)
  }

  // 8. Filtered & Sorted Records for Tabular Display
  const currentTableRecords = useMemo(() => {
    if (!reportData) return []
    let list: any[] = []

    if (reportType === 'attendance' && reportData.records) {
      list = reportData.records
    } else if (reportType === 'marks' && reportData.records) {
      list = reportData.records
    } else if (reportType === 'class_performance' && reportData.assessments) {
      list = reportData.assessments
    } else if (reportType === 'assessment_summary' && reportData.assessments) {
      list = reportData.assessments
    } else if (reportType === 'student_performance') {
      if (reportData.assessments) list = reportData.assessments
      else if (reportData.students) list = reportData.students
    }

    // Apply text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((item) => {
        return (
          (item.fullName && item.fullName.toLowerCase().includes(q)) ||
          (item.admissionNo && item.admissionNo.toLowerCase().includes(q)) ||
          (item.assessmentName && item.assessmentName.toLowerCase().includes(q)) ||
          (item.assessment_title && item.assessment_title.toLowerCase().includes(q)) ||
          (item.subjectName && item.subjectName.toLowerCase().includes(q)) ||
          (item.subject_name && item.subject_name.toLowerCase().includes(q))
        )
      })
    }

    // Apply sorting
    if (sortField) {
      list = [...list].sort((a, b) => {
        const valA = a[sortField]
        const valB = b[sortField]
        if (valA === valB) return 0
        if (valA === null || valA === undefined) return 1
        if (valB === null || valB === undefined) return -1
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAsc ? valA - valB : valB - valA
        }
        return sortAsc
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA))
      })
    }

    return list
  }, [reportData, reportType, searchQuery, sortField, sortAsc])

  // Pagination slice
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return currentTableRecords.slice(start, start + pageSize)
  }, [currentTableRecords, currentPage, pageSize])

  const totalPages = Math.ceil(currentTableRecords.length / pageSize) || 1

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  return (
    <div>
      {/* 1. PAGE HEADER */}
      <div className="page-header-row">
        <div>
          <div className="page-breadcrumb">
            <span>Teacher Portal</span> / <span>Reports</span>
          </div>
          <h2 className="page-title">Teacher Reports</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-success"
            onClick={handleExportCSV}
            disabled={!reportData || isLoading}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* 2. REPORT FILTER PANEL */}
      <div className="reports-filter-panel">
        <div className="reports-filter-grid">
          {/* Academic Year */}
          <div className="filter-field">
            <label className="filter-field-label" htmlFor={yearSelectId}>Academic Year</label>
            <select
              id={yearSelectId}
              className="filter-select"
              value={selectedYearId || ''}
              onChange={(e) => setSelectedYearId(Number(e.target.value))}
            >
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} {y.is_current ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Term */}
          <div className="filter-field">
            <label className="filter-field-label" htmlFor={termSelectId}>Term / Semester</label>
            <select
              id={termSelectId}
              className="filter-select"
              value={selectedTermId || ''}
              onChange={(e) => setSelectedTermId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All Terms</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_current ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Subject Selector (Task B requirement) */}
          <div className="filter-field">
            <label className="filter-field-label" htmlFor={subjectSelectId}>Subject</label>
            <select
              id={subjectSelectId}
              className="filter-select"
              value={selectedSubjectId || ''}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null
                setSelectedSubjectId(val)
                setReportData(null) // invalidate previous report on subject change
              }}
            >
              <option value="">All My Subjects</option>
              {teacherSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Class / Section */}
          <div className="filter-field">
            <label className="filter-field-label" htmlFor={sectionSelectId}>Class / Section</label>
            <select
              id={sectionSelectId}
              className="filter-select"
              value={selectedSectionId || ''}
              onChange={(e) => {
                setSelectedSectionId(Number(e.target.value))
                setReportData(null)
              }}
              disabled={availableClasses.length === 0}
            >
              {availableClasses.length === 0 ? (
                <option value="">No sections assigned</option>
              ) : (
                availableClasses.map((c) => (
                  <option key={c.section_id} value={c.section_id}>
                    {c.section_name} ({c.grade_name})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Report Type */}
          <div className="filter-field">
            <label className="filter-field-label" htmlFor={typeSelectId}>Report Type</label>
            <select
              id={typeSelectId}
              className="filter-select"
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value as ReportType)
                setReportData(null)
              }}
            >
              <option value="attendance">Student Attendance Report</option>
              <option value="marks">Assessment Marks Report</option>
              <option value="class_performance">Class Performance Report</option>
              <option value="student_performance">Student Performance Report</option>
              <option value="assessment_summary">Assessment Summary Report</option>
            </select>
          </div>

          {/* Optional Date Range for Attendance Report */}
          {reportType === 'attendance' && (
            <>
              <div className="filter-field">
                <label className="filter-field-label" htmlFor={startId}>Start Date (Optional)</label>
                <input
                  id={startId}
                  type="date"
                  className="filter-select"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="filter-field">
                <label className="filter-field-label" htmlFor={endId}>End Date (Optional)</label>
                <input
                  id={endId}
                  type="date"
                  className="filter-select"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Student Selector for Student Performance Report */}
          {reportType === 'student_performance' && (
            <div className="filter-field">
              <label className="filter-field-label" htmlFor={studentSelectId}>Student (Optional)</label>
              <select
                id={studentSelectId}
                className="filter-select"
                value={selectedStudentId || ''}
                onChange={(e) => setSelectedStudentId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">All Students (Class Overview)</option>
                {sectionStudents.map((st) => (
                  <option key={st.student_id} value={st.student_id}>
                    {st.full_name} ({st.admission_no})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="reports-actions-row">
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleGenerateReport}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Querying Database...
                </>
              ) : (
                'Generate Report'
              )}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClearFilters}
              disabled={isLoading}
            >
              Clear Filters
            </button>
          </div>

          <div style={{ fontSize: '12px', color: '#64748B' }}>
            {availableClasses.length > 0
              ? `Authorized for ${availableClasses.length} class section(s)`
              : 'No teaching assignments found for this filter'}
          </div>
        </div>
      </div>

      {/* 3. ERROR ALERT */}
      {errorMessage && (
        <div style={{ background: '#FDF0EE', border: '1px solid #C0392B', color: '#C0392B', padding: '14px 18px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <strong>Error Generating Report:</strong> {errorMessage}
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ borderColor: '#C0392B', color: '#C0392B', padding: '4px 10px', height: 'auto' }}
            onClick={handleGenerateReport}
          >
            Retry Query
          </button>
        </div>
      )}

      {/* 4. APPLIED FILTERS SUMMARY */}
      {appliedFilters && (
        <div className="applied-filters-bar">
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#1F3A5F' }}>Active Scope:</span>
          <span className="applied-filter-chip">📅 {appliedFilters.year}</span>
          <span className="applied-filter-chip">📆 {appliedFilters.term}</span>
          <span className="applied-filter-chip">📚 {appliedFilters.subject}</span>
          <span className="applied-filter-chip">🏫 {appliedFilters.section}</span>
          {appliedFilters.dateRange && (
            <span className="applied-filter-chip">⏳ {appliedFilters.dateRange}</span>
          )}
        </div>
      )}

      {/* 5. REPORT CONTENT */}
      {isLoading ? (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '60px', textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid #E2E8F0', borderTopColor: '#1F3A5F', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
          <h4 style={{ color: '#1F3A5F', fontWeight: 600 }}>Loading Report Records...</h4>
          <p style={{ color: '#64748B', fontSize: '13px' }}>Executing parameterized SQL queries and computing statistics on MySQL 8.</p>
        </div>
      ) : !reportData ? (
        <div style={{ background: '#FFFFFF', border: '1px dashed #CBD5E1', borderRadius: '12px', padding: '60px 20px', textAlign: 'center' }}>
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#94A3B8" style={{ margin: '0 auto 12px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1F3A5F', marginBottom: '6px' }}>
            No Report Generated Yet
          </h3>
          <p style={{ color: '#64748B', fontSize: '13px', maxWidth: '480px', margin: '0 auto 16px' }}>
            Select your desired academic year, term, subject, section, and report type above, then click <strong>Generate Report</strong>.
          </p>
        </div>
      ) : (
        <div>
          {/* A. KPI SUMMARY CARDS */}
          {reportType === 'attendance' && (
            <div className="report-kpi-grid">
              <div className="report-kpi-card">
                <span className="kpi-title">Enrolled Students</span>
                <span className="kpi-value">{reportData.totalStudents || 0}</span>
                <span className="kpi-subtitle">Active student roster</span>
              </div>
              <div className="report-kpi-card">
                <span className="kpi-title">Average Attendance</span>
                <span className="kpi-value" style={{ color: reportData.overallAttendanceRate >= 85 ? '#2A7F62' : '#B7791F' }}>
                  {reportData.overallAttendanceRate || 100}%
                </span>
                <span className="kpi-subtitle">Formula: (Present + Late) / Total</span>
              </div>
              <div className="report-kpi-card">
                <span className="kpi-title">Selected Class</span>
                <span className="kpi-value" style={{ fontSize: '18px' }}>
                  {reportData.section?.section_name || 'Class Section'}
                </span>
                <span className="kpi-subtitle">{reportData.section?.grade_name}</span>
              </div>
            </div>
          )}

          {reportType === 'marks' && (
            <div className="report-kpi-grid">
              <div className="report-kpi-card">
                <span className="kpi-title">Total Records</span>
                <span className="kpi-value">{reportData.totalRecords || 0}</span>
                <span className="kpi-subtitle">Mark entries queried</span>
              </div>
              <div className="report-kpi-card">
                <span className="kpi-title">Scored Marks</span>
                <span className="kpi-value" style={{ color: '#2A7F62' }}>{reportData.scoredCount || 0}</span>
                <span className="kpi-subtitle">Completed evaluations</span>
              </div>
              <div className="report-kpi-card">
                <span className="kpi-title">Unmarked Entries</span>
                <span className="kpi-value" style={{ color: reportData.unmarkedCount > 0 ? '#C0392B' : '#64748B' }}>
                  {reportData.unmarkedCount || 0}
                </span>
                <span className="kpi-subtitle">Pending teacher entry</span>
              </div>
              <div className="report-kpi-card">
                <span className="kpi-title">Class Average Score</span>
                <span className="kpi-value" style={{ color: '#2E6DA4' }}>
                  {reportData.averageScore !== null ? reportData.averageScore : 'N/A'}
                </span>
                <span className="kpi-subtitle">Decimal precision</span>
              </div>
            </div>
          )}

          {reportType === 'class_performance' && (
            <div className="report-kpi-grid">
              <div className="report-kpi-card">
                <span className="kpi-title">Assessments Evaluated</span>
                <span className="kpi-value">{reportData.totalAssessments || 0}</span>
                <span className="kpi-subtitle">Class assessments</span>
              </div>
            </div>
          )}

          {reportType === 'assessment_summary' && (
            <div className="report-kpi-grid">
              <div className="report-kpi-card">
                <span className="kpi-title">Total Assessments</span>
                <span className="kpi-value">{reportData.totalAssessments || 0}</span>
                <span className="kpi-subtitle">In selected scope</span>
              </div>
            </div>
          )}

          {/* B. SEARCH & CONTROLS BAR */}
          <div className="table-controls-bar">
            <input
              type="text"
              className="table-search-input"
              placeholder="Search by student name, admission no, or assessment..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
            />

            <div className="pagination-controls">
              <span>
                Showing {currentTableRecords.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–
                {Math.min(currentPage * pageSize, currentTableRecords.length)} of {currentTableRecords.length} records
              </span>
              <button
                type="button"
                className="pagination-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                className="pagination-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                Next
              </button>
            </div>
          </div>

          {/* C. DATA TABLE VIEW */}
          <div className="data-table-container">
            {/* 1. STUDENT ATTENDANCE REPORT TABLE */}
            {reportType === 'attendance' && (
              <table className="spec-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th onClick={() => handleSort('admissionNo')} style={{ cursor: 'pointer', width: '130px' }}>
                      Admission No {sortField === 'admissionNo' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th onClick={() => handleSort('fullName')} style={{ cursor: 'pointer' }}>
                      Student Name {sortField === 'fullName' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ width: '80px' }}>Gender</th>
                    <th style={{ width: '70px', textAlign: 'center' }}>Roll No</th>
                    <th style={{ width: '100px', textAlign: 'center' }}>Sessions</th>
                    <th style={{ width: '80px', textAlign: 'center', color: '#2A7F62' }}>Present</th>
                    <th style={{ width: '80px', textAlign: 'center', color: '#C0392B' }}>Absent</th>
                    <th style={{ width: '80px', textAlign: 'center', color: '#B7791F' }}>Late</th>
                    <th style={{ width: '80px', textAlign: 'center', color: '#2E6DA4' }}>Excused</th>
                    <th onClick={() => handleSort('attendancePercentage')} style={{ cursor: 'pointer', width: '130px', textAlign: 'right' }}>
                      Attendance % {sortField === 'attendancePercentage' ? (sortAsc ? '▲' : '▼') : ''}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                        No attendance records match the search or filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map((r: any, idx: number) => {
                      const isHigh = r.attendancePercentage >= 85
                      const isMedium = r.attendancePercentage >= 75 && r.attendancePercentage < 85

                      return (
                        <tr key={r.studentId}>
                          <td style={{ color: '#64748B', fontWeight: 600 }}>{(currentPage - 1) * pageSize + idx + 1}</td>
                          <td style={{ fontWeight: 600, color: '#2E6DA4' }}>{r.admissionNo}</td>
                          <td style={{ fontWeight: 600, color: '#1F3A5F' }}>{r.fullName}</td>
                          <td style={{ textTransform: 'capitalize', color: '#64748B' }}>{r.gender}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.rollNo}</td>
                          <td style={{ textAlign: 'center' }}>{r.totalSessions}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: '#2A7F62' }}>{r.present}</td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: r.absent > 0 ? '#C0392B' : '#64748B' }}>{r.absent}</td>
                          <td style={{ textAlign: 'center', color: '#B7791F' }}>{r.late}</td>
                          <td style={{ textAlign: 'center', color: '#2E6DA4' }}>{r.excused}</td>
                          <td style={{ textAlign: 'right' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                fontSize: '12px',
                                background: isHigh ? '#E8F5EE' : isMedium ? '#FEF7EC' : '#FDF0EE',
                                color: isHigh ? '#2A7F62' : isMedium ? '#B7791F' : '#C0392B'
                              }}
                            >
                              {r.attendancePercentage}%
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* 2. ASSESSMENT MARKS REPORT TABLE */}
            {reportType === 'marks' && (
              <table className="spec-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th onClick={() => handleSort('admissionNo')} style={{ cursor: 'pointer', width: '130px' }}>
                      Admission No
                    </th>
                    <th onClick={() => handleSort('fullName')} style={{ cursor: 'pointer' }}>
                      Student Name
                    </th>
                    <th>Assessment</th>
                    <th>Subject</th>
                    <th>Term</th>
                    <th style={{ width: '110px', textAlign: 'center' }}>Score / Max</th>
                    <th onClick={() => handleSort('percentage')} style={{ cursor: 'pointer', width: '90px', textAlign: 'center' }}>
                      Percentage
                    </th>
                    <th style={{ width: '90px', textAlign: 'center' }}>Status</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                        No assessment marks match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map((r: any, idx: number) => (
                      <tr key={`${r.assessmentId}-${r.studentId}`}>
                        <td style={{ color: '#64748B', fontWeight: 600 }}>{(currentPage - 1) * pageSize + idx + 1}</td>
                        <td style={{ fontWeight: 600, color: '#2E6DA4' }}>{r.admissionNo}</td>
                        <td style={{ fontWeight: 600, color: '#1F3A5F' }}>{r.fullName}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.assessmentName}</div>
                          <span style={{ fontSize: '11px', color: '#64748B' }}>{r.assessmentType}</span>
                        </td>
                        <td>{r.subjectName}</td>
                        <td>{r.termName}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>
                          {r.score !== null ? (
                            <span style={{ color: '#1F3A5F' }}>{r.score} <span style={{ color: '#64748B', fontWeight: 400 }}>/ {r.maxScore}</span></span>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>Unmarked</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {r.percentage !== null ? (
                            <span style={{ fontWeight: 700, color: r.percentage >= 60 ? '#2A7F62' : '#C0392B' }}>
                              {r.percentage}%
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`status-badge status-${r.lifecycleStatus || 'draft'}`}>
                            {r.lifecycleStatus}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: '#475569' }}>
                          {r.feedback || <span style={{ color: '#94A3B8' }}>—</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* 3. CLASS PERFORMANCE REPORT */}
            {reportType === 'class_performance' && (
              <div style={{ padding: '20px' }}>
                {reportData.assessments?.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                    No assessment performance data found for this class section.
                  </div>
                ) : (
                  reportData.assessments.map((a: any) => (
                    <div
                      key={a.assessmentId}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        borderRadius: '10px',
                        padding: '18px',
                        marginBottom: '16px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                          <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#1F3A5F' }}>{a.assessmentName}</h4>
                          <span style={{ fontSize: '12px', color: '#64748B' }}>
                            {a.subjectName} • {a.sectionName} • Max Score: {a.maxScore} • Weight: {a.weight}%
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase' }}>Completion</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1F3A5F' }}>
                              {a.assessedCount} / {a.totalEnrolled} ({Math.round((a.assessedCount / (a.totalEnrolled || 1)) * 100)}%)
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase' }}>Average</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#2E6DA4' }}>
                              {a.averageScore !== null ? `${a.averageScore} (${a.averagePercentage}%)` : 'N/A'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase' }}>High / Low</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#1F3A5F' }}>
                              {a.highestScore !== null ? a.highestScore : '-'} / {a.lowestScore !== null ? a.lowestScore : '-'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Grade Breakdown Bar */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>
                          <span>Grade Distribution Breakdown</span>
                          <span>
                            Exc: {a.gradeDistribution?.excellent} | VG: {a.gradeDistribution?.veryGood} | Good: {a.gradeDistribution?.good} | Sat: {a.gradeDistribution?.satisfactory} | Needs Imp: {a.gradeDistribution?.needsImprovement}
                          </span>
                        </div>
                        <div className="distribution-bar">
                          {a.assessedCount > 0 ? (
                            <>
                              <div className="distribution-segment dist-excellent" style={{ width: `${(a.gradeDistribution.excellent / a.assessedCount) * 100}%` }} title={`Excellent: ${a.gradeDistribution.excellent}`} />
                              <div className="distribution-segment dist-very-good" style={{ width: `${(a.gradeDistribution.veryGood / a.assessedCount) * 100}%` }} title={`Very Good: ${a.gradeDistribution.veryGood}`} />
                              <div className="distribution-segment dist-good" style={{ width: `${(a.gradeDistribution.good / a.assessedCount) * 100}%` }} title={`Good: ${a.gradeDistribution.good}`} />
                              <div className="distribution-segment dist-satisfactory" style={{ width: `${(a.gradeDistribution.satisfactory / a.assessedCount) * 100}%` }} title={`Satisfactory: ${a.gradeDistribution.satisfactory}`} />
                              <div className="distribution-segment dist-needs-improvement" style={{ width: `${(a.gradeDistribution.needsImprovement / a.assessedCount) * 100}%` }} title={`Needs Improvement: ${a.gradeDistribution.needsImprovement}`} />
                            </>
                          ) : (
                            <div style={{ width: '100%', background: '#E2E8F0', textAlign: 'center', fontSize: '10px', color: '#64748B' }}>
                              No marks entered yet
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 4. STUDENT PERFORMANCE REPORT */}
            {reportType === 'student_performance' && (
              <div>
                {reportData.student ? (
                  <div style={{ padding: '20px' }}>
                    {/* Student Info Card */}
                    <div style={{ background: '#EAF1F8', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#1F3A5F' }}>{reportData.student.full_name}</h3>
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>
                          Admission No: <strong>{reportData.student.admission_no}</strong> • Roll No: {reportData.student.roll_no} • Class: {reportData.student.section_name}
                        </div>
                      </div>
                      {reportData.attendance && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '11px', color: '#64748B', textTransform: 'uppercase' }}>Attendance Rate</div>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: reportData.attendance.attendancePercentage >= 85 ? '#2A7F62' : '#B7791F' }}>
                            {reportData.attendance.attendancePercentage}%
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            {reportData.attendance.present} Present, {reportData.attendance.absent} Absent ({reportData.attendance.totalSessions} Sessions)
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Assessments Breakdown */}
                    <table className="spec-table">
                      <thead>
                        <tr>
                          <th>Assessment</th>
                          <th>Subject</th>
                          <th>Term</th>
                          <th style={{ width: '100px', textAlign: 'center' }}>Score / Max</th>
                          <th style={{ width: '100px', textAlign: 'center' }}>Percentage</th>
                          <th style={{ width: '100px', textAlign: 'center' }}>Status</th>
                          <th>Teacher Feedback</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.assessments?.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#64748B' }}>
                              No assessment marks recorded for this student.
                            </td>
                          </tr>
                        ) : (
                          reportData.assessments.map((a: any) => (
                            <tr key={a.assessmentId}>
                              <td style={{ fontWeight: 600, color: '#1F3A5F' }}>{a.assessmentName}</td>
                              <td>{a.subjectName}</td>
                              <td>{a.termName}</td>
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                {a.score !== null ? `${a.score} / ${a.maxScore}` : <span style={{ color: '#94A3B8' }}>Unmarked</span>}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {a.percentage !== null ? (
                                  <span style={{ fontWeight: 700, color: a.percentage >= 60 ? '#2A7F62' : '#C0392B' }}>
                                    {a.percentage}%
                                  </span>
                                ) : '-'}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className={`status-badge status-${a.lifecycleStatus}`}>
                                  {a.lifecycleStatus}
                                </span>
                              </td>
                              <td style={{ fontSize: '12px', color: '#475569' }}>{a.feedback || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <table className="spec-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px' }}>#</th>
                        <th>Admission No</th>
                        <th>Student Name</th>
                        <th style={{ width: '80px' }}>Gender</th>
                        <th style={{ width: '80px', textAlign: 'center' }}>Roll No</th>
                        <th style={{ width: '150px', textAlign: 'center' }}>Completed Assessments</th>
                        <th style={{ width: '120px', textAlign: 'right' }}>Average Score %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedRecords.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                            No student performance records found for this section.
                          </td>
                        </tr>
                      ) : (
                        paginatedRecords.map((s: any, idx: number) => (
                          <tr key={s.student_id}>
                            <td style={{ color: '#64748B', fontWeight: 600 }}>{(currentPage - 1) * pageSize + idx + 1}</td>
                            <td style={{ fontWeight: 600, color: '#2E6DA4' }}>{s.admission_no}</td>
                            <td style={{ fontWeight: 600, color: '#1F3A5F' }}>{s.full_name}</td>
                            <td style={{ textTransform: 'capitalize', color: '#64748B' }}>{s.gender}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{s.roll_no}</td>
                            <td style={{ textAlign: 'center' }}>
                              {s.completed_assessments} / {s.available_assessments}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {s.average_percentage !== null ? (
                                <span style={{ fontWeight: 700, color: s.average_percentage >= 60 ? '#2A7F62' : '#C0392B' }}>
                                  {s.average_percentage}%
                                </span>
                              ) : 'N/A'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* 5. ASSESSMENT SUMMARY REPORT TABLE */}
            {reportType === 'assessment_summary' && (
              <table className="spec-table">
                <thead>
                  <tr>
                    <th>Assessment Title</th>
                    <th>Subject</th>
                    <th>Class / Section</th>
                    <th>Term</th>
                    <th>Date</th>
                    <th style={{ width: '90px', textAlign: 'center' }}>Max Score</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Weight</th>
                    <th style={{ width: '90px', textAlign: 'center' }}>Enrolled</th>
                    <th style={{ width: '90px', textAlign: 'center' }}>Assessed</th>
                    <th style={{ width: '100px', textAlign: 'center', color: '#C0392B' }}>Missing</th>
                    <th style={{ width: '110px', textAlign: 'right' }}>Avg Score</th>
                    <th style={{ width: '100px', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={12} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                        No assessments found in this scope.
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map((a: any) => (
                      <tr key={a.assessment_id}>
                        <td style={{ fontWeight: 700, color: '#1F3A5F' }}>{a.assessment_title}</td>
                        <td>{a.subject_name} ({a.subject_code})</td>
                        <td>{a.section_name}</td>
                        <td>{a.term_name}</td>
                        <td style={{ color: '#64748B', fontSize: '12px' }}>{a.assessment_date}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{a.max_score}</td>
                        <td style={{ textAlign: 'center' }}>{a.weight}%</td>
                        <td style={{ textAlign: 'center' }}>{a.students_enrolled}</td>
                        <td style={{ textAlign: 'center', color: '#2A7F62', fontWeight: 600 }}>{a.students_assessed}</td>
                        <td style={{ textAlign: 'center', color: a.missing_marks > 0 ? '#C0392B' : '#64748B', fontWeight: 700 }}>
                          {a.missing_marks}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#2E6DA4' }}>
                          {a.average_score !== null ? `${a.average_score} (${a.average_percentage}%)` : 'N/A'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`status-badge status-${a.workflow_status}`}>
                            {a.workflow_status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
