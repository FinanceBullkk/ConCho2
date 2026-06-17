// Shared score-display helpers + input class for the evaluation surfaces
// (modal, table columns, stats strip).

export const scoreColor = (s) => {
  if (s == null || s === '') return 'text-subtle-foreground';
  const n = Number(s);
  if (n >= 8) return 'text-success';
  if (n >= 6) return 'text-warning';
  if (n > 0)  return 'text-destructive';
  return 'text-subtle-foreground';
};

export function ScoreCell({ score }) {
  if (score == null || score === '' || Number(score) === 0) {
    return <span className="text-subtle-foreground">—</span>;
  }
  return (
    <span className={`font-semibold tabular-nums ${scoreColor(score)}`}>
      {score}
    </span>
  );
}

export function AvgCell({ g, v, p, f }) {
  const vals = [g, v, p, f];
  if (vals.every((x) => x == null || x === '' || Number(x) === 0)) {
    return <span className="text-subtle-foreground">—</span>;
  }
  const avg = vals.reduce((acc, x) => acc + (Number(x) || 0), 0) / 4;
  return (
    <span className={`font-bold tabular-nums ${scoreColor(avg)}`}>
      {avg.toFixed(1)}
    </span>
  );
}

// Shared input class for the modal fields.
export const INPUT_CLS =
  'w-full px-3 h-9 rounded-md bg-background border border-input text-foreground ' +
  'placeholder:text-subtle-foreground focus:outline-none focus:ring-2 focus:ring-ring ' +
  'transition-colors text-sm';
