import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  CircleDashed,
  CalendarDays,
  UserX,
  Users,
  ChevronDown,
  ChevronUp,
  MousePointerClick,
  TriangleAlert,
} from 'lucide-react';
import { schedulesAPI, attendanceAPI } from '../api/api';
import { useAuth } from '../context/AuthContext';
import { useAttendanceCalendar } from '../hooks/useSchedules';
import { useBulkMarkAttendance } from '../hooks/useAttendance';
import { useTimeSlots } from '../hooks/useTimeSlots';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { CalendarGrid, getMonday, toDateKey } from '../components/CalendarGrid';
import { Button } from '@/components/ui/button';

// ──────────────────────────────────────────────────────────
// AttendancePage — Phase 3 Screen 1
//
// Weekly calendar + inline roster panel. Teacher marks
// attendance per session in <30s. Works on phone (after
// class) and desktop (end-of-day bulk).
//
// Plan decisions (suggested defaults):
//   1C  Late hidden by default → "More ▾" reveals L/EL
//   1D  Notes only when status = EL
//   1E  "Mark all Present" primary CTA
//   1F  7-day soft warning (non-blocking)
//   1I  Optimistic: local state updates immediately
//   1J  Keyboard shortcuts P/A/L/E on focused rows
// ──────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Cell-level visual treatment per state (Phase 0 §04).
const STATE_CELL_STYLE = {
  upcoming:   { icon: CalendarDays,  cellBg: 'bg-muted/30',         leftColor: 'var(--neutral)',  progressBar: 'bg-neutral',  opacity: 'opacity-70' },
  toMark:     { icon: AlertCircle,   cellBg: 'bg-warning/[0.10]',   leftColor: 'var(--warning)',  progressBar: 'bg-warning',  opacity: '' },
  inProgress: { icon: CircleDashed,  cellBg: 'bg-info/[0.08]',      leftColor: 'var(--info)',     progressBar: 'bg-info',     opacity: '' },
  done:       { icon: CheckCircle2,  cellBg: 'bg-success/[0.06]',   leftColor: 'var(--success)',  progressBar: 'bg-success',  opacity: 'opacity-80' },
};

function deriveSessionState(schedule) {
  const isFuture = new Date(schedule.startTime) > new Date();
  const isNoRoster = schedule.attendanceStatus === 'none';
  if (isFuture) return { state: 'upcoming', noRoster: isNoRoster };
  switch (schedule.attendanceStatus) {
    case 'done':    return { state: 'done',       noRoster: false };
    case 'partial': return { state: 'inProgress', noRoster: false };
    case 'pending': return { state: 'toMark',     noRoster: false };
    case 'none':    return { state: 'toMark',     noRoster: true  };
    default:        return { state: 'toMark',     noRoster: false };
  }
}

const scheduleToKey = (s) => {
  const start = new Date(s.startTime);
  const dateKey = toDateKey(start);
  return `${dateKey}|${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
};

// How many days ago was a date?
const daysSince = (dateStr) => {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86400000);
};

// ── StatusChip — per-student P/A/L/EL toggle ─────────────
function StatusChip({ value, active, onClick, size = 'sm' }) {
  const styles = {
    P:  { active: 'bg-success/20 text-success border-success/30',      idle: 'border-border text-muted-foreground hover:text-success hover:border-success/40' },
    A:  { active: 'bg-destructive/20 text-destructive border-destructive/30', idle: 'border-border text-muted-foreground hover:text-destructive hover:border-destructive/40' },
    L:  { active: 'bg-warning/20 text-warning border-warning/30',      idle: 'border-border text-muted-foreground hover:text-warning hover:border-warning/40' },
    EL: { active: 'bg-chart-2/20 text-chart-2 border-chart-2/30',      idle: 'border-border text-muted-foreground hover:text-chart-2 hover:border-chart-2/40' },
  };
  const cls = active ? styles[value].active : styles[value].idle;
  const pad = size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${pad} rounded-md text-xs font-semibold border transition-colors duration-(--dur-fast) ${cls} ${active ? 'shadow-sm' : ''}`}
      aria-pressed={active}
    >
      {value}
    </button>
  );
}

