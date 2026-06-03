const repository = require('./repository');
const { ServiceError } = require('../../../helpers/ServiceError');

const sameId = (a, b) => a && b && a.toString() === b.toString();

// Submit (or re-submit) a learner's cohort feedback. A Participant may only
// submit for themselves; an Admin may submit on a learner's behalf. The learner
// must actually be a participant of the cohort. Returns { feedback, created }.
const submitFeedback = async (body, actor) => {
  const isParticipant = actor.role === 'Participant';
  if (isParticipant && body.userId && !sameId(body.userId, actor._id)) {
    throw new ServiceError('Not authorized to submit feedback for another learner', 403);
  }
  const targetUserId = isParticipant
    ? actor._id.toString()
    : (body.userId || actor._id.toString());

  const cohort = await repository.findCohort(body.cohortId);
  if (!cohort || cohort.isDeleted) {
    throw new ServiceError('Cohort not found', 404);
  }

  const participates = await repository.isCohortParticipant(body.cohortId, targetUserId);
  if (!participates) {
    throw new ServiceError('Learner is not a participant of this cohort', 403);
  }

  const existing = await repository.findFeedback(body.cohortId, targetUserId);
  const feedback = await repository.upsertFeedback({
    cohortId: body.cohortId,
    userId: targetUserId,
    programId: cohort.programId || null,
    rating: body.rating,
    contentRating: body.contentRating ?? null,
    instructorRating: body.instructorRating ?? null,
    comment: body.comment || '',
    submittedBy: actor._id,
  });

  return { feedback, created: !existing, before: existing };
};

// List feedback. Admin/Teacher see all (optionally filtered); a Participant is
// scoped to their own submissions regardless of the requested learnerId.
const listFeedback = ({ cohortId, learnerId }, actor) => {
  const scopedLearner = actor.role === 'Participant' ? actor._id.toString() : learnerId;
  return repository.listFeedback({ cohortId, learnerId: scopedLearner });
};

module.exports = { submitFeedback, listFeedback };
