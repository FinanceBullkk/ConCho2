import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Wifi, WifiOff, RefreshCw, ChevronRight, CloudUpload } from 'lucide-react';
import { useAttendanceCalendar } from '../../hooks/useSchedules';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Spinner } from '../../components/Spinner';
import { Button } from '@/components/ui/button';
import { useOfflineAttendance } from './useOfflineAttendance';
import { queuedCountForSchedule } from './attendance-offline-utils';
import { getAllQueued } from './attendance-offline-db';
import MobileRosterPanel from './MobileRosterPanel';

const isToday = (iso) => {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
};
const hhmm = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

function ConnectionBanner({ online, queuedCount, flushing, onFlush, t }) {
  const s = 'mobileAttendance';
  if (!online) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-tint px-3 py-2 text-sm text-warning">
        <WifiOff className="size-4" aria-hidden="true" />
        <span>{queuedCount > 0 ? t(`${s}.offlineWithQueue`, { count: queuedCount }) : t(`${s}.offline`)}</span>
      </div>
    );
  }
  if (queuedCount > 0) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary-tint px-3 py-2 text-sm text-primary">
        <span className="inline-flex items-center gap-2"><CloudUpload className="size-4" aria-hidden="true" />{t(`${s}.queued`, { count: queuedCount })}</span>
        <Button size="sm" variant="outline" onClick={onFlush} disabled={flushing}>
          <RefreshCw className={`mr-1.5 size-4 ${flushing ? 'animate-spin' : ''}`} aria-hidden="true" />{t(`${s}.syncNow`)}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success-tint px-3 py-2 text-sm text-success">
      <Wifi className="size-4" aria-hidden="true" />{t(`${s}.online`)}
    </div>
  );
}

export default function MobileAttendancePage() {
  const { t } = useTranslation();
  const s = 'mobileAttendance';
  const { online, queuedCount, flushing, enqueue, flush } = useOfflineAttendance();
  const [selected, setSelected] = useState(null);

  const { data: schedules = [], isLoading, isError } = useAttendanceCalendar();
  const today = useMemo(
    () => (schedules || []).filter((sc) => isToday(sc.startTime)).sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    [schedules],
  );

  // Per-schedule queued counts so a session shows "N saved on device".
  const { data: queuedRows = [] } = useQuery({
    queryKey: ['offline-attendance-queue', queuedCount],
    queryFn: getAllQueued,
  });

  if (selected) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <MobileRosterPanel
          session={selected}
          online={online}
          onEnqueue={enqueue}
          onBack={() => setSelected(null)}
          queuedForThis={queuedCountForSchedule(queuedRows, selected._id)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title={t(`${s}.title`)} description={t(`${s}.description`)} />
      <ConnectionBanner online={online} queuedCount={queuedCount} flushing={flushing} onFlush={flush} t={t} />

      {isLoading && <div className="flex min-h-[30vh] items-center justify-center"><Spinner size={28} /></div>}
      {isError && !isLoading && <EmptyState title={t(`${s}.loadError`)} />}

      {!isLoading && !isError && today.length === 0 && (
        <EmptyState title={t(`${s}.noSessions`)} description={t(`${s}.noSessionsDesc`)} />
      )}

      {!isLoading && !isError && today.length > 0 && (
        <ul className="space-y-2">
          {today.map((sc) => {
            const queuedHere = queuedCountForSchedule(queuedRows, sc._id);
            return (
              <li key={sc._id}>
                <button
                  type="button"
                  onClick={() => setSelected(sc)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
                >
                  <span className="rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold tabular-nums text-primary">{hhmm(sc.startTime)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{sc.classId?.courseName || sc.classId?.classCode}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {sc.classId?.classCode} · {t(`${s}.markedShort`, { marked: sc.markedCount || 0, total: sc.enrolledCount || 0 })}
                      {queuedHere > 0 && <span className="ml-1 text-warning">· {t(`${s}.queuedShort`, { count: queuedHere })}</span>}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