export default function AttendancePage() {
  const { isAdmin } = useAuth();
  const TIME_SLOTS = useTimeSlots();
  const bulkMarkMutation = useBulkMarkAttendance();

  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [isSelectingSchedule, setIsSelectingSchedule] = useState(false);
  const [records, setRecords] = useState([]);
  const [result, setResult] = useState(null);
  // Per-row: whether L/EL "More" section is visible
  const [expandedRows, setExpandedRows] = useState(new Set());

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  useEffect(() => { document.title = 'TMS — Attendance'; }, []);

  const { data: schedules = [], isLoading: loading } = useAttendanceCalendar();

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000)),
  [weekStart]);

  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const key = scheduleToKey(s);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [schedules]);

  const weekStats = useMemo(() => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const ws = schedules.filter(s => {
      const d = new Date(s.startTime);
      return d >= weekStart && d < weekEnd;
    });
    return {
      total:   ws.length,
      done:    ws.filter(s => s.attendanceStatus === 'done').length,
      pending: ws.filter(s => s.attendanceStatus === 'pending').length,
      partial: ws.filter(s => s.attendanceStatus === 'partial').length,
    };
  }, [schedules, weekStart]);

  const prevWeek = () => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000));
  const nextWeek = () => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000));
  const goToday  = () => setWeekStart(getMonday(new Date()));
  const today    = toDateKey(new Date());

  const handleSelectSchedule = useCallback(async (schedule) => {
    setSelectedSchedule(schedule);
    setResult(null);
    setRecords([]);
    setExpandedRows(new Set());
    setIsSelectingSchedule(true);
    try {
      const scheduleRes = await schedulesAPI.getById(schedule._id);
      const fullSchedule = scheduleRes.data.data;

      let existing = [];
      try {
        const res = await attendanceAPI.getBySchedule(schedule._id);
        existing = res.data.data;
      } catch { /* no prior records */ }

      const existingMap = {};
      existing.forEach(r => { existingMap[r.userId?._id || r.userId] = r; });

      const recs = (fullSchedule.enrolledUsers || []).map(user => {
        const prev = existingMap[user._id];
        return {
          userId:    user._id,
          empCode:   user.empCode,
          name:      user.name,
          department: user.department,
          status:    prev?.status || 'P',
          remark:    prev?.remark || '',
          isMarked:  !!prev,
        };
      });

      // Pre-expand rows where prior status is L or EL
      const preExpanded = new Set(
        recs.map((r, i) => (r.status === 'L' || r.status === 'EL') ? i : -1).filter(i => i >= 0)
      );

      setRecords(recs);
      setExpandedRows(preExpanded);
      setSelectedSchedule({ ...schedule, ...fullSchedule });
    } catch (err) {
      console.error('Failed to load schedule details:', err);
    } finally {
      setIsSelectingSchedule(false);
    }
  }, []);

  const updateRecord = useCallback((idx, field, value) => {
    setRecords(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value, isMarked: true } : r));
    // Auto-expand row when L/EL selected so the chosen status stays visible
    if (field === 'status' && (value === 'L' || value === 'EL')) {
      setExpandedRows(prev => new Set([...prev, idx]));
    }
  }, []);

  const toggleExpand = useCallback((idx) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const markAll = useCallback((status) => {
    setRecords(prev => prev.map(r => ({ ...r, status, isMarked: true })));
    if (status === 'L' || status === 'EL') {
      setExpandedRows(new Set(records.map((_, i) => i)));
    }
  }, [records]);

  const handleSubmit = async () => {
    if (!selectedSchedule || records.length === 0) return;
    setResult(null);
    try {
      const payload = records.map(r => ({ userId: r.userId, status: r.status, remark: r.remark }));
      const res = await bulkMarkMutation.mutateAsync({ scheduleId: selectedSchedule._id, records: payload });
      setResult({ success: true, message: res.message });
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.message || 'Failed to submit' });
    }
  };

  // Keyboard shortcut handler — attached to each roster row
  const makeRowKeyHandler = useCallback((idx) => (e) => {
    const key = e.key.toUpperCase();
    const map = { P: 'P', A: 'A', L: 'L', E: 'EL' };
    if (map[key]) {
      e.preventDefault();
      updateRecord(idx, 'status', map[key]);
    }
  }, [updateRecord]);

  const timeRows = useMemo(() =>
    TIME_SLOTS.map(slot => parseInt(slot.split(':')[0], 10)),
  [TIME_SLOTS]);

  // 7-day stale warning (1F)
  const isStale = selectedSchedule &&
    new Date(selectedSchedule.startTime) <= new Date() &&
    daysSince(selectedSchedule.startTime) > 7 &&
    deriveSessionState(selectedSchedule).state !== 'done';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground">Attendance</h1>
          <p className="text-muted-foreground mt-1 text-body">
            Click a session to mark attendance
          </p>
        </div>
      </div>

      {/* ── Week stats ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {weekStats.pending > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-warning/10 border border-warning/20 text-xs">
            <span className="font-semibold text-warning">{weekStats.pending}</span>
            <span className="text-warning/70">to mark</span>
          </div>
        )}
        {weekStats.partial > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-info/10 border border-info/20 text-xs">
            <span className="font-semibold text-info">{weekStats.partial}</span>
            <span className="text-info/70">in progress</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-success/10 border border-success/20 text-xs">
          <span className="font-semibold text-success">{weekStats.done}</span>
          <span className="text-success/70">done</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted border border-border text-xs">
          <span className="font-semibold text-muted-foreground">{weekStats.total}</span>
          <span className="text-subtle-foreground">this week</span>
        </div>
      </div>

      {/* ── Calendar grid ──────────────────────────────────── */}
      <CalendarGrid
        weekDays={weekDays}
        timeRows={timeRows}
        isLoading={false}
        onPrev={prevWeek}
        onNext={nextWeek}
        onToday={goToday}
        weekLabel={`${weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
        renderCell={(day, hour) => {
          const dateKey   = toDateKey(day);
          const cellKey   = `${dateKey}|${String(hour).padStart(2, '0')}:00`;
          const cellSched = scheduleMap[cellKey] || [];
          const isToday   = dateKey === today;

          if (cellSched.length === 0) return <div className="h-full min-h-[80px] rounded-md bg-muted/20" />;

          return (
            <div className="flex flex-col gap-1 h-full">
              {cellSched.map(schedule => {
                const { state, noRoster } = deriveSessionState(schedule);
                const cell       = STATE_CELL_STYLE[state];
                const isSelected = selectedSchedule?._id === schedule._id;
                const progressPct = schedule.enrolledCount > 0
                  ? Math.round(((schedule.markedCount || 0) / schedule.enrolledCount) * 100)
                  : 0;

                return (
                  <div
                    key={schedule._id}
                    className={`rounded-md p-2.5 pl-3 cursor-pointer relative overflow-hidden border border-border transition-colors duration-(--dur-fast) ${cell.cellBg} ${cell.opacity} ${
                      cellSched.length === 1 ? 'min-h-[80px]' : 'min-h-[60px]'
                    } ${
                      isSelected
                        ? 'ring-2 ring-ring ring-offset-2 ring-offset-card !opacity-100'
                        : 'hover:!opacity-100'
                    }`}
                    style={{ borderLeftWidth: '4px', borderLeftColor: cell.leftColor }}
                    onClick={() => handleSelectSchedule(schedule)}
                  >
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusBadge status={state} icon={cell.icon} size="sm" />
                      {noRoster && <StatusBadge status="noRoster" icon={UserX} size="sm" />}
                    </div>
                    <div className="text-xs font-semibold text-foreground mt-1.5 truncate">
                      {schedule.classId?.classCode}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {schedule.classId?.courseName}
                    </div>
                    <div className="text-[10px] text-subtle-foreground mt-1 flex items-center gap-1 truncate">
                      <Users className="size-2.5" strokeWidth={2} aria-hidden="true" />
                      {schedule.enrolledCount || 0}
                    </div>
                    {state !== 'upcoming' && !noRoster && (
                      <div className="mt-1.5">
                        <div className="flex justify-between text-[9px] text-subtle-foreground mb-0.5 tabular-nums">
                          <span>{schedule.markedCount || 0}/{schedule.enrolledCount || 0}</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-[width] duration-(--dur) ${cell.progressBar}`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        }}
      />

      {/* ── Legend ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATE_CELL_STYLE).map(([key, cell]) => (
          <StatusBadge key={key} status={key} icon={cell.icon} size="sm" />
        ))}
        <StatusBadge status="noRoster" icon={UserX} size="sm" />
      </div>

      {/* ── Marking panel ──────────────────────────────────── */}

      {/* Idle state — no session selected */}
      {!selectedSchedule && !isSelectingSchedule && (
        <EmptyState
          icon={MousePointerClick}
          title="Select a session"
          description="Click any session on the calendar above to open the attendance roster."
        />
      )}

      {/* Loading session details */}
      {isSelectingSchedule && (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-3 bg-card border border-border rounded-md">
          <Spinner size={20} />
          <span className="text-body">Loading roster…</span>
        </div>
      )}

      {/* Future session — can't mark yet */}
      {selectedSchedule && !isSelectingSchedule && new Date(selectedSchedule.startTime) > new Date() && (
        <div className="bg-card border border-border rounded-md p-8 text-center">
          <CalendarDays className="mx-auto size-7 text-neutral mb-3" strokeWidth={2} aria-hidden="true" />
          <p className="text-h3 text-foreground">Session hasn't started</p>
          <p className="text-body text-muted-foreground mt-2 max-w-md mx-auto">
            Attendance can only be marked after the session begins.
          </p>
          <p className="text-small text-subtle-foreground mt-3">
            {new Date(selectedSchedule.startTime).toLocaleString('vi-VN', {
              weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
      )}

      {/* No roster */}
      {selectedSchedule && !isSelectingSchedule && new Date(selectedSchedule.startTime) <= new Date() && records.length === 0 && (
        <div
          className="bg-card border border-border rounded-md p-8 text-center"
          style={{ borderLeftWidth: '4px', borderLeftColor: 'var(--destructive)' }}
        >
          <UserX className="mx-auto size-7 text-destructive mb-3" strokeWidth={2} aria-hidden="true" />
          <p className="text-h3 text-foreground">No roster</p>
          <p className="text-body text-muted-foreground mt-2 max-w-md mx-auto">
            This session has 0 enrolled students. Check the class roster for a configuration error.
          </p>
        </div>
      )}

      {/* Marking form */}
      {selectedSchedule && !isSelectingSchedule && new Date(selectedSchedule.startTime) <= new Date() && records.length > 0 && (() => {
        const { state, noRoster } = deriveSessionState(selectedSchedule);
        const cell = STATE_CELL_STYLE[state];
        const unmarked = records.filter(r => !r.isMarked).length;

        return (
          <div
            className="bg-card border border-border rounded-md"
            style={{ borderLeftWidth: '4px', borderLeftColor: cell.leftColor }}
          >
            {/* Panel header */}
            <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-h3 text-foreground">
                    {selectedSchedule.classId?.classCode}
                  </h2>
                  <span className="text-muted-foreground text-sm">
                    {new Date(selectedSchedule.startTime).toLocaleDateString('en', {
                      weekday: 'short', month: 'short', day: 'numeric',
                    })}
                  </span>
                  <StatusBadge status={state} icon={cell.icon} />
                  {noRoster && <StatusBadge status="noRoster" icon={UserX} />}
                </div>
                <p className="text-small text-muted-foreground mt-0.5">
                  {records.length} enrolled · {selectedSchedule.classId?.courseName}
                  {unmarked > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-warning-tint text-warning border border-warning/30 text-[10px] font-semibold">
                      {unmarked} unmarked
                    </span>
                  )}
                </p>
              </div>

              {/* Mark-all actions: "Mark all Present" prominent, "Absent" secondary */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => markAll('P')}
                  className="h-8 text-xs"
                >
                  Mark all Present
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markAll('A')}
                  className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  All Absent
                </Button>
              </div>
            </div>

            {/* 7-day stale warning (1F) */}
            {isStale && (
              <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning-tint px-4 py-3 text-sm">
                <TriangleAlert className="size-4 text-warning mt-0.5 flex-none" strokeWidth={2} aria-hidden="true" />
                <p className="text-warning">
                  <strong>Session is over 7 days old.</strong>{' '}
                  Marking is still allowed{isAdmin ? '' : ' — contact an Admin to override if needed'}.
                </p>
              </div>
            )}

            {/* Roster */}
            <div className="p-5 space-y-2">
              {records.map((record, idx) => {
                const isExpanded = expandedRows.has(idx);
                const hasSecondaryStatus = record.status === 'L' || record.status === 'EL';

                return (
                  <div
                    key={record.userId}
                    tabIndex={0}
                    onKeyDown={makeRowKeyHandler(idx)}
                    className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border px-4 py-3 transition-colors duration-(--dur-fast) focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card ${
                      !record.isMarked
                        ? 'border-warning/30 bg-warning/5'
                        : 'border-border bg-muted/40'
                    }`}
                    aria-label={`${record.name} — press P, A, L, or E to set status`}
                  >
                    {/* Student info */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-primary/15 flex items-center justify-center text-xs font-bold text-primary flex-none">
                        {record.empCode?.slice(-2)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                          {record.name}
                          {!record.isMarked && (
                            <span className="px-1.5 py-px rounded bg-warning-tint text-warning border border-warning/30 text-[10px] font-semibold">
                              unmarked
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {record.empCode} · {record.department}
                        </div>
                      </div>
                    </div>

                    {/* Status buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Primary: P and A */}
                      <StatusChip value="P"  active={record.status === 'P'}  onClick={() => updateRecord(idx, 'status', 'P')}  />
                      <StatusChip value="A"  active={record.status === 'A'}  onClick={() => updateRecord(idx, 'status', 'A')}  />

                      {/* Secondary: L and EL — revealed via More toggle (1C) */}
                      {isExpanded ? (
                        <>
                          <StatusChip value="L"  active={record.status === 'L'}  onClick={() => updateRecord(idx, 'status', 'L')}  />
                          <StatusChip value="EL" active={record.status === 'EL'} onClick={() => updateRecord(idx, 'status', 'EL')} />
                          <button
                            type="button"
                            onClick={() => toggleExpand(idx)}
                            className="px-2 py-1 rounded-md text-xs text-subtle-foreground hover:text-muted-foreground border border-border hover:border-border/80 transition-colors duration-(--dur-fast)"
                            aria-label="Collapse Late/Excused options"
                          >
                            <ChevronUp className="size-3" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleExpand(idx)}
                          className={`px-2.5 py-1 rounded-md text-xs border transition-colors duration-(--dur-fast) flex items-center gap-1 ${
                            hasSecondaryStatus
                              ? 'bg-warning/15 text-warning border-warning/30'
                              : 'text-subtle-foreground border-border hover:text-muted-foreground hover:border-border/80'
                          }`}
                          aria-label="Show Late/Excused options"
                        >
                          {hasSecondaryStatus ? record.status : 'More'}
                          <ChevronDown className="size-3" />
                        </button>
                      )}
                    </div>

                    {/* Notes — only when EL (1D) */}
                    {record.status === 'EL' && (
                      <input
                        type="text"
                        placeholder="Excused reason…"
                        value={record.remark}
                        onChange={e => updateRecord(idx, 'remark', e.target.value)}
                        className="w-full sm:w-44 px-3 h-8 rounded-md bg-background border border-input text-sm text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Submit bar */}
            <div className="px-5 pb-5 flex items-center gap-3 flex-wrap">
              <Button
                onClick={handleSubmit}
                disabled={bulkMarkMutation.isPending}
                className="gap-2"
              >
                {bulkMarkMutation.isPending ? (
                  <><Spinner size={14} /> Submitting…</>
                ) : (
                  `Submit attendance (${records.length})`
                )}
              </Button>

              {result && (
                <div className={`px-3 py-1.5 rounded-md text-small ${
                  result.success
                    ? 'bg-success-tint text-success border border-success/30'
                    : 'bg-destructive-tint text-destructive border border-destructive/30'
                }`}>
                  {result.message}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
