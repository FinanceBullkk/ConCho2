const Feedback = require('../../../models/Feedback');
const Class = require('../../../models/Class');
const Schedule = require('../../../models/Schedule');
const Enrollment = require('../../../models/Enrollment');

const findCohort = (cohortId) =>
  Class.findById(cohortId).select('_id classCode courseName programId isDeleted').lean();

// A learner "participates" in a cohort if they are on any session roster
// (team-based / leader-booked flow) OR hold a non-dropped enrollment
// (cohort-based L&D flow). Mirrors how completion/attendance treat membership.
const isCohortParticipant = async (cohortId, userId) => {
  const [onRoster, enrolled] = await Promise.all([
    Schedule.exists({ classId: cohortId, enrolledUsers: userId }),
    Enrollment.exists({
      classId: cohortId,
      userId,
      status: { $in: ['Active', 'On-hold', 'Completed'] },
    }),
  ]);
  return Boolean(onRoster || enrolled);
};

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
