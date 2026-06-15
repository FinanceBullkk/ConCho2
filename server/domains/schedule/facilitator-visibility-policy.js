const repository = require('./repository');

// ──────────────────────────────────────────────────────────
// facilitator-visibility-policy
// ──────────────────────────────────────────────────────────
// Enforces LearningProgram.facilitatorPolicy.visibility === 'assigned_only':
// for such a program, a Teacher reaches its sessions (list / detail / attendance)
// ONLY when named on that session (Schedule.sessionInstructorIds) — the standing
// cohort-teacher binding (Class.teacherIds) does NOT grant access. Admins are
// unaffected; the default `all_facilitators` keeps the existing cohort-binding
// UNION, so program-less classes and untouched programs behave exactly as before.

// Is the cohort's program assigned_only? (single cohort)
const isCohortAssignedOnly = async (cohortId) => {
  if (!cohortId) return false;
  const cls = await repository.findClassProgramId(cohortId);
  if (!cls?.programId) return false;
  const program = await repository.findProgramVisibility(cls.programId);
  return program?.facilitatorPolicy?.visibility === 'assigned_only';
};

// Of the given cohortIds, the subset whose program is assigned_only (Set of
// string ids). One Class query + one Program query — used by the session list.
const assignedOnlyCohortIdSet = async (cohortIds) => {
  if (!cohortIds || !cohortIds.length) return new Set();
  const classes = await repository.findClassesProgramIds(cohortIds);
  const withProgram = classes.filter((c) => c.programId);
  if (!withProgram.length) return new Set();

  const programIds = [...new Set(withProgram.map((c) => String(c.programId)))];
  const assignedOnlyPrograms = await repository.findAssignedOnlyPrograms(programIds);
  const assignedOnlyProgramIds = new Set(assignedOnlyPrograms.map((p) => String(p._id)));

  const set = new Set();
  for (const c of withProgram) {
    if (assignedOnlyProgramIds.has(String(c.programId))) set.add(String(c._id));
  }
  return set;
};

module.exports = { isCohortAssignedOnly, assignedOnlyCohortIdSet };
