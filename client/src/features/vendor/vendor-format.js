// ──────────────────────────────────────────────────────────
// vendor-format — pure money/date formatters for the A2 Vendors feature.
// Kept in a non-component module so vendor-ui.jsx exports only components
// (clean React-Refresh boundary).
// ──────────────────────────────────────────────────────────

export const fmtMinor = (value, currency) =>
  value == null ? '—' : `${Number(value).toLocaleString()}${currency ? ` ${currency}` : ''}`;

export const fmtDate = (d) =>
  (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
