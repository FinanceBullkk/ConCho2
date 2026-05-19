import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useMyClassSchedules } from '../hooks/useSchedules';
import { useMyAttendanceStats, useAttendanceByUser } from '../hooks/useAttendance';
import { useEvaluations } from '../hooks/useEvaluations';
import {
  CalendarDays, BarChart3, ClipboardList, Target,
  BookOpen, Clock, Calendar, TrendingUp, Users2,
} from 'lucide-react';
import { Spinner } from '../components/Spinner';
import { KPICard } from '../components/KPICard';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { DataTable } from '../components/DataTable';

// ──────────────────────────────────────────────────────────
// Participant Dashboard — Phase 3 Screen 6
//
// Sections:
//   1. Attendance KPIs (rate, present, absent) — KPICard ×3
//   2. Next class card + link to /calendar
//   3. Attendance history table
//   4. Evaluation scores
// ──────────────────────────────────────────────────────────

export default function ParticipantDashboard() {
  const { user } = useAuth();

  const { data: schedData, isLoading: loadingSched } = useMyClassSchedules();
  const { data: stats, isLoading: loadingStats } = useMyAttendanceStats();
  const { data: rawHistory, isLoading: loadingHistory } = useAttendanceByUser(user._id);
  const { data: rawEvals = [], isLoading: loadingEvals } = useEvaluations();

  const schedules = schedData?.data || [];
  const teamName = schedData?.team || '';
  const leader = schedData?.leader || null;

  const historyColumns = useMemo(() => [
    {
      key: null,
      header: 'Ngày',
      render: (record) => {
        const sched = record.scheduleId;
        const start = sched?.startTime ? new Date(sched.startTime) : null;
        const dateStr = start
          ? start.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
          : '—';
        return (
          <div className="flex items-center gap-2">
            {start && (
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex flex-col items-center justify-center shrink-0">
                <span className="text-[9px] font-bold text-primary leading-tight">
                  {start.toLocaleDateString('en', { month: 'short' })}
                </span>
                <span className="text-sm font-bold text-primary leading-tight">{start.getDate()}</span>
              </div>
            )}
            <span className="text-muted-foreground text-xs whitespace-nowrap">{dateStr}</span>
          </div>
        );
      },
    },
    {
      key: null,
      header: 'Giờ học',
      className: 'hidden sm:table-cell',
      render: (record) => {
        const sched = record.scheduleId;
        const start = sched?.startTime ? new Date(sched.startTime) : null;
        const end = sched?.endTime ? new Date(sched.endTime) : null;
        const timeStr = start && end
          ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')} – ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
          : '—';
        return <span className="font-mono text-xs">{timeStr}</span>;
      },
    },
    {
      key: null,
      header: 'Mã lớp',
      render: (record) => (
        <span className="text-foreground font-medium">{record.scheduleId?.classId?.classCode || '—'}</span>
      ),
    },
    {
      key: null,
      header: 'Khóa học',
      className: 'hidden sm:table-cell',
      render: (record) => (
        <span className="text-muted-foreground text-xs">{record.scheduleId?.classId?.courseName || '—'}</span>
      ),
    },
    {
      key: null,
      header: 'Trạng thái',
      headerCls: 'text-center',
      cellCls: 'text-center',
      render: (record) => <StatusBadge status={record.status} size="sm" />,
    },
    {
      key: null,
      header: 'Ghi chú',
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

  useEffect(() => { document.title = 'TMS — My Dashboard'; }, []);

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
  const rateColor = rate >= 80 ? 'text-success' : rate >= 60 ? 'text-warning' : 'text-destructive';
  const rateTone = rate >= 80 ? 'success' : rate >= 60 ? 'warning' : 'danger';

  // Next upcoming session
  const now = new Date();
  const nextSession = schedules
    .filter(s => new Date(s.startTime) >= now)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))[0] || null;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div>
        <h1 className="text-h1 text-foreground">My Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {user.name}
          {teamName && <span className="text-primary"> · {teamName}</span>}
        </p>
        {leader && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <Users2 className="size-3.5 text-subtle-foreground" />
            <span className="text-subtle-foreground">Team Leader:</span>
            <span className="font-medium text-foreground">{leader.name}</span>
            {leader.email && (
              <a href={`mailto:${leader.email}`} className="text-primary hover:underline underline-offset-2">
                {leader.email}
              </a>
            )}
            {leader.empCode && <span className="text-subtle-foreground">· {leader.empCode}</span>}
          </div>
        )}
      </div>

      {/* ── Section 1: Attendance KPIs ─────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPICard
          label="Attendance Rate"
          value={`${rate}%`}
          sub={`${stats?.present ?? 0} / ${stats?.totalSessions ?? 0} sessions`}
          icon={TrendingUp}
          tone={rateTone}
        />
        <KPICard
          label="Present"
          value={stats?.present ?? 0}
          sub={`${stats?.late ?? 0} late · ${stats?.excused ?? 0} excused`}
          icon={BarChart3}
          tone="success"
        />
        <KPICard
          label="Absent"
          value={stats?.absent ?? 0}
          sub="sessions missed"
          icon={ClipboardList}
          tone={(stats?.absent ?? 0) > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {/* ── Section 2: Next class ──────────────────────── */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" strokeWidth={2} />
            Next Class
          </h2>
          <Link
            to="/calendar"
            className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
          >
            View full calendar →
          </Link>
        </div>

        {nextSession ? (
          (() => {
            const start = new Date(nextSession.startTime);
            const end = new Date(nextSession.endTime);
            const isToday = now.toDateString() === start.toDateString();
            const timeStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')} – ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
            return (
              <div className={`flex items-center gap-4 rounded-md border p-4 ${isToday ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/40'}`}>
                <div className={`w-14 h-14 rounded-md flex flex-col items-center justify-center shrink-0 ${isToday ? 'bg-primary/20 text-primary' : 'bg-primary/10 text-primary'}`}>
                  <span className="text-xs font-bold">{start.toLocaleDateString('en', { month: 'short' })}</span>
                  <span className="text-xl font-bold leading-none">{start.getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{nextSession.classId?.classCode}</span>
                    {isToday && <span className="text-[10px] font-bold text-primary bg-primary/20 px-2 py-0.5 rounded-full">TODAY</span>}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">{nextSession.classId?.courseName}</div>
                  <div className="text-xs text-subtle-foreground mt-0.5 flex items-center gap-2">
                    <Clock className="size-3" />
                    <span>{timeStr}</span>
                    <span>·</span>
                    <span>{start.toLocaleDateString('en', { weekday: 'long' })}</span>
                  </div>
                </div>
                <Link
                  to="/calendar"
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Calendar className="size-3.5" /> Calendar
                </Link>
              </div>
            );
          })()
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No upcoming classes"
            description="Your Team Leader can book sessions from the Schedule & Book page."
            action={<Link to="/calendar" className="text-xs text-primary font-medium hover:underline">Go to calendar</Link>}
          />
        )}
      </div>

      {/* ── Section 3: Attendance History ─────────────── */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="size-4 text-primary" strokeWidth={2} />
            Lịch Sử Điểm Danh
          </h2>
          <span className="text-xs text-subtle-foreground bg-muted px-3 py-1 rounded-md">
            {history.length} buổi
          </span>
        </div>
        <DataTable
          columns={historyColumns}
          data={history}
          rowKey="_id"
          emptyTitle="Chưa có lịch sử điểm danh"
          emptyMessage="Kết quả sẽ hiện sau khi giáo viên chấm công."
        />
      </div>

      {/* ── Section 4: Evaluation Scores ──────────────── */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Target className="size-4 text-primary" strokeWidth={2} />
            Kết Quả Đánh Giá
          </h2>
          <span className="text-xs text-subtle-foreground bg-muted px-3 py-1 rounded-md">
            {evaluations.length} lớp
          </span>
        </div>

        {loadingEvals ? (
          <div className="flex justify-center py-10"><Spinner size={24} /></div>
        ) : evaluations.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Chưa có kết quả đánh giá"
            description="Điểm sẽ xuất hiện sau khi giáo viên nhập đánh giá"
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
                        <span className={`text-sm font-bold leading-none ${avgColor}`}>
                          {avg > 0 ? avg.toFixed(1) : '—'}
                        </span>
                        <span className="text-[9px] text-subtle-foreground mt-0.5">avg</span>
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
                        "{ev.teacherComment}"
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
