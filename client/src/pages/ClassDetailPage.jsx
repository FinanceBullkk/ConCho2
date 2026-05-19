import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ClipboardList, CalendarDays, Users, BarChart3,
  BookOpen, AlertTriangle, Pencil, ArrowLeft, Users2,
} from 'lucide-react';
import Portal from '../components/Portal';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { useClass, useUpdateClass, useDeleteClass } from '../hooks/useClasses';
import { useTeams } from '../hooks/useTeams';
import { useSchedules } from '../hooks/useSchedules';
import { useEnrollments } from '../hooks/useEnrollments';
import { useAttendanceAnalyticsByClass } from '../hooks/useAttendance';
import { Spinner } from '../components/Spinner';
import { Button } from '@/components/ui/button';

// ──────────────────────────────────────────────────────────
// Class Detail Page — single-context view of one class
// ──────────────────────────────────────────────────────────
// Tabs: Overview | Sessions | Roster | Analytics
// Replaces the old "jump between 4 pages" workflow with a
// single class-scoped view.
// ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',   label: 'Overview',   icon: ClipboardList },
  { id: 'sessions',   label: 'Schedules',  icon: CalendarDays  },
  { id: 'roster',     label: 'Roster',     icon: Users         },
  { id: 'analytics',  label: 'Attendance', icon: BarChart3     },
];

const STATUS_COLORS = {
  Active: 'bg-success/20 text-success border-success/20',
  Completed: 'bg-primary/20 text-primary border-primary/20',
  Transferred: 'bg-warning/20 text-warning border-warning/20',
  Dropped: 'bg-destructive/20 text-destructive border-destructive/20',
};

const fmtDate = (d) => new Date(d).toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });

// ── Edit Modal ─────────────────────────────────────────────

function EditClassModal({ cls, onClose, onDeleted }) {
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
      onDeleted();
      navigate('/academy?tab=classes');
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed');
      setConfirmDelete(false);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4 space-y-4 ">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Pencil className="size-4" /> Edit {cls.classCode} — {cls.courseName}</h2>
          {error && <div className="px-4 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>}
          <div>
            <label className="block text-small text-muted-foreground mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 h-(--control-h) rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors">
              <option value="Ongoing">Ongoing</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="block text-small text-muted-foreground mb-1">Total Sessions</label>
            <input type="number" value={totalSessions} onChange={(e) => setTotalSessions(Number(e.target.value))} min={1}
              className="w-full px-3 h-(--control-h) rounded-md bg-background border border-input text-foreground placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors" />
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
      </div>
    </Portal>
  );
}

// ── Tab: Overview ──────────────────────────────────────────

