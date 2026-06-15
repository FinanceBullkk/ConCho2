import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { Spinner } from '@/components/Spinner';
import { cn } from '@/lib/utils';
import { schedulesAPI, attendanceAPI } from '../../api/api';
import { qk } from '../../hooks/queryKeys';
import { useBulkMarkAttendance } from '../../hooks/useAttendance';

// ──────────────────────────────────────────────────────────
// SessionDetailPage — one-submit 4-state attendance (TMS.update S5).
// A "session" is a Schedule. Reuses schedulesAPI.getById (roster) +
// attendanceAPI.getBySchedule (prior marks) + bulkMark — submitting
// re-evaluates the completion policy server-side. No new backend.
// ──────────────────────────────────────────────────────────
const s = 'learning.sessionDetail';
const STATES = [
  { code: 'P', key: 'present', active: 'bg-success text-white border-success' },
  { code: 'L', key: 'late', active: 'bg-warning text-white border-warning' },
  { code: 'A', key: 'absent', active: 'bg-destructive text-white border-destructive' },
  { code: 'EL', key: 'excused', active: 'bg-info text-white border-info' },
];

function Ring({ pct }) {
  const radius = 30;
  const circ = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 80 80" className="size-20" aria-hidden="true">
      <circle cx="40" cy="40" r={radius} fill="none" stroke="var(--muted)" strokeWidth="8" />
      <circle
        cx="40" cy="40" r={radius} fill="none" stroke="var(--success)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)} transform="rotate(-90 40 40)"
      />
      <text x="40" y="44" textAnchor="middle" className="fill-foreground text-[14px] font-bold tabular-nums">{pct}%</text>
    </svg>
  );
}

export default function SessionDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const bulkMark = useBulkMarkAttendance();
  const [overrides, setOverrides] = useState({});
  const [find, setFind] = useState('');

  const { data: schedule, isLoading, isError } = useQuery({
    queryKey: qk.schedules.detail(id),
    queryFn: async () => (await schedulesAPI.getById(id)).data.data,
    enabled: Boolean(id),
  });
  const { data: existing } = useQuery({
    queryKey: qk.attendance.bySchedule(id),
    queryFn: async () => (await attendanceAPI.getBySchedule(id)).data.data,
    enabled: Boolean(id),
  });

  const baseRecords = useMemo(() => {
    if (!schedule) return [];
    const map = {};
    (existing || []).forEach((rec) => { map[rec.userId?._id || rec.userId] = rec; });
    return (schedule.enrolledUsers || []).map((u) => ({
      userId: u._id, name: u.name, empCode: u.empCode, department: u.department,
      status: map[u._id]?.status || null,
    }));
  }, [schedule, existing]);

  const records = baseRecords.map((r) => ({ ...r, status: overrides[r.userId] !== undefined ? overrides[r.userId] : r.status }));
  const count = (code) => records.filter((r) => r.status === code).length;
  const total = records.length;
  const marked = records.filter((r) => r.status).length;
  // Client-side roster filter (counts above stay over the FULL roster).
  const q = find.trim().toLowerCase();
  const shown = q
    ? records.filter((r) => `${r.name} ${r.empCode || ''} ${r.department || ''}`.toLowerCase().includes(q))
    : records;
  const presentPct = total ? Math.round((count('P') / total) * 100) : 0;

  const setOne = (userId, code) => setOverrides((o) => ({ ...o, [userId]: code }));
  const allPresent = () => setOverrides(Object.fromEntries(records.map((r) => [r.userId, 'P'])));

  const doSubmit = async () => {
    const payload = records.map((r) => ({ userId: r.userId, status: r.status || 'P' }));
    try {
      await bulkMark.mutateAsync({ scheduleId: id, records: payload });
      toast.success(t(`${s}.saved`));
    } catch {
      toast.error(t(`${s}.saveError`));
    }
  };

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Spinner size={28} /></div>;
  }
  if (isError || !schedule) {
    return (
      <div className="space-y-4">
        <Link to="/calendar?tab=attendance" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />{t(`${s}.back`)}
        </Link>
        <EmptyState title={t(`${s}.loadError`)} />
      </div>
    );
  }

  const when = schedule.startTime ? new Date(schedule.startTime).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

  return (
    <div className="space-y-4">
      <Link to="/calendar?tab=attendance" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />{t(`${s}.back`)}
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {schedule.classId?.courseName || schedule.classId?.classCode}
            <span className="font-mono text-sm text-subtle-foreground">{schedule.classId?.classCode}</span>
          </span>
        }
        description={when || undefined}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
            <CardTitle className="text-base">
              {t(`${s}.title`)} <span className="ml-2 text-xs font-normal text-muted-foreground">{t(`${s}.marked`, { marked, total })}</span>
            </CardTitle>
            <Button size="sm" variant="outline" onClick={allPresent}><Check className="mr-1.5 size-4" aria-hidden="true" />{t(`${s}.allPresent`)}</Button>
          </CardHeader>
          <CardContent>
            {records.length > 0 && (
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  type="text"
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder={t(`${s}.find`)}
                  aria-label={t(`${s}.find`)}
                  className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
                />
              </div>
            )}
            {records.length ? (
              <ul className="divide-y divide-border">
                {shown.map((rec) => (
                  <li key={rec.userId} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{rec.name}</p>
                      <p className="text-[11px] text-subtle-foreground">{rec.department}</p>
                    </div>
                    <div className="flex gap-1.5">
                      {STATES.map((st) => (
                        <button
                          key={st.code}
                          type="button"
                          onClick={() => setOne(rec.userId, st.code)}
                          aria-pressed={rec.status === st.code}
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                            rec.status === st.code ? st.active : 'border-border text-muted-foreground hover:bg-accent/40',
                          )}
                        >
                          {t(`${s}.${st.key}`)}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title={t(`${s}.empty`)} />}
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-6 h-fit">
          <CardHeader className="pb-3"><CardTitle className="text-base">{t(`${s}.summary`)}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4">
              <Ring pct={presentPct} />
              <ul className="space-y-1 text-sm">
                {STATES.map((st) => (
                  <li key={st.code} className="flex items-center justify-between gap-6 tabular-nums">
                    <span className="text-muted-foreground">{t(`${s}.${st.key}`)}</span>
                    <span className="font-medium text-foreground">{count(st.code)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Button className="w-full" onClick={doSubmit} disabled={bulkMark.isPending}>
              {bulkMark.isPending ? t(`${s}.submitting`) : t(`${s}.submit`)}
            </Button>
            {marked < total && (
              <p className="text-center text-xs text-warning">{t(`${s}.stillUnmarked`, { count: total - marked })}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
