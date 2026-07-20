import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../../components/Spinner';
import SchedulesPage from '../schedule/SchedulesPage';
import { adaptHistoricalSessions } from './historical-session-adapter';
import { useEnglishArchiveSessions } from './useEnglishOperations';

export default function SchedulePanel() {
  const { t } = useTranslation();
  const sessions = useEnglishArchiveSessions(true);
  const schedules = useMemo(() => adaptHistoricalSessions(sessions.data, {
    historical: t('englishOperations.schedule.canonical'),
    readOnly: t('englishOperations.schedule.importedReadOnly'),
  }), [sessions.data, t]);

  if (sessions.isLoading) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <SchedulesPage
      allowedClassIds={[]}
      allowCreate={false}
      historicalOnly
      historicalSchedules={schedules}
      defaultWeek={schedules[0]?.startTime}
    />
  );
}
