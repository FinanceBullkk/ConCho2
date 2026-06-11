import { useMemo } from 'react';
import { CalendarDays, Hourglass, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/PageHeader';
import TableSkeleton from '@/components/TableSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useLearningSessions } from '../../hooks/useLearning';
import { useMyWaitlist, useJoinWaitlist, useLeaveWaitlist } from './useWaitlist';

// ──────────────────────────────────────────────────────────
// MySessionsPage — /me/sessions (Wave E3 phase-04, slice B)
//
// A learner's upcoming sessions across their cohorts/teams, with the waitlist
// loop: a FULL session they're not enrolled in offers "Join waitlist"; a
// freed seat auto-promotes FIFO (server emails + calendar-invites them).
// Per the /me/* convention this page uses English literals (no i18n keys).
// ──────────────────────────────────────────────────────────

const formatWhen = (iso) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function MySessionsPage() {
  const { user } = useAuth();
  const myId = String(user?._id || '');
  const { data, isLoading } = useLearningSessions({ limit: 200 });
  const { data: mineData } = useMyWaitlist();
  const join = useJoinWaitlist();
  const leave = useLeaveWaitlist();

  const waitingBySchedule = useMemo(() => {
    const map = new Map();
    (mineData?.data || []).forEach((entry) => {
      map.set(String(entry.scheduleId?._id || entry.scheduleId), entry);
    });
    return map;
  }, [mineData]);

  const sessions = useMemo(
    () => (data?.data || [])
      .filter((s) => new Date(s.startTime) > new Date())
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
    [data],
  );

  const handleJoin = async (s) => {
    try {
      const entry = await join.mutateAsync(s._id);
      toast.success(`You're on the waitlist — position #${entry.position}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not join the waitlist');
    }
  };

  const handleLeave = async (s) => {
    try {
      await leave.mutateAsync(s._id);
      toast.success('Left the waitlist');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not leave the waitlist');
    }
  };

  const stateCell = (s) => {
    const enrolled = (s.enrolledLearners || [])
      .some((l) => String(l._id || l.learnerId) === myId);
    if (enrolled) return <Badge>Enrolled</Badge>;

    const waiting = waitingBySchedule.get(String(s._id));
    if (waiting) {
      return (
        <div className="flex items-center justify-end gap-2">
          <Badge variant="secondary">
            <Hourglass className="size-3 mr-1" aria-hidden="true" />Waiting #{waiting.position}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => handleLeave(s)} disabled={leave.isPending}>
            <LogOut className="size-4 mr-1.5" aria-hidden="true" />Leave
          </Button>
        </div>
      );
    }

    const cap = s.effectiveCapacity ?? s.capacity ?? 9;
    const full = (s.enrolledLearnerCount ?? 0) >= cap;
    if (full) {
      return (
        <Button size="sm" variant="outline" onClick={() => handleJoin(s)} disabled={join.isPending}>
          <Hourglass className="size-4 mr-1.5" aria-hidden="true" />Join waitlist
        </Button>
      );
    }
    return <span className="text-xs text-subtle-foreground">Open — ask your coordinator to add you</span>;
  };

  let body;
  if (isLoading) {
    body = <TableSkeleton rows={5} cols={4} />;
  } else if (!sessions.length) {
    body = (
      <EmptyState
        icon={CalendarDays}
        title="No upcoming sessions"
        description="Sessions of your cohorts and teams will appear here."
      />
    );
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Cohort</TableHead>
            <TableHead>Where</TableHead>
            <TableHead className="text-right">Seats</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => (
            <TableRow key={s._id}>
              <TableCell className="whitespace-nowrap">{formatWhen(s.startTime)}</TableCell>
              <TableCell>
                <span className="font-mono text-primary">{s.cohort?.cohortCode || ''}</span>
                {s.cohort?.programName ? <span className="text-muted-foreground"> · {s.cohort.programName}</span> : null}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {s.office?.name || (s.meetLink || s.roomLink ? 'Online' : '—')}
                {s.room ? ` · ${s.room.name}` : ''}
              </TableCell>
              <TableCell className="text-right text-sm">
                {s.enrolledLearnerCount ?? 0}/{s.effectiveCapacity ?? s.capacity ?? 9}
              </TableCell>
              <TableCell className="text-right">{stateCell(s)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My sessions"
        description="Upcoming sessions in your cohorts — join a waitlist when one is full."
      />
      <Card>
        <CardHeader><CardTitle>Upcoming</CardTitle></CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </div>
  );
}
