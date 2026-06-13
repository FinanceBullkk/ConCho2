import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { AlertBand } from '@/components/home/AlertBand';
import { TodayHero } from '@/components/home/TodayHero';
import { PageHeader } from '@/components/PageHeader';
import { useRole } from '../../hooks/useRole';
import ParticipantDashboard from './ParticipantDashboard';
import QuickActions from './QuickActions';

// ──────────────────────────────────────────────────────────
// DashboardPage — Home landing (IA cleanup 2026-06-13)
//
// Home is now a lightweight, action-oriented landing — NOT an analytics page.
// The heavy training analytics moved to Reports▸Overview (AdminAnalyticsPanel)
// so all numbers live in one section. Home shows: what needs attention today
// (AlertBand + TodayHero) and where to go next (role-aware QuickActions).
//
//   • Participant  → ParticipantDashboard (their own learning home)
//   • everyone else → greeting + AlertBand + TodayHero + QuickActions
// ──────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { t } = useTranslation();
  const { user, isParticipant } = useAuth();
  const { can } = useRole();

  useEffect(() => { document.title = t('dashboard.docTitle'); }, [t]);

  // UX-09: while the forced-password-change modal owns the screen, every API
  // call 403s on the mustChangePassword gate — render nothing behind the modal.
  if (user?.mustChangePassword) return null;
  if (isParticipant) return <ParticipantDashboard />;

  const dateLocale = 'en-US';
  // Staff who can see analytics get a shortcut into Reports▸Overview.
  const canSeeAnalytics = can('read:dashboard') || can('read:reports') || can('read:attendance');

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('dashboard.greeting', { name: user?.name?.split(' ')[0] || t('dashboard.greetingFallback') })}
        description={new Date().toLocaleDateString(dateLocale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        actions={
          canSeeAnalytics ? (
            <Link
              to="/reports"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-(--dur) hover:text-foreground hover:bg-accent"
            >
              <BarChart3 className="size-4" aria-hidden="true" />
              {t('dashboard.viewAnalytics')}
            </Link>
          ) : null
        }
      />

      {/* What needs attention today */}
      <AlertBand />
      <TodayHero />

      {/* Where to go next */}
      <QuickActions />
    </div>
  );
}
