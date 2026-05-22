import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAttendanceCalendar } from '@/hooks/useSchedules';

// ──────────────────────────────────────────────────────────
// TodayHero — Phase 3 Screen 3 (compact band variant)
//
// Horizontal summary of today's session status.
// Shows: weekday label · total sessions · status pills
// (done / partial / pending).
// Pending pill links to attendance page for quick action.
//
// Returns null when there are no sessions today (clean).
// Action items (toMark, teamsWithoutLeader…) moved to AlertBand.
// ──────────────────────────────────────────────────────────

export function TodayHero() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const tomorrow = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }, [today]);

  // Returns all schedules; we filter client-side (the calendar endpoint doesn't support date params)
  const { data: allSchedules = [] } = useAttendanceCalendar();

  const stats = useMemo(() => {
    if (!Array.isArray(allSchedules)) return null;
    // Only sessions that START today
    const todaySchedules = allSchedules.filter((s) => {
      const start = new Date(s.startTime);
      return start >= today && start < tomorrow;
    });
    if (todaySchedules.length === 0) return null;
    let done = 0, partial = 0, pending = 0, none = 0;
    todaySchedules.forEach((s) => {
      if (s.attendanceStatus === 'done')         done++;
      else if (s.attendanceStatus === 'partial') partial++;
      else if (s.attendanceStatus === 'pending') pending++;
      else                                       none++;
    });
    return { total: todaySchedules.length, done, partial, pending, none };
  }, [allSchedules, today, tomorrow]);

  if (!stats) return null;

  const weekday = new Date().toLocaleDateString('en', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5 text-sm">
      <span className="font-semibold text-foreground">{weekday}</span>
      <span className="text-xs text-muted-foreground">
        {stats.total} session{stats.total !== 1 ? 's' : ''} today
      </span>

      <div className="flex flex-wrap gap-1.5 ml-auto">
        {stats.done > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            ✓ {stats.done} done
          </span>
        )}
        {stats.partial > 0 && (
          <Link
            to="/operations?tab=attendance"
            className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning transition-colors hover:bg-warning/20"
          >
            ◑ {stats.partial} partial
          </Link>
        )}
        {stats.pending > 0 && (
          <Link
            to="/operations?tab=attendance"
            className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning transition-colors hover:bg-warning/25"
          >
            ○ {stats.pending} pending
          </Link>
        )}
        {stats.none > 0 && stats.done === 0 && stats.partial === 0 && stats.pending === 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {stats.none} not started
          </span>
        )}
      </div>
    </div>
  );
}
