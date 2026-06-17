import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  ClipboardList, CalendarDays, Users, BarChart3,
  BookOpen, Pencil, ArrowLeft, Users2,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { Spinner } from '../../components/Spinner';
import { useClass, useClasses } from '../../hooks/useClasses';
import { useTeams } from '../../hooks/useTeams';
import { useRole } from '../../hooks/useRole';
import EditClassModal from './class-detail/EditClassModal';
import OverviewTab from './class-detail/OverviewTab';
import RosterTab from './class-detail/RosterTab';
import SchedulesTab from './class-detail/SchedulesTab';
import AttendanceTab from './class-detail/AttendanceTab';

// ──────────────────────────────────────────────────────────
// ClassDetailPage — Phase 3 Screen 4
//
// Single landing page for everything class-related. The five sections
// (Edit modal + Overview/Roster/Schedules/Attendance tabs) live in
// ./class-detail/* — this file is the shell:
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
