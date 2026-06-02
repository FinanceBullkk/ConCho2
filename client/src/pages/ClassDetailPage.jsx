import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  ClipboardList, CalendarDays, Users, BarChart3,
  BookOpen, AlertTriangle, Pencil, ArrowLeft, Users2,
  Search, MoreHorizontal, X as XIcon,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { PageHeader } from '@/components/PageHeader';
import { KPICard } from '@/components/KPICard';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { useClass, useUpdateClass, useDeleteClass } from '../hooks/useClasses';
import { useTeams } from '../hooks/useTeams';
import { useSchedules } from '../hooks/useSchedules';
import { useEnrollments } from '../hooks/useEnrollments';
import { useAttendanceAnalyticsByClass } from '../hooks/useAttendance';
import { useRole } from '../hooks/useRole';
import { EnrollmentDrawer } from '../components/EnrollmentDrawer';
import { ScheduleDrawer } from '../components/ScheduleDrawer';
import { useClasses } from '../hooks/useClasses';
import { Spinner } from '../components/Spinner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// ClassDetailPage — Phase 3 Screen 4
//
// Single landing page for everything class-related.
// Folds EnrollmentPage (deleted in earlier phase) into Roster tab.
//
// Anatomy:
//   1. Breadcrumb  ─ Programs › Classes › {code}
//   2. PageHeader  ─ classCode + courseName + status + edit
//   3. KPI strip   ─ Enrolled · Attendance · Sessions (3 cards)
//   4. Tabs        ─ Overview · Roster · Schedules · Attendance (URL: ?tab=…)
//   5. Tab body
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',   label: 'Overview',   icon: ClipboardList },
  { id: 'roster',     label: 'Roster',     icon: Users         },
  { id: 'schedules',  label: 'Schedules',  icon: CalendarDays  },
  { id: 'attendance', label: 'Attendance', icon: BarChart3     },
];

const fmtDate = (d) => new Date(d).toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });

