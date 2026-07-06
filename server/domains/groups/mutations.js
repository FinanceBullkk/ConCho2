const { runInTransaction } = require('../_shared/unit-of-work');
const repository = require('./repository');
const teamWrite = require('./team-write-repository');
const { syncSchedulesForTeamUpdate } = repository;
const { notifyPromotions } = require('../schedule/waitlist/promotion');
const { handleError } = require('../../helpers/handleError');
const auditService = require('../../services/auditService');
const { invalidateAnalyticsCache } = require('../../middleware/analyticsCache');
const logger = require('../../lib/logger');
const { syncEnrollments, flushPendingEmails, flushPendingEnrollmentEvents } = require('./enrollment-sync');

// ──────────────────────────────────────────────────────────
// Team Controller — create/update handlers (Admin only)
// ──────────────────────────────────────────────────────────
// Relocated from controllers/team/* into domains/groups (Phase 1 domain extraction).
// Both wrap Team write + Schedule sync + Enrollment sync in ONE MongoDB
// transaction so Team and Schedule/Enrollment never drift (no fire-and-forget);
// notification emails are queued and flushed AFTER commit.

// Helper to check if any user is already in another team
const checkMemberConflicts = async (memberIds, excludeTeamId = null) => {
  if (!memberIds || memberIds.length === 0) return null;

  const conflictingTeams = await repository.findTeamsByMembers(memberIds, excludeTeamId);

  if (conflictingTeams.length > 0) {
    const details = [];
    conflictingTeams.forEach(t => {
      const overlap = t.members.filter(m => memberIds.includes(m._id.toString()));
      if (overlap.length > 0) {
        const names = overlap.map(m => `${m.name} (${m.empCode})`).join(', ');
        details.push(`${names} already in group "${t.name}"`);
      }
    });
    return details.join('; ');
  }
  return null;
};

/**
 * POST /api/teams
 */
