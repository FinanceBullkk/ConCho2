const STATUS = Object.freeze({
  ELIGIBLE: 'eligible',
  NOT_ELIGIBLE: 'not_eligible',
  INCOMPLETE: 'incomplete',
  IN_PROGRESS: 'in_progress',
});

// Storage-independent English exam eligibility contract. Both archive and live
// adapters provide normalized session/mark inputs; business semantics stay here.
const computeEligibility = ({
  policy,
  cohortStatus,
  startSessionNumber = 1,
  sessions = [],
  marks = [],
}) => {
  const allowedAbsences = Number(policy?.maxAbsencesAllowed ?? 0);
  const absenceStatuses = new Set(policy?.absenceStatuses || ['A']);
  const markBySession = new Map(marks.map((mark) => [String(mark.scheduleId), mark.status]));
  const ordered = sessions.filter((session) => session.status !== 'cancelled');
  const expected = ordered.filter((session) => Number(session.sessionNumber) >= Number(startSessionNumber || 1));
  const notApplicableCount = ordered.length - expected.length;
  const statuses = expected.map((session) => markBySession.get(String(session.id)) || null);
  const markedCount = statuses.filter(Boolean).length;
  const unmarkedCount = expected.length - markedCount;
  const absenceCount = statuses.filter((status) => absenceStatuses.has(status)).length;

  let status;
  if (cohortStatus !== 'Completed') status = STATUS.IN_PROGRESS;
  else if (expected.length === 0 || unmarkedCount > 0) status = STATUS.INCOMPLETE;
  else status = absenceCount <= allowedAbsences ? STATUS.ELIGIBLE : STATUS.NOT_ELIGIBLE;

  return {
    status,
    absenceCount,
    allowedAbsences,
    markedCount,
    expectedCount: expected.length,
    unmarkedCount,
    notApplicableCount,
  };
};

module.exports = { STATUS, computeEligibility };
