// ──────────────────────────────────────────────────────────
// slot-time-utils — pure helpers for the Scheduling config editor
// ──────────────────────────────────────────────────────────
// The editor manages `ALLOWED_TIME_SLOTS` — the VN wall-clock windows team
// leaders may book into. The server stores each slot as `{ sh, sm, eh, em }`
// (start hour/min, end hour/min); these helpers convert to/from the native
// <input type="time"> "HH:mm" string, compute duration, and validate a slot
// set the SAME way the server does (`scheduling-window-policy.parseSlots`):
//   • each window must be a same-day, strictly-positive range (end > start),
//   • windows may not overlap or duplicate.
// Keeping this mirror client-side gives instant inline feedback; the server
// remains authoritative (it re-validates on PUT /api/settings).
// ──────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/** Minutes-since-midnight for a slot's start/end. */
export function slotMinutes({ sh, sm, eh, em }) {
  return { start: sh * 60 + sm, end: eh * 60 + em };
}

/** Window length in minutes (may be ≤ 0 for an invalid slot). */
export function slotDurationMinutes(slot) {
  const { start, end } = slotMinutes(slot);
  return end - start;
}

/** Human duration: 90 → "1h 30m", 60 → "1h", 45 → "45m", ≤0 → "—". */
export function formatDuration(min) {
  if (!Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** "HH:mm" for an hour/minute pair. */
export function toHHMM(h, m) {
  return `${pad(h)}:${pad(m)}`;
}

/** Parse "HH:mm" → { h, m }, or null if malformed / out of range. */
export function parseHHMM(str) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(str || '');
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/** Canonical display label "HH:mm–HH:mm". */
export function slotLabel(slot) {
  return `${toHHMM(slot.sh, slot.sm)}–${toHHMM(slot.eh, slot.em)}`;
}

/** Strip any extra fields (e.g. legacy `label`) to the storable shape. */
export function cleanSlot({ sh, sm, eh, em }) {
  return { sh, sm, eh, em };
}

// Error reason keys — the page maps these to i18n strings so messages stay
// translatable and tests can assert on a stable code, not English copy.
export const SLOT_ERROR = {
  RANGE: 'range', // end not after start (or non-integer)
  OVERLAP: 'overlap', // window overlaps/duplicates another
};

/**
 * Validate a slot array the way the server does. Returns `perRow` keyed by the
 * slot's ORIGINAL index (so the UI can highlight the exact row) and `ok` when
 * the whole set is valid. An empty array is valid (means "booking disabled").
 */
export function validateSlots(slots) {
  const perRow = {};

  // 1) per-row same-day positive window
  slots.forEach((s, i) => {
    const { start, end } = slotMinutes(s);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
      perRow[i] = SLOT_ERROR.RANGE;
    }
  });

  // 2) overlap detection on the individually-valid rows, ordered by start
  const ordered = slots
    .map((s, i) => ({ i, ...slotMinutes(s) }))
    .filter((x) => !perRow[x.i])
    .sort((a, b) => a.start - b.start || a.end - b.end);

  for (let k = 1; k < ordered.length; k += 1) {
    if (ordered[k].start < ordered[k - 1].end) {
      perRow[ordered[k].i] = SLOT_ERROR.OVERLAP;
      if (!perRow[ordered[k - 1].i]) perRow[ordered[k - 1].i] = SLOT_ERROR.OVERLAP;
    }
  }

  return { perRow, ok: Object.keys(perRow).length === 0 };
}
