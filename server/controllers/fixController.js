/**
 * Team & Schedule Data Integrity Fix — via API
 * 
 * Runs inside the existing server process (avoids DNS issues).
 * POST /api/admin/fix-team-data?dryRun=true|false
 */

const mongoose = require('mongoose');
const Team = require('../models/Team');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');

const fixTeamData = async (req, res) => {
  const dryRun = req.query.dryRun !== 'false'; // default true

  try {
    console.log(dryRun ? '🔍 DRY RUN MODE' : '🔧 LIVE MODE');
    console.log('─'.repeat(60));

    // ── Step 0: Build classId → team lookup ──────────────
    const teams = await Team.find().populate('leaderId', 'name empCode').lean();
    const classToTeam = {};

    for (const t of teams) {
      if (!t.classId) continue;
      classToTeam[t.classId.toString()] = t;
    }

    // ── Step 1: Load all data in memory ──────────────────
    const allSchedules = await Schedule.find()
      .select('_id classId bookedTeamId enrolledUsers enrolledCount startTime')
      .lean();

    const allAttendance = await Attendance.find().select('scheduleId userId').lean();

    // Build scheduleId → Set<userId>
    const scheduleAttendees = {};
    for (const a of allAttendance) {
      const sid = a.scheduleId.toString();
      if (!scheduleAttendees[sid]) scheduleAttendees[sid] = new Set();
      scheduleAttendees[sid].add(a.userId.toString());
    }

    // ── Step 2: Fix schedules ────────────────────────────
    let schedulesFixed = 0, schedulesOrphaned = 0, schedulesNoAtt = 0;
    const scheduleBulkOps = [];
    const teamMembersFromAtt = {}; // teamId → Set<userId>

    for (const s of allSchedules) {
      const classId = s.classId?.toString();
      if (!classId) { schedulesOrphaned++; continue; }

      const correctTeam = classToTeam[classId];
      if (!correctTeam) { schedulesOrphaned++; continue; }

      const correctTeamId = correctTeam._id.toString();
      const attendees = scheduleAttendees[s._id.toString()];
      const realUserIds = attendees ? [...attendees] : [];

      if (realUserIds.length === 0) schedulesNoAtt++;

      // Track members for team rebuild
      if (!teamMembersFromAtt[correctTeamId]) teamMembersFromAtt[correctTeamId] = new Set();
      for (const uid of realUserIds) teamMembersFromAtt[correctTeamId].add(uid);

      // Check if needs update
      const currentTeamId = s.bookedTeamId?.toString();
      const currentEnrolled = (s.enrolledUsers || []).map(u => u.toString()).sort().join(',');
      const newEnrolled = realUserIds.sort().join(',');

      if (currentTeamId !== correctTeamId || currentEnrolled !== newEnrolled) {
        schedulesFixed++;
        scheduleBulkOps.push({
          updateOne: {
            filter: { _id: s._id },
            update: {
              $set: {
                bookedTeamId: new mongoose.Types.ObjectId(correctTeamId),
                enrolledUsers: realUserIds.map(id => new mongoose.Types.ObjectId(id)),
                enrolledCount: realUserIds.length,
              },
            },
          },
        });
      }
    }

    // ── Step 3: Fix team members ─────────────────────────
    let teamsFixed = 0;
    const teamBulkOps = [];
    const teamDetails = [];

    for (const t of teams) {
      const tid = t._id.toString();
      const leaderId = (t.leaderId?._id || t.leaderId)?.toString();
      const currentMembers = (t.members || []).map(m => m.toString()).sort();

      const membersFromAtt = teamMembersFromAtt[tid] || new Set();
      if (leaderId) membersFromAtt.add(leaderId);
      const newMembers = [...membersFromAtt].sort();

      if (currentMembers.join(',') !== newMembers.join(',')) {
        teamsFixed++;
        teamDetails.push({
          name: t.name,
          classCode: t.classId?.toString() ? '(has class)' : '(no class)',
          before: currentMembers.length,
          after: newMembers.length,
        });

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

    // ── Step 4: Apply ────────────────────────────────────
    const result = {
      dryRun,
      schedules: {
        total: allSchedules.length,
        needingFix: schedulesFixed,
        orphaned: schedulesOrphaned,
        noAttendance: schedulesNoAtt,
      },
      teams: {
        total: teams.length,
        needingFix: teamsFixed,
        details: teamDetails,
      },
      attendanceRecords: allAttendance.length,
    };

    if (!dryRun) {
      if (scheduleBulkOps.length > 0) {
        const r = await Schedule.bulkWrite(scheduleBulkOps, { ordered: false });
        result.schedules.updated = r.modifiedCount;
      }

      if (teamBulkOps.length > 0) {
        // Use raw collection to SKIP Team middleware (avoid Dynamic Team Sync cascade)
        const r = await mongoose.connection.db.collection('teams').bulkWrite(
          teamBulkOps.map(op => ({
            updateOne: {
              filter: op.updateOne.filter,
              update: op.updateOne.update,
            },
          })),
          { ordered: false }
        );
        result.teams.updated = r.modifiedCount;
      }

      result.message = '✅ All changes applied successfully!';
    } else {
      result.message = '🔍 Dry run complete — no changes written. Set ?dryRun=false to apply.';
    }

    console.log(JSON.stringify(result, null, 2));
    res.json({ success: true, data: result });

  } catch (error) {
    console.error('❌ Fix error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { fixTeamData };
