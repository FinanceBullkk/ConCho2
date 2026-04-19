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
  const removedMembers = oldMembers.filter((id) => !newMembers.includes(id));
  const addedMembers = newMembers.filter((id) => !oldMembers.includes(id));

  // Nothing changed — skip
  if (removedMembers.length === 0 && addedMembers.length === 0) return;

  console.log(`🔄 Team Sync triggered for "${doc.name}"`);
  console.log(`   Removed: ${removedMembers.length}, Added: ${addedMembers.length}`);

  // Lazy-load to avoid circular dependency
  const Schedule = mongoose.model('Schedule');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find all future schedules that include this team
  const futureSchedules = await Schedule.find({
    date: { $gte: today },
    enrolledTeams: doc._id,
  });

  if (futureSchedules.length === 0) {
    console.log('   ℹ️  No future schedules found for this team');
    return;
  }

  console.log(`   📋 Processing ${futureSchedules.length} future schedule(s)...`);

  for (const schedule of futureSchedules) {
    const enrolledSet = new Set(schedule.enrolledUsers.map((id) => id.toString()));

    // ─── Pull removed members ──────────────────────────
    const actuallyRemoved = removedMembers.filter((id) => enrolledSet.has(id));
    if (actuallyRemoved.length > 0) {
      const objectIds = actuallyRemoved.map(
        (id) => new mongoose.Types.ObjectId(id)
      );
      await Schedule.updateOne(
        { _id: schedule._id },
        {
          $pull: { enrolledUsers: { $in: objectIds } },
          $inc: { enrolledCount: -actuallyRemoved.length },
        }
      );
      console.log(
        `   ✅ Removed ${actuallyRemoved.length} member(s) from schedule ${schedule._id}`
      );
    }

    // ─── Push new members (capacity check) ─────────────
    if (addedMembers.length > 0) {
      // Re-read schedule to get current count after removals
      const refreshed = await Schedule.findById(schedule._id).lean();
      const currentCount = refreshed.enrolledCount;
      const availableSpots = refreshed.capacity - currentCount;
      const currentEnrolled = new Set(
        refreshed.enrolledUsers.map((id) => id.toString())
      );

      // Filter out members already enrolled
      const toAdd = addedMembers.filter((id) => !currentEnrolled.has(id));

      if (toAdd.length === 0) continue;

      if (toAdd.length <= availableSpots) {
        // All fit — add them
        const objectIds = toAdd.map(
          (id) => new mongoose.Types.ObjectId(id)
        );
        await Schedule.updateOne(
          { _id: schedule._id },
          {
            $push: { enrolledUsers: { $each: objectIds } },
            $inc: { enrolledCount: toAdd.length },
          }
        );
        console.log(
          `   ✅ Added ${toAdd.length} new member(s) to schedule ${schedule._id}`
        );
      } else {
        // Partial fit — add as many as possible, warn about the rest
        const canAdd = toAdd.slice(0, availableSpots);
        const cannotAdd = toAdd.slice(availableSpots);

        if (canAdd.length > 0) {
          const objectIds = canAdd.map(
            (id) => new mongoose.Types.ObjectId(id)
          );
          await Schedule.updateOne(
            { _id: schedule._id },
            {
              $push: { enrolledUsers: { $each: objectIds } },
              $inc: { enrolledCount: canAdd.length },
            }
          );
          console.log(
            `   ⚠️  Added ${canAdd.length} member(s) to schedule ${schedule._id} (${cannotAdd.length} could not fit — capacity full)`
          );
        } else {
          console.warn(
            `   ❌ Cannot add ${toAdd.length} member(s) to schedule ${schedule._id} — no capacity`
          );
        }
      }
    }
  }

  console.log('   🏁 Team sync complete');
});

module.exports = mongoose.model('Team', teamSchema);
