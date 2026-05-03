import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Portal from '../components/Portal';
import { useClasses, useCourses, useCreateClass } from '../hooks/useClasses';
import { useTeams } from '../hooks/useTeams';

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
  const createMutation = useCreateClass();
  const [courseName, setCourseName] = useState(courseNames[0] || '');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createMutation.mutateAsync({ courseName });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create cohort');
    }
  };

  return (
    <Portal>
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
          <button type="submit" disabled={createMutation.isPending} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 text-white font-semibold disabled:opacity-50 transition-all">
            {createMutation.isPending ? 'Creating...' : 'Create Cohort'}
          </button>
        </div>
      </form>
    </div>
    </Portal>
  );
}

// ── Main Page ─────────────────────────────────────────────

export default function ClassesPage() {
  const navigate = useNavigate();
  const [cohortModal, setCohortModal] = useState(false);
  const [creating, setCreating] = useState(null);

  const { data: classes = [], isLoading: loadingClasses } = useClasses();
  const { data: courseMeta } = useCourses();
  const { data: teams = [], isLoading: loadingTeams } = useTeams();

  const courseNames = courseMeta?.courseNames || COURSE_ORDER;
  const loading = loadingClasses || loadingTeams;

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

  const quickCreateMutation = useCreateClass();

  // ── Quick-create a class for a specific cell ──────────
  const handleQuickCreate = async (classCode, courseName) => {
    const key = `${classCode}|${courseName}`;
    setCreating(key);
    try {
      await quickCreateMutation.mutateAsync({ classCode, courseName });
    } catch { /* toast shown by global onError */ }
    finally { setCreating(null); }
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
                        const noSessions = cls.bookedSessions === 0;
                        const barColor = isComplete
                          ? 'bg-slate-500'
                          : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

                        return (
                          <td key={course} className="px-2 py-2 text-center">
                            <button
                              onClick={() => navigate(`/classes/${cls._id}`)}
                              title={noSessions ? 'No schedules — likely missing team assignment' : undefined}
                              className={`w-full rounded-xl px-3 py-2.5 transition-all text-left hover:scale-[1.02] ${
                                noSessions
                                  ? 'bg-amber-500/10 border border-amber-500/30 hover:border-amber-400/50'
                                  : isComplete
                                  ? 'bg-slate-500/10 border border-slate-500/15 hover:border-slate-400/30'
                                  : 'bg-emerald-500/10 border border-emerald-500/15 hover:border-emerald-400/30'
                              }`}
                            >
                              {/* Status badge */}
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                noSessions
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : isComplete
                                  ? 'bg-slate-500/20 text-slate-400'
                                  : 'bg-emerald-500/20 text-emerald-400'
                              }`}>
                                {noSessions ? '⚠️ No team' : cls.status}
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
          <span>Ongoing (click to open)</span>
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
          onSaved={() => setCohortModal(false)}
        />
      )}

    </div>
  );
}
