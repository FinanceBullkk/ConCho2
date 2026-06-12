const { ServiceError } = require('../../../helpers/ServiceError');
const { assignmentDto } = require('./dto');
const repository = require('./repository');
const { resolveAssignmentStatuses, resolveStatusForUser } = require('./status-resolver');

const dedupe = (ids = []) => {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(id);
    }
  }
  return out;
};

const assertTarget = async (payload) => {
  if (payload.targetType === 'path') {
    if (!payload.pathId) throw new ServiceError('pathId is required for path assignments', 422);
    if (!(await repository.findPath(payload.pathId))) {
      throw new ServiceError('Learning path not found', 422);
    }
    return;
  }
  if (!payload.programId) throw new ServiceError('programId is required for program assignments', 422);
  if (!(await repository.findProgram(payload.programId))) {
    throw new ServiceError('Learning program not found', 422);
  }
};

const assertTargetsExist = async ({ userIds, departmentIds }) => {
  if (!userIds.length && !departmentIds.length) {
    throw new ServiceError('At least one user or department target is required', 422);
  }
  const [users, departments] = await Promise.all([
    userIds.length ? repository.countUsers(userIds) : 0,
    departmentIds.length ? repository.countDepartments(departmentIds) : 0,
  ]);
  if (users !== userIds.length) {
    throw new ServiceError('One or more users were not found', 422);
  }
  if (departments !== departmentIds.length) {
    throw new ServiceError('One or more departments were not found', 422);
  }
};

const withStatuses = async (assignment) => {
  const statuses = await resolveAssignmentStatuses(assignment);
  return assignmentDto(assignment, statuses);
};

const listAssignments = async (query) => {
  const rows = await repository.list(query);
  return Promise.all(rows.map(withStatuses));
};

const getAssignment = async (id) => {
  const assignment = await repository.findById(id);
  if (!assignment) throw new ServiceError('Assignment not found', 404);
  return withStatuses(assignment);
};

const createAssignment = async (payload, actor) => {
  const userIds = dedupe(payload.userIds || []);
  const departmentIds = dedupe(payload.departmentIds || []);
  await assertTarget(payload);
  await assertTargetsExist({ userIds, departmentIds });

  const created = await repository.create({
    title: payload.title,
    description: payload.description || '',
    targetType: payload.targetType,
    programId: payload.targetType === 'program' ? payload.programId : null,
    pathId: payload.targetType === 'path' ? payload.pathId : null,
    dueDate: payload.dueDate,
    userIds,
    departmentIds,
    createdBy: actor?._id || null,
  });
  return withStatuses(created);
};

const archiveAssignment = async (id) => {
  const before = await repository.findById(id);
  if (!before) throw new ServiceError('Assignment not found', 404);
  const archived = await repository.archive(id);
  return { before: assignmentDto(before), assignment: assignmentDto(archived) };
};

// ── Learner self view (Cohesion P3) ───────────────────────
// "My required training": active assignments targeting the actor (direct or
// department), each with the actor's own derived status and — when the next
// program is self_enroll with an Ongoing cohort — an enroll-CTA suggestion.
// Capacity + prerequisites stay enforced by the enrollment chokepoint.
const listMine = async (actor, now = new Date()) => {
  const assignments = await repository.findActiveAssignmentsForUser(actor._id, actor.departmentId);
  const rows = [];
  for (const assignment of assignments) {
    // eslint-disable-next-line no-await-in-loop -- a learner has few assignments
    const { status, currentProgramId } = await resolveStatusForUser(assignment, actor._id, now);
    let enrollableCohort = null;
    if (status !== 'complete' && currentProgramId) {
      // eslint-disable-next-line no-await-in-loop
      enrollableCohort = await repository.findOpenSelfEnrollCohort(currentProgramId);
    }
    rows.push({
      id: assignment._id,
      title: assignment.title,
      targetType: assignment.targetType,
      programName: assignment.programId?.name || null,
      pathTitle: assignment.pathId?.title || null,
      dueDate: assignment.dueDate,
      status,
      enrollableCohortId: enrollableCohort?._id || null,
      enrollableCohortCode: enrollableCohort?.classCode || null,
    });
  }
  return rows;
};

module.exports = {
  listAssignments,
  getAssignment,
  createAssignment,
  archiveAssignment,
  listMine,
};
