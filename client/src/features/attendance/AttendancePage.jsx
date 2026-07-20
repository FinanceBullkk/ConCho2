import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  CircleDashed,
  CalendarDays,
  UserX,
  Users,
} from 'lucide-react';
import { schedulesAPI, attendanceAPI } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { useAttendanceCalendar } from '../../hooks/useSchedules';
import { useBulkMarkAttendance } from '../../hooks/useAttendance';
import { useSchedulingConfig, DEFAULT_UTC_OFFSET_MINUTES } from '../../hooks/useSchedulingConfig';
import { scheduleSlotId, buildSlotRows } from '../../lib/scheduling-slots';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { CalendarGrid, getMonday, toDateKey } from '../../components/CalendarGrid';
import { AttendanceDrawer } from '../../components/AttendanceDrawer';
import { Button } from '@/components/ui/button';

// ──────────────────────────────────────────────────────────
// AttendancePage — Phase 3 Screen 1 (D2 Drawer)
//
// Weekly calendar (left/full) + attendance drawer
// (right sidebar on desktop, bottom sheet on mobile).
// Teacher marks a session in <30s; works phone + desktop.
// ──────────────────────────────────────────────────────────

const STATE_CELL_STYLE = {
  upcoming:   { icon: CalendarDays,  cellBg: 'bg-muted/30',       leftColor: 'var(--neutral)',     progressBar: 'bg-neutral',     opacity: 'opacity-70' },
  unrecorded: { icon: CircleDashed,  cellBg: 'bg-muted/30',       leftColor: 'var(--neutral)',     progressBar: 'bg-neutral',     opacity: 'opacity-80' },
  toMark:     { icon: AlertCircle,   cellBg: 'bg-warning/[0.10]', leftColor: 'var(--warning)',     progressBar: 'bg-warning',     opacity: '' },
  inProgress: { icon: CircleDashed,  cellBg: 'bg-info/[0.08]',    leftColor: 'var(--info)',        progressBar: 'bg-info',        opacity: '' },
  done:       { icon: CheckCircle2,  cellBg: 'bg-success/[0.06]', leftColor: 'var(--success)',     progressBar: 'bg-success',     opacity: 'opacity-80' },
  noRoster:   { icon: UserX,         cellBg: 'bg-destructive/[0.06]', leftColor: 'var(--destructive)', progressBar: 'bg-destructive', opacity: 'opacity-80' },
};

function deriveSessionState(schedule) {
  const isFuture = new Date(schedule.startTime) > new Date();
  const isNoRoster = schedule.attendanceStatus === 'none'
    && Number(schedule.enrolledCount || 0) === 0;
  if (isFuture) return { state: 'upcoming', noRoster: isNoRoster };
  if (isNoRoster) return { state: 'noRoster', noRoster: true };
  switch (schedule.attendanceStatus) {
    case 'done':    return { state: 'done',       noRoster: false };
    case 'partial': return { state: 'inProgress', noRoster: false };
    case 'unrecorded': return { state: 'unrecorded', noRoster: false };
    case 'pending': return { state: 'toMark',     noRoster: false };
    case 'none':    return { state: 'toMark',     noRoster: true  };
    default:        return { state: 'toMark',     noRoster: false };
  }
}

// Bucket a session into a grid cell: local date (matches grid columns) + the
// session's VN wall-clock slot id (matches the descriptor row id).
const scheduleToKey = (s, offset) =>
  `${toDateKey(new Date(s.startTime))}|${scheduleSlotId(s, offset)}`;

const daysSince = (dateStr) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);

const WORLD_FILTERS = ['all', 'team', 'cohort'];
const DEFAULT_STATUS_OPTIONS = ['P', 'A'];
const VALID_ATTENDANCE_STATES = new Set(['P', 'L', 'A', 'EL']);

