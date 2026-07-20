import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../../components/Spinner';
import { AttendanceDrawer } from '../../components/AttendanceDrawer';
import { useAuth } from '../../context/AuthContext';
import AttendancePage from '../attendance/AttendancePage';
import { adaptHistoricalSessions, latestMarkedHistoricalStart } from './historical-session-adapter';
import { useEnglishArchiveSessionAttendance, useEnglishArchiveSessions } from './useEnglishOperations';

const ARCHIVE_ATTENDANCE_STATES = ['P', 'A'];
const noop = () => {};
const noopKeyHandler = () => noop;

export default function AttendancePanel() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const sessions = useEnglishArchiveSessions(true);
  const [selectedId, setSelectedId] = useState('');
  const attendance = useEnglishArchiveSessionAttendance(selectedId, Boolean(selectedId));
  const schedules = useMemo(() => adaptHistoricalSessions(sessions.data, {
    historical: t('englishOperations.attendance.canonical'),
    readOnly: t('englishOperations.attendance.importedReadOnly'),
  }), [sessions.data, t]);
  const selectedSchedule = schedules.find((schedule) => schedule.archiveSessionId === selectedId);
  const records = useMemo(() => (attendance.data?.roster || []).map((row) => ({
    userId: row.enrollmentId || row.employeeCode,
    empCode: row.employeeCode,
    name: row.employeeName,
    department: '',
    status: row.attendanceStatus === 'present' ? 'P' : row.attendanceStatus === 'absent' ? 'A' : null,
    statusLabel: row.attendanceStatus === 'unmarked' ? t('englishOperations.attendance.unmarked') : null,
    isMarked: row.attendanceStatus !== 'unmarked',
  })), [attendance.data?.roster, t]);

  if (sessions.isLoading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  const drawer = selectedSchedule ? (
    <AttendanceDrawer
      isOpen
      isLoading={attendance.isLoading}
      schedule={selectedSchedule}
      records={records}
      isPending={false}
      result={null}
      isStale={false}
      isAdmin={user?.role === 'Admin'}
      isDirty={false}
      confirmingClose={false}
      onCloseRequest={() => setSelectedId('')}
      onCancelClose={noop}
      onDiscardAndClose={() => setSelectedId('')}
      onMarkAll={noop}
      onRecordUpdate={noop}
      onSubmit={noop}
      makeRowKeyHandler={noopKeyHandler}
      statusOptions={ARCHIVE_ATTENDANCE_STATES}
      isReadOnly
      readOnlyLabel={t('englishOperations.attendance.importedReadOnly')}
    />
  ) : null;

  return (
    <AttendancePage
      allowedClassIds={[]}
      statusOptions={ARCHIVE_ATTENDANCE_STATES}
      historicalOnly
      historicalSchedules={schedules}
      defaultWeek={latestMarkedHistoricalStart(schedules)}
      onHistoricalSelect={(schedule) => setSelectedId(schedule.archiveSessionId)}
      selectedHistoricalId={selectedId}
      historicalDrawer={drawer}
    />
  );
}
