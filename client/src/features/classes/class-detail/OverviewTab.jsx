import { Link } from 'react-router-dom';
import { AlertTriangle, Users2 } from 'lucide-react';
import { StatusBadge } from '../../../components/StatusBadge';
import { fmtDate } from './format';

// ──────────────────────────────────────────────────────────
// Tab 1 · Overview — metadata grid + assigned team card
// ──────────────────────────────────────────────────────────
export default function OverviewTab({ cls, team }) {
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
