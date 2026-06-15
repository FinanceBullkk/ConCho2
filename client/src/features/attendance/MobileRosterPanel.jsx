import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, X } from 'lucide-react';
import { schedulesAPI, attendanceAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';
import { useBulkMarkAttendance } from '../../hooks/useAttendance';
import { Button } from '@/components/ui/button';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '@/components/EmptyState';

// Per-learner present/absent marking for one session, big-tap-target style
// (screenshot 11). Online → bulkMark; offline → queue to IndexedDB via the
// parent's enqueue. Late/excused stay on the full Session detail page.
const initials = (name = '') => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export default function MobileRosterPanel({ session, online, onEnqueue, onBack, queuedForThis }) {
  const { t } = useTranslation();
  const s = 'mobileAttendance';
  const bulkMark = useBulkMarkAttendance();
  const [marks, setMarks] = useState({});

  const { data: schedule, isLoading } = useQuery({
    queryKey: qk.schedules.detail(session._id),
    queryFn: async () => (await schedulesAPI.getById(session._id)).data.data,
  });
  const { data: existing } = useQuery({
    queryKey: qk.attendance.bySchedule(session._id),
    queryFn: async () => (await attendanceAPI.getBySchedule(session._id)).data.data,
  });

  const roster = useMemo(() => {
    const prior = {};
    (existing || []).forEach((rec) => { prior[rec.userId?._id || rec.userId] = rec.status; });
    return (schedule?.enrolledUsers || []).map((u) => ({
      userId: u._id, name: u.name, empCode: u.empCode,
      status: marks[u._id] ?? prior[u._id] ?? null,
    }));
  }, [schedule, existing, marks]);

  const markedCount = roster.filter((r) => r.status).length;
  const setOne = (userId, code) => setMarks((m) => ({ ...m, [userId]: code }));
  const markRestPresent = () => setMarks((m) => {
    const next = { ...m };
    roster.forEach((r) => { if (!r.status) next[r.userId] = 'P'; });
    return next;
  });

  const submit = async () => {
    const payload = roster.map((r) => ({ userId: r.userId, status: r.status || 'P' }));
    if (online) {
      try {
        await bulkMark.mutateAsync({ scheduleId: session._id, records: payload });
        toast.success(t(`${s}.synced`));
        onBack();
      } catch {
        // Online attempt failed (flaky signal) — fall back to the offline queue.
        await onEnqueue(session._id, payload);
        toast.message(t(`${s}.savedOffline`));
        onBack();
      }
    } else {
      await onEnqueue(session._id, payload);
      toast.message(t(`${s}.savedOffline`));
      onBack();
    }
  };

  if (isLoading) return <div className="flex min-h-[40vh] items-center justify-center"><Spinner size={28} /></div>;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />{t(`${s}.back`)}
      </button>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-sm font-semibold text-foreground">{session.classId?.courseName || session.classId?.classCode}</div>
        <div className="text-xs text-muted-foreground">{session.classId?.classCode}</div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground tabular-nums">{t(`${s}.marked`, { marked: markedCount, total: roster.length })}</span>
        <Button size="sm" variant="outline" onClick={markRestPresent}>{t(`${s}.markRestPresent`)}</Button>
      </div>

      {roster.length === 0 ? (
        <EmptyState title={t(`${s}.noRoster`)} />
      ) : (
        <ul className="space-y-2">
          {roster.map((r) => (
            <li key={r.userId} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{initials(r.name)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{r.name}</span>
              <button
                type="button" aria-label={`${r.name} ${t(`${s}.present`)}`} aria-pressed={r.status === 'P'}
                onClick={() => setOne(r.userId, 'P')}
                className={`grid size-12 place-items-center rounded-md border ${r.status === 'P' ? 'border-success bg-success text-success-foreground' : 'border-border text-muted-foreground'}`}
              ><Check className="size-5" aria-hidden="true" /></button>
              <button
                type="button" aria-label={`${r.name} ${t(`${s}.absent`)}`} aria-pressed={r.status === 'A'}
                onClick={() => setOne(r.userId, 'A')}
                className={`grid size-12 place-items-center rounded-md border ${r.status === 'A' ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-border text-muted-foreground'}`}
              ><X className="size-5" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}

      {queuedForThis > 0 && (
        <p className="text-center text-xs text-warning">{t(`${s}.queuedForThis`, { count: queuedForThis })}</p>
      )}

      <Button className="w-full" onClick={submit} disabled={bulkMark.isPending || roster.length === 0}>
        {online ? t(`${s}.submit`) : t(`${s}.submitOffline`)}
      </Button>
    </div>
  );
}
