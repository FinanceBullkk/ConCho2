import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Portal from '../components/Portal';
import { useClasses, useCourses, useCreateClass, useUpdateClass, useDeleteClass } from '../hooks/useClasses';
import { useTeams } from '../hooks/useTeams';
import { useRole } from '../hooks/useRole';
import QueryError from '../components/QueryError';
import TableSkeleton from '../components/TableSkeleton';
import { Button } from '@/components/ui/button';
import { Spinner } from '../components/Spinner';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4 space-y-4 ">
        <h2 className="text-h3 text-foreground">🆕 Create New Cohort</h2>
        <p className="text-sm text-muted-foreground">A new class code (e.g. EL002) will be auto-generated.</p>
        {error && <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>}
        <div>
          <label className="block text-small text-muted-foreground mb-1">First Course</label>
          <select value={courseName} onChange={(e) => setCourseName(e.target.value)}
            className="w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors">
            {courseNames.map((c) => <option key={c} value={c} className="bg-popover">{c}</option>)}
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" disabled={createMutation.isPending} className="flex-1">
            {createMutation.isPending ? 'Creating...' : 'Create Cohort'}
          </Button>
        </div>
      </form>
    </div>
    </Portal>
  );
}

// ── Edit Class Modal ──────────────────────────────────────

function EditClassModal({ cls, onClose }) {
  const updateMutation = useUpdateClass();
  const deleteMutation = useDeleteClass();
  const [status, setStatus] = useState(cls.status);
  const [totalSessions, setTotalSessions] = useState(cls.totalSessions);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await updateMutation.mutateAsync({ id: cls._id, data: { status, totalSessions } });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Lưu thất bại');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await deleteMutation.mutateAsync(cls._id);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Xoá thất bại');
      setConfirmDelete(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4 space-y-4 ">
          <div>
            <h2 className="text-h3 text-foreground">
              ✏️ Chỉnh sửa lớp
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              <span className="font-mono text-primary">{cls.classCode}</span>
              <span className="text-subtle-foreground mx-1.5">·</span>
              {cls.courseName}
            </p>
          </div>

          {error && <div className="px-4 py-2 rounded-md bg-destructive-tint border border-destructive/30 text-destructive text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-small text-muted-foreground mb-1">Trạng thái</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors">
                <option value="Ongoing" className="bg-popover">🟢 Đang học</option>
                <option value="Completed" className="bg-popover">✓ Đã hoàn thành</option>
              </select>
            </div>
            <div>
              <label className="block text-small text-muted-foreground mb-1">Tổng số buổi</label>
              <input type="number" value={totalSessions} onChange={(e) => setTotalSessions(Number(e.target.value))} min={1}
                className="w-full px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between">
            <Link to={`/classes/${cls._id}`}
              className="text-xs text-subtle-foreground hover:text-primary transition-colors flex items-center gap-1">
              Xem chi tiết (Sessions, Roster...) →
            </Link>
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending} className="py-2.5 px-4 text-sm font-semibold">
              {deleteMutation.isPending ? 'Đang xoá...' : confirmDelete ? '⚠ Xác nhận xoá?' : 'Xoá'}
            </Button>
            {!confirmDelete && (
              <>
                <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                  Huỷ
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} className="flex-1">
                  {updateMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                </Button>
              </>
            )}
            {confirmDelete && (
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} className="flex-1">
                Không xoá
              </Button>
            )}
          </div>
        </form>
      </div>
    </Portal>
  );
}

// ── Main Page ─────────────────────────────────────────────

