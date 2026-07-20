import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { EngBadge } from './eng-status-badge';
import { useEnglishClassDetail } from './useEnglishTraining';

const attendanceSummary = (learner, run) => {
  const target = Math.round(Number(run.attendanceThresholdRatio || learner.attendanceThresholdRatio || 0) * 100);
  if (!learner.markedCount) return `— / ${target}%`;
  const ratio = Math.round(Number(learner.attendanceRatio || 0) * 100);
  return `${learner.presentCount}/${learner.markedCount} · ${ratio}% / ${target}%`;
};

// Class 360° (read-only): open one class and see everything HR needs in one
// place — its course runs, per-learner attendance against the run threshold,
// exam eligibility, and level — instead of jumping tabs.

function RunRoster({ run, t }) {
  const cols = [
    t('englishTraining.columns.employee'),
    t('englishTraining.classDetail.attendance'),
    t('englishTraining.columns.eligibilityStatus'),
    t('englishTraining.exam.col.level'),
    t('englishTraining.classDetail.examDate'),
  ];
  return (
    <section className="space-y-3" aria-label={`${run.courseName} · #${run.runNumber}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-h3 text-foreground">{run.courseName}</h3>
        <span className="text-sm text-muted-foreground">#{run.runNumber}</span>
        <EngBadge status={run.status} />
      </div>
      {run.roster.length ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left"><tr>
              {cols.map((c) => <th key={c} className="px-4 py-3 font-medium">{c}</th>)}
            </tr></thead>
            <tbody>{run.roster.map((r) => (
              <tr key={r.enrollmentId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-foreground">{r.empCode} · {r.fullName}</td>
                <td className="px-4 py-3 text-foreground">
                  {attendanceSummary(r, run)}
                </td>
                <td className="px-4 py-3"><EngBadge status={r.eligibilityStatus} /></td>
                <td className="px-4 py-3 text-foreground">{r.examLevelName || r.examLevelCode || '—'}</td>
                <td className="px-4 py-3 text-foreground">
                  {r.examDate ? new Date(r.examDate).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <EmptyState title={t('englishTraining.classDetail.noRoster')} />}
    </section>
  );
}

export default function ClassDetailView({ classId, onBack, t }) {
  const { data, isLoading, isError } = useEnglishClassDetail(classId);

  const back = (
    <button type="button" onClick={onBack}
      className="text-sm font-medium text-primary hover:underline underline-offset-2">
      {t('englishTraining.classDetail.back')}
    </button>
  );

  if (isLoading) return <div className="space-y-4">{back}<div className="flex justify-center py-12"><Spinner size={32} label={t('englishTraining.loading')} /></div></div>;
  if (isError) return <div className="space-y-4">{back}<EmptyState title={t('englishTraining.loadError')} /></div>;
  if (!data) return <div className="space-y-4">{back}<EmptyState title={t('englishTraining.empty')} /></div>;

  return (
    <div className="space-y-6">
      {back}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-h2 text-foreground">{data.classCode}</h2>
        <EngBadge status={data.status} />
        {data.displayName && <span className="text-sm text-muted-foreground">{data.displayName}</span>}
      </div>
      {data.runs.length
        ? <div className="space-y-8">{data.runs.map((run) => <RunRoster key={run.id} run={run} t={t} />)}</div>
        : <EmptyState title={t('englishTraining.classDetail.noRuns')} />}
    </div>
  );
}
