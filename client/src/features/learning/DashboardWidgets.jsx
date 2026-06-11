import { useTranslation } from 'react-i18next';

// Dependency-free presentational primitives for the operational dashboard.
// No chart library by design (plan D3) — tiles + CSS-width bars only, so the
// visual layer stays a thin swappable skin over the KPI bundle.

export function StatTile({ label, value, hint, alert = false }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? 'text-destructive' : 'text-foreground'}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// Horizontal bar list. rows: [{ key, label, display, percent (0–100), detail? }]
export function MetricBars({ title, rows }) {
  if (!rows?.length) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">{title}</h4>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.key} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{row.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {row.display}
                {row.detail ? ` · ${row.detail}` : ''}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 w-full rounded bg-muted" aria-hidden="true">
              <div
                className="h-1.5 rounded bg-primary"
                style={{ width: `${Math.min(100, Math.max(0, row.percent))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Shown in place of a metric block the server reported as failed (errors[]).
export function MetricUnavailable() {
  const { t } = useTranslation();
  return (
    <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
      {t('learning.dashboard.metricUnavailable')}
    </p>
  );
}
