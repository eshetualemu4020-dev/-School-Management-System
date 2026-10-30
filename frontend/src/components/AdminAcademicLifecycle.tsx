import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api } from '../api/client';

type LifecycleTab = 'exams' | 'courses' | 'transcripts' | 'promotion' | 'probation' | 'graduation';

const fieldStyle: React.CSSProperties = { minWidth: 190, padding: '8px 10px' };
const boxStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 };
const localDateInput = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

export default function AdminAcademicLifecycle() {
  const [tab, setTab] = useState<LifecycleTab>('exams');
  const [options, setOptions] = useState<any>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [courseRows, setCourseRows] = useState<any[]>([]);
  const [prerequisiteRows, setPrerequisiteRows] = useState<any[]>([]);
  const [transcript, setTranscript] = useState<any>(null);
  const [issuedTranscripts, setIssuedTranscripts] = useState<any[]>([]);
  const [rankRows, setRankRows] = useState<any[]>([]);
  const [promotionRows, setPromotionRows] = useState<any[]>([]);
  const [probationRows, setProbationRows] = useState<any[]>([]);
  const [probationCandidates, setProbationCandidates] = useState<any[]>([]);
  const [graduationRows, setGraduationRows] = useState<any[]>([]);
  const [graduationReviews, setGraduationReviews] = useState<any[]>([]);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [enrollmentId, setEnrollmentId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [prerequisiteSubjectId, setPrerequisiteSubjectId] = useState('');
  const [targetSubjectId, setTargetSubjectId] = useState('');
  const [destinationYearId, setDestinationYearId] = useState('');
  const [examId, setExamId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [invigilatorId, setInvigilatorId] = useState('');
  const [examStartsAt, setExamStartsAt] = useState('');
  const [examEndsAt, setExamEndsAt] = useState('');
  const [probationReason, setProbationReason] = useState('');
  const [improvementPlan, setImprovementPlan] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [certificateNumber, setCertificateNumber] = useState('');
  const [promotionEffectiveDate, setPromotionEffectiveDate] = useState(localDateInput());
  const [promotionRemarks, setPromotionRemarks] = useState('');
  const [policyConfigured, setPolicyConfigured] = useState(false);
  const [policyForm, setPolicyForm] = useState({
    minimumAverage: '',
    maximumFailedSubjects: '',
    minimumAttendancePercent: '',
    probationAverage: '',
    minimumCoursesPerTerm: '',
    maximumCoursesPerTerm: ''
  });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const runAction = async (action: () => Promise<void>, successMessage?: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await action();
      if (successMessage) setFeedback({ type: 'success', text: successMessage });
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'The academic operation failed.' });
    } finally {
      setBusy(false);
    }
  };

  const loadOptions = async () => {
    const data = await api.getAcademicLifecycleOptions();
    setOptions(data);
    const activeYear = data.years.find((year: any) => year.status === 'active') || data.years[0];
    if (activeYear) {
      setYearId(String(activeYear.id));
      setDestinationYearId((data.years.find((year: any) => new Date(year.start_date) > new Date(activeYear.start_date)) || {}).id?.toString() || '');
      const activeTerm = data.terms.find((term: any) => String(term.academic_year_id) === String(activeYear.id) && term.status === 'active');
      if (activeTerm) setTermId(String(activeTerm.id));
      const defaultSection = data.sections.find((section: any) => String(section.academic_year_id) === String(activeYear.id));
      if (defaultSection) setSectionId(String(defaultSection.id));
    }
    const assessmentRows = await api.getAdminAssessmentsOverview();
    setAssessments(assessmentRows);
  };

  const loadPolicies = async () => {
    if (!yearId || !gradeId) {
      setPolicyConfigured(false);
      setPolicyForm({ minimumAverage: '', maximumFailedSubjects: '', minimumAttendancePercent: '', probationAverage: '', minimumCoursesPerTerm: '', maximumCoursesPerTerm: '' });
      return;
    }
    const rows = await api.getAcademicPolicies(Number(yearId));
    const policy = rows.find((item) => String(item.grade_id) === gradeId);
    if (policy) {
      setPolicyConfigured(true);
      setPolicyForm({
        minimumAverage: String(policy.minimum_average),
        maximumFailedSubjects: String(policy.maximum_failed_subjects),
        minimumAttendancePercent: String(policy.minimum_attendance_percent),
        probationAverage: String(policy.probation_average),
        minimumCoursesPerTerm: String(policy.minimum_courses_per_term),
        maximumCoursesPerTerm: String(policy.maximum_courses_per_term)
      });
    } else {
      setPolicyConfigured(false);
      setPolicyForm({ minimumAverage: '', maximumFailedSubjects: '', minimumAttendancePercent: '', probationAverage: '', minimumCoursesPerTerm: '', maximumCoursesPerTerm: '' });
    }
  };

  const loadSchedules = async () => setSchedules(await api.getAcademicExamSchedules(termId ? Number(termId) : undefined, sectionId ? Number(sectionId) : undefined));
  const loadCourses = async () => setCourseRows(await api.getAcademicCourseEnrollments(sectionId ? Number(sectionId) : undefined, termId ? Number(termId) : undefined));
  const loadPrerequisites = async () => setPrerequisiteRows(await api.getAcademicSubjectPrerequisites(gradeId ? Number(gradeId) : undefined));
  const loadProbations = async () => setProbationRows(await api.getAcademicProbations(yearId ? Number(yearId) : undefined));
  const loadGraduationReviews = async () => setGraduationReviews(await api.getAcademicGraduationReviews(yearId ? Number(yearId) : undefined));

  useEffect(() => {
    setLoading(true);
    loadOptions()
      .catch((error) => setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load academic lifecycle data.' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!options) return;
    loadPolicies().catch((error) => setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load policies.' }));
  }, [yearId, gradeId, options]);

  useEffect(() => {
    if (options && tab === 'courses') {
      loadPrerequisites().catch((error) => setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load course prerequisites.' }));
    }
  }, [gradeId, tab, options]);

  const filteredAssignments = useMemo(
    () => (options?.assignments || []).filter((assignment: any) =>
      (!sectionId || String(assignment.section_id) === sectionId) &&
      (!yearId || String(assignment.academic_year_id) === yearId)),
    [options, sectionId, yearId]
  );
  const filteredAssessments = useMemo(
    () => assessments.filter((assessment: any) =>
      (!termId || String(assessment.term_id) === termId) &&
      (!sectionId || String(assessment.section_id) === sectionId)),
    [assessments, termId, sectionId]
  );
  const activeEnrollments = options?.enrollments || [];

  const submitExam = async (event: FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      await api.saveAcademicExamSchedule({
        assessmentId: Number(examId),
        roomId: Number(roomId),
        invigilatorStaffId: invigilatorId ? Number(invigilatorId) : null,
        startsAt: examStartsAt,
        endsAt: examEndsAt
      });
      setExamId('');
      await loadSchedules();
    }, 'Exam schedule saved. Conflicts, term boundaries, and room capacity were validated.');
  };

  const submitCourse = async (event: FormEvent) => {
    event.preventDefault();
    if (!termId) return setFeedback({ type: 'error', text: 'Select a term before enrolling a student in a course.' });
    await runAction(async () => {
      await api.enrollAcademicCourse({ enrollmentId: Number(enrollmentId), teachingAssignmentId: Number(assignmentId), termId: Number(termId) });
      await loadCourses();
    }, 'Student course enrollment was recorded.');
  };

  const submitPolicy = async (event: FormEvent) => {
    event.preventDefault();
    if (!yearId || !gradeId) return setFeedback({ type: 'error', text: 'Select an academic year and grade to configure policy.' });
    if (Object.values(policyForm).some((value) => value === '')) return setFeedback({ type: 'error', text: 'Enter every progression policy value before saving.' });
    await runAction(async () => {
      await api.saveAcademicPolicy({
        academicYearId: Number(yearId),
        gradeId: Number(gradeId),
        minimumAverage: Number(policyForm.minimumAverage),
        maximumFailedSubjects: Number(policyForm.maximumFailedSubjects),
        minimumAttendancePercent: Number(policyForm.minimumAttendancePercent),
        probationAverage: Number(policyForm.probationAverage),
        minimumCoursesPerTerm: Number(policyForm.minimumCoursesPerTerm),
        maximumCoursesPerTerm: Number(policyForm.maximumCoursesPerTerm)
      });
      await loadPolicies();
    }, 'Academic progression policy saved.');
  };

  const recordPromotionDecision = async (row: any, decision: 'promoted' | 'repeat') => {
    if (!destinationYearId || !promotionEffectiveDate || !promotionRemarks.trim()) {
      setFeedback({ type: 'error', text: 'Select a destination year and effective date, and enter the reason for this promotion decision.' });
      return;
    }
    const nextGrade = decision === 'promoted'
      ? options.grades.find((grade: any) => Number(grade.grade_level) === row.gradeLevel + 1)
      : options.grades.find((grade: any) => Number(grade.id) === Number(row.gradeId));
    if (!nextGrade) {
      setFeedback({ type: 'error', text: 'No next grade exists. Use graduation review for the final grade.' });
      return;
    }
    await runAction(async () => {
      await api.recordAcademicPromotion({
        enrollmentId: row.enrollmentId,
        decision,
        toGradeId: nextGrade.id,
        toAcademicYearId: Number(destinationYearId),
        effectiveDate: promotionEffectiveDate,
        remarks: promotionRemarks.trim()
      });
      setPromotionRemarks('');
      setPromotionRows(await api.evaluateAcademicPromotions(Number(yearId)));
    }, decision === 'promoted' ? 'Promotion decision recorded.' : 'Retention decision recorded.');
  };

  const loadTranscript = async (event: FormEvent) => {
    event.preventDefault();
    if (!studentId) return;
    await runAction(async () => {
      setTranscript(await api.getAcademicTranscript(Number(studentId)));
      setIssuedTranscripts(await api.getIssuedAcademicTranscripts(Number(studentId)));
    });
  };

  const startGraduationReview = async () => {
    if (!yearId) return;
    await runAction(async () => {
      setGraduationRows(await api.evaluateAcademicGraduation(Number(yearId)));
      await loadGraduationReviews();
    });
  };

  const tabs: Array<[LifecycleTab, string]> = [
    ['exams', 'Exam schedule'],
    ['courses', 'Course enrollment'],
    ['transcripts', 'Transcripts & ranking'],
    ['promotion', 'Promotion rules'],
    ['probation', 'Academic probation'],
    ['graduation', 'Graduation']
  ];

  return (
    <section>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-header">
          <div>
            <h3 className="admin-card-title">Academic lifecycle</h3>
            <div className="admin-card-subtitle">Configure rules and manage exams, courses, results, promotion, probation, and graduation.</div>
          </div>
          <button type="button" className="btn-secondary btn-sm" disabled={busy || loading} onClick={() => void runAction(loadOptions, 'Academic options refreshed.')}>Refresh</button>
        </div>
        <div className="admin-toolbar" style={boxStyle}>
          <select className="form-control" style={fieldStyle} value={yearId} onChange={(event) => setYearId(event.target.value)}>
            <option value="">Select academic year</option>
            {(options?.years || []).map((year: any) => <option key={year.id} value={year.id}>{year.name} ({year.status})</option>)}
          </select>
          <select className="form-control" style={fieldStyle} value={termId} onChange={(event) => setTermId(event.target.value)}>
            <option value="">Select term</option>
            {(options?.terms || []).filter((term: any) => !yearId || String(term.academic_year_id) === yearId).map((term: any) =>
              <option key={term.id} value={term.id}>{term.academic_year_name} · {term.name}</option>
            )}
          </select>
          <select className="form-control" style={fieldStyle} value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
            <option value="">All sections</option>
            {(options?.sections || []).filter((section: any) => !yearId || String(section.academic_year_id) === yearId).map((section: any) =>
              <option key={section.id} value={section.id}>{section.grade_name} · {section.name}</option>
            )}
          </select>
        </div>
        <div className="admin-subtabs-bar" style={{ flexWrap: 'wrap' }}>
          {tabs.map(([id, label]) => (
            <button key={id} type="button" className={`admin-subtab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      {feedback && <div role="status" style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: feedback.type === 'error' ? '#FEF2F2' : '#ECFDF5', color: feedback.type === 'error' ? '#991B1B' : '#166534' }}>{feedback.text}</div>}
      {(loading || busy) && <p style={{ color: '#64748B' }}>{loading ? 'Loading academic data…' : 'Saving…'}</p>}

      {tab === 'exams' && (
        <div className="admin-card">
          <h4 className="admin-card-title">Schedule an exam</h4>
          <form onSubmit={(event) => void submitExam(event)} style={boxStyle}>
            <select required className="form-control" style={fieldStyle} value={examId} onChange={(event) => setExamId(event.target.value)}>
              <option value="">Assessment</option>
              {filteredAssessments.map((assessment: any) => <option key={assessment.id} value={assessment.id}>{assessment.grade_name} {assessment.section_name} · {assessment.subject_name} · {assessment.title}</option>)}
            </select>
            <select required className="form-control" style={fieldStyle} value={roomId} onChange={(event) => setRoomId(event.target.value)}>
              <option value="">Exam room</option>
              {(options?.rooms || []).map((room: any) => <option key={room.id} value={room.id}>{room.name}{room.capacity ? ` (capacity ${room.capacity})` : ''}</option>)}
            </select>
            <select className="form-control" style={fieldStyle} value={invigilatorId} onChange={(event) => setInvigilatorId(event.target.value)}>
              <option value="">Use assigned teacher</option>
              {(options?.staff || []).map((member: any) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
            <label>Starts <input required type="datetime-local" value={examStartsAt} onChange={(event) => setExamStartsAt(event.target.value)} /></label>
            <label>Ends <input required type="datetime-local" value={examEndsAt} onChange={(event) => setExamEndsAt(event.target.value)} /></label>
            <button className="btn-primary btn-sm" disabled={busy}>Add schedule</button>
          </form>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={() => void runAction(loadSchedules)}>Load schedules</button>
          <div className="admin-table-container"><table className="admin-table">
            <thead><tr><th>Exam</th><th>Class / Subject</th><th>Date &amp; time</th><th>Room</th><th>Invigilator</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{schedules.map((row) => <tr key={row.id}>
              <td>{row.title}<div style={{ fontSize: 11, color: '#64748B' }}>{row.term_name}</div></td>
              <td>{row.grade_name} {row.section_name} · {row.subject_name}</td>
              <td>{new Date(row.starts_at).toLocaleString()} – {new Date(row.ends_at).toLocaleTimeString()}</td>
              <td>{row.room_name}</td><td>{row.invigilator_name || row.teacher_name}</td><td>{row.status}</td>
              <td>{row.status === 'draft' && <button className="btn-primary btn-sm" disabled={busy} onClick={() => void runAction(async () => { await api.setAcademicExamScheduleStatus(row.id, 'published'); await loadSchedules(); }, 'Exam timetable published.')}>Publish</button>}
                {row.status === 'published' && <button className="btn-secondary btn-sm" disabled={busy} onClick={() => void runAction(async () => { await api.setAcademicExamScheduleStatus(row.id, 'locked'); await loadSchedules(); }, 'Exam timetable locked.')}>Lock</button>}</td>
            </tr>)}</tbody>
          </table></div>
        </div>
      )}

      {tab === 'courses' && (
        <div className="admin-card">
          <h4 className="admin-card-title">Course enrollment and constraints</h4>
          <p className="admin-card-subtitle">Enrollment checks active section/year membership, the configured curriculum, prerequisites, duplicate courses, and the grade/year course limit.</p>
          <form onSubmit={(event) => void submitCourse(event)} style={boxStyle}>
            <select required className="form-control" style={fieldStyle} value={enrollmentId} onChange={(event) => setEnrollmentId(event.target.value)}>
              <option value="">Student enrollment</option>
              {activeEnrollments.filter((item: any) => !yearId || String(item.academic_year_id) === yearId).map((item: any) => <option key={item.enrollment_id} value={item.enrollment_id}>{item.admission_no} · {item.student_name} · {item.grade_name} {item.section_name}</option>)}
            </select>
            <select required className="form-control" style={fieldStyle} value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}>
              <option value="">Subject / teacher / section</option>
              {filteredAssignments.map((item: any) => <option key={item.id} value={item.id}>{item.section_name} · {item.subject_name} · {item.teacher_name}</option>)}
            </select>
            <button className="btn-primary btn-sm" disabled={busy || !termId}>Enroll student</button>
          </form>
          <h5>Prerequisite rules</h5>
          <form onSubmit={(event) => {
            event.preventDefault();
            void runAction(async () => {
              await api.addAcademicSubjectPrerequisite({ gradeId: Number(gradeId), subjectId: Number(targetSubjectId), prerequisiteSubjectId: Number(prerequisiteSubjectId) });
              setTargetSubjectId(''); setPrerequisiteSubjectId(''); await loadPrerequisites();
            }, 'Course prerequisite rule saved.');
          }} style={boxStyle}>
            <select required className="form-control" style={fieldStyle} value={gradeId} onChange={(event) => setGradeId(event.target.value)}>
              <option value="">Grade</option>{(options?.grades || []).map((grade: any) => <option key={grade.id} value={grade.id}>{grade.display_name}</option>)}
            </select>
            <select required className="form-control" style={fieldStyle} value={targetSubjectId} onChange={(event) => setTargetSubjectId(event.target.value)}>
              <option value="">Course subject</option>{(options?.subjects || []).map((subject: any) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
            <select required className="form-control" style={fieldStyle} value={prerequisiteSubjectId} onChange={(event) => setPrerequisiteSubjectId(event.target.value)}>
              <option value="">Required previously passed subject</option>{(options?.subjects || []).map((subject: any) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
            <button className="btn-secondary btn-sm" disabled={busy || !gradeId}>Add prerequisite</button>
          </form>
          <div className="admin-table-container"><table className="admin-table"><thead><tr><th>Grade</th><th>Course</th><th>Prerequisite</th><th /></tr></thead>
            <tbody>{prerequisiteRows.map((row) => <tr key={row.id}><td>{row.grade_name}</td><td>{row.subject_name}</td><td>{row.prerequisite_name}</td><td><button className="btn-secondary btn-sm" disabled={busy} onClick={() => void runAction(async () => { await api.removeAcademicSubjectPrerequisite(row.id); await loadPrerequisites(); }, 'Prerequisite removed.')}>Remove</button></td></tr>)}</tbody>
          </table></div>
          <button className="btn-secondary btn-sm" disabled={busy} onClick={() => void runAction(loadCourses)}>Load course enrollments</button>
          <div className="admin-table-container"><table className="admin-table">
            <thead><tr><th>Student</th><th>Class</th><th>Subject</th><th>Term</th><th>Status</th><th /></tr></thead>
            <tbody>{courseRows.map((row) => <tr key={row.id}>
              <td>{row.student_name}<div style={{ fontSize: 11, color: '#64748B' }}>{row.admission_no}</div></td>
              <td>{row.section_name}</td><td>{row.subject_name}</td><td>{row.academic_year_name} · {row.term_name}</td><td>{row.status}</td>
              <td>{row.status === 'approved' && <button className="btn-secondary btn-sm" onClick={() => {
                const reason = window.prompt('Reason for dropping this course (required):');
                if (reason) void runAction(async () => { await api.dropAcademicCourseEnrollment(row.id, reason); await loadCourses(); }, 'Course enrollment dropped.');
              }}>Drop</button>}</td>
            </tr>)}</tbody>
          </table></div>
        </div>
      )}

      {tab === 'transcripts' && (
        <div className="admin-card">
          <h4 className="admin-card-title">Official transcript and class ranking</h4>
          <form onSubmit={(event) => void loadTranscript(event)} style={boxStyle}>
            <select required className="form-control" style={fieldStyle} value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Select student</option>
              {[...new Map(activeEnrollments.map((item: any) => [item.student_id, item])).values()].map((item: any) => <option key={item.student_id} value={item.student_id}>{item.admission_no} · {item.student_name}</option>)}
            </select>
            <button className="btn-primary btn-sm">Load transcript</button>
            {transcript && <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void runAction(async () => {
              const result = await api.issueAcademicTranscript(Number(studentId));
              setTranscript(result.payload);
              setIssuedTranscripts(await api.getIssuedAcademicTranscripts(Number(studentId)));
              setFeedback({ type: 'success', text: `Transcript ${result.transcriptNumber} issued. Use Print to produce a signed paper copy.` });
            })}>Issue transcript</button>}
            {transcript && <button type="button" className="btn-secondary btn-sm" onClick={() => window.print()}>Print</button>}
          </form>
          {transcript && <><h5>{transcript.student?.student_name} · {transcript.student?.admission_no}</h5>
            <div className="admin-table-container"><table className="admin-table">
              <thead><tr><th>Academic year</th><th>Grade / Section</th><th>Term</th><th>Average</th><th>Rank</th><th>Academic record</th></tr></thead>
              <tbody>{transcript.records.map((row: any) => <tr key={row.id}>
                <td>{row.academic_year_name}</td><td>{row.grade_name} {row.section_name}</td><td>{row.term_name}</td>
                <td>{row.average_percent ?? 'Incomplete'}{row.average_percent !== null ? '%' : ''}</td>
                <td>{row.class_rank ? `${row.class_rank} / ${row.class_size}` : 'Not ranked'}</td>
                <td><details><summary>View results</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.payload_json, null, 2)}</pre></details></td>
              </tr>)}</tbody>
            </table></div>
            <h5>Issued transcript copies</h5>{issuedTranscripts.map((issue: any) => <p key={issue.id}>{issue.transcript_number} · {new Date(issue.generated_at).toLocaleString()}</p>)}
          </>}
          <hr />
          <h4 className="admin-card-title">Published class ranking</h4>
          <div style={boxStyle}><button className="btn-secondary btn-sm" disabled={!termId || !sectionId || busy} onClick={() => void runAction(async () => setRankRows(await api.getAcademicRankings(Number(termId), Number(sectionId))))}>Load ranking</button></div>
          <div className="admin-table-container"><table className="admin-table"><thead><tr><th>Rank</th><th>Student</th><th>Admission #</th><th>Average</th><th>Class size</th></tr></thead>
            <tbody>{rankRows.map((row) => <tr key={row.enrollment_id}><td>{row.class_rank || '—'}</td><td>{row.student_name}</td><td>{row.admission_no}</td><td>{row.average_percent ?? 'Incomplete'}</td><td>{row.class_size || '—'}</td></tr>)}</tbody></table></div>
        </div>
      )}

      {tab === 'promotion' && (
        <div className="admin-card">
          <h4 className="admin-card-title">Promotion and retention policy</h4>
          <p className="admin-card-subtitle">Evaluation is a review recommendation only. Decisions are recorded by an administrator and remain auditable.</p>
          {!policyConfigured && <p style={{ color: '#9A6700', fontSize: 13 }}>No policy is saved for this year and grade yet. Enter the school-approved thresholds before saving.</p>}
          <form onSubmit={(event) => void submitPolicy(event)} style={boxStyle}>
            <select required className="form-control" style={fieldStyle} value={gradeId} onChange={(event) => setGradeId(event.target.value)}>
              <option value="">Policy grade</option>{(options?.grades || []).map((grade: any) => <option key={grade.id} value={grade.id}>{grade.display_name}</option>)}
            </select>
            <label>Minimum average % <input required type="number" min="0" max="100" step="0.01" value={policyForm.minimumAverage} onChange={(event) => setPolicyForm({ ...policyForm, minimumAverage: event.target.value })} /></label>
            <label>Maximum failed subjects <input required type="number" min="0" max="50" value={policyForm.maximumFailedSubjects} onChange={(event) => setPolicyForm({ ...policyForm, maximumFailedSubjects: event.target.value })} /></label>
            <label>Minimum attendance % <input required type="number" min="0" max="100" step="0.01" value={policyForm.minimumAttendancePercent} onChange={(event) => setPolicyForm({ ...policyForm, minimumAttendancePercent: event.target.value })} /></label>
            <label>Probation below average <input required type="number" min="0" max="100" step="0.01" value={policyForm.probationAverage} onChange={(event) => setPolicyForm({ ...policyForm, probationAverage: event.target.value })} /></label>
            <label>Minimum courses / term <input required type="number" min="0" max="50" value={policyForm.minimumCoursesPerTerm} onChange={(event) => setPolicyForm({ ...policyForm, minimumCoursesPerTerm: event.target.value })} /></label>
            <label>Maximum courses / term <input required type="number" min="1" max="50" value={policyForm.maximumCoursesPerTerm} onChange={(event) => setPolicyForm({ ...policyForm, maximumCoursesPerTerm: event.target.value })} /></label>
            <button className="btn-primary btn-sm" disabled={busy || !yearId}>Save policy</button>
            <label>Next year <select value={destinationYearId} onChange={(event) => setDestinationYearId(event.target.value)}><option value="">Select</option>{(options?.years || []).map((year: any) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
            <label>Decision effective date <input required type="date" value={promotionEffectiveDate} onChange={(event) => setPromotionEffectiveDate(event.target.value)} /></label>
            <label>Decision reason <input required maxLength={500} value={promotionRemarks} onChange={(event) => setPromotionRemarks(event.target.value)} placeholder="Enter the approved reason" /></label>
            <button type="button" className="btn-secondary btn-sm" disabled={busy || !yearId} onClick={() => void runAction(async () => setPromotionRows(await api.evaluateAcademicPromotions(Number(yearId))))}>Evaluate year</button>
          </form>
          <div className="admin-table-container"><table className="admin-table">
            <thead><tr><th>Student</th><th>Grade / section</th><th>Average</th><th>Failed</th><th>Attendance</th><th>Results</th><th>Recommendation / action</th></tr></thead>
            <tbody>{promotionRows.map((row) => <tr key={row.enrollmentId}>
              <td>{row.studentName}<div style={{ fontSize: 11, color: '#64748B' }}>{row.admissionNo}</div></td>
              <td>{row.gradeName} {row.sectionName}</td><td>{row.average ?? '—'}</td><td>{row.failedSubjects}</td>
              <td>{row.attendancePercent === null ? '—' : `${row.attendancePercent}%`}</td><td>{row.publishedTerms}/{row.expectedTerms} terms</td>
              <td>{row.decisionExists ? 'Decision recorded' : <><strong>{row.recommendedDecision}</strong>{row.reasons.length > 0 && <details><summary>Review blockers</summary>{row.reasons.join(' ')}</details>}
                {row.recommendedDecision === 'promoted' && !row.decisionExists && <div style={{ marginTop: 6 }}>
                  <button type="button" className="btn-primary btn-sm" disabled={busy || !destinationYearId} onClick={() => void recordPromotionDecision(row, 'promoted')}>Promote</button>
                  <button type="button" className="btn-secondary btn-sm" disabled={busy || !destinationYearId} onClick={() => void recordPromotionDecision(row, 'repeat')}>Retain</button>
                </div>}</>}</td>
            </tr>)}</tbody>
          </table></div>
        </div>
      )}

      {tab === 'probation' && (
        <div className="admin-card">
          <h4 className="admin-card-title">Academic probation and intervention tracking</h4>
          <form onSubmit={(event) => {
            event.preventDefault();
            void runAction(async () => {
              await api.createAcademicProbation({ enrollmentId: Number(enrollmentId), termId: Number(termId), reason: probationReason, improvementPlan, followUpDate: followUpDate || undefined });
              setProbationReason(''); setImprovementPlan(''); setFollowUpDate(''); await loadProbations();
            }, 'Probation and support plan recorded.');
          }} style={{ ...boxStyle, alignItems: 'stretch' }}>
            <select required className="form-control" style={fieldStyle} value={enrollmentId} onChange={(event) => setEnrollmentId(event.target.value)}>
              <option value="">Student enrollment</option>{activeEnrollments.filter((item: any) => !yearId || String(item.academic_year_id) === yearId).map((item: any) => <option key={item.enrollment_id} value={item.enrollment_id}>{item.admission_no} · {item.student_name} · {item.grade_name} {item.section_name}</option>)}
            </select>
            <input required style={fieldStyle} placeholder="Reason" value={probationReason} onChange={(event) => setProbationReason(event.target.value)} />
            <input type="date" style={fieldStyle} value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} />
            <textarea style={{ minWidth: 280 }} placeholder="Improvement plan / support actions" value={improvementPlan} onChange={(event) => setImprovementPlan(event.target.value)} />
            <button className="btn-primary btn-sm" disabled={busy || !termId}>Open probation</button>
          </form>
          <button className="btn-secondary btn-sm" disabled={busy || !termId} onClick={() => void runAction(async () => setProbationCandidates(await api.getAcademicProbationCandidates(Number(termId))))}>Find at-risk students from published term results</button>
          {probationCandidates.length > 0 && <div className="admin-table-container"><table className="admin-table"><thead><tr><th>Student</th><th>Grade / section</th><th>Published average</th><th>Probation threshold</th><th>Action</th></tr></thead>
            <tbody>{probationCandidates.map((candidate) => <tr key={candidate.enrollment_id}><td>{candidate.student_name}<div>{candidate.admission_no}</div></td><td>{candidate.grade_name} {candidate.section_name}</td><td>{candidate.average_percent}%</td><td>{candidate.probation_average}%</td><td>{candidate.already_on_probation ? 'Already under probation' : <button className="btn-primary btn-sm" onClick={() => { setEnrollmentId(String(candidate.enrollment_id)); setProbationReason(`Published term average ${candidate.average_percent}% is below the configured ${candidate.probation_average}% probation threshold.`); }}>Start support plan</button>}</td></tr>)}</tbody>
          </table></div>}
          <button className="btn-secondary btn-sm" onClick={() => void runAction(loadProbations)}>Load probation records</button>
          <div className="admin-table-container"><table className="admin-table"><thead><tr><th>Student</th><th>Class / term</th><th>Reason &amp; support plan</th><th>Follow up</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{probationRows.map((row) => <tr key={row.id}><td>{row.student_name}<div>{row.admission_no}</div></td><td>{row.grade_name} {row.section_name} · {row.term_name}</td><td>{row.reason}<div>{row.improvement_plan}</div></td><td>{row.follow_up_date ? new Date(row.follow_up_date).toLocaleDateString() : '—'}</td><td>{row.status}</td><td>{row.status === 'active' && <><button className="btn-primary btn-sm" onClick={() => void runAction(async () => { await api.updateAcademicProbation(row.id, 'cleared'); await loadProbations(); }, 'Probation marked cleared.')}>Clear</button><button className="btn-secondary btn-sm" onClick={() => void runAction(async () => { await api.updateAcademicProbation(row.id, 'escalated'); await loadProbations(); }, 'Probation escalated.')}>Escalate</button></>}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}

      {tab === 'graduation' && (
        <div className="admin-card">
          <h4 className="admin-card-title">Graduation eligibility and certificate workflow</h4>
          <p className="admin-card-subtitle">The system evaluates the highest active grade using the year/grade policy and published academic results. Final approval and certificate issue remain separate audited actions.</p>
          <button className="btn-primary btn-sm" disabled={busy || !yearId} onClick={() => void startGraduationReview()}>Evaluate graduation candidates</button>
          <div className="admin-table-container"><table className="admin-table"><thead><tr><th>Student</th><th>Grade / section</th><th>Average</th><th>Failed subjects</th><th>Eligibility</th><th>Action</th></tr></thead>
            <tbody>{graduationRows.map((row) => {
              const review = graduationReviews.find((item) => Number(item.enrollment_id) === row.enrollmentId);
              return <tr key={row.enrollmentId}><td>{row.studentName}<div>{row.admissionNo}</div></td><td>{row.gradeName} {row.sectionName}</td><td>{row.average ?? '—'}</td><td>{row.failedSubjects}</td>
                <td>{review?.status || (row.eligible ? 'Eligible for review' : row.reasons.join(' '))}</td>
                <td>{(!review || review.status === 'rejected') && row.eligible && <button className="btn-primary btn-sm" disabled={busy} onClick={() => void runAction(async () => { await api.saveAcademicGraduationReview({ enrollmentId: row.enrollmentId, decision: 'approved', note: 'Approved after academic eligibility review' }); await loadGraduationReviews(); }, 'Graduation eligibility approved.')}>Approve</button>}
                  {review?.status === 'approved' && <><input aria-label="Certificate number" placeholder="Certificate #" value={certificateNumber} onChange={(event) => setCertificateNumber(event.target.value)} /><button className="btn-primary btn-sm" disabled={busy || !certificateNumber} onClick={() => void runAction(async () => { await api.issueAcademicGraduationCertificate(row.enrollmentId, certificateNumber); setCertificateNumber(''); await loadGraduationReviews(); }, 'Graduation certificate issued and student status updated.')}>Issue</button></>}
                  {!review && !row.eligible && <button className="btn-secondary btn-sm" disabled={busy} onClick={() => void runAction(async () => { await api.saveAcademicGraduationReview({ enrollmentId: row.enrollmentId, decision: 'rejected', note: row.reasons.join(' ') }); await loadGraduationReviews(); }, 'Ineligible graduation review recorded.')}>Record not eligible</button>}
                </td></tr>;
            })}</tbody></table></div>
          <button className="btn-secondary btn-sm" onClick={() => void runAction(loadGraduationReviews)}>Load saved graduation reviews</button>
        </div>
      )}
    </section>
  );
}
