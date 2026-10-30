import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { StudentTabs, type TabItem, StudentSpinner, StudentEmptyState, StudentErrorState } from './StudentCommon';

interface AddisTime {
  dayOfWeek: number;
  dayName: string;
  timeStr: string;
  dateStr: string;
  isoString: string;
}

interface TimetableSlot {
  id: number;
  time_slot_id: number;
  day_of_week: number;
  slot_label: string;
  start_time: string;
  end_time: string;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  subject_name_am?: string;
  room_id?: number;
  room_name: string;
  building: string;
  teacher_id: number;
  teacher_name: string;
  teacher_email?: string;
  is_current_period: boolean;
  status: 'active' | 'completed' | 'upcoming' | 'scheduled';
}

interface DaySchedule {
  day_number: number;
  day_name: string;
  is_today: boolean;
  periods: TimetableSlot[];
}

export const StudentTimetable: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'weekly' | 'daily' | 'calendar' | 'exams'>('weekly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timetable State
  const [sectionName, setSectionName] = useState<string>('');
  const [gradeName, setGradeName] = useState<string>('');
  const [academicYear, setAcademicYear] = useState<string>('');
  const [addisTime, setAddisTime] = useState<AddisTime | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<TimetableSlot | null>(null);
  const [weeklyDays, setWeeklyDays] = useState<DaySchedule[]>([]);

  // Daily View State
  const [selectedDayNum, setSelectedDayNum] = useState<number>(1);
  const [dailyPeriods, setDailyPeriods] = useState<TimetableSlot[]>([]);

  // Calendar State
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [academicTerms, setAcademicTerms] = useState<any[]>([]);
  const [selectedEventType, setSelectedEventType] = useState<string>('all');

  // Exam Schedule State
  const [exams, setExams] = useState<any[]>([]);
  const [examSummary, setExamSummary] = useState<{ total: number; upcoming: number; completed: number }>({
    total: 0,
    upcoming: 0,
    completed: 0
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [weeklyRes, calendarRes, examsRes] = await Promise.all([
        api.getStudentWeeklyTimetable(),
        api.getStudentCalendar(),
        api.getStudentExams()
      ]);

      if (weeklyRes) {
        setSectionName(weeklyRes.section_name);
        setGradeName(weeklyRes.grade_name);
        setAcademicYear(weeklyRes.academic_year);
        setAddisTime(weeklyRes.addis_time);
        setCurrentPeriod(weeklyRes.current_period);
        setWeeklyDays(weeklyRes.days || []);

        // Default daily selection to current weekday if Mon-Fri, else Mon (1)
        const currentDay = weeklyRes.addis_time?.dayOfWeek;
        const validDay = currentDay && currentDay >= 1 && currentDay <= 5 ? currentDay : 1;
        setSelectedDayNum(validDay);
        const daySchedule = (weeklyRes.days || []).find((d: any) => d.day_number === validDay);
        setDailyPeriods(daySchedule ? daySchedule.periods : []);
      }

      if (calendarRes) {
        setCalendarEvents(calendarRes.events || []);
        setAcademicTerms(calendarRes.terms || []);
      }

      if (examsRes) {
        setExams(examsRes.exams || []);
        setExamSummary(examsRes.summary || { total: 0, upcoming: 0, completed: 0 });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load timetable and calendar data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update daily periods when day selection changes
  const handleSelectDay = (dayNum: number) => {
    setSelectedDayNum(dayNum);
    const daySchedule = weeklyDays.find((d) => d.day_number === dayNum);
    setDailyPeriods(daySchedule ? daySchedule.periods : []);
  };

  // Filter calendar events
  const filteredEvents = calendarEvents.filter((ev) => {
    if (selectedEventType === 'all') return true;
    return ev.event_type === selectedEventType;
  });

  const tabs: TabItem[] = [
    { key: 'weekly', label: 'Weekly Timetable', icon: '📅' },
    { key: 'daily', label: "Daily Schedule", icon: '⏱️', badge: currentPeriod ? 'Active Now' : undefined },
    { key: 'calendar', label: 'Academic Calendar', icon: '🗓️', badge: calendarEvents.length },
    { key: 'exams', label: 'Exam Schedule', icon: '📝', badge: examSummary.upcoming > 0 ? `${examSummary.upcoming} Upcoming` : undefined }
  ];

  if (loading) {
    return (
      <div className="student-page-container" style={{ padding: '24px' }}>
        <StudentSpinner message="Loading your class timetable, periods, and academic milestones..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="student-page-container" style={{ padding: '24px' }}>
        <StudentErrorState message={error} onRetry={loadData} />
      </div>
    );
  }

  return (
    <div className="student-page-container" style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #1F3A5F 100%)',
        color: '#FFFFFF',
        borderRadius: '16px',
        padding: '24px 28px',
        marginBottom: '24px',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.15)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '28px' }}>📅</span>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }}>
              Class Timetable & Calendar
            </h1>
          </div>
          <p style={{ margin: 0, color: '#94A3B8', fontSize: '14px', maxWidth: '560px', lineHeight: 1.5 }}>
            Real-time weekly schedule, active period tracker for Section {sectionName || 'Enrolled Class'}, Ethiopian academic calendar, and exam timetables.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {/* Addis Time Badge */}
          {addisTime && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '10px 16px',
              backdropFilter: 'blur(8px)',
              textAlign: 'right'
            }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#38BDF8', fontWeight: 700 }}>
                Addis Ababa (UTC+3)
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#F8FAFC' }}>
                {addisTime.dayName}, {addisTime.timeStr.substring(0, 5)}
              </div>
            </div>
          )}

          {/* Section Info Badge */}
          <div style={{
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '12px',
            padding: '10px 16px',
            textAlign: 'right'
          }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#BAE6FD', fontWeight: 600 }}>
              {academicYear || 'Academic Year'}
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>
              {gradeName ? `${gradeName} • ` : ''}{sectionName}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <StudentTabs tabs={tabs} activeKey={activeTab} onChange={(k) => setActiveTab(k as any)} ariaLabel="Timetable views" />

      {/* TAB 3.1: WEEKLY TIMETABLE */}
      {activeTab === 'weekly' && (
        <div>
          {/* Active Period Spotlight Bar if in session */}
          {currentPeriod && (
            <div style={{
              background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.08) 100%)',
              border: '1.5px solid #10B981',
              borderRadius: '12px',
              padding: '14px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#10B981',
                  boxShadow: '0 0 10px #10B981'
                }} />
                <div>
                  <span style={{ fontWeight: 800, color: '#065F46', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Class In Session Right Now:
                  </span>
                  <span style={{ marginLeft: '8px', fontWeight: 700, color: '#047857', fontSize: '15px' }}>
                    {currentPeriod.subject_name} ({currentPeriod.subject_code})
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '13px', color: '#065F46', fontWeight: 600 }}>
                📍 {currentPeriod.room_name} ({currentPeriod.building}) • 🕒 {currentPeriod.start_time.substring(0, 5)} - {currentPeriod.end_time.substring(0, 5)} • 👨‍🏫 {currentPeriod.teacher_name}
              </div>
            </div>
          )}

          {/* 5-Day Weekly Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            alignItems: 'start'
          }}>
            {weeklyDays.map((day) => (
              <div
                key={day.day_number}
                style={{
                  background: day.is_today ? '#F0FDF4' : '#FFFFFF',
                  borderRadius: '14px',
                  border: day.is_today ? '2px solid #10B981' : '1px solid #E2E8F0',
                  boxShadow: day.is_today ? '0 4px 16px rgba(16, 185, 129, 0.12)' : '0 2px 6px rgba(0,0,0,0.03)',
                  overflow: 'hidden'
                }}
              >
                {/* Day Header */}
                <div style={{
                  padding: '14px 16px',
                  background: day.is_today ? '#10B981' : '#F8FAFC',
                  color: day.is_today ? '#FFFFFF' : '#1E293B',
                  borderBottom: '1px solid',
                  borderColor: day.is_today ? '#059669' : '#E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontWeight: 800, fontSize: '15px' }}>{day.day_name}</span>
                  {day.is_today && (
                    <span style={{
                      background: '#FFFFFF',
                      color: '#065F46',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      textTransform: 'uppercase'
                    }}>
                      Today
                    </span>
                  )}
                </div>

                {/* Day Period Cards */}
                <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {day.periods.length === 0 ? (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
                      No classes scheduled
                    </div>
                  ) : (
                    day.periods.map((slot) => {
                      const isActive = slot.is_current_period;
                      return (
                        <div
                          key={slot.id}
                          style={{
                            background: isActive ? '#ECFDF5' : '#FFFFFF',
                            border: isActive ? '1.5px solid #10B981' : '1px solid #E2E8F0',
                            borderRadius: '10px',
                            padding: '12px',
                            position: 'relative',
                            transition: 'all 0.2s ease',
                            boxShadow: isActive ? '0 4px 12px rgba(16, 185, 129, 0.15)' : 'none'
                          }}
                        >
                          {/* Period Label & Time */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: isActive ? '#059669' : '#64748B',
                              textTransform: 'uppercase'
                            }}>
                              {slot.slot_label.split(' ').slice(1).join(' ') || 'Period'}
                            </span>
                            <span style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: isActive ? '#065F46' : '#475569'
                            }}>
                              {slot.start_time.substring(0, 5)} - {slot.end_time.substring(0, 5)}
                            </span>
                          </div>

                          {/* Subject Code & Name */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                            <span style={{
                              background: isActive ? '#10B981' : '#1F3A5F',
                              color: '#FFFFFF',
                              fontSize: '11px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              {slot.subject_code}
                            </span>
                            <span style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              color: '#0F172A',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {slot.subject_name}
                            </span>
                          </div>

                          {/* Room & Teacher */}
                          <div style={{ fontSize: '12px', color: '#64748B', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div>📍 {slot.room_name} ({slot.building})</div>
                            <div style={{ color: '#475569', fontWeight: 500 }}>👨‍🏫 {slot.teacher_name}</div>
                          </div>

                          {isActive && (
                            <div style={{
                              marginTop: '8px',
                              background: '#10B981',
                              color: '#FFFFFF',
                              fontSize: '10px',
                              fontWeight: 800,
                              textAlign: 'center',
                              padding: '2px 0',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>
                              Active Now
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3.2: DAILY SCHEDULE VIEW */}
      {activeTab === 'daily' && (
        <div>
          {/* Day Selector Pills */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '20px',
            overflowX: 'auto',
            paddingBottom: '4px'
          }}>
            {weeklyDays.map((d) => {
              const isSelected = d.day_number === selectedDayNum;
              return (
                <button
                  key={d.day_number}
                  type="button"
                  onClick={() => handleSelectDay(d.day_number)}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    border: isSelected ? '2px solid #1F3A5F' : '1px solid #CBD5E1',
                    background: isSelected ? '#1F3A5F' : '#FFFFFF',
                    color: isSelected ? '#FFFFFF' : '#334155',
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 4px 12px rgba(31, 58, 95, 0.2)' : 'none'
                  }}
                >
                  <span>{d.day_name}</span>
                  {d.is_today && (
                    <span style={{
                      background: isSelected ? '#38BDF8' : '#10B981',
                      color: '#FFFFFF',
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '999px'
                    }}>
                      Today
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Periods Timeline List */}
          {dailyPeriods.length === 0 ? (
            <StudentEmptyState
              icon="☕"
              title="No Classes Scheduled"
              description={`There are no class periods scheduled for ${weeklyDays.find(d => d.day_number === selectedDayNum)?.day_name}.`}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {dailyPeriods.map((slot, index) => {
                const isActive = slot.status === 'active';
                const isCompleted = slot.status === 'completed';
                const isUpcoming = slot.status === 'upcoming';

                let statusBadgeBg = '#F1F5F9';
                let statusBadgeColor = '#475569';
                let statusLabel = 'Scheduled';

                if (isActive) {
                  statusBadgeBg = '#DCFCE7';
                  statusBadgeColor = '#15803D';
                  statusLabel = 'In Session';
                } else if (isCompleted) {
                  statusBadgeBg = '#F3F4F6';
                  statusBadgeColor = '#6B7280';
                  statusLabel = 'Completed';
                } else if (isUpcoming) {
                  statusBadgeBg = '#E0F2FE';
                  statusBadgeColor = '#0369A1';
                  statusLabel = 'Upcoming';
                }

                return (
                  <div
                    key={slot.id}
                    style={{
                      background: isActive ? '#F0FDF4' : '#FFFFFF',
                      border: isActive ? '2px solid #10B981' : '1px solid #E2E8F0',
                      borderRadius: '14px',
                      padding: '20px 24px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      boxShadow: isActive ? '0 6px 20px rgba(16, 185, 129, 0.15)' : '0 2px 6px rgba(0,0,0,0.02)'
                    }}
                  >
                    {/* Period Order & Timing */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '12px',
                        background: isActive ? '#10B981' : '#1F3A5F',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '16px'
                      }}>
                        {index + 1}
                      </div>

                      <div>
                        <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>
                          {slot.slot_label}
                        </div>
                        <div style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
                          {slot.start_time.substring(0, 5)} - {slot.end_time.substring(0, 5)}
                        </div>
                      </div>
                    </div>

                    {/* Subject & Teacher Info */}
                    <div style={{ flex: '1 1 240px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{
                          background: '#E2E8F0',
                          color: '#1E293B',
                          fontSize: '12px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}>
                          {slot.subject_code}
                        </span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                          {slot.subject_name}
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748B' }}>
                        Teacher: <strong style={{ color: '#334155' }}>{slot.teacher_name}</strong>
                      </div>
                    </div>

                    {/* Location & Status */}
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>
                        📍 {slot.room_name} ({slot.building})
                      </div>
                      <span style={{
                        background: statusBadgeBg,
                        color: statusBadgeColor,
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px'
                      }}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3.3: ACADEMIC CALENDAR */}
      {activeTab === 'calendar' && (
        <div>
          {/* Semester Milestones */}
          {academicTerms.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 700, color: '#1E293B' }}>
                Academic Terms & Semester Boundaries
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                {academicTerms.map((term: any) => (
                  <div
                    key={term.id}
                    style={{
                      background: term.is_current ? '#F0FDF4' : '#FFFFFF',
                      border: term.is_current ? '2px solid #10B981' : '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '18px 20px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>{term.name}</span>
                      {term.is_current ? (
                        <span style={{ background: '#10B981', color: '#FFF', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '999px' }}>
                          Active Semester
                        </span>
                      ) : (
                        <span style={{ background: '#F1F5F9', color: '#64748B', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px' }}>
                          Planned
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                      <div>📅 <strong>Start:</strong> {new Date(term.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      <div>🏁 <strong>End:</strong> {new Date(term.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event Filter Pills */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: 'All Calendar Events' },
              { key: 'holiday', label: 'Ethiopian National Holidays' },
              { key: 'exam', label: 'Exam Periods' },
              { key: 'event', label: 'School Events' }
            ].map((f) => {
              const isSelected = selectedEventType === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setSelectedEventType(f.key)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #1F3A5F' : '1px solid #E2E8F0',
                    background: isSelected ? '#1F3A5F' : '#FFFFFF',
                    color: isSelected ? '#FFFFFF' : '#475569',
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: '13px',
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Events List */}
          {filteredEvents.length === 0 ? (
            <StudentEmptyState
              icon="🗓️"
              title="No Events Found"
              description="There are no calendar events matching this filter category."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredEvents.map((ev: any) => {
                let badgeBg = '#E0F2FE';
                let badgeColor = '#0369A1';
                let icon = '📌';

                if (ev.event_type === 'holiday') {
                  badgeBg = '#FEF3C7';
                  badgeColor = '#B45309';
                  icon = '🎉';
                } else if (ev.event_type === 'exam') {
                  badgeBg = '#FEE2E2';
                  badgeColor = '#B91C1C';
                  icon = '📝';
                }

                const startDate = new Date(ev.start_date);
                const endDate = new Date(ev.end_date);
                const isSingleDay = ev.start_date === ev.end_date;

                return (
                  <div
                    key={ev.id}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {/* Date Badge */}
                      <div style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '12px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                          {startDate.toLocaleDateString('en-US', { month: 'short' })}
                        </span>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                          {startDate.getDate()}
                        </span>
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '16px' }}>{icon}</span>
                          <span style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>
                            {ev.title}
                          </span>
                        </div>
                        {ev.description && (
                          <p style={{ margin: 0, fontSize: '13px', color: '#64748B', lineHeight: 1.4 }}>
                            {ev.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        background: badgeBg,
                        color: badgeColor,
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700,
                        textTransform: 'uppercase'
                      }}>
                        {ev.event_type}
                      </span>
                      <div style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
                        {isSingleDay
                          ? startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                          : `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3.4: EXAM SCHEDULE */}
      {activeTab === 'exams' && (
        <div>
          {/* Exam Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: '#FFFFFF', padding: '18px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Total Scheduled Exams</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{examSummary.total}</div>
            </div>
            <div style={{ background: '#F0FDF4', padding: '18px', borderRadius: '12px', border: '1px solid #BBF7D0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '13px', color: '#166534', fontWeight: 600 }}>Upcoming Examinations</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#15803D', marginTop: '4px' }}>{examSummary.upcoming}</div>
            </div>
            <div style={{ background: '#F8FAFC', padding: '18px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Completed Assessments</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#475569', marginTop: '4px' }}>{examSummary.completed}</div>
            </div>
          </div>

          {/* Exam Items */}
          {exams.length === 0 ? (
            <StudentEmptyState
              icon="📝"
              title="No Exams Scheduled"
              description="No formal examinations have been published for your section yet."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {exams.map((ex: any) => {
                const isUpcoming = ex.status === 'upcoming';
                const examDate = ex.assessment_date ? new Date(ex.assessment_date) : null;

                return (
                  <div
                    key={ex.id}
                    style={{
                      background: isUpcoming ? '#FFFFFF' : '#F8FAFC',
                      border: isUpcoming ? '1.5px solid #CBD5E1' : '1px solid #E2E8F0',
                      borderRadius: '14px',
                      padding: '20px 24px',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      boxShadow: isUpcoming ? '0 4px 12px rgba(0,0,0,0.03)' : 'none'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                          background: isUpcoming ? '#1F3A5F' : '#64748B',
                          color: '#FFFFFF',
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          {ex.subject_code}
                        </span>
                        <span style={{ fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
                          {ex.title}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', color: '#64748B', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                        <span>Subject: <strong style={{ color: '#334155' }}>{ex.subject_name}</strong></span>
                        <span>Examiner: <strong style={{ color: '#334155' }}>{ex.teacher_name}</strong></span>
                        <span>Term: <strong style={{ color: '#334155' }}>{ex.term_name || 'Semester 1'}</strong></span>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <span style={{
                        background: isUpcoming ? '#DCFCE7' : '#F1F5F9',
                        color: isUpcoming ? '#15803D' : '#64748B',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 800,
                        textTransform: 'uppercase'
                      }}>
                        {isUpcoming ? 'Upcoming' : 'Completed'}
                      </span>

                      <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>
                        {examDate ? examDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Date TBD'}
                      </div>

                      <div style={{ fontSize: '12px', color: '#64748B' }}>
                        Max Mark: <strong style={{ color: '#1F3A5F' }}>{ex.max_score} pts</strong> • Weight: <strong>{ex.weight}%</strong>
                      </div>
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
