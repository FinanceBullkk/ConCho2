import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../../components/Spinner';
import { AttendanceDrawer } from '../../components/AttendanceDrawer';
import { useAuth } from '../../context/AuthContext';
import AttendancePage from '../attendance/AttendancePage';
import { adaptHistoricalSessions, latestMarkedHistoricalStart } from './historical-session-adapter';
import {
  useCanonicalEnglishAttendanceRoster,
  useCanonicalEnglishSessions,
  useEnglishArchiveSessionAttendance,
  useSaveCanonicalEnglishAttendance,
} from './useEnglishOperations';

const ATTENDANCE_STATES = ['P', 'A'];

export default function AttendancePanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const sessions = useCanonicalEnglishSessions(true);
  const [selectedId, setSelectedId] = useState('');
  const [records, setRecords] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [result, setResult] = useState(null);
  const mutation = useSaveCanonicalEnglishAttendance();

  const schedules = useMemo(() => adaptHistoricalSessions(sessions.data, {
    historical: t('englishOperations.attendance.canonical'),
    readOnly: t('englishOperations.attendance.importedReadOnly'),
    live: t('englishOperations.attendance.live'),
  }), [sessions.data, t]);
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
        statusLabel: status ? null : t('englishOperations.attendance.unmarked'),
        isMarked: isLive ? Boolean(row.attendanceId) : status !== null,
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

  if (sessions.isLoading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

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
      readOnlyLabel={!isLive ? t('englishOperations.attendance.importedReadOnly') : null}
    />
  ) : null;

  return (
    <AttendancePage
      allowedClassIds={[]}
      statusOptions={ATTENDANCE_STATES}
      historicalOnly
      historicalSchedules={schedules}
      defaultWeek={latestMarkedHistoricalStart(schedules)}
      onHistoricalSelect={(schedule) => {
        if (schedule.archiveSessionId === selectedId) requestClose();
        else setSelectedId(schedule.archiveSessionId);
      }}
      selectedHistoricalId={selectedId}
      historicalDrawer={drawer}
    />
  );
}