// ──────────────────────────────────────────────────────────
// Edit Modal (kept simple — Edit/Status/Sessions count/Delete)
// ──────────────────────────────────────────────────────────
function EditClassModal({ cls, onClose }) {
  const navigate = useNavigate();
  const updateMutation = useUpdateClass();
  const deleteMutation = useDeleteClass();
  const [status, setStatus] = useState(cls.status);
  const [totalSessions, setTotalSessions] = useState(cls.totalSessions);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      await updateMutation.mutateAsync({ id: cls._id, data: { status, totalSessions } });
      onClose();
    } catch (err) { setError(err.response?.data?.message || 'Update failed'); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setError('');
    try {
      await deleteMutation.mutateAsync(cls._id);
      navigate('/learning?tab=cohorts');
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
      setConfirmDelete(false);
    }
  };

  // Audit PR S (FE-010): Radix Dialog — focus-trap, ESC, ARIA.
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md p-6 space-y-4" aria-label={`Edit class ${cls.classCode}`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <Pencil className="size-4" /> Edit {cls.classCode}
            </DialogTitle>
          </DialogHeader>
          {error && <div className="px-4 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>}
          <div>
            <label className="block text-small text-muted-foreground mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 h-(--control-h) rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors">
              <option value="Ongoing">Ongoing</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="block text-small text-muted-foreground mb-1">Total Sessions</label>
            <input type="number" value={totalSessions} onChange={(e) => setTotalSessions(Number(e.target.value))} min={1}
              className="w-full px-3 h-(--control-h) rounded-md bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting...' : confirmDelete ? '⚠ Confirm?' : 'Delete'}
            </Button>
            {!confirmDelete && (
              <>
                <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
                <Button type="submit" disabled={updateMutation.isPending} className="flex-1">
                  {updateMutation.isPending ? 'Saving...' : 'Update'}
                </Button>
              </>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────
// Tab 1 · Overview — metadata grid + assigned team card
// ──────────────────────────────────────────────────────────
function OverviewTab({ cls, team }) {
  const isComplete = cls.status === 'Completed';
  const noSessions = cls.bookedSessions === 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Class metadata */}
      <div className="bg-card border border-border rounded-lg p-5 lg:col-span-2 space-y-3">
        <h3 className="text-overline text-subtle-foreground font-semibold">Class information</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
          <Field label="Code"><span className="font-mono font-bold text-primary">{cls.classCode}</span></Field>
          <Field label="Course">{cls.courseName}</Field>
          <Field label="Status"><StatusBadge status={cls.status} size="sm" /></Field>
          <Field label="Total sessions"><span className="tabular-nums">{cls.totalSessions}</span></Field>
          <Field label="Booked sessions"><span className="tabular-nums">{cls.bookedSessions}</span></Field>
          <Field label="Created">{cls.createdAt ? fmtDate(cls.createdAt) : '—'}</Field>
        </div>
        {noSessions && !isComplete && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-tint px-3 py-2 text-[11px]">
            <AlertTriangle className="size-3.5 text-warning mt-0.5 shrink-0" strokeWidth={2} />
            <span className="text-warning">No schedules yet — likely no team assigned.</span>
          </div>
        )}
      </div>

      {/* Assigned team */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h3 className="text-overline text-subtle-foreground font-semibold">Assigned team</h3>
        {team ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
                <Users2 className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-base font-bold text-foreground truncate">{team.name}</div>
                <div className="text-xs text-muted-foreground">
                  Leader: {team.leaderId?.name || 'N/A'} · {team.members?.length || 0} member{(team.members?.length || 0) !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
            <Link to="/academy?tab=teams" className="block w-full text-center py-2 rounded-md bg-muted text-muted-foreground text-xs font-semibold border border-border hover:bg-accent transition-all">
              Manage team
            </Link>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-sm text-warning">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" strokeWidth={2} />
            <span>No team assigned. Schedules and attendance cannot be created without one.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-overline text-subtle-foreground">{label}</div>
      <div className="text-foreground mt-0.5">{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Tab 2 · Roster — folds EnrollmentPage logic
//   FilterBar (chips + search) + DataTable + selection bar + drawers
// ──────────────────────────────────────────────────────────
const STATUS_CHIPS = ['All', 'Active', 'On-hold', 'Dropped', 'Transferred'];

function RosterTab({ classId, classTeamId, canEdit }) {
  const params = useMemo(() => ({ classId }), [classId]);
  const { data: enrollments = [], isLoading } = useEnrollments(params);
  const { data: teams = [] } = useTeams();

  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch]             = useState('');
  const [selected, setSelected]         = useState(() => new Set()); // Set<enrollmentId>
  const [drawerMode, setDrawerMode]     = useState(null); // 'transfer' | 'status' | 'drop' | null

  // Filtered rows
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrollments.filter((e) => {
      if (statusFilter !== 'All' && e.status !== statusFilter) return false;
      if (!q) return true;
      const name = e.userId?.name?.toLowerCase() || '';
      const code = e.userId?.empCode?.toLowerCase() || '';
      return name.includes(q) || code.includes(q);
    });
  }, [enrollments, statusFilter, search]);

  const selectedRows = useMemo(
    () => enrollments.filter((e) => selected.has(e._id)),
    [enrollments, selected],
  );

  const allVisibleSelected = filtered.length > 0 && filtered.every((e) => selected.has(e._id));

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        filtered.forEach((e) => next.delete(e._id));
        return next;
      } else {
        const next = new Set(prev);
        filtered.forEach((e) => next.add(e._id));
        return next;
      }
    });
  };

  const clearSelection = () => setSelected(new Set());

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner size={24} /></div>;
  }

  if (enrollments.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No students yet"
        description="Add students to this class via the assigned team."
      />
    );
  }

  // Per-status counts for chip labels
  const counts = {};
  enrollments.forEach((e) => { counts[e.status] = (counts[e.status] || 0) + 1; });
  counts.All = enrollments.length;

  return (
    <div className="space-y-3">
      {/* ── FilterBar (chips + search) ─────────────────── */}
      <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
        <span className="text-overline text-subtle-foreground mr-1">Status</span>
        {STATUS_CHIPS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors duration-(--dur-fast)',
              statusFilter === s
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-background border-border text-muted-foreground hover:bg-accent',
            )}
          >
            {s}
            {counts[s] > 0 && (
              <span className={cn(
                'text-[10px] font-mono tabular-nums px-1 rounded',
                statusFilter === s ? 'bg-primary/20' : 'bg-muted',
              )}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}

        <div className="relative ml-auto min-w-[180px] max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-subtle-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or code…"
            className="w-full h-(--control-h) pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          />
        </div>
      </div>

      {/* ── Selection bar (sticky) ─────────────────────── */}
      {canEdit && selected.size > 0 && (
        <div className="sticky top-3 z-20 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
          <span className="font-semibold">{selected.size} selected</span>
          <span className="text-subtle-foreground">·</span>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDrawerMode('transfer')}>
            Transfer to team…
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDrawerMode('status')}>
            Change status…
          </Button>
          <Button size="sm" variant="destructive" className="h-7 text-[11px]" onClick={() => setDrawerMode('drop')}>
            Drop
          </Button>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={clearSelection}>
            <XIcon className="size-3 mr-1" /> Clear
          </Button>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-muted">
                {canEdit && (
                  <th className="px-3 py-2 w-9 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      aria-label="Select all visible rows"
                      className="size-3.5 accent-primary cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-3 py-2 text-left text-overline text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left text-overline text-muted-foreground">Name · Dept</th>
                <th className="px-3 py-2 text-left text-overline text-muted-foreground">Team</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">Att %</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">Sessions</th>
                <th className="px-3 py-2 text-left text-overline text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-center text-overline text-muted-foreground w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={canEdit ? 8 : 7} className="px-3 py-8 text-center text-muted-foreground text-sm">
                  No students match the current filter.
                </td></tr>
              ) : filtered.map((e) => {
                const att = e.attendance || {};
                const total = att.total || 0;
                const rate = total > 0 ? Math.round(((att.P || 0) / total) * 100) : null;
                const isSel = selected.has(e._id);
                const rateColor =
                  rate == null ? 'text-subtle-foreground' :
                  rate >= 80   ? 'text-success' :
                  rate >= 60   ? 'text-warning' : 'text-destructive';

                return (
                  <tr key={e._id} className={cn(
                    'hover:bg-accent transition-colors',
                    isSel && 'bg-primary/[0.04]',
                  )}>
                    {canEdit && (
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleRow(e._id)}
                          aria-label={`Select ${e.userId?.name}`}
                          className="size-3.5 accent-primary cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 text-mono text-primary text-xs">{e.userId?.empCode}</td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-semibold text-foreground">{e.userId?.name}</div>
                      <div className="text-[11px] text-subtle-foreground">{e.userId?.department || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-sm text-muted-foreground">{e.teamId?.name || '—'}</td>
                    <td className={cn('px-3 py-2 text-right text-xs font-mono font-semibold tabular-nums', rateColor)}>
                      {rate != null ? `${rate}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                      {(att.P || 0)}/{total || 0}
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={e.status} size="sm" /></td>
                    <td className="px-3 py-2 text-center">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => { setSelected(new Set([e._id])); setDrawerMode('status'); }}
                          aria-label="Row actions"
                          className="p-1 rounded text-subtle-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Drawer ─────────────────────────────────────── */}
      <EnrollmentDrawer
        isOpen={!!drawerMode}
        mode={drawerMode || 'status'}
        selected={selectedRows}
        teams={teams}
        excludeTeamId={classTeamId}
        onClose={() => setDrawerMode(null)}
        onDone={() => { setDrawerMode(null); clearSelection(); }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Tab 3 · Schedules — table + Past/Upcoming/All toggle + +New session
// ──────────────────────────────────────────────────────────
function SchedulesTab({ classId, classes, canEdit }) {
  const navigate = useNavigate();
  const params = useMemo(() => ({ classId, limit: 200 }), [classId]);
  const { data: schedData, isLoading } = useSchedules(params);
  const { data: teams = [] } = useTeams();
  const schedules = schedData?.data || [];

  const [filter, setFilter] = useState('upcoming'); // 'past' | 'upcoming' | 'all'
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filtered = useMemo(() => {
    const now = Date.now(); // captured at memo time — recomputes on schedules/filter change
    const sorted = [...schedules].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    if (filter === 'past')     return sorted.filter((s) => new Date(s.endTime).getTime() < now);
    if (filter === 'upcoming') return sorted.filter((s) => new Date(s.endTime).getTime() >= now);
    return sorted;
  }, [schedules, filter]);

  const handleRowClick = (s) => {
    // Navigate to /calendar with the week of the session preselected
    const d = new Date(s.startTime);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const week = monday.toISOString().slice(0, 10);
    navigate(`/operations?tab=attendance&week=${week}`);
  };

  return (
    <div className="space-y-3">
      {/* ── Toolbar ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
        <div className="inline-flex rounded-md overflow-hidden border border-border">
          {[
            { id: 'past',     label: 'Past' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'all',      label: 'All' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={cn(
                'px-3 py-1 text-xs transition-colors duration-(--dur-fast)',
                filter === opt.id
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} session{filtered.length !== 1 ? 's' : ''}</span>
        <span className="flex-1" />
        {canEdit && (
          <Button size="sm" className="h-8 text-xs" onClick={() => setDrawerOpen(true)}>
            + New session
          </Button>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size={24} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No sessions"
          description={filter === 'past' ? 'No past sessions yet.' : filter === 'upcoming' ? 'No upcoming sessions.' : 'No sessions scheduled for this class.'}
        />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-3 py-2 text-left text-overline text-muted-foreground w-12">#</th>
                  <th className="px-3 py-2 text-left text-overline text-muted-foreground">Date</th>
                  <th className="px-3 py-2 text-left text-overline text-muted-foreground">Time</th>
                  <th className="px-3 py-2 text-left text-overline text-muted-foreground">Team</th>
                  <th className="px-3 py-2 text-center text-overline text-muted-foreground">Capacity</th>
                  <th className="px-3 py-2 text-left text-overline text-muted-foreground">Room</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s, i) => (
                  <tr
                    key={s._id}
                    onClick={() => handleRowClick(s)}
                    className="hover:bg-accent transition-colors cursor-pointer"
                    title="Open in calendar"
                  >
                    <td className="px-3 py-2 text-xs text-subtle-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2 text-sm text-foreground">{fmtDate(s.startTime)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                      {fmtTime(s.startTime)}–{fmtTime(s.endTime)}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {s.bookedTeamId?.name ? (
                        <span className="inline-flex items-center text-[11px] font-semibold text-chart-3 bg-chart-3/15 px-2 py-0.5 rounded">
                          {s.bookedTeamId.name}
                        </span>
                      ) : <span className="text-subtle-foreground text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center text-sm text-muted-foreground tabular-nums">
                      <span className={s.enrolledCount >= s.capacity ? 'text-warning' : ''}>
                        {s.enrolledCount}/{s.capacity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {s.roomLink ? (
                        <a href={s.roomLink} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline text-xs truncate block max-w-[200px]">
                          {s.roomLink}
                        </a>
                      ) : <span className="text-subtle-foreground text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ScheduleDrawer (reuse from Screen 2) ───────── */}
      <ScheduleDrawer
        isOpen={drawerOpen}
        mode="create"
        schedule={null}
        prefill={null}
        classes={classes}
        teams={teams}
        allSchedules={schedules}
        isReadOnly={!canEdit}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => setDrawerOpen(false)}
        onDeleted={() => setDrawerOpen(false)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Tab 4 · Attendance — class-level KPIs + per-student rate
// (sorted by rate ASC — worst first, actionable signal)
// ──────────────────────────────────────────────────────────
function AttendanceTab({ classId }) {
  const params = useMemo(() => ({ classId }), [classId]);
  const { data, isLoading } = useAttendanceAnalyticsByClass(params);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner size={24} /></div>;
  }

  if (!data?.schedules || data.schedules.length === 0 || data.roster?.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No attendance recorded yet"
        description="Mark attendance from Calendar to see analytics here."
        action={<Button asChild variant="outline" size="sm"><Link to="/operations?tab=attendance">Open calendar</Link></Button>}
      />
    );
  }

  // ── Aggregate class-level totals ──
  let P = 0, A = 0, L = 0, EL = 0;
  data.roster.forEach((row) => {
    Object.values(row.sessions || {}).forEach((s) => {
      if (s === 'P') P++;
      else if (s === 'A') A++;
      else if (s === 'L') L++;
      else if (s === 'EL') EL++;
    });
  });
  const totalMarked   = P + A + L + EL;
  const totalScheduled = data.schedules.length * data.roster.length;
  const ratePct = totalMarked > 0 ? Math.round((P / totalMarked) * 100) : 0;

  const pPct  = totalMarked > 0 ? (P  / totalMarked) * 100 : 0;
  const aPct  = totalMarked > 0 ? (A  / totalMarked) * 100 : 0;
  const lPct  = totalMarked > 0 ? (L  / totalMarked) * 100 : 0;
  const elPct = totalMarked > 0 ? (EL / totalMarked) * 100 : 0;

  // ── Per-student rate (sorted ASC — worst first) ──
  const studentRows = data.roster.map((row) => {
    let p = 0, a = 0, l = 0, el = 0, total = 0;
    Object.values(row.sessions || {}).forEach((s) => {
      if (s === 'P') p++;
      else if (s === 'A') a++;
      else if (s === 'L') l++;
      else if (s === 'EL') el++;
      total++;
    });
    const rate = total > 0 ? (p / total) * 100 : 0;
    return { user: row.user, p, a, l, el, total, rate };
  }).sort((x, y) => x.rate - y.rate);

  return (
    <div className="space-y-4">
      {/* ── Class-level KPI strip ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-overline text-muted-foreground">Marked / Scheduled</span>
            <span className="text-xs text-subtle-foreground tabular-nums">
              {totalMarked} / {totalScheduled}
            </span>
          </div>
          <span className="text-h1 text-foreground tabular-nums leading-none">
            {ratePct}<span className="text-muted-foreground text-base font-normal">%</span>
          </span>
          <div className="text-small text-muted-foreground">Overall present rate</div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <span className="text-overline text-muted-foreground">Status breakdown</span>
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            <div style={{ width: `${pPct}%`,  background: 'var(--color-chart-1)' }} title={`Present ${P}`} />
            <div style={{ width: `${lPct}%`,  background: 'var(--color-chart-2)' }} title={`Late ${L}`} />
            <div style={{ width: `${elPct}%`, background: 'var(--color-chart-3)' }} title={`Excused ${EL}`} />
            <div style={{ width: `${aPct}%`,  background: 'var(--color-chart-4)' }} title={`Absent ${A}`} />
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground tabular-nums">
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-chart-1" /> P {P}</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-chart-2" /> L {L}</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-chart-3" /> EL {EL}</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-chart-4" /> A {A}</span>
          </div>
        </div>
      </div>

      {/* ── Per-student table (sorted by rate ASC) ────── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Per-student attendance</h3>
          <span className="text-overline text-subtle-foreground">sorted by rate · lowest first</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="px-3 py-2 text-left text-overline text-muted-foreground">Student</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">P</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">A</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">L</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">EL</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {studentRows.map((r) => {
                const rateColor = r.rate >= 80 ? 'text-success' : r.rate >= 60 ? 'text-warning' : 'text-destructive';
                return (
                  <tr key={r.user._id || r.user.empCode} className="hover:bg-accent transition-colors">
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-foreground">{r.user.name}</div>
                      <div className="text-[11px] text-subtle-foreground font-mono">{r.user.empCode}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-success tabular-nums">{r.p}</td>
                    <td className="px-3 py-2 text-right text-xs text-destructive tabular-nums">{r.a}</td>
                    <td className="px-3 py-2 text-right text-xs text-warning tabular-nums">{r.l}</td>
                    <td className="px-3 py-2 text-right text-xs text-info tabular-nums">{r.el}</td>
                    <td className={cn('px-3 py-2 text-right text-sm font-mono font-semibold tabular-nums', rateColor)}>
                      {r.rate.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────────────────
export default function ClassDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editOpen, setEditOpen] = useState(false);
  const { can } = useRole();
  const canEdit = can('update:class');

  const tabFromUrl = searchParams.get('tab');
  const activeTab = TABS.find((t) => t.id === tabFromUrl)?.id || 'overview';

  const setTab = (id) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  const { data: cls, isLoading: loadingClass, error: classError } = useClass(id);
  const { data: teams    = [] } = useTeams();
  const { data: classes  = [] } = useClasses();

  const team = useMemo(() => {
    if (!cls) return null;
    return teams.find((t) => (t.classId?._id || t.classId) === cls._id) || null;
  }, [teams, cls]);

  useEffect(() => {
    document.title = cls ? `TMS — ${cls.classCode}` : 'TMS — Class';
  }, [cls]);

  if (loadingClass) {
    return <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>;
  }

  if (classError || !cls) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Class not found"
        action={<Button variant="outline" asChild><Link to="/learning?tab=cohorts"><ArrowLeft className="size-4 mr-1.5" />Back to Cohorts</Link></Button>}
      />
    );
  }

  // ── KPI metrics ──
  const enrolledCount = team?.members?.length || 0;
  const capacity = cls.capacity || cls.totalCapacity || 9;
  const sessionsPct = cls.totalSessions > 0 ? Math.round((cls.bookedSessions / cls.totalSessions) * 100) : 0;
  const enrolledPct = capacity > 0 ? Math.round((enrolledCount / capacity) * 100) : 0;
  const attendanceRate = cls.attendanceRate; // may be undefined; we render '—' if so

  return (
    <div className="space-y-5">
      {/* ── Breadcrumb ─────────────────────────────────── */}
      <Breadcrumbs
        items={[
          { label: 'Learning', to: '/learning?tab=cohorts' },
          { label: 'Cohorts',  to: '/learning?tab=cohorts' },
          { label: cls.classCode },
        ]}
      />

      {/* ── PageHeader (title + status + edit action) ──── */}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-primary text-h1">{cls.classCode}</span>
            <span className="text-subtle-foreground">·</span>
            <span className="text-foreground">{cls.courseName}</span>
            <StatusBadge status={cls.status} size="sm" />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
            {team && (
              <span className="inline-flex items-center gap-1">
                <Users2 className="size-3.5" /> {team.name}
              </span>
            )}
            <span className="text-subtle-foreground">·</span>
            <span>{cls.bookedSessions}/{cls.totalSessions} sessions</span>
          </span>
        }
        actions={canEdit ? (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
            <Pencil className="size-3.5" /> Edit
          </Button>
        ) : null}
      />

      {/* ── KPI strip ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setTab('roster')}
          className="text-left bg-card border border-border rounded-lg p-4 hover:border-border-strong transition-colors duration-(--dur)"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-overline text-muted-foreground">Enrolled</span>
            <Users className="size-4 text-success" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-h1 text-foreground tabular-nums leading-none">{enrolledCount}</span>
            <span className="text-sm text-muted-foreground">/ {capacity}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-success" style={{ width: `${Math.min(enrolledPct, 100)}%` }} />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setTab('attendance')}
          className="text-left bg-card border border-border rounded-lg p-4 hover:border-border-strong transition-colors duration-(--dur)"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-overline text-muted-foreground">Attendance</span>
            <BarChart3 className="size-4 text-info" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-h1 text-foreground tabular-nums leading-none">
              {attendanceRate != null ? (attendanceRate * 100).toFixed(1) : '—'}
            </span>
            {attendanceRate != null && <span className="text-sm text-muted-foreground">%</span>}
          </div>
          <div className="mt-2 text-small text-subtle-foreground">Class avg present</div>
        </button>

        <button
          type="button"
          onClick={() => setTab('schedules')}
          className="text-left bg-card border border-border rounded-lg p-4 hover:border-border-strong transition-colors duration-(--dur)"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-overline text-muted-foreground">Sessions</span>
            <CalendarDays className="size-4 text-primary" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-h1 text-foreground tabular-nums leading-none">{cls.bookedSessions}</span>
            <span className="text-sm text-muted-foreground">/ {cls.totalSessions}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn('h-full rounded-full', sessionsPct >= 100 ? 'bg-primary' : sessionsPct >= 80 ? 'bg-warning' : 'bg-success')}
              style={{ width: `${Math.min(sessionsPct, 100)}%` }} />
          </div>
        </button>
      </div>

      {/* ── Tabs ───────────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-1 px-1 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors duration-(--dur-fast)',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40',
                )}
              >
                <Icon className="size-3.5" strokeWidth={2} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ────────────────────────────────── */}
      <div>
        {activeTab === 'overview'   && <OverviewTab cls={cls} team={team} />}
        {activeTab === 'roster'     && <RosterTab classId={cls._id} classTeamId={team?._id} canEdit={canEdit} />}
        {activeTab === 'schedules'  && <SchedulesTab classId={cls._id} classes={classes} canEdit={canEdit} />}
        {activeTab === 'attendance' && <AttendanceTab classId={cls._id} />}
      </div>

      {/* ── Edit Modal ─────────────────────────────────── */}
      {editOpen && <EditClassModal cls={cls} onClose={() => setEditOpen(false)} />}
    </div>
  );
}
