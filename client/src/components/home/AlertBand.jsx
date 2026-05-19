import { Link } from 'react-router-dom';
import { ClipboardCheck, UserPlus, Layers, BellRing } from 'lucide-react';
import { useDashboardAlerts } from '@/hooks/useDashboard';

// ──────────────────────────────────────────────────────────
// AlertBand — Phase 3 Screen 3
//
// Compact banner at the top of DashboardPage (Admin only).
// Fetches /api/dashboard/alerts independently with
// refetchOnWindowFocus so counts stay accurate.
//
// Hidden when all counts are zero.
// Each count renders as a quick-link pill to the relevant page.
// ──────────────────────────────────────────────────────────

const ALERT_DEFS = [
  {
    key: 'toMark',
    icon: ClipboardCheck,
    label: (n) => `${n} session${n !== 1 ? 's' : ''} to mark`,
    to: '/operations?tab=attendance',
  },
  {
    key: 'teamsWithoutLeader',
    icon: UserPlus,
    label: (n) => `${n} team${n !== 1 ? 's' : ''} without leader`,
    to: '/academy?tab=teams',
  },
  {
    key: 'teamsUnassigned',
    icon: Layers,
    label: (n) => `${n} team${n !== 1 ? 's' : ''} unassigned`,
    to: '/academy?tab=teams',
  },
];

export function AlertBand() {
  const { data } = useDashboardAlerts();

  // Not yet loaded, or all clear → render nothing
  if (!data || data.totalAlerts === 0) return null;

  const active = ALERT_DEFS.filter((a) => (data[a.key] || 0) > 0);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/25 bg-warning/5 px-4 py-2.5">
      <BellRing className="size-3.5 text-warning shrink-0" strokeWidth={2} />
      <span className="text-xs font-semibold text-warning">
        {data.totalAlerts} thing{data.totalAlerts !== 1 ? 's' : ''} need{data.totalAlerts === 1 ? 's' : ''} your attention
      </span>
      <div className="flex flex-wrap gap-1.5 ml-auto">
        {active.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.key}
              to={a.to}
              className="inline-flex items-center gap-1.5 rounded-md border border-warning/30 px-2.5 py-1 text-[11px] font-medium text-warning transition-colors hover:bg-warning/10"
            >
              <Icon className="size-3 shrink-0" strokeWidth={2} />
              {a.label(data[a.key])}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
