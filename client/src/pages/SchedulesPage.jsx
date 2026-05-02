import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { schedulesAPI } from '../api/api';
import Portal from '../components/Portal';
import { useSchedules } from '../hooks/useSchedules';
import { useClasses } from '../hooks/useClasses';
import { useTeams } from '../hooks/useTeams';
import { qk } from '../hooks/queryKeys';

// ──────────────────────────────────────────────────────────
// Admin Schedule Management (v2 — Calendar View)
// ──────────────────────────────────────────────────────────
// Weekly timetable grid (Mon–Sun × time slots) with full
// admin control: create, edit, delete.
// ──────────────────────────────────────────────────────────

const TIME_SLOTS = [
  '09:00-10:00', '10:00-11:00', '11:00-12:00',
  '13:00-14:00', '14:00-15:00', '15:00-16:00',
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Helpers ───────────────────────────────────────────────

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

const parseSlot = (slot) => {
  const [startStr, endStr] = slot.split('-');
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);
  return { sh, sm, eh, em };
};

const scheduleToKey = (s) => {
  const start = new Date(s.startTime);
  const end = new Date(s.endTime);
  const dateKey = toDateKey(start);
  const timeSlot = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}-${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  return `${dateKey}|${timeSlot}`;
};

// ── Schedule Modal (Create / Edit) ────────────────────────

