import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { classesAPI, schedulesAPI } from '../api/api';
import Portal from '../components/Portal';
import { Spinner } from '../components/Spinner';
import { FilterBar } from '../components/FilterBar';
import { StatusChips } from '../components/StatusChips';
import { ActiveFilterChips } from '../components/ActiveFilterChips';
import { Button } from '@/components/ui/button';
import { useListUrlState } from '../hooks/useListUrlState';

// ──────────────────────────────────────────────────────────
// Course Manager — Admin class/session editor
// ──────────────────────────────────────────────────────────
// Focused view to manage classes: status, totalSessions,
// and view/edit individual session dates tied to schedules.
// ──────────────────────────────────────────────────────────

const STATUS_STYLES = {
  Ongoing: 'bg-success/20 text-success border-success/20',
  Completed: 'bg-info/20 text-info border-info/20',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose} aria-hidden="true">
      <div className="bg-card border border-border rounded-lg w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-foreground">{classInfo.classCode}</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[classInfo.status]}`}>
                  {classInfo.status}
                </span>
              </div>
              <p className="text-muted-foreground">{classInfo.courseName}</p>
            </div>
            <button onClick={onClose} className="text-subtle-foreground hover:text-foreground text-xl transition-colors">✕</button>
          </div>

          {/* Class meta - editable */}
          <div className="mt-4 bg-muted border border-border rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-muted-foreground">📊 Course Settings</h3>
              {!editingClass ? (
                <button onClick={() => setEditingClass(true)}
                  className="px-3 py-1 rounded-lg text-xs text-primary hover:bg-primary/10 transition-all">
                  ✏️ Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setEditingClass(false)}
                    className="px-3 py-1 rounded-lg text-xs text-muted-foreground hover:bg-accent transition-all">Cancel</button>
                  <button onClick={handleSaveClass} disabled={savingClass}
                    className="px-3 py-1 rounded-lg text-xs bg-primary/15 text-primary hover:bg-primary/30 transition-all disabled:opacity-50">
                    {savingClass ? 'Saving...' : '💾 Save'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <span className="text-[10px] text-subtle-foreground uppercase tracking-wider">Status</span>
                {editingClass ? (
                  <select value={classForm.status} onChange={e => setClassForm(p => ({ ...p, status: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-md bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors">
                    <option value="Ongoing" className="bg-popover">Ongoing</option>
                    <option value="Completed" className="bg-popover">Completed</option>
                  </select>
                ) : (
                  <div className={`mt-1 px-2.5 py-1.5 rounded-lg text-sm font-semibold border ${STATUS_STYLES[classInfo.status]}`}>
                    {classInfo.status}
                  </div>
                )}
              </div>
              <div>
                <span className="text-[10px] text-subtle-foreground uppercase tracking-wider">Total Sessions</span>
                {editingClass ? (
                  <input type="number" min={1} value={classForm.totalSessions}
                    onChange={e => setClassForm(p => ({ ...p, totalSessions: Number(e.target.value) }))}
                    className="mt-1 w-full px-3 py-2 rounded-md bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
                ) : (
                  <div className="mt-1 text-foreground text-lg font-bold">{classInfo.totalSessions}</div>
                )}
              </div>
              <div>
                <span className="text-[10px] text-subtle-foreground uppercase tracking-wider">Progress</span>
                <div className="mt-1 text-foreground text-lg font-bold">
                  {classInfo.bookedSessions} / {classInfo.totalSessions}
                  <span className="text-xs text-subtle-foreground ml-2">({progress}%)</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-info' : progress >= 50 ? 'bg-success' : 'bg-warning'}`}
                    style={{ width: `${Math.min(100, progress)}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto p-6 pt-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
            📅 Sessions ({sessions.length})
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner size={24} />
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-10 text-center text-subtle-foreground">No sessions scheduled yet</div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s, idx) => {
                const isEditing = editingSession === s._id;
                return (
                  <div key={s._id} className={`rounded-md border transition-all ${
                    isEditing
                      ? 'bg-primary/10 border-primary/20'
                      : 'bg-muted border border-border hover:border-border'
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
                            <label className="text-[10px] text-subtle-foreground">Start</label>
                            <input type="datetime-local" value={sessionForm.startTime}
                              onChange={e => setSessionForm(p => ({ ...p, startTime: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-md bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] text-subtle-foreground">End</label>
                            <input type="datetime-local" value={sessionForm.endTime}
                              onChange={e => setSessionForm(p => ({ ...p, endTime: e.target.value }))}
                              className="w-full px-2 py-1.5 rounded-md bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <div className="text-foreground text-sm font-medium">
                            {formatDate(s.startTime)}
                          </div>
                          <div className="text-muted-foreground text-xs">
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
                        <div className="text-xs text-subtle-foreground">Enrolled</div>
                        <div className="text-sm font-bold text-foreground">
                          {s.enrolledUsers?.length || s.enrolledCount || 0}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="shrink-0 flex gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={() => setEditingSession(null)}
                              className="px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-accent transition-all">
                              Cancel
                            </button>
                            <button onClick={() => handleSaveSession(s._id)} disabled={savingSession}
                              className="px-2.5 py-1.5 rounded-lg text-xs bg-primary/15 text-primary hover:bg-primary/30 transition-all disabled:opacity-50">
                              {savingSession ? '...' : '💾 Save'}
                            </button>
                          </>
                        ) : (
                          <button onClick={() => startEditSession(s)}
                            className="px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all">
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
  const [selectedClass, setSelectedClass] = useState(null);

  // URL-synced filter state (Phase 3 Screen 5 §F).
  const list = useListUrlState();
  const search = list.debouncedSearch;
  const statusFilter = list.status || 'all';

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
        <div className="bg-card border border-border rounded-md p-4">
          <div className="text-xs text-subtle-foreground mb-1">Total Classes</div>
          <div className="text-h1 text-foreground">{stats.total}</div>
        </div>
        <div className="bg-card border border-border rounded-md p-4">
          <div className="text-xs text-success mb-1">🟢 Ongoing</div>
          <div className="text-2xl font-bold text-success">{stats.ongoing}</div>
        </div>
        <div className="bg-card border border-border rounded-md p-4">
          <div className="text-xs text-info mb-1">✅ Completed</div>
          <div className="text-2xl font-bold text-info">{stats.completed}</div>
        </div>
        <div className="bg-card border border-border rounded-md p-4">
          <div className="text-xs text-subtle-foreground mb-1">Total Sessions</div>
          <div className="text-h1 text-foreground">
            {stats.bookedSessions} <span className="text-sm text-subtle-foreground">/ {stats.totalSessions}</span>
          </div>
        </div>
      </div>

      {/* Search + filters (canonical FilterBar) */}
      <FilterBar
        search={list.search}
        onSearch={list.setSearch}
        searchPlaceholder="Search by class code or course name…"
      >
        <Button variant="outline" size="sm" onClick={fetchClasses} aria-label="Refresh">
          <RefreshCw className="size-3.5 mr-1.5" />Refresh
        </Button>
        <span className="text-xs text-subtle-foreground tabular-nums">{filtered.length} classes</span>
      </FilterBar>

      <div className="flex flex-wrap items-center gap-3">
        <StatusChips
          value={list.status}
          onChange={list.setStatus}
          options={[
            { value: '',          label: 'All' },
            { value: 'Ongoing',   label: 'Ongoing' },
            { value: 'Completed', label: 'Completed' },
          ]}
        />
        {list.hasActiveFilters && (
          <ActiveFilterChips
            filters={list.search ? [{ key: 'q', label: `Search: ${list.search}`, onRemove: () => list.setSearch('') }] : []}
            onClearAll={list.clearAll}
          />
        )}
      </div>

      {/* Class table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size={28} />
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-card px-4 py-3 border-b border-border text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Class</th>
                  <th className="px-4 py-3 border-b border-border text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Course</th>
                  <th className="px-4 py-3 border-b border-border text-center text-xs text-muted-foreground font-semibold uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 border-b border-border text-center text-xs text-muted-foreground font-semibold uppercase tracking-wider">Sessions</th>
                  <th className="px-4 py-3 border-b border-border text-center text-xs text-muted-foreground font-semibold uppercase tracking-wider w-48">Progress</th>
                  <th className="px-4 py-3 border-b border-border text-center text-xs text-muted-foreground font-semibold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(c => {
                  const pct = c.totalSessions > 0 ? Math.round((c.bookedSessions / c.totalSessions) * 100) : 0;
                  return (
                    <tr key={c._id} className="hover:bg-muted/20 transition-colors cursor-pointer"
                      onClick={() => setSelectedClass(c)}>
                      <td className="sticky left-0 z-10 bg-card px-4 py-3 border-r border-border">
                        <span className="font-mono font-bold text-primary">{c.classCode}</span>
                      </td>
                      <td className="px-4 py-3 text-foreground text-sm">{c.courseName}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[c.status]}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-foreground font-bold">{c.bookedSessions}</span>
                        <span className="text-subtle-foreground"> / {c.totalSessions}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-info' : pct >= 50 ? 'bg-success' : 'bg-warning'}`}
                              style={{ width: `${Math.min(100, pct)}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
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
