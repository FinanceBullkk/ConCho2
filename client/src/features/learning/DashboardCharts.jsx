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

// Filled area trend (prototype AreaTrend) — a prominent hero chart for the
// executive view. The FIRST series gets the area fill + dots; any extra series
// overlay as dashed lines. Honest multi-series — every point is real bundle data.
// series: [{ key, label, points: number[], className }]; className sets the line
// colour (text-*) and, via currentColor, the fill + dots.
export function AreaTrend({ series, labels, title }) {
  const width = 520;
  const height = 150;
  const pad = 8;
  const baseY = height - 22;
  const all = series.flatMap((s) => s.points);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const n = labels.length;
  const xAt = (i) => pad + (n > 1 ? (i / (n - 1)) * (width - pad * 2) : 0);
  const yAt = (v) => baseY - ((v - min) / span) * (height - 38);
  const lineOf = (points) =>
    points.map((v, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ');
  const [primary, ...rest] = series;
  const primaryLine = lineOf(primary.points);
  const area = `${primaryLine} L${xAt(n - 1).toFixed(1)} ${baseY} L${xAt(0).toFixed(1)} ${baseY} Z`;

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" role="img" aria-label={title} preserveAspectRatio="none">
        <line x1={pad} y1={baseY} x2={width - pad} y2={baseY} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="currentColor" fillOpacity="0.15" className={primary.className} />
        {rest.map((s) => (
          <path
            key={s.key}
            d={lineOf(s.points)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            className={s.className}
          />
        ))}
        <path d={primaryLine} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className={primary.className} />
        {primary.points.map((v, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(v)} r="2.4" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className={`fill-card ${primary.className}`} />
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
