import { useState, useMemo } from 'react';

export interface LinkedChild {
  student_id: number;
  admission_no: string;
  first_name: string;
  father_name: string;
  grandfather_name?: string;
  gender?: string;
  date_of_birth?: string;
  student_status: string;
  relationship: string;
  is_primary: boolean | number;
  can_view_results: boolean | number;
  can_view_attendance: boolean | number;
  can_view_fees: boolean | number;
  can_message_staff: boolean | number;
  link_status: 'active' | 'pending' | 'suspended' | 'ended';
  verified_at?: string;
  enrollment_id?: number;
  enrollment_status?: string;
  roll_no?: number;
  section_id?: number;
  section_name?: string;
  stream?: string;
  grade_id?: number;
  grade_level?: number;
  grade_name?: string;
  academic_year_id?: number;
  academic_year_name?: string;
}

interface MyChildrenDirectoryProps {
  childrenList: LinkedChild[];
  selectedStudentId: number | null;
  onSelectChild: (studentId: number) => void;
  onOpenChildWorkspace: (studentId: number) => void;
  guardianVerificationStatus?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export default function MyChildrenDirectory({
  childrenList,
  selectedStudentId,
  onSelectChild,
  onOpenChildWorkspace,
  guardianVerificationStatus = 'verified',
  loading = false,
  error = null,
  onRetry
}: MyChildrenDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [relationshipTab, setRelationshipTab] = useState<'all' | 'verified' | 'pending'>('all');

  // Compute available grades for the filter dropdown
  const uniqueGrades = useMemo(() => {
    const grades = new Set<string>();
    childrenList.forEach((c) => {
      if (c.grade_name) grades.add(c.grade_name);
      else if (c.grade_level) grades.add(`Grade ${c.grade_level}`);
    });
    return Array.from(grades).sort();
  }, [childrenList]);

  // Determine if a child's link is verified
  const isVerifiedLink = (child: LinkedChild) => {
    return guardianVerificationStatus === 'verified' && child.link_status === 'active';
  };

  // Filtered children
  const filteredChildren = useMemo(() => {
    return childrenList.filter((child) => {
      // 1. Text Search (first name, father name, admission number)
      const fullName = `${child.first_name} ${child.father_name} ${child.grandfather_name || ''}`.toLowerCase();
      const adm = (child.admission_no || '').toLowerCase();
      const q = searchQuery.trim().toLowerCase();
      if (q && !fullName.includes(q) && !adm.includes(q)) {
        return false;
      }

      // 2. Grade Filter
      if (selectedGrade !== 'all') {
        const gradeStr = child.grade_name || `Grade ${child.grade_level}`;
        if (gradeStr !== selectedGrade) return false;
      }

      // 3. Status Filter
      if (selectedStatus !== 'all') {
        const status = (child.enrollment_status || child.student_status || '').toLowerCase();
        if (status !== selectedStatus) return false;
      }

      // 4. Verification Tab Filter
      if (relationshipTab === 'verified' && !isVerifiedLink(child)) {
        return false;
      }
      if (relationshipTab === 'pending' && isVerifiedLink(child)) {
        return false;
      }

      return true;
    });
  }, [childrenList, searchQuery, selectedGrade, selectedStatus, relationshipTab, guardianVerificationStatus]);

  const verifiedCount = childrenList.filter(isVerifiedLink).length;
  const pendingCount = childrenList.length - verifiedCount;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', gap: '16px' }}>
        <div className="sh-spinner" style={{ width: '40px', height: '40px', border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: '14px', color: '#64748B', fontWeight: 600 }}>Loading verified student directory from school database...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '32px', maxWidth: '540px', margin: '30px auto', background: '#FFFFFF', borderRadius: '12px', border: '1px solid #FCA5A5', textAlign: 'center' }}>
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>⚠️</div>
        <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#991B1B', margin: '0 0 6px 0' }}>Unable to retrieve student records</h3>
        <p style={{ color: '#64748B', fontSize: '13px', marginBottom: '16px' }}>{error}</p>
        {onRetry && (
          <button type="button" className="sh-btn sh-btn-primary" onClick={onRetry} style={{ background: '#2563EB', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
            Retry Loading
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="my-children-directory">
      {/* Page Header */}
      <div className="sh-page-header" style={{ marginBottom: '20px' }}>
        <div>
          <h2 className="sh-page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>👨‍👧‍👦</span>
            <span>My Children &amp; Linked Wards</span>
          </h2>
          <p className="sh-page-desc">
            Authorized student profiles registered with your guardian account. Select a verified child to open their academic records and timetable.
          </p>
        </div>
      </div>

      {/* Notice Banner if Guardian Profile is Pending Verification */}
      {guardianVerificationStatus !== 'verified' && (
        <div style={{
          background: '#FEF3C7',
          border: '1px solid #FCD34D',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <span style={{ fontSize: '20px' }}>⏳</span>
          <div>
            <strong style={{ color: '#92400E', fontSize: '14px', display: 'block' }}>
              Guardian Identity Verification In Progress
            </strong>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#B45309', lineHeight: 1.4 }}>
              Your guardian account credentials are currently being reviewed by the school registrar office. Protected student records (marks, report cards, attendance) will be unlocked once your verification is completed.
            </p>
          </div>
        </div>
      )}

      {/* Tabs: All / Verified / Pending */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', background: '#F1F5F9', padding: '4px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
          <button
            type="button"
            onClick={() => setRelationshipTab('all')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: relationshipTab === 'all' ? '#FFFFFF' : 'transparent',
              color: relationshipTab === 'all' ? '#1F3A5F' : '#64748B',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: relationshipTab === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            All Wards ({childrenList.length})
          </button>
          <button
            type="button"
            onClick={() => setRelationshipTab('verified')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: relationshipTab === 'verified' ? '#FFFFFF' : 'transparent',
              color: relationshipTab === 'verified' ? '#059669' : '#64748B',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              boxShadow: relationshipTab === 'verified' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            ✓ Verified ({verifiedCount})
          </button>
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => setRelationshipTab('pending')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: relationshipTab === 'pending' ? '#FFFFFF' : 'transparent',
                color: relationshipTab === 'pending' ? '#D97706' : '#64748B',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow: relationshipTab === 'pending' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              ⏳ Pending ({pendingCount})
            </button>
          )}
        </div>

        {/* Search & Filter Controls */}
        <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '280px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search student name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              minWidth: '200px',
              background: '#FFFFFF'
            }}
          />

          {uniqueGrades.length > 1 && (
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '13px',
                background: '#FFFFFF',
                color: '#334155'
              }}
            >
              <option value="all">All Grades</option>
              {uniqueGrades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '13px',
              background: '#FFFFFF',
              color: '#334155'
            }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Enrollment</option>
            <option value="completed">Completed / Graduated</option>
            <option value="transferred">Transferred</option>
          </select>
        </div>
      </div>

      {/* Children Grid */}
      {filteredChildren.length === 0 ? (
        <div style={{
          background: '#FFFFFF',
          border: '1px dashed #CBD5E1',
          borderRadius: '12px',
          padding: '48px 24px',
          textAlign: 'center',
          marginTop: '16px'
        }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#334155', margin: '0 0 6px' }}>
            No matching student records found
          </h3>
          <p style={{ color: '#64748B', fontSize: '13px', margin: 0, maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
            {childrenList.length === 0
              ? 'No children are currently linked to this guardian account in the school database. Please contact the registrar office if you believe this is an error.'
              : 'Try clearing your search query or adjusting your grade/status filters above.'}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '20px'
        }}>
          {filteredChildren.map((child) => {
            const isSelected = child.student_id === selectedStudentId;
            const isVerified = isVerifiedLink(child);

            return (
              <div
                key={child.student_id}
                style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                  boxShadow: isSelected
                    ? '0 6px 18px rgba(37, 99, 235, 0.14)'
                    : '0 1px 4px rgba(0, 0, 0, 0.04)',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  position: 'relative',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Active Indicator Ribbon Tag */}
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '16px',
                    background: '#2563EB',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 10px',
                    borderRadius: '10px',
                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
                  }}>
                    ACTIVE SELECTION
                  </div>
                )}

                {/* Card Header: Avatar & Names */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '12px',
                    background: isVerified ? '#1F3A5F' : '#64748B',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                    {child.first_name ? child.first_name.charAt(0).toUpperCase() : 'S'}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                      margin: 0,
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#0F172A',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {child.first_name} {child.father_name}
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
                      ID: <strong style={{ color: '#1E293B' }}>{child.admission_no}</strong>
                      {child.gender && ` • ${child.gender.charAt(0).toUpperCase() + child.gender.slice(1)}`}
                    </div>
                  </div>
                </div>

                {/* Status Badges Row */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {isVerified ? (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '12px',
                      background: '#ECFDF5',
                      color: '#065F46',
                      border: '1px solid #A7F3D0'
                    }}>
                      ✓ Verified Link
                    </span>
                  ) : (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '12px',
                      background: '#FEF3C7',
                      color: '#92400E',
                      border: '1px solid #FDE68A'
                    }}>
                      ⏳ Pending Verification
                    </span>
                  )}

                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: '12px',
                    background: child.enrollment_status === 'active' || child.student_status === 'active' ? '#EFF6FF' : '#F1F5F9',
                    color: child.enrollment_status === 'active' || child.student_status === 'active' ? '#1E40AF' : '#475569',
                    border: '1px solid #DBEAFE'
                  }}>
                    Status: {child.enrollment_status || child.student_status || 'Enrolled'}
                  </span>

                  {child.is_primary ? (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '12px',
                      background: '#FAF5FF',
                      color: '#6B21A8',
                      border: '1px solid #E9D5FF'
                    }}>
                      Primary Contact
                    </span>
                  ) : null}
                </div>

                {/* Details Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px 12px',
                  background: '#F8FAFC',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  border: '1px solid #E2E8F0'
                }}>
                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Grade</span>
                    <strong style={{ color: '#1E293B' }}>{child.grade_name || `Grade ${child.grade_level || '—'}`}</strong>
                  </div>

                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Section</span>
                    <strong style={{ color: '#1E293B' }}>{child.section_name || 'Placement Pending'}</strong>
                  </div>

                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Academic Year</span>
                    <strong style={{ color: '#1E293B' }}>{child.academic_year_name || '2026/27 (2019 E.C.)'}</strong>
                  </div>

                  <div>
                    <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Relationship</span>
                    <strong style={{ color: '#1E293B', textTransform: 'capitalize' }}>{child.relationship || 'Ward'}</strong>
                  </div>

                  {child.stream && child.stream !== 'none' && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: '#64748B', display: 'block', fontSize: '11px' }}>Stream</span>
                      <strong style={{ color: '#2563EB', textTransform: 'capitalize' }}>
                        {child.stream.replace(/_/g, ' ')}
                      </strong>
                    </div>
                  )}
                </div>

                {/* Permissions Indicators */}
                <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#64748B', flexWrap: 'wrap' }}>
                  <span title="Results view permission" style={{ opacity: child.can_view_results ? 1 : 0.4 }}>
                    📈 Results {child.can_view_results ? '✓' : '✗'}
                  </span>
                  <span>•</span>
                  <span title="Attendance view permission" style={{ opacity: child.can_view_attendance ? 1 : 0.4 }}>
                    📋 Attendance {child.can_view_attendance ? '✓' : '✗'}
                  </span>
                  <span>•</span>
                  <span title="Fees view permission" style={{ opacity: child.can_view_fees ? 1 : 0.4 }}>
                    💳 Fees {child.can_view_fees ? '✓' : '✗'}
                  </span>
                </div>

                {/* Actions Row */}
                <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', paddingTop: '4px' }}>
                  {isVerified ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelectChild(child.student_id)}
                        style={{
                          flex: 1,
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: '1px solid #CBD5E1',
                          background: isSelected ? '#EFF6FF' : '#FFFFFF',
                          color: isSelected ? '#2563EB' : '#334155',
                          fontWeight: 600,
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {isSelected ? '✓ Selected Child' : 'Select Child'}
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenChildWorkspace(child.student_id)}
                        style={{
                          flex: 1.2,
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#1F3A5F',
                          color: '#FFFFFF',
                          fontWeight: 600,
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: '0 2px 6px rgba(31, 58, 95, 0.25)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>Open Workspace</span>
                        <span>➔</span>
                      </button>
                    </>
                  ) : (
                    <div style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '8px',
                      background: '#F1F5F9',
                      color: '#64748B',
                      fontSize: '12px',
                      fontWeight: 600,
                      textAlign: 'center',
                      border: '1px solid #E2E8F0'
                    }}>
                      🔒 Protected Records Pending Verification
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