// `mode` (optional): 'team' scopes the calendar to the English/team-booking
// world, 'cohort' to the cohort training world, and 'all' shows BOTH worlds
// with a client-side Team/Cohort facet (converge Phase 4 — the unified
// surface). Omitted → combined legacy read (both worlds, no facet UI).
export default function AttendancePage({
  mode,
  allowedClassIds,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  historicalOnly = false,
  historicalSchedules = [],
  defaultWeek,
  onHistoricalSelect,
  selectedHistoricalId,
  historicalDrawer,
  unrecordedLabel,
  hideHeader = false,
  stackedDetail = false,
}) {
  const { isAdmin } = useAuth();
  // Unified mode reads BOTH worlds (no server mode) and facets client-side by
  // each row's deliveryType; team|cohort stay server-scoped (English section /
  // legacy callers).
  const unified = mode === 'all';
  const [worldFilter, setWorldFilter] = useState('all');
  const config = useSchedulingConfig();
  const offset = config.data?.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES;
  const bulkMarkMutation = useBulkMarkAttendance();

  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [isLoadingRoster, setIsLoadingRoster]   = useState(false);
  const [records, setRecords]                   = useState([]);
  const [result, setResult]                     = useState(null);
  const [isDirty, setIsDirty]                   = useState(false);
  const [confirmingClose, setConfirmingClose]   = useState(false);
  const [weekStart, setWeekStart]               = useState(() => {
    if (defaultWeek) {
      const date = new Date(defaultWeek);
      if (!Number.isNaN(date.getTime())) return getMonday(date);
    }
    return getMonday(new Date());
  });

  useEffect(() => { document.title = 'TMS — Attendance'; }, []);

  const doClose = useCallback(() => {
    setSelectedSchedule(null);
    setRecords([]);
    setResult(null);
    setIsDirty(false);
    setConfirmingClose(false);
  }, []);

  const requestClose = useCallback(() => {
    if (isDirty) { setConfirmingClose(true); } else { doClose(); }
  }, [isDirty, doClose]);

  // ESC closes drawer (with guard when dirty)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && selectedSchedule) requestClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedSchedule, requestClose]);

  const { data: allSchedules = [], isLoading: loading } = useAttendanceCalendar(
    unified ? undefined : (mode ? { mode } : undefined),
  );
  const allowedClassSet = useMemo(
    () => (allowedClassIds ? new Set(allowedClassIds.map(String)) : null),
    [allowedClassIds],
  );
  const scopedSchedules = useMemo(
    () => (allowedClassSet
      ? allSchedules.filter((schedule) => allowedClassSet.has(String(
        schedule.classId?._id || schedule.classId || schedule.cohortId?._id || schedule.cohortId || '',
      )))
      : allSchedules),
    [allSchedules, allowedClassSet],
  );
  // Client-side world facet (only meaningful in unified mode). A row missing a
  // deliveryType (defensive) is treated as team — matches the server fallback.
  const schedules = useMemo(
    () => historicalOnly
      ? historicalSchedules
      : (unified && worldFilter !== 'all'
        ? scopedSchedules.filter((s) => (s.deliveryType || 'team') === worldFilter)
        : scopedSchedules),
    [historicalOnly, historicalSchedules, scopedSchedules, unified, worldFilter],
  );

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000)),
  [weekStart]);

  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const key = scheduleToKey(s, offset);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [schedules, offset]);

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
  const _today   = toDateKey(new Date()); // intentionally unused — reserved for future "go to today" highlight

  // The selected cell key for CalendarGrid ring (format "YYYY-MM-DD|HH:mm-HH:mm")
  const selectedCellKey = useMemo(() => {
    if (selectedSchedule) return scheduleToKey(selectedSchedule, offset);
    const historical = schedules.find((schedule) => schedule.archiveSessionId === selectedHistoricalId);
    return historical ? scheduleToKey(historical, offset) : null;
  }, [schedules, selectedHistoricalId, selectedSchedule, offset]);

  const handleSelectSchedule = useCallback(async (schedule) => {
    if (schedule.isHistorical) {
      onHistoricalSelect?.(schedule);
      return;
    }
    // Toggle: clicking the same cell closes the drawer
    if (selectedSchedule?._id === schedule._id) {
      requestClose();
      return;
    }
    setSelectedSchedule(schedule);
    setResult(null);
    setRecords([]);
    setIsDirty(false);
    setConfirmingClose(false);
    setIsLoadingRoster(true);
    try {
      const scheduleRes = await schedulesAPI.getById(schedule._id);
      const full = scheduleRes.data.data;

      let existing = [];
      try {
        const res = await attendanceAPI.getBySchedule(schedule._id);
        existing = res.data.data;
      } catch { /* no prior records — default all P */ }

      const existingMap = {};
      existing.forEach(r => { existingMap[r.userId?._id || r.userId] = r; });

      const recs = (full.enrolledUsers || []).map(user => {
        const prev = existingMap[user._id];
        return {
          userId:     user._id,
          empCode:    user.empCode,
          name:       user.name,
          department: user.department,
          status:     VALID_ATTENDANCE_STATES.has(prev?.status) ? prev.status : 'P',
          remark:     prev?.remark || '',
          isMarked:   !!prev,
        };
      });

      setRecords(recs);
      setSelectedSchedule({ ...schedule, ...full });
    } catch (err) {
      console.error('Failed to load roster:', err);
    } finally {
      setIsLoadingRoster(false);
    }
  // requestClose must be a dep: it closes over isDirty — with it omitted, a
  // toggle-click ran a STALE requestClose (isDirty=false) and skipped the
  // unsaved-changes confirm guard.
  }, [onHistoricalSelect, selectedSchedule, requestClose]);

  const updateRecord = useCallback((idx, field, value) => {
    setRecords(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value, isMarked: true } : r));
    setIsDirty(true);
    setResult(null);
  }, []);

  const markAll = useCallback((status) => {
    setRecords(prev => prev.map(r => ({ ...r, status, isMarked: true })));
    setIsDirty(true);
    setResult(null);
  }, []);

  const handleSubmit = async () => {
    if (!selectedSchedule || records.length === 0) return;
    setResult(null);
    try {
      const payload = records.map(r => ({ userId: r.userId, status: r.status, remark: r.remark }));
      await bulkMarkMutation.mutateAsync({ scheduleId: selectedSchedule._id, records: payload });
      setIsDirty(false);
      setResult({ success: true, message: 'Saved' });
    } catch (err) {
      setResult({ success: false, message: err.response?.data?.message || 'Failed to save' });
    }
  };

  // Keyboard shortcuts per roster row (P/A → set status)
  const makeRowKeyHandler = useCallback((idx) => (e) => {
    const key = e.key.toUpperCase();
    const map = { P: 'P', A: 'A', L: 'L', E: 'EL' };
    if (map[key] && statusOptions.includes(map[key])) {
      e.preventDefault();
      updateRecord(idx, 'status', map[key]);
    }
  }, [statusOptions, updateRecord]);

  // 7-day stale flag (§1F)
  const isStale = !!(
    selectedSchedule &&
    new Date(selectedSchedule.startTime) <= new Date() &&
    daysSince(selectedSchedule.startTime) > 7 &&
    deriveSessionState(selectedSchedule).state !== 'done'
  );

  // Rows = configured slots + any in-week off-policy session windows (read-only).
  const rows = useMemo(() => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    return buildSlotRows(config.data?.slots, schedules, offset, weekStart, weekEnd);
  }, [config.data?.slots, schedules, offset, weekStart]);

  if (!historicalOnly && loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Spinner size={28} />
      </div>
    );
  }

  const drawerOpen = !!selectedSchedule;
  const showDrawerColumn = historicalOnly ? Boolean(historicalDrawer) : drawerOpen;

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────── */}
      {!hideHeader && (
        <div>
          <h1 className="text-h1 text-foreground">Attendance</h1>
          <p className="text-muted-foreground mt-1 text-body">
            Click a session to open the attendance roster
          </p>
        </div>
      )}

      {/* ── World facet (unified mode only) ────────────────── */}
      {unified && (
        <div className="flex items-center gap-1">
          {WORLD_FILTERS.map((wf) => (
            <Button
              key={wf}
              size="sm"
              variant={worldFilter === wf ? 'default' : 'ghost'}
              onClick={() => setWorldFilter(wf)}
            >
              {wf.charAt(0).toUpperCase() + wf.slice(1)}
            </Button>
          ))}
        </div>
      )}

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

      {/* ── Main: calendar + drawer ─────────────────────────── */}
      <div className={stackedDetail ? 'space-y-4' : 'lg:flex lg:gap-5 lg:items-start'}>

        {/* Left: calendar grid */}
        <div className="flex-1 min-w-0 space-y-4">
          <CalendarGrid
            weekDays={weekDays}
            rows={rows}
            isLoading={false}
            selectedCellKey={selectedCellKey}
            onPrev={prevWeek}
            onNext={nextWeek}
            onToday={goToday}
            weekLabel={`${weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`}
            renderCell={(day, slot) => {
              const cellKey   = `${toDateKey(day)}|${slot.id}`;
              const cellSched = scheduleMap[cellKey] || [];
              if (cellSched.length === 0) return <div className="h-full min-h-[72px] rounded-md bg-muted/20" />;

              return (
                <div className="flex flex-col gap-1 h-full">
                  {cellSched.map(schedule => {
                    const { state, noRoster } = deriveSessionState(schedule);
                    const cell       = STATE_CELL_STYLE[state];
                    const isSelected = selectedSchedule?._id === schedule._id
                      || (schedule.isHistorical && schedule.archiveSessionId === selectedHistoricalId);
                    const progressPct = schedule.enrolledCount > 0
                      ? Math.round(((schedule.markedCount || 0) / schedule.enrolledCount) * 100)
                      : 0;

                    return (
                      <div
                        key={schedule._id}
                        className={`rounded-md p-2 pl-2.5 cursor-pointer relative overflow-hidden border border-border transition-colors duration-(--dur-fast) ${cell.cellBg} ${
                          cellSched.length === 1 ? 'min-h-[72px]' : 'min-h-[56px]'
                        } ${isSelected ? `!opacity-100 ${cell.opacity}` : `${cell.opacity} hover:!opacity-100`}`}
                        style={{ borderLeftWidth: '4px', borderLeftColor: cell.leftColor }}
                        onClick={() => handleSelectSchedule(schedule)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectSchedule(schedule); } }}
                        aria-pressed={isSelected}
                        aria-label={`${schedule.classId?.classCode} — ${state}`}
                      >
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge status={state} icon={cell.icon} size="sm">
                            {state === 'unrecorded' ? (schedule.attendanceStateLabel || unrecordedLabel) : undefined}
                          </StatusBadge>
                          {noRoster && state !== 'noRoster' && <StatusBadge status="noRoster" icon={UserX} size="sm" />}
                          {schedule.isHistorical && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                              {schedule.historicalLabel}
                            </span>
                          )}
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
                              <span>{schedule.isHistorical
                                ? `P ${schedule.archiveCounts?.present || 0} · A ${schedule.archiveCounts?.absent || 0} · ${schedule.markedCount || 0}/${schedule.enrolledCount || 0}`
                                : `${schedule.markedCount || 0}/${schedule.enrolledCount || 0}`}</span>
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

          {/* Legend */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATE_CELL_STYLE).map(([key, cell]) => (
              key !== 'unrecorded' || unrecordedLabel ? (
                <StatusBadge key={key} status={key} icon={cell.icon} size="sm">
                  {key === 'unrecorded' ? unrecordedLabel : undefined}
                </StatusBadge>
              ) : null
            ))}
          </div>
        </div>

        {/* Right: single drawer instance — static on desktop, fixed sheet on mobile */}
        {showDrawerColumn && (
          <div
            data-testid="attendance-drawer-column"
            className={stackedDetail ? 'w-full' : 'lg:w-[300px] lg:flex-none lg:sticky lg:top-6'}
          >
            {historicalOnly ? historicalDrawer : <AttendanceDrawer
              isOpen={drawerOpen}
              isLoading={isLoadingRoster}
              schedule={selectedSchedule}
              records={records}
              isPending={bulkMarkMutation.isPending}
              result={result}
              isStale={isStale}
              isAdmin={isAdmin}
              isDirty={isDirty}
              confirmingClose={confirmingClose}
              onCloseRequest={requestClose}
              onCancelClose={() => setConfirmingClose(false)}
              onDiscardAndClose={doClose}
              onMarkAll={markAll}
              onRecordUpdate={updateRecord}
              onSubmit={handleSubmit}
              makeRowKeyHandler={makeRowKeyHandler}
              statusOptions={statusOptions}
            />}
          </div>
        )}
      </div>
    </div>
  );
}
