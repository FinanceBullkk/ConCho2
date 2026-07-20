import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '../../components/Spinner';
import { useSchedulingConfig, DEFAULT_UTC_OFFSET_MINUTES } from '../../hooks/useSchedulingConfig';
import { slotToUtcRange } from '../../lib/scheduling-slots';
import SchedulesPage from '../schedule/SchedulesPage';
import { adaptHistoricalSessions } from './historical-session-adapter';
import {
  useCanonicalEnglishCourseRuns,
  useCanonicalEnglishSessions,
  useCreateCanonicalEnglishSession,
} from './useEnglishOperations';

const localDate = () => {
  const value = new Date();
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function MeetingForm({ runs, config }) {
  const { t } = useTranslation();
  const mutation = useCreateCanonicalEnglishSession();
  const [courseRunId, setCourseRunId] = useState(runs[0]?.id || '');
  const [date, setDate] = useState(localDate());
  const [slotId, setSlotId] = useState(config.slots[0]?.id || '');
  const run = runs.find((row) => row.id === courseRunId) || runs[0];
  const slot = config.slots.find((row) => row.id === slotId) || config.slots[0];
  const submit = async (event) => {
    event.preventDefault();
    const [year, month, day] = date.split('-').map(Number);
    const range = slotToUtcRange(
      new Date(year, month - 1, day),
      slot,
      config.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES,
    );
    await mutation.mutateAsync({
      courseRunId: run.id,
      data: {
        startsAt: range.startISO,
        endsAt: range.endISO,
        confirmedSessionNumber: run.nextSessionNumber,
      },
    });
  };
  if (!runs.length || !config.slots.length) return null;
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_180px_180px_auto] md:items-end">
      <label className="space-y-1 text-sm text-muted-foreground">
        <span>{t('englishOperations.schedule.run')}</span>
        <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={run?.id || ''} onChange={(event) => setCourseRunId(event.target.value)}>
          {runs.map((row) => <option key={row.id} value={row.id}>{row.classCode} · {row.courseName} · #{row.runNumber}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-sm text-muted-foreground"><span>{t('englishOperations.schedule.date')}</span><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
      <label className="space-y-1 text-sm text-muted-foreground">
        <span>{t('englishOperations.schedule.timeSlot')}</span>
        <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={slot?.id || ''} onChange={(event) => setSlotId(event.target.value)}>{config.slots.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select>
      </label>
      <Button type="submit" disabled={!run || !slot || mutation.isPending}>{t('englishOperations.schedule.createSession', { session: run?.nextSessionNumber || 1 })}</Button>
    </form>
  );
}

export default function SchedulePanel() {
  const { t } = useTranslation();
  const sessions = useCanonicalEnglishSessions(true);
  const runs = useCanonicalEnglishCourseRuns();
  const config = useSchedulingConfig();
  const schedules = useMemo(() => adaptHistoricalSessions(sessions.data, {
    historical: t('englishOperations.schedule.canonical'),
    readOnly: t('englishOperations.schedule.importedReadOnly'),
    live: t('englishOperations.schedule.live'),
  }), [sessions.data, t]);

  if (sessions.isLoading || runs.isLoading || config.isLoading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div className="space-y-4">
      <MeetingForm runs={runs.data || []} config={config.data || { slots: [] }} />
      <SchedulesPage
        allowedClassIds={[]}
        allowCreate={false}
        historicalOnly
        historicalSchedules={schedules}
        defaultWeek={schedules[0]?.startTime}
      />
    </div>
  );
}
