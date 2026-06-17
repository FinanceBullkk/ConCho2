import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { EmptyState } from '../../../components/EmptyState';
import { Spinner } from '../../../components/Spinner';
import { useAttendanceAnalyticsByClass } from '../../../hooks/useAttendance';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ──────────────────────────────────────────────────────────
// Tab 4 · Attendance — class-level KPIs + per-student rate
// (sorted by rate ASC — worst first, actionable signal)
// ──────────────────────────────────────────────────────────
export default function AttendanceTab({ classId }) {
  const params = useMemo(() => ({ classId }), [classId]);
  const { data, isLoading } = useAttendanceAnalyticsByClass(params);

  if (isLoading) {
    return <div className="flex justify-center py-12"><Spinner size={24} /></div>;
  }

  if (!data?.schedules || data.schedules.length === 0 || data.roster?.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No attendance recorded yet"
        description="Mark attendance from Calendar to see analytics here."
        action={<Button asChild variant="outline" size="sm"><Link to="/operations?tab=attendance">Open calendar</Link></Button>}
      />
    );
  }

  // ── Aggregate class-level totals ──
  let P = 0, A = 0, L = 0, EL = 0;
  data.roster.forEach((row) => {
    Object.values(row.sessions || {}).forEach((s) => {
      if (s === 'P') P++;
      else if (s === 'A') A++;
      else if (s === 'L') L++;
      else if (s === 'EL') EL++;
    });
  });
  const totalMarked   = P + A + L + EL;
  const totalScheduled = data.schedules.length * data.roster.length;
  const ratePct = totalMarked > 0 ? Math.round((P / totalMarked) * 100) : 0;

  const pPct  = totalMarked > 0 ? (P  / totalMarked) * 100 : 0;
  const aPct  = totalMarked > 0 ? (A  / totalMarked) * 100 : 0;
  const lPct  = totalMarked > 0 ? (L  / totalMarked) * 100 : 0;
  const elPct = totalMarked > 0 ? (EL / totalMarked) * 100 : 0;

  // ── Per-student rate (sorted ASC — worst first) ──
  const studentRows = data.roster.map((row) => {
    let p = 0, a = 0, l = 0, el = 0, total = 0;
    Object.values(row.sessions || {}).forEach((s) => {
      if (s === 'P') p++;
      else if (s === 'A') a++;
      else if (s === 'L') l++;
      else if (s === 'EL') el++;
      total++;
    });
    const rate = total > 0 ? (p / total) * 100 : 0;
    return { user: row.user, p, a, l, el, total, rate };
  }).sort((x, y) => x.rate - y.rate);

  return (
    <div className="space-y-4">
      {/* ── Class-level KPI strip ──────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-overline text-muted-foreground">Marked / Scheduled</span>
            <span className="text-xs text-subtle-foreground tabular-nums">
              {totalMarked} / {totalScheduled}
            </span>
          </div>
          <span className="text-h1 text-foreground tabular-nums leading-none">
            {ratePct}<span className="text-muted-foreground text-base font-normal">%</span>
          </span>
          <div className="text-small text-muted-foreground">Overall present rate</div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 space-y-2">
          <span className="text-overline text-muted-foreground">Status breakdown</span>
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            <div style={{ width: `${pPct}%`,  background: 'var(--color-chart-1)' }} title={`Present ${P}`} />
            <div style={{ width: `${lPct}%`,  background: 'var(--color-chart-2)' }} title={`Late ${L}`} />
            <div style={{ width: `${elPct}%`, background: 'var(--color-chart-3)' }} title={`Excused ${EL}`} />
            <div style={{ width: `${aPct}%`,  background: 'var(--color-chart-4)' }} title={`Absent ${A}`} />
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground tabular-nums">
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-chart-1" /> P {P}</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-chart-2" /> L {L}</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-chart-3" /> EL {EL}</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-chart-4" /> A {A}</span>
          </div>
        </div>
      </div>

      {/* ── Per-student table (sorted by rate ASC) ────── */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Per-student attendance</h3>
          <span className="text-overline text-subtle-foreground">sorted by rate · lowest first</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="px-3 py-2 text-left text-overline text-muted-foreground">Student</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">P</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">A</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">L</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">EL</th>
                <th className="px-3 py-2 text-right text-overline text-muted-foreground">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {studentRows.map((r) => {
                const rateColor = r.rate >= 80 ? 'text-success' : r.rate >= 60 ? 'text-warning' : 'text-destructive';
                return (
                  <tr key={r.user._id || r.user.empCode} className="hover:bg-accent transition-colors">
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-foreground">{r.user.name}</div>
                      <div className="text-[11px] text-subtle-foreground font-mono">{r.user.empCode}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-success tabular-nums">{r.p}</td>
                    <td className="px-3 py-2 text-right text-xs text-destructive tabular-nums">{r.a}</td>
                    <td className="px-3 py-2 text-right text-xs text-warning tabular-nums">{r.l}</td>
                    <td className="px-3 py-2 text-right text-xs text-info tabular-nums">{r.el}</td>
                    <td className={cn('px-3 py-2 text-right text-sm font-mono font-semibold tabular-nums', rateColor)}>
                      {r.rate.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
