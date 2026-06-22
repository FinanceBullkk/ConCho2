const PushSubscription = require('../../models/PushSubscription');
const Schedule = require('../../models/Schedule');

// ──────────────────────────────────────────────────────────
// mobile/repository — Mongoose access for B5 (mobile learning surface, H2).
// Push-subscription storage + the learner's upcoming enrolled sessions (the
// "upcoming" half of the mobile feed; assignments come via the assignment
// domain's listMine in the use-case layer).
// ──────────────────────────────────────────────────────────

// Upsert on the globally-unique endpoint so re-subscribing the same device is
// idempotent (and re-homes the device to the current user if they switched).
const upsertSubscription = ({ userId, endpoint, keys, userAgent }) =>
  PushSubscription.findOneAndUpdate(
    { endpoint },
    { $set: { userId, endpoint, keys, userAgent: userAgent || '' } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

const removeSubscription = (userId, endpoint) =>
  PushSubscription.deleteOne({ userId, endpoint });

// The learner's next LIVE enrolled sessions (the "upcoming" feed half).
const upcomingSessionsForUser = (userId, from, limit = 10) =>
  Schedule.find({ enrolledUsers: userId, status: 'scheduled', startTime: { $gte: from } })
    .select('topic startTime endTime classId roomLink meetLink')
    .populate('classId', 'classCode courseName')
    .sort({ startTime: 1 })
    .limit(limit)
    .lean();

module.exports = {
  upsertSubscription,
  removeSubscription,
  upcomingSessionsForUser,
};
