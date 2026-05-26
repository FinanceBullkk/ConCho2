import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/Spinner';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// CalendarGrid — Phase 1 §10
//
// Shared week-view grid used by SchedulesPage, AttendancePage
// and BookClassPage. Extracts ~200 LOC that was duplicated
// verbatim across all three.
//
// Rendering is fully controlled: the grid handles the table
// skeleton (columns, sticky time column, today highlight) but
// delegates cell content entirely to the consumer via renderCell.
//
// Props:
//   weekDays    Date[7]       Mon–Sun for the visible week
//   timeRows    number[]      sorted hours to show as rows, e.g. [8, 9, 10]
//   renderCell  (day: Date, hour: number) => ReactNode
//               Full cell content. Must return a <td>-compatible
//               fragment; the grid wraps it in nothing — just calls it.
//   isLoading   boolean       show spinner instead of grid
//   onPrev      () => void    go to previous week
//   onNext      () => void    go to next week
//   onToday     () => void    jump to current week
//   weekLabel   string        e.g. "12 May — 18 May 2025"
//   actions     ReactNode     extra buttons next to Today (e.g. "Jump to latest")
//   className   string
//
// Exported helpers (shared logic between pages):
//   getMonday(date)  → Date (00:00:00 Monday of the given date's week)
//   toDateKey(date)  → "YYYY-MM-DD"
//   todayKey()       → today's toDateKey
//
// Usage:
//   const weekDays = useMemo(() =>
//     Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000)),
//   [weekStart]);
//
//   <CalendarGrid
//     weekDays={weekDays}
//     timeRows={[8, 9, 10, 14, 15, 16]}
//     isLoading={loading}
//     onPrev={prevWeek} onNext={nextWeek} onToday={goToday}
//     weekLabel={`${weekDays[0].toLocaleDateString('en', { month: 'short', day: 'numeric' })} — ...`}
//     renderCell={(day, hour) => {
//       const sessions = cellSessions(day, hour);
//       return sessions.length > 0 ? <SessionCard s={sessions[0]} /> : <EmptyCell />;
//     }}
//   />
// ──────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ── Exported helpers ──────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// eslint-disable-next-line react-refresh/only-export-components
export function toDateKey(date) {
  const d = new Date(date);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// eslint-disable-next-line react-refresh/only-export-components
export function todayKey() {
  return toDateKey(new Date());
}

// ── Component ─────────────────────────────────────────────

export function CalendarGrid({
  weekDays,
  timeRows = [],
  renderCell,
  isLoading = false,
  onPrev,
  onNext,
  onToday,
  weekLabel,
  actions,
  className,
  selectedCellKey,
}) {
  const todayStr = useMemo(() => todayKey(), []);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* ── Week navigation ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={onPrev} aria-label="Previous week">
          <ChevronLeft className="size-4" />
        </Button>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="text-sm font-semibold text-foreground">
            {weekLabel}
          </span>
          <Button variant="outline" size="sm" onClick={onToday}>
            Today
          </Button>
          {actions}
        </div>

        <Button variant="outline" size="sm" onClick={onNext} aria-label="Next week">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* ── Grid ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Spinner size={28} />
        </div>
      ) : timeRows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-subtle-foreground">
          <CalendarDays className="size-6" strokeWidth={1.5} aria-hidden="true" />
          <p className="text-body">No sessions this week</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[720px]">
              <thead>
                <tr>
                  {/* Time column header */}
                  <th className={cn(
                    'sticky left-0 z-20 w-20 px-3 py-3',
                    'bg-card border-b border-r border-border',
                    'text-overline text-subtle-foreground text-left',
                  )}>
                    Time
                  </th>

                  {/* Day columns */}
                  {weekDays.map((day, i) => {
                    const isToday = toDateKey(day) === todayStr;
                    return (
                      <th
                        key={i}
                        className={cn(
                          'px-2 py-3 border-b border-border text-center',
                          isToday && 'bg-primary/8',
                        )}
                      >
                        <div className={cn('text-overline', isToday ? 'text-primary' : 'text-muted-foreground')}>
                          {DAY_NAMES[i]}
                        </div>
                        <div className={cn('text-h3 leading-none mt-0.5', isToday ? 'text-primary' : 'text-foreground')}>
                          {day.getDate()}
                        </div>
                        <div className="text-small text-subtle-foreground mt-0.5">
                          {day.toLocaleDateString('en', { month: 'short' })}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {timeRows.map((hour) => (
                  <tr key={hour}>
                    {/* Sticky time label */}
                    <td className={cn(
                      'sticky left-0 z-10 bg-card',
                      'px-3 py-2 border-r border-b border-border',
                      'text-mono text-subtle-foreground whitespace-nowrap align-top',
                    )}>
                      {String(hour).padStart(2, '0')}:00
                    </td>

                    {/* Day cells */}
                    {weekDays.map((day, dayIdx) => {
                      const isToday   = toDateKey(day) === todayStr;
                      const cellKey   = `${toDateKey(day)}|${String(hour).padStart(2, '0')}:00`;
                      const isSelected = selectedCellKey === cellKey;
                      return (
                        <td
                          key={dayIdx}
                          className={cn(
                            'border-b border-border p-1 align-top transition-colors duration-(--dur-fast)',
                            isToday && 'bg-primary/[0.04]',
                            isSelected && 'ring-2 ring-primary ring-inset bg-primary/[0.06]',
                          )}
                        >
                          {renderCell?.(day, hour)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
