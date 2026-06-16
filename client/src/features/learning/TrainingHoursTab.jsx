import { useState } from 'react';
import { Clock, Users } from 'lucide-react';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '@/components/EmptyState';
import { useTrainingHours } from '../../hooks/useLearning';

// ──────────────────────────────────────────────────────────
// TrainingHoursTab — A5 (Modernization Horizon 1)
// Audit-ready training hours per employee / department over a window, for
// labour-law minimums. Reads /api/learning/reports/training-hours (report.read).
// ──────────────────────────────────────────────────────────

const inputCls =
  'h-(--control-h) rounded-md border border-input bg-background px-3 text-sm text-foreground ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring';

function Kpi({ icon, label, value }) {
  const Icon = icon;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-subtle-foreground">
        <Icon className="size-4" aria-hidden="true" />{label}
      </div>
      <div className="mt-1 text-h3 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default function TrainingHoursTab() {
  const [groupBy, setGroupBy] = useState('user');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = { groupBy };
  if (from) params.from = from;
  if (to) params.to = to;
  const { data, isLoading, isError } = useTrainingHours(params);

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-overline text-muted-foreground">Group by</span>
          <div className="flex items-center gap-1.5" role="group" aria-label="Group by">
            {[['user', 'Employee'], ['department', 'Department']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setGroupBy(id)} aria-pressed={groupBy === id}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${groupBy === id ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="th-from" className="text-overline text-muted-foreground">From</label>
          <input id="th-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="th-to" className="text-overline text-muted-foreground">To</label>
          <input id="th-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </div>
        <p className="text-xs text-subtle-foreground self-center">Defaults to the last 90 days · hours = attended sessions × duration.</p>
      </div>

      {/* KPIs */}
      {totals && (
        <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
          <Kpi icon={Users} label="Employees" value={totals.employees} />
          <Kpi icon={Clock} label="Sessions attended" value={totals.sessions} />
          <Kpi icon={Clock} label="Total hours" value={totals.hours} />
        </div>
      )}

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="py-12 flex justify-center"><Spinner size={24} /></div>
        ) : isError ? (
          <div className="py-10 text-center text-destructive text-sm">Could not load training hours.</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Clock} title="No data" description="No attended sessions in this window." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {groupBy === 'user' ? (
                    <>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Employee</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Code</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Department</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Sessions</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Hours</th>
                    </>
                  ) : (
                    <>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Department</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Employees</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">With hours</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Sessions</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Hours</th>
                      <th scope="col" className="px-4 py-2 text-overline text-muted-foreground">Avg / head</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {groupBy === 'user'
                  ? rows.map((r) => (
                    <tr key={String(r.userId)} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.empCode}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.department}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.sessions}</td>
                      <td className="px-4 py-2 tabular-nums font-medium">{r.hours}</td>
                    </tr>
                  ))
                  : rows.map((r) => (
                    <tr key={r.department} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{r.department}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.employees}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.withHours}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.sessions}</td>
                      <td className="px-4 py-2 tabular-nums font-medium">{r.hours}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.avgHours}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
