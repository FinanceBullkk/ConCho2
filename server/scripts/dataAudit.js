#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════
 *  TMS Data Audit Script — In-Place Database Validation
 * ══════════════════════════════════════════════════════════
 *  Connects to MongoDB and scans all collections for:
 *    1. Timezone & time logic errors
 *    2. Schedule collisions (overlap)
 *    3. Orphaned references
 *    4. Business rule violations
 *    5. Missing required fields
 *
 *  Usage: node scripts/dataAudit.js
 *  Output: server/scripts/audit_output/ directory
 * ══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Fallback: if SRV lookup fails, use direct connection string
const DIRECT_URI = 'mongodb://anhhaodl108_db_user:4dxyDLsB5Fo5RK10@ac-sqbvndx-shard-00-00.mhtjnsw.mongodb.net:27017,ac-sqbvndx-shard-00-01.mhtjnsw.mongodb.net:27017,ac-sqbvndx-shard-00-02.mhtjnsw.mongodb.net:27017/tms2?ssl=true&replicaSet=atlas-dj2517-shard-0&authSource=admin&retryWrites=true&w=majority';
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

const VN_TZ = 'Asia/Ho_Chi_Minh';

// ── Load Models ─────────────────────────────────────────
require('../models/Setting');
const User = require('../models/User');
const Class = require('../models/Class');
const Team = require('../models/Team');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');

// ── Output Directory ────────────────────────────────────
const OUTPUT_DIR = path.join(__dirname, 'audit_output');

// ── Helpers ─────────────────────────────────────────────
const report = { summary: {}, errors: {} };
let totalErrors = 0;

function addError(category, record) {
  if (!report.errors[category]) report.errors[category] = [];
  report.errors[category].push(record);
  totalErrors++;
}

function printSection(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

// ══════════════════════════════════════════════════════════
//  AUDIT 1: Timezone & Time Logic
// ══════════════════════════════════════════════════════════
async function auditScheduleTimes() {
  printSection('AUDIT 1: Schedule Time Logic');
  const schedules = await Schedule.find().lean();
  let reversed = 0, tooLong = 0, tooShort = 0, outsideHours = 0;

  for (const s of schedules) {
    const start = new Date(s.startTime);
    const end = new Date(s.endTime);
    const errors = [];

    // 1a. startTime > endTime
    if (start >= end) {
      errors.push('startTime >= endTime (reversed)');
      reversed++;
    }

    // 1b. Duration anomaly
    const durationMin = (end - start) / 60000;
    if (durationMin > 240) {
      errors.push(`Duration ${durationMin}min > 4h (abnormal)`);
      tooLong++;
    }
    if (durationMin > 0 && durationMin < 15) {
      errors.push(`Duration ${durationMin}min < 15min (abnormal)`);
      tooShort++;
    }

    // 1c. Outside business hours (check in VN timezone)
    const startVN = dayjs(start).tz(VN_TZ);
    const endVN = dayjs(end).tz(VN_TZ);
    const sh = startVN.hour();
    const eh = endVN.hour() + (endVN.minute() > 0 ? 1 : 0);
    if (sh < 7 || eh > 22) {
      errors.push(`Outside business hours: ${startVN.format('HH:mm')}-${endVN.format('HH:mm')} VN`);
      outsideHours++;
    }

    if (errors.length > 0) {
      addError('schedule_time', {
        _id: s._id,
        classId: s.classId,
        startTime: s.startTime,
        endTime: s.endTime,
        startVN: startVN.format('YYYY-MM-DD HH:mm'),
        endVN: endVN.format('YYYY-MM-DD HH:mm'),
        errors,
      });
    }
  }

  report.summary.scheduleTime = {
    total: schedules.length,
    reversed,
    tooLong,
    tooShort,
    outsideHours,
    errorCount: report.errors.schedule_time?.length || 0,
  };
  console.log(`  Total schedules: ${schedules.length}`);
  console.log(`  ❌ Reversed (start >= end): ${reversed}`);
  console.log(`  ❌ Too long (> 4h): ${tooLong}`);
  console.log(`  ❌ Too short (< 15min): ${tooShort}`);
  console.log(`  ⚠️  Outside hours (7:00-22:00 VN): ${outsideHours}`);
}

// ══════════════════════════════════════════════════════════
//  AUDIT 2: Schedule Collision (Overlap Detection)
// ══════════════════════════════════════════════════════════
async function auditCollisions() {
  printSection('AUDIT 2: Schedule Collisions');
  const schedules = await Schedule.find().sort({ classId: 1, startTime: 1 }).lean();

  // Group by classId
  const byClass = {};
  for (const s of schedules) {
    const cid = s.classId?.toString() || 'NO_CLASS';
    if (!byClass[cid]) byClass[cid] = [];
    byClass[cid].push(s);
  }

  let collisionCount = 0;
  for (const [classId, list] of Object.entries(byClass)) {
    // Sort by startTime
    list.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const aEnd = new Date(a.endTime);
        const bStart = new Date(b.startTime);
        if (bStart >= aEnd) break; // No more overlaps possible (sorted)

        collisionCount++;
        addError('schedule_collision', {
          classId,
          scheduleA: { _id: a._id, start: a.startTime, end: a.endTime },
          scheduleB: { _id: b._id, start: b.startTime, end: b.endTime },
          error: 'Time ranges overlap within same class',
        });
      }
    }
  }

  report.summary.collisions = { totalClasses: Object.keys(byClass).length, collisionPairs: collisionCount };
  console.log(`  Classes scanned: ${Object.keys(byClass).length}`);
  console.log(`  ❌ Collision pairs found: ${collisionCount}`);
}

