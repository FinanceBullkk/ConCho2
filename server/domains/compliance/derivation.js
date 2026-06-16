// ──────────────────────────────────────────────────────────
// compliance/derivation — pure compliance logic (A3, Horizon 1)
// ──────────────────────────────────────────────────────────
// Compliance is DERIVED, never stored: match a RequiredTraining rule to the
// workforce, then evaluate each matched user against their Certificate state.
// ──────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const CADENCE_DAYS = { once: null, annual: 365, biennial: 730 };

/** Does this rule apply to this user? (role / department / office / all) */
const matchesUser = (requirement, user) => {
  const { type, value } = requirement.appliesTo || {};
  switch (type) {
    case 'all': return true;
    case 'role': return user.role === value;
    case 'department':
      return String(user.departmentId || '') === value || (user.department || '') === value;
    case 'office': return String(user.officeId || '') === value;
    default: return false;
  }
};

/**
 * The program ids a rule resolves to: a program target is itself; a path target
 * is every program step (all must be certified to satisfy the rule).
 * @param {object} requirement
 * @param {Map<string, string[]>} pathProgramsById  pathId → [programId,...]
 */
const targetProgramIds = (requirement, pathProgramsById) => {
  if (requirement.target?.kind === 'path') {
    return pathProgramsById.get(String(requirement.target.id)) || [];
  }
  return requirement.target?.id ? [String(requirement.target.id)] : [];
};

/**
 * Evaluate one user against one rule.
 * @param {object} args
 * @param {object} args.requirement
 * @param {object} args.user
 * @param {string[]} args.programIds        resolved target programs
 * @param {Map<string, number>} args.latestCertByUserProgram  `${userId}:${programId}` → issuedAt(ms)
 * @param {number} args.now
 * @returns {{ status: 'compliant'|'pending'|'overdue', dueDate: Date|null, completedAt: Date|null }}
 */
const evaluate = ({ requirement, user, programIds, latestCertByUserProgram, now }) => {
  const anchor = Math.max(+new Date(user.createdAt || 0), +new Date(requirement.createdAt || 0));
  const dueWithin = (requirement.dueWithinDays || 90) * DAY;
  const cadence = CADENCE_DAYS[requirement.recurrence] ?? null;

  // Completed only if EVERY target program is certified; completion date is the
  // latest of those certs.
  let completedAt = null;
  let allCertified = programIds.length > 0;
  for (const pid of programIds) {
    const ts = latestCertByUserProgram.get(`${user._id}:${pid}`);
    if (!ts) { allCertified = false; break; }
    completedAt = completedAt === null ? ts : Math.max(completedAt, ts);
  }

  if (allCertified) {
    if (cadence === null) return { status: 'compliant', dueDate: null, completedAt: new Date(completedAt) };
    const reopenAt = completedAt + cadence * DAY;
    if (now < reopenAt) return { status: 'compliant', dueDate: new Date(reopenAt), completedAt: new Date(completedAt) };
    // Recurrence re-opened — grace window to recertify.
    const dueDate = reopenAt + dueWithin;
    return { status: now > dueDate ? 'overdue' : 'pending', dueDate: new Date(dueDate), completedAt: new Date(completedAt) };
  }

  // Never completed → first-time due window from when the rule first applied.
  const dueDate = anchor + dueWithin;
  return { status: now > dueDate ? 'overdue' : 'pending', dueDate: new Date(dueDate), completedAt: null };
};

module.exports = { DAY, CADENCE_DAYS, matchesUser, targetProgramIds, evaluate };
