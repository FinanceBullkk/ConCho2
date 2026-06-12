const { hasCompletedProgram } = require('../enrollment/prerequisites');
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
  const inProgressSet = await repository.findParticipatingUserIdsForProgram(userIds, programId);

  const rows = [];
  for (const user of users) {
    const key = user._id.toString();
    // eslint-disable-next-line no-await-in-loop -- bounded by one assignment target set
    const complete = await hasCompletedProgram(user._id, programId);
    rows.push({
      learner: compactUser(user),
      status: statusFromSignals({
        complete,
        inProgress: inProgressSet.has(key),
        dueDate: assignment.dueDate,
        now,
      }),
      complete,
      dueDate: assignment.dueDate,
    });
  }
  return rows;
};

const resolvePathStatuses = async ({ assignment, users, path, now }) => {
  const programs = (path?.programs || []).map((id) => id._id || id);
  const inProgressSets = await Promise.all(
    programs.map((programId) =>
      repository.findParticipatingUserIdsForProgram(users.map((user) => user._id), programId),
    ),
  );

  const rows = [];
  for (const user of users) {
    const completed = [];
    for (const programId of programs) {
      // eslint-disable-next-line no-await-in-loop -- paths are short ordered curricula
      completed.push(await hasCompletedProgram(user._id, programId));
    }
    const complete = programs.length > 0 && completed.every(Boolean);
    const key = user._id.toString();
    const inProgress = completed.some(Boolean) || inProgressSets.some((set) => set.has(key));
    rows.push({
      learner: compactUser(user),
      status: statusFromSignals({
        complete,
        inProgress,
        dueDate: assignment.dueDate,
        now,
      }),
      complete,
      dueDate: assignment.dueDate,
    });
  }
  return rows;
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
