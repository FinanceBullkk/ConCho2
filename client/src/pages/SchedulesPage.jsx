import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useSchedules } from '../hooks/useSchedules';
import { useClasses } from '../hooks/useClasses';
import { useTeams } from '../hooks/useTeams';
import { useRole } from '../hooks/useRole';
import { useTimeSlots } from '../hooks/useTimeSlots';
import { detectConflicts } from '../lib/schedule-conflicts';
import { CalendarGrid, getMonday, toDateKey } from '../components/CalendarGrid';
import { ScheduleDrawer } from '../components/ScheduleDrawer';
import { Button } from '@/components/ui/button';

// ──────────────────────────────────────────────────────────
// SchedulesPage — Phase 3 Screen 2 (D2 Drawer)
//
// Weekly calendar + schedule drawer (right sidebar / bottom sheet).
// Click empty cell → create drawer.
// Click existing session → edit drawer.
// Conflict cells flagged with stripe + AlertTriangle.
// ──────────────────────────────────────────────────────────

const parseSlot = (slot) => {
  const [s, e] = slot.split('-');
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  return { sh, sm, eh, em };
};

const scheduleToBucketKey = (s) => {
  const d = new Date(s.startTime);
  return `${toDateKey(d)}|${d.getHours()}`;
};

const scheduleTimeLabel = (s) => {
  const a = new Date(s.startTime), b = new Date(s.endTime);
  return `${String(a.getHours()).padStart(2,'0')}:${String(a.getMinutes()).padStart(2,'0')}–${String(b.getHours()).padStart(2,'0')}:${String(b.getMinutes()).padStart(2,'0')}`;
};

const schedToCellKey = (s) => {
  const d = new Date(s.startTime);
  return `${toDateKey(d)}|${String(d.getHours()).padStart(2, '0')}:00`;
};