const createTeam = async (req, res) => {
  try {
    const { name, classId, leaderId, members, forceSwap } = req.body;

    // Guard: check if classId is already assigned to another team
    if (classId) {
      const conflict = await repository.findTeamByClass(classId);
      if (conflict) {
        const code = conflict.classId?.classCode || classId;
        if (forceSwap) {
          await teamWrite.unassignTeamClass(conflict._id);
          logger.info({ classCode: code, fromTeam: conflict.name }, 'Force-swap: class unassigned');
        } else {
          return res.status(409).json({
            success: false,
            message: `Class "${code}" is already assigned to team "${conflict.name}".`,
            conflictTeamId: conflict._id,
            conflictTeamName: conflict.name,
          });
        }
      }
    }

    // Ensure leader is included in members
    let memberList = members || [];
    if (leaderId && !memberList.includes(leaderId)) {
      memberList = [leaderId, ...memberList];
    }

    // Guard: check if any members are already in another team
    const memberConflictStr = await checkMemberConflicts(memberList);
    if (memberConflictStr) {
      return res.status(409).json({
        success: false,
        message: `Cannot create group: ${memberConflictStr}. Please remove them from their current group first.`,
      });
    }

    // ── TRANSACTION: Team creation + Enrollment sync (SYNC-01) ──
    // BUG #7 fix: syncEnrollments now runs in-session and returns pending
    // email notifications to flush after commit.
    let team;
    let pendingEmails = [];
    let pendingEvents = [];
    await runInTransaction(async (tx) => {
      team = await teamWrite.insertTeam(
        { name, classId: classId || null, leaderId, members: memberList },
        tx,
      );

      // Hand the WHOLE unit-of-work handle through opts.tx — repo impls read
      // tx.session (Mongo) OR tx.client (PG). The old `{ session: tx.session }`
      // dropped the PG client, so in-transaction reads missed the just-inserted
      // team → no bell/email events on the postgres backend.
      const result = await syncEnrollments(
        team._id.toString(), memberList, [], classId || null,
        { tx },
      );
      pendingEmails = result.pendingEmails;
      pendingEvents = result.pendingEvents;
    });
    flushPendingEmails(pendingEmails);
    await flushPendingEnrollmentEvents(pendingEvents);

    // Return populated (read-only, outside transaction)
    const populated = await repository.findTeamByIdPopulated(team._id);

    auditService.record({
      req,
      action: 'created',
      entity: 'Team',
      entityId: team._id,
      diff: { after: { name: team.name, classId: team.classId, leaderId: team.leaderId, memberCount: memberList.length } },
    });

    invalidateAnalyticsCache();
    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * PUT /api/teams/:id
 *
 * TRANSACTIONAL: Team update + Schedule sync + Enrollment sync
 * are wrapped in a single MongoDB transaction. If the process
 * crashes mid-way, the entire operation rolls back — no stale
 * Schedule.enrolledUsers left behind.
 */
const updateTeam = async (req, res) => {
  try {
    const { name, classId, leaderId, members, forceSwap } = req.body;

    // ── Pre-validation (read-only, outside transaction) ─────
    const currentTeam = await repository.findTeamByIdLean(req.params.id);
    if (!currentTeam) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const updateData = {};

    if (name !== undefined) updateData.name = name;

    // classId handling: null = unassign, string = assign
    if (classId !== undefined) {
      if (classId === null || classId === '') {
        updateData.classId = null;
      } else {
        // Guard: check if classId is already assigned to ANOTHER team
        const conflict = await repository.findTeamByClassExcluding(classId, req.params.id);
        if (conflict) {
          const code = conflict.classId?.classCode || classId;
          if (forceSwap) {
            await teamWrite.unassignTeamClass(conflict._id);
            logger.info({ classCode: code, fromTeam: conflict.name }, 'Force-swap: class unassigned');
          } else {
            return res.status(409).json({
              success: false,
              message: `Class "${code}" is already assigned to team "${conflict.name}".`,
              conflictTeamId: conflict._id,
              conflictTeamName: conflict.name,
            });
          }
        }
        updateData.classId = classId;
      }
    }

    if (leaderId !== undefined) updateData.leaderId = leaderId;
    if (members !== undefined) {
      // Ensure leader is in members if both provided
      const effectiveLeader = leaderId || currentTeam.leaderId?.toString();
      if (effectiveLeader && !members.includes(effectiveLeader)) {
        updateData.members = [effectiveLeader, ...members];
      } else {
        updateData.members = members;
      }

      // Guard: check if any members are already in another team
      const memberConflictStr = await checkMemberConflicts(updateData.members, currentTeam._id);
      if (memberConflictStr) {
        return res.status(409).json({
          success: false,
          message: `Cannot update: ${memberConflictStr}. Please remove them from their current group first.`,
        });
      }
    }

    // ── Compute member diff BEFORE transaction ──────────────
    const oldMemberStrs = currentTeam.members.map(id => id.toString());
    const newMemberStrs = updateData.members
      ? updateData.members.map(id => id.toString())
      : oldMemberStrs;
    const membersChanged = members !== undefined
      && (oldMemberStrs.length !== newMemberStrs.length
          || oldMemberStrs.some(id => !newMemberStrs.includes(id)));

    // ── TRANSACTION: Team update + Schedule sync + Enrollment sync (atomic) ──
    // BUG #7 fix: previously syncEnrollments ran without the session,
    // committing enrollment writes outside the outer transaction. If the
    // outer transaction rolled back (e.g. a later step failed), the team
    // would revert but enrollments would be left in the new state.
    // Emails are now queued and flushed AFTER the commit so a rollback
    // doesn't generate misleading notifications.
    let pendingEmails = [];
    let pendingEvents = [];
    let teamSyncPromotions = [];
    await runInTransaction(async (tx) => {
      // Step 1: Update Team document
      await teamWrite.updateTeamDoc(req.params.id, updateData, tx);

      // Step 2: Sync Schedule.enrolledUsers (if members changed).
      // A member REMOVAL frees seats — the sync promotes FIFO waiters
      // in-tx (phase-04 slice B) and returns them for post-commit notify.
      if (membersChanged) {
        ({ promotions: teamSyncPromotions } = await syncSchedulesForTeamUpdate({
          teamId: req.params.id,
          oldMembers: oldMemberStrs,
          newMembers: newMemberStrs,
          session: tx.session,
        }));
      }

      // Step 3: Sync Enrollment records (if members changed)
      if (membersChanged) {
        const addedIds = newMemberStrs.filter(id => !oldMemberStrs.includes(id));
        const removedIds = oldMemberStrs.filter(id => !newMemberStrs.includes(id));

        const effectiveClassId = updateData.classId !== undefined
          ? updateData.classId
          : currentTeam.classId?.toString() || null;

        if (addedIds.length > 0 || removedIds.length > 0) {
          // Whole UoW handle through opts.tx — see the createTeam note.
          const { pendingEmails: emails, pendingEvents: events } = await syncEnrollments(
            req.params.id, addedIds, removedIds, effectiveClassId,
            { tx },
          );
          pendingEmails = emails;
          pendingEvents = events;
        }
      }
    });

    // Flush queued notification emails now that the transaction has committed.
    flushPendingEmails(pendingEmails);
    await flushPendingEnrollmentEvents(pendingEvents);

    // Notify waiters promoted by the member-removal seat-free (fail-soft).
    for (const { scheduleId, promoted } of teamSyncPromotions) {
      // eslint-disable-next-line no-await-in-loop
      await notifyPromotions(scheduleId, promoted);
    }

    // Return populated (outside transaction — read-only)
    const populated = await repository.findTeamByIdPopulated(req.params.id);

    auditService.record({
      req,
      action: 'updated',
      entity: 'Team',
      entityId: req.params.id,
      diff: auditService.diff(
        { name: currentTeam.name, classId: currentTeam.classId, leaderId: currentTeam.leaderId, members: oldMemberStrs },
        { name: populated.name, classId: populated.classId?._id, leaderId: populated.leaderId?._id, members: newMemberStrs }
      ),
    });

    invalidateAnalyticsCache();
    res.json({ success: true, data: populated });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { checkMemberConflicts, createTeam, updateTeam };
