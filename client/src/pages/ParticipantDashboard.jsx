import { useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMyClassSchedules } from '../hooks/useSchedules';
import { useMyAttendanceStats, useAttendanceByUser } from '../hooks/useAttendance';
import { useEvaluations } from '../hooks/useEvaluations';
import { Spinner } from '../components/Spinner';
import { DataTable } from '../components/DataTable';

// ──────────────────────────────────────────────────────────
// Participant Dashboard
// ──────────────────────────────────────────────────────────
// Three sections:
//   1. My Upcoming Classes — schedules for the participant's team/class
//   2. My Attendance Stats — personal P/A/L/EL breakdown + rate
//   3. My Attendance History — per-session table with date, time, status
// ──────────────────────────────────────────────────────────

// Status badge config
const STATUS_CONFIG = {
  P:  { label: 'Có mặt',    short: 'P',  bg: 'bg-success/15',     text: 'text-success',     border: 'border-success/25' },
  A:  { label: 'Vắng mặt',  short: 'A',  bg: 'bg-destructive/15', text: 'text-destructive', border: 'border-destructive/25' },
  L:  { label: 'Đi muộn',   short: 'L',  bg: 'bg-warning/15',     text: 'text-warning',     border: 'border-warning/25' },
  EL: { label: 'Có phép',   short: 'EL', bg: 'bg-info/15',        text: 'text-info',        border: 'border-info/25' },
};

