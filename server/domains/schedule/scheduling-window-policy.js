// ──────────────────────────────────────────────────────────
// Scheduling-Window Policy (Wave E1)
// ──────────────────────────────────────────────────────────
// Single source of truth for "what counts as a bookable time window".
//
// Before E1 this logic was duplicated in three places (scheduleService
// assertValidBookingSlot + adminCreate) and BYPASSED entirely by the Admin
// schedule-update path. It also lived only server-side, so the client invented
// its own fixed one-hour grid. This module centralizes:
//
//   1. parsing/normalizing the `ALLOWED_TIME_SLOTS` Setting,
//   2. validating a booking window against the configured slots,
//   3. validating an Admin-supplied config on write (settings PUT),
//   4. producing a safe config DTO for the client (no raw Setting docs).
//
// `ALLOWED_TIME_SLOTS` stores VN wall-clock windows: [{ sh, sm, eh, em }, ...]
// (extra fields such as `label` are ignored). MongoDB stores UTC; we convert to
// Asia/Ho_Chi_Minh for validation/display only — never store VN time.
//
// Fail-closed: empty/malformed config means NO new or moved bookings are
// allowed (history still renders client-side). It never invents fake slots.
// ──────────────────────────────────────────────────────────

const Setting = require('../../models/Setting');
const { toVN, VN_TZ } = require('../../helpers/dayjsConfig');
const { ServiceError } = require('../../helpers/ServiceError');

// Legacy per-team weekly booking cap. Hardcoded in scheduleService today; exposed
// here for display in the config DTO (E1 does not change enforcement).
const WEEKLY_TEAM_LIMIT = 2;

const pad = (n) => String(n).padStart(2, '0');

/** Canonical slot id/label: "HH:mm-HH:mm" (VN wall-clock). */
const slotId = (d) =>
  `${pad(d.startHour)}:${pad(d.startMinute)}-${pad(d.endHour)}:${pad(d.endMinute)}`;

/**
 * Normalize one raw slot ({ sh, sm, eh, em }) into a descriptor, or return null
 * if it is malformed (non-integer, out of range, or not a same-day positive
 * window). Extra fields (e.g. `label`) are ignored.
 */
const normalizeSlot = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const { sh, sm, eh, em } = raw;
  for (const v of [sh, sm, eh, em]) {
    if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  }
  if (sh < 0 || sh > 23 || eh < 0 || eh > 23) return null;
  if (sm < 0 || sm > 59 || em < 0 || em > 59) return null;

  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (endMinutes <= startMinutes) return null; // same-day, strictly positive

  return {
    startHour: sh,
    startMinute: sm,
    endHour: eh,
    endMinute: em,
    startMinutes,
    endMinutes,
    durationMinutes: endMinutes - startMinutes,
  };
};

/**
 * Parse a raw slot array into sorted, valid descriptors and a list of problems.
 * - Invalid entries are reported by index.
 * - Overlapping/duplicate windows are reported (a duplicate overlaps itself).
 * Returns { slots, errors }. `slots` is always the valid, start-time-ordered set
 * (so the config DTO can still render whatever is usable).
 */
const parseSlots = (rawArray) => {
  const errors = [];
  if (!Array.isArray(rawArray)) {
    return { slots: [], errors: ['ALLOWED_TIME_SLOTS must be an array'] };
  }

  const valid = [];
  rawArray.forEach((raw, i) => {
    const d = normalizeSlot(raw);
    if (!d) {
      errors.push(`slot[${i}] is not a valid same-day window {sh,sm,eh,em}`);
      return;
    }
    valid.push(d);
  });

  // Stable order by start time, then end time.
  valid.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  // Overlap / duplicate detection on the sorted set.
  for (let i = 1; i < valid.length; i += 1) {
    if (valid[i].startMinutes < valid[i - 1].endMinutes) {
      errors.push(`slot ${slotId(valid[i])} overlaps ${slotId(valid[i - 1])}`);
    }
  }

  return { slots: valid, errors };
};

/** Shape a descriptor into the client-facing DTO. */
const toDto = (d) => ({
  id: slotId(d),
  label: slotId(d),
  startHour: d.startHour,
  startMinute: d.startMinute,
  endHour: d.endHour,
  endMinute: d.endMinute,
  durationMinutes: d.durationMinutes,
});

/** Read the raw ALLOWED_TIME_SLOTS value (array) from Settings. */
const readRawSlots = async () => {
  const setting = await Setting.findOne({ key: 'ALLOWED_TIME_SLOTS' }).lean();
  return Array.isArray(setting?.value) ? setting.value : [];
};

/**
 * Validate an Admin-supplied slot config on write (settings PUT).
 * Allows an EMPTY array (means "no bookable slots" — disables booking, keeps
 * history visible). Rejects malformed entries and overlapping/duplicate windows.
 * @throws {ServiceError} 400 with a combined message of all problems.
 */
const assertSlotsValidForWrite = (rawArray) => {
  const { errors } = parseSlots(rawArray);
  if (errors.length > 0) {
    throw new ServiceError(`Invalid ALLOWED_TIME_SLOTS: ${errors.join('; ')}`, 400);
  }
};

/**
 * Validate a booking window (start/end Dates) against the configured slots.
 * Fail-closed: if there are no valid configured slots, all bookings are
 * rejected. The window must EXACTLY match one configured slot in VN time.
 *
 * NOTE: the mismatch message intentionally keeps the legacy bilingual string
 * ("không hợp lệ") that the API contract + existing tests assert on. This is a
 * relocated legacy string, not a new one.
 *
 * @throws {ServiceError} 400 on invalid dates / range / disallowed slot
 */
const assertValidBookingWindow = async (start, end) => {
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ServiceError('startTime and endTime must be valid ISO dates');
  }
  if (end <= start) {
    throw new ServiceError('endTime must be after startTime');
  }

  const { slots } = parseSlots(await readRawSlots());

  const startVN = toVN(start);
  const endVN = toVN(end);
  const sH = startVN.hour();
  const sM = startVN.minute();
  const eH = endVN.hour();
  const eM = endVN.minute();

  const matches = slots.some(
    (s) => s.startHour === sH && s.startMinute === sM && s.endHour === eH && s.endMinute === eM,
  );

  if (!matches) {
    throw new ServiceError('Khung giờ không hợp lệ — Please select an allowed time slot.');
  }
};

/**
 * Build the safe config DTO for the client. Exposes ONLY scheduling data —
 * never the raw Setting document or other settings.
 * @returns {Promise<{timezone, utcOffsetMinutes, weeklyTeamLimit, slots[]}>}
 */
const getConfigDto = async () => {
  const { slots } = parseSlots(await readRawSlots());
  return {
    timezone: VN_TZ,
    utcOffsetMinutes: toVN(new Date()).utcOffset(), // VN is a fixed +420 (no DST)
    weeklyTeamLimit: WEEKLY_TEAM_LIMIT,
    slots: slots.map(toDto),
  };
};

module.exports = {
  WEEKLY_TEAM_LIMIT,
  normalizeSlot,
  parseSlots,
  assertSlotsValidForWrite,
  assertValidBookingWindow,
  getConfigDto,
};
