import { useState } from 'react';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import {
  useEnglishLevels, useEnglishPendingExamEntries, useEnglishCourseRun,
  useRecordExamResult, useDeleteExamResult,
} from './useEnglishTraining';

// One roster row: HR picks a level + exam date for an eligible learner, or clears
// an existing result. Learners who cannot sit (>2 absences / non-participating)
// show a disabled state — the server enforces the same gate.
function LevelEntryRow({ learner, levels, t }) {
  const record = useRecordExamResult();
  const remove = useDeleteExamResult();
  const [levelCode, setLevelCode] = useState(learner.examLevelCode || '');
  const [examDate, setExamDate] = useState(learner.examDate ? String(learner.examDate).slice(0, 10) : '');
  const canSave = learner.sitEligible && levelCode && examDate && !record.isPending;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 text-foreground">{[learner.empCode, learner.fullName].filter(Boolean).join(' · ')}</td>
      <td className="px-4 py-3 text-foreground">{learner.absenceCount ?? 0}</td>
      <td className="px-4 py-3">
        {learner.sitEligible
          ? <span className="text-emerald-600 dark:text-emerald-400">{t('englishTraining.exam.eligible')}</span>
          : <span className="text-muted-foreground">{t('englishTraining.exam.notEligible')}</span>}
      </td>
      <td className="px-4 py-3">
        <select value={levelCode} onChange={(e) => setLevelCode(e.target.value)} disabled={!learner.sitEligible}
          aria-label={t('englishTraining.exam.level')}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm disabled:opacity-50">
          <option value="">{t('englishTraining.exam.pickLevel')}</option>
          {levels.map((lv) => <option key={lv.code} value={lv.code}>{lv.displayName}</option>)}
        </select>
      </td>
      <td className="px-4 py-3">
        <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} disabled={!learner.sitEligible}
          aria-label={t('englishTraining.exam.date')}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm disabled:opacity-50" />
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => record.mutate({ enrollmentId: learner.id, levelCode, examDate })} disabled={!canSave}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {t('englishTraining.exam.save')}
          </button>
          {learner.examLevelCode && (
            <button type="button" onClick={() => remove.mutate(learner.id)} disabled={remove.isPending}
              className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium disabled:opacity-50">
              {t('englishTraining.exam.clear')}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function RunRoster({ runId, levels, t }) {
  const run = useEnglishCourseRun(runId);
  if (run.isLoading) return <div className="flex justify-center py-8"><Spinner size={24} label={t('englishTraining.loading')} /></div>;
  if (run.isError) return <EmptyState title={t('englishTraining.loadError')} />;
  const roster = run.data?.roster || [];
  return (
    <section className="space-y-3" aria-label={t('englishTraining.exam.roster')}>
      <h2 className="text-h3 text-foreground">
        {run.data.classCode} · {run.data.courseName}{run.data.runNumber ? ` · #${run.data.runNumber}` : ''}
      </h2>
      {roster.length
        ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left"><tr>
                {['employee', 'absences', 'eligibility', 'level', 'date', 'actions'].map((c) => (
                  <th key={c} className="px-4 py-3 font-medium">{t(`englishTraining.exam.col.${c}`)}</th>
                ))}
              </tr></thead>
              <tbody>{roster.map((learner) => <LevelEntryRow key={learner.id} learner={learner} levels={levels} t={t} />)}</tbody>
            </table>
          </div>
        )
        : <EmptyState title={t('englishTraining.empty')} />}
    </section>
  );
}

export default function EvaluationView({ t }) {
  const [selectedRun, setSelectedRun] = useState(null);
  const pending = useEnglishPendingExamEntries();
  const levelsQuery = useEnglishLevels();
  const levels = levelsQuery.data || [];

  if (pending.isLoading || levelsQuery.isLoading) {
    return <div className="flex justify-center py-12"><Spinner size={32} label={t('englishTraining.loading')} /></div>;
  }
  if (pending.isError) return <EmptyState title={t('englishTraining.loadError')} />;

  const rows = pending.data || [];
  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-label={t('englishTraining.exam.needsLevel')}>
        <h2 className="text-h3 text-foreground">{t('englishTraining.exam.needsLevel')}</h2>
        {rows.length
          ? (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left"><tr>
                  {['classCode', 'courseName', 'endDate', 'pending', 'actions'].map((c) => (
                    <th key={c} className="px-4 py-3 font-medium">{t(`englishTraining.exam.col.${c}`)}</th>
                  ))}
                </tr></thead>
                <tbody>{rows.map((row) => (
                  <tr key={row.courseRunId} className={`border-b border-border last:border-0 ${selectedRun === row.courseRunId ? 'bg-primary/5' : ''}`}>
                    <td className="px-4 py-3 text-foreground">{row.classCode}</td>
                    <td className="px-4 py-3 text-foreground">{row.courseName}</td>
                    <td className="px-4 py-3 text-foreground">{row.endDate ? String(row.endDate).slice(0, 10) : '—'}</td>
                    <td className="px-4 py-3 text-foreground">{row.pendingCount}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setSelectedRun(row.courseRunId)}
                        className="font-medium text-primary hover:underline underline-offset-2">
                        {t('englishTraining.exam.enterLevels')}
                      </button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )
          : <EmptyState title={t('englishTraining.exam.allDone')} />}
      </section>

      {selectedRun && <RunRoster runId={selectedRun} levels={levels} t={t} />}
    </div>
  );
}
