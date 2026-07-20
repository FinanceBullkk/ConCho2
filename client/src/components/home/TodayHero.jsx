import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAttendanceCalendar } from '@/hooks/useSchedules';

// ──────────────────────────────────────────────────────────
// TodayHero — "Today's sessions" card (north-star Home, 2026-06-14).
//
// A scannable list of today's sessions (time · class · room · attendance
// status), with a quick link into the calendar. Real data from the attendance
// calendar endpoint (filtered client-side to sessions that START today).
// Returns null when there are no sessions today, keeping Home clean.
// ──────────────────────────────────────────────────────────

const STATUS = {
  done: { label: 'Marked', bar: 'bg-success', badge: 'bg-success-tint text-success' },
  partial: { label: 'Partial', bar: 'bg-warning', badge: 'bg-warning-tint text-warning' },
  pending: { label: 'Pending', bar: 'bg-warning', badge: 'bg-warning-tint text-warning' },
  none: { label: 'Upcoming', bar: 'bg-primary', badge: 'bg-surface-2 text-muted-foreground' },
};
const pad = (n) => String(n).padStart(2, '0');
const MAX_ROWS = 6;

export function TodayHero() {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const tomorrow = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }, [today]);

  // Returns all schedules; filter client-side (the calendar endpoint has no date params).
  const { data: allSchedules = [] } = useAttendanceCalendar();

  const { rows, total, done } = useMemo(() => {
    if (!Array.isArray(allSchedules)) return { rows: [], total: 0, done: 0 };
    const todays = allSchedules
      .filter((s) => { const t = new Date(s.startTime); return t >= today && t < tomorrow; })
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    return { rows: todays, total: todays.length, done: todays.filter((s) => s.attendanceStatus === 'done').length };
  }, [allSchedules, today, tomorrow]);

  if (total === 0) return null;

  const weekday = new Date().toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Today’s sessions</h3>
          <p className="text-xs text-subtle-foreground">
            {weekday} · {total} session{total !== 1 ? 's' : ''} · {done} marked
          </p>
        </div>
        <Link
          to="/english-operations?tab=schedule"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Open calendar <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <ul className="divide-y divide-border">
        {rows.slice(0, MAX_ROWS).map((s) => {
          const st = STATUS[s.attendanceStatus] ?? STATUS.none;
          const start = new Date(s.startTime);
          const cls = s.classId;
          const code = cls?.classCode ?? '—';
          const course = cls?.courseName ?? '';
          const room = s.room || cls?.room || '';
          return (
            <li key={s._id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-11 shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                {pad(start.getHours())}:{pad(start.getMinutes())}
              </span>
              <span className={cn('h-7 w-[3px] shrink-0 rounded-full', st.bar)} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {code}
                  {course && <span className="text-muted-foreground"> · {course}</span>}
                </div>
                {room && <div className="truncate text-xs text-subtle-foreground">{room}</div>}
              </div>
              <span className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold', st.badge)}>{st.label}</span>
            </li>
          );
        })}
      </ul>

      {total > MAX_ROWS && (
        <div className="border-t border-border px-4 py-2 text-center text-xs text-subtle-foreground">
          +{total - MAX_ROWS} more today
        </div>
      )}
    </div>
  );
}
