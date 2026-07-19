import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useEnglishClasses,
  useEnglishEligibility,
  useEnglishSession,
  useEnglishSessionAttendance,
  useEnglishSessions,
  useMarkEnglishAttendance,
} from './useEnglishOperations';

const ATTENDANCE_STATES = ['P', 'L', 'A', 'EL'];

const idOf = (value) => String(value?._id || value || '');

function StatusButtons({ value, disabled, onChange, t }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ATTENDANCE_STATES.map((code) => (
        <Button
          key={code}
          type="button"
          size="sm"
          variant={value === code ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => onChange(code)}
          aria-label={t(`englishOperations.attendance.states.${code}`)}
        >
          {code}
        </Button>
      ))}
    </div>
  );
}

export default function AttendancePanel() {
  const { t } = useTranslation();
  const classes = useEnglishClasses();
  const sessions = useEnglishSessions(classes.data || []);
  const [selectedId, setSelectedId] = useState('');
  const [overrides, setOverrides] = useState({});
  const selected = (sessions.data || []).find((row) => idOf(row.scheduleId || row._id) === selectedId)
    || sessions.data?.[0]
    || null;
  const sessionId = idOf(selected?.scheduleId || selected?._id);
  const cohortId = idOf(selected?.cohortId || selected?.classId);
  const session = useEnglishSession(sessionId);
  const attendance = useEnglishSessionAttendance(sessionId);
  const eligibility = useEnglishEligibility(cohortId);
  const mutation = useMarkEnglishAttendance();
  const currentNumber = Number(session.data?.sessionNumber || selected?.sessionNumber || 0);

  const rows = useMemo(() => {
    const existing = new Map((attendance.data || []).map((mark) => [idOf(mark.userId), mark.status]));
    const starts = new Map((eligibility.data?.learners || []).map((learner) => [idOf(learner.userId), Number(learner.startSessionNumber || 1)]));
    return (session.data?.enrolledLearners || []).map((learner) => {
      const userId = idOf(learner);
      const key = `${sessionId}:${userId}`;
      const startSessionNumber = starts.get(userId) || 1;
      return {
        ...learner,
        userId,
        startSessionNumber,
        notApplicable: currentNumber > 0 && currentNumber < startSessionNumber,
        status: overrides[key] ?? existing.get(userId) ?? null,
      };
    });
  }, [attendance.data, currentNumber, eligibility.data?.learners, overrides, session.data?.enrolledLearners, sessionId]);

  const setOne = (userId, status) => setOverrides((current) => ({
    ...current,
    [`${sessionId}:${userId}`]: status,
  }));
  const markAllPresent = () => setOverrides((current) => ({
    ...current,
    ...Object.fromEntries(rows.filter((row) => !row.notApplicable).map((row) => [`${sessionId}:${row.userId}`, 'P'])),
  }));
  const save = async () => {
    const records = rows
      .filter((row) => !row.notApplicable && row.status)
      .map((row) => ({ userId: row.userId, status: row.status }));
    await mutation.mutateAsync({ sessionId, records });
  };
  const runById = new Map((classes.data || []).map((run) => [idOf(run._id), run]));
  const hasMarkedRows = rows.some((row) => !row.notApplicable && row.status);

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-2">
        {(sessions.data || []).map((row) => {
          const id = idOf(row.scheduleId || row._id);
          const run = runById.get(idOf(row.cohortId || row.classId));
          return (
            <button
              type="button"
              key={id}
              onClick={() => setSelectedId(id)}
              className={`w-full rounded-lg border p-3 text-left text-sm ${sessionId === id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50'}`}
            >
              <span className="block font-medium text-foreground">{run?.englishGroupCode} · {run?.cohortCode}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t('englishOperations.attendance.session', { number: row.sessionNumber || '—' })} · {new Date(row.startTime).toLocaleString()}
              </span>
            </button>
          );
        })}
        {!sessions.isLoading && (sessions.data || []).length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t('englishOperations.attendance.empty')}
          </p>
        )}
      </aside>

      {selected && (
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground">{t('englishOperations.attendance.roster')}</h3>
                <p className="text-sm text-muted-foreground">
                  {new Date(selected.startTime).toLocaleString()} · {t('englishOperations.attendance.marked', { marked: rows.filter((row) => row.status).length, total: rows.filter((row) => !row.notApplicable).length })}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={markAllPresent} disabled={rows.length === 0}>
                  <Check className="size-4" />{t('englishOperations.attendance.allPresent')}
                </Button>
                <Button type="button" onClick={save} disabled={!hasMarkedRows || mutation.isPending}>
                  {t('englishOperations.attendance.save')}
                </Button>
              </div>
            </div>
            <div className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border">
              {rows.map((row) => (
                <div key={row.userId} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">{row.name} · {row.empCode}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.notApplicable
                        ? t('englishOperations.attendance.notApplicable', { number: row.startSessionNumber })
                        : row.department || '—'}
                    </div>
                  </div>
                  <StatusButtons value={row.status} disabled={row.notApplicable} onChange={(status) => setOne(row.userId, status)} t={t} />
                </div>
              ))}
              {!session.isLoading && rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">{t('englishOperations.attendance.noRoster')}</p>}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold text-foreground">{t('englishOperations.attendance.eligibility')}</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2">{t('englishOperations.attendance.learner')}</th><th className="pb-2">{t('englishOperations.attendance.absences')}</th><th className="pb-2">{t('englishOperations.attendance.result')}</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {(eligibility.data?.learners || []).map((learner) => (
                    <tr key={learner.userId}>
                      <td className="py-2">{learner.name} · {learner.empCode}</td>
                      <td className="py-2 tabular-nums">{learner.eligibility.absenceCount} / {learner.eligibility.allowedAbsences}</td>
                      <td className="py-2">{t(`englishOperations.attendance.eligibilityStates.${learner.eligibility.status}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
