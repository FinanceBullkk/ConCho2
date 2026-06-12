const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const Schedule = require('../../models/Schedule');
const Team = require('../../models/Team');
const Enrollment = require('../../models/Enrollment');

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

// English-class separation: program ids of the COHORT scheduling world
// (self_enroll | nomination). Team world = every other program + program-less
// classes. Keep the mode list in sync with
// domains/schedule/scheduling-mode-policy.COHORT_SCHEDULING_MODES.
const findCohortModeProgramIds = async () => {
  const programs = await LearningProgram.find(
    { schedulingMode: { $in: ['self_enroll', 'nomination'] } },
  ).select('_id').lean();
  return programs.map((p) => p._id);
};

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
const closeEnrollmentsByCohort = (cohortId, leftAt, session) =>
  Enrollment.updateMany(
    { classId: cohortId, status: 'Active' },
    { $set: { status: 'Dropped', leftAt } },
    { session },
  );
const softDeleteCohort = (cohortId, deletedAt, session) =>
  Class.findOneAndUpdate(
    { _id: cohortId },
    { $set: { isDeleted: true, deletedAt } },
    { new: true, session },
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
  findCohortModeProgramIds,
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
};
