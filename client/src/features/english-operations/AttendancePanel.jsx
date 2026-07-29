import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CheckCircle2, CircleDashed, ListFilter } from 'lucide-react';
import { Spinner } from '../../components/Spinner';
import { AttendanceDrawer } from '../../components/AttendanceDrawer';
import { Button } from '@/components/ui/button';
import { useAuth } from '../../context/AuthContext';
import { getMonday } from '../../components/CalendarGrid';
import AttendancePage from '../attendance/AttendancePage';
import { adaptHistoricalSessions } from './historical-session-adapter';
import {
  useCanonicalEnglishAttendanceRoster,
  useEnglishArchiveSessionAttendance,
  useEnglishSessionsSummary,
  useEnglishSessionsWindow,
  useSaveCanonicalEnglishAttendance,
} from './useEnglishOperations';

const ATTENDANCE_STATES = ['P', 'A'];
const FILTERS = ['all', 'needsEvidence', 'recorded', 'upcoming'];

const attendanceBucket = (schedule, now = new Date()) => {
  if (new Date(schedule.startTime) > now) return 'upcoming';
  if (schedule.attendanceStatus === 'done') return 'recorded';
  return 'needsEvidence';
};

export default function AttendancePanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const summary = useEnglishSessionsSummary();
  const [weekStart, setWeekStart] = useState(null);
  const sessions = useEnglishSessionsWindow(weekStart, Boolean(weekStart));
  const [selectedId, setSelectedId] = useState('');
  const [records, setRecords] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState('all');
  const mutation = useSaveCanonicalEnglishAttendance();

  // Seed the visible week once, from the server's global "nearest session"
  // bound, the first time the summary loads. After that the operator owns
  // navigation (prev/next/today/filter tiles) — this never re-seeds.
  useEffect(() => {
    if (weekStart || !summary.data) return;
    const seed = summary.data.nearestSessionAt || new Date().toISOString();
    // Seeds the visible week from server data, once — not a state sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeekStart(getMonday(new Date(seed)));
  }, [summary.data, weekStart]);

  const schedules = useMemo(() => adaptHistoricalSessions(sessions.data, {
    historical: t('englishOperations.attendance.canonical'),
    readOnly: t('englishOperations.attendance.importedReadOnly'),
    live: t('englishOperations.attendance.live'),
    unrecorded: t('englishOperations.attendance.noEvidenceShort'),
  }), [sessions.data, t]);
  // Global counts (all weeks) come from the summary aggregate, not a client
  // reduce over the loaded window.
  const counts = summary.data?.counts || { all: 0, needsEvidence: 0, recorded: 0, upcoming: 0 };
  const filteredSchedules = useMemo(() => (
    filter === 'all' ? schedules : schedules.filter((schedule) => attendanceBucket(schedule) === filter)
  ), [filter, schedules]);
  const selectedSchedule = schedules.find((schedule) => schedule.archiveSessionId === selectedId);
  const isLive = selectedSchedule?.sourceKind === 'live';
  const importedAttendance = useEnglishArchiveSessionAttendance(selectedId, Boolean(selectedId && !isLive));
  const liveAttendance = useCanonicalEnglishAttendanceRoster(
    selectedSchedule?.courseRunId,
    selectedId,
    Boolean(selectedId && isLive),
  );

  useEffect(() => {
    if (!selectedSchedule) return;
    const rows = isLive ? liveAttendance.data?.rows : importedAttendance.data?.roster;
    if (!rows) return;
    // Query rows seed an intentionally local, editable attendance draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecords(rows.map((row) => {
      const status = isLive
        ? (row.status === 'present' ? 'P' : row.status === 'absent' ? 'A' : null)
        : (row.attendanceStatus === 'present' ? 'P' : row.attendanceStatus === 'absent' ? 'A' : null);
      return {
        userId: row.runEnrollmentId || row.enrollmentId || row.employeeCode,
        runEnrollmentId: row.runEnrollmentId || row.enrollmentId,
        empCode: row.empCode || row.employeeCode,
        name: row.fullName || row.employeeName,
        department: '',
        status,
        statusLabel: status ? null : (isLive
          ? t('englishOperations.attendance.unmarked')
          : t('englishOperations.attendance.noSourceRecord')),
        isMarked: isLive ? Boolean(row.attendanceId) : true,
      };
    }));
    setIsDirty(false);
    setConfirmingClose(false);
    setResult(null);
  }, [importedAttendance.data?.roster, isLive, liveAttendance.data?.rows, selectedSchedule, t]);

  const close = useCallback(() => {
    setSelectedId('');
    setRecords([]);
    setIsDirty(false);
    setConfirmingClose(false);
    setResult(null);
  }, []);
  const requestClose = useCallback(() => {
    if (isDirty) setConfirmingClose(true);
    else close();
  }, [close, isDirty]);
  const updateRecord = useCallback((index, _field, status) => {
    setRecords((rows) => rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, status, isMarked: true } : row
    )));
    setIsDirty(true);
    setResult(null);
  }, []);
  const markAll = useCallback((status) => {
    setRecords((rows) => rows.map((row) => ({ ...row, status, isMarked: true })));
    setIsDirty(true);
    setResult(null);
  }, []);
  const makeRowKeyHandler = useCallback((index) => (event) => {
    const status = event.key.toUpperCase();
    if (ATTENDANCE_STATES.includes(status)) {
      event.preventDefault();
      updateRecord(index, 'status', status);
    }
  }, [updateRecord]);
  const submit = async () => {
    if (!isLive || !liveAttendance.data) return;
    if (records.some((row) => !row.status)) {
      setResult({ success: false, message: t('englishOperations.attendance.completeRoster') });
      return;
    }
    try {
      await mutation.mutateAsync({
        courseRunId: selectedSchedule.courseRunId,
        sessionUnitId: selectedId,
        data: {
          rosterToken: liveAttendance.data.rosterToken,
          records: records.map((row) => ({
            runEnrollmentId: row.runEnrollmentId,
            status: row.status === 'P' ? 'present' : 'absent',
          })),
        },
      });
      setIsDirty(false);
      setResult({ success: true });
    } catch (error) {
      setResult({
        success: false,
        message: error?.response?.data?.message || t('englishOperations.attendance.saveError'),
      });
    }
  };

  if (summary.isLoading || !weekStart || sessions.isLoading) {
    return <div className="flex justify-center py-16"><Spinner size={28} /></div>;
  }

  const drawer = selectedSchedule ? (
    <AttendanceDrawer
      isOpen
      isLoading={isLive ? liveAttendance.isLoading : importedAttendance.isLoading}
      schedule={selectedSchedule}
      records={records}
      isPending={mutation.isPending}
      result={result}
      isStale={false}
      isAdmin={user?.role === 'Admin'}
      isDirty={isDirty}
      confirmingClose={confirmingClose}
      onCloseRequest={requestClose}
      onCancelClose={() => setConfirmingClose(false)}
      onDiscardAndClose={close}
      onMarkAll={markAll}
      onRecordUpdate={updateRecord}
      onSubmit={submit}
      makeRowKeyHandler={makeRowKeyHandler}
      statusOptions={ATTENDANCE_STATES}
      isReadOnly={!isLive}
      inline
      readOnlyLabel={!isLive
        ? (selectedSchedule.attendanceStatus === 'unrecorded'
          ? t('englishOperations.attendance.noEvidenceReadOnly')
          : selectedSchedule.historicalReadOnlyLabel)
        : null}
    />
  ) : null;

  const filterIcons = {
    all: ListFilter,
    needsEvidence: CircleDashed,
    recorded: CheckCircle2,
    upcoming: CalendarClock,
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4">
        <div>
          <h2 className="font-semibold text-foreground">{t('englishOperations.attendance.reviewTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('englishOperations.attendance.reviewHint')}</p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {FILTERS.map((value) => {
            const Icon = filterIcons[value];
            return (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  if (selectedId) close();
                  // Land on a week that actually contains a session in this
                  // bucket — otherwise the tile counts N sessions while the
                  // grid stays on the previously visible (often empty) week.
                  const seed = summary.data?.filterSeedAt?.[value] || summary.data?.nearestSessionAt;
                  if (seed) setWeekStart(getMonday(new Date(seed)));
                }}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  filter === value
                    ? 'border-primary/40 bg-primary/10'
                    : 'border-border bg-background hover:border-primary/25 hover:bg-muted/30'
                }`}
              >
                <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-lg font-semibold tabular-nums text-foreground">{counts[value]}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t(`englishOperations.attendance.filters.${value}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {sessions.isError ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {t('englishOperations.attendance.loadError')}
        </div>
      ) : counts[filter] === 0 ? (
        // Truly empty bucket (globally, per the summary) — not just an empty
        // visible week, which the calendar below already renders as blank cells.
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">{t('englishOperations.attendance.filterEmpty')}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => setFilter('all')}>
            {t('englishOperations.attendance.showAll')}
          </Button>
        </div>
      ) : (
        <AttendancePage
          allowedClassIds={[]}
          statusOptions={ATTENDANCE_STATES}
          historicalOnly
          historicalSchedules={filteredSchedules}
          weekStart={weekStart}
          onWeekChange={setWeekStart}
          onHistoricalSelect={(schedule) => {
            if (schedule.archiveSessionId === selectedId) requestClose();
            else setSelectedId(schedule.archiveSessionId);
          }}
          selectedHistoricalId={selectedId}
          historicalDrawer={drawer}
          unrecordedLabel={t('englishOperations.attendance.noEvidenceShort')}
          hideHeader
          stackedDetail
        />
      )}
    </div>
  );
}
