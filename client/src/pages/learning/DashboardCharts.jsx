// Dependency-free SVG chart primitives for the executive dashboard (plan D3:
// no chart library — thin swappable visuals over the KPI bundle).

// Two-series sparkline. series: [{ key, label, points: number[], className }]
// All series share the x-axis (labels) and a common y-max.
export function Sparkline({ series, labels, title }) {
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const width = 100;
  const height = 32;
  const step = labels.length > 1 ? width / (labels.length - 1) : width;
  const toPolyline = (points) =>
    points
      .map((value, index) => `${(index * step).toFixed(1)},${(height - (value / max) * (height - 2) - 1).toFixed(1)}`)
      .join(' ');

  return (
    <figure>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full"
        role="img"
        aria-label={title}
        preserveAspectRatio="none"
      >
        {series.map((s) => (
          <polyline
            key={s.key}
            points={toPolyline(s.points)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            className={s.className}
          />
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{labels[0]} → {labels[labels.length - 1]}</span>
        <span className="flex gap-3">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span className={`inline-block h-0.5 w-4 bg-current ${s.className}`} aria-hidden="true" />
              {s.label} ({s.points.reduce((a, b) => a + b, 0)})
            </span>
          ))}
        </span>
      </figcaption>
    </figure>
  );
}

// Donut over SVG stroke-dasharray. segments: [{ label, value, className }].
// Radius 15.915 → circumference ≈ 100, so values map straight to percents.
export function DonutStat({ segments, centerValue, centerLabel, title }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  // Cumulative arc offsets, computed without render-time reassignment
  // (react-hooks/immutability). Offset 25 starts the first arc at 12 o'clock.
  const { arcs } = segments.reduce(
    (state, s) => {
      const percent = total > 0 ? (s.value / total) * 100 : 0;
      return {
        offset: state.offset - percent,
        arcs: [...state.arcs, { ...s, percent, offset: state.offset }],
      };
    },
    { offset: 25, arcs: [] },
  );

  return (
    <figure className="flex items-center gap-4">
      <svg viewBox="0 0 36 36" className="h-24 w-24 shrink-0" role="img" aria-label={title}>
        <circle cx="18" cy="18" r="15.915" fill="none" strokeWidth="3.8" className="stroke-muted" />
        {arcs.filter((arc) => arc.percent > 0).map((arc) => (
          <circle
            key={arc.label}
            cx="18" cy="18" r="15.915" fill="none" strokeWidth="3.8"
            stroke="currentColor"
            strokeDasharray={`${arc.percent} ${100 - arc.percent}`}
            strokeDashoffset={arc.offset}
            className={arc.className}
          />
        ))}
        <text x="18" y="17.5" textAnchor="middle" className="fill-foreground text-[7px] font-semibold">
          {centerValue}
        </text>
        <text x="18" y="24" textAnchor="middle" className="fill-muted-foreground text-[3.5px]">
          {centerLabel}
        </text>
      </svg>
      <figcaption className="space-y-1 text-xs">
        {segments.map((s) => (
          <p key={s.label} className="flex items-center gap-1.5">
            <span className={`inline-block size-2 rounded-full bg-current ${s.className}`} aria-hidden="true" />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="tabular-nums font-medium">{s.value}</span>
          </p>
        ))}
      </figcaption>
    </figure>
  );
}
