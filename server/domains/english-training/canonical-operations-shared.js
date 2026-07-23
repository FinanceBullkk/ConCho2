const crypto = require('crypto');
const { ServiceError } = require('../../helpers/ServiceError');
const { assertValidBookingWindow } = require('../schedule/scheduling-window-policy');
const { toVN } = require('../../helpers/dayjsConfig');

// Shared helpers + pinned authority for the canonical English live-operations
// commands. Split out of canonical-operations.js so the enrollment and meeting
// operation modules can reuse them without a circular dependency.
const AUTHORITY = 'ConMeoGauGau@4107cd52ee905e87254e099da23cb58dcbdd82a9';

const normalizeLabel = (value) => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  return normalized || null;
};

const auditActor = (actor = {}) => ({
  actorUserId: actor._id || actor.id || null,
  actorEmpCode: actor.empCode || null,
});

const iso = (value) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

const dateOnly = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return toVN(value).format('YYYY-MM-DD');
};

// Validate a proposed Meeting window: future, valid dates, inside an approved
// booking slot. Returns the normalized start/end + duration.
const meetingWindow = async (startsAtValue, endsAtValue) => {
  const startsAt = new Date(startsAtValue);
  const endsAt = new Date(endsAtValue);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new ServiceError('Session start and end must be valid timezone-aware dates', 400);
  }
  if (startsAt <= new Date()) {
    throw new ServiceError('English sessions must be scheduled in the future', 409);
  }
  await assertValidBookingWindow(startsAt, endsAt);
  return {
    startsAt,
    endsAt,
    durationMinutes: Math.round((endsAt.getTime() - startsAt.getTime()) / 60000),
  };
};

// Opaque roster fingerprint — a stale token means the roster changed under the
// operator and the save must be rejected.
const rosterToken = (unit, rows) => crypto.createHash('sha256').update(JSON.stringify({
  meetingId: unit.meeting_id,
  meetingStatus: unit.meeting_status,
  startsAt: iso(unit.starts_at),
  rows: rows.map((row) => [row.run_enrollment_id, row.attendance_id, row.recorded_status]),
})).digest('hex');

module.exports = {
  AUTHORITY,
  normalizeLabel,
  auditActor,
  iso,
  dateOnly,
  meetingWindow,
  rosterToken,
};
