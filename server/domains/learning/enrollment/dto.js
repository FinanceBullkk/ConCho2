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

// Shape ANY enrollment — team-based OR cohort-based — into one learner-facing
// shape for the unified self read (converge Phase 2). `mode` tells the two
// apart: 'group' = enrolled via a team/group (the group is named); 'direct' =
// enrolled straight into the cohort (no group). Both carry the same cohort
// fields so the consumer renders one card regardless of how the learner joined.
const myEnrollmentDto = (enrollment) => {
  if (!enrollment) return null;
  const cohort = enrollment.classId;
  const group = enrollment.teamId;
  const isGroup = Boolean(group);
  return {
    id: enrollment._id,
    cohortId: cohort && cohort._id ? cohort._id : cohort,
    cohortCode: cohort && cohort.classCode ? cohort.classCode : undefined,
    cohortName: cohort && cohort.courseName ? cohort.courseName : undefined,
    programId: cohort && cohort.programId ? cohort.programId : undefined,
    mode: isGroup ? 'group' : 'direct',
    group: isGroup && group._id ? { id: group._id, name: group.name } : null,
    status: enrollment.status,
    joinedAt: enrollment.joinedAt,
    leftAt: enrollment.leftAt,
  };
};

module.exports = { enrollmentDto, myEnrollmentDto };
