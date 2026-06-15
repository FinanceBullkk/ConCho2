import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Award, CalendarDays, BarChart3, ArrowRight } from 'lucide-react';
import { useRole } from '../../hooks/useRole';
import { useOperationalDashboard } from '../../hooks/useLearningDashboard';

// ──────────────────────────────────────────────────────────
// QuickActions — contextual "where to act" tiles (IA cleanup 2026-06-13).
//
// NOT plain nav shortcuts (those duplicated the navbar). Each tile shows a LIVE
// number from the operational dashboard and links to the place you act on it.
// One shared, server-aggregated, fail-soft query (`useOperationalDashboard`,
// window=30) — same cache key as Reports▸L&D Dashboard, so visiting both is one
// fetch. Complements AlertBand (do-now ops) with training-health signals.
//
// Gated to read:reports holders (Admin/Coordinator/Teacher). Participants never
// reach here — Home renders ParticipantDashboard for them.
// ──────────────────────────────────────────────────────────

const TONE = {
  neutral: 'bg-muted text-muted-foreground',
  info:    'bg-info/10 text-info',
  success: 'bg-success-tint text-success',
  warning: 'bg-warning/10 text-warning',
  danger:  'bg-destructive/10 text-destructive',
};

function alertTone(n, level = 'warning') {
  return n > 0 ? level : 'neutral';
}

// Build the tile list from whatever metric blocks came back (each block is
// fail-soft → may be null; skip the tile when its data is missing).
// `isAdmin` re-points the overdue + certs tiles at the filtered drill list (the
// "data → action" upgrade) — the drill reads the Admin-only compliance report,
// so non-admins keep the broader list destinations.
function buildTiles(data, t, isAdmin) {
  if (!data) return [];
  const { assignments, certificates, sessions, completion } = data;
  const tiles = [];

  if (assignments) {
    tiles.push({
      key: 'overdue',
      icon: ClipboardList,
      to: isAdmin ? '/reports/drill?metric=overdue' : '/learning?tab=assignments',
      label: t('dashboard.quickActions.overdue.label'),
      value: assignments.overdueLearners ?? 0,
      tone: alertTone(assignments.overdueLearners ?? 0, 'warning'),
    });
  }
  if (certificates) {
    const expired = certificates.expired ?? 0;
    const expiring = certificates.expiring30 ?? 0;
    tiles.push({
      key: 'certs',
      icon: Award,
      to: isAdmin ? '/reports/drill?metric=expiring' : '/reports?tab=completion',
      label: t('dashboard.quickActions.certs.label'),
      value: expiring,
      sub: expired > 0 ? t('dashboard.quickActions.certs.expired', { count: expired }) : null,
      tone: expired > 0 ? 'danger' : alertTone(expiring, 'warning'),
    });
  }
  if (sessions) {
    tiles.push({
      key: 'upcoming',
      icon: CalendarDays,
      to: '/calendar',
      label: t('dashboard.quickActions.upcoming.label'),
      value: sessions.next7Days ?? 0,
      tone: 'info',
    });
  }
  if (completion?.summary) {
    tiles.push({
      key: 'completion',
      icon: BarChart3,
      to: '/reports?tab=learning',
      label: t('dashboard.quickActions.completion.label'),
      value: `${completion.summary.completionRate ?? 0}%`,
      tone: 'success',
    });
  }
  return tiles;
}

export default function QuickActions() {
  const { t } = useTranslation();
  const { can, isAdmin } = useRole();
  const canSee = can('read:reports');

  // Shared cache with Reports▸L&D Dashboard (same window). Disabled for roles
  // that can't read reports so we never fire a query that would 403.
  const { data, isLoading } = useOperationalDashboard(
    { window: '30' },
    { enabled: canSee },
  );

  if (!canSee) return null;

  if (isLoading) {
    return (
      <section aria-busy="true" className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-primary inline-block" />
          {t('dashboard.quickActions.title')}
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </section>
    );
  }

  const tiles = buildTiles(data, t, isAdmin);
  if (tiles.length === 0) return null;

  return (
    <section aria-labelledby="quick-actions-heading" className="space-y-3">
      <h2 id="quick-actions-heading" className="text-sm font-semibold text-foreground flex items-center gap-2">
        <span className="w-1 h-4 rounded-full bg-primary inline-block" />
        {t('dashboard.quickActions.title')}
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.key}
              to={tile.to}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[transform,border-color,background-color,box-shadow] duration-(--dur) hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-md ${TONE[tile.tone]}`}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold tabular-nums text-foreground leading-none">{tile.value}</div>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="truncate">{tile.label}</span>
                  <ArrowRight className="size-3 shrink-0 opacity-0 transition-opacity duration-(--dur) group-hover:opacity-100" aria-hidden="true" />
                </div>
                {tile.sub && <div className="mt-0.5 truncate text-[11px] font-medium text-destructive">{tile.sub}</div>}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
