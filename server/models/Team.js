const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Team Model
// ──────────────────────────────────────────────────────────
// Team Leader = a Participant referenced as leaderId.
//
// SCHEDULE SYNC:
//   syncSchedulesForTeamUpdate() — explicit, session-aware function
//   called by the controller INSIDE a MongoDB transaction.
//   When the members array changes, all future Schedules are synced:
//   - Removed members are $pulled from enrolledUsers
//   - New members are $pushed
//   If the process crashes, the entire transaction rolls back.

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name (PIC) is required'],
      trim: true,
      // NOT unique — same PIC can manage multiple courses
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      default: null,               // null = unassigned
    },
    leaderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Team leader is required'],
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // ── Soft-delete fields (UX-03) ──────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Soft-delete auto-filter (UX-03) ─────────────────────
const SOFT_DELETE_HOOKS = ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'findOneAndDelete'];
for (const hook of SOFT_DELETE_HOOKS) {
  teamSchema.pre(hook, function () {
    const filter = this.getFilter();
    if (filter.isDeleted === undefined) {
      this.where({ isDeleted: { $ne: true } });
    }
  });
}

// ── Indexes ───────────────────────────────────────────────
teamSchema.index({ leaderId: 1 });
teamSchema.index({ classId: 1 }, { unique: true, partialFilterExpression: { classId: { $type: 'objectId' } } }); // 1:1 Team ↔ Class (nulls allowed)

// ──────────────────────────────────────────────────────────
// SCHEDULE SYNC — Explicit, Session-Aware
// ──────────────────────────────────────────────────────────
// Previously this was implicit Mongoose middleware (fire-and-forget).
// Moved here as an explicit function so the controller can call it
// INSIDE the same MongoDB transaction that updates the Team document.
//
// If the process crashes mid-way, the entire transaction rolls back
// and both Team.members + Schedule.enrolledUsers stay consistent.
// ──────────────────────────────────────────────────────────

/**
 * Sync future Schedule.enrolledUsers after a Team member change.
 *
 * @param {Object} params
 * @param {ObjectId|string} params.teamId
 * @param {string[]} params.oldMembers  — previous member ID strings
 * @param {string[]} params.newMembers  — new member ID strings
 * @param {import('mongoose').ClientSession} params.session — MongoDB session (for transaction)
 */
const syncSchedulesForTeamUpdate = async ({ teamId, oldMembers, newMembers, session }) => {
  const removedSet = new Set(oldMembers.filter((id) => !newMembers.includes(id)));
  const addedSet = new Set(newMembers.filter((id) => !oldMembers.includes(id)));

  // Nothing changed — skip
  if (removedSet.size === 0 && addedSet.size === 0) return;

  console.log(`🔄 Team Sync for team ${teamId}`);
  console.log(`   Removed: ${removedSet.size}, Added: ${addedSet.size}`);

  // Lazy-load to avoid circular dependency
  const Schedule = mongoose.model('Schedule');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // 1 DB query: fetch all future schedules for this team
  const futureSchedules = await Schedule.find({
    startTime: { $gte: today },
    bookedTeamId: teamId,
  }).session(session).lean();

  if (futureSchedules.length === 0) {
    console.log('   ℹ️  No future schedules found for this team');
    return;
  }

  console.log(`   📋 Processing ${futureSchedules.length} future schedule(s)...`);

  // ── Build all operations in-memory (0 DB calls) ────────
  const bulkOps = [];
  const emptyScheduleIds = []; // Schedules that will have 0 enrolled users

  for (const schedule of futureSchedules) {
    const enrolledSet = new Set(schedule.enrolledUsers.map((id) => id.toString()));

    // Compute who to remove and who to add for THIS schedule
    const toRemove = [...removedSet].filter((id) => enrolledSet.has(id));
    const toAdd = [...addedSet].filter((id) => !enrolledSet.has(id));

    if (toRemove.length === 0 && toAdd.length === 0) continue;

    // Calculate new enrolled count to check for auto-release
    const newCount = enrolledSet.size - toRemove.length + toAdd.length;

    if (newCount <= 0) {
      // Schedule will be empty — mark for deletion instead of update
      emptyScheduleIds.push(schedule._id);
      continue;
    }

    // enrolledCount is a virtual (enrolledUsers.length) — only array ops needed.
    if (toRemove.length > 0 && toAdd.length > 0) {
      // MongoDB forbids $pull + $push in one op — use two updateOnes.
      const removeIds = toRemove.map((id) => new mongoose.Types.ObjectId(id));
      const addIds = toAdd.map((id) => new mongoose.Types.ObjectId(id));
      bulkOps.push({
        updateOne: {
          filter: { _id: schedule._id },
          update: { $pull: { enrolledUsers: { $in: removeIds } } },
        },
      });
      bulkOps.push({
        updateOne: {
          filter: { _id: schedule._id },
          update: { $push: { enrolledUsers: { $each: addIds } } },
        },
      });
    } else if (toRemove.length > 0) {
      const removeIds = toRemove.map((id) => new mongoose.Types.ObjectId(id));
      bulkOps.push({
        updateOne: {
          filter: { _id: schedule._id },
          update: { $pull: { enrolledUsers: { $in: removeIds } } },
        },
      });
    } else {
      const addIds = toAdd.map((id) => new mongoose.Types.ObjectId(id));
      bulkOps.push({
        updateOne: {
          filter: { _id: schedule._id },
          update: { $push: { enrolledUsers: { $each: addIds } } },
        },
      });
    }
  }

  // ── Execute within the same session/transaction ──────────
  if (bulkOps.length > 0) {
    await Schedule.bulkWrite(bulkOps, { session });
    console.log(`   ✅ Executed ${bulkOps.length} schedule update(s) via bulkWrite`);
  }

  if (emptyScheduleIds.length > 0) {
    await Schedule.deleteMany({ _id: { $in: emptyScheduleIds } }, { session });
    console.log(`   🔓 Auto-deleted ${emptyScheduleIds.length} empty schedule(s)`);
  }

  console.log('   🏁 Team sync complete');
};

const Team = mongoose.model('Team', teamSchema);

// Export both the model and the sync helper
module.exports = Team;
module.exports.syncSchedulesForTeamUpdate = syncSchedulesForTeamUpdate;

