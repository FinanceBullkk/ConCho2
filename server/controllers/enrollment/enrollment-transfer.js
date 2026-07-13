const { syncSchedulesForTeamUpdate } = require('../../domains/schedule/roster-sync');
const { notifyPromotions } = require('../../domains/schedule/waitlist/promotion');
const { syncEnrollments, flushPendingEmails, flushPendingEnrollmentEvents } = require('../../domains/groups/controller');
const enrollmentSyncRepo = require('../../domains/groups/enrollment-sync-repository');
// Dual-backend pre-validation reads (K1b slice 3): the transfer's source
// enrollment + both team docs load through the DB_BACKEND-selected repos.
const enrollmentRepo = require('../../domains/learning/enrollment/repository');
const groupsRepo = require('../../domains/groups/repository');
const teamWrite = require('../../domains/groups/team-write-repository');
const { runInTransaction } = require('../../domains/_shared/unit-of-work');
const { handleError } = require('../../helpers/handleError');
const { invalidateAnalyticsCache } = require('../../middleware/analyticsCache');
const logger = require('../../lib/logger');
const auditService = require('../../services/auditService');

// ──────────────────────────────────────────────────────────
// Enrollment Controller — transfer handlers
// ──────────────────────────────────────────────────────────
// Split from the legacy enrollmentController (Phase 1 modular-monolith).
// Atomic single transfer + sequential bulk transfer (reuses single). Single
// transfer runs the whole move (membership swap, schedule sync both teams,
// enrollment close+create) inside ONE Mongo transaction so any failure rolls
// back completely — no dual-membership half-state (BUG #1 fix).

/**
 * POST /api/enrollments/:id/transfer
 * Atomically transfer a participant from one team to another.
 *
 * Body: { toTeamId: string, note?: string }
 *
 * Algorithm (inside a MongoDB transaction):
 *   1. Source enrollment → status='Transferred', transferredTo=toTeamId, leftAt=now
 *   2. Source team.members → $pull user
 *   3. Target team.members → $addToSet user
 *   4. Schedule.enrolledUsers → synced for BOTH teams (future sessions)
 *   5. New Enrollment created in target team (status='Active', classId from target team)
 *
 * Validations:
 *   - Source enrollment must exist and be Active
 *   - Target team must exist and not equal source team
 *   - User must not already be in target team's members
 */