export default function ParticipantDashboard() {
  const { user } = useAuth();

  const { data: schedData, isLoading: loadingSched } = useMyClassSchedules();
  const { data: stats, isLoading: loadingStats } = useMyAttendanceStats();
  const { data: rawHistory, isLoading: loadingHistory } = useAttendanceByUser(user._id);
  // Backend auto-scopes GET /api/evaluations to the current participant's userId
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
      header: 'Giáo viên',
      className: 'hidden md:table-cell',
      render: (record) => (
        <span className="text-muted-foreground text-xs">
          {record.scheduleId?.teacherId?.name || <span className="text-subtle-foreground italic">—</span>}
        </span>
      ),
    },
    {
      key: null,
      header: 'Trạng thái',
      headerCls: 'text-center',
      cellCls: 'text-center',
      render: (record) => {
        const cfg = STATUS_CONFIG[record.status] || STATUS_CONFIG.A;
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            {cfg.label}
          </span>
        );
      },
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

  // Sort by schedule date (newest first) — backend can't sort by populated fields
  const history = useMemo(() => {
    const records = rawHistory?.data || rawHistory || [];
    return [...records].sort((a, b) => {
      const dateA = a.scheduleId?.startTime ? new Date(a.scheduleId.startTime) : new Date(0);
      const dateB = b.scheduleId?.startTime ? new Date(b.scheduleId.startTime) : new Date(0);
      return dateB - dateA;
    });
  }, [rawHistory]);

  useEffect(() => { document.title = 'TMS — My Dashboard'; }, []);

  // Sort evaluations newest first (by updatedAt or createdAt)
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


  // ── Attendance stat cards ─────────────────────────────────
  const rate = stats?.attendanceRate ?? 0;
  const rateColor = rate >= 80 ? 'text-success' : rate >= 60 ? 'text-warning' : 'text-destructive';

  const statCards = [
    { label: 'Total Sessions', value: stats?.totalSessions ?? 0, icon: '📊', color: 'bg-primary' },
    { label: 'Present', value: stats?.present ?? 0, icon: '✅', color: 'bg-success' },
    { label: 'Absent', value: stats?.absent ?? 0, icon: '❌', color: 'bg-destructive' },
    { label: 'Late', value: stats?.late ?? 0, icon: '⏰', color: 'bg-warning' },
    { label: 'Excused', value: stats?.excused ?? 0, icon: '📝', color: 'bg-chart-2' },
  ];

  return (
    <div className="space-y-8 ">
      {/* ── Header ───────────────────────────────────────── */}
      <div>
        <h1 className="text-h1 text-foreground">My Learning Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {user.name}
          {teamName && <span className="text-primary"> · {teamName}</span>}
        </p>
        {leader && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <span className="text-subtle-foreground">Team Leader:</span>
            <span className="font-medium text-foreground">{leader.name}</span>
            {leader.email && (
              <a
                href={`mailto:${leader.email}`}
                className="text-primary hover:text-primary underline-offset-2 hover:underline"
              >
                {leader.email}
              </a>
            )}
            {leader.empCode && <span className="text-subtle-foreground">· {leader.empCode}</span>}
          </div>
        )}
      </div>

      {/* ── Section 1: My Upcoming Classes ────────────────── */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            📅 My Upcoming Classes
          </h2>
          <span className="text-xs text-subtle-foreground bg-muted px-3 py-1 rounded-md">
            {schedules.length} session{schedules.length !== 1 ? 's' : ''}
          </span>
        </div>

        {schedules.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-3 opacity-50">📭</div>
            <p className="text-muted-foreground">No upcoming classes scheduled</p>
            <p className="text-subtle-foreground text-sm mt-1">Your Team Leader can book sessions from the Schedule & Book page</p>
          </div>
        ) : (
          <div className="space-y-3 ">
            {schedules.map((s) => {
              const start = new Date(s.startTime);
              const end = new Date(s.endTime);
              const timeStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
              const isToday = new Date().toDateString() === start.toDateString();
              return (
                <div key={s._id} className={`bg-muted border border-border rounded-md p-4 flex items-center justify-between transition-colors ${isToday ? 'border border-primary/30' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-md flex flex-col items-center justify-center shrink-0 ${isToday ? 'bg-primary/20 text-primary' : 'bg-primary/10 text-primary'}`}>
                      <span className="text-xs font-bold">{start.toLocaleDateString('en', { month: 'short' })}</span>
                      <span className="text-xl font-bold leading-none">{start.getDate()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{s.classId?.classCode}</span>
                        {isToday && (
                          <span className="text-[10px] font-bold text-primary bg-primary/20 px-2 py-0.5 rounded-full">
                            TODAY
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5">{s.classId?.courseName}</div>
                      <div className="text-xs text-subtle-foreground mt-0.5 flex items-center gap-2">
                        <span>🕐 {timeStr}</span>
                        <span>·</span>
                        <span>{start.toLocaleDateString('en', { weekday: 'long' })}</span>
                        {s.teacherId?.name && (
                          <>
                            <span>·</span>
                            <span>👨‍🏫 {s.teacherId.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <div className="text-sm font-medium text-foreground">{s.enrolledCount}</div>
                    <div className="text-[10px] text-subtle-foreground">enrolled</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 2: My Attendance Stats ────────────────── */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            📈 My Attendance Stats
          </h2>
        </div>

        {/* Attendance Rate — big hero card */}
        <div className="bg-muted border border-border rounded-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Attendance Rate</div>
              <div className={`text-5xl font-bold ${rateColor}`}>{rate}%</div>
              <div className="text-xs text-subtle-foreground mt-2">
                {stats?.present ?? 0} present out of {stats?.totalSessions ?? 0} total sessions
              </div>
            </div>
            {/* Circular progress ring */}
            <div className="relative w-24 h-24 shrink-0">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-border" />
                <circle
                  cx="50" cy="50" r="42" fill="none"
                  stroke="url(#rateGradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${rate * 2.64} ${264 - rate * 2.64}`}
                  className="transition-all duration-1000"
                />
                <defs>
                  <linearGradient id="rateGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={rate >= 80 ? '#22c55e' : rate >= 60 ? '#f59e0b' : '#ef4444'} />
                    <stop offset="100%" stopColor={rate >= 80 ? '#14b8a6' : rate >= 60 ? '#f97316' : '#ec4899'} />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-lg font-bold ${rateColor}`}>{rate}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stat breakdown cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {statCards.map((card, i) => (
            <div key={card.label} className="bg-muted border border-border rounded-md p-4 text-center transition-colors" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="text-2xl mb-2">{card.icon}</div>
              <div className="text-h1 text-foreground">{card.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
              <div className={`h-1 rounded-full ${card.color} mt-3 opacity-40`} />
            </div>
          ))}
        </div>

        {/* Empty state */}
        {(stats?.totalSessions ?? 0) === 0 && (
          <div className="text-center py-6 mt-4">
            <p className="text-subtle-foreground text-sm">No attendance records yet — stats will appear after your teacher marks attendance</p>
          </div>
        )}
      </div>

      {/* ── Section 3: My Attendance History (Table) ────────── */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            📋 Lịch Sử Điểm Danh
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

      {/* ── Section 4: My Evaluations ────────────────────────── */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            🎯 Kết Quả Đánh Giá
          </h2>
          <span className="text-xs text-subtle-foreground bg-muted px-3 py-1 rounded-md">
            {evaluations.length} lớp
          </span>
        </div>

        {loadingEvals ? (
          <div className="flex justify-center py-10"><Spinner size={24} /></div>
        ) : evaluations.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-3 opacity-50">🎯</div>
            <p className="text-muted-foreground">Chưa có kết quả đánh giá</p>
            <p className="text-subtle-foreground text-sm mt-1">Điểm sẽ xuất hiện sau khi giáo viên nhập đánh giá</p>
          </div>
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
                  {/* Card header */}
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

                  {/* Average + score bars */}
                  <div className="flex items-center gap-5">
                    {/* Average ring */}
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

                    {/* Individual scores */}
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

                  {/* Teacher comment */}
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
