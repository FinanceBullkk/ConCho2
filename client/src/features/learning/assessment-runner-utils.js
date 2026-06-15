// Helpers for the learner assessment runner (timer + shuffle).
// Grading is always by itemId on the server, so shuffling display order is
// purely cosmetic and never affects scoring.

// "MM:SS" from a whole number of seconds (clamped at 0).
export const formatClock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
};

// Deterministic-enough shuffle (Fisher–Yates). Called once per attempt inside a
// useMemo so the order is stable across re-renders.
export const shuffleItems = (items, enabled) => {
  if (!enabled || !Array.isArray(items) || items.length < 2) return items;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// How many items the learner has actually answered (for the "N/M answered" hint).
export const answeredCount = (items, answers) =>
  items.reduce((n, item) => {
    const a = answers[item.id];
    if (!a) return n;
    if (item.type === 'short_text') return n + (a.text && a.text.trim() ? 1 : 0);
    return n + ((a.selectedOptionIndexes || []).length > 0 ? 1 : 0);
  }, 0);
