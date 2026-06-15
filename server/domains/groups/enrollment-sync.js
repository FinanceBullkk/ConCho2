const repository = require('./repository');
const logger = require('../../lib/logger');
const {
  sendEnrollmentDropped,
  sendEnrollmentTransferred,
} = require('../../lib/emailTemplates');

// ──────────────────────────────────────────────────────────
// Groups (Team) — enrollment sync helpers
// ──────────────────────────────────────────────────────────
// Relocated from controllers/team/* into domains/groups (Phase 1 domain extraction).
// Shared by group create/update AND exported (via the groups controller facade)
// for cross-controller use by the enrollment transfer flow.

/**
 * Handle enrollment records when members change.
 * Called by both createTeam and updateTeam.
 *
 * BUG #7 fix: now accepts an optional MongoDB `session` parameter and
 * threads it through every DB op. Callers that wrap the call inside
 * `session.withTransaction(...)` should pass the session so the
 * enrollment writes commit (or roll back) together with the outer
 * team/schedule writes.
 *
 * Email side-effects are returned as a list of "pending notification"
 * thunks rather than fired in-flight, so the caller can flush them
 * AFTER the transaction commits. This prevents misleading emails when
 * the outer transaction rolls back.
 *
 * @param {string} teamId — the team being modified
 * @param {string[]} addedIds — user IDs being added
 * @param {string[]} removedIds — user IDs being removed
 * @param {string|null} classId — the team's current classId
 * @param {Object}  [opts]
 * @param {mongoose.ClientSession} [opts.session]
 * @returns {Promise<{ pendingEmails: Array<() => void> }>}
 */
const syncEnrollments = async (teamId, addedIds, removedIds, classId, opts = {}) => {
  const { session = null } = opts;
  const now = new Date();
  const pendingEmails = [];

  // Resolve target team once (used for email context). Read in-session so
  // it sees any team writes made earlier in the same transaction.
  const targetTeam = await repository.findTeamForEnrollmentContext(teamId, session);

  // ── Handle ADDED members ────────────────────────────────
  for (const userId of addedIds) {
    // Check if user has an Active enrollment in ANOTHER team
    const existingEnrollment = await repository.findActiveEnrollmentInOtherTeam(userId, teamId, session);

    if (existingEnrollment) {
      const fromTeamName = existingEnrollment.teamId?.name || 'previous team';

      // Close old enrollment → Transferred
      existingEnrollment.status = 'Transferred';
      existingEnrollment.leftAt = now;
      existingEnrollment.transferredTo = teamId;
      const carriedNote = existingEnrollment.note;
      await repository.saveEnrollment(existingEnrollment, session);

      // Auto-remove from old team's members array
      await repository.pullTeamMember(existingEnrollment.teamId, userId, session);

      logger.info({ userId, fromTeamId: existingEnrollment.teamId, toTeamId: teamId }, 'Enrollment transferred');

      // Queue email send for post-commit flush.
      pendingEmails.push(async () => {
        const u = await repository.findUserContact(userId);
        if (u && u.email) {
          sendEnrollmentTransferred({
            to: u.email,
            userName: u.name,
            fromTeamName,
            toTeamName: targetTeam?.name || 'new team',
            toCourseName: targetTeam?.classId?.courseName || '',
            note: carriedNote || '',
          });
        }
      });
    }

    // Check if user already has an Active enrollment in THIS team (avoid duplicates)
    const alreadyActive = await repository.findActiveEnrollmentInTeam(userId, teamId, session);

    if (!alreadyActive) {
      await repository.createEnrollment(
        { userId, teamId, classId: classId || null, joinedAt: now, status: 'Active' },
        session,
      );
      logger.info({ userId, teamId }, 'Enrollment created (Active)');
    }
  }

  // ── Handle REMOVED members ──────────────────────────────
  for (const userId of removedIds) {
    const activeEnrollment = await repository.findActiveEnrollmentInTeam(userId, teamId, session);

    if (activeEnrollment) {
      activeEnrollment.status = 'Dropped';
      activeEnrollment.leftAt = now;
      await repository.saveEnrollment(activeEnrollment, session);
      logger.info({ userId, teamId }, 'Enrollment marked Dropped');

      // Queue email for post-commit flush.
      pendingEmails.push(async () => {
        const u = await repository.findUserContact(userId);
        if (u && u.email) {
          sendEnrollmentDropped({
            to: u.email,
            userName: u.name,
            teamName: targetTeam?.name || 'team',
            courseName: targetTeam?.classId?.courseName || '',
          });
        }
      });
    }
  }

  return { pendingEmails };
};

/**
 * Helper to fire-and-forget all queued email senders after a transaction
 * commits. Each thunk is async; any rejection is swallowed and logged so
 * the parent flow never fails on email delivery.
 */
const flushPendingEmails = (pendingEmails) => {
  if (!Array.isArray(pendingEmails)) return;
  for (const send of pendingEmails) {
    Promise.resolve()
      .then(() => send())
      .catch((err) => logger.warn({ err }, 'Pending email flush failed'));
  }
};

module.exports = { syncEnrollments, flushPendingEmails };
