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
  const title = editing
    ? t('englishOperations.schedule.editTitle', { session: schedule.sessionNumber })
    : t('englishOperations.schedule.createTitle');
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-label={t('englishOperations.schedule.editorTitle')}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col overflow-hidden rounded-t-xl border-t border-border bg-card shadow-xl lg:static lg:inset-auto lg:z-auto lg:max-h-[calc(100vh-190px)] lg:rounded-lg lg:border lg:shadow-none"
      >
        <div className="flex justify-center pb-1 pt-2.5 lg:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        <header className="flex shrink-0 items-start gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {editing ? <CalendarClock className="size-4 text-primary" /> : <CalendarPlus2 className="size-4 text-primary" />}
              <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {editing
                ? `${schedule.classId.classCode} · ${schedule.classId.courseName}`
                : t('englishOperations.schedule.createHint')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('englishOperations.schedule.closeCreate')}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {schedule?.sourceWasImported && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
              {t('englishOperations.schedule.importedBaseline')}
            </div>
          )}
          {isCancelled && (
            <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">
              {t('englishOperations.schedule.cancelledReadOnly', { reason: schedule.cancellationReason || '—' })}
            </div>
          )}
          {editing && isPast && !isCancelled && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {t('englishOperations.schedule.pastReadOnly')}
            </div>
          )}

          {!isCancelled && (
            <form id="english-meeting-form" onSubmit={submit} className="space-y-3">
              <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
              <span>{t('englishOperations.schedule.run')}</span>
              <select
                  className="flex h-(--control-h) w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-60"
                value={run?.id || ''}
                onChange={(event) => setCourseRunId(event.target.value)}
                disabled={editing}
              >
                {runs.map((row) => <option key={row.id} value={row.id}>{row.classCode} · {row.courseName} · #{row.runNumber}</option>)}
              </select>
            </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
                  <span>{t('englishOperations.schedule.date')}</span>
                  <Input type="date" value={date} min={localDate()} onChange={(event) => setDate(event.target.value)} required disabled={editing && !editable} />
                </label>
                <label className="space-y-1 text-[11px] font-medium text-muted-foreground">
                  <span>{t('englishOperations.schedule.timeSlot')}</span>
                  <select
                    className="flex h-(--control-h) w-full rounded-md border border-input bg-background px-2 text-xs text-foreground disabled:opacity-60"
                    value={slot?.id || ''}
                    onChange={(event) => setSlotId(event.target.value)}
                    disabled={editing && !editable}
                  >
                    {config.slots.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </label>
              </div>

              {editing && editable && (
                <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
                  <span>{t('englishOperations.schedule.changeReason')}</span>
                  <Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={t('englishOperations.schedule.changeReasonPlaceholder')} />
                </label>
              )}
            </form>
          )}

          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <BellRing className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t('englishOperations.schedule.notificationHint')}</p>
          </div>

          {confirmingCancel && (
            <div className="rounded-md border border-destructive/25 bg-destructive/5 p-3">
              <label className="block space-y-1 text-[11px] font-medium text-muted-foreground">
                <span>{t('englishOperations.schedule.cancellationReason')}</span>
                <textarea
                  className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground"
                  value={cancellationReason}
                  maxLength={500}
                  onChange={(event) => setCancellationReason(event.target.value)}
                  placeholder={t('englishOperations.schedule.cancellationReasonPlaceholder')}
                />
              </label>
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2.5">
          {confirmingCancel ? (
            <>
              <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setConfirmingCancel(false)}>
                {t('englishOperations.schedule.keepSession')}
              </Button>
              <span className="flex-1" />
              <Button type="button" size="sm" variant="destructive" className="h-8 text-xs" disabled={cancellationReason.trim().length < 3 || pending} onClick={cancelMeeting}>
                {t('englishOperations.schedule.confirmCancel')}
              </Button>
            </>
          ) : (
            <>
              {editing && editable && (
                <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmingCancel(true)}>
                  <Trash2 className="size-3.5" />
                  {t('englishOperations.schedule.cancelSession')}
                </Button>
              )}
              <span className="flex-1" />
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onClose}>
                {t('englishOperations.schedule.cancel')}
              </Button>
              {!isCancelled && (
                <Button
                  type="submit"
                  form="english-meeting-form"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!run || !slot || pending || (editing && !editable)}
                >
                  {editing
                    ? t('englishOperations.schedule.saveChanges')
                    : t('englishOperations.schedule.createSession', { session: run?.nextSessionNumber || 1 })}
                </Button>
              )}
            </>
          )}
        </footer>
      </aside>
    </>
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

      <SchedulesPage
        allowedClassIds={[]}
        allowCreate={false}
        historicalOnly
        hideHeader
        historicalSchedules={schedules}
        defaultWeek={schedules[0]?.startTime}
        selectedHistoricalCellKey={selectedCellKey}
        onHistoricalCellClick={(prefill) => setEditor({ mode: 'create', prefill })}
        onHistoricalScheduleClick={(schedule) => setEditor({ mode: 'edit', schedule })}
        historicalDrawer={editor ? (
          <MeetingForm
            key={`${editor.mode}:${editor.schedule?.meetingId || editor.prefill?.startTime || 'manual'}`}
            editor={editor}
            runs={activeRuns}
            config={config.data || { slots: [] }}
            onClose={() => setEditor(null)}
          />
        ) : null}
      />
    </div>
  );
}
