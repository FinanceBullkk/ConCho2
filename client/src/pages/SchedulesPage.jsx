import { useState, useEffect } from 'react';
import { schedulesAPI, classesAPI, teamsAPI, usersAPI } from '../api/api';

function ScheduleModal({ schedule, classes, teachers, onClose, onSaved }) {
  const isEdit = !!schedule?._id;
  const [form, setForm] = useState({
    classId: schedule?.classId?._id || schedule?.classId || '',
    date: schedule?.date ? schedule.date.substring(0, 10) : '',
    timeSlot: schedule?.timeSlot || '',
    teacherId: schedule?.teacherId?._id || schedule?.teacherId || '',
    roomLink: schedule?.roomLink || '',
    capacity: schedule?.capacity || 10,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      if (isEdit) await schedulesAPI.update(schedule._id, form);
      else await schedulesAPI.create(form);
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
          <div>
            <label className="block text-sm text-slate-300 mb-1">Date</label>
            <input type="date" value={form.date} onChange={(e) => f('date', e.target.value)} required
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Time Slot</label>
            <input type="text" value={form.timeSlot} onChange={(e) => f('timeSlot', e.target.value)} placeholder="09:00-10:30" required
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Teacher</label>
            <select value={form.teacherId} onChange={(e) => f('teacherId', e.target.value)} required
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
              <option value="" className="bg-slate-800">Select teacher…</option>
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

function BookTeamModal({ schedule, teams, onClose, onSaved }) {
  const [teamId, setTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const enrolledTeamIds = schedule?.enrolledTeams?.map((t) => t._id || t) || [];
  const available = teams.filter((t) => !enrolledTeamIds.includes(t._id));

  const handleBook = async () => {
    if (!teamId) return;
    setSaving(true); setError('');
    try {
      await schedulesAPI.bookTeam(schedule._id, teamId);
      onSaved();
    } catch (err) { setError(err.response?.data?.message || 'Booking failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white">📋 Book a Team</h2>
        <p className="text-sm text-slate-400">Available: {schedule.capacity - schedule.enrolledCount} spots · Schedule: {schedule.classId?.classCode}</p>
        {error && <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
          <option value="" className="bg-slate-800">Select team…</option>
          {available.map((t) => <option key={t._id} value={t._id} className="bg-slate-800">{t.name} ({t.members?.length || 0} members)</option>)}
        </select>
        {available.length === 0 && <p className="text-slate-500 text-sm">All teams already enrolled</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
          <button onClick={handleBook} disabled={!teamId || saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold disabled:opacity-50 transition-all">
            {saving ? 'Booking...' : 'Book Team'}
          </button>
        </div>
      </div>
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
  const [bookModal, setBookModal] = useState(null);
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

  const handleCancelTeam = async (scheduleId, teamId) => {
    try { await schedulesAPI.cancelTeam(scheduleId, teamId); load(); } catch (err) { alert(err.response?.data?.message); }
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
            return (
              <div key={s._id} className="glass rounded-2xl p-5">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Date badge */}
                  <div className="w-14 h-14 rounded-xl bg-primary-500/10 flex flex-col items-center justify-center text-primary-300 shrink-0">
                    <span className="text-xs font-bold">{new Date(s.date).toLocaleDateString('en', { month: 'short' })}</span>
                    <span className="text-xl font-bold leading-none">{new Date(s.date).getDate()}</span>
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white">{s.classId?.classCode}</span>
                      <span className="text-slate-400 text-sm">·</span>
                      <span className="text-slate-300 text-sm">{s.timeSlot}</span>
                      <span className="text-slate-400 text-sm">·</span>
                      <span className="text-slate-400 text-sm">{s.teacherId?.name}</span>
                    </div>
                    <div className="text-sm text-slate-400 mt-1">{s.classId?.courseName}</div>
                    {/* Teams enrolled */}
                    {s.enrolledTeams?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {s.enrolledTeams.map((t) => (
                          <span key={t._id} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 text-xs border border-purple-500/20">
                            👥 {t.name}
                            <button onClick={() => handleCancelTeam(s._id, t._id)} className="ml-1 text-purple-400 hover:text-red-400 transition-colors">×</button>
                          </span>
                        ))}
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
                    <button onClick={() => setBookModal(s)} className="px-3 py-1.5 rounded-lg bg-purple-500/10 text-purple-300 text-xs border border-purple-500/20 hover:bg-purple-500/20 transition-all">Book Team</button>
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
        <ScheduleModal schedule={modal === 'create' ? null : modal} classes={classes} teachers={teachers}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
      {bookModal && (
        <BookTeamModal schedule={bookModal} teams={teams}
          onClose={() => setBookModal(null)} onSaved={() => { setBookModal(null); load(); }} />
      )}
    </div>
  );
}
