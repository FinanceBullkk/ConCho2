const Feedback = require('../../../models/Feedback');
const Class = require('../../../models/Class');
const { isCohortParticipant } = require('../../../helpers/cohortMembership');

// learning/feedback/repository — MONGO impl. (Was repository.js; split into
// mongo/pg behind a DB_BACKEND selector in the Phase-3 Wave-B port —
// behaviour-preserving. isCohortParticipant is a pure helper, re-exported as-is.)

const findCohort = (cohortId) =>
  Class.findById(cohortId).select('_id classCode courseName programId isDeleted').lean();

const findFeedback = (cohortId, userId) =>
  Feedback.findOne({ cohortId, userId, isDeleted: false }).lean();

// Idempotent submit: one feedback per learner per cohort, re-submit updates.
const upsertFeedback = (data) =>
  Feedback.findOneAndUpdate(
    { cohortId: data.cohortId, userId: data.userId },
    {
      $set: {
        programId: data.programId,
        rating: data.rating,
        contentRating: data.contentRating,
        instructorRating: data.instructorRating,
        comment: data.comment,
        submittedBy: data.submittedBy,
        isDeleted: false,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  ).lean();

const listFeedback = ({ cohortId, learnerId }) => {
  const filter = { isDeleted: false };
  if (cohortId) filter.cohortId = cohortId;
  if (learnerId) filter.userId = learnerId;
  return Feedback.find(filter)
    .populate('userId', 'empCode name department')
    .populate('cohortId', 'classCode courseName')
    .sort({ updatedAt: -1 })
    .lean();
};

module.exports = {
  findCohort,
  isCohortParticipant,
  findFeedback,
  upsertFeedback,
  listFeedback,
};
