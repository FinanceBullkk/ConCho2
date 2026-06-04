const LearningProgram = require('../../../models/LearningProgram');
const Class = require('../../../models/Class');
const Enrollment = require('../../../models/Enrollment');
const Schedule = require('../../../models/Schedule');
const Certificate = require('../../../models/Certificate');
const completionUseCases = require('../completion/use-cases');
const { ServiceError } = require('../../../helpers/ServiceError');

const PARTICIPATING_STATUSES = ['Active', 'On-hold', 'Completed'];

// Has the learner completed ANY cohort of `programId`?
//   Fast path: an Issued certificate for the program (durable proof).
//   Otherwise: evaluate the completion engine across the cohorts of that
//   program the learner actually participated in (enrollment or session roster).
const hasCompletedProgram = async (userId, programId) => {
  const cert = await Certificate.exists({
    userId, programId, status: 'Issued', isDeleted: false,
  });
  if (cert) return true;

  const cohortIds = await Class.find({ programId, isDeleted: { $ne: true } }).distinct('_id');
  if (!cohortIds.length) return false;

  const [enrolled, rostered] = await Promise.all([
    Enrollment.find({
      userId, classId: { $in: cohortIds }, status: { $in: PARTICIPATING_STATUSES },
    }).distinct('classId'),
    Schedule.find({ classId: { $in: cohortIds }, enrolledUsers: userId }).distinct('classId'),
  ]);

  const participated = [...new Set([...enrolled, ...rostered].map(String))];
  for (const cohortId of participated) {
    // eslint-disable-next-line no-await-in-loop -- learners have few cohorts/program; enroll is a rare op
    const completion = await completionUseCases.evaluateCompletion(cohortId, userId);
    if (completion.complete) return true;
  }
  return false;
};

// Throw 422 if the cohort's program declares prerequisite programs the learner
// has not completed. No-op when the cohort has no program or no prerequisites.
// Direct prerequisites only (one level).
const assertPrerequisitesMet = async (cohort, userId) => {
  if (!cohort?.programId) return;
  const program = await LearningProgram.findById(cohort.programId)
    .select('prerequisitePrograms')
    .lean();
  const prereqIds = program?.prerequisitePrograms || [];
  if (!prereqIds.length) return;

  const unmet = [];
  for (const prereqId of prereqIds) {
    // eslint-disable-next-line no-await-in-loop -- prerequisite lists are short
    const met = await hasCompletedProgram(userId, prereqId);
    if (!met) unmet.push(prereqId);
  }
  if (!unmet.length) return;

  const names = await LearningProgram.find({ _id: { $in: unmet } }).select('name').lean();
  const labels = names.map((p) => p.name).join(', ');
  throw new ServiceError(`Prerequisite not met: complete ${labels} first`, 422);
};

module.exports = { assertPrerequisitesMet, hasCompletedProgram };
