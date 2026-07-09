import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, BarChart3, CheckCircle2, XCircle, Target,
  ClipboardList, CalendarPlus, Clock, MapPin, Users2, ChevronRight, PlayCircle, MessageSquare, BookOpen, Route, GraduationCap, ScrollText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isFeatureEnabled } from '../../config/features';
import { useMyClassSchedules } from '../../hooks/useSchedules';
import { useMyAttendanceStats, useAttendanceByUser } from '../../hooks/useAttendance';
import { useEvaluations } from '../../features/evaluations/useEvaluations';
import { useNextClass } from '../../hooks/useNextClass';
import { useLearningCohorts, useLearningEnrollments } from '../../hooks/useLearning';
import NextActionsFeed from './NextActionsFeed';
import ProgramEnrollmentCard from '../learner/ProgramEnrollmentCard';
import { Spinner } from '../../components/Spinner';
import { KPICard } from '../../components/KPICard';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { DataTable } from '../../components/DataTable';
import { NextClassCard } from '../../components/NextClassCard';
import { Button } from '@/components/ui/button';

// ──────────────────────────────────────────────────────────
// Participant Dashboard — Phase 3 Screen 6 (Home Participant)
//
// Canonical 4-band layout per design §D:
//   1. Header — "Good morning/afternoon/evening, {firstName}" + team line
//   2. NextClassCard — prominent next session + countdown + Add to calendar
//   3. KPI strip ×3 — Attendance rate · Sessions attended · Absent
//   4. Upcoming sessions list (next 5 own only) + Leader-only "+ Book a slot"
//
// Secondary bands kept below: Attendance history table · Evaluation scores.
// Participant-only data — no teammate comparison (Q6A privacy).
// ──────────────────────────────────────────────────────────

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstName(name) {
  if (!name) return '';
  // Employee names follow the local convention (given name is the last token),
  // so we pick the last token as the personal name for the greeting.
  const tokens = String(name).trim().split(/\s+/).filter(Boolean);
  return tokens.length ? tokens[tokens.length - 1] : '';
}

function pad(n) { return String(n).padStart(2, '0'); }

