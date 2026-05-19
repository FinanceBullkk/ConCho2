import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import Portal from '../components/Portal';
import { useSchedules, useCreateSchedule, useUpdateSchedule, useDeleteSchedule } from '../hooks/useSchedules';
import { useClasses } from '../hooks/useClasses';
import { useTeams } from '../hooks/useTeams';
import { useRole } from '../hooks/useRole';
import { qk } from '../hooks/queryKeys';
import { useTimeSlots } from '../hooks/useTimeSlots';
import { CalendarGrid, getMonday, toDateKey } from '../components/CalendarGrid';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';

// ──────────────────────────────────────────────────────────
// Admin Schedule Management (v2 — Calendar View)
// ──────────────────────────────────────────────────────────
// Weekly timetable grid (Mon–Sun × time slots) with full
// admin control: create, edit, delete.
// ──────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Helpers ───────────────────────────────────────────────

const parseSlot = (slot) => {
  const [startStr, endStr] = slot.split('-');
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  return { sh, sm, eh, em };
};

// Map schedule to date + start-hour bucket key
const scheduleToBucketKey = (s) => {
  const start = new Date(s.startTime);
  const dateKey = toDateKey(start);
  const hourKey = start.getHours(); // bucket by start hour
  return `${dateKey}|${hourKey}`;
};

