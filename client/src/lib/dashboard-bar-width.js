export function activeRatioBarWidth(active, total) {
  if (!Number.isFinite(active) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }

  const ratio = active / total;
  return Math.min(Math.max(ratio, 0), 1) * 100;
}
