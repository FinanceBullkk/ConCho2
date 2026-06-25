// ──────────────────────────────────────────────────────────
// booking-write-repository — MONGO impl
// ──────────────────────────────────────────────────────────
// The atomic-write seam of the booking chokepoint, threaded through a Unit of
// Work transaction handle (`tx.session`). Kept deliberately small: it proves the
// dual-backend transaction pattern on the hardest case (the double-booking
// guard) without porting the whole scheduleService.bookSlot path yet.
//
// The {classId,startTime} partial-unique index (status:'scheduled') is the final
// double-booking guard: a competing insert of the same live slot fails with
// Mongo E11000 (`err.code === 11000`), which the booking use-case maps to a 409.
// The PG impl re-throws PG's 23505 as the same `{ code: 11000 }` so the use-case
// stays backend-agnostic (the established dual-backend convention).
// ──────────────────────────────────────────────────────────
const Schedule = require('../../models/Schedule');

// Insert a LIVE (scheduled) session inside the caller's transaction.
const insertScheduledSession = async (
  { classId, bookedTeamId = null, startTime, endTime, enrolledUsers = [] },
  tx = {},
) => {
  const [doc] = await Schedule.create(
    [{ classId, bookedTeamId, startTime, endTime, status: 'scheduled', enrolledUsers }],
    tx.session ? { session: tx.session } : {},
  );
  return { _id: doc._id, classId: doc.classId, startTime: doc.startTime, status: doc.status };
};

// Count LIVE sessions for a class — used to observe commit/rollback outcomes.
const countScheduledForClass = (classId, tx = {}) => {
  let q = Schedule.countDocuments({ classId, status: 'scheduled' });
  if (tx.session) q = q.session(tx.session);
  return q;
};

// Durable cancel: flip the live row to 'cancelled' so the partial-unique index
// drops it and the slot becomes re-bookable (history preserved, never deleted).
const cancelSession = async (id, tx = {}) => {
  const doc = await Schedule.findOneAndUpdate(
    { _id: id, status: 'scheduled' },
    { $set: { status: 'cancelled', cancelledAt: new Date() } },
    { new: true, ...(tx.session && { session: tx.session }) },
  );
  return doc ? { _id: doc._id, status: doc.status } : null;
};

module.exports = { insertScheduledSession, countScheduledForClass, cancelSession };
