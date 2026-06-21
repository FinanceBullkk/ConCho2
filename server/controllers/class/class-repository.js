const mongoose = require('mongoose');
const Class = require('../../models/Class');
const Team = require('../../models/Team');
const Schedule = require('../../models/Schedule');
const Enrollment = require('../../models/Enrollment');

// ──────────────────────────────────────────────────────────
// Class Controller — data-access repository (PG-migration Phase 0, item 0.8)
// ──────────────────────────────────────────────────────────
// All Mongoose calls for the legacy class read/mutation handlers live here so
// the eventual Mongo→Postgres port swaps repository internals, not controller
// logic. The controllers keep validation, audit, policy + the response envelope.
// `Setting` is resolved via mongoose.model() (registered at boot) to avoid a
// require cycle.

/** The COURSE_SESSIONS setting value map ({ courseName: sessions }) or {}. */
const courseSessionsMap = async () => {
  const Setting = mongoose.model('Setting');
  const setting = await Setting.findOne({ key: 'COURSE_SESSIONS' });
  return setting ? setting.value : {};
};

// ── Mutations ──────────────────────────────────────────────

/** The Ongoing class for a classCode (optionally excluding one id, for update). */
const findOngoingByClassCode = (classCode, excludeId = null) => {
  const filter = { classCode, status: 'Ongoing' };
  if (excludeId) filter._id = { $ne: excludeId };
  return Class.findOne(filter);
};

const createClassDoc = (data) => Class.create(data);

/** Hydrated doc (NOT lean) — the update handler needs `.toObject()` for the diff. */
const findClassDocById = (id) => Class.findById(id);

const updateClassById = (id, body) =>
  Class.findByIdAndUpdate(id, body, { new: true, runValidators: true });

// ── Reads ──────────────────────────────────────────────────

const findClasses = (filter, { page, limit }) =>
  Class.find(filter)
    .sort({ classCode: 1, courseName: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

/** Per-class LIVE booked-session counts (cancelled rows freed their slot). */
const aggregateBookedSessionCounts = (classIds) =>
  Schedule.aggregate([
    { $match: { classId: { $in: classIds }, status: 'scheduled' } },
    { $group: { _id: '$classId', bookedSessions: { $sum: 1 } } },
  ]);

const findClassLeanById = (id) => Class.findById(id).lean();

const findTeamIdsForClass = (classId) =>
  Team.find({ classId, isDeleted: { $ne: true } }).distinct('_id');

const enrollmentExists = (userId, teamIds) =>
  Enrollment.exists({ userId, teamId: { $in: teamIds } });

const countBookedSessions = (classId) =>
  Schedule.countDocuments({ classId, status: 'scheduled' });

module.exports = {
  courseSessionsMap,
  findOngoingByClassCode,
  createClassDoc,
  findClassDocById,
  updateClassById,
  findClasses,
  aggregateBookedSessionCounts,
  findClassLeanById,
  findTeamIdsForClass,
  enrollmentExists,
  countBookedSessions,
};
