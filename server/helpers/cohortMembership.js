const Schedule = require('../models/Schedule');
const Enrollment = require('../models/Enrollment');

// Enrollment statuses that count as "still a member" of a cohort.
const ACTIVE_ENROLLMENT_STATUSES = ['Active', 'On-hold', 'Completed'];

// A learner participates in a cohort if they are on any session roster
// (team-based / leader-booked flow) OR hold a non-dropped enrollment
// (cohort-based L&D flow). Mirrors how completion/attendance treat membership.
// Shared by the feedback and assessment domains.
const isCohortParticipant = async (cohortId, userId) => {
  const [onRoster, enrolled] = await Promise.all([
    Schedule.exists({ classId: cohortId, enrolledUsers: userId }),
    Enrollment.exists({
      classId: cohortId,
      userId,
      status: { $in: ACTIVE_ENROLLMENT_STATUSES },
    }),
  ]);
  return Boolean(onRoster || enrolled);
};

module.exports = { isCohortParticipant, ACTIVE_ENROLLMENT_STATUSES };
