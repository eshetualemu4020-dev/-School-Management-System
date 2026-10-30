import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { StudentSpinner, StudentErrorState, StudentEmptyState } from './StudentCommon';

interface StudentDocumentsProps {
  showToast?: (message: string) => void;
  onNavigateTab?: (page: string) => void;
}

type DocumentTab = 'report-cards' | 'transcripts' | 'issued-docs' | 'request-doc' | 'my-requests';

export const StudentDocuments: React.FC<StudentDocumentsProps> = ({ showToast }) => {
  const [activeTab, setActiveTab] = useState<DocumentTab>('report-cards');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [reportCardsData, setReportCardsData] = useState<any>(null);
  const [transcriptsData, setTranscriptsData] = useState<any>(null);
  const [issuedDocsData, setIssuedDocsData] = useState<any>(null);
  const [requestTypes, setRequestTypes] = useState<any[]>([]);
  const [requestsData, setRequestsData] = useState<any>(null);

  // Interactive states
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedReportCard, setSelectedReportCard] = useState<any | null>(null);
  const [cancellingRequestId, setCancellingRequestId] = useState<number | null>(null);

  // Request form state
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [reqForm, setReqForm] = useState({
    requestType: 'transcript',
    purpose: '',
    reason: '',
    copiesRequested: 1,
    deliveryMethod: 'download' as 'download' | 'collect'
  });

  useEffect(() => {
    loadAllDocumentsData();
  }, []);

  const loadAllDocumentsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rc, tr, docs, types, reqs] = await Promise.all([
        api.getStudentReportCards().catch(() => ({ reportCards: [], count: 0 })),
        api.getStudentTranscripts().catch(() => ({ transcripts: [], totalIssued: 0, academicHistorySummary: null })),
        api.getStudentIssuedDocuments().catch(() => ({ documents: [], annualCertificates: [], currentYearProgress: null })),
        api.getStudentRequestTypes().catch(() => []),
        api.getStudentRequests().catch(() => ({ requests: [], count: 0 }))
      ]);

      setReportCardsData(rc);
      setTranscriptsData(tr);
      setIssuedDocsData(docs);
      setRequestTypes(types);
      setRequestsData(reqs);

      if (rc.reportCards && rc.reportCards.length > 0) {
        setSelectedReportCard(rc.reportCards[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load official document records.');
    } finally {
      setLoading(false);
    }
  };

  // Download Handler for Report Cards
  const handleDownloadReportCard = async (snapshotId: number, refNo: string) => {
    try {
      setDownloadingId(`rc-${snapshotId}`);
      await api.downloadStudentReportCard(snapshotId, `${refNo}.pdf`);
      showToast?.(`Downloaded Report Card: ${refNo}`);
    } catch (err: any) {
      alert(`Download Error: ${err.message || 'Could not download report card PDF'}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Download Handler for Documents & Annual Certificates
  const handleDownloadDocument = async (docId: number, filename: string, title?: string) => {
    try {
      setDownloadingId(`doc-${docId}`);
      await api.downloadStudentDocument(docId, filename);
      showToast?.(`Downloaded ${title || 'Document'}`);
    } catch (err: any) {
      alert(`Download Error: ${err.message || 'Could not download document file'}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Download Handler for Official Transcripts
  const handleDownloadTranscript = async (transcriptId: number, refNo: string) => {
    try {
      setDownloadingId(`tr-${transcriptId}`);
      await api.downloadStudentTranscript(transcriptId, `${refNo}.pdf`);
      showToast?.(`Downloaded Official Transcript: ${refNo}`);
    } catch (err: any) {
      alert(`Download Error: ${err.message || 'Could not download transcript PDF'}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Submit Request Handler with Duplicate Check
  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!reqForm.purpose.trim()) {
      setFormError('Please specify the purpose for this document request.');
      return;
    }

    setSubmittingRequest(true);
    try {
      const res = await api.submitStudentRequest({
        requestType: reqForm.requestType,
        purpose: reqForm.purpose.trim(),
        reason: reqForm.reason.trim() || undefined,
        copiesRequested: Number(reqForm.copiesRequested),
        deliveryMethod: reqForm.deliveryMethod
      });

      setFormSuccess(`Request #${res.requestNo} submitted successfully! The Registrar's Office has been notified.`);
      showToast?.(`Request #${res.requestNo} submitted.`);

      // Reset form
      setReqForm({
        requestType: 'transcript',
        purpose: '',
        reason: '',
        copiesRequested: 1,
        deliveryMethod: 'download'
      });

      // Refresh requests list
      const refreshedReqs = await api.getStudentRequests();
      setRequestsData(refreshedReqs);

      // Switch to My Requests tab after 1.5s
      setTimeout(() => {
        setActiveTab('my-requests');
        setFormSuccess(null);
      }, 1800);
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit document request.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Cancel Request Handler
  const handleCancelRequest = async (requestId: number, refNo: string) => {
    if (!window.confirm(`Are you sure you want to cancel request #${refNo}?`)) {
      return;
    }

    setCancellingRequestId(requestId);
    try {
      await api.cancelStudentRequest(requestId);
      showToast?.(`Request #${refNo} cancelled.`);
      const refreshed = await api.getStudentRequests();
      setRequestsData(refreshed);
    } catch (err: any) {
      alert(`Cancellation Error: ${err.message || 'Failed to cancel request.'}`);
    } finally {
      setCancellingRequestId(null);
    }
  };

  if (loading) {
    return <StudentSpinner message="Retrieving official records, report cards, and credentials from MySQL..." />;
  }

  if (error) {
    return <StudentErrorState title="Unable to Load Documents" message={error} onRetry={loadAllDocumentsData} />;
  }

  const reportCards = reportCardsData?.reportCards || [];
  const transcripts = transcriptsData?.transcripts || [];
  const issuedDocuments = issuedDocsData?.documents || [];
  const annualCertificates = issuedDocsData?.annualCertificates || [];
  const currentYearProgress = issuedDocsData?.currentYearProgress;
  const requests = requestsData?.requests || [];

  return (
    <div className="teacher-content" style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* 1. PAGE HEADER */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#1F3A5F', margin: '0 0 6px 0' }}>
            Report Cards & Documents
          </h1>
          <p style={{ margin: 0, color: '#64748B', fontSize: '14px' }}>
            Official certified report cards, transcripts, annual completion certificates, and registrar document requests.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('request-doc')}
            style={{
              background: '#1F3A5F',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(31,58,95,0.2)'
            }}
          >
            <span>✍️</span>
            <span>Request a Document</span>
          </button>
        </div>
      </div>

      {/* 2. TAB NAVIGATION (NO NUMERIC PREFIXES) */}
      <div style={{
        display: 'flex',
        borderBottom: '2px solid #E2E8F0',
        marginBottom: '24px',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '2px'
      }}>
        {[
          { key: 'report-cards', label: 'Report Cards', count: reportCards.length },
          { key: 'transcripts', label: 'Transcripts', count: transcripts.length },
          { key: 'issued-docs', label: 'Issued Documents & Certificates', count: issuedDocuments.length + annualCertificates.length },
          { key: 'request-doc', label: 'Request a Document' },
          { key: 'my-requests', label: 'My Requests', count: requests.length }
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as DocumentTab)}
              style={{
                padding: '12px 18px',
                border: 'none',
                background: 'none',
                borderBottom: isActive ? '3px solid #1F3A5F' : '3px solid transparent',
                color: isActive ? '#1F3A5F' : '#64748B',
                fontWeight: isActive ? 800 : 600,
                fontSize: '14px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span style={{
                  background: isActive ? '#1F3A5F' : '#F1F5F9',
                  color: isActive ? '#fff' : '#64748B',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ============================================================== */}
      {/* TAB 1: REPORT CARDS */}
      {/* ============================================================== */}
      {activeTab === 'report-cards' && (
        <div>
          {reportCards.length === 0 ? (
            <StudentEmptyState
              title="No Published Report Cards"
              description="Official report cards are sealed and published by the administration at the end of each completed semester."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) 2fr', gap: '24px', alignItems: 'start' }}>
              {/* Left Column: List of Report Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#1F3A5F', fontWeight: 800 }}>
                  Published Term Cards
                </h3>
                {reportCards.map((rc: any) => {
                  const isSelected = selectedReportCard?.id === rc.id;
                  const isDownloading = downloadingId === `rc-${rc.id}`;
                  return (
                    <div
                      key={rc.id}
                      onClick={() => setSelectedReportCard(rc)}
                      style={{
                        background: '#fff',
                        border: isSelected ? '2px solid #1F3A5F' : '1px solid #E2E8F0',
                        borderRadius: '10px',
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        boxShadow: isSelected ? '0 4px 12px rgba(31,58,95,0.08)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{
                          background: '#E0F2FE',
                          color: '#0369A1',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700
                        }}>
                          {rc.academic_year_name}
                        </span>
                        <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>✓</span> Published Record
                        </span>
                      </div>

                      <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#1F3A5F', fontWeight: 700 }}>
                        {rc.term_name} Report Card
                      </h4>

                      <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '12px' }}>
                        Ref: <code style={{ fontWeight: 600 }}>{rc.reference_no}</code> &bull; Published {rc.publication_date ? new Date(rc.publication_date).toLocaleDateString() : 'Active'}
                      </div>

                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px',
                        background: '#F8FAFC',
                        padding: '10px',
                        borderRadius: '6px',
                        marginBottom: '12px',
                        textAlign: 'center'
                      }}>
                        <div>
                          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Average</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#1F3A5F' }}>{rc.average_percent}%</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Rank</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0369A1' }}>#{rc.class_rank} / {rc.class_size}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>Subjects</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#16A34A' }}>{rc.payload?.subjects?.length || 5}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadReportCard(rc.id, rc.reference_no);
                        }}
                        style={{
                          width: '100%',
                          background: isDownloading ? '#94A3B8' : '#1F3A5F',
                          color: '#fff',
                          border: 'none',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: isDownloading ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>📥</span>
                        <span>{isDownloading ? 'Generating Certified PDF...' : 'Download Certified PDF'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Right Column: Active Card Preview */}
              {selectedReportCard && (
                <div style={{
                  background: '#fff',
                  border: '1px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '24px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
                }}>
                  {/* Official Header */}
                  <div style={{ textAlign: 'center', borderBottom: '2px solid #E2E8F0', paddingBottom: '16px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748B', letterSpacing: '1px' }}>
                      HIGH SCHOOL & PREPARATORY SCHOOL ERP
                    </div>
                    <h2 style={{ margin: '4px 0', fontSize: '20px', fontWeight: 800, color: '#1F3A5F' }}>
                      OFFICIAL TERM REPORT CARD
                    </h2>
                    <div style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                      {selectedReportCard.term_name} &bull; Academic Year {selectedReportCard.academic_year_name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
                      Record Reference: <strong>{selectedReportCard.reference_no}</strong> &bull; Status: <strong>Published & Sealed</strong>
                    </div>
                  </div>

                  {/* Student Metadata Box */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                    background: '#F8FAFC',
                    padding: '14px 18px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    fontSize: '13px'
                  }}>
                    <div>
                      <span style={{ color: '#64748B' }}>Student Name: </span>
                      <strong style={{ color: '#1F3A5F' }}>{selectedReportCard.payload?.studentName || 'Hana Bekele'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Admission No: </span>
                      <strong style={{ color: '#1F3A5F' }}>{selectedReportCard.payload?.admissionNo || 'HS-2026-0001'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Section: </span>
                      <strong style={{ color: '#1F3A5F' }}>{selectedReportCard.payload?.sectionName || 'Grade 10 - Section A'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Class Standing: </span>
                      <strong style={{ color: '#16A34A' }}>Rank #{selectedReportCard.class_rank} of {selectedReportCard.class_size}</strong>
                    </div>
                  </div>

                  {/* Subjects Results Table */}
                  <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#F1F5F9', color: '#334155', textAlign: 'left' }}>
                          <th style={{ padding: '10px 12px', borderBottom: '2px solid #E2E8F0' }}>Code</th>
                          <th style={{ padding: '10px 12px', borderBottom: '2px solid #E2E8F0' }}>Subject</th>
                          <th style={{ padding: '10px 12px', borderBottom: '2px solid #E2E8F0', textAlign: 'right' }}>Score / Max</th>
                          <th style={{ padding: '10px 12px', borderBottom: '2px solid #E2E8F0', textAlign: 'center' }}>Grade</th>
                          <th style={{ padding: '10px 12px', borderBottom: '2px solid #E2E8F0' }}>Teacher Remark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReportCard.payload?.subjects?.map((sub: any, i: number) => (
                          <tr key={i} style={{ borderBottom: '1px solid #E2E8F0', background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600, color: '#64748B' }}>{sub.code}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 700, color: '#1F3A5F' }}>{sub.name}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>
                              {sub.score} <span style={{ color: '#94A3B8', fontWeight: 400 }}>/ {sub.maxScore || 100}</span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                width: '28px',
                                height: '28px',
                                lineHeight: '28px',
                                borderRadius: '6px',
                                background: sub.letter === 'A' ? '#DCFCE7' : '#F1F5F9',
                                color: sub.letter === 'A' ? '#15803D' : '#334155',
                                fontWeight: 800,
                                fontSize: '13px'
                              }}>
                                {sub.letter}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', color: '#475569', fontSize: '12px' }}>
                              {sub.remark || 'Satisfactory academic performance.'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Bar */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#F1F5F9',
                    padding: '14px 18px',
                    borderRadius: '8px',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>Term Average: </span>
                      <strong style={{ fontSize: '16px', color: '#1F3A5F', marginLeft: '6px' }}>{selectedReportCard.average_percent}%</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>Term Attendance: </span>
                      <strong style={{ fontSize: '16px', color: '#0369A1', marginLeft: '6px' }}>{selectedReportCard.payload?.attendanceRate || 96.5}%</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadReportCard(selectedReportCard.id, selectedReportCard.reference_no)}
                      disabled={downloadingId === `rc-${selectedReportCard.id}`}
                      style={{
                        background: '#1F3A5F',
                        color: '#fff',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>📥</span>
                      <span>Download Official PDF</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 2: TRANSCRIPTS */}
      {/* ============================================================== */}
      {activeTab === 'transcripts' && (
        <div>
          <div style={{
            background: '#F0F9FF',
            border: '1px solid #BAE6FD',
            borderRadius: '10px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 800, color: '#0369A1' }}>
                Official Sealed Academic Transcripts
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#0C4A6E', maxWidth: '640px' }}>
                Transcripts are generated from published and approved term records by the Office of the Registrar.
                Active enrolled years: <strong>{transcriptsData?.academicHistorySummary?.enrolledYears || 1}</strong> &bull; Current Year: <strong>{transcriptsData?.academicHistorySummary?.activeYear || '2026/27'}</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setReqForm((prev) => ({ ...prev, requestType: 'transcript' }));
                setActiveTab('request-doc');
              }}
              style={{
                background: '#0284C7',
                color: '#fff',
                border: 'none',
                padding: '9px 16px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Request New Transcript &rarr;
            </button>
          </div>

          {transcripts.length === 0 ? (
            <StudentEmptyState
              title="No Issued Transcripts Found"
              description="Transcripts appear here automatically once issued and sealed by the Registrar's Office. You can submit a request using the 'Request a Document' tab."
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
              {transcripts.map((tr: any) => {
                const isDownloading = downloadingId === `tr-${tr.id}`;
                return (
                  <div
                    key={tr.id}
                    style={{
                      background: '#fff',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '20px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#16A34A', background: '#DCFCE7', padding: '3px 8px', borderRadius: '4px' }}>
                        ✓ Sealed Official Record
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748B' }}>
                        {tr.issue_date ? new Date(tr.issue_date).toLocaleDateString() : 'Issued'}
                      </span>
                    </div>

                    <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 800, color: '#1F3A5F' }}>
                      Academic Transcript
                    </h4>

                    <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px' }}>
                      Reference: <code style={{ fontWeight: 700 }}>{tr.reference_no}</code>
                    </div>

                    <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '16px', background: '#F8FAFC', padding: '10px', borderRadius: '6px' }}>
                      <strong>Purpose:</strong> {tr.purpose || 'Official Academic Submission'}
                    </div>

                    <button
                      type="button"
                      disabled={isDownloading}
                      onClick={() => handleDownloadTranscript(tr.id, tr.reference_no)}
                      style={{
                        width: '100%',
                        background: isDownloading ? '#94A3B8' : '#1F3A5F',
                        color: '#fff',
                        border: 'none',
                        padding: '10px 14px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: isDownloading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <span>📥</span>
                      <span>{isDownloading ? 'Downloading...' : 'Download Stamped Transcript (PDF)'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 3: ISSUED DOCUMENTS & ANNUAL CERTIFICATES */}
      {/* ============================================================== */}
      {activeTab === 'issued-docs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {/* ANNUAL CERTIFICATES HIGHLIGHT (SEMESTER 1 & 2 COMPLETION) */}
          <div style={{
            background: 'linear-gradient(135deg, #1F3A5F 0%, #162C46 100%)',
            color: '#fff',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 8px 24px rgba(31,58,95,0.18)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
              <div>
                <span style={{
                  background: 'rgba(255,255,255,0.15)',
                  color: '#93C5FD',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.5px'
                }}>
                  🎓 ANNUAL ACADEMIC CERTIFICATES
                </span>
                <h2 style={{ margin: '8px 0 4px 0', fontSize: '22px', fontWeight: 800 }}>
                  Annual Promotion & Completion Credentials
                </h2>
                <p style={{ margin: 0, color: '#CBD5E1', fontSize: '13px', maxWidth: '640px' }}>
                  Conferred upon successful completion of both Semester 1 and Semester 2 with passing annual marks.
                </p>
              </div>

              {currentYearProgress && (
                <div style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  maxWidth: '360px',
                  fontSize: '12px'
                }}>
                  <div style={{ fontWeight: 700, color: '#FCD34D', marginBottom: '4px' }}>
                    ⏳ Current Year Status ({currentYearProgress.academicYearName}):
                  </div>
                  <div style={{ color: '#E2E8F0', lineHeight: 1.4 }}>
                    {currentYearProgress.annualCertificateStatus}
                  </div>
                </div>
              )}
            </div>

            {/* Annual Certificates Cards */}
            {annualCertificates.length === 0 ? (
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '16px', textAlign: 'center', fontSize: '13px' }}>
                No completed academic years recorded yet. Certificates are issued automatically upon publishing of Semester 2 marks.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {annualCertificates.map((cert: any) => {
                  const isDownloading = downloadingId === `doc-${cert.id}`;
                  return (
                    <div
                      key={cert.id}
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '10px',
                        padding: '18px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ background: '#16A34A', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800 }}>
                            {cert.outcome}
                          </span>
                          <span style={{ fontSize: '11px', color: '#94A3B8' }}>{cert.academic_year_name}</span>
                        </div>

                        <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 800, color: '#fff' }}>
                          {cert.title}
                        </h4>

                        <div style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '10px' }}>
                          Credential Ref: <code style={{ color: '#93C5FD', fontWeight: 700 }}>{cert.reference_no}</code>
                        </div>

                        <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '16px' }}>
                          Authority: <strong>{cert.issued_by_role}</strong> &bull; Validity: <strong>Permanent</strong>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownloadDocument(cert.id, `${cert.reference_no}.pdf`, cert.title)}
                        style={{
                          background: isDownloading ? '#64748B' : '#38BDF8',
                          color: '#0F172A',
                          border: 'none',
                          padding: '10px',
                          borderRadius: '6px',
                          fontWeight: 800,
                          fontSize: '12px',
                          cursor: isDownloading ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>📜</span>
                        <span>{isDownloading ? 'Generating Certificate...' : 'Download Certified Parchment (PDF)'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* OTHER ISSUED DOCUMENTS GRID */}
          <div>
            <h3 style={{ margin: '0 0 14px 0', fontSize: '18px', fontWeight: 800, color: '#1F3A5F' }}>
              Official Identity & Verified Archive Documents
            </h3>

            {issuedDocuments.length === 0 ? (
              <StudentEmptyState
                title="No Stored Documents"
                description="Verified national identity records, birth certificates, and registration documents will appear here."
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {issuedDocuments.map((doc: any) => {
                  const isDownloading = downloadingId === `doc-${doc.id}`;
                  return (
                    <div
                      key={doc.id}
                      style={{
                        background: '#fff',
                        border: '1px solid #E2E8F0',
                        borderRadius: '10px',
                        padding: '18px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{
                          background: '#F1F5F9',
                          color: '#475569',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase'
                        }}>
                          {doc.doc_type.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: '11px', color: '#16A34A', fontWeight: 700 }}>✓ Verified</span>
                      </div>

                      <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: '#1F3A5F' }}>
                        {doc.original_name}
                      </h4>

                      <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '12px' }}>
                        Ref: <code>{doc.reference_no}</code> &bull; Size: {(doc.size_bytes / 1024).toFixed(1)} KB
                      </div>

                      <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '14px' }}>
                        Issued by: <strong>{doc.issued_by_role}</strong>
                      </div>

                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownloadDocument(doc.id, doc.original_name, doc.original_name)}
                        style={{
                          width: '100%',
                          background: isDownloading ? '#94A3B8' : '#F1F5F9',
                          color: isDownloading ? '#fff' : '#1F3A5F',
                          border: '1px solid #CBD5E1',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '12px',
                          cursor: isDownloading ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <span>📥</span>
                        <span>{isDownloading ? 'Downloading...' : 'Download Stamped Copy'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 4: REQUEST A DOCUMENT */}
      {/* ============================================================== */}
      {activeTab === 'request-doc' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '24px', alignItems: 'start' }}>
          {/* Left Column: Request Types Guide */}
          <div>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: 800, color: '#1F3A5F' }}>
              Available Document Types
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {requestTypes.map((type: any) => {
                const isSelected = reqForm.requestType === type.id;
                return (
                  <div
                    key={type.id}
                    onClick={() => setReqForm((prev) => ({ ...prev, requestType: type.id }))}
                    style={{
                      background: isSelected ? '#F0F9FF' : '#fff',
                      border: isSelected ? '2px solid #0284C7' : '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '14px', color: '#1F3A5F' }}>{type.name}</strong>
                      <span style={{ fontSize: '11px', color: '#0369A1', fontWeight: 700 }}>
                        ~{type.estimatedDays} days
                      </span>
                    </div>
                    <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#64748B', lineHeight: 1.4 }}>
                      {type.description}
                    </p>
                    <div style={{ fontSize: '11px', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Fee: <strong>{type.feeDescription}</strong></span>
                      <span>Limit: up to {type.copiesLimit} copies</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Submission Form */}
          <div style={{
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.04)'
          }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 800, color: '#1F3A5F' }}>
              Submit Document Request
            </h3>
            <p style={{ margin: '0 0 20px 0', color: '#64748B', fontSize: '13px' }}>
              Your request will be submitted directly to the Office of the Registrar. Duplicate open requests of the same type are blocked.
            </p>

            {formError && (
              <div style={{
                background: '#FEF2F2',
                border: '1px solid #F87171',
                color: '#B91C1C',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '18px'
              }}>
                ⚠️ {formError}
              </div>
            )}

            {formSuccess && (
              <div style={{
                background: '#F0FDF4',
                border: '1px solid #86EFAC',
                color: '#15803D',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                marginBottom: '18px'
              }}>
                ✓ {formSuccess}
              </div>
            )}

            <form onSubmit={handleSubmitRequest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Document Type *
                </label>
                <select
                  value={reqForm.requestType}
                  onChange={(e) => setReqForm({ ...reqForm, requestType: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '14px',
                    background: '#fff'
                  }}
                >
                  {requestTypes.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Purpose for Request *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Embassy Visa Application, College Transfer, Scholarship"
                  value={reqForm.purpose}
                  onChange={(e) => setReqForm({ ...reqForm, purpose: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Additional Notes or Instructions (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Add any specific requirements (e.g. Addressed to: Admissions Committee, University of Addis Ababa)..."
                  value={reqForm.reason}
                  onChange={(e) => setReqForm({ ...reqForm, reason: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    border: '1px solid #CBD5E1',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Number of Copies
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={reqForm.copiesRequested}
                    onChange={(e) => setReqForm({ ...reqForm, copiesRequested: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                    Delivery Method
                  </label>
                  <select
                    value={reqForm.deliveryMethod}
                    onChange={(e) => setReqForm({ ...reqForm, deliveryMethod: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '14px',
                      background: '#fff'
                    }}
                  >
                    <option value="download">Online Certified Download (PDF)</option>
                    <option value="collect">Collect at Registrar Front Desk</option>
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '8px' }}>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  style={{
                    background: submittingRequest ? '#94A3B8' : '#1F3A5F',
                    color: '#fff',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: submittingRequest ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>{submittingRequest ? 'Submitting...' : 'Submit Official Request'}</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 5: MY REQUESTS */}
      {/* ============================================================== */}
      {activeTab === 'my-requests' && (
        <div>
          {requests.length === 0 ? (
            <StudentEmptyState
              title="No Document Requests Found"
              description="You have not submitted any document requests yet. Click 'Request a Document' to request official transcripts, verification letters, or certificate duplicates."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {requests.map((req: any) => {
                const canCancel = req.status === 'submitted';
                const isReady = req.status === 'ready';
                const isCancelling = cancellingRequestId === req.id;

                const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
                  submitted: { bg: '#FEF3C7', color: '#B45309', label: 'Submitted & Queued' },
                  in_review: { bg: '#E0F2FE', color: '#0369A1', label: 'In Review by Registrar' },
                  approved: { bg: '#DCFCE7', color: '#15803D', label: 'Approved & Processing' },
                  ready: { bg: '#16A34A', color: '#fff', label: 'Ready for Fulfillment' },
                  rejected: { bg: '#FEE2E2', color: '#B91C1C', label: 'Declined' },
                  cancelled: { bg: '#F1F5F9', color: '#64748B', label: 'Cancelled by Student' }
                };

                const currentStyle = statusStyles[req.status] || { bg: '#F1F5F9', color: '#64748B', label: req.status };

                return (
                  <div
                    key={req.id}
                    style={{
                      background: '#fff',
                      border: '1px solid #E2E8F0',
                      borderRadius: '10px',
                      padding: '20px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <code style={{ fontSize: '13px', fontWeight: 800, color: '#1F3A5F', background: '#F1F5F9', padding: '4px 8px', borderRadius: '4px' }}>
                          #{req.request_no}
                        </code>
                        <span style={{ fontSize: '12px', fontWeight: 800, background: currentStyle.bg, color: currentStyle.color, padding: '4px 10px', borderRadius: '12px' }}>
                          {currentStyle.label}
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: '#64748B' }}>
                        Submitted {new Date(req.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px', fontSize: '13px' }}>
                      <div>
                        <span style={{ color: '#64748B' }}>Document Type: </span>
                        <strong style={{ color: '#1F3A5F', textTransform: 'capitalize' }}>{req.request_type.replace(/_/g, ' ')}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>Purpose: </span>
                        <strong style={{ color: '#1F3A5F' }}>{req.purpose}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>Copies: </span>
                        <strong style={{ color: '#1F3A5F' }}>{req.copies_requested} copy ({req.delivery_method})</strong>
                      </div>
                    </div>

                    {req.reason && (
                      <div style={{ fontSize: '12px', color: '#475569', background: '#F8FAFC', padding: '10px 12px', borderRadius: '6px', marginBottom: '14px' }}>
                        <strong>Student Note:</strong> {req.reason}
                      </div>
                    )}

                    {req.decision_note && (
                      <div style={{
                        fontSize: '12px',
                        color: req.status === 'rejected' ? '#B91C1C' : '#0369A1',
                        background: req.status === 'rejected' ? '#FEF2F2' : '#F0F9FF',
                        border: req.status === 'rejected' ? '1px solid #FECACA' : '1px solid #BAE6FD',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        marginBottom: '14px'
                      }}>
                        <strong>Registrar Note:</strong> {req.decision_note}
                      </div>
                    )}

                    {/* Action Bar */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
                      {canCancel && (
                        <button
                          type="button"
                          disabled={isCancelling}
                          onClick={() => handleCancelRequest(req.id, req.request_no)}
                          style={{
                            background: '#fff',
                            color: '#DC2626',
                            border: '1px solid #FCA5A5',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: isCancelling ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {isCancelling ? 'Cancelling...' : 'Cancel Request'}
                        </button>
                      )}

                      {isReady && req.document_id && (
                        <button
                          type="button"
                          onClick={() => handleDownloadDocument(req.document_id, req.document_name || 'document.pdf', 'Fitted Document')}
                          style={{
                            background: '#16A34A',
                            color: '#fff',
                            border: 'none',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer'
                          }}
                        >
                          📥 Download Document
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
