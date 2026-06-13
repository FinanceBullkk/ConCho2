import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, GraduationCap, Users, CalendarDays, Languages, BarChart3, ShieldCog, ArrowRight } from 'lucide-react';
import { useRole } from '../../hooks/useRole';

// ──────────────────────────────────────────────────────────
// QuickActions — IA cleanup (2026-06-13)
// Role-aware "where do I start?" cards on the Home landing. Each card is shown
// only when the user holds at least one of its `anyPerm` permissions, so the
// grid mirrors the sections that role can actually act in. This is the direct
// answer to "I'm admin but I don't know how to use it".
// ──────────────────────────────────────────────────────────

const ACTIONS = [
  { key: 'programs', to: '/learning',             icon: BookOpen,     anyPerm: ['create:program'] },
  { key: 'enroll',   to: '/learning?tab=cohorts', icon: GraduationCap, anyPerm: ['enroll:learner'] },
  { key: 'people',   to: '/people',               icon: Users,        anyPerm: ['read:users', 'read:department'] },
  { key: 'calendar', to: '/calendar',             icon: CalendarDays, anyPerm: ['create:schedule', 'record:attendance'] },
  { key: 'english',  to: '/english',              icon: Languages,    anyPerm: ['create:class', 'record:attendance'] },
  { key: 'reports',  to: '/reports',              icon: BarChart3,    anyPerm: ['read:reports', 'read:attendance'] },
  { key: 'system',   to: '/system',               icon: ShieldCog,    anyPerm: ['access:admin'] },
];

export default function QuickActions() {
  const { t } = useTranslation();
  const { canAny } = useRole();

  const actions = ACTIONS.filter((a) => canAny(a.anyPerm));
  if (actions.length === 0) return null;

  return (
    <section aria-labelledby="quick-actions-heading" className="space-y-3">
      <h2 id="quick-actions-heading" className="text-sm font-semibold text-foreground flex items-center gap-2">
        <span className="w-1 h-4 rounded-full bg-primary inline-block" />
        {t('dashboard.quickActions.title')}
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.key}
              to={a.to}
              className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors duration-(--dur) hover:border-primary/40 hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-tint text-primary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm font-medium text-foreground">
                  {t(`dashboard.quickActions.${a.key}.label`)}
                  <ArrowRight className="size-3.5 text-muted-foreground transition-transform duration-(--dur) group-hover:translate-x-0.5" aria-hidden="true" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t(`dashboard.quickActions.${a.key}.desc`)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
