import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { classesAPI, teamsAPI } from '../api/api';

// ──────────────────────────────────────────────────────────
// Classes Page (v2 — Matrix View)
// ──────────────────────────────────────────────────────────
// Rows = Class Codes (Cohorts): EL001, EL002, …
// Cols = Fixed Course Names: Foundation → Business English
// Cells = Class record (status + session progress) or "+"
// ──────────────────────────────────────────────────────────

const COURSE_ORDER = [
  'Foundation',
  'Extension of Foundation',
  'Communication 1',
  'Communication 2',
  'Communication 3',
  'Business English',
];

const SHORT_NAMES = {
  'Foundation': 'Found.',
  'Extension of Foundation': 'Ext. Found.',
  'Communication 1': 'Comm 1',
  'Communication 2': 'Comm 2',
  'Communication 3': 'Comm 3',
  'Business English': 'Biz Eng',
};

// ── New Cohort Modal ──────────────────────────────────────

function NewCohortModal({ courseNames, onClose, onSaved }) {
  const [courseName, setCourseName] = useState(courseNames[0] || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      // classCode omitted → backend auto-generates next ELxxx
      await classesAPI.create({ courseName });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create cohort');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-md mx-4 space-y-4 animate-fade-in">
        <h2 className="text-lg font-bold text-white">🆕 Create New Cohort</h2>
        <p className="text-sm text-slate-400">A new class code (e.g. EL002) will be auto-generated.</p>
        {error && <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}
        <div>
          <label className="block text-sm text-slate-300 mb-1">First Course</label>
          <select value={courseName} onChange={(e) => setCourseName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
            {courseNames.map((c) => <option key={c} value={c} className="bg-slate-800">{c}</option>)}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold disabled:opacity-50 transition-all">
            {saving ? 'Creating...' : 'Create Cohort'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Edit Class Modal ──────────────────────────────────────

function EditClassModal({ cls, team, onClose, onSaved, onDeleted, onNavigate }) {
  const [status, setStatus] = useState(cls.status);
  const [totalSessions, setTotalSessions] = useState(cls.totalSessions);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await classesAPI.update(cls._id, { status, totalSessions });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true); setError('');
    try {
      await classesAPI.delete(cls._id);
      onDeleted();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
      setConfirmDelete(false);
    } finally { setDeleting(false); }
  };

  const pct = cls.totalSessions > 0 ? Math.round((cls.bookedSessions / cls.totalSessions) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="glass rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-white">📚 {cls.classCode} — {cls.courseName}</h2>
        {error && <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        {/* ── Progress Card ──────────────────────────── */}
        <div className="bg-white/5 rounded-xl p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Session Progress</span>
            <span className="text-white font-semibold">{cls.bookedSessions} / {cls.totalSessions}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-primary-400' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        </div>

        {/* ── Team Info Card ──────────────────────────── */}
        <div className="bg-white/5 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Assigned Team</span>
          </div>
          {team ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-primary-500 flex items-center justify-center text-sm">👥</div>
                <div>
                  <div className="text-sm font-bold text-white">{team.name}</div>
                  <div className="text-xs text-slate-400">
                    Leader: {team.leaderId?.name || 'N/A'} · {team.members?.length || 0} member{(team.members?.length || 0) !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => onNavigate('/people')}
                  className="flex-1 py-2 rounded-lg bg-purple-500/10 text-purple-300 text-xs font-semibold border border-purple-500/20 hover:bg-purple-500/20 transition-all">
                  👥 Manage Team
                </button>
                <button onClick={() => onNavigate('/people')}
                  className="flex-1 py-2 rounded-lg bg-primary-500/10 text-primary-300 text-xs font-semibold border border-primary-500/20 hover:bg-primary-500/20 transition-all">
                  📋 Enrollment
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 italic">No team assigned to this class.</p>
          )}
        </div>

        {/* ── Edit Form ───────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all">
              <option value="Ongoing" className="bg-slate-800">Ongoing</option>
              <option value="Completed" className="bg-slate-800">Completed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">Total Sessions</label>
            <input type="number" value={totalSessions} onChange={(e) => setTotalSessions(Number(e.target.value))} min={1}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={handleDelete} disabled={deleting}
              className={`py-2.5 px-4 rounded-xl border transition-all text-sm font-semibold ${
                confirmDelete
                  ? 'bg-red-500/30 text-red-300 border-red-500/40 hover:bg-red-500/40'
                  : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
              }`}>
              {deleting ? 'Deleting...' : confirmDelete ? '⚠ Confirm Delete?' : 'Delete'}
            </button>
            {confirmDelete && (
              <button type="button" onClick={() => setConfirmDelete(false)}
                className="py-2.5 px-3 rounded-xl text-slate-400 text-sm hover:bg-white/5 transition-all">
                No
              </button>
            )}
            {!confirmDelete && (
              <>
                <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 transition-all">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold disabled:opacity-50 transition-all">
                  {saving ? 'Saving...' : 'Update'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────

export default function ClassesPage() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [teams, setTeams] = useState([]);
  const [courseNames, setCourseNames] = useState(COURSE_ORDER);
  const [loading, setLoading] = useState(true);
  const [cohortModal, setCohortModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [creating, setCreating] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, metaRes, tRes] = await Promise.all([
        classesAPI.getAll(),
        classesAPI.getCourses(),
        teamsAPI.getAll(),
      ]);
      setClasses(cRes.data.data);
      setCourseNames(metaRes.data.data.courseNames);
      setTeams(tRes.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { document.title = 'TMS — Classes'; }, []);

  // Build classCode → team lookup (team owns the entire cohort)
  const teamByClassCode = useMemo(() => {
    const map = {};
    for (const t of teams) {
      const classCode = t.classId?.classCode;
      if (classCode) map[classCode] = t;
    }
    return map;
  }, [teams]);

  // ── Build matrix data ─────────────────────────────────
  const { classCodes, classMap } = useMemo(() => {
    const codeSet = new Set();
    const map = {}; // "EL001|Communication 1" → class doc
    for (const c of classes) {
      codeSet.add(c.classCode);
      map[`${c.classCode}|${c.courseName}`] = c;
    }
    return {
      classCodes: [...codeSet].sort(),
      classMap: map,
    };
  }, [classes]);

  // ── Quick-create a class for a specific cell ──────────
  const handleQuickCreate = async (classCode, courseName) => {
    const key = `${classCode}|${courseName}`;
    setCreating(key);
    try {
      await classesAPI.create({ classCode, courseName });
      load();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create class');
    } finally { setCreating(null); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">📚 Class Management</h1>
          <p className="text-slate-400 mt-1">
            {classCodes.length} cohorts · {classes.length} classes total
          </p>
        </div>
        <button onClick={() => setCohortModal(true)}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold hover:from-primary-500 hover:to-primary-400 transition-all shadow-lg shadow-primary-500/20 self-start">
          + New Cohort
        </button>
      </div>

      {/* ── Matrix Table ──────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : classCodes.length === 0 ? (
        <div className="glass rounded-2xl py-16 text-center">
          <div className="text-4xl mb-4">📭</div>
          <p className="text-slate-400">No cohorts yet. Click "+ New Cohort" to get started.</p>
        </div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-900/95 backdrop-blur-sm px-4 py-3 border-b border-r border-white/10 text-left text-xs text-slate-400 font-semibold uppercase tracking-wider w-28">
                    Code
                  </th>
                  {courseNames.map((course) => (
                    <th key={course} className="px-3 py-3 border-b border-white/10 text-center text-xs text-slate-400 font-semibold uppercase tracking-wider">
                      {SHORT_NAMES[course] || course}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {classCodes.map((code) => (
                  <tr key={code} className="hover:bg-white/[0.02] transition-colors">
                    {/* Row header — Class Code + Team Name */}
                    <td className="sticky left-0 z-10 bg-slate-900/95 backdrop-blur-sm px-4 py-3 border-r border-white/10">
                      <span className="font-mono font-bold text-primary-300 text-sm">{code}</span>
                      {teamByClassCode[code] ? (
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[120px]" title={teamByClassCode[code].name}>
                          👥 {teamByClassCode[code].name}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-600 mt-0.5 italic">No team</div>
                      )}
                    </td>

                    {/* Course cells */}
                    {courseNames.map((course) => {
                      const key = `${code}|${course}`;
                      const cls = classMap[key];
                      const isCreating = creating === key;

                      if (cls) {
                        // ── Existing class cell ──────────────
                        const pct = cls.totalSessions > 0
                          ? Math.round((cls.bookedSessions / cls.totalSessions) * 100)
                          : 0;
                        const isComplete = cls.status === 'Completed';
                        const barColor = isComplete
                          ? 'bg-slate-500'
                          : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

                        return (
                          <td key={course} className="px-2 py-2 text-center">
                            <button
                              onClick={() => setEditModal(cls)}
                              className={`w-full rounded-xl px-3 py-2.5 transition-all text-left hover:scale-[1.02] ${
                                isComplete
                                  ? 'bg-slate-500/10 border border-slate-500/15 hover:border-slate-400/30'
                                  : 'bg-emerald-500/10 border border-emerald-500/15 hover:border-emerald-400/30'
                              }`}
                            >
                              {/* Status badge */}
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                isComplete
                                  ? 'bg-slate-500/20 text-slate-400'
                                  : 'bg-emerald-500/20 text-emerald-400'
                              }`}>
                                {cls.status}
                              </span>

                              {/* Session progress */}
                              <div className="mt-2 flex items-baseline gap-1">
                                <span className="text-lg font-bold text-white">{cls.bookedSessions}</span>
                                <span className="text-xs text-slate-500">/ {cls.totalSessions}</span>
                              </div>

                              {/* Progress bar */}
                              <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                            </button>
                          </td>
                        );
                      }

                      // ── Empty cell — click to create ──────
                      return (
                        <td key={course} className="px-2 py-2 text-center">
                          <button
                            onClick={() => handleQuickCreate(code, course)}
                            disabled={isCreating}
                            className="w-full rounded-xl px-3 py-4 border border-dashed border-white/10 hover:border-primary-400/30 hover:bg-primary-500/5 transition-all group disabled:opacity-50"
                          >
                            {isCreating ? (
                              <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mx-auto" />
                            ) : (
                              <span className="text-slate-600 group-hover:text-primary-400 text-lg transition-colors">+</span>
                            )}
                          </button>
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

      {/* ── Legend ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-emerald-500/15 border border-emerald-500/20" />
          <span>Ongoing (click to edit)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-slate-500/15 border border-slate-500/20" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded border border-dashed border-white/15" />
          <span>Not started — click + to create</span>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}
      {cohortModal && (
        <NewCohortModal
          courseNames={courseNames}
          onClose={() => setCohortModal(false)}
          onSaved={() => { setCohortModal(false); load(); }}
        />
      )}

      {editModal && (
        <EditClassModal
          cls={editModal}
          team={teamByClassCode[editModal.classCode]}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); load(); }}
          onDeleted={() => { setEditModal(null); load(); }}
          onNavigate={(path) => { setEditModal(null); navigate(path); }}
        />
      )}
    </div>
  );
}
