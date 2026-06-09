// ──────────────────────────────────────────────────────────
// scheduling-slots — exact slot-descriptor helpers (Wave E1 client slice)
// ──────────────────────────────────────────────────────────
// The server is authoritative on bookable windows: `ALLOWED_TIME_SLOTS` is
// exposed via `GET /api/learning/sessions/config` as exact descriptors
// (`{ id, label, startHour, startMinute, endHour, endMinute, durationMinutes }`,
// VN wall-clock, start-time ordered). These pure helpers let the calendar grid
// render those exact windows (incl. non-60-min / minute-offset slots) and build
// exact UTC booking ranges — replacing the old integer-hour grid + `hour + 1`.
//
// Timezone: VN (`Asia/Ho_Chi_Minh`) is a fixed +07:00 with no DST, so a single
// `offsetMinutes` (from the config, = 420) converts VN wall-clock ↔ UTC exactly.
// We read a UTC instant's VN wall-clock by shifting it by the offset and reading
// UTC fields — tz-independent, never relying on the browser's local zone for the
// time-of-day. Calendar DAY identity still comes from the grid's local Date
// columns (the audience runs in VN, so local day == VN day).
//
// Fail-closed: an empty/malformed config yields no bookable rows. Historical
// off-policy sessions still render (read-only) as their own derived rows.
// ──────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/** VN wall-clock parts of a UTC instant, tz-independent (offset-shift + UTC getters). */
function vnParts(value, offsetMinutes) {
  const shifted = new Date(new Date(value).getTime() + offsetMinutes * 60000);
  return {
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** Canonical slot id/label "HH:mm-HH:mm" from a descriptor's start/end. */
export function slotId({ startHour, startMinute, endHour, endMinute }) {
  return `${pad(startHour)}:${pad(startMinute)}-${pad(endHour)}:${pad(endMinute)}`;
}

/**
 * The slot id a booked session belongs to, in VN wall-clock — matches the
 * config DTO id format so a session lands on its configured row (or, if it
 * matches none, becomes its own off-policy row).
 */
export function scheduleSlotId(schedule, offsetMinutes) {
  const a = vnParts(schedule.startTime, offsetMinutes);
  const b = vnParts(schedule.endTime, offsetMinutes);
  return `${pad(a.hour)}:${pad(a.minute)}-${pad(b.hour)}:${pad(b.minute)}`;
}

/** Build a read-only off-policy descriptor from a session's VN window. */
function offPolicyDescriptor(schedule, offsetMinutes) {
  const a = vnParts(schedule.startTime, offsetMinutes);
  const b = vnParts(schedule.endTime, offsetMinutes);
  const durationMinutes = (b.hour * 60 + b.minute) - (a.hour * 60 + a.minute);
  return {
    id: `${pad(a.hour)}:${pad(a.minute)}-${pad(b.hour)}:${pad(b.minute)}`,
    label: `${pad(a.hour)}:${pad(a.minute)}-${pad(b.hour)}:${pad(b.minute)}`,
    startHour: a.hour,
    startMinute: a.minute,
    endHour: b.hour,
    endMinute: b.minute,
    durationMinutes,
    offPolicy: true,
  };
}

/**
 * Convert a grid day + slot descriptor into an exact UTC ISO range.
 * The slot's VN wall-clock (startHour:startMinute … endHour:endMinute) on the
 * grid day's calendar date is shifted to UTC by `offsetMinutes`. No `hour + 1`,
 * no local `setHours` drift.
 *
 * @param {Date} day - the grid day column (its Y/M/D = the intended VN date)
 * @param {object} slot - a slot descriptor
 * @param {number} offsetMinutes - VN UTC offset (config.utcOffsetMinutes, e.g. 420)
 * @returns {{ startISO: string, endISO: string }}
 */
export function slotToUtcRange(day, slot, offsetMinutes) {
  const y = day.getFullYear();
  const mo = day.getMonth();
  const d = day.getDate();
  const startMs = Date.UTC(y, mo, d, slot.startHour, slot.startMinute) - offsetMinutes * 60000;
  const endMs = Date.UTC(y, mo, d, slot.endHour, slot.endMinute) - offsetMinutes * 60000;
  return {
    startISO: new Date(startMs).toISOString(),
    endISO: new Date(endMs).toISOString(),
  };
}

/**
 * Build the ordered slot rows for a visible week: configured (bookable) slots
 * plus any in-week session whose window matches no configured slot (rendered as
 * a read-only off-policy row). Sorted by start, then end. Deduped by id.
 *
 * @param {Array} configSlots - config.slots descriptors (bookable)
 * @param {Array} schedules - sessions visible on the grid
 * @param {number} offsetMinutes - VN UTC offset
 * @param {Date} [weekStart] - inclusive week start (filters off-policy rows)
 * @param {Date} [weekEnd] - exclusive week end
 * @returns {Array} descriptor rows (configured carry offPolicy:false)
 */
export function buildSlotRows(configSlots, schedules, offsetMinutes, weekStart, weekEnd) {
  const byId = new Map();

  for (const s of configSlots || []) {
    byId.set(s.id, { ...s, offPolicy: false });
  }

  for (const sch of schedules || []) {
    const start = new Date(sch.startTime);
    if (weekStart && weekEnd && !(start >= weekStart && start < weekEnd)) continue;
    const id = scheduleSlotId(sch, offsetMinutes);
    if (byId.has(id)) continue; // matches a configured (or already-added) row
    byId.set(id, offPolicyDescriptor(sch, offsetMinutes));
  }

  return [...byId.values()].sort(
    (a, b) =>
      (a.startHour * 60 + a.startMinute) - (b.startHour * 60 + b.startMinute) ||
      (a.endHour * 60 + a.endMinute) - (b.endHour * 60 + b.endMinute),
  );
}
