import { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  CircleDashed,
  CalendarDays,
  UserX,
  Users,
} from 'lucide-react';
import { schedulesAPI, attendanceAPI } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useAttendanceCalendar } from '../hooks/useSchedules';
import { useBulkMarkAttendance } from '../hooks/useAttendance';
import { useTimeSlots } from '../hooks/useTimeSlots';
import { Spinner } from '../components/Spinner';

// ──────────────────────────────────────────────────────────
// AttendancePage — Calendar View
// ──────────────────────────────────────────────────────────
// Weekly timetable calendar (Mon–Sun × time slots) with
// color-coded attendance status badges. Click a cell to
// open the attendance marking form below.
//
// Status taxonomy — Phase 0 §04:
//   4 canonical states on a linear lifecycle:
//     Upcoming → To mark → In progress → Done
//   + 1 orthogonal flag:
//     No roster (config error, can co-exist with any state)
// Icons per Phase 0 §05 (Lucide-only, no emoji in UI chrome).
// ──────────────────────────────────────────────────────────

// Record-level options (per-student status in marking form)
const STATUS_OPTIONS = [
  { value: 'P', label: 'Present', color: 'bg-success/20 text-success border-success/30' },
  { value: 'A', label: 'Absent', color: 'bg-destructive/20 text-destructive border-destructive/30' },
  { value: 'L', label: 'Late', color: 'bg-warning/20 text-warning border-warning/30' },
  { value: 'EL', label: 'Excused', color: 'bg-chart-2/20 text-chart-2 border-chart-2/30' },
];

// TIME_SLOTS is resolved at runtime via useTimeSlots() — see component body.

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Session-level status taxonomy (Phase 0 §04)
// Keys are stable identifiers — visual treatment lives here, business
// logic in deriveSessionState() below.
const STATUS_CONFIG = {
  upcoming: {
    label: 'Upcoming',
    icon: CalendarDays,
    badgeCls: 'bg-neutral-tint text-neutral border-border-strong',
    cellBg: 'bg-muted/30',
    leftColor: 'var(--neutral)',
    opacity: 'opacity-70',
  },
  toMark: {
    label: 'To mark',
    icon: AlertCircle,
    badgeCls: 'bg-warning-tint text-warning border-warning/30',
    cellBg: 'bg-warning/[0.10]',
    leftColor: 'var(--warning)',
    opacity: '',
  },
  inProgress: {
    label: 'In progress',
    icon: CircleDashed,
    badgeCls: 'bg-info-tint text-info border-info/30',
    cellBg: 'bg-info/[0.08]',
    leftColor: 'var(--info)',
    opacity: '',
  },
  done: {
    label: 'Done',
    icon: CheckCircle2,
    badgeCls: 'bg-success-tint text-success border-success/30',
    cellBg: 'bg-success/[0.06]',
    leftColor: 'var(--success)',
    opacity: 'opacity-80',
  },
};

// Orthogonal flag — can co-exist with any state (config-error indicator)
const NO_ROSTER_FLAG = {
  label: 'No roster',
  icon: UserX,
  badgeCls: 'bg-destructive-tint text-destructive border-destructive/30',
};

// Derive (state, noRoster) from a schedule record.
// Server returns attendanceStatus ∈ {done, pending, partial, none}.
function deriveSessionState(schedule) {
  const isFuture = new Date(schedule.startTime) > new Date();
  const isNoRoster = schedule.attendanceStatus === 'none';

  if (isFuture) return { state: 'upcoming', noRoster: isNoRoster };

  switch (schedule.attendanceStatus) {
    case 'done':
      return { state: 'done', noRoster: false };
    case 'partial':
      return { state: 'inProgress', noRoster: false };
    case 'pending':
      return { state: 'toMark', noRoster: false };
    case 'none':
      // Past + no roster → config error, surface via flag; state defaults
      // to toMark so user can still see "something is wrong here".
      return { state: 'toMark', noRoster: true };
    default:
      return { state: 'toMark', noRoster: false };
  }
}

// ── Helpers ─────────────────────────────────────────────

const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
};

const toDateKey = (d) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

