// ──────────────────────────────────────────────────────────
// booking-cell-state — classify a booking-grid cell into one variant
// ──────────────────────────────────────────────────────────
// The bug-prone gating (when is a cell bookable vs locked?) lives here so it is
// unit-testable and survives the Phase 3 descriptor refactor — Phase 3 only
// re-wires the call site, not this decision.
//
// Variants:
//   'mine'       — the selected team's own session (click to cancel)
//   'blocker'    — a slot taken by another team (read-only)
//   'empty-past' — an empty past slot (muted, never interactive)
//   'bookable'   — an empty future slot the leader may book
//   'locked'     — an empty future slot the leader may NOT book because the
//                  program's schedulingMode isn't `leader_booking`
//                  (admin_scheduled / cohort modes). Read-only — the server
//                  would 403/400 anyway; the UI pre-empts that round-trip.
//
// `mine` / `blocker` take precedence in EVERY mode: existing-session
// visibility is never gated, only the empty-cell "+ Book" affordance is.
// ──────────────────────────────────────────────────────────

/**
 * @param {object} args
 * @param {object|null} [args.mySchedule] - selected team's session in this cell, if any
 * @param {object|null} [args.blocker]    - another team's session in this cell, if any
 * @param {boolean} args.isPast           - whether the cell's day is in the past
 * @param {boolean} args.bookable         - whether the selected team's mode allows leader booking
 * @returns {'mine'|'blocker'|'empty-past'|'bookable'|'locked'}
 */
export function bookingCellState({ mySchedule, blocker, isPast, bookable }) {
  if (mySchedule) return 'mine';
  if (blocker) return 'blocker';
  if (isPast) return 'empty-past';
  return bookable ? 'bookable' : 'locked';
}
