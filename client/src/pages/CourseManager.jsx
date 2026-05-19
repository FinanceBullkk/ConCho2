import { useState, useEffect, useCallback, useMemo } from 'react';
import { classesAPI, schedulesAPI } from '../api/api';
import Portal from '../components/Portal';

// ──────────────────────────────────────────────────────────
// Course Manager — Admin class/session editor
// ──────────────────────────────────────────────────────────
// Focused view to manage classes: status, totalSessions,
// and view/edit individual session dates tied to schedules.
// ──────────────────────────────────────────────────────────

const STATUS_STYLES = {
  Ongoing: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20',
  Completed: 'bg-blue-500/20 text-blue-400 border-blue-500/20',
};

const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
};

const formatTime = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
};

const toDateTimeLocal = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}T${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
};

// ── Session Detail Panel ──────────────────────────────────
function SessionPanel({ classId, classInfo, onClose, onClassUpdated }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingClass, setEditingClass] = useState(false);
  const [classForm, setClassForm] = useState({
    status: classInfo.status,
    totalSessions: classInfo.totalSessions,
  });
  const [savingClass, setSavingClass] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [sessionForm, setSessionForm] = useState({});
  const [savingSession, setSavingSession] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await schedulesAPI.getAll({ classId, limit: 200, sort: 'startTime' });
      const data = res.data?.data || res.data || [];
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Save class changes
  const handleSaveClass = async () => {
    setSavingClass(true);
    try {
      await classesAPI.update(classId, classForm);
      onClassUpdated();
      setEditingClass(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update class');
    } finally {
      setSavingClass(false);
    }
  };

  // Start editing a session
  const startEditSession = (session) => {
    setEditingSession(session._id);
    setSessionForm({
      startTime: toDateTimeLocal(session.startTime),
      endTime: toDateTimeLocal(session.endTime),
    });
  };

  // Save session date changes
  const handleSaveSession = async (sessionId) => {
    setSavingSession(true);
    try {
      await schedulesAPI.update(sessionId, {
        startTime: new Date(sessionForm.startTime).toISOString(),
        endTime: new Date(sessionForm.endTime).toISOString(),
      });
      setEditingSession(null);
      fetchSessions();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update session');
    } finally {
      setSavingSession(false);
    }
  };

  const progress = classInfo.totalSessions > 0
    ? Math.round((classInfo.bookedSessions / classInfo.totalSessions) * 100)
    : 0;

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-white">{classInfo.classCode}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[classInfo.status]}`}>
                  {classInfo.status}
                </span>
              </div>
              <p className="text-slate-400">{classInfo.courseName}</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-white text-xl transition-colors">✕</button>
          </div>

          {/* Class meta - editable */}
          <div className="mt-4 bg-muted border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-300">📊 Course Settings</h3>
              {!editingClass ? (
                <button onClick={() => setEditingClass(true)}
                  className="px-3 py-1 rounded-lg text-xs text-primary hover:bg-primary/10 transition-all">
                  ✏️ Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setEditingClass(false)}
                    className="px-3 py-1 rounded-lg text-xs text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
                  <button onClick={handleSaveClass} disabled={savingClass}
                    className="px-3 py-1 rounded-lg text-xs bg-primary/20 text-primary hover:bg-primary/30 transition-all disabled:opacity-50">
                    {savingClass ? 'Saving...' : '💾 Save'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Status</span>
                {editingClass ? (
                  <select value={classForm.status} onChange={e => setClassForm(p => ({ ...p, status: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="Ongoing" className="bg-slate-800">Ongoing</option>
                    <option value="Completed" className="bg-slate-800">Completed</option>
                  </select>
                ) : (
                  <div className={`mt-1 px-2.5 py-1.5 rounded-lg text-sm font-semibold border ${STATUS_STYLES[classInfo.status]}`}>
                    {classInfo.status}
                  </div>
                )}
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Total Sessions</span>
                {editingClass ? (
                  <input type="number" min={1} value={classForm.totalSessions}
                    onChange={e => setClassForm(p => ({ ...p, totalSessions: Number(e.target.value) }))}
                    className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                ) : (
                  <div className="mt-1 text-white text-lg font-bold">{classInfo.totalSessions}</div>
                )}
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Progress</span>
                <div className="mt-1 text-white text-lg font-bold">
                  {classInfo.bookedSessions} / {classInfo.totalSessions}
                  <span className="text-xs text-slate-500 ml-2">({progress}%)</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-blue-500' : progress >= 50 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(100, progress)}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto p-6 pt-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">
            📅 Sessions ({sessions.length})
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-10 text-center text-slate-500">No sessions scheduled yet</div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s, idx) => {
                const isEditing = editingSession === s._id;
                return (
                  <div key={s._id} className={`rounded-xl border transition-all ${
                    isEditing
                      ? 'bg-primary/10 border-primary/20'
                      : 'bg-muted border border-border border-white/5 hover:border-white/10'
                  }`}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Session number */}
                      <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                        {idx + 1}
                      </div>

                      {/* Date/time info */}
                      {isEditing ? (
                        <div className="flex-1 flex items-center gap-3">
                          <div className="flex-1">
                            <label className="text-[10px] text-slate-500">Start</label>
                            <input type="datetime-local" value={sessionForm.startTime}
                              onChange={e => setSessionForm(p => ({ ...p, startTime: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] text-slate-500">End</label>
                            <input type="datetime-local" value={sessionForm.endTime}
                              onChange={e => setSessionForm(p => ({ ...p, endTime: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm font-medium">
                            {formatDate(s.startTime)}
                          </div>
                          <div className="text-slate-400 text-xs">
                            {formatTime(s.startTime)} — {formatTime(s.endTime)}
                          </div>
                        </div>
                      )}

                      {/* Team */}
                      <div className="shrink-0 hidden sm:block">
                        <span className="text-[10px] text-purple-300 bg-purple-500/15 px-2 py-1 rounded-full">
                          👥 {s.bookedTeamId?.name || '—'}
                        </span>
                      </div>

                      {/* Enrolled count */}
                      <div className="shrink-0 text-center">
                        <div className="text-xs text-slate-500">Enrolled</div>
                        <div className="text-sm font-bold text-white">
                          {s.enrolledUsers?.length || s.enrolledCount || 0}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="shrink-0 flex gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={() => setEditingSession(null)}
                              className="px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-white/5 transition-all">
                              Cancel
                            </button>
                            <button onClick={() => handleSaveSession(s._id)} disabled={savingSession}
                              className="px-2.5 py-1.5 rounded-lg text-xs bg-primary/20 text-primary hover:bg-primary/30 transition-all disabled:opacity-50">
                              {savingSession ? '...' : '💾 Save'}
                            </button>
                          </>
                        ) : (
                          <button onClick={() => startEditSession(s)}
                            className="px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:text-primary hover:bg-primary/10 transition-all">
                            ✏️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}

// ── Main Course Manager ───────────────────────────────────
export default function CourseManager() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedClass, setSelectedClass] = useState(null);

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await classesAPI.getAll();
      setClasses(res.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchClasses(); }, [fetchClasses]);

  // Filtered & sorted
  const filtered = useMemo(() => {
    let result = classes;
    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.classCode?.toLowerCase().includes(q) ||
        c.courseName?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [classes, search, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    const ongoing = classes.filter(c => c.status === 'Ongoing').length;
    const completed = classes.filter(c => c.status === 'Completed').length;
    const totalSessions = classes.reduce((sum, c) => sum + (c.totalSessions || 0), 0);
    const bookedSessions = classes.reduce((sum, c) => sum + (c.bookedSessions || 0), 0);
    return { ongoing, completed, total: classes.length, totalSessions, bookedSessions };
  }, [classes]);

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">Total Classes</div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-emerald-400 mb-1">🟢 Ongoing</div>
          <div className="text-2xl font-bold text-emerald-300">{stats.ongoing}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-blue-400 mb-1">✅ Completed</div>
          <div className="text-2xl font-bold text-blue-300">{stats.completed}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-slate-500 mb-1">Total Sessions</div>
          <div className="text-2xl font-bold text-white">
            {stats.bookedSessions} <span className="text-sm text-slate-500">/ {stats.totalSessions}</span>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-card border border-border rounded-2xl px-5 py-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search class code or course name..."
            className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-sm">✕</button>
          )}
        </div>

        <div className="flex rounded-xl border border-white/10 overflow-hidden shrink-0">
          {['all', 'Ongoing', 'Completed'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-xs font-medium transition-all ${
                statusFilter === s ? 'bg-primary/20 text-primary' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              } ${s !== 'all' ? 'border-l border-white/10' : ''}`}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-500 shrink-0">{filtered.length} classes</div>
      </div>

      {/* Class table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-900/95 backdrop-blur-sm px-4 py-3 border-b border-white/10 text-left text-xs text-slate-400 font-semibold uppercase tracking-wider">Class</th>
                  <th className="px-4 py-3 border-b border-white/10 text-left text-xs text-slate-400 font-semibold uppercase tracking-wider">Course</th>
                  <th className="px-4 py-3 border-b border-white/10 text-center text-xs text-slate-400 font-semibold uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 border-b border-white/10 text-center text-xs text-slate-400 font-semibold uppercase tracking-wider">Sessions</th>
                  <th className="px-4 py-3 border-b border-white/10 text-center text-xs text-slate-400 font-semibold uppercase tracking-wider w-48">Progress</th>
                  <th className="px-4 py-3 border-b border-white/10 text-center text-xs text-slate-400 font-semibold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(c => {
                  const pct = c.totalSessions > 0 ? Math.round((c.bookedSessions / c.totalSessions) * 100) : 0;
                  return (
                    <tr key={c._id} className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                      onClick={() => setSelectedClass(c)}>
                      <td className="sticky left-0 z-10 bg-slate-900/95 backdrop-blur-sm px-4 py-3 border-r border-white/5">
                        <span className="font-mono font-bold text-primary">{c.classCode}</span>
                      </td>
                      <td className="px-4 py-3 text-white text-sm">{c.courseName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[c.status]}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-white font-bold">{c.bookedSessions}</span>
                        <span className="text-slate-500"> / {c.totalSessions}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-blue-500' : pct >= 50 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={e => { e.stopPropagation(); setSelectedClass(c); }}
                          className="px-3 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 transition-all">
                          📋 Sessions
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Session detail panel */}
      {selectedClass && (
        <SessionPanel
          classId={selectedClass._id}
          classInfo={selectedClass}
          onClose={() => setSelectedClass(null)}
          onClassUpdated={() => { setSelectedClass(null); fetchClasses(); }}
        />
      )}
    </div>
  );
}
