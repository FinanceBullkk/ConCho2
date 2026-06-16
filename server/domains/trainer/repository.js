const TrainerProfile = require('../../models/TrainerProfile');
const User = require('../../models/User');
const Schedule = require('../../models/Schedule');

// ──────────────────────────────────────────────────────────
// trainer/repository — Mongoose access for A6 (trainer-management depth, H2).
// Profiles live in TrainerProfile; load + free-at checks read Schedule
// (sessionInstructorIds). Candidate trainers come from User (Teacher/Admin).
// ──────────────────────────────────────────────────────────

// ── TrainerProfile CRUD ──────────────────────────────────────────────────────
const upsertProfile = (userId, data) =>
  TrainerProfile.findOneAndUpdate(
    { userId },
    { $set: data, $setOnInsert: { userId } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).lean();

const findProfileByUserId = (userId) => TrainerProfile.findOne({ userId }).lean();

const listProfiles = (filter = {}) =>
  TrainerProfile.find(filter).sort({ status: 1, updatedAt: -1 }).limit(500).lean();

const softDeleteProfile = (userId) =>
  TrainerProfile.findOneAndUpdate(
    { userId },
    { $set: { isDeleted: true, deletedAt: new Date(), status: 'archived' } },
    { new: true },
  ).lean();

const pushRating = (userId, rating) =>
  TrainerProfile.findOneAndUpdate({ userId }, { $push: { ratings: rating } }, { new: true }).lean();

// ── User lookups (display + candidate pickers) ───────────────────────────────
const findUsersByIds = (ids) =>
  ids.length ? User.find({ _id: { $in: ids } }).select('empCode name department role status').lean() : [];

// Active Teacher/Admin users — the pool a TrainerProfile can be created for.
// Mirrors schedule.findValidInstructorIds (status ≠ 'Dropped', not deleted).
const findTrainerCandidates = () =>
  User.find({ role: { $in: ['Teacher', 'Admin'] }, status: { $ne: 'Dropped' }, isDeleted: { $ne: true } })
    .select('empCode name department role')
    .sort({ name: 1 })
    .lean();

// ── Schedule reads (load + availability) ─────────────────────────────────────
// A trainer's LIVE sessions in a window (load view + hours).
const sessionsForTrainer = (userId, { from, to } = {}) => {
  const query = { sessionInstructorIds: userId, status: 'scheduled' };
  if (from || to) {
    query.startTime = {};
    if (from) query.startTime.$gte = from;
    if (to) query.startTime.$lte = to;
  }
  return Schedule.find(query)
    .select('classId topic startTime endTime officeId roomId')
    .sort({ startTime: 1 })
    .limit(500)
    .lean();
};

// The subset of the given instructor ids that are BUSY (have a live session
// overlapping [start,end]) — drives the "free at" picker filter.
const busyInstructorIds = async (instructorIds, start, end) => {
  if (!instructorIds.length) return new Set();
  const rows = await Schedule.find({
    sessionInstructorIds: { $in: instructorIds },
    startTime: { $lt: end },
    endTime: { $gt: start },
    status: 'scheduled',
  }).select('sessionInstructorIds').lean();
  const wanted = new Set(instructorIds.map(String));
  const busy = new Set();
  for (const r of rows) {
    for (const id of r.sessionInstructorIds || []) {
      const s = String(id);
      if (wanted.has(s)) busy.add(s);
    }
  }
  return busy;
};

module.exports = {
  upsertProfile,
  findProfileByUserId,
  listProfiles,
  softDeleteProfile,
  pushRating,
  findUsersByIds,
  findTrainerCandidates,
  sessionsForTrainer,
  busyInstructorIds,
};
