import { useTranslation } from 'react-i18next';

// Honest Kirkpatrick rollup: L1/L2 carry measured values from the bundle;
// L3–L5 are explicitly "Not yet measured" — never fake a metric.
export default function DashboardKirkpatrick({ kirkpatrick }) {
  const { t } = useTranslation();
  const x = 'learning.dashboard.executive';

  const rows = [
    {
      key: 'l1',
      label: t(`${x}.l1`),
      measured: kirkpatrick.l1Reaction.measured,
      value: kirkpatrick.l1Reaction.averageRating == null
        ? '—'
        : t(`${x}.l1Value`, {
          rating: kirkpatrick.l1Reaction.averageRating,
          count: kirkpatrick.l1Reaction.submissions,
        }),
    },
    {
      key: 'l2',
      label: t(`${x}.l2`),
      measured: kirkpatrick.l2Learning.measured,
      value: t(`${x}.l2Value`, {
        rate: kirkpatrick.l2Learning.passRate,
        count: kirkpatrick.l2Learning.attempts,
      }),
    },
    { key: 'l3', label: t(`${x}.l3`), measured: kirkpatrick.l3Behavior.measured },
    { key: 'l4', label: t(`${x}.l4`), measured: kirkpatrick.l4Results.measured },
    { key: 'l5', label: t(`${x}.l5`), measured: kirkpatrick.l5Roi.measured },
  ];

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3 py-1.5 text-xs">
          <span className="font-medium">{row.label}</span>
          {row.measured ? (
            <span className="tabular-nums">{row.value}</span>
          ) : (
            <span className="rounded-full border border-dashed px-2 py-0.5 text-muted-foreground">
              {t(`${x}.notMeasured`)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
