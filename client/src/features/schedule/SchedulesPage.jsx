import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useSchedules } from '../../hooks/useSchedules';
import { useClasses } from '../../hooks/useClasses';
import { useTeams } from '../../hooks/useTeams';
import { useRole } from '../../hooks/useRole';
import { useSchedulingConfig, DEFAULT_UTC_OFFSET_MINUTES } from '../../hooks/useSchedulingConfig';
import { detectConflicts } from '../../lib/schedule-conflicts';
import { slotToUtcRange, scheduleSlotId, buildSlotRows } from '../../lib/scheduling-slots';
import { CalendarGrid, getMonday, toDateKey } from '../../components/CalendarGrid';
import { ScheduleDrawer } from '../../components/ScheduleDrawer';
import { Button } from '@/components/ui/button';

// ──────────────────────────────────────────────────────────
// SchedulesPage — Phase 3 Screen 2 (D2 Drawer)
//
// Weekly calendar + schedule drawer (right sidebar / bottom sheet).
// Click empty cell → create drawer.
// Click existing session → edit drawer.
// Conflict cells flagged with stripe + AlertTriangle.
// ──────────────────────────────────────────────────────────

// Bucket a session into a grid cell: local date (matches grid columns) + the
// session's VN wall-clock slot id (matches the descriptor row id).
const scheduleToKey = (s, offset) =>
  `${toDateKey(new Date(s.startTime))}|${scheduleSlotId(s, offset)}`;

const scheduleTimeLabel = (s) => {
  const a = new Date(s.startTime), b = new Date(s.endTime);
  return `${String(a.getHours()).padStart(2,'0')}:${String(a.getMinutes()).padStart(2,'0')}–${String(b.getHours()).padStart(2,'0')}:${String(b.getMinutes()).padStart(2,'0')}`;
};

const WORLD_FILTERS = ['all', 'team', 'cohort'];

