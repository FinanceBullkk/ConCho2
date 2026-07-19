import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useDeleteEnglishEvaluation,
  useEnglishClasses,
  useEnglishEvaluations,
  useRecordEnglishEvaluation,
} from './useEnglishOperations';

export default function EvaluationPanel() {
  const { t } = useTranslation();
  const classes = useEnglishClasses();
  const [selectedId, setSelectedId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [evaluationDate, setEvaluationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const cohortId = selectedId || classes.data?.[0]?._id || '';
  const worklist = useEnglishEvaluations(cohortId);
  const saveMutation = useRecordEnglishEvaluation();
  const deleteMutation = useDeleteEnglishEvaluation();

  const levelFor = (learner) => drafts[learner.userId] ?? learner.evaluation?.levelCode ?? '';
  const save = async (learner) => {
    await saveMutation.mutateAsync({
      cohortId,
      data: {
        userId: learner.userId,
        levelCode: levelFor(learner),
        evaluatedAt: new Date(`${evaluationDate}T00:00:00.000Z`).toISOString(),
      },
    });
  };
  const clear = async (learner) => {
    if (!learner.evaluation) return;
    await deleteMutation.mutateAsync(learner.evaluation._id);
    setDrafts((current) => ({ ...current, [learner.userId]: '' }));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.evaluation.run')}</span>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            value={cohortId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {(classes.data || []).map((run) => <option key={run._id} value={run._id}>{run.englishGroupCode} · {run.cohortCode} · {run.programName}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>{t('englishOperations.evaluation.date')}</span>
          <Input type="date" value={evaluationDate} onChange={(event) => setEvaluationDate(event.target.value)} />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t('englishOperations.evaluation.learner')}</th>
              <th className="px-4 py-3">{t('englishOperations.evaluation.absences')}</th>
              <th className="px-4 py-3">{t('englishOperations.evaluation.eligibility')}</th>
              <th className="px-4 py-3">{t('englishOperations.evaluation.level')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(worklist.data?.learners || []).map((learner) => {
              const eligible = learner.eligibility.status === 'eligible';
              const levelCode = levelFor(learner);
              return (
                <tr key={learner.userId}>
                  <td className="px-4 py-3"><span className="font-medium text-foreground">{learner.name}</span><span className="block text-xs text-muted-foreground">{learner.empCode}</span></td>
                  <td className="px-4 py-3 tabular-nums">{learner.eligibility.absenceCount} / {learner.eligibility.allowedAbsences}</td>
                  <td className="px-4 py-3">{t(`englishOperations.attendance.eligibilityStates.${learner.eligibility.status}`)}</td>
                  <td className="px-4 py-3">
                    <select
                      value={levelCode}
                      disabled={!eligible}
                      onChange={(event) => setDrafts((current) => ({ ...current, [learner.userId]: event.target.value }))}
                      className="flex h-9 min-w-52 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
                    >
                      <option value="">{t('englishOperations.evaluation.selectLevel')}</option>
                      {(worklist.data?.levels || []).map((level) => <option key={level.code} value={level.code}>{level.displayName}</option>)}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {learner.evaluation && <Button type="button" size="sm" variant="ghost" onClick={() => clear(learner)} disabled={deleteMutation.isPending}>{t('englishOperations.evaluation.clear')}</Button>}
                    <Button type="button" size="sm" onClick={() => save(learner)} disabled={!eligible || !levelCode || saveMutation.isPending}>{t('englishOperations.evaluation.save')}</Button>
                  </td>
                </tr>
              );
            })}
            {!worklist.isLoading && (worklist.data?.learners || []).length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">{t('englishOperations.evaluation.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t('englishOperations.evaluation.noSyntheticScore')}</p>
    </div>
  );
}