// ══════════════════════════════════════════════════════════
//  AUDIT 3: Orphaned References
// ══════════════════════════════════════════════════════════
async function auditOrphans() {
  printSection('AUDIT 3: Orphaned References');

  const userIds = new Set((await User.find().select('_id').lean()).map(u => u._id.toString()));
  const classIds = new Set((await Class.find().select('_id').lean()).map(c => c._id.toString()));
  const teamIds = new Set((await Team.find().select('_id').lean()).map(t => t._id.toString()));

  // 3a. Teams with invalid leader/members
  const teams = await Team.find().lean();
  let orphanLeader = 0, orphanMembers = 0;
  for (const t of teams) {
    const errors = [];
    if (t.leaderId && !userIds.has(t.leaderId.toString())) {
      errors.push(`leaderId ${t.leaderId} not in users`);
      orphanLeader++;
    }
    for (const m of (t.members || [])) {
      if (!userIds.has(m.toString())) {
        errors.push(`member ${m} not in users`);
        orphanMembers++;
      }
    }
    if (errors.length) addError('orphan_team', { _id: t._id, name: t.name, errors });
  }

  // 3b. Schedules with invalid classId or bookedTeamId
  const schedules = await Schedule.find().lean();
  let orphanClass = 0, orphanTeam = 0, orphanEnrolled = 0;
  for (const s of schedules) {
    const errors = [];
    if (s.classId && !classIds.has(s.classId.toString())) {
      errors.push(`classId ${s.classId} not in classes`);
      orphanClass++;
    }
    if (s.bookedTeamId && !teamIds.has(s.bookedTeamId.toString())) {
      errors.push(`bookedTeamId ${s.bookedTeamId} not in teams`);
      orphanTeam++;
    }
    // Check enrolledUsers
    const badUsers = (s.enrolledUsers || []).filter(u => !userIds.has(u.toString()));
    if (badUsers.length > 0) {
      errors.push(`${badUsers.length} enrolledUser(s) not in users: ${badUsers.slice(0, 3).join(', ')}`);
      orphanEnrolled += badUsers.length;
    }
    if (errors.length) addError('orphan_schedule', { _id: s._id, errors });
  }

  // 3c. Attendance with invalid refs
  const attendances = await Attendance.find().select('_id scheduleId userId').lean();
  const scheduleIdSet = new Set(schedules.map(s => s._id.toString()));
  let orphanAttSch = 0, orphanAttUser = 0;
  for (const a of attendances) {
    const errors = [];
    if (a.scheduleId && !scheduleIdSet.has(a.scheduleId.toString())) {
      errors.push(`scheduleId ${a.scheduleId} not in schedules`);
      orphanAttSch++;
    }
    if (a.userId && !userIds.has(a.userId.toString())) {
      errors.push(`userId ${a.userId} not in users`);
      orphanAttUser++;
    }
    if (errors.length) addError('orphan_attendance', { _id: a._id, errors });
  }

  report.summary.orphans = {
    orphanLeader, orphanMembers, orphanClass, orphanTeam, orphanEnrolled,
    orphanAttSch, orphanAttUser,
  };
  console.log(`  Teams — orphan leaders: ${orphanLeader}, orphan members: ${orphanMembers}`);
  console.log(`  Schedules — orphan classId: ${orphanClass}, orphan teamId: ${orphanTeam}, orphan enrolled: ${orphanEnrolled}`);
  console.log(`  Attendance — orphan scheduleId: ${orphanAttSch}, orphan userId: ${orphanAttUser}`);
}

