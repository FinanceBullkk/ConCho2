import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { EmptyState } from '../../../components/EmptyState';
import { Spinner } from '../../../components/Spinner';
import { ScheduleDrawer } from '../../../components/ScheduleDrawer';
import { useSchedules } from '../../../hooks/useSchedules';
import { useTeams } from '../../../hooks/useTeams';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fmtDate, fmtTime } from './format';

// ──────────────────────────────────────────────────────────
// Tab 3 · Schedules — table + Past/Upcoming/All toggle + +New session
// ──────────────────────────────────────────────────────────
export default function SchedulesTab({ classId, classes, canEdit }) {
  const navigate = useNavigate();
  const params = useMemo(() => ({ classId, limit: 200 }), [classId]);
  const { data: schedData, isLoading } = useSchedules(params);
  const { data: teams = [] } = useTeams();
  // Memoized: a bare `|| []` fallback would re-trigger the `filtered` useMemo
  // on every render (fresh array identity each time).
  const schedules = useMemo(() => schedData?.data || [], [schedData]);

  const [filter, setFilter] = useState('upcoming'); // 'past' | 'upcoming' | 'all'
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Snapshot "now" at mount (lazy state) — render must stay pure
  // (react-hooks/purity forbids Date.now() during render, incl. inside useMemo).
  const [nowMs] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const sorted = [...schedules].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    if (filter === 'past')     return sorted.filter((s) => new Date(s.endTime).getTime() < nowMs);
    if (filter === 'upcoming') return sorted.filter((s) => new Date(s.endTime).getTime() >= nowMs);
    return sorted;
  }, [schedules, filter, nowMs]);

  const handleRowClick = () => {
    navigate('/english-operations?tab=attendance');
  };

  return (
    <div className="space-y-3">
      {/* ── Toolbar ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
        <div className="inline-flex rounded-md overflow-hidden border border-border">
          {[
            { id: 'past',     label: 'Past' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'all',      label: 'All' },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={cn(
                'px-3 py-1 text-xs transition-colors duration-(--dur-fast)',
                filter === opt.id
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} session{filtered.length !== 1 ? 's' : ''}</span>
        <span className="flex-1" />
        {canEdit && (
          <Button size="sm" className="h-8 text-xs" onClick={() => setDrawerOpen(true)}>
            + New session
          </Button>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size={24} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No sessions"
          description={filter === 'past' ? 'No past sessions yet.' : filter === 'upcoming' ? 'No upcoming sessions.' : 'No sessions scheduled for this class.'}
        />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-3 py-2 text-left text-overline text-muted-foreground w-12">#</th>
                  <th className="px-3 py-2 text-left text-overline text-muted-foreground">Date</th>
                  <th className="px-3 py-2 text-left text-overline text-muted-foreground">Time</th>
                  <th className="px-3 py-2 text-left text-overline text-muted-foreground">Team</th>
                  <th className="px-3 py-2 text-center text-overline text-muted-foreground">Capacity</th>
                  <th className="px-3 py-2 text-left text-overline text-muted-foreground">Room</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((s, i) => (
                  <tr
                    key={s._id}
                    onClick={() => handleRowClick(s)}
                    className="hover:bg-accent transition-colors cursor-pointer"
                    title="Open in calendar"
                  >
                    <td className="px-3 py-2 text-xs text-subtle-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2 text-sm text-foreground">{fmtDate(s.startTime)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground font-mono">
                      {fmtTime(s.startTime)}–{fmtTime(s.endTime)}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {s.bookedTeamId?.name ? (
                        <span className="inline-flex items-center text-[11px] font-semibold text-chart-3 bg-chart-3/15 px-2 py-0.5 rounded">
                          {s.bookedTeamId.name}
                        </span>
                      ) : <span className="text-subtle-foreground text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center text-sm text-muted-foreground tabular-nums">
                      <span className={s.enrolledCount >= s.capacity ? 'text-warning' : ''}>
                        {s.enrolledCount}/{s.capacity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {s.roomLink ? (
                        <a href={s.roomLink} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline text-xs truncate block max-w-[200px]">
                          {s.roomLink}
                        </a>
                      ) : <span className="text-subtle-foreground text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ScheduleDrawer (reuse from Screen 2) ───────── */}
      <ScheduleDrawer
        isOpen={drawerOpen}
        mode="create"
        schedule={null}
        prefill={null}
        classes={classes}
        teams={teams}
        allSchedules={schedules}
        isReadOnly={!canEdit}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => setDrawerOpen(false)}
        onDeleted={() => setDrawerOpen(false)}
      />
    </div>
  );
}
