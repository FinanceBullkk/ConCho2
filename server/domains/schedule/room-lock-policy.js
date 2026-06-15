const repository = require('./repository');
const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// Room-Lock Policy (re-center Phase 3 / Wave E3 D5)
// ──────────────────────────────────────────────────────────
// Acquire / release the per-room conflict lock (RoomBooking ledger) and
// enforce DELTA A (a Session's Room must live in the Session's Office).
//
// acquireRoomLock runs INSIDE the booking transaction, AFTER Schedule.create
// (it needs the scheduleId) and AFTER assertBookable (window/collision/weekly/
// capacity). It validates the room (live + active + same Office), inserts the
// ledger row, and writes Schedule.roomId in the SAME transaction so the field
// and the ledger never drift. A duplicate {roomId,startTime} surfaces as a 409.
//
// releaseRoomLock drops a schedule's ledger row(s); it is called from EVERY
// Schedule-removal path so a freed slot becomes re-bookable. It is a plain
// deleteMany so the User/Team auto-release paths (which lazy-load models to
// dodge circular requires) can call RoomBooking.deleteMany directly too.
// ──────────────────────────────────────────────────────────

// E11000 can surface bare, nested under writeErrors (bulk under a tx), or only
// in the message — mirror the defensive detector used at scheduleService:179.
const isDuplicateKeyError = (err) =>
  err?.code === 11000 ||
  err?.writeErrors?.some((e) => e?.code === 11000) ||
  /E11000/.test(err?.message || '');

/**
 * DELTA A — a Room may be assigned to a Session only when the Session has an
 * Office AND the Room belongs to that same Office. Hard-fails 422 (never a
 * silent no-op) so a room-less-office session can't quietly claim a room.
 * @throws {ServiceError} 422 when officeId is missing or mismatched
 */
const assertSameOffice = (room, scheduleOfficeId) => {
  if (!scheduleOfficeId) {
    throw new ServiceError(
      'Cannot assign a room — this session has no Office. Pick an Office first.',
      422,
    );
  }
  if (String(room.officeId) !== String(scheduleOfficeId)) {
    throw new ServiceError(
      'This room belongs to a different Office than the session',
      422,
    );
  }
};

/**
 * Acquire the room lock for a freshly-created/updated schedule.
 * No-op (returns null) when no room is requested.
 *
 * @param {Object} args
 * @param {any}    args.roomId      requested room (falsy → no room, no-op)
 * @param {any}    args.scheduleId  the schedule claiming the room
 * @param {any}    args.classId     the schedule's class/cohort
 * @param {Date}   args.startTime   the slot start
 * @param {any}    args.officeId    the schedule's Office (DELTA A guard)
 * @param {Object} opts
 * @param {Object} opts.session     the active mongoose transaction session
 * @returns {Promise<any|null>}     the assigned roomId, or null when no room
 * @throws {ServiceError} 404 room missing · 409 room archived/inactive or slot taken · 422 office mismatch
 */
const acquireRoomLock = async ({ roomId, scheduleId, classId, startTime, officeId }, { session }) => {
  if (!roomId) return null;

  // Validate the room is live + active (soft-delete hook excludes deleted).
  const room = await repository.findRoomForLock(roomId, session);
  if (!room) throw new ServiceError('Room not found', 404);
  if (!room.isActive) throw new ServiceError('Room is not active', 409);

  // DELTA A — same-Office guard BEFORE we touch the lock ledger.
  assertSameOffice(room, officeId);

  try {
    await repository.createRoomBooking({ roomId, scheduleId, classId, startTime }, session);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ServiceError('This room is already booked for this time slot', 409);
    }
    throw err;
  }

  // Write Schedule.roomId in the SAME tx success path (never independently).
  await repository.setScheduleRoom(scheduleId, roomId, session);
  return roomId;
};

/**
 * Release the room lock(s) for one or more schedules (hard-delete the ledger
 * rows). Safe to call when a schedule had no room (deletes nothing). Called
 * from cancel / delete / auto-release / team-sync so a freed slot re-opens.
 *
 * @param {Array<any>} scheduleIds
 * @param {Object} [session] active mongoose transaction session
 */
const releaseRoomLock = (scheduleIds, session) => {
  const ids = Array.isArray(scheduleIds) ? scheduleIds : [scheduleIds];
  if (ids.length === 0) return Promise.resolve({ deletedCount: 0 });
  return repository.deleteRoomBookings(ids, session);
};

module.exports = {
  isDuplicateKeyError,
  assertSameOffice,
  acquireRoomLock,
  releaseRoomLock,
};
