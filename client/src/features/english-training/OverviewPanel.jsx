import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { useEnglishOverview } from './useEnglishTraining';

// A stat tile. When `onClick` is set it becomes an actionable "needs attention"
// card (button) that jumps to the relevant tab; otherwise it is a passive metric.
function Stat({ label, value, sub, tone = 'neutral', onClick, cta }) {
  const toneCls = {
    neutral: 'border-border bg-card',
    warning: 'border-warning/30 bg-warning-tint',
    danger: 'border-destructive/30 bg-destructive-tint',
    success: 'border-success/30 bg-success-tint',
  }[tone];
  const body = (
    <>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-foreground">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      {onClick && cta && <div className="mt-2 text-sm font-medium text-primary">{cta} →</div>}
    </>
  );
  const cls = `rounded-lg border p-4 text-left ${toneCls}`;
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} transition hover:shadow-sm`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

export default function OverviewPanel({ t, onNavigate }) {
  const { data, isLoading, isError } = useEnglishOverview();
  if (isLoading) return <div className="flex justify-center py-12"><Spinner size={32} label={t('englishTraining.loading')} /></div>;
  if (isError) return <EmptyState title={t('englishTraining.loadError')} />;
  if (!data) return <EmptyState title={t('englishTraining.empty')} />;

  const o = data;
  return (
    <div className="space-y-6">
      {/* Needs attention — the two things HR acts on. */}
      <section className="space-y-3" aria-label={t('englishTraining.overviewPanel.needsAttention')}>
        <h2 className="text-h3 text-foreground">{t('englishTraining.overviewPanel.needsAttention')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label={t('englishTraining.overviewPanel.pendingExam')}
            value={o.pendingExamLearners}
            sub={t('englishTraining.overviewPanel.pendingExamSub', { runs: o.pendingExamRuns })}
            tone={o.pendingExamLearners ? 'warning' : 'success'}
            onClick={() => onNavigate('evaluation')} cta={t('englishTraining.overviewPanel.goEvaluation')} />
          <Stat
            label={t('englishTraining.overviewPanel.openIssues')}
            value={o.openDqIssues}
            sub={t('englishTraining.overviewPanel.openIssuesSub')}
            tone={o.openDqIssues ? 'danger' : 'success'}
            onClick={() => onNavigate('issues')} cta={t('englishTraining.overviewPanel.goIssues')} />
        </div>
      </section>

      {/* At a glance — the shape of the data. */}
      <section className="space-y-3" aria-label={t('englishTraining.overviewPanel.atAGlance')}>
        <h2 className="text-h3 text-foreground">{t('englishTraining.overviewPanel.atAGlance')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('englishTraining.cohorts')} value={o.cohortsTotal}
            sub={t('englishTraining.overviewPanel.activeCount', { count: o.cohortsActive })} />
          <Stat label={t('englishTraining.employees')} value={o.employeesTotal}
            sub={t('englishTraining.overviewPanel.activeCount', { count: o.employeesActive })} />
          <Stat label={t('englishTraining.courses')} value={o.coursesTotal} />
          <Stat label={t('englishTraining.overviewPanel.courseRuns')} value={o.runsTotal}
            sub={t('englishTraining.overviewPanel.completedCount', { count: o.runsCompleted })} />
        </div>
      </section>
    </div>
  );
}
