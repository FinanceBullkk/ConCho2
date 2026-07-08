const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const Schedule = require('../../models/Schedule');
const Team = require('../../models/Team');
const Enrollment = require('../../models/Enrollment');
const Certificate = require('../../models/Certificate');

// learning/repository — MONGO impl (programs + cohorts). Returns hydrated docs
// (the use-cases shape via the DTO). Split into mongo/pg behind a DB_BACKEND
// selector in the Phase-3 Wave-B port — behaviour-preserving.

// Certificates issued for a program, grouped by issue month (since `since`).
// A certificate = a completed program run, so this is the real completion trend.
const monthlyCompletions = (programId, since) =>
  Certificate.aggregate([
    { $match: { programId, isDeleted: { $ne: true }, issuedAt: { $gte: since } } },
    { $group: { _id: { y: { $year: '$issuedAt' }, m: { $month: '$issuedAt' } }, count: { $sum: 1 } } },
  ]);

const findPrograms = (filter = {}) =>
  LearningProgram.find(filter).sort({ category: 1, name: 1 });

const findProgramById = (id) => LearningProgram.findById(id);

const findProgramByName = (name) =>
  LearningProgram.findOne({ name }).collation({ locale: 'en', strength: 2 });

const findProgramByLegacyCourseName = (legacyCourseName) =>
  LearningProgram.findOne({ legacyCourseName }).collation({ locale: 'en', strength: 2 });

const createProgram = (payload) => LearningProgram.create(payload);

const updateProgramById = (id, payload) =>
  LearningProgram.findByIdAndUpdate(id, payload, { new: true, runValidators: true });

const findCohorts = (filter = {}) =>
  Class.find(filter)
    .populate('programId')
    .sort({ classCode: 1, courseName: 1 });

const findCohortById = (id) =>
  Class.findById(id).populate('programId');

const createCohort = (payload) => Class.create(payload);

const updateCohortById = (id, update) =>
  Class.findByIdAndUpdate(id, update, { new: true, runValidators: true });

// Cohort edit/delete guards + cascade (mirrors legacy classController delete).
const findOngoingCohortConflict = (classCode, excludeId) =>
  Class.findOne({ _id: { $ne: excludeId }, classCode, status: 'Ongoing' });

const countTeamsByCohort = (cohortId) => Team.countDocuments({ classId: cohortId });
const countSchedulesByCohort = (cohortId) => Schedule.countDocuments({ classId: cohortId });

// Soft-archive (recoverable): close active enrollments (status→Dropped, like
// Team delete) and mark the cohort deleted. Evaluations are PRESERVED (golden
// rule: never hard-delete evaluation data).
// `tx` is the Unit-of-Work handle ({ session } on Mongo); undefined = no txn.
const closeEnrollmentsByCohort = (cohortId, leftAt, tx) =>
  Enrollment.updateMany(
    { classId: cohortId, status: 'Active' },
    { $set: { status: 'Dropped', leftAt } },
    { session: tx?.session },
  );
const softDeleteCohort = (cohortId, deletedAt, tx) =>
  Class.findOneAndUpdate(
    { _id: cohortId },
    { $set: { isDeleted: true, deletedAt } },
    { new: true, session: tx?.session },
  );
// Restore needs an explicit isDeleted filter so the soft-delete pre-hook does
// not auto-exclude the very doc we want back.
const restoreCohortById = (cohortId) =>
  Class.findOneAndUpdate(
    { _id: cohortId, isDeleted: true },
    { $set: { isDeleted: false, deletedAt: null } },
    { new: true },
  );
const findDeletedCohorts = () =>
  Class.find({ isDeleted: true }).populate('programId').sort({ deletedAt: -1 });

const countSessionsByCohortIds = async (cohortIds) => {
  if (!cohortIds.length) return {};
  const rows = await Schedule.aggregate([
    // bookedSessions counts LIVE sessions — cancelled rows freed their slot.
    { $match: { classId: { $in: cohortIds }, status: 'scheduled' } },
    { $group: { _id: '$classId', bookedSessions: { $sum: 1 } } },
  ]);
  const out = {};
  rows.forEach((row) => { out[row._id.toString()] = row.bookedSessions; });
  return out;
};

module.exports = {
  findPrograms,
  findProgramById,
  findProgramByName,
  findProgramByLegacyCourseName,
  createProgram,
  updateProgramById,
  findCohorts,
  findCohortById,
  createCohort,
  updateCohortById,
  findOngoingCohortConflict,
  countTeamsByCohort,
  countSchedulesByCohort,
  closeEnrollmentsByCohort,
  softDeleteCohort,
  restoreCohortById,
  findDeletedCohorts,
  countSessionsByCohortIds,
  monthlyCompletions,
};
