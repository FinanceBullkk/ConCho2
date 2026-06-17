import { Star } from 'lucide-react';
import { fmtDate } from './vendor-format';

// ──────────────────────────────────────────────────────────
// vendor-ui — small shared presentational components for the A2 Vendors feature
// (renewal badge, star rating). Formatters live in vendor-format.js so this
// module exports only components (clean React-Refresh boundary).
// ──────────────────────────────────────────────────────────

const RENEWAL_TONE = {
  expired: 'bg-destructive/10 text-destructive',
  'due-soon': 'bg-warning/10 text-warning',
  ok: 'bg-success/10 text-success',
  none: 'bg-muted text-muted-foreground',
};

export function RenewalBadge({ status, endsOn, t }) {
  const tone = RENEWAL_TONE[status] || RENEWAL_TONE.none;
  const label = t(`vendor.renewal.${status === 'due-soon' ? 'dueSoon' : status}`);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}{status !== 'none' && endsOn ? ` · ${fmtDate(endsOn)}` : ''}
    </span>
  );
}

export function Stars({ avg, count, t }) {
  if (!count) return <span className="text-xs text-muted-foreground">—</span>;
  // t is optional so the component never crashes if a caller forgets it; the
  // literal fallback matches the en.json value byte-for-byte.
  const title = t ? t('vendor.starsTooltip', { avg, count }) : `${avg} from ${count}`;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" title={title}>
      <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
      <span className="text-sm">{avg}</span>
      <span className="text-xs text-muted-foreground">({count})</span>
    </span>
  );
}
