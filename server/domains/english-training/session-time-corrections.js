const crypto = require('crypto');
const DEFAULT_TIME_SLOTS = require('../../config/default-time-slots');
const { ServiceError } = require('../../helpers/ServiceError');
const repo = require('./repository.pg');
const {
  allocateArchiveSessionTimes,
  validateArchiveSessionAllocation,
} = require('./session-time-allocation');

const allocationHash = (assignments) => crypto
  .createHash('sha256')
  .update(JSON.stringify(assignments.map((row) => ({
    naturalKey: row.naturalKey,
    assignedStartAt: row.assignedStartAt,
    slotLabel: row.slotLabel,
  }))))
  .digest('hex');

function buildPlan(sessions, slots = DEFAULT_TIME_SLOTS) {
  const plan = allocateArchiveSessionTimes(sessions, { slots });
  const invariantErrors = validateArchiveSessionAllocation(plan.assignments, slots);
  if (invariantErrors.length) {
    throw new ServiceError(`English Archive allocation is unsafe: ${invariantErrors.join(', ')}`, 409);
  }
  return {
    ...plan,
    summary: {
      ...plan.summary,
      allocationHash: allocationHash(plan.assignments),
    },
    movedSessions: plan.assignments
      .filter((row) => row.movedDate)
      .map((row) => ({
        classCode: row.classCode,
        courseRunKey: row.courseRunKey,
        sessionNumber: row.sessionNumber,
        originalDate: row.originalDate,
        assignedDate: row.assignedDate,
        slotLabel: row.slotLabel,
      })),
  };
}

async function previewArchiveSessionTimeAllocation({ slots = DEFAULT_TIME_SLOTS } = {}) {
  const sessions = await repo.listSessionsForTimeAllocation();
  if (!sessions.length) throw new ServiceError('No imported English sessions found', 404);
  return buildPlan(sessions, slots);
}

async function applyArchiveSessionTimeAllocation({
  reason,
  actor,
  slots = DEFAULT_TIME_SLOTS,
} = {}) {
  if (!reason || String(reason).trim().length < 10) {
    throw new ServiceError('A correction reason of at least 10 characters is required', 400);
  }
  const correctedBy = actor?.empCode || actor?._id;
  if (!correctedBy) throw new ServiceError('An authenticated correction actor is required', 401);

  return repo.withTransaction(async (client) => {
    await repo.assertArchiveWritable(client);
    const sessions = await repo.listSessionsForTimeAllocation(client, { lock: true });
    if (!sessions.length) throw new ServiceError('No imported English sessions found', 404);
    const plan = buildPlan(sessions, slots);
    const batchId = repo.newId();
    const persisted = await repo.saveSessionTimeAllocation({
      batchId,
      assignments: plan.assignments,
      summary: plan.summary,
      reason: String(reason).trim(),
      correctedBy: String(correctedBy),
    }, client);
    const verification = await repo.verifySessionTimeAllocation(plan.assignments, client);
    if (
      persisted.updatedSessions !== plan.summary.total
      || verification.total !== plan.summary.total
      || verification.mismatches !== 0
      || verification.overlaps !== 0
      || verification.classDateDuplicates !== 0
    ) {
      throw new ServiceError(`English Archive correction verification failed: ${JSON.stringify({ persisted, verification })}`, 409);
    }
    return {
      batchId,
      summary: plan.summary,
      movedSessions: plan.movedSessions,
      persisted,
      verification,
    };
  });
}

module.exports = {
  buildPlan,
  previewArchiveSessionTimeAllocation,
  applyArchiveSessionTimeAllocation,
};
