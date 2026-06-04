import { Users, Award, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useMyTeam } from '../hooks/useOrg';
import TeamRosterTable from '../components/TeamRosterTable';

// ──────────────────────────────────────────────────────────
// MyTeamPage — manager-scoped dashboard (Wave D3).
// Route: /my-team (any authenticated user; self-scoped server-side).
// Shows the caller's direct reports + their training rollup.
// ──────────────────────────────────────────────────────────

function SummaryTile({ icon, label, value }) {
  const Icon = icon;
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
      <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      <div>
        <div className="text-xl font-semibold text-foreground tabular-nums">{value}</div>
        <div className="text-xs text-subtle-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function MyTeamPage() {
  const { data, isLoading } = useMyTeam();
  const team = data || { reports: [], summary: { reports: 0, certificates: 0, completedPrograms: 0 } };

  let body;
  if (isLoading) {
    body = <TableSkeleton rows={4} cols={6} />;
  } else if (!team.reports.length) {
    body = (
      <EmptyState
        icon={Users}
        title="No direct reports"
        description="When an admin assigns employees to report to you, their training status shows up here."
      />
    );
  } else {
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryTile icon={Users} label="Direct reports" value={team.summary.reports} />
          <SummaryTile icon={CheckCircle2} label="Programs completed" value={team.summary.completedPrograms} />
          <SummaryTile icon={Award} label="Certificates" value={team.summary.certificates} />
        </div>
        <TeamRosterTable reports={team.reports} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="My Team"
        description="Training status for the people who report to you."
      />
      {body}
    </div>
  );
}