function OverviewTab({ cls, team, onEdit }) {
  const pct = cls.totalSessions > 0 ? Math.round((cls.bookedSessions / cls.totalSessions) * 100) : 0;
  const isComplete = cls.status === 'Completed';
  const noSessions = cls.bookedSessions === 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Progress */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-subtle-foreground font-semibold">Session Progress</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-h1 text-foreground">{cls.bookedSessions}</span>
          <span className="text-subtle-foreground">/ {cls.totalSessions}</span>
          <span className="ml-auto text-sm text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-primary' : pct >= 80 ? 'bg-warning' : 'bg-success'}`}
            style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <p className="text-xs text-subtle-foreground">
          {isComplete ? 'This class is marked Completed.' : noSessions ? 'No schedules yet — likely no team assigned.' : `${cls.totalSessions - cls.bookedSessions} session(s) remaining.`}
        </p>
      </div>

      {/* Team */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-subtle-foreground font-semibold">Assigned Team</h3>
        {team ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/15 flex items-center justify-center">
                <Users2 className="size-5 text-primary" />
              </div>
              <div>
                <div className="text-base font-bold text-foreground">{team.name}</div>
                <div className="text-xs text-muted-foreground">
                  Leader: {team.leaderId?.name || 'N/A'} · {team.members?.length || 0} member{(team.members?.length || 0) !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
            <Link to="/people" className="block w-full text-center py-2 rounded-md bg-muted text-muted-foreground text-xs font-semibold border border-border hover:bg-accent transition-all">
              Manage Team & Members
            </Link>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-sm text-warning">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" strokeWidth={2} />
            <span>No team assigned. Schedules and attendance cannot be created without one.</span>
          </div>
        )}
      </div>

      {/* Class meta */}
      <div className="bg-card border border-border rounded-lg p-5 space-y-3 md:col-span-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xs uppercase tracking-wider text-subtle-foreground font-semibold mb-2">Class Information</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-subtle-foreground">Code</div>
                <div className="font-mono font-bold text-primary">{cls.classCode}</div>
              </div>
              <div>
                <div className="text-xs text-subtle-foreground">Course</div>
                <div className="text-foreground">{cls.courseName}</div>
              </div>
              <div>
                <div className="text-xs text-subtle-foreground">Status</div>
                <StatusBadge status={cls.status} size="sm" />
              </div>
              <div>
                <div className="text-xs text-subtle-foreground">Created</div>
                <div className="text-muted-foreground">{cls.createdAt ? fmtDate(cls.createdAt) : '—'}</div>
              </div>
            </div>
          </div>
          <Button onClick={onEdit} variant="outline" size="sm" className="gap-1.5">
            <Pencil className="size-3.5" /> Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Sessions ──────────────────────────────────────────

function SessionsTab({ classId }) {
  const params = useMemo(() => ({ classId, limit: 200 }), [classId]);
  const { data: schedData, isLoading } = useSchedules(params);
  const schedules = schedData?.data || [];

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner size={24} /></div>;
  }

  if (schedules.length === 0) {
    return <EmptyState icon={CalendarDays} title="No schedules yet" description="Sessions will appear here once they are booked." />;
  }

  // Sort by startTime ascending
  const sorted = [...schedules].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider w-12">#</th>
              <th className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Date</th>
              <th className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Time</th>
              <th className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Team</th>
              <th className="px-4 py-3 text-center text-xs text-muted-foreground font-semibold uppercase tracking-wider">Capacity</th>
              <th className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Room</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((s, i) => (
              <tr key={s._id} className="hover:bg-accent transition-colors">
                <td className="px-4 py-3 text-xs text-subtle-foreground font-mono">{s.sessionNumber || i + 1}</td>
                <td className="px-4 py-3 text-sm text-foreground">{fmtDate(s.startTime)}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                  {fmtTime(s.startTime)}–{fmtTime(s.endTime)}
                </td>
                <td className="px-4 py-3 text-sm">
                  {s.bookedTeamId?.name ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-chart-6 bg-chart-6/15 px-2 py-0.5 rounded-full">
                      👥 {s.bookedTeamId.name}
                    </span>
                  ) : (
                    <span className="text-subtle-foreground text-xs italic">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                  <span className={s.enrolledCount >= s.capacity ? 'text-warning' : ''}>
                    {s.enrolledCount}/{s.capacity}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {s.roomLink ? (
                    <a href={s.roomLink} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:text-primary underline text-xs truncate block max-w-[200px]"
                      onClick={(e) => e.stopPropagation()}>
                      {s.roomLink}
                    </a>
                  ) : (
                    <span className="text-subtle-foreground text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Roster ────────────────────────────────────────────

function RosterTab({ classId }) {
  const params = useMemo(() => ({ classId }), [classId]);
  const { data: enrollments = [], isLoading } = useEnrollments(params);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner size={24} /></div>;
  }

  if (enrollments.length === 0) {
    return <EmptyState icon={Users} title="No roster" description="Enrollment records will appear here once students join." />;
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[800px]">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Member</th>
              <th className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Joined</th>
              <th className="px-4 py-3 text-center text-xs text-muted-foreground font-semibold uppercase tracking-wider">Attendance</th>
              <th className="px-4 py-3 text-left text-xs text-muted-foreground font-semibold uppercase tracking-wider">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {enrollments.map((e) => {
              const att = e.attendance || {};
              const total = att.total || 0;
              const rate = total > 0 ? Math.round(((att.P || 0) / total) * 100) : null;
              return (
                <tr key={e._id} className="hover:bg-accent transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-sm font-semibold text-foreground">{e.userId?.name}</div>
                    <div className="text-xs text-subtle-foreground font-mono">{e.userId?.empCode}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${STATUS_COLORS[e.status] || ''}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDate(e.joinedAt)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-success text-xs font-semibold" title="Present">P:{att.P || 0}</span>
                      <span className="text-destructive text-xs font-semibold" title="Absent">A:{att.A || 0}</span>
                      <span className="text-warning text-xs font-semibold" title="Late">L:{att.L || 0}</span>
                      <span className="text-info text-xs font-semibold" title="Excused">EL:{att.EL || 0}</span>
                    </div>
                    {rate !== null && (
                      <div className="mt-1">
                        <div className="h-1 rounded-full bg-muted overflow-hidden w-20 mx-auto">
                          <div className="h-full rounded-full bg-success transition-all"
                            style={{ width: `${rate}%` }} />
                        </div>
                        <div className="text-[10px] text-subtle-foreground mt-0.5">{rate}% ({att.P || 0}/{total})</div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {e.note ? <span className="text-muted-foreground text-xs italic">{e.note}</span> : <span className="text-subtle-foreground">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Analytics ─────────────────────────────────────────

function AnalyticsTab({ classId }) {
  const params = useMemo(() => ({ classId }), [classId]);
  const { data, isLoading } = useAttendanceAnalyticsByClass(params);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner size={24} /></div>;
  }

  if (!data?.schedules || data.schedules.length === 0 || data.roster?.length === 0) {
    return <EmptyState icon={BarChart3} title="No attendance data" description="Attendance records will appear here once sessions are marked." />;
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted border-b border-border text-muted-foreground text-sm">
              <th className="p-4 font-semibold sticky left-0 bg-card border-r border-border z-10 w-48">Student</th>
              <th className="p-4 font-semibold w-24">Rate</th>
              {data.schedules.map((s, i) => (
                <th key={s._id} className="p-4 font-semibold min-w-[80px] text-center border-l border-border">
                  <div className="text-xs text-muted-foreground">S{i + 1}</div>
                  <div className="text-xs">{new Date(s.startTime).toLocaleDateString('en', { month: 'numeric', day: 'numeric' })}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-muted-foreground">
            {data.roster.map((row, idx) => (
              <tr key={idx} className="hover:bg-accent transition-colors">
                <td className="p-4 sticky left-0 bg-card border-r border-border z-10">
                  <div className="font-semibold text-foreground whitespace-nowrap">{row.user.name}</div>
                  <div className="text-xs text-subtle-foreground">{row.user.empCode}</div>
                </td>
                <td className="p-4 font-bold text-primary">{row.attendanceRate}%</td>
                {data.schedules.map((s) => {
                  const status = row.sessions[s._id];
                  let colors = 'text-subtle-foreground';
                  if (status === 'P') colors = 'text-success bg-success/10';
                  if (status === 'A') colors = 'text-destructive bg-destructive/10';
                  if (status === 'L') colors = 'text-warning bg-warning/10';
                  if (status === 'EL') colors = 'text-info bg-info/10';
                  return (
                    <td key={s._id} className="p-2 border-l border-border text-center">
                      {status ? (
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-md font-bold text-sm ${colors}`}>{status}</span>
                      ) : (
                        <span className="text-subtle-foreground">-</span>
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
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function ClassDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);

  const { data: cls, isLoading: loadingClass, error: classError } = useClass(id);
  const { data: teams = [] } = useTeams();

  const team = useMemo(() => {
    if (!cls) return null;
    return teams.find(t => (t.classId?._id || t.classId) === cls._id || t.classId?.classCode === cls.classCode) || null;
  }, [teams, cls]);

  useEffect(() => {
    document.title = cls ? `TMS — ${cls.classCode} ${cls.courseName}` : 'TMS — Class';
  }, [cls]);

  if (loadingClass) {
    return <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>;
  }

  if (classError || !cls) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Class not found"
        action={<Button variant="outline" asChild><Link to="/programs?tab=classes"><ArrowLeft className="size-4 mr-1.5" />Back to Classes</Link></Button>}
      />
    );
  }

  const pct = cls.totalSessions > 0 ? Math.round((cls.bookedSessions / cls.totalSessions) * 100) : 0;
  const noSessions = cls.bookedSessions === 0;
  const isComplete = cls.status === 'Completed';

  return (
    <div className="space-y-5 ">
      {/* ── Breadcrumb / Back ──────────────────────────── */}
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/home' },
          { label: 'Programs', to: '/programs?tab=classes' },
          { label: 'Classes', to: '/programs?tab=classes' },
          { label: cls.classCode },
        ]}
      />
      <Link to="/programs?tab=classes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="size-3.5" /> Back to Classes
      </Link>

      {/* ── Header ─────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-md bg-primary/15 flex items-center justify-center shrink-0">
            <BookOpen className="size-7 text-primary" />
          </div>
          <div>
            <h1 className="text-h1 text-foreground">
              <span className="font-mono text-primary">{cls.classCode}</span>
              <span className="text-subtle-foreground mx-2">·</span>
              {cls.courseName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {noSessions ? (
                <StatusBadge tone="warning" icon={AlertTriangle}>No team</StatusBadge>
              ) : (
                <StatusBadge status={cls.status} size="sm" />
              )}
              {team && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                  <Users2 className="size-3" />{team.name}
                </span>
              )}
              <span className="text-xs text-subtle-foreground">
                {cls.bookedSessions}/{cls.totalSessions} sessions ({pct}%)
              </span>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-1.5">
          <Pencil className="size-3.5" /> Edit
        </Button>
      </div>

      {/* ── Subtab bar ─────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-muted/20 rounded-md w-fit border border-border">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-primary/20 text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}>
              <Icon className="size-4" strokeWidth={2} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ────────────────────────────────── */}
      <div>
        {activeTab === 'overview' && <OverviewTab cls={cls} team={team} onEdit={() => setEditOpen(true)} />}
        {activeTab === 'sessions' && <SessionsTab classId={cls._id} />}
        {activeTab === 'roster' && <RosterTab classId={cls._id} />}
        {activeTab === 'analytics' && <AnalyticsTab classId={cls._id} />}
      </div>

      {/* ── Edit Modal ─────────────────────────────────── */}
      {editOpen && (
        <EditClassModal
          cls={cls}
          onClose={() => setEditOpen(false)}
          onDeleted={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}
