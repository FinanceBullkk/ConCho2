const { ServiceError } = require('../../helpers/ServiceError');
const { findTeacherVisibleClassIds } = require('../../helpers/teacher-class-scope');
const { isTeacherOfClass } = require('../../policy/classBinding');

const assertTeacherCanAccessCohort = (actor, cohort, verb = 'manage') => {
  if (actor?.role !== 'Teacher') return;
  const decision = isTeacherOfClass(actor, cohort);
  if (!decision.allowed) {
    throw new ServiceError(`You are not permitted to ${verb} assessments for this cohort`, 403);
  }
};

const visibleCohortIdsForTeacher = async (actor) => {
  if (actor?.role !== 'Teacher') return null;
  return findTeacherVisibleClassIds(actor._id);
};

module.exports = {
  assertTeacherCanAccessCohort,
  visibleCohortIdsForTeacher,
};
