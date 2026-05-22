/**
 * TMS v2 — Data Integrity Scanner
 * ────────────────────────────────
 * Automated garbage data detection script.
 * Run manually: node server/scripts/data_integrity_scan.js
 * Or schedule via cron for production monitoring.
 *
 * Checks:
 *   TC-01: Orphan Attendance (scheduleId → deleted Schedule)
 *   TC-02: Duplicate Active Enrollments
 *   TC-03: Ghost Users in Schedule.enrolledUsers
 *   TC-04: Team ↔ Enrollment Consistency
 *   TC-05: Orphan Evaluations (userId/classId → deleted docs)
 *   TC-06: Enrollment.classId null detection
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Models
const Attendance = require('../models/Attendance');
const Schedule = require('../models/Schedule');
const Enrollment = require('../models/Enrollment');
const Evaluation = require('../models/Evaluation');
const User = require('../models/User');
const Team = require('../models/Team');
const Class = require('../models/Class');

const SEPARATOR = '─'.repeat(60);

const run = async () => {
  await connectDB();
  console.log('🔬 TMS v2 Data Integrity Scanner');
  console.log(SEPARATOR);

  const issues = [];
  let totalChecks = 0;

  // ── TC-01: Orphan Attendance Records ──────────────────
  totalChecks++;
  console.log('\n📋 TC-01: Checking for orphan Attendance records...');
  const orphanAttendance = await Attendance.aggregate([
    {
      $lookup: {
        from: 'schedules',
        localField: 'scheduleId',
        foreignField: '_id',
        as: 'schedule',
      },
    },
    { $match: { schedule: { $size: 0 } } },
    { $project: { _id: 1, scheduleId: 1, userId: 1, status: 1 } },
  ]);
  if (orphanAttendance.length > 0) {
    issues.push({
      id: 'TC-01',
      severity: 'CRITICAL',
      message: `${orphanAttendance.length} Attendance record(s) reference deleted Schedules`,
      count: orphanAttendance.length,
      sampleIds: orphanAttendance.slice(0, 5).map(a => a._id),
    });
    console.log(`   ❌ Found ${orphanAttendance.length} orphan(s)`);
  } else {
    console.log('   ✅ No orphan Attendance records');
  }

  // ── TC-02: Duplicate Active Enrollments ────────────────
  totalChecks++;
  console.log('\n📋 TC-02: Checking for duplicate Active enrollments...');
  const dupeEnrollments = await Enrollment.aggregate([
    { $match: { status: 'Active' } },
    {
      $group: {
        _id: { userId: '$userId', teamId: '$teamId' },
        count: { $sum: 1 },
        ids: { $push: '$_id' },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);
  if (dupeEnrollments.length > 0) {
    issues.push({
      id: 'TC-02',
      severity: 'HIGH',
      message: `${dupeEnrollments.length} user-team pair(s) have duplicate Active enrollments`,
      count: dupeEnrollments.length,
      details: dupeEnrollments.slice(0, 5),
    });
    console.log(`   ❌ Found ${dupeEnrollments.length} duplicate(s)`);
  } else {
    console.log('   ✅ No duplicate Active enrollments');
  }

  // ── TC-03: Ghost Users in Schedule.enrolledUsers ──────
  totalChecks++;
  console.log('\n📋 TC-03: Checking for ghost users in Schedule.enrolledUsers...');
  const allUserIds = new Set(
    (await User.find().select('_id').lean()).map(u => u._id.toString())
  );
  const allSchedules = await Schedule.find().select('_id enrolledUsers').lean();
  const ghostEntries = [];
  for (const s of allSchedules) {
    for (const uid of s.enrolledUsers) {
      if (!allUserIds.has(uid.toString())) {
        ghostEntries.push({ scheduleId: s._id, ghostUserId: uid });
      }
    }
  }
  if (ghostEntries.length > 0) {
    issues.push({
      id: 'TC-03',
      severity: 'HIGH',
      message: `${ghostEntries.length} ghost user reference(s) in Schedule.enrolledUsers`,
      count: ghostEntries.length,
      sampleEntries: ghostEntries.slice(0, 5),
    });
    console.log(`   ❌ Found ${ghostEntries.length} ghost reference(s)`);
  } else {
    console.log('   ✅ No ghost users in Schedule.enrolledUsers');
  }

  // ── TC-04: Team ↔ Enrollment Consistency ──────────────
  totalChecks++;
  console.log('\n📋 TC-04: Checking Team ↔ Enrollment consistency...');
  const teams = await Team.find().select('_id name members').lean();
  const inconsistencies = [];
  for (const team of teams) {
    for (const memberId of team.members) {
      const enrollment = await Enrollment.findOne({
        userId: memberId,
        teamId: team._id,
        status: 'Active',
      }).lean();
      if (!enrollment) {
        inconsistencies.push({
          teamId: team._id,
          teamName: team.name,
          userId: memberId,
        });
      }
    }
  }
  if (inconsistencies.length > 0) {
    issues.push({
      id: 'TC-04',
      severity: 'MEDIUM',
      message: `${inconsistencies.length} team member(s) missing Active enrollment records`,
      count: inconsistencies.length,
      sampleEntries: inconsistencies.slice(0, 5),
    });
    console.log(`   ❌ Found ${inconsistencies.length} inconsistency(ies)`);
  } else {
    console.log('   ✅ All team members have matching Active enrollments');
  }

  // ── TC-05: Orphan Evaluations ─────────────────────────
  totalChecks++;
  console.log('\n📋 TC-05: Checking for orphan Evaluations...');
  const allClassIds = new Set(
    (await Class.find().select('_id').lean()).map(c => c._id.toString())
  );
  const evaluations = await Evaluation.find().select('_id userId classId').lean();
  const orphanEvals = evaluations.filter(
    e => !allUserIds.has(e.userId.toString()) || !allClassIds.has(e.classId.toString())
  );
  if (orphanEvals.length > 0) {
    issues.push({
      id: 'TC-05',
      severity: 'MEDIUM',
      message: `${orphanEvals.length} Evaluation(s) reference deleted Users or Classes`,
      count: orphanEvals.length,
      sampleIds: orphanEvals.slice(0, 5).map(e => e._id),
    });
    console.log(`   ❌ Found ${orphanEvals.length} orphan Evaluation(s)`);
  } else {
    console.log('   ✅ No orphan Evaluations');
  }

  // ── TC-06: Enrollments with null classId ──────────────
  totalChecks++;
  console.log('\n📋 TC-06: Checking for Enrollments with null classId...');
  const nullClassEnrollments = await Enrollment.countDocuments({
    classId: null,
    status: 'Active',
  });
  if (nullClassEnrollments > 0) {
    issues.push({
      id: 'TC-06',
      severity: 'LOW',
      message: `${nullClassEnrollments} Active enrollment(s) have null classId (team may not have a class assigned)`,
      count: nullClassEnrollments,
    });
    console.log(`   ⚠️  ${nullClassEnrollments} enrollment(s) with null classId`);
  } else {
    console.log('   ✅ All Active enrollments have classId');
  }

  // ── Summary ───────────────────────────────────────────
  console.log('\n' + SEPARATOR);
  console.log('📊 SCAN SUMMARY');
  console.log(SEPARATOR);
  console.log(`   Checks run:     ${totalChecks}`);
  console.log(`   Issues found:   ${issues.length}`);

  const critical = issues.filter(i => i.severity === 'CRITICAL');
  const high = issues.filter(i => i.severity === 'HIGH');
  const medium = issues.filter(i => i.severity === 'MEDIUM');
  const low = issues.filter(i => i.severity === 'LOW');

  if (critical.length > 0) console.log(`   🔴 CRITICAL:    ${critical.length}`);
  if (high.length > 0) console.log(`   🟡 HIGH:        ${high.length}`);
  if (medium.length > 0) console.log(`   🟢 MEDIUM:      ${medium.length}`);
  if (low.length > 0) console.log(`   ⚪ LOW:         ${low.length}`);

  if (issues.length === 0) {
    console.log('\n   ✅ All checks passed! Data integrity is clean.');
  } else {
    console.log('\n   ⚠️  Issues detected. Review above for details.');
    console.log(JSON.stringify(issues, null, 2));
  }

  console.log(SEPARATOR);
  await mongoose.disconnect();
  process.exit(issues.some(i => i.severity === 'CRITICAL') ? 1 : 0);
};

run().catch(err => {
  console.error('❌ Scanner failed:', err);
  process.exit(2);
});
