import { useState, useEffect } from 'react';
import { schedulesAPI, classesAPI, teamsAPI, usersAPI } from '../api/api';

// ──────────────────────────────────────────────────────────
// Admin Schedule Management (v2 — startTime/endTime)
// ──────────────────────────────────────────────────────────

function ScheduleModal({ schedule, classes, teachers, teams, onClose, onSaved }) {
  const isEdit = !!schedule?._id;

  // Helper: format Date → "YYYY-MM-DDTHH:MM" for datetime-local input
  const toDateTimeLocal = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}T${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
  };

  const [form, setForm] = useState({
    classId: schedule?.classId?._id || schedule?.classId || '',
    bookedTeamId: schedule?.bookedTeamId?._id || schedule?.bookedTeamId || '',
    startTime: toDateTimeLocal(schedule?.startTime),
    endTime: toDateTimeLocal(schedule?.endTime),
    teacherId: schedule?.teacherId?._id || schedule?.teacherId || '',
    roomLink: schedule?.roomLink || '',
    capacity: schedule?.capacity || 9,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      };
      if (!payload.teacherId) delete payload.teacherId;
      if (isEdit) await schedulesAPI.update(schedule._id, payload);
      else await schedulesAPI.create(payload);
      onSaved();
    } catch (err) { setError(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const f = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Schedule' : 'Create Schedule'}</h2>
        {error && <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm text-slate-300 mb-1">Class</label>
            <select value={form.classId} onChange={(e) => f('classId', e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
              <option value="" className="bg-slate-800">Select class…</option>
              {classes.map((c) => <option key={c._id} value={c._id} className="bg-slate-800">{c.classCode} — {c.courseName}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-slate-300 mb-1">Team</label>
            <select value={form.bookedTeamId} onChange={(e) => f('bookedTeamId', e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
              <option value="" className="bg-slate-800">Select team…</option>
              {teams.map((t) => <option key={t._id} value={t._id} className="bg-slate-800">{t.name}</option>)}
            </select>
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
            <label className="block text-sm text-slate-300 mb-1">Teacher (optional)</label>
            <select value={form.teacherId} onChange={(e) => f('teacherId', e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
              <option value="" className="bg-slate-800">No teacher</option>
              {teachers.map((t) => <option key={t._id} value={t._id} className="bg-slate-800">{t.name} ({t.empCode})</option>)}
            </select>
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
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold disabled:opacity-50 transition-all">
            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const PAGE_SIZE = 50;

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, cRes, tRes, teRes] = await Promise.all([
        schedulesAPI.getAll({ page, limit: PAGE_SIZE }),
        classesAPI.getAll(),
        usersAPI.getAll({ role: 'Teacher', limit: 200 }),
        teamsAPI.getAll(),
      ]);
      setSchedules(sRes.data.data);
      setTotal(sRes.data.total ?? sRes.data.count ?? 0);
      setPages(sRes.data.pages ?? 1);
      setClasses(cRes.data.data);
      setTeachers(tRes.data.data);
      setTeams(teRes.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);

  const handleDelete = async (id) => {
    try { await schedulesAPI.delete(id); load(); } catch (err) { alert(err.response?.data?.message); }
    setDeleteId(null);
  };

  // Format time range from startTime/endTime
  const fmtTime = (s) => {
    const start = new Date(s.startTime);
    const end = new Date(s.endTime);
    return `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}-${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">📅 Schedule Management</h1>
          <p className="text-slate-400 mt-1">{total} sessions</p>
        </div>
        <button onClick={() => setModal('create')}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all shadow-lg shadow-primary-500/20 self-start">
          + New Schedule
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-4 stagger">
          {schedules.map((s) => {
            const pct = s.capacity > 0 ? Math.round((s.enrolledCount / s.capacity) * 100) : 0;
            const barColor = pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';
            const startDate = new Date(s.startTime);
            return (
              <div key={s._id} className="glass rounded-2xl p-5">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Date badge */}
                  <div className="w-14 h-14 rounded-xl bg-primary-500/10 flex flex-col items-center justify-center text-primary-300 shrink-0">
                    <span className="text-xs font-bold">{startDate.toLocaleDateString('en', { month: 'short' })}</span>
                    <span className="text-xl font-bold leading-none">{startDate.getDate()}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{s.classId?.classCode}</span>
                      <span className="text-slate-400 text-sm">·</span>
                      <span className="text-slate-300 text-sm">{fmtTime(s)}</span>
                      <span className="text-slate-400 text-sm">·</span>
                      <span className="text-slate-400 text-sm">{s.teacherId?.name || 'No teacher'}</span>
                    </div>
                    <div className="text-sm text-slate-400 mt-1">{s.classId?.courseName}</div>
                    {/* Team */}
                    {s.bookedTeamId && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 text-xs border border-purple-500/20">
                          👥 {s.bookedTeamId.name || 'Team'}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Capacity bar */}
                  <div className="lg:w-36 shrink-0">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>{s.enrolledCount} enrolled</span>
                      <span>{s.capacity} cap</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1 text-right">{s.capacity - s.enrolledCount} spots left</div>
                  </div>
                  {/* Actions */}
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setModal(s)} className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-primary-500/20 hover:text-primary-300 transition-all">Edit</button>
                    <button onClick={() => setDeleteId(s._id)} className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs hover:bg-red-500/20 hover:text-red-400 transition-all">Del</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && schedules.length === 0 && <div className="glass rounded-2xl p-16 text-center text-slate-500">No schedules found</div>}

      {!loading && total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>Page {page} of {pages} · {total} total</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >← Prev</button>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page >= pages}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >Next →</button>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 max-w-sm mx-4 text-center space-y-4 animate-fade-in">
            <div className="text-3xl">🗑️</div>
            <h3 className="text-lg font-bold text-white">Delete this schedule?</h3>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/20 hover:bg-red-500/30 font-semibold transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}

      {(modal === 'create' || (modal && modal._id)) && (
        <ScheduleModal schedule={modal === 'create' ? null : modal} classes={classes} teachers={teachers} teams={teams}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}