// ══════════════════════════════════════════════════════════
//  AUDIT 4: Business Rule Violations
// ══════════════════════════════════════════════════════════
async function auditBusinessRules() {
  printSection('AUDIT 4: Business Rules');

  // 4a. bookedSessions vs actual count
  const classes = await Class.find().lean();
  const scheduleCounts = await Schedule.aggregate([
    { $group: { _id: '$classId', actual: { $sum: 1 } } },
  ]);
  const countMap = {};
  for (const s of scheduleCounts) countMap[s._id?.toString()] = s.actual;

  let mismatchCount = 0;
  for (const c of classes) {
    const actual = countMap[c._id.toString()] || 0;
    if (c.bookedSessions !== undefined && c.bookedSessions !== actual) {
      mismatchCount++;
      addError('business_session_mismatch', {
        _id: c._id,
        classCode: c.classCode,
        courseName: c.courseName,
        bookedSessions: c.bookedSessions,
        actualSchedules: actual,
        error: `bookedSessions (${c.bookedSessions}) != actual schedules (${actual})`,
      });
    }
  }

  // 4b. Duplicate empCode
  const dupAgg = await User.aggregate([
    { $group: { _id: '$empCode', count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  for (const d of dupAgg) {
    addError('business_dup_empcode', {
      empCode: d._id,
      count: d.count,
      userIds: d.ids,
      error: `empCode "${d._id}" has ${d.count} duplicates`,
    });
  }

  // 4c. enrolledCount mismatch
  const schedules = await Schedule.find().select('_id enrolledUsers enrolledCount').lean();
  let enrollMismatch = 0;
  for (const s of schedules) {
    const actual = (s.enrolledUsers || []).length;
    if (s.enrolledCount !== actual) {
      enrollMismatch++;
      addError('business_enrollcount', {
        _id: s._id,
        enrolledCount: s.enrolledCount,
        actualLength: actual,
        error: `enrolledCount (${s.enrolledCount}) != enrolledUsers.length (${actual})`,
      });
    }
  }

  // 4d. Weekly limit — teams with > 2 sessions in same week
  const allSchedules = await Schedule.find().sort({ startTime: 1 }).lean();
  const weekMap = {}; // "teamId|weekStart" → count
  let weeklyViolations = 0;
  for (const s of allSchedules) {
    if (!s.bookedTeamId) continue;
    const d = dayjs(s.startTime).tz(VN_TZ);
    const monday = d.startOf('week').add(1, 'day'); // dayjs week starts Sunday
    const key = `${s.bookedTeamId}|${monday.format('YYYY-MM-DD')}`;
    weekMap[key] = (weekMap[key] || 0) + 1;
  }
  for (const [key, count] of Object.entries(weekMap)) {
    if (count > 2) {
      const [teamId, week] = key.split('|');
      weeklyViolations++;
      addError('business_weekly_limit', {
        teamId, weekStart: week, sessionCount: count,
        error: `Team has ${count} sessions in week of ${week} (limit: 2)`,
      });
    }
  }

  report.summary.businessRules = {
    sessionMismatch: mismatchCount,
    dupEmpCodes: dupAgg.length,
    enrollCountMismatch: enrollMismatch,
    weeklyLimitViolations: weeklyViolations,
  };
  console.log(`  ❌ bookedSessions mismatch: ${mismatchCount}`);
  console.log(`  ❌ Duplicate empCodes: ${dupAgg.length}`);
  console.log(`  ❌ enrolledCount mismatch: ${enrollMismatch}`);
  console.log(`  ❌ Weekly limit violations (>2/week): ${weeklyViolations}`);
}

// ══════════════════════════════════════════════════════════
//  AUDIT 5: Missing Required Fields
// ══════════════════════════════════════════════════════════
async function auditMissingFields() {
  printSection('AUDIT 5: Missing Required Fields');

  // Users
  const users = await User.find().select('+password').lean();
  let userMissing = 0;
  for (const u of users) {
    const missing = [];
    if (!u.empCode) missing.push('empCode');
    if (!u.name) missing.push('name');
    if (!u.role) missing.push('role');
    if (!u.password) missing.push('password');
    if (u.role && !['Admin', 'Teacher', 'Participant'].includes(u.role)) {
      missing.push(`invalid role: "${u.role}"`);
    }
    if (missing.length) {
      userMissing++;
      addError('missing_user', { _id: u._id, empCode: u.empCode, errors: missing });
    }
  }

  // Schedules
  const schedules = await Schedule.find().lean();
  let schMissing = 0;
  for (const s of schedules) {
    const missing = [];
    if (!s.classId) missing.push('classId');
    if (!s.bookedTeamId) missing.push('bookedTeamId');
    if (!s.startTime) missing.push('startTime');
    if (!s.endTime) missing.push('endTime');
    if (missing.length) {
      schMissing++;
      addError('missing_schedule', { _id: s._id, errors: missing });
    }
  }

  // Classes
  const classes = await Class.find().lean();
  let clsMissing = 0;
  for (const c of classes) {
    const missing = [];
    if (!c.classCode) missing.push('classCode');
    if (!c.courseName) missing.push('courseName');
    if (!c.totalSessions) missing.push('totalSessions');
    if (missing.length) {
      clsMissing++;
      addError('missing_class', { _id: c._id, classCode: c.classCode, errors: missing });
    }
  }

  // Teams
  const teams = await Team.find().lean();
  let teamMissing = 0;
  for (const t of teams) {
    const missing = [];
    if (!t.name) missing.push('name');
    if (!t.leaderId) missing.push('leaderId');
    if (!t.members || t.members.length === 0) missing.push('members (empty)');
    if (missing.length) {
      teamMissing++;
      addError('missing_team', { _id: t._id, name: t.name, errors: missing });
    }
  }

  report.summary.missingFields = { users: userMissing, schedules: schMissing, classes: clsMissing, teams: teamMissing };
  console.log(`  ❌ Users missing fields: ${userMissing}`);
  console.log(`  ❌ Schedules missing fields: ${schMissing}`);
  console.log(`  ❌ Classes missing fields: ${clsMissing}`);
  console.log(`  ❌ Teams missing fields: ${teamMissing}`);
}

// ══════════════════════════════════════════════════════════
//  OUTPUT: Write Reports
// ══════════════════════════════════════════════════════════
function writeReports() {
  printSection('OUTPUT: Writing Reports');

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Full error details (JSON per category)
  for (const [category, records] of Object.entries(report.errors)) {
    const filePath = path.join(OUTPUT_DIR, `dirty_${category}.json`);
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
    console.log(`  📄 ${filePath} (${records.length} records)`);
  }

  // 2. Summary report
  const summaryLines = [
    '══════════════════════════════════════════════════════════',
    '  TMS DATA AUDIT REPORT',
    `  Generated: ${dayjs().tz(VN_TZ).format('YYYY-MM-DD HH:mm:ss')} (VN)`,
    '══════════════════════════════════════════════════════════',
    '',
  ];

  for (const [section, stats] of Object.entries(report.summary)) {
    summaryLines.push(`── ${section} ──`);
    for (const [key, val] of Object.entries(stats)) {
      summaryLines.push(`  ${key}: ${val}`);
    }
    summaryLines.push('');
  }

  summaryLines.push('── Error Counts by Category ──');
  for (const [cat, records] of Object.entries(report.errors)) {
    summaryLines.push(`  ${cat}: ${records.length}`);
  }
  summaryLines.push('');
  summaryLines.push(`TOTAL ERRORS: ${totalErrors}`);
  summaryLines.push(`STATUS: ${totalErrors === 0 ? '✅ DATABASE IS CLEAN' : '❌ ISSUES FOUND — Review dirty_*.json files'}`);

  const summaryPath = path.join(OUTPUT_DIR, 'audit_report.txt');
  fs.writeFileSync(summaryPath, summaryLines.join('\n'));
  console.log(`  📊 ${summaryPath}`);

  // 3. Print summary to console
  console.log('\n' + summaryLines.join('\n'));
}

// ══════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════
async function main() {
  console.log('🔍 TMS Data Audit — Connecting to MongoDB...');
  try {
    await mongoose.connect(process.env.MONGO_URI);
  } catch (srvErr) {
    console.log('⚠️  SRV lookup failed, retrying with direct connection...');
    await mongoose.connect(DIRECT_URI);
  }
  console.log('✅ Connected\n');

  // Run collection counts first
  const counts = {
    users: await User.countDocuments(),
    classes: await Class.countDocuments(),
    teams: await Team.countDocuments(),
    schedules: await Schedule.countDocuments(),
    attendances: await Attendance.countDocuments(),
    enrollments: await Enrollment.countDocuments(),
  };
  report.summary.collectionCounts = counts;
  console.log('📊 Collection Counts:', counts);

  // Run all audits
  await auditScheduleTimes();
  await auditCollisions();
  await auditOrphans();
  await auditBusinessRules();
  await auditMissingFields();

  // Write output
  writeReports();

  await mongoose.disconnect();
  console.log('\n🔌 Disconnected from MongoDB');
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(2);
});