export default function SchedulesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const DEFAULT_TIME_SLOTS = useTimeSlots();
  const { can } = useRole();
  const canCreate = can('create:schedule');
  const canUpdate = can('update:schedule');
  const canDelete = can('delete:schedule');

  const [drawerMode, setDrawerMode]             = useState(null);   // 'create' | 'edit' | null
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [selectedCell, setSelectedCell]         = useState(null);   // { day, hour, startTime, endTime }

  const [weekStart, setWeekStart] = useState(() => {
    const p = searchParams.get('week');
    if (p) { const d = new Date(p); if (!isNaN(d)) return getMonday(d); }
    return getMonday(new Date());
  });

  const setWeek = (monday) => {
    setWeekStart(monday);
    const next = new URLSearchParams(searchParams);
    next.set('week', toDateKey(monday));
    setSearchParams(next, { replace: true });
  };

  useEffect(() => { document.title = 'TMS — Schedules'; }, []);

  // ESC closes drawer
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const schedParams = useMemo(() => ({ limit: 2000 }), []);
  const { data: schedData, isLoading } = useSchedules(schedParams);
  const schedules    = schedData?.data || [];
  const totalCount   = schedData?.total || schedules.length;
  const { data: classes = [] } = useClasses();
  const { data: teams  = [] } = useTeams();

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000)),
  [weekStart]);

  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const key = scheduleToBucketKey(s);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [schedules]);

  const weekTimeRows = useMemo(() => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const hours = new Set(DEFAULT_TIME_SLOTS.map(slot => parseInt(slot.split(':')[0])));
    schedules.forEach(s => {
      const d = new Date(s.startTime);
      if (d >= weekStart && d < weekEnd) hours.add(d.getHours());
    });
    return [...hours].sort((a, b) => a - b);
  }, [schedules, weekStart, DEFAULT_TIME_SLOTS]);

  // Pre-compute conflict IDs (O(n²) on schedules change, not per render)
  const conflictIds = useMemo(() => {
    const ids = new Set();
    schedules.forEach(s => {
      if (detectConflicts(schedules, s).length > 0) ids.add(s._id);
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
    if (drawerMode === 'edit'   && selectedSchedule) return schedToCellKey(selectedSchedule);
    if (drawerMode === 'create' && selectedCell)     return `${toDateKey(selectedCell.day)}|${String(selectedCell.hour).padStart(2, '0')}:00`;
    return null;
  }, [drawerMode, selectedSchedule, selectedCell]);

  const closeDrawer = () => { setDrawerMode(null); setSelectedSchedule(null); setSelectedCell(null); };

  const handleScheduleClick = (s) => {
    if (!canUpdate) return;
    if (drawerMode === 'edit' && selectedSchedule?._id === s._id) { closeDrawer(); return; }
    setSelectedSchedule(s);
    setSelectedCell(null);
    setDrawerMode('edit');
  };

  const handleCellClick = (day, hour) => {
    if (!canCreate) return;
    const clickedKey = `${toDateKey(day)}|${String(hour).padStart(2, '0')}:00`;
    if (drawerMode === 'create' && selectedCellKey === clickedKey) { closeDrawer(); return; }
    const slot = `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`;
    const { sh, sm, eh, em } = parseSlot(slot);
    const startTime = new Date(day); startTime.setHours(sh, sm, 0, 0);
    const endTime   = new Date(day); endTime.setHours(eh, em, 0, 0);
    setSelectedCell({ day, hour, startTime, endTime });
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
        {canCreate && (
          <Button onClick={() => { setSelectedSchedule(null); setSelectedCell(null); setDrawerMode('create'); }}>
            + New Schedule
          </Button>
        )}
      </div>

      {/* ── Main: calendar + drawer ─────────────────────── */}
      <div className="lg:flex lg:gap-5 lg:items-start">

        {/* Left: calendar */}
        <div className="flex-1 min-w-0 space-y-4">
          <CalendarGrid
            weekDays={weekDays}
            timeRows={weekTimeRows}
            isLoading={isLoading}
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
            renderCell={(day, hour) => {
              const cellKey      = `${toDateKey(day)}|${hour}`;
              const cellSchedules = scheduleMap[cellKey] || [];

              if (cellSchedules.length > 0) {
                return (
                  <div className="space-y-1">
                    {cellSchedules.map(s => {
                      const isConflict  = conflictIds.has(s._id);
                      const isSelected  = selectedSchedule?._id === s._id;
                      const pct         = s.capacity > 0 ? Math.round((s.enrolledCount / s.capacity) * 100) : 0;
                      const barColor    = pct >= 90 ? 'bg-destructive' : pct >= 60 ? 'bg-warning' : 'bg-success';

                      return (
                        <div
                          key={s._id}
                          onClick={() => handleScheduleClick(s)}
                          className={`rounded-md p-2 border transition-colors relative overflow-hidden ${canUpdate ? 'cursor-pointer' : ''} ${
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
                            <span className="inline-flex items-center text-[9px] font-semibold text-chart-6 bg-chart-6/15 px-1.5 py-0.5 rounded truncate max-w-full">
                              {s.bookedTeamId?.name || '—'}
                            </span>
                          </div>
                          <div className="mt-1.5">
                            <div className="flex justify-between text-[9px] text-subtle-foreground mb-0.5 tabular-nums">
                              <span>{s.enrolledCount}/{s.capacity}</span>
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

              if (canCreate) {
                return (
                  <div
                    className="h-full min-h-[80px] flex items-center justify-center rounded-md border border-transparent hover:bg-success/10 hover:border-success/20 cursor-pointer transition-colors duration-(--dur) group/cell"
                    onClick={() => handleCellClick(day, hour)}
                  >
                    <span className="text-[10px] text-subtle-foreground opacity-0 group-hover/cell:opacity-100 transition-opacity font-medium">+ Create</span>
                  </div>
                );
              }
              return <div className="h-full min-h-[80px] rounded-md" />;
            }}
          />

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded bg-primary/15 border border-primary/20" />
              <span>Session — click to edit</span>
            </div>
            {canCreate && (
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded border border-dashed border-success/30" />
                <span>Empty — click to create</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="w-3.5 h-3.5 rounded border-l-[3px] border-l-destructive/60 border border-destructive/25 bg-destructive/5" />
              <span>Conflict</span>
            </div>
          </div>
        </div>

        {/* Right: drawer */}
        <div className="lg:w-[300px] lg:flex-none lg:sticky lg:top-6">
          <ScheduleDrawer
            isOpen={!!drawerMode}
            mode={drawerMode || 'create'}
            schedule={selectedSchedule}
            prefill={selectedCell}
            classes={classes}
            teams={teams}
            allSchedules={schedules}
            isReadOnly={!canUpdate && !canCreate}
            onClose={closeDrawer}
            onSaved={closeDrawer}
            onDeleted={closeDrawer}
          />
        </div>
      </div>
    </div>
  );
}