const transferEnrollment = async (req, res) => {
  try {
    const { toTeamId, note } = req.body;
    if (!toTeamId) {
      return res.status(400).json({ success: false, message: 'toTeamId is required' });
    }

    // ── Pre-validation (read-only) ──────────────────────────
    const enrollment = await enrollmentRepo.findEnrollmentByIdLean(req.params.id);
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }
    if (enrollment.status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: `Cannot transfer enrollment with status "${enrollment.status}". Only Active enrollments can be transferred.`,
      });
    }

    const fromTeamId = enrollment.teamId.toString();
    if (fromTeamId === toTeamId.toString()) {
      return res.status(400).json({ success: false, message: 'Source and target teams are the same' });
    }

    const [fromTeam, toTeam] = await Promise.all([
      groupsRepo.findTeamByIdLean(fromTeamId),
      groupsRepo.findTeamByIdLean(toTeamId),
    ]);
    if (!toTeam) {
      return res.status(404).json({ success: false, message: 'Target team not found' });
    }
    if (!fromTeam) {
      return res.status(404).json({ success: false, message: 'Source team not found' });
    }

    const userIdStr = enrollment.userId.toString();
    const alreadyInTarget = (toTeam.members || []).some(m => m.toString() === userIdStr);
    if (alreadyInTarget) {
      return res.status(409).json({
        success: false,
        message: `User is already a member of "${toTeam.name}".`,
      });
    }

    // Snapshot member arrays before the transaction — syncEnrollments will
    // mutate fromTeam.members inside the session, so we need stable old/new
    // values for syncSchedulesForTeamUpdate on the source side.
    const toOld = (toTeam.members || []).map((id) => id.toString());
    const toNew = [...toOld, userIdStr];
    const fromOldMembers = (fromTeam.members || []).map((id) => id.toString());
    const fromNewMembers = fromOldMembers.filter((id) => id !== userIdStr);
    const classId = toTeam.classId ? toTeam.classId.toString() : null;
    // Source cohort — used post-commit to decide whether this transfer lands the
    // learner in a DIFFERENT cohort (a genuine new enrollment worth a bell) vs a
    // same-cohort team rebalance (email-only, no redundant bell).
    const fromClassId = fromTeam.classId ? fromTeam.classId.toString() : null;

    // ── SINGLE ATOMIC TRANSACTION ────────────────────────────
    // All four steps run inside ONE unit-of-work so any failure rolls back
    // completely — no dual-membership half-state (BUG #1 fix). #255: the raw
    // mongoose session became the dual-backend UoW (Mongo session.withTransaction
    // ⇄ PG BEGIN/COMMIT on one client) and every write receives the whole `tx`
    // handle, so the transfer is atomic on EITHER backend — previously the PG
    // lane's writes escaped to the pool as separate autocommit statements.
    let pendingEmails = [];
    let pendingEvents = [];
    let sourcePromotions = [];
    await runInTransaction(async (tx) => {
        // Step 1: Add user to target team. Dual-backend via updateTeamDoc (the
        // members-array ⇔ team_members-junction bridge) so the add lands in the
        // active backend — a Mongoose $addToSet mirrors the teams row but not the
        // PG junction. toNew = toOld + user (snapshotted pre-tx), so a full
        // members replace is equivalent to the old $addToSet here.
        await teamWrite.updateTeamDoc(toTeamId, { members: toNew }, tx);

        // Step 2: Sync target team's future schedules (member added)
        await syncSchedulesForTeamUpdate({
          teamId: toTeamId, oldMembers: toOld, newMembers: toNew, tx,
        });

        // Step 3: Close source enrollment, remove user from source team,
        // create new Active enrollment in target team.
        // syncEnrollments accepts the UoW handle — fully transactional.
        ({ pendingEmails, pendingEvents } = await syncEnrollments(
          toTeamId,
          [userIdStr],
          [],
          classId,
          { tx },
        ));

        // Step 4: Sync source team's future schedules (member removed) — the
        // freed seats promote FIFO waiters in-tx (phase-04 slice B); notify
        // happens post-commit below.
        if (fromOldMembers.length !== fromNewMembers.length) {
          ({ promotions: sourcePromotions } = await syncSchedulesForTeamUpdate({
            teamId: fromTeamId,
            oldMembers: fromOldMembers,
            newMembers: fromNewMembers,
            tx,
          }));
        }
    });

    // Post-commit: flush queued emails and attach optional transfer note.
    flushPendingEmails(pendingEmails);

    // Converge Phase 2 (2026-06-18): fire the unified ENROLLMENT_CREATED event
    // (cohort_enrolled bell + enrollment automation) for the new target-team
    // enrollment — but ONLY when the learner lands in a DIFFERENT cohort than the
    // one they left. A same-cohort team rebalance keeps the legacy transfer email
    // only, so the learner is never double-notified (owner decision 2026-06-18).
    if (classId && classId !== fromClassId) {
      await flushPendingEnrollmentEvents(pendingEvents);
    }

    // Notify waiters promoted on the source team's freed seats (fail-soft).
    for (const { scheduleId, promoted } of sourcePromotions) {
      // eslint-disable-next-line no-await-in-loop
      await notifyPromotions(scheduleId, promoted);
    }

    if (note) {
      // Dual-backend: on the PG lane the new enrollment lives in Postgres, so a
      // Mongoose findOneAndUpdate would no-op — route through the active backend.
      await enrollmentSyncRepo.setActiveTeamEnrollmentNote(enrollment.userId, toTeamId, note);
    }

    logger.info({ enrollmentId: req.params.id, fromTeamId, toTeamId, userId: userIdStr }, 'Enrollment transferred');

    auditService.record({
      req,
      action: 'transferred',
      entity: 'Enrollment',
      entityId: req.params.id,
      diff: { teamId: { from: fromTeamId, to: toTeamId.toString() } },
    });

    invalidateAnalyticsCache();

    // Return the new Active enrollment (in target team) — active-backend read so
    // the PG lane reads the enrollment it actually wrote (a Mongoose re-fetch
    // would return null on Postgres).
    const newEnrollment = await enrollmentSyncRepo.findActiveTeamEnrollmentPopulated(
      enrollment.userId, toTeamId,
    );

    res.json({ success: true, data: newEnrollment });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * POST /api/enrollments/bulk-transfer
 * Sequentially transfers N enrollments to the same target team.
 * Body: { enrollmentIds: [string], toTeamId: string, note?: string }
 * Returns: { success: true, results: [{enrollmentId, status, message?}] }
 *
 * Uses the existing single-transfer logic per id (correct + auditable).
 * Performance: O(N); acceptable for typical bulk size (1–20 students).
 */
const bulkTransferEnrollment = async (req, res) => {
  try {
    const { enrollmentIds, toTeamId, note } = req.body;
    if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'enrollmentIds must be a non-empty array' });
    }
    if (!toTeamId) {
      return res.status(400).json({ success: false, message: 'toTeamId is required' });
    }

    const results = [];
    let ok = 0, failed = 0;
    for (const id of enrollmentIds) {
      // Reuse the single-transfer controller by shimming a minimal req/res.
      // It already handles validation, transactions, audit and cache invalidation.
      let captured = null;
      const shimRes = {
        status(code) { this._code = code; return this; },
        json(payload) { captured = { code: this._code || 200, payload }; },
      };
      const shimReq = {
        ...req,
        params: { id },
        body: { toTeamId, note },
        // Q3: Express getters (req.ip) and prototype methods (req.get) do not
        // survive a plain object spread — re-bind them explicitly so that
        // auditService.record() logs the real IP and user-agent instead of null.
        ip: req.ip,
        get: req.get.bind(req),
      };
      try {
        await transferEnrollment(shimReq, shimRes);
        if (captured?.payload?.success) {
          results.push({ enrollmentId: id, status: 'ok' });
          ok += 1;
        } else {
          results.push({
            enrollmentId: id, status: 'error',
            message: captured?.payload?.message || 'Unknown error',
          });
          failed += 1;
        }
      } catch (err) {
        results.push({ enrollmentId: id, status: 'error', message: err.message });
        failed += 1;
      }
    }

    logger.info({ enrollmentIds, toTeamId, ok, failed }, 'Bulk transfer complete');
    invalidateAnalyticsCache();

    res.json({ success: true, results, ok, failed });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { transferEnrollment, bulkTransferEnrollment };
