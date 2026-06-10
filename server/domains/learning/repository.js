const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const Schedule = require('../../models/Schedule');
const Team = require('../../models/Team');
const Enrollment = require('../../models/Enrollment');
const Evaluation = require('../../models/Evaluation');

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

const deleteEvaluationsByCohort = (cohortId, session) =>
  Evaluation.deleteMany({ classId: cohortId }, { session });
const deleteEnrollmentsByCohort = (cohortId, session) =>
  Enrollment.deleteMany({ classId: cohortId }, { session });
const deleteCohortById = (cohortId, session) =>
  Class.findByIdAndDelete(cohortId, { session });

const countSessionsByCohortIds = async (cohortIds) => {
  if (!cohortIds.length) return {};
  const rows = await Schedule.aggregate([
    { $match: { classId: { $in: cohortIds } } },
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
  deleteEvaluationsByCohort,
  deleteEnrollmentsByCohort,
  deleteCohortById,
  countSessionsByCohortIds,
};
