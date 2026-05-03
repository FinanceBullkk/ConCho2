const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

// ──────────────────────────────────────────────────────────
// Centralized Day.js Configuration — Asia/Ho_Chi_Minh
// ──────────────────────────────────────────────────────────
// ALL time-related business logic MUST use these helpers
// instead of raw `new Date().getHours()` etc.
//
// WHY: Production server (Render.com) runs UTC (+0).
// Using native JS `getHours()` returns UTC hours, which is
// 7 hours behind Vietnam time. This causes ALL time-slot
// validations to fail on production.
//
// RULE: MongoDB stores UTC. Business logic converts to VN
// timezone ONLY for validation/display. Never store VN time.
// ──────────────────────────────────────────────────────────

const VN_TZ = 'Asia/Ho_Chi_Minh';

/**
 * Get the current time in Vietnam timezone.
 * @returns {dayjs.Dayjs}
 */
const nowVN = () => dayjs().tz(VN_TZ);

/**
 * Convert a date/string to Vietnam timezone.
 * @param {Date|string|number} date
 * @returns {dayjs.Dayjs}
 */
const toVN = (date) => dayjs(date).tz(VN_TZ);

/**
 * Get start of today in Vietnam timezone.
 * Returns a native Date (UTC) for MongoDB queries.
 *
 * Example: At 23:30 VN on May 2 (= 16:30 UTC May 2),
 *   todayVN() → 17:00 UTC May 1 (= 00:00 VN May 2)
 *
 * @returns {Date} UTC Date representing 00:00 VN today
 */
const todayVN = () => dayjs().tz(VN_TZ).startOf('day').toDate();

module.exports = { dayjs, VN_TZ, nowVN, toVN, todayVN };
