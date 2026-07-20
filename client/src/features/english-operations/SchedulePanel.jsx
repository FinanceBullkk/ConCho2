import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, CalendarClock, CalendarPlus2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '../../components/Spinner';
import { useSchedulingConfig, DEFAULT_UTC_OFFSET_MINUTES } from '../../hooks/useSchedulingConfig';
import { scheduleSlotId, slotToUtcRange } from '../../lib/scheduling-slots';
import SchedulesPage from '../schedule/SchedulesPage';
import { adaptHistoricalSessions } from './historical-session-adapter';
import {
  useCancelCanonicalEnglishMeeting,
  useCanonicalEnglishCourseRuns,
  useCanonicalEnglishSessions,
  useCreateCanonicalEnglishSession,
  useRescheduleCanonicalEnglishMeeting,
} from './useEnglishOperations';

const localDate = () => {
  const value = new Date();
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const localDateKey = (value) => {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const dateAtOffset = (value, offsetMinutes) => {
  const shifted = new Date(new Date(value).getTime() + offsetMinutes * 60000);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, '0'),
    String(shifted.getUTCDate()).padStart(2, '0'),
  ].join('-');
};

const defaultFutureDate = (config, offsetMinutes) => {
  const today = new Date();
  const firstSlot = config.slots[0];
  if (!firstSlot) return localDate();
  const todayRange = slotToUtcRange(today, firstSlot, offsetMinutes);
  if (new Date(todayRange.startISO) > new Date()) return localDateKey(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localDateKey(tomorrow);
};

function MeetingForm({ editor, runs, config, onClose }) {
  const { t } = useTranslation();
  const createMutation = useCreateCanonicalEnglishSession();
  const updateMutation = useRescheduleCanonicalEnglishMeeting();
  const cancelMutation = useCancelCanonicalEnglishMeeting();
  const offset = config.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES;
  const editing = editor.mode === 'edit';
  const schedule = editor.schedule;
  const initialRunId = schedule?.courseRunId || runs[0]?.id || '';
  const initialSlotId = editor.prefill?.slot?.id
    || (schedule ? scheduleSlotId(schedule, offset) : config.slots[0]?.id)
    || '';
  const [courseRunId, setCourseRunId] = useState(initialRunId);
  const [date, setDate] = useState(
    editor.prefill?.day ? localDateKey(editor.prefill.day)
      : schedule ? dateAtOffset(schedule.startTime, offset)
        : defaultFutureDate(config, offset),
  );
  const [slotId, setSlotId] = useState(initialSlotId);
  const [reason, setReason] = useState('');
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const run = runs.find((row) => row.id === courseRunId) || runs[0];
  const slot = config.slots.find((row) => row.id === slotId) || config.slots[0];
  const isCancelled = schedule?.status === 'cancelled';
  const isPast = schedule ? new Date(schedule.startTime) <= new Date() : false;
  const editable = editing && !isCancelled && !isPast;
  const pending = createMutation.isPending || updateMutation.isPending || cancelMutation.isPending;

  const submit = async (event) => {
    event.preventDefault();
    const [year, month, day] = date.split('-').map(Number);
    const range = slotToUtcRange(
      new Date(year, month - 1, day),
      slot,
      offset,
    );
    if (editing) {
      await updateMutation.mutateAsync({
        courseRunId: schedule.courseRunId,
        meetingId: schedule.meetingId,
        data: { startsAt: range.startISO, endsAt: range.endISO, reason: reason || undefined },
      });
    } else {
      await createMutation.mutateAsync({
        courseRunId: run.id,
        data: {
          startsAt: range.startISO,
          endsAt: range.endISO,
          confirmedSessionNumber: run.nextSessionNumber,
        },
      });
    }
    onClose();
  };

  const cancelMeeting = async () => {
    await cancelMutation.mutateAsync({
      courseRunId: schedule.courseRunId,
      meetingId: schedule.meetingId,
      data: { cancellationReason },
    });
    onClose();
  };

  if (!runs.length || !config.slots.length) return null;
  return (
    <section className="rounded-lg border border-primary/20 bg-card p-4 shadow-sm" aria-label={t('englishOperations.schedule.editorTitle')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {editing ? <CalendarClock className="size-4 text-primary" /> : <CalendarPlus2 className="size-4 text-primary" />}
            <h2 className="font-semibold text-foreground">
              {editing
                ? t('englishOperations.schedule.editTitle', { session: schedule.sessionNumber })
                : t('englishOperations.schedule.createTitle')}
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {editing
              ? `${schedule.classId.classCode} · ${schedule.classId.courseName}`
              : t('englishOperations.schedule.createHint')}
          </p>
        </div>
        <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label={t('englishOperations.schedule.closeCreate')}>
          <X className="size-4" />
        </Button>
      </div>

      {isCancelled && (
        <div className="mt-4 rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">
          {t('englishOperations.schedule.cancelledReadOnly', { reason: schedule.cancellationReason || '—' })}
        </div>
      )}
      {editing && isPast && !isCancelled && (
        <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t('englishOperations.schedule.pastReadOnly')}
        </div>
      )}

      {!isCancelled && (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto] md:items-end">
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>{t('englishOperations.schedule.run')}</span>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60"
                value={run?.id || ''}
                onChange={(event) => setCourseRunId(event.target.value)}
                disabled={editing}
              >
                {runs.map((row) => <option key={row.id} value={row.id}>{row.classCode} · {row.courseName} · #{row.runNumber}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>{t('englishOperations.schedule.date')}</span>
              <Input type="date" value={date} min={localDate()} onChange={(event) => setDate(event.target.value)} required disabled={!editing ? false : !editable} />
            </label>
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>{t('englishOperations.schedule.timeSlot')}</span>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60"
                value={slot?.id || ''}
                onChange={(event) => setSlotId(event.target.value)}
                disabled={editing && !editable}
              >
                {config.slots.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
            </label>
            <Button type="submit" disabled={!run || !slot || pending || (editing && !editable)}>
              {editing
                ? t('englishOperations.schedule.saveChanges')
                : t('englishOperations.schedule.createSession', { session: run?.nextSessionNumber || 1 })}
            </Button>
          </div>

          {editing && editable && (
            <label className="block space-y-1 text-sm text-muted-foreground">
              <span>{t('englishOperations.schedule.changeReason')}</span>
              <Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={t('englishOperations.schedule.changeReasonPlaceholder')} />
            </label>
          )}
        </form>
      )}

      <div className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
        <BellRing className="size-4 shrink-0 text-primary" />
        <p className="flex-1 text-xs text-muted-foreground">{t('englishOperations.schedule.notificationHint')}</p>
        {editing && editable && !confirmingCancel && (
          <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmingCancel(true)}>
            <Trash2 className="size-4" />
            {t('englishOperations.schedule.cancelSession')}
          </Button>
        )}
      </div>

      {confirmingCancel && (
        <div className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 p-3">
          <label className="block space-y-1 text-sm text-muted-foreground">
            <span>{t('englishOperations.schedule.cancellationReason')}</span>
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={cancellationReason}
              maxLength={500}
              onChange={(event) => setCancellationReason(event.target.value)}
              placeholder={t('englishOperations.schedule.cancellationReasonPlaceholder')}
            />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmingCancel(false)}>{t('englishOperations.schedule.keepSession')}</Button>
            <Button type="button" size="sm" variant="destructive" disabled={cancellationReason.trim().length < 3 || pending} onClick={cancelMeeting}>
              {t('englishOperations.schedule.confirmCancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function SchedulePanel() {
  const { t } = useTranslation();
  const sessions = useCanonicalEnglishSessions(true);
  const runs = useCanonicalEnglishCourseRuns();
  const config = useSchedulingConfig();
  const [editor, setEditor] = useState(null);
  const schedules = useMemo(() => adaptHistoricalSessions(sessions.data, {
    historical: t('englishOperations.schedule.canonical'),
    readOnly: t('englishOperations.schedule.importedReadOnly'),
    live: t('englishOperations.schedule.live'),
    cancelled: t('englishOperations.schedule.cancelledStatus'),
  }), [sessions.data, t]);

  if (sessions.isLoading || runs.isLoading || config.isLoading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  const activeRuns = runs.data || [];
  const liveCount = schedules.filter((row) => row.sourceKind === 'live').length;
  const importedCount = schedules.length - liveCount;
  const selectedCellKey = editor?.mode === 'create' && editor.prefill
    ? `${localDateKey(editor.prefill.day)}|${editor.prefill.slot.id}`
    : editor?.mode === 'edit' && editor.schedule
      ? `${dateAtOffset(editor.schedule.startTime, config.data?.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES)}|${scheduleSlotId(editor.schedule, config.data?.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES)}`
      : null;

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-foreground">{t('englishOperations.schedule.calendarTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('englishOperations.schedule.calendarSummary', {
              live: liveCount,
              imported: importedCount,
              runs: activeRuns.length,
            })}
          </p>
        </div>
        <Button onClick={() => setEditor({ mode: 'create' })} disabled={!activeRuns.length || !config.data?.slots?.length}>
          <CalendarPlus2 className="size-4" />
          {t('englishOperations.schedule.add')}
        </Button>
      </section>

      {editor && (
        <MeetingForm
          key={`${editor.mode}:${editor.schedule?.meetingId || editor.prefill?.startTime || 'manual'}`}
          editor={editor}
          runs={activeRuns}
          config={config.data || { slots: [] }}
          onClose={() => setEditor(null)}
        />
      )}

      <SchedulesPage
        allowedClassIds={[]}
        allowCreate={false}
        historicalOnly
        historicalSchedules={schedules}
        defaultWeek={schedules[0]?.startTime}
        selectedHistoricalCellKey={selectedCellKey}
        onHistoricalCellClick={(prefill) => setEditor({ mode: 'create', prefill })}
        onHistoricalScheduleClick={(schedule) => setEditor({ mode: 'edit', schedule })}
      />
    </div>
  );
}