// `mode='all'` shows BOTH scheduling worlds with a client-side Team/Cohort facet
// (the unified surface). Convergence Phase 3 slice 5 removed the old server-side
// team/cohort split + the /api/english reads, so 'all' is the only live value.
// Note: cell-click CREATE always books a TEAM session (the manual-create API
// requires a team); cohort sessions are created from Learning → Cohorts.
export default function SchedulesPage({
  mode,
  allowedClassIds,
  allowCreate = true,
  historicalOnly = false,
  historicalSchedules = [],
  defaultWeek,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const unified = mode === 'all';
  const [worldFilter, setWorldFilter] = useState('all');
  const config = useSchedulingConfig();
  const offset = config.data?.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES;
  const { can } = useRole();
  const canCreate = can('create:schedule');
  const canUpdate = can('update:schedule');
  const _canDelete = can('delete:schedule'); // reserved — delete UI not yet implemented

  const [drawerMode, setDrawerMode]             = useState(null);   // 'create' | 'edit' | null
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [selectedCell, setSelectedCell]         = useState(null);   // { day, hour, startTime, endTime }

  const [weekStart, setWeekStart] = useState(() => {
    const p = searchParams.get('week');
    if (p) { const d = new Date(p); if (!isNaN(d)) return getMonday(d); }
    if (defaultWeek) {
      const d = new Date(defaultWeek);
      if (!isNaN(d)) return getMonday(d);
    }
    return getMonday(new Date());
  });

  const setWeek = (monday) => {
    setWeekStart(monday);
    const next = new URLSearchParams(searchParams);
    next.set('week', toDateKey(monday));
    setSearchParams(next, { replace: true });
  };

  useEffect(() => { document.title = 'TMS — Schedules'; }, []);

  // ESC closes drawer. Call the stable setters inline (not closeDrawer, which is
  // declared lower) so render stays order-clean (react-hooks/immutability); the
  // empty dep array stays correct because React state setters are stable.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { setDrawerMode(null); setSelectedSchedule(null); setSelectedCell(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Unified mode reads BOTH worlds (no server mode) and facets client-side by
  // each row's deliveryType; team|cohort stay server-scoped.
  const schedParams = useMemo(
    () => (mode && mode !== 'all' ? { limit: 2000, mode } : { limit: 2000 }),
    [mode],
  );
  const { data: schedData, isLoading } = useSchedules(schedParams);
  // Memoized: `schedData?.data || []` minted a fresh [] every render, making
  // every downstream useMemo (scheduleMap, rows, …) recompute per render.
  const allSchedules = useMemo(() => schedData?.data || [], [schedData]);
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
  const schedules = useMemo(
    () => historicalOnly
      ? historicalSchedules
      : (unified && worldFilter !== 'all'
        ? scopedSchedules.filter((s) => (s.deliveryType || 'team') === worldFilter)
        : scopedSchedules),
    [historicalOnly, historicalSchedules, scopedSchedules, unified, worldFilter],
  );
  const totalCount = historicalOnly
    ? historicalSchedules.length
    : (allowedClassSet ? scopedSchedules.length : (schedData?.total || allSchedules.length));
  const createEnabled = !historicalOnly && canCreate && allowCreate;
  const { data: classes = [] } = useClasses();
  const { data: teams  = [] } = useTeams();

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

  // Rows = configured (bookable) slots + any in-week off-policy session windows.
  const rows = useMemo(() => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    return buildSlotRows(config.data?.slots, schedules, offset, weekStart, weekEnd);
  }, [config.data?.slots, schedules, offset, weekStart]);

  // Pre-compute conflict IDs (O(n²) on schedules change, not per render)
  const conflictIds = useMemo(() => {
    const ids = new Set();
    const editableSchedules = schedules.filter((schedule) => !schedule.isHistorical);
    editableSchedules.forEach(s => {
      if (detectConflicts(editableSchedules, s).length > 0) ids.add(s._id);
    });
    return ids;
  }, [schedules]);

  const weekScheduleCount = useMemo(() => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    return schedules.filter(s => { const d = new Date(s.startTime); return d >= weekStart && d < weekEnd; }).length;
  }, [schedules, weekStart]);

  const latestScheduleWeek = useMemo(() => {
    if (!schedules.length) return null;
    let latest = new Date(schedules[0].startTime);
    schedules.forEach(s => { const d = new Date(s.startTime); if (d > latest) latest = d; });
    return getMonday(latest);
  }, [schedules]);

  const selectedCellKey = useMemo(() => {
    if (drawerMode === 'edit'   && selectedSchedule) return scheduleToKey(selectedSchedule, offset);
    if (drawerMode === 'create' && selectedCell)     return `${toDateKey(selectedCell.day)}|${selectedCell.slot.id}`;
    return null;
  }, [drawerMode, selectedSchedule, selectedCell, offset]);

  const closeDrawer = () => { setDrawerMode(null); setSelectedSchedule(null); setSelectedCell(null); };

  const handleScheduleClick = (s) => {
    if (s.isHistorical || !canUpdate) return;
    if (drawerMode === 'edit' && selectedSchedule?._id === s._id) { closeDrawer(); return; }
    setSelectedSchedule(s);
    setSelectedCell(null);
    setDrawerMode('edit');
  };

  const handleCellClick = (day, slot) => {
    if (!createEnabled) return;
    const clickedKey = `${toDateKey(day)}|${slot.id}`;
    if (drawerMode === 'create' && selectedCellKey === clickedKey) { closeDrawer(); return; }
    const { startISO, endISO } = slotToUtcRange(day, slot, offset);
    setSelectedCell({ day, slot, startTime: new Date(startISO), endTime: new Date(endISO) });
    setSelectedSchedule(null);
    setDrawerMode('create');
  };

  const weekLabel = `${weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground">Schedule Management</h1>
          <p className="text-muted-foreground mt-1 text-body">
            {totalCount} total sessions · {weekScheduleCount} this week
          </p>
        </div>
        {createEnabled && (
          <Button onClick={() => { setSelectedSchedule(null); setSelectedCell(null); setDrawerMode('create'); }}>
            + New Schedule
          </Button>
        )}
      </div>

      {/* ── World facet (unified mode only) ─────────────── */}
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

      {/* ── Main: calendar + drawer ─────────────────────── */}
      <div className="lg:flex lg:gap-5 lg:items-start">

        {/* Left: calendar */}
        <div className="flex-1 min-w-0 space-y-4">
          <CalendarGrid
            weekDays={weekDays}
            rows={rows}
            isLoading={!historicalOnly && isLoading}
            selectedCellKey={selectedCellKey}
            onPrev={() => setWeek(new Date(weekStart.getTime() - 7 * 86400000))}
            onNext={() => setWeek(new Date(weekStart.getTime() + 7 * 86400000))}
            onToday={() => setWeek(getMonday(new Date()))}
            weekLabel={weekLabel}
            actions={
              latestScheduleWeek && weekScheduleCount === 0 ? (
                <Button variant="outline" size="sm" onClick={() => setWeek(latestScheduleWeek)} className="text-warning border-warning/30 hover:bg-warning/10">
                  Jump to latest
                </Button>
              ) : null
            }
            renderCell={(day, slot) => {
              const cellKey       = `${toDateKey(day)}|${slot.id}`;
              const cellSchedules = scheduleMap[cellKey] || [];

              if (cellSchedules.length > 0) {
                return (
                  <div className="space-y-1">
                    {cellSchedules.map(s => {
                      const canOpen = !s.isHistorical && canUpdate;
                      const isConflict  = conflictIds.has(s._id);
                      const isSelected  = selectedSchedule?._id === s._id;
                      const pct         = s.capacity > 0 ? Math.round((s.enrolledCount / s.capacity) * 100) : 0;
                      const barColor    = pct >= 90 ? 'bg-destructive' : pct >= 60 ? 'bg-warning' : 'bg-success';

                      return (
                        <div
                          key={s._id}
                          role={canOpen ? 'button' : undefined}
                          tabIndex={canOpen ? 0 : undefined}
                          onClick={canOpen ? () => handleScheduleClick(s) : undefined}
                          onKeyDown={canOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleScheduleClick(s); } } : undefined}
                          className={`rounded-md p-2 border transition-colors relative overflow-hidden ${canOpen ? 'cursor-pointer' : ''} ${
                            isConflict
                              ? 'border-l-[3px] border-l-destructive/60 border-destructive/25 bg-destructive/[0.05]'
                              : isSelected
                              ? 'bg-primary/15 border-primary/40'
                              : 'bg-primary/10 border-primary/20 hover:border-primary/40'
                          }`}
                          style={isConflict ? {
                            backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 8px, rgb(255 80 80 / 0.06) 8px 16px)',
                          } : undefined}
                        >
                          {isConflict && (
                            <AlertTriangle className="absolute top-1 right-1 size-3 text-destructive/70" strokeWidth={2} aria-hidden="true" />
                          )}
                          <div className="text-[9px] font-mono text-subtle-foreground mb-0.5">{scheduleTimeLabel(s)}</div>
                          <div className="text-xs font-bold text-primary truncate">{s.classId?.classCode}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{s.classId?.courseName}</div>
                          <div className="mt-1">
                            <span className="inline-flex items-center text-[9px] font-semibold text-chart-3 bg-chart-3/15 px-1.5 py-0.5 rounded truncate max-w-full">
                              {s.isHistorical ? s.historicalLabel : (s.bookedTeamId?.name || '—')}
                            </span>
                          </div>
                          <div className="mt-1.5">
                            <div className="flex justify-between text-[9px] text-subtle-foreground mb-0.5 tabular-nums">
                              <span>{s.isHistorical
                                ? `#${s.sessionNumber} · P ${s.archiveCounts?.present || 0} · A ${s.archiveCounts?.absent || 0}`
                                : `${s.enrolledCount}/${s.capacity}`}</span>
                            </div>
                            <div className="h-1 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              if (createEnabled) {
                return (
                  <button
                    type="button"
                    className="h-full min-h-[80px] flex items-center justify-center rounded-md border border-transparent hover:bg-success/10 hover:border-success/20 cursor-pointer transition-colors duration-(--dur) group/cell"
                    onClick={() => handleCellClick(day, slot)}
                  >
                    <span className="text-[10px] text-subtle-foreground opacity-0 group-hover/cell:opacity-100 transition-opacity font-medium">+ Create</span>
                  </button>
                );
              }
              return <div className="h-full min-h-[80px] rounded-md" />;
            }}
          />

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded bg-primary/15 border border-primary/20" />
              <span>{historicalOnly
                ? historicalSchedules[0]?.historicalReadOnlyLabel
                : 'Session — click to edit'}</span>
            </div>
            {createEnabled && (
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded border border-dashed border-success/30" />
                <span>Empty — click to create</span>
              </div>
            )}
            {!historicalOnly && <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded border-l-[3px] border-l-destructive/60 border border-destructive/25 bg-destructive/5" />
              <span>Conflict</span>
            </div>}
          </div>
        </div>

        {/* Right: drawer */}
        <div className="lg:w-[300px] lg:flex-none lg:sticky lg:top-6">
          {!historicalOnly && <ScheduleDrawer
            isOpen={!!drawerMode}
            mode={drawerMode || 'create'}
            schedule={selectedSchedule}
            prefill={selectedCell}
            classes={classes}
            teams={teams}
            allSchedules={allSchedules}
            isReadOnly={!canUpdate && !createEnabled}
            onClose={closeDrawer}
            onSaved={closeDrawer}
            onDeleted={closeDrawer}
          />}
        </div>
      </div>
    </div>
  );
}
