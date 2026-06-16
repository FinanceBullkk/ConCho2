import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BellRing, BellOff, CalendarClock, AlertTriangle, GraduationCap, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import { meAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';
import { usePush } from './usePush';

// ──────────────────────────────────────────────────────────
// TodayPage — B5 (Modernization Horizon 2)
// The learner's mobile "due today" feed: a microlearning nudge, overdue +
// due-soon assignments, and upcoming sessions — composed from existing data.
// Plus an enable/disable Web Push toggle. Installable as a PWA.
// ──────────────────────────────────────────────────────────

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function Section({ icon, title, tone = 'text-muted-foreground', children }) {
  return (
    <section className="space-y-1.5">
      <h2 className={`text-sm font-semibold inline-flex items-center gap-1.5 ${tone}`}>
        {icon}{title}
      </h2>
      {children}
    </section>
  );
}

function AssignmentRow({ a }) {
  const { t } = useTranslation();
  return (
    <Link to="/me/programs" className="block rounded-lg border border-border bg-card px-3 py-2 hover:bg-muted/40">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{a.title}</span>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{a.dueDate ? `${t('today.due')} ${fmtDate(a.dueDate)}` : ''}</span>
      </div>
      {a.programName && <span className="text-xs text-muted-foreground">{a.programName}</span>}
    </Link>
  );
}

export default function TodayPage() {
  const { t } = useTranslation();
  const { supported, subscribed, busy, enable, disable } = usePush();
  const { data: feed, isLoading } = useQuery({
    queryKey: qk.me.mobileFeed,
    queryFn: async () => (await meAPI.getMobileFeed()).data.data,
    staleTime: 30_000,
  });

  const empty = feed && !feed.microlearning && feed.overdue.length === 0 && feed.dueSoon.length === 0 && feed.upcomingSessions.length === 0;

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title={t('today.title')} description={t('today.description')} />
        {supported && (
          <Button size="sm" variant={subscribed ? 'outline' : 'default'} className="shrink-0 mt-1" onClick={subscribed ? disable : enable} disabled={busy}>
            {subscribed ? <BellOff className="size-3.5" aria-hidden="true" /> : <BellRing className="size-3.5" aria-hidden="true" />}
            {subscribed ? t('today.disablePush') : t('today.enablePush')}
          </Button>
        )}
      </div>

      {isLoading ? <div className="py-10 flex justify-center"><Spinner size={22} /></div>
        : empty ? <EmptyState icon={GraduationCap} title={t('today.allClear')} />
          : (
            <>
              {feed.microlearning && (
                <Link to="/me/programs" className="block rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 hover:bg-primary/10">
                  <span className="text-overline text-primary inline-flex items-center gap-1.5"><Sparkles className="size-3.5" aria-hidden="true" />{t('today.doNow')}</span>
                  <p className="text-sm font-medium mt-0.5">{feed.microlearning.title}</p>
                  {feed.microlearning.dueDate && <p className="text-xs text-muted-foreground">{t('today.due')} {fmtDate(feed.microlearning.dueDate)}</p>}
                </Link>
              )}

              {feed.overdue.length > 0 && (
                <Section icon={<AlertTriangle className="size-4" aria-hidden="true" />} title={t('today.overdue')} tone="text-destructive">
                  <div className="space-y-1.5">{feed.overdue.map((a) => <AssignmentRow key={a.id} a={a} />)}</div>
                </Section>
              )}

              {feed.dueSoon.length > 0 && (
                <Section icon={<CalendarClock className="size-4" aria-hidden="true" />} title={t('today.dueSoon')} tone="text-warning">
                  <div className="space-y-1.5">{feed.dueSoon.map((a) => <AssignmentRow key={a.id} a={a} />)}</div>
                </Section>
              )}

              {feed.upcomingSessions.length > 0 && (
                <Section icon={<CalendarClock className="size-4" aria-hidden="true" />} title={t('today.upcoming')}>
                  <div className="space-y-1.5">
                    {feed.upcomingSessions.map((s) => (
                      <div key={s.id} className="rounded-lg border border-border bg-card px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{s.topic}</span>
                          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{fmtDateTime(s.startTime)}</span>
                        </div>
                        {s.cohort && <span className="text-xs text-muted-foreground">{s.cohort}</span>}
                        {s.joinUrl && <a href={s.joinUrl} target="_blank" rel="noreferrer" className="text-xs text-primary ml-2">{t('today.join')}</a>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
    </div>
  );
}
