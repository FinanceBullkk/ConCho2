import { useState, useEffect, useMemo } from 'react';
import { X, TriangleAlert } from 'lucide-react';
import { useCreateSchedule, useUpdateSchedule, useDeleteSchedule } from '../hooks/useSchedules';
import { detectConflicts } from '../lib/schedule-conflicts';
import { Button } from '@/components/ui/button';
import { Spinner } from './Spinner';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// ScheduleDrawer — Phase 3 Screen 2 (D2 Drawer pattern)
//
// Admin create/edit/delete schedule.
// Same chrome as AttendanceDrawer; form body instead of roster.
//
// Modes:
//   create  — prefill { startTime, endTime } from cell click
//   edit    — full schedule object
//
// isReadOnly = true → Teacher view (no Save/Delete)
// ──────────────────────────────────────────────────────────

function toDateTimeLocal(d) {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}T${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

function ScheduleDrawerContent({
  mode, schedule, prefill,
  classes, teams, allSchedules,
  isReadOnly,
  onClose, onSaved, onDeleted,
}) {
  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateSchedule();
  const deleteMutation = useDeleteSchedule();

  const isEdit  = mode === 'edit';
  const saving  = createMutation.isPending || updateMutation.isPending;
  const deleting = deleteMutation.isPending;

  const teamById = useMemo(() => {
    const m = {};
    teams.forEach(t => { m[t._id] = t; });
    return m;
  }, [teams]);

  const classById = useMemo(() => {
    const m = {};
    classes.forEach(c => { m[c._id] = c; });
    return m;
  }, [classes]);

  const assignedTeams = useMemo(() => teams.filter(t => t.classId), [teams]);

  const buildInitialForm = () => {
    const initTeamId = schedule?.bookedTeamId?._id || schedule?.bookedTeamId || '';
    let initClassId  = schedule?.classId?._id || schedule?.classId || '';
    if (!initClassId && initTeamId && teamById[initTeamId]?.classId) {
      const c = teamById[initTeamId].classId;
      initClassId = c._id || c;
    }
    return {
      classId:      initClassId,
      bookedTeamId: initTeamId,
      startTime:    toDateTimeLocal(schedule?.startTime || prefill?.startTime),
      endTime:      toDateTimeLocal(schedule?.endTime   || prefill?.endTime),
      roomLink:     schedule?.roomLink || '',
      capacity:     schedule?.capacity || 9,
    };
  };

  const [form, setForm]               = useState(buildInitialForm);
  const [error, setError]             = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setForm(buildInitialForm());
    setError('');
    setDeleteConfirm(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?._id, prefill?.startTime]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleTeamChange = (teamId) => {
    const team     = teamById[teamId];
    const classId  = team?.classId?._id || team?.classId || '';
    setForm(p => ({ ...p, bookedTeamId: teamId, classId }));
  };

  const selectedTeam    = form.bookedTeamId ? teamById[form.bookedTeamId] : null;
  const resolvedClassId = selectedTeam?.classId?._id || selectedTeam?.classId || form.classId;
  const resolvedClass   = resolvedClassId ? classById[resolvedClassId] : null;
  const teamHasNoClass  = selectedTeam && !selectedTeam.classId;

  const conflicts = useMemo(() => {
    if (!form.startTime || !form.endTime) return [];
    return detectConflicts(allSchedules, {
      _id:       schedule?._id,
      startTime: new Date(form.startTime).toISOString(),
      endTime:   new Date(form.endTime).toISOString(),
    });
  }, [form.startTime, form.endTime, allSchedules, schedule?._id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        classId:   resolvedClassId || form.classId,
        startTime: new Date(form.startTime).toISOString(),
        endTime:   new Date(form.endTime).toISOString(),
      };
      if (isEdit) await updateMutation.mutateAsync({ id: schedule._id, data: payload });
      else        await createMutation.mutateAsync(payload);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(schedule._id);
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
    }
  };

  const headerDate = schedule?.startTime || prefill?.startTime;

  const inner = (
    <div className="flex flex-col min-h-0 flex-1">
      {/* ── Header ─────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-border flex items-start gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {isEdit ? 'Edit session' : 'New session'}
          </p>
          {headerDate && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {new Date(headerDate).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
              {' · '}
              {new Date(headerDate).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* ── Body ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">
        {conflicts.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-[11px]">
            <TriangleAlert className="size-3.5 text-warning mt-0.5 shrink-0" strokeWidth={2} />
            <span className="text-warning">
              <strong>Conflict</strong> with{' '}
              {conflicts.slice(0, 3).map(c => c.classId?.classCode || 'session').join(', ')}
              {conflicts.length > 3 ? ` +${conflicts.length - 3} more` : ''}.
              {' '}Save is still allowed.
            </span>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs">
            {error}
          </div>
        )}

        {isReadOnly && (
          <div className="px-3 py-2 rounded-md bg-muted border border-border text-xs text-muted-foreground text-center">
            View only — no edit access
          </div>
        )}

        <form id="schedule-form" onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1 font-medium">Team</label>
            <select
              value={form.bookedTeamId}
              onChange={e => handleTeamChange(e.target.value)}
              required
              disabled={isReadOnly}
              className="w-full px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors disabled:opacity-60"
            >
              <option value="" className="bg-popover">Select team…</option>
              {assignedTeams.map(t => {
                const cls   = classById[t.classId?._id || t.classId];
                const label = cls ? `${t.name} → ${cls.classCode}` : t.name;
                return <option key={t._id} value={t._id} className="bg-popover">{label}</option>;
              })}
            </select>
          </div>

          {resolvedClass ? (
            <div className="px-3 py-2 rounded-md bg-success-tint border border-success/20 flex items-center gap-2 text-xs">
              <span className="text-success font-bold">{resolvedClass.classCode}</span>
              <span className="text-muted-foreground">—</span>
              <span className="text-foreground truncate">{resolvedClass.courseName}</span>
            </div>
          ) : teamHasNoClass ? (
            <div className="px-3 py-2 rounded-md bg-warning-tint border border-warning/20 text-warning text-xs">
              Team has no class assigned — fix in Classes page.
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1 font-medium">Start</label>
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={e => f('startTime', e.target.value)}
                required
                disabled={isReadOnly}
                className="w-full px-2 h-(--control-h) rounded-md border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring transition-colors disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1 font-medium">End</label>
              <input
                type="datetime-local"
                value={form.endTime}
                onChange={e => f('endTime', e.target.value)}
                required
                disabled={isReadOnly}
                className="w-full px-2 h-(--control-h) rounded-md border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring transition-colors disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-muted-foreground mb-1 font-medium">
              Room / Link <span className="font-normal text-subtle-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={form.roomLink}
              onChange={e => f('roomLink', e.target.value)}
              placeholder="https://meet.google.com/…"
              disabled={isReadOnly}
              className="w-full px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring transition-colors disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-[11px] text-muted-foreground mb-1 font-medium">Capacity</label>
            <input
              type="number"
              value={form.capacity}
              onChange={e => f('capacity', Number(e.target.value))}
              min={1}
              required
              disabled={isReadOnly}
              className="w-full px-3 h-(--control-h) rounded-md border border-input bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring transition-colors disabled:opacity-60"
            />
          </div>
        </form>
      </div>

      {/* ── Footer ─────────────────────────────────── */}
      {!isReadOnly && (
        <div className="px-4 py-2.5 border-t border-border shrink-0 flex items-center gap-2">
          {deleteConfirm ? (
            <>
              <span className="text-xs text-destructive font-medium flex-1">Delete this session?</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleDelete} disabled={deleting}>
                {deleting ? <><Spinner size={10} />…</> : 'Delete'}
              </Button>
            </>
          ) : (
            <>
              {isEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteConfirm(true)}
                >
                  Delete
                </Button>
              )}
              <span className="flex-1" />
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                type="submit"
                form="schedule-form"
                disabled={saving || !!teamHasNoClass}
              >
                {saving ? <><Spinner size={12} />Saving…</> : isEdit ? 'Save' : 'Create'}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      <div className={cn(
        'bg-card border-border flex flex-col overflow-hidden',
        'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] border-t rounded-t-xl shadow-xl',
        'lg:static lg:inset-auto lg:z-auto lg:max-h-[calc(100vh-180px)] lg:rounded-lg lg:border lg:shadow-none',
      )}>
        <div className="flex justify-center pt-2.5 pb-1 shrink-0 lg:hidden">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        {inner}
      </div>
    </>
  );
}

export function ScheduleDrawer({ isOpen, ...props }) {
  if (!isOpen) return null;
  return <ScheduleDrawerContent {...props} />;
}