function ScheduleModal({ schedule, classes, teams, onClose, onSaved, prefill }) {
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
  const [saving, setSaving] = useState(false);
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
    e.preventDefault(); setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        classId: resolvedClassId || form.classId,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      };
      if (isEdit) await schedulesAPI.update(schedule._id, payload);
      else await schedulesAPI.create(payload);
      onSaved();
    } catch (err) { setError(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const f = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white">{isEdit ? '✏️ Edit Schedule' : '➕ Create Schedule'}</h2>
        {error && <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          {/* ── Team selector (primary) ──────────────────── */}
          <div className="col-span-2">
            <label className="block text-sm text-slate-300 mb-1">Team</label>
            <select value={form.bookedTeamId} onChange={(e) => handleTeamChange(e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
              <option value="" className="bg-slate-800">Select team…</option>
              {assignedTeams.map((t) => {
                const cls = classById[t.classId?._id || t.classId];
                const label = cls ? `${t.name} → ${cls.classCode} (${cls.courseName})` : t.name;
                return <option key={t._id} value={t._id} className="bg-slate-800">{label}</option>;
              })}
            </select>
          </div>

          {/* ── Auto-resolved class (read-only info) ────── */}
          <div className="col-span-2">
            <label className="block text-sm text-slate-300 mb-1">Class <span className="text-slate-500">(auto-synced from team)</span></label>
            {resolvedClass ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-emerald-400 text-sm font-bold">{resolvedClass.classCode}</span>
                <span className="text-slate-400 text-sm">—</span>
                <span className="text-slate-300 text-sm">{resolvedClass.courseName}</span>
                <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  resolvedClass.status === 'Ongoing' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
                }`}>{resolvedClass.status}</span>
              </div>
            ) : teamHasNoClass ? (
              <div className="px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                ⚠️ This team has no assigned class. Please assign a class in the Classes page first.
              </div>
            ) : (
              <div className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-500 text-sm">
                Select a team to auto-fill class
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Start Time</label>
            <input type="datetime-local" value={form.startTime} onChange={(e) => f('startTime', e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">End Time</label>
            <input type="datetime-local" value={form.endTime} onChange={(e) => f('endTime', e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Capacity</label>
            <input type="number" value={form.capacity} onChange={(e) => f('capacity', Number(e.target.value))} min={1} required
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-300 mb-1">Room / Meet Link</label>
            <input type="text" value={form.roomLink} onChange={(e) => f('roomLink', e.target.value)} placeholder="https://meet.google.com/..."
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
          <button type="submit" disabled={saving || teamHasNoClass} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold disabled:opacity-50 transition-all">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
    </Portal>
  );
}

// ── Main Page ─────────────────────────────────────────────

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);       // 'create' | schedule obj | null
  const [prefill, setPrefill] = useState(null);    // { startTime, endTime } for calendar click
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  const { data: schedData, isLoading: loadingSched } = useSchedules({ limit: 200 });
  const schedules = schedData?.data || [];
  const { data: classes = [] } = useClasses();
  const { data: teams = [] } = useTeams();
  const loading = loadingSched;

  useEffect(() => { document.title = 'TMS — Schedules'; }, []);

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: qk.schedules.all });
    queryClient.invalidateQueries({ queryKey: qk.classes.all });
  };

  // ── Week helpers ────────────────────────────────────────
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000))
  , [weekStart]);

  const scheduleMap = useMemo(() => {
    const map = {};
    schedules.forEach(s => {
      const key = scheduleToKey(s);
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [schedules]);

  const prevWeek = () => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000));
  const nextWeek = () => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000));
  const goToday = () => setWeekStart(getMonday(new Date()));

  const today = toDateKey(new Date());

  // Count schedules in current week
  const weekScheduleCount = useMemo(() => {
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    return schedules.filter(s => {
      const d = new Date(s.startTime);
      return d >= weekStart && d < weekEnd;
    }).length;
  }, [schedules, weekStart]);

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
    try { await schedulesAPI.delete(deleteTarget._id); reload(); }
    catch (err) { alert(err.response?.data?.message || 'Delete failed'); }
    setDeleteTarget(null);
  };



  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">📅 Schedule Management</h1>
          <p className="text-slate-400 mt-1">
            {schedules.length} total sessions · {weekScheduleCount} this week
          </p>
        </div>
        <button onClick={() => { setPrefill(null); setModal('create'); }}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all shadow-lg shadow-primary-500/20 self-start">
          + New Schedule
        </button>
      </div>

      {/* ── Week navigation ────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button onClick={prevWeek} className="px-4 py-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 transition-all text-sm border border-white/10">← Prev</button>
        <div className="flex items-center gap-3">
          <h2 className="text-white font-semibold">
            {weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — {weekDays[6].toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </h2>
          <button onClick={goToday} className="px-3 py-1 rounded-lg bg-primary-500/20 text-primary-300 text-xs border border-primary-500/20 hover:bg-primary-500/30 transition-all">Today</button>
        </div>
        <button onClick={nextWeek} className="px-4 py-2 rounded-xl bg-white/5 text-slate-300 hover:bg-white/10 transition-all text-sm border border-white/10">Next →</button>
      </div>

      {/* ── Calendar Grid ──────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-900/95 backdrop-blur-sm px-3 py-3 border-b border-r border-white/10 text-xs text-slate-500 w-24">Time</th>
                  {weekDays.map((day, i) => {
                    const dateKey = toDateKey(day);
                    const isToday = dateKey === today;
                    return (
                      <th key={i} className={`px-2 py-3 border-b border-white/10 text-center ${isToday ? 'bg-primary-500/10' : ''}`}>
                        <div className={`text-xs font-bold ${isToday ? 'text-primary-300' : 'text-slate-400'}`}>{DAY_NAMES[i]}</div>
                        <div className={`text-xl font-bold ${isToday ? 'text-primary-200' : 'text-white'}`}>{day.getDate()}</div>
                        <div className="text-[10px] text-slate-500">{day.toLocaleDateString('en', { month: 'short' })}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {TIME_SLOTS.map((slot) => (
                  <tr key={slot} className="group">
                    <td className="sticky left-0 z-10 bg-slate-900/95 backdrop-blur-sm px-3 py-2 border-r border-b border-white/10 text-xs font-mono text-slate-400 whitespace-nowrap align-middle">
                      {slot}
                    </td>

                    {weekDays.map((day, dayIdx) => {
                      const dateKey = toDateKey(day);
                      const cellKey = `${dateKey}|${slot}`;
                      const cellSchedules = scheduleMap[cellKey] || [];
                      const isToday = dateKey === today;

                      if (cellSchedules.length > 0) {
                        // ── SCHEDULED CELL(S) ─────────────────
                        return (
                          <td key={dayIdx} className={`border-b border-white/5 p-1 align-top ${isToday ? 'bg-primary-500/5' : ''}`}>
                            <div className="space-y-1">
                              {cellSchedules.map((s) => {
                                const pct = s.capacity > 0 ? Math.round((s.enrolledCount / s.capacity) * 100) : 0;
                                const barColor = pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
                                return (
                                  <div key={s._id}
                                    className="rounded-xl p-2 bg-gradient-to-br from-primary-500/20 to-purple-500/10 border border-primary-400/20 hover:border-primary-400/40 transition-all group/card cursor-pointer relative"
                                    onClick={() => setModal(s)}
                                  >
                                    {/* Class info */}
                                    <div className="text-xs font-bold text-primary-300 truncate">
                                      {s.classId?.classCode}
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate">
                                      {s.classId?.courseName}
                                    </div>

                                    {/* Session number */}
                                    {s.sessionNumber && (
                                      <div className="text-[9px] font-medium text-emerald-400 mt-0.5">
                                        Session {s.sessionNumber}{s.classId?.totalSessions ? ` / ${s.classId.totalSessions}` : ''}
                                      </div>
                                    )}

                                    {/* Team badge */}
                                    <div className="mt-1">
                                      <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded-full truncate max-w-full">
                                        👥 {s.bookedTeamId?.name || '—'}
                                      </span>
                                    </div>

                                    {/* Capacity bar */}
                                    <div className="mt-1.5">
                                      <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                                        <span>{s.enrolledCount}/{s.capacity}</span>
                                      </div>
                                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                                        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                                      </div>
                                    </div>

                                    {/* Actions (visible on hover) */}
                                    <div className="absolute top-1 right-1 opacity-0 group-hover/card:opacity-100 transition-opacity flex gap-1">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(s); }}
                                        className="w-5 h-5 rounded bg-red-500/20 text-red-400 text-[10px] flex items-center justify-center hover:bg-red-500/40 transition-all"
                                        title="Delete"
                                      >✕</button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        );
                      }

                      // ── EMPTY CELL — click to create ──────
                      return (
                        <td key={dayIdx} className={`border-b border-white/5 p-1 align-top ${isToday ? 'bg-primary-500/5' : ''}`}>
                          <div
                            className="rounded-xl h-full min-h-[80px] flex items-center justify-center transition-all bg-white/[0.02] hover:bg-emerald-500/10 hover:border-emerald-500/20 border border-transparent cursor-pointer group/cell"
                            onClick={() => handleCellClick(day, slot)}
                          >
                            <span className="text-[10px] text-slate-600 opacity-0 group-hover/cell:opacity-100 transition-opacity font-medium">
                              + Create
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-gradient-to-br from-primary-500/30 to-purple-500/20 border border-primary-400/30" />
          <span>Scheduled session (click to edit)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-white/[0.03] border border-dashed border-emerald-500/30" />
          <span>Empty — click to create</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-amber-500/30" />
          <span>⚠️ = No teacher assigned</span>
        </div>
      </div>

      {/* ── Delete Confirmation ─────────────────────────── */}
      {deleteTarget && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4 animate-fade-in">
            <div className="text-3xl">🗑️</div>
            <h3 className="text-lg font-bold text-white">Delete this schedule?</h3>
            <p className="text-sm text-slate-400">
              {deleteTarget.classId?.classCode} · {deleteTarget.bookedTeamId?.name}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30 font-semibold transition-all">Delete</button>
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
          onSaved={() => { setModal(null); setPrefill(null); reload(); }}
        />
      )}
    </div>
  );
}
