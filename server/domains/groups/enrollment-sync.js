const repository = require('./enrollment-sync-repository');
const writes = require('../learning/enrollment/writes');
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
  // Accept either the Unit of Work tx handle ({session}|{client}) or a raw Mongo
  // session — the legacy enrollment-transfer caller still passes { session }.
  const tx = opts.tx || (opts.session ? { session: opts.session } : {});
  const now = new Date();
  const pendingEmails = [];
  const pendingEvents = [];

  // Resolve target team once (email context). Read in-tx so it sees team writes
  // made earlier in the same transaction.
  const targetTeam = await repository.findTeamForEnrollmentContext(teamId, tx);

  // ── Handle ADDED members ────────────────────────────────
  for (const userId of addedIds) {
    // The learner's Active enrollment in ANOTHER team → transfer it here.
    const source = await repository.findActiveEnrollmentInOtherTeam(userId, teamId, tx);

    if (source) {
      const fromTeamName = source.teamId?.name || 'previous team';
      const carriedNote = source.note;

      // Close the old enrollment → Transferred, then drop the learner from the
      // old team's roster — both inside the caller's transaction.
      await repository.transferEnrollment(source._id, { toTeamId: teamId, leftAt: now }, tx);
      if (source.teamId?._id) {
        await repository.pullTeamMember(source.teamId._id, userId, tx);
      }

      logger.info({ userId, fromTeamId: source.teamId?._id, toTeamId: teamId }, 'Enrollment transferred');

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

    // Avoid a duplicate Active enrollment in THIS team.
    const alreadyActive = await repository.findActiveEnrollmentInTeam(userId, teamId, tx);

    if (!alreadyActive) {
      // ONE write spine for both modes (converge Phase 2): create via the
      // learning/enrollment spine so team-create and cohort-create never drift.
      // Pass the whole UoW handle (#255) so the insert joins the caller's
      // transaction on EITHER backend (Mongo session ⇄ PG client).
      const enrollment = await writes.createActiveEnrollment(
        { userId, teamId, classId: classId || null, joinedAt: now },
        { tx },
      );
      // Queue the cohort_enrolled announcement for post-commit (a rolled-back tx
      // must never emit). Only when the team has a cohort — the bell + automation
      // are cohort-scoped; program-less teams emit nothing (unchanged).
      if (targetTeam?.classId) {
        pendingEvents.push({ enrollment, cohort: targetTeam.classId });
      }
      logger.info({ userId, teamId }, 'Enrollment created (Active)');
    }
  }

  // ── Handle REMOVED members ──────────────────────────────
  for (const userId of removedIds) {
    const active = await repository.findActiveEnrollmentInTeam(userId, teamId, tx);

    if (active) {
      await repository.dropEnrollment(active._id, { leftAt: now }, tx);
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

  return { pendingEmails, pendingEvents };
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

/**
 * Flush the queued ENROLLMENT_CREATED announcements after the team transaction
 * commits — mirrors flushPendingEmails but for the domain event (drives the
 * cohort_enrolled bell + automation). Awaited; the subscriber's bell write is
 * itself fail-soft, so a notification hiccup never fails the team mutation.
 */
const flushPendingEnrollmentEvents = async (pendingEvents) => {
  if (!Array.isArray(pendingEvents)) return;
  for (const { enrollment, cohort } of pendingEvents) {
    await writes.announceEnrollmentCreated(enrollment, cohort, { actorIsSelf: false });
  }
};

module.exports = { syncEnrollments, flushPendingEmails, flushPendingEnrollmentEvents };
