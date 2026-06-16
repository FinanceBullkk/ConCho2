const { hasCompletedProgram, completedProgramUserIds } = require('../enrollment/prerequisites');
const repository = require('./repository');
const { compactUser } = require('./dto');

const isPastDue = (dueDate, now) => {
  if (!dueDate) return false;
  const cutoff = new Date(dueDate);
  cutoff.setUTCHours(23, 59, 59, 999);
  return cutoff < now;
};

const statusFromSignals = ({ complete, inProgress, dueDate, now }) => {
  if (complete) return 'complete';
  if (isPastDue(dueDate, now)) return 'overdue';
  if (inProgress) return 'in_progress';
  return 'not_started';
};

const resolveProgramStatuses = async ({ assignment, users, programId, now }) => {
  const userIds = users.map((user) => user._id);
  // Batched: completion + in-progress for ALL learners in a constant query
  // count, instead of a per-user hasCompletedProgram fan-out (audit P1). Same
  // signals → identical statuses.
  const [inProgressSet, completeSet] = await Promise.all([
    repository.findParticipatingUserIdsForProgram(userIds, programId),
    completedProgramUserIds(userIds, programId),
  ]);

  return users.map((user) => {
    const key = user._id.toString();
    const complete = completeSet.has(key);
    return {
      learner: compactUser(user),
      status: statusFromSignals({
        complete,
        inProgress: inProgressSet.has(key),
        dueDate: assignment.dueDate,
        now,
      }),
      complete,
      dueDate: assignment.dueDate,
    };
  });
};

const resolvePathStatuses = async ({ assignment, users, path, now }) => {
  const programs = (path?.programs || []).map((id) => id._id || id);
  const userIds = users.map((user) => user._id);
  // Batched per program (paths are short ordered curricula): completion +
  // in-progress sets for all learners, instead of a per-user × per-program
  // hasCompletedProgram fan-out (audit P1). Same signals → identical statuses.
  const [inProgressSets, completeSets] = await Promise.all([
    Promise.all(programs.map((programId) => repository.findParticipatingUserIdsForProgram(userIds, programId))),
    Promise.all(programs.map((programId) => completedProgramUserIds(userIds, programId))),
  ]);

  return users.map((user) => {
    const key = user._id.toString();
    const completed = completeSets.map((set) => set.has(key));
    const complete = programs.length > 0 && completed.every(Boolean);
    const inProgress = completed.some(Boolean) || inProgressSets.some((set) => set.has(key));
    return {
      learner: compactUser(user),
      status: statusFromSignals({
        complete,
        inProgress,
        dueDate: assignment.dueDate,
        now,
      }),
      complete,
      dueDate: assignment.dueDate,
    };
  });
};

// Single-user variant (Cohesion P3 — learner self view). Same signals as the
// per-assignment resolver above, but scoped to ONE user so a department-wide
// assignment doesn't fan out to every member. Also returns the program the
// learner should act on next (`currentProgramId`: the assignment's program,
// or the first incomplete step of a path) for enroll-CTA resolution.
const resolveStatusForUser = async (assignment, userId, now = new Date()) => {
  const key = userId.toString();
  if (assignment.targetType === 'path') {
    const programs = (assignment.pathId?.programs || []).map((id) => id._id || id);
    const completed = [];
    for (const programId of programs) {
      // eslint-disable-next-line no-await-in-loop -- paths are short ordered curricula
      completed.push(await hasCompletedProgram(userId, programId));
    }
    const complete = programs.length > 0 && completed.every(Boolean);
    const inProgressSets = await Promise.all(
      programs.map((programId) => repository.findParticipatingUserIdsForProgram([userId], programId)),
    );
    const inProgress = completed.some(Boolean) || inProgressSets.some((set) => set.has(key));
    const currentIndex = completed.findIndex((done) => !done);
    return {
      status: statusFromSignals({ complete, inProgress, dueDate: assignment.dueDate, now }),
      currentProgramId: currentIndex === -1 ? null : programs[currentIndex],
    };
  }
  const programId = assignment.programId?._id || assignment.programId;
  const complete = await hasCompletedProgram(userId, programId);
  const inProgressSet = await repository.findParticipatingUserIdsForProgram([userId], programId);
  return {
    status: statusFromSignals({ complete, inProgress: inProgressSet.has(key), dueDate: assignment.dueDate, now }),
    currentProgramId: complete ? null : programId,
  };
};

const resolveAssignmentStatuses = async (assignment, now = new Date()) => {
  const users = await repository.findAssignableUsers({
    userIds: assignment.userIds || [],
    departmentIds: assignment.departmentIds || [],
  });
  if (assignment.targetType === 'path') {
    return resolvePathStatuses({ assignment, users, path: assignment.pathId, now });
  }
  return resolveProgramStatuses({
    assignment,
    users,
    programId: assignment.programId?._id || assignment.programId,
    now,
  });
};

module.exports = { resolveAssignmentStatuses, resolveStatusForUser, statusFromSignals, isPastDue };
