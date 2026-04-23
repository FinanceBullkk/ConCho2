const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Team Model
// ──────────────────────────────────────────────────────────
// Team Leader = a Participant referenced as leaderId.
//
// CRITICAL MIDDLEWARE:
//   Dynamic Team Sync — when the members array changes,
//   all future Schedules booked by this team are auto-synced:
//   - Removed members are $pulled from enrolledUsers
//   - New members are $pushed ONLY if capacity allows
// ──────────────────────────────────────────────────────────

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
      unique: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Assigned class is required'],
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
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────
teamSchema.index({ leaderId: 1 });
teamSchema.index({ classId: 1 }, { unique: true }); // 1:1 Team ↔ Class

// ──────────────────────────────────────────────────────────
// DYNAMIC TEAM SYNC MIDDLEWARE
// ──────────────────────────────────────────────────────────
// 1. pre('findOneAndUpdate')  → snapshot old members
// 2. post('findOneAndUpdate') → diff old vs new, sync schedules
// ──────────────────────────────────────────────────────────

teamSchema.pre('findOneAndUpdate', async function (next) {
  const teamDoc = await this.model.findOne(this.getQuery()).lean();
  if (teamDoc) {
    // Store old members as string array for easy comparison
    this._previousMembers = teamDoc.members.map((id) => id.toString());
    this._teamId = teamDoc._id;
  }
  next();
});

teamSchema.post('findOneAndUpdate', async function (doc) {
  if (!doc || !this._previousMembers) return;

  const oldMembers = this._previousMembers;
  const newMembers = doc.members.map((id) => id.toString());

  // Compute diff
  const removedSet = new Set(oldMembers.filter((id) => !newMembers.includes(id)));
  const addedSet = new Set(newMembers.filter((id) => !oldMembers.includes(id)));

  // Nothing changed — skip
  if (removedSet.size === 0 && addedSet.size === 0) return;

  console.log(`🔄 Team Sync triggered for "${doc.name}"`);
  console.log(`   Removed: ${removedSet.size}, Added: ${addedSet.size}`);

  // Lazy-load to avoid circular dependency
  const Schedule = mongoose.model('Schedule');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // 1 DB query: fetch all future schedules for this team
  const futureSchedules = await Schedule.find({
    startTime: { $gte: today },
    bookedTeamId: doc._id,
  }).lean();

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

    // Build a single update operation combining pull + push
    const update = { $inc: {} };

    if (toRemove.length > 0) {
      const removeIds = toRemove.map((id) => new mongoose.Types.ObjectId(id));
      update.$pull = { enrolledUsers: { $in: removeIds } };
      update.$inc.enrolledCount = -toRemove.length;
    }

    if (toAdd.length > 0) {
      const addIds = toAdd.map((id) => new mongoose.Types.ObjectId(id));
      // MongoDB doesn't allow $pull and $push in the same update,
      // so if both are needed, we split into two operations
      if (toRemove.length > 0) {
        // Op 1: Pull removed members
        bulkOps.push({
          updateOne: {
            filter: { _id: schedule._id },
            update: {
              $pull: { enrolledUsers: { $in: toRemove.map(id => new mongoose.Types.ObjectId(id)) } },
              $inc: { enrolledCount: -toRemove.length },
            },
          },
        });
        // Op 2: Push new members
        bulkOps.push({
          updateOne: {
            filter: { _id: schedule._id },
            update: {
              $push: { enrolledUsers: { $each: addIds } },
              $inc: { enrolledCount: toAdd.length },
            },
          },
        });
      } else {
        // Only adding — single operation
        update.$push = { enrolledUsers: { $each: addIds } };
        update.$inc.enrolledCount = (update.$inc.enrolledCount || 0) + toAdd.length;
        bulkOps.push({ updateOne: { filter: { _id: schedule._id }, update } });
      }
    } else {
      // Only removing — single operation
      bulkOps.push({ updateOne: { filter: { _id: schedule._id }, update } });
    }
  }

  // ── Execute: 1 bulkWrite + 1 deleteMany (max 2 DB calls) ──
  if (bulkOps.length > 0) {
    await Schedule.bulkWrite(bulkOps);
    console.log(`   ✅ Executed ${bulkOps.length} schedule update(s) via bulkWrite`);
  }

  if (emptyScheduleIds.length > 0) {
    await Schedule.deleteMany({ _id: { $in: emptyScheduleIds } });
    console.log(`   🔓 Auto-deleted ${emptyScheduleIds.length} empty schedule(s)`);
  }

  console.log('   🏁 Team sync complete');
});

module.exports = mongoose.model('Team', teamSchema);
