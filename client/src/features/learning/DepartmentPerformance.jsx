import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDepartmentPerformance } from '../../hooks/useLearningDashboard';
import { EmptyState } from '@/components/EmptyState';

// Per-department performance (screenshots 02 table + 20 cards). One source
// (/dashboard/departments) — real headcount/completion/coverage/overdue.
// `variant`: 'table' (Overview) | 'cards' (Departments tab).

const RANGES = [['7', '7d'], ['30', '30d'], ['90', 'quarter'], ['365', 'ytd']];
const barTone = (pct) => (pct >= 80 ? 'bg-success' : pct >= 60 ? 'bg-primary' : pct >= 40 ? 'bg-warning' : 'bg-destructive');

function Bar({ pct }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${barTone(pct)}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

function RangePicker({ window, setWindow, t }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-0.5" role="tablist" aria-label={t('learning.deptPerf.range')}>
      {RANGES.map(([val, key]) => (
        <button
          key={val}
          type="button"
          role="tab"
          aria-selected={String(window) === val}
          onClick={() => setWindow(Number(val))}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${String(window) === val ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {t(`learning.deptPerf.ranges.${key}`)}
        </button>
      ))}
    </div>
  );
}

function OverdueBadge({ count, t }) {
  const tone = count > 0 ? 'bg-destructive/15 text-destructive' : 'bg-success/15 text-success';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{t('learning.deptPerf.overdueCount', { count })}</span>;
}

export default function DepartmentPerformance({ variant = 'table' }) {
  const { t } = useTranslation();
  const [window, setWindow] = useState(30);
  const { data, isLoading, isError } = useDepartmentPerformance(window);
  const rows = data?.departments || [];

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{t('learning.deptPerf.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('learning.deptPerf.subtitle')}</p>
      </div>
      <RangePicker window={window} setWindow={setWindow} t={t} />
    </div>
  );

  if (isError) return <div className="space-y-3">{header}<EmptyState title={t('learning.deptPerf.loadError')} /></div>;
  if (isLoading) return <div className="space-y-3">{header}<div className="h-32 animate-pulse rounded-xl bg-muted" /></div>;
  if (!rows.length) return <div className="space-y-3">{header}<EmptyState title={t('learning.deptPerf.empty')} /></div>;

  if (variant === 'cards') {
    return (
      <div className="space-y-3">
        {header}
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((d) => (
            <div key={d.department} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-foreground">{d.department}</div>
                  <div className="text-xs text-muted-foreground">{t('learning.deptPerf.people', { count: d.headcount })}</div>
                </div>
                <OverdueBadge count={d.overdueCount} t={t} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{t('learning.deptPerf.completion')}</span><span className="font-semibold tabular-nums text-foreground">{d.completionPercent}%</span></div>
                  <div className="mt-1"><Bar pct={d.completionPercent} /></div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{t('learning.deptPerf.coverage')}</span><span className="font-semibold tabular-nums text-foreground">{d.coveragePercent}%</span></div>
                  <div className="mt-1"><Bar pct={d.coveragePercent} /></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle-foreground">
              <th className="px-4 py-3">{t('learning.deptPerf.department')}</th>
              <th className="px-4 py-3 text-right">{t('learning.deptPerf.headcount')}</th>
              <th className="px-4 py-3">{t('learning.deptPerf.completion')}</th>
              <th className="px-4 py-3">{t('learning.deptPerf.coverage')}</th>
              <th className="px-4 py-3 text-right">{t('learning.deptPerf.overdue')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.department} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5 font-medium text-foreground">{d.department}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{d.headcount}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2"><div className="w-24"><Bar pct={d.completionPercent} /></div><span className="tabular-nums text-foreground">{d.completionPercent}%</span></div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2"><div className="w-24"><Bar pct={d.coveragePercent} /></div><span className="tabular-nums text-foreground">{d.coveragePercent}%</span></div>
                </td>
                <td className="px-4 py-2.5 text-right"><OverdueBadge count={d.overdueCount} t={t} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
