/**
 * Team & Schedule Data Integrity Fix
 * ===================================
 * 
 * Problem:
 *   1. Team.members only has leader (1 member per team)
 *   2. Schedule.bookedTeamId all point incorrectly (every team shows 655 schedules)
 *   3. Schedule.enrolledUsers has 137 users (all participants) instead of real members
 *
 * Source of Truth: Attendance records { scheduleId, userId, status }
 *   - Each schedule has classId
 *   - Each team has classId (unique 1:1)
 *   - So: schedule → classId → team, and attendance → real users per schedule
 *
 * Usage:
 *   DRY_RUN=true  node scripts/fixTeamMembers.js   # Preview changes
 *   DRY_RUN=false node scripts/fixTeamMembers.js   # Apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Team = require('../models/Team');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');

const DRY_RUN = process.env.DRY_RUN !== 'false'; // default true

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');
  console.log(DRY_RUN ? '🔍 DRY RUN MODE — no changes will be written' : '🔧 LIVE MODE — writing changes');
  console.log('─'.repeat(60));

  // ── Step 0: Build classId → teamId lookup ──────────────
  const teams = await Team.find().populate('leaderId', 'name empCode').lean();
  const classToTeam = {}; // classId string → team object
  const duplicateClasses = [];

  for (const t of teams) {
    if (!t.classId) continue;
    const cid = t.classId.toString();
    if (classToTeam[cid]) {
      duplicateClasses.push({ classId: cid, teams: [classToTeam[cid].name, t.name] });
    }
    classToTeam[cid] = t;
  }

  console.log(`📋 ${teams.length} teams loaded, ${Object.keys(classToTeam).length} with classId`);
  if (duplicateClasses.length > 0) {
    console.log('⚠️  Duplicate class→team mappings:', duplicateClasses);
  }

  // ── Step 1: Get ALL schedules and ALL attendance ───────
  const allSchedules = await Schedule.find().select('_id classId bookedTeamId enrolledUsers enrolledCount startTime').lean();
  console.log(`📋 ${allSchedules.length} schedules loaded`);

  const allAttendance = await Attendance.find().select('scheduleId userId').lean();
  console.log(`📋 ${allAttendance.length} attendance records loaded`);

  // Build scheduleId → Set of userIds from attendance
  const scheduleAttendees = {}; // scheduleId → Set<userId>
  for (const a of allAttendance) {
    const sid = a.scheduleId.toString();
    if (!scheduleAttendees[sid]) scheduleAttendees[sid] = new Set();
    scheduleAttendees[sid].add(a.userId.toString());
  }

  // ── Step 2: Fix each schedule ─────────────────────────
  let schedulesFixed = 0;
  let schedulesOrphaned = 0;
  let schedulesNoAttendance = 0;
  const teamMembersFromAttendance = {}; // teamId → Set<userId>

  const scheduleBulkOps = [];

  for (const s of allSchedules) {
    const sid = s._id.toString();
    const classId = s.classId?.toString();

    if (!classId) {
      schedulesOrphaned++;
      continue;
    }

    // Find the correct team for this schedule's class
    const correctTeam = classToTeam[classId];
    if (!correctTeam) {
      schedulesOrphaned++;
      continue;
    }

    const correctTeamId = correctTeam._id.toString();

    // Get real attendees for this schedule
    const attendees = scheduleAttendees[sid];
    const realUserIds = attendees ? [...attendees] : [];

    if (realUserIds.length === 0) {
      schedulesNoAttendance++;
    }

    // Track members for team rebuild
    if (!teamMembersFromAttendance[correctTeamId]) {
      teamMembersFromAttendance[correctTeamId] = new Set();
    }
    for (const uid of realUserIds) {
      teamMembersFromAttendance[correctTeamId].add(uid);
    }

    // Check if schedule needs update
    const currentTeamId = s.bookedTeamId?.toString();
    const currentEnrolledIds = (s.enrolledUsers || []).map(u => u.toString()).sort().join(',');
    const newEnrolledIds = realUserIds.sort().join(',');

    const needsUpdate = currentTeamId !== correctTeamId || currentEnrolledIds !== newEnrolledIds;

    if (needsUpdate) {
      schedulesFixed++;
      scheduleBulkOps.push({
        updateOne: {
          filter: { _id: s._id },
          update: {
            $set: {
              bookedTeamId: new mongoose.Types.ObjectId(correctTeamId),
              enrolledUsers: realUserIds.map(id => new mongoose.Types.ObjectId(id)),
            },
          },
        },
      });
    }
  }

  console.log('\n── Schedule Fix Summary ─────────────────────');
  console.log(`  Schedules needing fix:     ${schedulesFixed}`);
  console.log(`  Schedules with no class/team: ${schedulesOrphaned}`);
  console.log(`  Schedules with 0 attendance:  ${schedulesNoAttendance}`);

  // ── Step 3: Fix each team's members ───────────────────
  let teamsFixed = 0;
  const teamBulkOps = [];

  console.log('\n── Team Members Rebuild ─────────────────────');

  for (const t of teams) {
    const tid = t._id.toString();
    const leaderId = (t.leaderId?._id || t.leaderId)?.toString();
    const currentMembers = (t.members || []).map(m => m.toString()).sort();

    // Members from attendance + always include leader
    const membersFromAtt = teamMembersFromAttendance[tid] || new Set();
    if (leaderId) membersFromAtt.add(leaderId);

    const newMembers = [...membersFromAtt].sort();

    const changed = currentMembers.join(',') !== newMembers.join(',');
    if (changed) {
      teamsFixed++;
      console.log(`  🔄 ${t.name}: ${currentMembers.length} → ${newMembers.length} members`);

      teamBulkOps.push({
        updateOne: {
          filter: { _id: t._id },
          update: {
            $set: {
              members: newMembers.map(id => new mongoose.Types.ObjectId(id)),
            },
          },
        },
      });
    }
  }

  console.log(`\n  Teams needing member fix: ${teamsFixed} / ${teams.length}`);

  // ── Step 4: Apply changes ─────────────────────────────
  if (!DRY_RUN) {
    console.log('\n── Applying Changes ────────────────────────');

    if (scheduleBulkOps.length > 0) {
      const result = await Schedule.bulkWrite(scheduleBulkOps, { ordered: false });
      console.log(`  ✅ Schedules updated: ${result.modifiedCount}`);
    }

    if (teamBulkOps.length > 0) {
      // Use direct bulkWrite to SKIP the Team middleware (avoid triggering Dynamic Team Sync)
      const result = await mongoose.connection.db.collection('teams').bulkWrite(
        teamBulkOps.map(op => ({
          updateOne: {
            filter: op.updateOne.filter,
            update: op.updateOne.update,
          },
        })),
        { ordered: false }
      );
      console.log(`  ✅ Teams updated: ${result.modifiedCount}`);
    }

    console.log('  🏁 All changes applied successfully!');
  } else {
    console.log('\n── DRY RUN — No changes written ────────────');
    console.log(`  Would update ${scheduleBulkOps.length} schedules`);
    console.log(`  Would update ${teamBulkOps.length} teams`);
    console.log('\n  Run with DRY_RUN=false to apply changes.');
  }

  await mongoose.disconnect();
  console.log('\n✅ Done');
}

run().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
