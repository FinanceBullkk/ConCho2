const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// facilitator-assignment-policy
// ──────────────────────────────────────────────────────────
// Enforces LearningProgram.facilitatorPolicy.assignmentRequired (audit round 8
// closed deferral): a program that REQUIRES a facilitator cannot have its
// sessions "run" (attendance marked) until one is assigned. Trainer assignment
// is a post-create step (domains/schedule setTrainers), so the meaningful
// enforcement point is the moment the session is recorded — attendance marking —
// not session creation.
//
// No-op for: program-less classes, and programs where assignmentRequired is
// false (the default). So existing data is unaffected unless an Admin opted in.

// A session "has a facilitator" when ANY assignment channel is populated:
//   - a per-session internal trainer (Schedule.sessionInstructorIds), OR
//   - an external trainer subdoc (Schedule.externalTrainer), OR
//   - a cohort-bound teacher (Class.teacherIds) — the standing facilitator.
const sessionHasFacilitator = (schedule, classDoc) => {
  const hasInternal = Array.isArray(schedule?.sessionInstructorIds)
    && schedule.sessionInstructorIds.length > 0;
  const hasExternal = Boolean(schedule?.externalTrainer && schedule.externalTrainer.name);
  const hasCohortTeacher = Array.isArray(classDoc?.teacherIds)
    && classDoc.teacherIds.length > 0;
  return hasInternal || hasExternal || hasCohortTeacher;
};

// Throw 422 when the session's program requires a facilitator but none is
// assigned. `schedule` is a Schedule doc/lean object with classId,
// sessionInstructorIds and externalTrainer available.
const assertFacilitatorAssigned = async (schedule) => {
  if (!schedule?.classId) return;
  const classDoc = await Class.findById(schedule.classId)
    .select('programId teacherIds')
    .lean();
  if (!classDoc?.programId) return; // program-less class — nothing to enforce

  const program = await LearningProgram.findById(classDoc.programId)
    .select('facilitatorPolicy')
    .lean();
  if (!program?.facilitatorPolicy?.assignmentRequired) return; // opt-in only

  if (sessionHasFacilitator(schedule, classDoc)) return;

  throw new ServiceError(
    'This program requires a facilitator — assign a trainer to this session before marking attendance.',
    422,
  );
};

module.exports = { sessionHasFacilitator, assertFacilitatorAssigned };
