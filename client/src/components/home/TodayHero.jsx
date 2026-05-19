import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, UserPlus, ShieldAlert, CheckCircle2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAttendanceCalendar } from '@/hooks/useSchedules';
import { useTeams } from '@/hooks/useTeams';

const DISMISS_KEY = 'todayHero:dismissedAt';

function isDismissedToday() {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return new Date(ts).toDateString() === new Date().toDateString();
  } catch {
    return false;
  }
}

/**
 * Admin "What needs my attention today" hero.
 * Renders 0–N action cards. If everything is clear, shows an "All clear" state.
 * The whole hero can be dismissed for the day via localStorage.
 */
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

  const { data: schedules = [] } = useAttendanceCalendar({ from: today.toISOString(), to: tomorrow.toISOString() });
  const { data: teams = [] } = useTeams();

  const pendingTodayCount = useMemo(() => {
    if (!Array.isArray(schedules)) return 0;
    return schedules.filter((s) => {
      if (s.attendanceStatus !== 'pending' && s.attendanceStatus !== 'partial') return false;
      const start = new Date(s.startTime);
      // Already started, not in future
      return start <= new Date() && start >= today;
    }).length;
  }, [schedules, today]);

  const teamsWithoutLeader = useMemo(() => {
    if (!Array.isArray(teams)) return 0;
    return teams.filter((t) => !t.leaderId && !t.isDeleted).length;
  }, [teams]);

  const cards = [];
  if (pendingTodayCount > 0) {
    cards.push({
      key: 'pending-today',
      tone: 'amber',
      icon: ClipboardCheck,
      title: `${pendingTodayCount} session${pendingTodayCount > 1 ? 's' : ''} need attendance today`,
      description: 'Mark attendance before the day ends to keep weekly reports accurate.',
      ctaLabel: 'Mark now',
      to: '/operations?tab=attendance',
    });
  }
  if (teamsWithoutLeader > 0) {
    cards.push({
      key: 'no-leader',
      tone: 'sky',
      icon: UserPlus,
      title: `${teamsWithoutLeader} team${teamsWithoutLeader > 1 ? 's' : ''} without a leader`,
      description: 'Assign a leader so the team can book sessions on its own.',
      ctaLabel: 'Assign leaders',
      to: '/academy?tab=teams',
    });
  }

  if (isDismissedToday() || (cards.length === 0)) {
    if (cards.length === 0) {
      return (
        <Card className="flex items-center gap-3 border-success/25 bg-success/5 px-5 py-4 text-success">
          <CheckCircle2 className="size-5 shrink-0" />
          <div className="text-sm font-medium">All clear — nothing urgent for today.</div>
        </Card>
      );
    }
    return null;
  }

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch {}
    // Force a re-render by reloading minimal state — easier: hide via DOM mutation. Use location reload for now.
    window.dispatchEvent(new Event('today-hero-dismissed'));
    // Simple: navigate to same path to force a refresh in React (or just remove element via state lifted up)
    window.location.reload();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Today
        </h2>
        <Button
          variant="ghost"
          size="xs"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" /> Dismiss for today
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const toneClasses = {
            amber: 'border-warning/30 bg-warning/5 text-warning',
            sky: 'border-info/30 bg-info/5 text-info',
            rose: 'border-destructive/30 bg-destructive/5 text-destructive',
          }[c.tone];
          return (
            <Card key={c.key} className={`flex flex-col gap-3 ${toneClasses} p-5`}>
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 size-5 shrink-0" />
                <div className="space-y-1">
                  <div className="text-sm font-semibold leading-tight">{c.title}</div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{c.description}</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="self-start border-current/40 bg-transparent text-current hover:bg-current/10">
                <Link to={c.to}>{c.ctaLabel}</Link>
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