// Key on start-time only so the map lookup matches cellKey regardless of duration.
const scheduleToKey = (s) => {
  const start = new Date(s.startTime);
  const dateKey = toDateKey(start);
  return `${dateKey}|${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
};

export default function AttendancePage() {
  const { isAdmin } = useAuth();
  const TIME_SLOTS = useTimeSlots(); // from DB settings; hook falls back to hardcoded defaults while loading
  const bulkMarkMutation = useBulkMarkAttendance();
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [records, setRecords] = useState([]);
  const [existingRecords, setExistingRecords] = useState([]);
  const [result, setResult] = useState(null);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  useEffect(() => { document.title = 'TMS — Attendance'; }, []);

  // ── Load schedules with pre-computed attendance status ──
  const { data: schedules = [], isLoading: loading } = useAttendanceCalendar();

  // ── Build the 7 days of the current week ────────────────
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000));
  }, [weekStart]);

  // ── Build schedule lookup map ───────────────────────────
  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const key = scheduleToKey(s);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [schedules]);

  // ── Summary stats for current week ──────────────────────
  const weekStats = useMemo(() => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const weekSchedules = schedules.filter(s => {
      const d = new Date(s.startTime);
      return d >= weekStart && d < weekEnd;
    });
    return {
      total: weekSchedules.length,
      done: weekSchedules.filter(s => s.attendanceStatus === 'done').length,
      pending: weekSchedules.filter(s => s.attendanceStatus === 'pending').length,
      partial: weekSchedules.filter(s => s.attendanceStatus === 'partial').length,
      none: weekSchedules.filter(s => s.attendanceStatus === 'none').length,
    };
  }, [schedules, weekStart]);

  // ── Week navigation ─────────────────────────────────────
  const prevWeek = () => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000));
  const nextWeek = () => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000));
  const goToday = () => setWeekStart(getMonday(new Date()));
  const today = toDateKey(new Date());

  // ── Select schedule → load attendance form ──────────────
  const handleSelectSchedule = async (schedule) => {
    // Need to re-fetch the full schedule with enrolledUsers populated
    setSelectedSchedule(schedule);
    setResult(null);
    setRecords([]);

    try {
      // Get full schedule with enrolled users
      const scheduleRes = await schedulesAPI.getById(schedule._id);
      const fullSchedule = scheduleRes.data.data;

      let existing = [];
      try {
        const res = await attendanceAPI.getBySchedule(schedule._id);
        existing = res.data.data;
        setExistingRecords(existing);
      } catch {
        setExistingRecords([]);
      }

      const existingMap = {};
      existing.forEach((r) => {
        existingMap[r.userId?._id || r.userId] = r;
      });

      const recs = (fullSchedule.enrolledUsers || []).map((user) => {
        const prev = existingMap[user._id];
        return {
          userId: user._id,
          empCode: user.empCode,
          name: user.name,
          department: user.department,
          status: prev?.status || 'P',
          remark: prev?.remark || '',
          isMarked: !!prev,
        };
      });

      setRecords(recs);
      setSelectedSchedule({ ...schedule, ...fullSchedule });
    } catch (err) {
      console.error('Failed to load schedule details:', err);
    }
  };

  const updateRecord = (idx, field, value) => {
    setRecords((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value, isMarked: true } : r));
  };

  const markAll = (status) => {
    setRecords((prev) => prev.map((r) => ({ ...r, status, isMarked: true })));
  };

  const handleSubmit = async () => {
    if (!selectedSchedule || records.length === 0) return;
    setResult(null);
    try {
      const payload = records.map((r) => ({
        userId: r.userId,
        status: r.status,
        remark: r.remark,
      }));
      const res = await bulkMarkMutation.mutateAsync({ scheduleId: selectedSchedule._id, records: payload });
      setResult({ success: true, message: res.message });
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.message || 'Failed to submit' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 ">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground">Attendance Marking</h1>
          <p className="text-slate-400 mt-1">
            Click a session on the calendar to mark attendance
          </p>
        </div>
      </div>

      {/* ── Week Stats Banner ──────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl px-5 py-4 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-4 flex-wrap">
          {weekStats.pending > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-warning/10 border border-warning/20">
              <span className="text-warning text-sm font-semibold">{weekStats.pending}</span>
              <span className="text-xs text-warning/70">pending</span>
            </div>
          )}
          {weekStats.partial > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <span className="text-blue-400 text-sm font-semibold">{weekStats.partial}</span>
              <span className="text-xs text-blue-400/70">partial</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-success/10 border border-success/20">
            <span className="text-success text-sm font-semibold">{weekStats.done}</span>
            <span className="text-xs text-success/70">done</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
            <span className="text-slate-400 text-sm font-semibold">{weekStats.total}</span>
            <span className="text-xs text-slate-500">total this week</span>
          </div>
        </div>
      </div>

      {/* ── Week Navigation ────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="px-4 py-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 transition-all text-sm border border-white/10">← Prev</button>
        <div className="flex items-center gap-3">
          <h2 className="text-white font-semibold">
            {weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — {weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </h2>
          <button onClick={goToday} className="px-3 py-1 rounded-lg bg-primary/20 text-primary text-xs border border-primary/20 hover:bg-primary/30 transition-all">Today</button>
        </div>
        <button onClick={nextWeek} className="px-4 py-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 transition-all text-sm border border-white/10">Next →</button>
      </div>

      {/* ── Timetable Calendar ─────────────────────────── */}
      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-card px-3 py-3 border-b border-r border-border text-overline text-muted-foreground w-24 text-left">Time</th>
                {weekDays.map((day, i) => {
                  const dateKey = toDateKey(day);
                  const isToday = dateKey === today;
                  return (
                    <th key={i} className={`px-2 py-3 border-b border-white/10 text-center ${isToday ? 'bg-primary/10' : ''}`}>
                      <div className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-slate-400'}`}>{DAY_NAMES[i]}</div>
                      <div className={`text-xl font-bold ${isToday ? 'text-primary' : 'text-white'}`}>{day.getDate()}</div>
                      <div className="text-[10px] text-slate-500">{day.toLocaleDateString('en', { month: 'short' })}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {TIME_SLOTS.map((slot) => (
                <tr key={slot} className="group">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2 border-r border-b border-border text-mono text-muted-foreground whitespace-nowrap align-middle">
                    {slot}
                  </td>

                  {weekDays.map((day, dayIdx) => {
                    const dateKey = toDateKey(day);
                    const slotStartTime = slot.split('-')[0]; // "10:00-11:00" → "10:00"
                    const cellKey = `${dateKey}|${slotStartTime}`;
                    const cellSchedules = scheduleMap[cellKey] || [];
                    const isToday = dateKey === today;
                    const isPast = new Date(day) < new Date(new Date().setHours(0, 0, 0, 0));

                    if (cellSchedules.length > 0) {
                      return (
                        <td key={dayIdx} className={`border-b border-border p-1 align-top ${isToday ? 'bg-primary-tint/30' : ''}`}>
                          <div className="flex flex-col gap-1 h-full">
                            {cellSchedules.map((schedule) => {
                              const { state, noRoster } = deriveSessionState(schedule);
                              const cfg = STATUS_CONFIG[state];
                              const Icon = cfg.icon;
                              const isSelected = selectedSchedule?._id === schedule._id;
                              const progressPct = schedule.enrolledCount > 0
                                ? Math.round(((schedule.markedCount || 0) / schedule.enrolledCount) * 100)
                                : 0;
                              const progressBarCls = state === 'done'
                                ? 'bg-success'
                                : state === 'inProgress'
                                  ? 'bg-info'
                                  : 'bg-warning';

                              return (
                                <div
                                  key={schedule._id}
                                  className={`rounded-md p-2.5 pl-3 cursor-pointer relative overflow-hidden border border-border transition-colors duration-(--dur-fast) ${cfg.cellBg} ${cfg.opacity} ${
                                    cellSchedules.length === 1 ? 'min-h-[80px]' : 'min-h-[60px]'
                                  } ${
                                    isSelected
                                      ? 'ring-2 ring-ring ring-offset-2 ring-offset-card !opacity-100'
                                      : 'hover:!opacity-100'
                                  }`}
                                  style={{ borderLeftWidth: '4px', borderLeftColor: cfg.leftColor }}
                                  onClick={() => handleSelectSchedule(schedule)}
                                >
                                  {/* Status badges — state + optional No-roster flag */}
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className={`inline-flex items-center gap-1 px-1.5 h-[18px] rounded border text-[10.5px] font-medium ${cfg.badgeCls}`}>
                                      <Icon className="size-3" strokeWidth={2} aria-hidden="true" />
                                      {cfg.label}
                                    </span>
                                    {noRoster && (
                                      <span className={`inline-flex items-center gap-1 px-1.5 h-[18px] rounded border text-[10.5px] font-medium ${NO_ROSTER_FLAG.badgeCls}`}>
                                        <NO_ROSTER_FLAG.icon className="size-3" strokeWidth={2} aria-hidden="true" />
                                        {NO_ROSTER_FLAG.label}
                                      </span>
                                    )}
                                  </div>

                                  {/* Class info */}
                                  <div className="text-xs font-semibold text-foreground mt-1.5 truncate">
                                    {schedule.classId?.classCode}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {schedule.classId?.courseName}
                                  </div>

                                  {/* Roster size */}
                                  <div className="text-[10px] text-subtle-foreground mt-1 flex items-center gap-1 truncate">
                                    <Users className="size-2.5" strokeWidth={2} aria-hidden="true" />
                                    {schedule.enrolledCount || 0}
                                  </div>

                                  {/* Marked progress (only when relevant) */}
                                  {state !== 'upcoming' && !noRoster && (
                                    <div className="mt-1.5">
                                      <div className="flex justify-between text-[9px] text-subtle-foreground mb-0.5 tabular-nums">
                                        <span>{schedule.markedCount || 0}/{schedule.enrolledCount || 0}</span>
                                      </div>
                                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-[width] duration-(--dur) ${progressBarCls}`}
                                          style={{ width: `${progressPct}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    }

                    // ── Empty cell ──
                    return (
                      <td key={dayIdx} className={`border-b border-white/5 p-1 align-top ${isToday ? 'bg-primary/5' : ''}`}>
                        <div className="rounded-xl h-full min-h-[80px] bg-white/[0.02]" />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-small text-muted-foreground">
        {(['upcoming', 'toMark', 'inProgress', 'done']).map((key) => {
          const cfg = STATUS_CONFIG[key];
          const Icon = cfg.icon;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <Icon className="size-3.5" strokeWidth={2} style={{ color: cfg.leftColor }} aria-hidden="true" />
              <span>{cfg.label}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5">
          <NO_ROSTER_FLAG.icon className="size-3.5 text-destructive" strokeWidth={2} aria-hidden="true" />
          <span>{NO_ROSTER_FLAG.label}</span>
          <span className="text-subtle-foreground">(config error)</span>
        </div>
      </div>

      {/* ── Attendance Marking Panel ───────────────────── */}
      {selectedSchedule && new Date(selectedSchedule.startTime) > new Date() && (() => {
        const cfg = STATUS_CONFIG.upcoming;
        const Icon = cfg.icon;
        return (
          <div className="bg-card border border-border rounded-md p-8 text-center">
            <Icon className="mx-auto size-7 text-neutral mb-3" strokeWidth={2} aria-hidden="true" />
            <p className="text-h3 text-foreground">Buổi học chưa diễn ra</p>
            <p className="text-body text-muted-foreground mt-2 max-w-md mx-auto">
              Không thể điểm danh cho buổi học trong tương lai. Vui lòng quay lại sau khi buổi học đã bắt đầu.
            </p>
            <p className="text-small text-subtle-foreground mt-3">
              Lịch học: {new Date(selectedSchedule.startTime).toLocaleString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        );
      })()}
      {selectedSchedule && new Date(selectedSchedule.startTime) <= new Date() && records.length > 0 && (() => {
        const { state, noRoster } = deriveSessionState(selectedSchedule);
        const cfg = STATUS_CONFIG[state];
        const Icon = cfg.icon;

        return (
        <div
          className="bg-card border border-border rounded-md p-6"
          style={{ borderLeftWidth: '4px', borderLeftColor: cfg.leftColor }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-h3 text-foreground">
                  {selectedSchedule.classId?.classCode} — {new Date(selectedSchedule.startTime).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                </h2>
                <span className={`inline-flex items-center gap-1 px-1.5 h-[20px] rounded border text-overline ${cfg.badgeCls}`}>
                  <Icon className="size-3" strokeWidth={2} aria-hidden="true" />
                  {cfg.label}
                </span>
                {noRoster && (
                  <span className={`inline-flex items-center gap-1 px-1.5 h-[20px] rounded border text-overline ${NO_ROSTER_FLAG.badgeCls}`}>
                    <NO_ROSTER_FLAG.icon className="size-3" strokeWidth={2} aria-hidden="true" />
                    {NO_ROSTER_FLAG.label}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400">
                {records.length} students enrolled · {selectedSchedule.classId?.courseName}
                {(() => {
                  const unmarked = records.filter((r) => !r.isMarked).length;
                  if (unmarked === 0) return null;
                  return (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-semibold">
                      {unmarked} chưa điểm danh
                    </span>
                  );
                })()}
              </p>
            </div>
            {/* Quick mark all buttons */}
            <div className="flex gap-2">
              <span className="text-xs text-slate-500 self-center mr-1">Mark all:</span>
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => markAll(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:scale-105 ${opt.color}`}
                >
                  {opt.value}
                </button>
              ))}
            </div>
          </div>

          {/* Roster */}
          <div className="space-y-2 ">
            {records.map((record, idx) => (
              <div
                key={record.userId}
                className={`bg-muted border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${
                  !record.isMarked ? 'border border-amber-500/30 bg-amber-500/5' : ''
                }`}
              >
                {/* Student info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center text-xs font-bold text-primary">
                      {record.empCode?.slice(-2)}
                    </div>
                    <div>
                      <div className="font-medium text-white text-sm truncate flex items-center gap-2">
                        {record.name}
                        {!record.isMarked && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-semibold">
                            chưa điểm danh
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{record.empCode} • {record.department}</div>
                    </div>
                  </div>
                </div>

                {/* Status buttons */}
                <div className="flex gap-1.5">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateRecord(idx, 'status', opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        record.isMarked && record.status === opt.value
                          ? opt.color + ' scale-105 shadow-md'
                          : 'border-white/5 text-slate-500 hover:border-white/15 hover:text-slate-300'
                      }`}
                    >
                      {opt.value}
                    </button>
                  ))}
                </div>

                {/* Remark input */}
                <input
                  type="text"
                  placeholder="Remark..."
                  value={record.remark}
                  onChange={(e) => updateRecord(idx, 'remark', e.target.value)}
                  className="w-full sm:w-40 px-3 py-1.5 rounded-lg bg-muted/60 border border-white/5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                />
              </div>
            ))}
          </div>

          {/* Submit */}
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={handleSubmit}
              disabled={bulkMarkMutation.isPending}
              className="inline-flex items-center gap-2 px-4 h-(--control-h) rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-(--dur-fast)"
            >
              {bulkMarkMutation.isPending ? (
                <>
                  <Spinner size={14} />
                  Submitting…
                </>
              ) : (
                `Submit Attendance (${records.length} records)`
              )}
            </button>

            {result && (
              <div className={`px-3 py-1.5 rounded-md text-small ${
                result.success ? 'bg-success-tint text-success border border-success/30' : 'bg-destructive-tint text-destructive border border-destructive/30'
              }`}>
                {result.message}
              </div>
            )}
          </div>
        </div>
        );
      })()}

      {selectedSchedule && records.length === 0 && (
        <div className="bg-card border border-border rounded-md p-8 text-center" style={{ borderLeftWidth: '4px', borderLeftColor: 'var(--destructive)' }}>
          <NO_ROSTER_FLAG.icon className="mx-auto size-7 text-destructive mb-3" strokeWidth={2} aria-hidden="true" />
          <p className="text-h3 text-foreground">No roster</p>
          <p className="text-body text-muted-foreground mt-2 max-w-md mx-auto">
            This session has 0 enrolled students. Attendance can't be marked. Likely a configuration error — check the class roster.
          </p>
        </div>
      )}
    </div>
  );
}
