import { useState, useEffect, type FormEvent } from 'react';
import { api } from '../../api/client';

interface TeacherAssessmentsProps {
  assignedClasses: any[];
  terms: any[];
  onNavigateToMarks: (assessmentId: number) => void;
  onShowToast: (msg: string) => void;
}

export default function TeacherAssessments({
  assignedClasses,
  terms,
  onNavigateToMarks,
  onShowToast
}: TeacherAssessmentsProps) {
  const [activeSubTab, setActiveSubTab] = useState<'assessments' | 'homework'>('assessments');
  const [assessments, setAssessments] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Homework Submissions Modal
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [submissionsList, setSubmissionsList] = useState<any[]>([]);
  const [isSubmissionsLoading, setIsSubmissionsLoading] = useState<boolean>(false);
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);
  const [gradingScore, setGradingScore] = useState<string>('');
  const [gradingFeedback, setGradingFeedback] = useState<string>('');
  const [isGradingSaving, setIsGradingSaving] = useState<boolean>(false);

  // Create Assignment Modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [newAssignmentId, setNewAssignmentId] = useState<number | null>(null);
  const [newTermId, setNewTermId] = useState<number | null>(null);
  const [newDueDate, setNewDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0] + 'T23:59';
  });
  const [newMaxScore, setNewMaxScore] = useState('20');
  const [newAllowLate, setNewAllowLate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [assList, assignList] = await Promise.all([
        api.getAssessments(),
        api.getTeacherAssignments().catch(() => [])
      ]);
      setAssessments(assList || []);
      setAssignments(assignList || []);
      if (assignedClasses.length > 0 && !newAssignmentId) {
        setNewAssignmentId(assignedClasses[0].teaching_assignment_id);
      }
      if (terms.length > 0 && !newTermId) {
        const activeT = terms.find((t) => t.is_active) || terms[0];
        setNewTermId(activeT.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load assessments and homework.');
      onShowToast('Error loading data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenSubmissions = async (assign: any) => {
    setSelectedAssignment(assign);
    setIsSubmissionsLoading(true);
    try {
      const res = await api.getAssignmentSubmissions(assign.id);
      setSubmissionsList(res.submissions || []);
    } catch (err: any) {
      onShowToast(`Failed to load submissions: ${err.message}`);
    } finally {
      setIsSubmissionsLoading(false);
    }
  };

  const handleGradeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSubmission) return;
    const scoreNum = Number(gradingScore);
    if (isNaN(scoreNum) || scoreNum < 0) {
      alert('Please enter a valid positive score.');
      return;
    }
    setIsGradingSaving(true);
    try {
      await api.gradeSubmission(selectedSubmission.submission_id, {
        score: scoreNum,
        feedback: gradingFeedback
      });
      onShowToast('Submission graded successfully!');
      setSelectedSubmission(null);
      // Refresh submissions
      if (selectedAssignment) {
        const res = await api.getAssignmentSubmissions(selectedAssignment.id);
        setSubmissionsList(res.submissions || []);
      }
    } catch (err: any) {
      alert(`Grading failed: ${err.message}`);
    } finally {
      setIsGradingSaving(false);
    }
  };

  const handleCreateAssignment = async (e: FormEvent) => {
    e.preventDefault();
    if (!newAssignmentId) {
      alert('Please select a teaching assignment.');
      return;
    }
    setIsCreating(true);
    try {
      await api.createTeacherAssignment({
        teachingAssignmentId: newAssignmentId,
        termId: newTermId || undefined,
        title: newTitle.trim(),
        instructions: newInstructions.trim() || undefined,
        dueAt: newDueDate,
        maxScore: Number(newMaxScore) || undefined,
        allowLate: newAllowLate,
        status: 'published'
      });
      onShowToast('Homework assignment published successfully!');
      setShowCreateModal(false);
      setNewTitle('');
      setNewInstructions('');
      fetchData();
    } catch (err: any) {
      alert(`Failed to create assignment: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div>
      <div className="page-header-row">
        <div>
          <div className="page-breadcrumb">
            <span>Teacher Portal</span> / <span>Examinations</span> / <span>Assignments &amp; Assessments</span>
          </div>
          <h2 className="page-title">Assignments &amp; Assessments Center</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className={`btn-${activeSubTab === 'assessments' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveSubTab('assessments')}
          >
            Examinations &amp; Tests ({assessments.length})
          </button>
          <button
            type="button"
            className={`btn-${activeSubTab === 'homework' ? 'primary' : 'secondary'}`}
            onClick={() => setActiveSubTab('homework')}
          >
            Homework &amp; Assignments ({assignments.length})
          </button>
          {activeSubTab === 'homework' && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowCreateModal(true)}
            >
              + Create Assignment
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748B' }}>
          <div className="spinner" style={{ margin: '0 auto 16px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '28px', height: '28px' }}></div>
          <p>Loading assessment registry from MySQL...</p>
        </div>
      ) : error ? (
        <div className="alert-banner alert-danger">
          <span>⚠️ {error}</span>
        </div>
      ) : activeSubTab === 'assessments' ? (
        /* EXAMINATIONS & FORMAL ASSESSMENTS */
        <div>
          <div className="rules-hint-box" style={{ marginBottom: '16px' }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Formal assessments count towards term grade aggregation. Once scores are submitted, they proceed through the administrative approval lifecycle: <code>draft &rarr; submitted &rarr; approved &rarr; published</code>.
            </span>
          </div>

          <div className="data-table-container">
            <table className="spec-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Assessment Title</th>
                  <th>Subject</th>
                  <th>Section</th>
                  <th>Term</th>
                  <th style={{ textAlign: 'center' }}>Max Score</th>
                  <th style={{ textAlign: 'center' }}>Weight</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'center' }}>Approval Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {assessments.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                      No formal assessments registered.
                    </td>
                  </tr>
                ) : (
                  assessments.map((a, idx) => {
                    const status = a.marks_submission_status || a.status || 'draft';
                    return (
                      <tr key={a.id}>
                        <td style={{ color: '#64748B', fontWeight: 600 }}>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#1F3A5F' }}>{a.title}</div>
                          <span style={{ fontSize: '11px', color: '#64748B' }}>{a.assessment_type_name || 'Standard Test'}</span>
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
                            className="btn-primary btn-sm"
                            onClick={() => onNavigateToMarks(a.id)}
                          >
                            Open Marks &rarr;
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* HOMEWORK & ASSIGNMENTS */
        <div>
          <div className="rules-hint-box" style={{ marginBottom: '16px' }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Homework assignments support online submissions from students. Teachers can inspect student responses, award marks, and provide qualitative pedagogical feedback.
            </span>
          </div>

          <div className="data-table-container">
            <table className="spec-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Assignment Title</th>
                  <th>Subject &amp; Section</th>
                  <th>Term</th>
                  <th>Due Date</th>
                  <th style={{ textAlign: 'center' }}>Max Score</th>
                  <th style={{ textAlign: 'center' }}>Submissions</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                      No homework assignments published yet. Use "+ Create Assignment" to publish a task for your students.
                    </td>
                  </tr>
                ) : (
                  assignments.map((assign, idx) => (
                    <tr key={assign.id}>
                      <td style={{ color: '#64748B', fontWeight: 600 }}>{idx + 1}</td>
                      <td>
                        <div style={{ fontWeight: 700, color: '#1F3A5F' }}>{assign.title}</div>
                        {assign.instructions && (
                          <span style={{ fontSize: '11px', color: '#64748B', display: 'block', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {assign.instructions}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{assign.subject_name}</div>
                        <span style={{ fontSize: '11px', color: '#64748B' }}>{assign.section_name}</span>
                      </td>
                      <td>{assign.term_name || 'Active Term'}</td>
                      <td style={{ color: '#64748B', fontSize: '12px' }}>
                        {new Date(assign.due_at).toLocaleDateString()} {new Date(assign.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: '#1F3A5F' }}>
                        {assign.max_score || '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="counter-pill counter-present" style={{ fontSize: '11px' }}>
                          {assign.submission_count} / {assign.total_enrolled}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`status-badge status-${assign.status || 'published'}`}>
                          {(assign.status || 'published').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleOpenSubmissions(assign)}
                        >
                          Review Submissions &rarr;
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBMISSIONS MODAL */}
      {selectedAssignment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '840px', width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1F3A5F' }}>
                  Submissions: {selectedAssignment.title}
                </h3>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  Max Score: {selectedAssignment.max_score || 'N/A'} • Due: {new Date(selectedAssignment.due_at).toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setSelectedAssignment(null);
                  setSelectedSubmission(null);
                }}
              >
                Close
              </button>
            </div>

            {isSubmissionsLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>
                <div className="spinner" style={{ margin: '0 auto 12px', borderColor: '#1F3A5F', borderTopColor: 'transparent', width: '24px', height: '24px' }}></div>
                <p>Loading student submissions from MySQL...</p>
              </div>
            ) : (
              <div className="data-table-container">
                <table className="spec-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Student</th>
                      <th>Submission Status</th>
                      <th>Submitted At</th>
                      <th>Score</th>
                      <th>Feedback</th>
                      <th style={{ textAlign: 'right' }}>Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissionsList.map((sub, idx) => (
                      <tr key={sub.enrollment_id}>
                        <td style={{ color: '#64748B' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 600, color: '#1F3A5F' }}>
                          {sub.student_name}
                          <span style={{ display: 'block', fontSize: '11px', color: '#64748B', fontWeight: 400 }}>
                            {sub.admission_no} • Roll: {sub.roll_no}
                          </span>
                        </td>
                        <td>
                          {sub.submission_id ? (
                            <span className="badge-solid badge-emerald">
                              {sub.is_late ? 'LATE SUBMISSION' : 'SUBMITTED'}
                            </span>
                          ) : (
                            <span className="badge-solid badge-slate">NOT SUBMITTED</span>
                          )}
                        </td>
                        <td style={{ fontSize: '12px', color: '#64748B' }}>
                          {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ fontWeight: 700, color: '#1F3A5F' }}>
                          {sub.score !== null && sub.score !== undefined ? `${sub.score} / ${selectedAssignment.max_score || 100}` : '—'}
                        </td>
                        <td style={{ fontSize: '12px', color: '#64748B', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {sub.feedback || '—'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {sub.submission_id ? (
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() => {
                                setSelectedSubmission(sub);
                                setGradingScore(sub.score ? String(sub.score) : '');
                                setGradingFeedback(sub.feedback || '');
                              }}
                            >
                              Grade / Edit &rarr;
                            </button>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#94A3B8' }}>Awaiting</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* GRADING FORM DRAWER */}
            {selectedSubmission && (
              <div style={{ marginTop: '20px', padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #CBD5E1' }}>
                <h4 style={{ margin: '0 0 10px', color: '#1F3A5F', fontSize: '15px' }}>
                  Grade Submission: {selectedSubmission.student_name} ({selectedSubmission.admission_no})
                </h4>
                {selectedSubmission.content_text && (
                  <div style={{ background: '#FFFFFF', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '12px', fontSize: '13px', color: '#334155' }}>
                    <strong>Student Response:</strong>
                    <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{selectedSubmission.content_text}</p>
                  </div>
                )}
                <form onSubmit={handleGradeSubmit} style={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: '12px', alignItems: 'end' }}>
                  <div>
                    <label className="filter-label" htmlFor="gradeScoreInput">Score (Max: {selectedAssignment.max_score || 100}):</label>
                    <input
                      id="gradeScoreInput"
                      type="number"
                      step="0.5"
                      min="0"
                      max={selectedAssignment.max_score || 100}
                      className="form-input"
                      value={gradingScore}
                      onChange={(e) => setGradingScore(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="filter-label" htmlFor="gradeFeedbackInput">Teacher Feedback:</label>
                    <input
                      id="gradeFeedbackInput"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Good explanation of thermodynamics principles."
                      value={gradingFeedback}
                      onChange={(e) => setGradingFeedback(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button type="submit" className="btn-primary" disabled={isGradingSaving}>
                      {isGradingSaving ? 'Saving...' : 'Save Grade'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => setSelectedSubmission(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE HOMEWORK MODAL */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120 }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', padding: '28px', maxWidth: '520px', width: '95%', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800, color: '#1F3A5F' }}>
              Create Homework Assignment
            </h3>
            <form onSubmit={handleCreateAssignment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="input-label" htmlFor="hwAssignmentSelect">Teaching Assignment (Class &amp; Subject)</label>
                <select
                  id="hwAssignmentSelect"
                  className="form-select"
                  value={newAssignmentId || ''}
                  onChange={(e) => setNewAssignmentId(Number(e.target.value))}
                  required
                  disabled={assignedClasses.length === 0}
                >
                  {assignedClasses.length === 0 ? (
                    <option value="" disabled>⚠️ No class assignments found for your teacher account</option>
                  ) : (
                    <>
                      <option value="" disabled>-- Select Teaching Assignment --</option>
                      {assignedClasses.map((c) => (
                        <option key={c.teaching_assignment_id} value={c.teaching_assignment_id}>
                          {c.section_name} — {c.subject_name} ({c.grade_name})
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {assignedClasses.length === 0 && (
                  <div style={{ marginTop: '8px', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#991B1B', fontSize: '12px', lineHeight: 1.5 }}>
                    ⚠️ <strong>No Teaching Assignments Found:</strong> Your teacher account does not have any classes or subjects assigned yet by the administration.
                  </div>
                )}
              </div>

              <div>
                <label className="input-label" htmlFor="hwTermSelect">Academic Term</label>
                <select
                  id="hwTermSelect"
                  className="form-select"
                  value={newTermId || ''}
                  onChange={(e) => setNewTermId(Number(e.target.value))}
                >
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="input-label" htmlFor="hwTitleInput">Assignment Title</label>
                <input
                  id="hwTitleInput"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Chapter 4 Numerical Problem Set"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="input-label" htmlFor="hwInstructionsInput">Instructions / Questions</label>
                <textarea
                  id="hwInstructionsInput"
                  className="form-input"
                  rows={3}
                  placeholder="Provide instructions, problem numbers, or submission guidelines..."
                  value={newInstructions}
                  onChange={(e) => setNewInstructions(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="input-label" htmlFor="hwDueDateInput">Due Date &amp; Time</label>
                  <input
                    id="hwDueDateInput"
                    type="datetime-local"
                    className="form-input"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="input-label" htmlFor="hwMaxScoreInput">Max Score</label>
                  <input
                    id="hwMaxScoreInput"
                    type="number"
                    min="1"
                    className="form-input"
                    value={newMaxScore}
                    onChange={(e) => setNewMaxScore(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="hwAllowLateInput"
                  checked={newAllowLate}
                  onChange={(e) => setNewAllowLate(e.target.checked)}
                />
                <label htmlFor="hwAllowLateInput" style={{ fontSize: '13px', color: '#334155', cursor: 'pointer' }}>
                  Allow late submissions after deadline
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={isCreating}>
                  {isCreating ? 'Publishing...' : 'Publish to Students'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
