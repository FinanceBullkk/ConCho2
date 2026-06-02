// Shape a cohort enrollment into L&D (learner / cohort) vocabulary.
const enrollmentDto = (enrollment) => {
  if (!enrollment) return null;
  const learner = enrollment.userId;
  const cohort = enrollment.classId;
  return {
    id: enrollment._id,
    learner: learner && learner._id
      ? {
        id: learner._id,
        empCode: learner.empCode,
        name: learner.name,
        department: learner.department,
        status: learner.status,
      }
      : learner,
    cohortId: cohort && cohort._id ? cohort._id : cohort,
    cohortCode: cohort && cohort.classCode ? cohort.classCode : undefined,
    status: enrollment.status,
    joinedAt: enrollment.joinedAt,
    leftAt: enrollment.leftAt,
  };
};

module.exports = { enrollmentDto };