export default function ParticipantDashboard() {
  const { user } = useAuth();

  const { data: schedData, isLoading: loadingSched } = useMyClassSchedules();
  const { data: stats,    isLoading: loadingStats }   = useMyAttendanceStats();
  const { data: rawHistory, isLoading: loadingHistory } = useAttendanceByUser(user._id);
  const { data: rawEvals = [], isLoading: loadingEvals } = useEvaluations();

  const { nextClass, upcoming } = useNextClass();

  // Cohesion P2 — "My programs" band: active cohort enrollments joined with
  // the open cohort catalog for program names (same join as /me/programs).
  const { data: enrollmentData } = useLearningEnrollments();
  const { data: cohortData } = useLearningCohorts();
  const programCards = useMemo(() => {
    const cohortById = new Map((cohortData?.data || []).map((c) => [String(c._id), c]));
    return (enrollmentData?.data || [])
      .filter((e) => e.status !== 'Dropped')
      .map((e) => ({ enrollment: e, cohort: cohortById.get(String(e.cohortId)) }))
      .slice(0, 2);
  }, [enrollmentData, cohortData]);

  const schedules = schedData?.data || [];
  const teamName  = schedData?.team || '';
  const leader    = schedData?.leader || null;

  // Leader CTA visibility: this participant is the team leader.
  const isLeader = !!leader && leader._id && String(leader._id) === String(user._id);

  // Class code shown in the team line is taken from the next/first session.
  const classCode = nextClass?.classId?.classCode || schedules[0]?.classId?.classCode || '';

  useEffect(() => { document.title = 'TMS — Home'; }, []);

  // ── Attendance history (kept as secondary band) ──────────
  const historyColumns = useMemo(() => [
    {
      key: null,
      header: 'Date',
      render: (record) => {
        const sched = record.scheduleId;
        const start = sched?.startTime ? new Date(sched.startTime) : null;
        const dateStr = start
          ? start.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
          : '—';
        return (
          <div className="flex items-center gap-2">
            {start && (
              <div className="w-9 h-9 rounded-md bg-primary/10 flex flex-col items-center justify-center shrink-0">
                <span className="text-[9px] font-bold text-primary leading-tight uppercase">
                  {start.toLocaleDateString('en', { month: 'short' })}
                </span>
                <span className="text-sm font-bold text-primary leading-tight tabular-nums">{start.getDate()}</span>
              </div>
            )}
            <span className="text-muted-foreground text-xs whitespace-nowrap">{dateStr}</span>
          </div>
        );
      },
    },
    {
      key: null,
      header: 'Time',
      className: 'hidden sm:table-cell',
      render: (record) => {
        const sched = record.scheduleId;
        const start = sched?.startTime ? new Date(sched.startTime) : null;
        const end   = sched?.endTime   ? new Date(sched.endTime)   : null;
        const timeStr = start && end
          ? `${pad(start.getHours())}:${pad(start.getMinutes())} – ${pad(end.getHours())}:${pad(end.getMinutes())}`
          : '—';
        return <span className="font-mono text-xs tabular-nums">{timeStr}</span>;
      },
    },
    {
      key: null,
      header: 'Class',
      render: (record) => (
        <span className="text-foreground font-medium">{record.scheduleId?.classId?.classCode || '—'}</span>
      ),
    },
    {
      key: null,
      header: 'Course',
      className: 'hidden sm:table-cell',
      render: (record) => (
        <span className="text-muted-foreground text-xs">{record.scheduleId?.classId?.courseName || '—'}</span>
      ),
    },
    {
      key: null,
      header: 'Status',
      headerCls: 'text-center',
      cellCls: 'text-center',
      render: (record) => <StatusBadge status={record.status} size="sm" />,
    },
    {
      key: null,
      header: 'Note',
      className: 'hidden lg:table-cell',
      render: (record) => (
        <span className="text-subtle-foreground text-xs">{record.remark || '—'}</span>
      ),
    },
  ], []);

  const history = useMemo(() => {
    const records = rawHistory?.data || rawHistory || [];
    return [...records].sort((a, b) => {
      const dateA = a.scheduleId?.startTime ? new Date(a.scheduleId.startTime) : new Date(0);
      const dateB = b.scheduleId?.startTime ? new Date(b.scheduleId.startTime) : new Date(0);
      return dateB - dateA;
    });
  }, [rawHistory]);

  const evaluations = useMemo(() => {
    const list = Array.isArray(rawEvals) ? rawEvals : rawEvals?.data ?? [];
    return [...list].sort((a, b) => new Date(b.updatedAt ?? b.createdAt) - new Date(a.updatedAt ?? a.createdAt));
  }, [rawEvals]);

  const loading = loadingSched || loadingStats || loadingHistory;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size={32} />
      </div>
    );
  }

  const rate = stats?.attendanceRate ?? 0;
  const rateTone = rate >= 80 ? 'success' : rate >= 60 ? 'warning' : 'danger';
  const absent   = stats?.absent ?? 0;

  // No team enrolled — show full-card empty state per §E rule 8.
  if (!teamName && schedules.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-h1 text-foreground">{greeting()}, {firstName(user.name) || user.name}</h1>
        </div>
        <EmptyState
          icon={Users2}
          title="You are not enrolled in any class yet"
          description="Contact your manager to be assigned to a group and class."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Band 1 · Header ──────────────────────────────── */}
      <header>
        <h1 className="text-h1 text-foreground">
          {greeting()}, {firstName(user.name) || user.name}
        </h1>
        <p className="text-body text-muted-foreground mt-1 truncate">
          {teamName && <span className="font-medium">{teamName}</span>}
          {classCode && <> · <span className="font-mono text-primary">{classCode}</span></>}
          {isLeader && <span className="text-warning"> · Team Leader</span>}
        </p>
      </header>

      {/* ── Band 2 · Next class card ────────────────────── */}
      {/* Empty-state copy is membership-aware (Cohesion P4): team members get
          the team-booking pointer; generic learners get their /me surfaces. */}
      {nextClass ? (
        <NextClassCard schedule={nextClass} teacher={null /* not yet wired through API */} />
      ) : teamName ? (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming sessions"
          description="Your team leader can book sessions from the English Class page."
          action={(
            <Link to="/english" className="text-sm text-primary font-medium hover:underline underline-offset-2">
              Go to English Class →
            </Link>
          )}
        />
      ) : (
        <EmptyState
          icon={CalendarDays}
          title="No upcoming sessions"
          description="Browse the catalog to enroll in a program, or check your enrolled sessions."
          action={(
            <span className="flex items-center justify-center gap-4">
              <Link to="/me/sessions" className="text-sm text-primary font-medium hover:underline underline-offset-2">
                My sessions →
              </Link>
              <Link to="/me/catalog" className="text-sm text-primary font-medium hover:underline underline-offset-2">
                Browse catalog →
              </Link>
            </span>
          )}
        />
      )}

      {/* ── Band 2b · Next actions feed (Cohesion P2) ────── */}
      {/* What's waiting on me: quizzes, feedback, waitlists — composed
          client-side over existing self-scoped queries. */}
      <NextActionsFeed />

      {/* ── Band 2c · My programs (Cohesion P2) ──────────── */}
      {programCards.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-overline text-muted-foreground">My programs</h2>
            <Link to="/me/programs" className="text-xs text-primary font-medium hover:underline underline-offset-2">
              View all →
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {programCards.map(({ enrollment, cohort }) => (
              <ProgramEnrollmentCard key={enrollment.id} enrollment={enrollment} cohort={cohort} />
            ))}
          </div>
        </section>
      )}

      {/* ── Band 3 · KPI strip ×3 (no emoji, Lucide-only) ── */}
      <div className="grid grid-cols-3 gap-3">
        <KPICard
          label="My attendance"
          value={`${rate}%`}
          sub={`${stats?.present ?? 0} / ${stats?.totalSessions ?? 0} sessions`}
          icon={BarChart3}
          tone={rateTone}
          href="/english"
        />
        <KPICard
          label="Sessions attended"
          value={stats?.present ?? 0}
          sub={stats?.late ? `${stats.late} late` : 'on time'}
          icon={CheckCircle2}
          tone="success"
        />
        <KPICard
          label="Absences"
          value={absent}
          sub={stats?.excused ? `${stats.excused} excused` : 'absent'}
          icon={XCircle}
          tone={absent > 0 ? 'danger' : 'neutral'}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Cohesion P1 — per-enrollment program hub (checklist + certificate) */}
        <Button asChild variant="outline" className="justify-between md:col-span-2">
          <Link to="/me/programs">
            <span className="inline-flex items-center gap-2">
              <GraduationCap className="size-4" aria-hidden="true" />
              My programs &amp; progress
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="justify-between">
          <Link to="/me/catalog">
            <span className="inline-flex items-center gap-2">
              <BookOpen className="size-4" aria-hidden="true" />
              Learning catalog
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </Button>
        {isFeatureEnabled('paths') && (
          <Button asChild variant="outline" className="justify-between">
            <Link to="/me/paths">
              <span className="inline-flex items-center gap-2">
                <Route className="size-4" aria-hidden="true" />
                Learning paths
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" className="justify-between">
          <Link to="/me/assessments">
            <span className="inline-flex items-center gap-2">
              <PlayCircle className="size-4" aria-hidden="true" />
              My assessments
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="justify-between">
          <Link to="/me/feedback">
            <span className="inline-flex items-center gap-2">
              <MessageSquare className="size-4" aria-hidden="true" />
              My feedback
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="justify-between md:col-span-2">
          <Link to="/me/sessions">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="size-4" aria-hidden="true" />
              My sessions &amp; waitlists
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="justify-between md:col-span-2">
          <Link to="/me/transcript">
            <span className="inline-flex items-center gap-2">
              <ScrollText className="size-4" aria-hidden="true" />
              Learning transcript
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {/* ── Band 4 · Upcoming sessions list ──────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-overline text-muted-foreground">
            Upcoming sessions · my schedule
          </h2>
          {isLeader && (
            <Button asChild size="sm" variant="outline">
              <Link to="/english?tab=book">
                <CalendarPlus className="size-3.5" aria-hidden="true" />
                Book
              </Link>
            </Button>
          )}
        </div>

        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No upcoming sessions"
            description={isLeader
              ? 'Click "Book" to schedule a session for your group.'
              : 'Your team leader can book sessions from the English Class page.'}
          />
        ) : (
          <ul className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
            {upcoming.map((s) => {
              const start = new Date(s.startTime);
              const weekday = start.toLocaleDateString('en', { weekday: 'short' });
              const cls = s.classId;
              return (
                <li key={s._id}>
                  <Link
                    to={cls?._id ? `/classes/${cls._id}` : '/english'}
                    className="grid grid-cols-[40px_1fr_auto_auto] items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors duration-(--dur-fast)"
                  >
                    <div className="text-center bg-muted rounded-md py-1">
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground leading-none">
                        {weekday}
                      </div>
                      <div className="text-sm font-semibold text-foreground tabular-nums leading-none mt-0.5">
                        {start.getDate()}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-foreground truncate">
                        <span className="font-medium">{cls?.classCode || '—'}</span>
                        {cls?.courseName && (
                          <span className="text-muted-foreground"> · {cls.courseName}</span>
                        )}
                      </div>
                      {(s.room || cls?.room) && (
                        <div className="text-xs text-subtle-foreground inline-flex items-center gap-1 mt-0.5">
                          <MapPin className="size-3" aria-hidden="true" />
                          {s.room || cls.room}
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground tabular-nums inline-flex items-center gap-1">
                      <Clock className="size-3" aria-hidden="true" />
                      {pad(start.getHours())}:{pad(start.getMinutes())}
                    </span>
                    <ChevronRight className="size-4 text-subtle-foreground" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Secondary · Attendance history (preserved) ──── */}
      <section className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
            <ClipboardList className="size-4 text-primary" strokeWidth={2} aria-hidden="true" />
            Attendance history
          </h2>
          <span className="text-xs text-subtle-foreground bg-muted px-2.5 py-0.5 rounded-md tabular-nums">
            {history.length} sessions
          </span>
        </div>
        <DataTable
          columns={historyColumns}
          data={history}
          rowKey="_id"
          emptyTitle="No attendance history yet"
          emptyMessage="Results appear after the PIC marks attendance."
        />
      </section>

      {/* ── Secondary · Evaluation scores (preserved) ───── */}
      <section className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
            <Target className="size-4 text-primary" strokeWidth={2} aria-hidden="true" />
            Evaluation scores
          </h2>
          <span className="text-xs text-subtle-foreground bg-muted px-2.5 py-0.5 rounded-md tabular-nums">
            {evaluations.length} classes
          </span>
        </div>

        {loadingEvals ? (
          <div className="flex justify-center py-10"><Spinner size={24} /></div>
        ) : evaluations.length === 0 ? (
          <EmptyState
            icon={Target}
            title="No evaluations yet"
            description="Scores appear after the PIC enters evaluations."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {evaluations.map((ev) => {
              const avg = ((ev.grammarScore || 0) + (ev.vocabularyScore || 0) + (ev.pronunciationScore || 0) + (ev.fluencyScore || 0)) / 4;
              const avgColor = avg >= 8 ? 'text-success' : avg >= 6 ? 'text-warning' : avg > 0 ? 'text-destructive' : 'text-muted-foreground';
              const ringColor = avg >= 8 ? '#22c55e' : avg >= 6 ? '#f59e0b' : avg > 0 ? '#ef4444' : 'currentColor';

              const scoreItems = [
                { label: 'Grammar',       value: ev.grammarScore },
                { label: 'Vocabulary',    value: ev.vocabularyScore },
                { label: 'Pronunciation', value: ev.pronunciationScore },
                { label: 'Fluency',       value: ev.fluencyScore },
              ];

              return (
                <div key={ev._id} className="bg-muted border border-border rounded-md p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground truncate">
                        {ev.classId?.classCode ?? '—'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {ev.classId?.courseName ?? ''}
                      </div>
                    </div>
                    {ev.level && (
                      <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        {ev.level}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="relative w-16 h-16 shrink-0">
                      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="5" className="text-border" />
                        <circle
                          cx="32" cy="32" r="26" fill="none"
                          stroke={ringColor}
                          strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={`${(avg / 10) * 163.4} ${163.4 - (avg / 10) * 163.4}`}
                          className="transition-all duration-700"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-sm font-bold leading-none tabular-nums ${avgColor}`}>
                          {avg > 0 ? avg.toFixed(1) : '—'}
                        </span>
                        <span className="text-[9px] text-subtle-foreground mt-0.5">TB</span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-1.5">
                      {scoreItems.map(({ label, value }) => {
                        const pct = Math.round(((value || 0) / 10) * 100);
                        const barColor = (value || 0) >= 8 ? 'bg-success' : (value || 0) >= 6 ? 'bg-warning' : (value || 0) > 0 ? 'bg-destructive' : 'bg-muted-foreground/30';
                        return (
                          <div key={label} className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
                            <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-foreground w-6 text-right tabular-nums">
                              {value != null && value !== 0 ? value : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {ev.teacherComment && (
                    <div className="pt-1 border-t border-border">
                      <p className="text-xs text-muted-foreground leading-relaxed italic">
                        &ldquo;{ev.teacherComment}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