export default function ClassesPage() {
  const { can } = useRole();
  const canCreate = can('create:class');
  const canEdit = can('update:class');
  const [cohortModal, setCohortModal] = useState(false);
  const [editModal, setEditModal] = useState(null); // class object to edit
  const [creating, setCreating] = useState(null);

  // ── URL-synced filters (Sprint follow-up) ─────────────
  // Keeps the user's search/status filter in the URL so refresh / share
  // preserves their view — same UX pattern as UsersPage.
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('q') || '';
  const statusFilter = searchParams.get('status') || '';
  const setParam = (key, val) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set(key, val); else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const { data: classes = [], isLoading: loadingClasses, isError: classesError, error: classesErrorObj, refetch: refetchClasses } = useClasses();
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

  // ── Filter classes by search + status ─────────────────
  const filteredClasses = useMemo(() => {
    const q = search.toLowerCase().trim();
    return classes.filter(c => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (!q) return true;
      const code = (c.classCode || '').toLowerCase();
      const course = (c.courseName || '').toLowerCase();
      const team = teamByClassCode[c.classCode];
      const teamName = (team?.name || '').toLowerCase();
      return code.includes(q) || course.includes(q) || teamName.includes(q);
    });
  }, [classes, search, statusFilter, teamByClassCode]);

  // ── Build matrix data from filtered set ───────────────
  const { classCodes, classMap } = useMemo(() => {
    const codeSet = new Set();
    const map = {}; // "EL001|Communication 1" → class doc
    for (const c of filteredClasses) {
      codeSet.add(c.classCode);
      map[`${c.classCode}|${c.courseName}`] = c;
    }
    return {
      classCodes: [...codeSet].sort(),
      classMap: map,
    };
  }, [filteredClasses]);

  const hasActiveFilter = !!(search || statusFilter);
  const clearFilters = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    next.delete('status');
    setSearchParams(next, { replace: true });
  };

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
    <div className="space-y-6 ">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-foreground">Class Management</h1>
          <p className="text-muted-foreground mt-1">
            {classCodes.length} cohort{classCodes.length !== 1 ? 's' : ''}
            {hasActiveFilter && ` (filtered from ${new Set(classes.map(c => c.classCode)).size})`}
            {' · '}{filteredClasses.length} class{filteredClasses.length !== 1 ? 'es' : ''}
            {hasActiveFilter && ` of ${classes.length}`}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCohortModal(true)} className="self-start">
            + New Cohort
          </Button>
        )}
      </div>

      {/* ── Search & Filter Bar ───────────────────────────── */}
      <div className="bg-card border border-border rounded-lg px-5 py-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setParam('q', e.target.value)}
            placeholder="Search by class code, course, or team..."
            aria-label="Search classes"
            className="w-full pl-10 pr-4 py-2 rounded-md bg-background border border-input text-foreground text-sm placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setParam('status', e.target.value)}
          aria-label="Filter by status"
          className="px-3 h-[--control-h] rounded-md bg-background border border-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
        >
          <option value="" className="bg-popover">Tất cả</option>
          <option value="Ongoing" className="bg-popover">🟢 Đang học</option>
          <option value="Completed" className="bg-popover">✓ Đã hoàn thành</option>
        </select>
        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 rounded-md bg-accent border border-border text-muted-foreground text-sm hover:bg-accent/80 transition-all"
          >
            ✕ Clear
          </button>
        )}
        <button onClick={refetchClasses} className="ml-auto px-3 py-2 rounded-md bg-accent border border-border text-muted-foreground text-sm hover:bg-accent/80 transition-all">
          ↻ Refresh
        </button>
      </div>

      {/* ── Matrix Table ──────────────────────────────────── */}
      {loading ? (
        <div className="bg-card border border-border rounded-lg p-6"><TableSkeleton rows={6} cols={5} /></div>
      ) : classesError ? (
        <div className="bg-card border border-border rounded-lg"><QueryError error={classesErrorObj} onRetry={refetchClasses} /></div>
      ) : classCodes.length === 0 ? (
        <div className="bg-card border border-border rounded-lg py-16 text-center">
          <div className="text-4xl mb-4">{hasActiveFilter ? '🔍' : '📭'}</div>
          {hasActiveFilter ? (
            <>
              <p className="text-muted-foreground">No cohorts match your filters.</p>
              <button onClick={clearFilters} className="mt-3 px-4 py-2 rounded-md bg-primary/15 text-primary text-sm hover:bg-primary/30 transition-all">
                Clear filters
              </button>
            </>
          ) : (
            <p className="text-muted-foreground">No cohorts yet. Click "+ New Cohort" to get started.</p>
          )}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-card px-4 py-3 border-b border-r border-border text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider w-28">
                    Code
                  </th>
                  {courseNames.map((course) => (
                    <th key={course} className="px-3 py-3 border-b border-border text-center text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                      {SHORT_NAMES[course] || course}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {classCodes.map((code) => (
                  <tr key={code} className="hover:bg-muted/20 transition-colors">
                    {/* Row header — Class Code + Team Name */}
                    <td className="sticky left-0 z-10 bg-card px-4 py-3 border-r border-border">
                      <span className="font-mono font-bold text-primary text-sm">{code}</span>
                      {teamByClassCode[code] ? (
                        <div className="text-[11px] text-subtle-foreground mt-0.5 truncate max-w-[120px]" title={teamByClassCode[code].name}>
                          👥 {teamByClassCode[code].name}
                        </div>
                      ) : (
                        <div className="text-[11px] text-subtle-foreground mt-0.5 italic">No team</div>
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
                        const hasTeam = !!teamByClassCode[code];
                        const showWarning = noSessions && !hasTeam;
                        const barColor = isComplete
                          ? 'bg-muted-foreground'
                          : pct >= 80 ? 'bg-warning' : 'bg-success';

                        return (
                          <td key={course} className="px-2 py-2 text-center">
                            <button
                              onClick={() => canEdit ? setEditModal(cls) : undefined}
                              title={canEdit ? 'Click để chỉnh sửa' : showWarning ? 'Chưa có nhóm' : undefined}
                              className={`w-full rounded-md px-3 py-2.5 transition-all text-left ${
                                showWarning
                                  ? 'bg-warning/10 border border-warning/30 hover:border-warning/50'
                                  : isComplete
                                  ? 'bg-muted border border-border hover:border-muted-foreground/30'
                                  : 'bg-success/10 border border-success/15 hover:border-success/30'
                              }`}
                            >
                              {/* Status badge */}
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                showWarning
                                  ? 'bg-warning/20 text-warning'
                                  : isComplete
                                  ? 'bg-muted text-muted-foreground'
                                  : 'bg-success/20 text-success'
                              }`}>
                                {showWarning ? '⚠️ No team' : cls.status}
                              </span>

                              {/* Session progress */}
                              <div className="mt-2 flex items-baseline gap-1">
                                <span className="text-lg font-bold text-foreground">{cls.bookedSessions}</span>
                                <span className="text-xs text-subtle-foreground">/ {cls.totalSessions}</span>
                              </div>

                              {/* Progress bar */}
                              <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                            </button>
                          </td>
                        );
                      }

                      // ── Empty cell — click to create (Admin only) ──────
                      return (
                        <td key={course} className="px-2 py-2 text-center">
                          {canCreate ? (
                            <button
                              onClick={() => handleQuickCreate(code, course)}
                              disabled={isCreating}
                              className="w-full rounded-md px-3 py-4 border border-dashed border-border hover:border-primary/30 hover:bg-primary/5 transition-all group disabled:opacity-50"
                            >
                              {isCreating ? (
                                <Spinner size={16} className="mx-auto" />
                              ) : (
                                <span className="text-subtle-foreground group-hover:text-primary text-lg transition-colors">+</span>
                              )}
                            </button>
                          ) : (
                            <div className="w-full rounded-md px-3 py-4 border border-dashed border-border text-subtle-foreground text-xs italic">—</div>
                          )}
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
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-success/15 border border-success/20" />
          <span>Ongoing (click to open)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded bg-muted border border-border" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded border border-dashed border-border" />
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
      {editModal && (
        <EditClassModal
          cls={editModal}
          onClose={() => setEditModal(null)}
        />
      )}

    </div>
  );
}