// Format a schedule's actual time range for display
const scheduleTimeLabel = (s) => {
  const start = new Date(s.startTime);
  const end = new Date(s.endTime);
  return `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
};

// ── Schedule Modal (Create / Edit) ────────────────────────

function ScheduleModal({ schedule, classes, teams, onClose, onSaved, prefill }) {
  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateSchedule();
  const isEdit = !!schedule?._id;

  const toDateTimeLocal = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}T${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
  };

  // Build lookup maps for Team ↔ Class sync
  const teamById = {};
  const teamByClassId = {};
  teams.forEach(t => {
    teamById[t._id] = t;
    const cId = t.classId?._id || t.classId;
    if (cId) teamByClassId[cId] = t;
  });
  const classById = {};
  classes.forEach(c => { classById[c._id] = c; });

  // Only show teams that have an assigned class (valid for scheduling)
  const assignedTeams = teams.filter(t => t.classId);

  const [form, setForm] = useState(() => {
    const initTeamId = schedule?.bookedTeamId?._id || schedule?.bookedTeamId || '';
    let initClassId = schedule?.classId?._id || schedule?.classId || '';

    // Auto-resolve classId from team if not set
    if (!initClassId && initTeamId) {
      const t = teamById[initTeamId];
      if (t?.classId) initClassId = t.classId._id || t.classId;
    }

    return {
      classId: initClassId,
      bookedTeamId: initTeamId,
      startTime: toDateTimeLocal(schedule?.startTime || prefill?.startTime),
      endTime: toDateTimeLocal(schedule?.endTime || prefill?.endTime),
      roomLink: schedule?.roomLink || '',
      capacity: schedule?.capacity || 9,
    };
  });
  const saving = createMutation.isPending || updateMutation.isPending;
  const [error, setError] = useState('');

  // Derive the resolved class info from selected team
  const selectedTeam = form.bookedTeamId ? teamById[form.bookedTeamId] : null;
  const resolvedClassId = selectedTeam?.classId?._id || selectedTeam?.classId || form.classId;
  const resolvedClass = resolvedClassId ? classById[resolvedClassId] : null;
  // Also check: does this team even have a class?
  const teamHasNoClass = selectedTeam && !selectedTeam.classId;

  const handleTeamChange = (teamId) => {
    const team = teamById[teamId];
    const classId = team?.classId?._id || team?.classId || '';
    setForm(p => ({ ...p, bookedTeamId: teamId, classId }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      const payload = {
        ...form,
        classId: resolvedClassId || form.classId,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      };
      if (isEdit) await updateMutation.mutateAsync({ id: schedule._id, data: payload });
      else await createMutation.mutateAsync(payload);
      onSaved();
    } catch (err) { setError(err.response?.data?.message || 'Save failed'); }
  };

  const f = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg p-6 w-full max-w-lg mx-4 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-h3 text-foreground">{isEdit ? 'Edit Schedule' : 'Create Schedule'}</h2>
        {error && <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          {/* ── Team selector (primary) ──────────────────── */}
          <div className="col-span-2">
            <label className="block text-small text-muted-foreground mb-1">Team</label>
            <select value={form.bookedTeamId} onChange={(e) => handleTeamChange(e.target.value)} required
              className="w-full px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors">
              <option value="" className="bg-popover">Select team…</option>
              {assignedTeams.map((t) => {
                const cls = classById[t.classId?._id || t.classId];
                const label = cls ? `${t.name} → ${cls.classCode} (${cls.courseName})` : t.name;
                return <option key={t._id} value={t._id} className="bg-popover">{label}</option>;
              })}
            </select>
          </div>

          {/* ── Auto-resolved class (read-only info) ────── */}
          <div className="col-span-2">
            <label className="block text-small text-muted-foreground mb-1">Class <span className="text-subtle-foreground">(auto-synced from team)</span></label>
            {resolvedClass ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-md bg-success-tint border border-success/20">
                <span className="text-success text-sm font-bold">{resolvedClass.classCode}</span>
                <span className="text-muted-foreground text-sm">—</span>
                <span className="text-foreground text-sm">{resolvedClass.courseName}</span>
                <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  resolvedClass.status === 'Ongoing' ? 'bg-success-tint text-success' : 'bg-muted text-muted-foreground'
                }`}>{resolvedClass.status}</span>
              </div>
            ) : teamHasNoClass ? (
              <div className="px-3 py-2.5 rounded-md bg-warning-tint border border-warning/20 text-warning text-sm">
                This team has no assigned class. Please assign a class in the Classes page first.
              </div>
            ) : (
              <div className="px-3 py-2.5 rounded-md bg-muted border border-border text-subtle-foreground text-sm">
                Select a team to auto-fill class
              </div>
            )}
          </div>

          <div>
            <label className="block text-small text-muted-foreground mb-1">Start Time</label>
            <input type="datetime-local" value={form.startTime} onChange={(e) => f('startTime', e.target.value)} required
              className="w-full px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
          <div>
            <label className="block text-small text-muted-foreground mb-1">End Time</label>
            <input type="datetime-local" value={form.endTime} onChange={(e) => f('endTime', e.target.value)} required
              className="w-full px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
          <div>
            <label className="block text-small text-muted-foreground mb-1">Capacity</label>
            <input type="number" value={form.capacity} onChange={(e) => f('capacity', Number(e.target.value))} min={1} required
              className="w-full px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
          <div className="col-span-2">
            <label className="block text-small text-muted-foreground mb-1">Room / Meet Link</label>
            <input type="text" value={form.roomLink} onChange={(e) => f('roomLink', e.target.value)} placeholder="https://meet.google.com/..."
              className="w-full px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={saving || teamHasNoClass}>
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </div>
    </Portal>
  );
}

