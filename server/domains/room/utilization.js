const repository = require('./repository');
const { getConfigDto } = require('../schedule/scheduling-window-policy');

// 24-hex object-id shape (both backends use it) — replaces mongoose.isValidObjectId
// so this report is backend-agnostic (Wave K-1: no direct Mongoose here).
const isObjectIdShape = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

// ──────────────────────────────────────────────────────────
// room/utilization — booked vs available room-hours (Build Plan #5).
// ──────────────────────────────────────────────────────────
// DERIVED, no new store: booked hours come from the roomed `scheduled`
// sessions (the RoomBooking ledger is written 1:1 with Schedule.roomId, and
// Schedule carries the start/end the booking represents). "Available" hours use
// the configured bookable window (sum of ALLOWED_TIME_SLOTS durations) per day
// × the range length — the real denominator, not an invented business day.
// ──────────────────────────────────────────────────────────

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

const round1 = (n) => Math.round(n * 10) / 10;
const pct = (booked, avail) => (avail > 0 ? Math.round((booked / avail) * 100) : null);

async function getRoomUtilization({ range = '30d', officeId = null } = {}) {
  const days = RANGE_DAYS[range] || 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  // Available hours/day = sum of configured bookable-slot durations.
  const config = await getConfigDto();
  const slotMinutesPerDay = (config.slots || []).reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const availableHours = (slotMinutesPerDay / 60) * days;

  // Rooms (optionally office-scoped). Ignore a malformed officeId rather than 500.
  const rooms = await repository.listRooms({ officeId: isObjectIdShape(officeId) ? officeId : undefined });
  const roomIds = rooms.map((r) => r._id);

  // Booked sessions in range, per room.
  const sessions = roomIds.length
    ? await repository.findRoomedSessionsInRange({ roomIds, from, to })
    : [];

  const booked = new Map(); // roomId → { hours, sessions }
  for (const s of sessions) {
    const rid = String(s.roomId);
    const hours = Math.max(0, (new Date(s.endTime) - new Date(s.startTime)) / 3600000);
    const cur = booked.get(rid) || { hours: 0, sessions: 0 };
    cur.hours += hours;
    cur.sessions += 1;
    booked.set(rid, cur);
  }

  const perRoom = rooms.map((r) => {
    const b = booked.get(String(r._id)) || { hours: 0, sessions: 0 };
    return {
      roomId: r._id,
      roomName: r.name,
      roomCode: r.code,
      officeId: r.officeId?._id || null,
      officeName: r.officeId?.name || null,
      bookedHours: round1(b.hours),
      sessions: b.sessions,
      availableHours: round1(availableHours),
      utilizationPct: pct(b.hours, availableHours),
    };
  }).sort((a, b) => b.bookedHours - a.bookedHours);

  // Per-office rollup.
  const officeMap = new Map();
  for (const r of perRoom) {
    const key = String(r.officeId || 'none');
    const cur = officeMap.get(key) || {
      officeId: r.officeId, officeName: r.officeName || 'Unassigned',
      rooms: 0, bookedHours: 0, availableHours: 0, sessions: 0,
    };
    cur.rooms += 1;
    cur.bookedHours += r.bookedHours;
    cur.availableHours += r.availableHours;
    cur.sessions += r.sessions;
    officeMap.set(key, cur);
  }
  const perOffice = [...officeMap.values()].map((o) => ({
    ...o,
    bookedHours: round1(o.bookedHours),
    availableHours: round1(o.availableHours),
    utilizationPct: pct(o.bookedHours, o.availableHours),
  })).sort((a, b) => b.bookedHours - a.bookedHours);

  return {
    range,
    from,
    to,
    availableHoursPerRoom: round1(availableHours),
    perRoom,
    perOffice,
  };
}

module.exports = { getRoomUtilization };