// ── Main Page ─────────────────────────────────────────────

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const DEFAULT_TIME_SLOTS = useTimeSlots(); // fetched from DB settings (falls back to hardcoded defaults)
  const { can } = useRole();
  const canCreate = can('create:schedule');
  const canUpdate = can('update:schedule');
  const canDelete = can('delete:schedule');
  const deleteMutation = useDeleteSchedule();
  const [modal, setModal] = useState(null);       // 'create' | schedule obj | null
  const [prefill, setPrefill] = useState(null);    // { startTime, endTime } for calendar click
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Week navigation — persisted in URL (?week=YYYY-MM-DD)
  const [weekStart, setWeekStart] = useState(() => {
    const param = searchParams.get('week');
    if (param) { const d = new Date(param); if (!isNaN(d)) return getMonday(d); }
    return getMonday(new Date());
  });

  const setWeek = (monday) => {
    setWeekStart(monday);
    const next = new URLSearchParams(searchParams);
    next.set('week', toDateKey(monday));
    setSearchParams(next, { replace: true });
  };

  // Fetch all schedules (calendar needs access to any week)
  const schedParams = useMemo(() => ({ limit: 2000 }), []);
  const { data: schedData, isLoading: loadingSched } = useSchedules(schedParams);
  const schedules = schedData?.data || [];
  const totalSchedules = schedData?.total || schedules.length;
  const { data: classes = [] } = useClasses();
  const { data: teams = [] } = useTeams();
  const loading = loadingSched;

  useEffect(() => { document.title = 'TMS — Schedules'; }, []);

  // ── Week helpers ────────────────────────────────────────
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000))
  , [weekStart]);

  // Map schedules by date + start hour (bucket)
  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const key = scheduleToBucketKey(s);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [schedules]);

  // Dynamic time rows: merge default slots with actual data hours for current week
  const weekTimeRows = useMemo(() => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const hoursInWeek = new Set();
    // Add default row hours
    DEFAULT_TIME_SLOTS.forEach(slot => {
      const hour = parseInt(slot.split(':')[0]);
      hoursInWeek.add(hour);
    });
    // Add hours from actual schedules in this week
    schedules.forEach(s => {
      const d = new Date(s.startTime);
      if (d >= weekStart && d < weekEnd) {
        hoursInWeek.add(d.getHours());
      }
    });
    return [...hoursInWeek].sort((a, b) => a - b);
  }, [schedules, weekStart]);

  const prevWeek  = () => setWeek(new Date(weekStart.getTime() - 7 * 86400000));
  const nextWeek  = () => setWeek(new Date(weekStart.getTime() + 7 * 86400000));
  const goToday   = () => setWeek(getMonday(new Date()));
  const goToLatest = () => { if (latestScheduleWeek) setWeek(latestScheduleWeek); };

  const today = toDateKey(new Date());

  // Count schedules in current week
  const weekScheduleCount = useMemo(() => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    return schedules.filter(s => {
      const d = new Date(s.startTime);
      return d >= weekStart && d < weekEnd;
    }).length;
  }, [schedules, weekStart]);

  // Find the Monday of the week containing the latest schedule
  const latestScheduleWeek = useMemo(() => {
    if (schedules.length === 0) return null;
    let latest = new Date(schedules[0].startTime);
    schedules.forEach(s => {
      const d = new Date(s.startTime);
      if (d > latest) latest = d;
    });
    return getMonday(latest);
  }, [schedules]);

  // ── Admin handlers ──────────────────────────────────────

  const handleCellClick = (day, slot) => {
    const { sh, sm, eh, em } = parseSlot(slot);
    const startTime = new Date(day); startTime.setHours(sh, sm, 0, 0);
    const endTime = new Date(day); endTime.setHours(eh, em, 0, 0);
    setPrefill({ startTime, endTime });
    setModal('create');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try { await deleteMutation.mutateAsync(deleteTarget._id); }
    catch { /* toast shown by global onError */ }
    setDeleteTarget(null);
  };

  const weekLabel = `${weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="space-y-5 ">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground">Schedule Management</h1>
          <p className="text-muted-foreground mt-1">
            {totalSchedules} total sessions · {weekScheduleCount} this week
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => { setPrefill(null); setModal('create'); }}>+ New Schedule</Button>
        )}
      </div>

      {/* ── Calendar Grid ──────────────────────────────── */}
      <CalendarGrid
        weekDays={weekDays}
        timeRows={weekTimeRows}
        isLoading={loading}
        onPrev={prevWeek}
        onNext={nextWeek}
        onToday={goToday}
        weekLabel={weekLabel}
        actions={
          latestScheduleWeek && weekScheduleCount === 0 ? (
            <Button variant="outline" size="sm" onClick={goToLatest} className="text-warning border-warning/30 hover:bg-warning/10">
              Jump to latest
            </Button>
          ) : null
        }
        renderCell={(day, hour) => {
          const dateKey = toDateKey(day);
          const cellKey = `${dateKey}|${hour}`;
          const cellSchedules = scheduleMap[cellKey] || [];

          if (cellSchedules.length > 0) {
            return (
              <div className="space-y-1">
                {cellSchedules.map((s) => {
                  const pct = s.capacity > 0 ? Math.round((s.enrolledCount / s.capacity) * 100) : 0;
                  const barColor = pct >= 90 ? 'bg-destructive' : pct >= 60 ? 'bg-warning' : 'bg-success';
                  return (
                    <div
                      key={s._id}
                      className={`rounded-md p-2 bg-primary/10 border border-primary/20 hover:border-primary/40 transition-colors duration-(--dur) relative ${canUpdate ? 'cursor-pointer' : ''} group/card`}
                      onClick={() => { if (canUpdate) setModal(s); }}
                    >
                      <div className="text-[9px] font-mono text-subtle-foreground mb-0.5">
                        {scheduleTimeLabel(s)}
                      </div>
                      <div className="text-xs font-bold text-primary truncate">
                        {s.classId?.classCode}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {s.classId?.courseName}
                      </div>
                      {s.sessionNumber && (
                        <div className="text-[9px] font-medium text-success mt-0.5">
                          Session {s.sessionNumber}{s.classId?.totalSessions ? ` / ${s.classId.totalSessions}` : ''}
                        </div>
                      )}
                      <div className="mt-1">
                        <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-chart-6 bg-chart-6/15 px-1.5 py-0.5 rounded truncate max-w-full">
                          {s.bookedTeamId?.name || '—'}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <div className="flex justify-between text-[9px] text-subtle-foreground mb-0.5 tabular-nums">
                          <span>{s.enrolledCount}/{s.capacity}</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      {canDelete && (
                        <div className="absolute top-1 right-1 opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
                            className="size-5 rounded bg-destructive/20 text-destructive text-[10px] flex items-center justify-center hover:bg-destructive/40 transition-colors"
                            title="Delete"
                          >✕</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }

          const defaultSlot = `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`;
          if (canCreate) {
            return (
              <div
                className="h-full min-h-[80px] flex items-center justify-center rounded-md border border-transparent hover:bg-success/10 hover:border-success/20 cursor-pointer transition-colors duration-(--dur) group/cell"
                onClick={() => handleCellClick(day, defaultSlot)}
              >
                <span className="text-[10px] text-subtle-foreground opacity-0 group-hover/cell:opacity-100 transition-opacity font-medium">+ Create</span>
              </div>
            );
          }
          return <div className="h-full min-h-[80px] rounded-md" />;
        }}
      />

      {/* ── Legend ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-primary/15 border border-primary/20" />
          <span>Scheduled session (click to edit)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded border border-dashed border-success/30" />
          <span>Empty — click to create</span>
        </div>
      </div>

      {/* ── Delete Confirmation ─────────────────────────── */}
      {deleteTarget && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border rounded-lg p-6 max-w-sm mx-4 text-center space-y-4 ">
            <h3 className="text-h3 text-foreground">Delete this schedule?</h3>
            <p className="text-body text-muted-foreground">
              {deleteTarget.classId?.classCode} · {deleteTarget.bookedTeamId?.name}
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* ── Create / Edit Modal ────────────────────────── */}
      {(modal === 'create' || (modal && modal._id)) && (
        <ScheduleModal
          schedule={modal === 'create' ? null : modal}
          classes={classes} teams={teams}
          prefill={prefill}
          onClose={() => { setModal(null); setPrefill(null); }}
          onSaved={() => { setModal(null); setPrefill(null); }}
        />
      )}
    </div>
  );
}
