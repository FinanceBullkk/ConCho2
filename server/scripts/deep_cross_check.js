/**
 * Deep cross-check of TMS data consistency across all collections.
 * Read-only — no mutations.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
const Class = require('../models/Class');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const User = require('../models/User');

const SEP = '═'.repeat(60);

(async () => {
  await connectDB();
  console.log(SEP);
  console.log('  TMS DEEP CROSS-CHECK AUDIT');
  console.log('  ' + new Date().toISOString());
  console.log(SEP);

  const issues = [];
  const info = [];

  // Load all data
  const allScheds = await Schedule.find({}).populate('classId', 'classCode courseName status').lean();
  const allClasses = await Class.find({}).lean();
  const allTeams = await Team.find({}).select('+isDeleted').lean();
  const allEnrollments = await Enrollment.find({}).lean();
  const allUsers = await User.find({}).lean();
  const allAttendance = await Attendance.find({}).lean();

  const userIdSet = new Set(allUsers.map(u => u._id.toString()));
  const classIdSet = new Set(allClasses.map(c => c._id.toString()));
  const teamIdSet = new Set(allTeams.map(t => t._id.toString()));
  const schedIdSet = new Set(allScheds.map(s => s._id.toString()));

  // ── CHECK 1: Schedules with non-zero minutes (time slot drift) ──
  console.log('\n📋 CHECK 1: Schedule time slot drift (non-zero minutes)');
  const nonZeroMin = allScheds.filter(s => {
    const st = new Date(s.startTime);
    const et = new Date(s.endTime);
    return st.getMinutes() !== 0 || st.getSeconds() !== 0 || st.getMilliseconds() !== 0
        || et.getMinutes() !== 0 || et.getSeconds() !== 0 || et.getMilliseconds() !== 0;
  });
  if (nonZeroMin.length > 0) {
    issues.push({ check: 'TIME_DRIFT', severity: 'MEDIUM', count: nonZeroMin.length });
    nonZeroMin.forEach(s => {
      console.log(`   ⚠️  ${s._id} | ${s.classId?.classCode} | start=${new Date(s.startTime).toISOString()} end=${new Date(s.endTime).toISOString()}`);
    });
  } else {
    console.log('   ✅ All schedule times are on exact hour boundaries');
  }

  // ── CHECK 2: Teams without leader ──
  console.log('\n📋 CHECK 2: Teams without leaderId');
  const noLeaderTeams = allTeams.filter(t => !t.leaderId);
  info.push({ check: 'NO_LEADER_TEAMS', count: noLeaderTeams.length });
  if (noLeaderTeams.length > 0) {
    console.log(`   ℹ️  ${noLeaderTeams.length} team(s) have no leader (external PICs from import)`);
    noLeaderTeams.slice(0, 5).forEach(t => {
      const cls = allClasses.find(c => c._id.toString() === t.classId?.toString());
      console.log(`      ${t.name} → ${cls?.classCode || '?'} ${cls?.courseName || '?'} (${cls?.status}) | ${t.members?.length} members`);
    });
    if (noLeaderTeams.length > 5) console.log(`      ... and ${noLeaderTeams.length - 5} more`);
  } else {
    console.log('   ✅ All teams have leaders');
  }

  // ── CHECK 3: Class.bookedSessions vs actual Schedule count ──
  console.log('\n📋 CHECK 3: Class.bookedSessions vs actual Schedule count');
  const schedCountByClass = {};
  allScheds.forEach(s => {
    const cid = s.classId?._id?.toString() || s.classId?.toString();
    if (cid) schedCountByClass[cid] = (schedCountByClass[cid] || 0) + 1;
  });
  let mismatchCount = 0;
  const mismatchExamples = [];
  for (const c of allClasses) {
    const actual = schedCountByClass[c._id.toString()] || 0;
    if (c.bookedSessions !== actual) {
      mismatchCount++;
      if (mismatchExamples.length < 10) {
        mismatchExamples.push(`${c.classCode} ${c.courseName} | bookedSessions=${c.bookedSessions} actual=${actual}`);
      }
    }
  }
  if (mismatchCount > 0) {
    issues.push({ check: 'BOOKED_SESSIONS_MISMATCH', severity: 'HIGH', count: mismatchCount });
    console.log(`   ❌ ${mismatchCount} class(es) have mismatched bookedSessions`);
    mismatchExamples.forEach(e => console.log(`      ${e}`));
  } else {
    console.log('   ✅ All Class.bookedSessions match actual Schedule count');
  }

  // ── CHECK 4: Schedule.enrolledCount vs enrolledUsers.length ──
  console.log('\n📋 CHECK 4: Schedule.enrolledCount vs enrolledUsers.length');
  let enrollCountMismatch = 0;
  const enrollMismatchEx = [];
  for (const s of allScheds) {
    const actual = (s.enrolledUsers || []).length;
    if (s.enrolledCount !== actual) {
      enrollCountMismatch++;
      if (enrollMismatchEx.length < 5) {
        enrollMismatchEx.push(`${s._id} | enrolledCount=${s.enrolledCount} users.length=${actual}`);
      }
    }
  }
  if (enrollCountMismatch > 0) {
    issues.push({ check: 'ENROLLED_COUNT_MISMATCH', severity: 'MEDIUM', count: enrollCountMismatch });
    console.log(`   ⚠️  ${enrollCountMismatch} schedule(s) have mismatched enrolledCount`);
    enrollMismatchEx.forEach(e => console.log(`      ${e}`));
  } else {
    console.log('   ✅ All Schedule.enrolledCount matches enrolledUsers.length');
  }

  // ── CHECK 5: Duplicate attendance (same scheduleId + userId) ──
  console.log('\n📋 CHECK 5: Duplicate attendance per (scheduleId, userId)');
  const attKeySet = new Map();
  let dupAtt = 0;
  for (const a of allAttendance) {
    const k = `${a.scheduleId}|${a.userId}`;
    if (attKeySet.has(k)) {
      dupAtt++;
      if (dupAtt <= 3) {
        console.log(`   ⚠️  DUP: scheduleId=${a.scheduleId} userId=${a.userId} status=${a.status}`);
      }
    }
    attKeySet.set(k, (attKeySet.get(k) || 0) + 1);
  }
  if (dupAtt > 0) {
    issues.push({ check: 'DUP_ATTENDANCE', severity: 'HIGH', count: dupAtt });
    console.log(`   ❌ ${dupAtt} duplicate attendance record(s)`);
  } else {
    console.log('   ✅ No duplicate attendance records');
  }

  // ── CHECK 6: Time slots outside valid range (09:00-16:00 VN) ──
  console.log('\n📋 CHECK 6: Schedule times outside valid hours (09:00-16:00 VN)');
  const VALID_VN_START = [9, 10, 11, 13, 14, 15]; // Valid start hours in VN time
  let oddHour = 0;
  const oddExamples = [];
  for (const s of allScheds) {
    const st = new Date(s.startTime);
    const vnHour = (st.getUTCHours() + 7) % 24;
    if (!VALID_VN_START.includes(vnHour)) {
      oddHour++;
      if (oddExamples.length < 5) {
        oddExamples.push(`${s._id} | ${s.classId?.classCode} | ${st.toISOString()} → VN ${vnHour}:00`);
      }
    }
  }
  if (oddHour > 0) {
    issues.push({ check: 'ODD_TIME_SLOTS', severity: 'LOW', count: oddHour });
    console.log(`   ⚠️  ${oddHour} schedule(s) outside standard hours`);
    oddExamples.forEach(e => console.log(`      ${e}`));
  } else {
    console.log('   ✅ All schedules are within standard VN hours');
  }

  // ── CHECK 7: Team.members ↔ Enrollment sync ──
  console.log('\n📋 CHECK 7: Team.members matches Enrollment records');
  let enrollNotInTeam = 0;
  let teamNotInEnroll = 0;
  for (const t of allTeams) {
    const teamMemberSet = new Set((t.members || []).map(m => m.toString()));
    const enrollmentsForTeam = allEnrollments.filter(e =>
      e.teamId.toString() === t._id.toString() && e.status === 'Active'
    );
    const enrolledUserSet = new Set(enrollmentsForTeam.map(e => e.userId.toString()));

    // Members in team but not enrolled
    for (const m of teamMemberSet) {
      if (!enrolledUserSet.has(m)) teamNotInEnroll++;
    }
    // Enrolled but not in team.members
    for (const e of enrolledUserSet) {
      if (!teamMemberSet.has(e)) enrollNotInTeam++;
    }
  }
  if (teamNotInEnroll > 0 || enrollNotInTeam > 0) {
    issues.push({ check: 'TEAM_ENROLLMENT_SYNC', severity: 'MEDIUM', count: teamNotInEnroll + enrollNotInTeam });
    console.log(`   ⚠️  Team members without enrollment: ${teamNotInEnroll}`);
    console.log(`   ⚠️  Enrolled users not in team.members: ${enrollNotInTeam}`);
  } else {
    console.log('   ✅ Team.members and Enrollment records are in sync');
  }

  // ── CHECK 8: Schedule.enrolledUsers ↔ Team.members ──
  console.log('\n📋 CHECK 8: Schedule.enrolledUsers matches Team.members');
  let schedTeamMismatch = 0;
  for (const s of allScheds) {
    if (!s.bookedTeamId) continue;
    const team = allTeams.find(t => t._id.toString() === s.bookedTeamId.toString());
    if (!team) continue;
    const schedSet = new Set((s.enrolledUsers || []).map(u => u.toString()));
    const teamSet = new Set((team.members || []).map(m => m.toString()));
    if (schedSet.size !== teamSet.size) {
      schedTeamMismatch++;
    } else {
      for (const u of schedSet) {
        if (!teamSet.has(u)) { schedTeamMismatch++; break; }
      }
    }
  }
  if (schedTeamMismatch > 0) {
    issues.push({ check: 'SCHED_TEAM_SYNC', severity: 'LOW', count: schedTeamMismatch });
    console.log(`   ⚠️  ${schedTeamMismatch} schedule(s) have enrolledUsers different from team.members`);
  } else {
    console.log('   ✅ All Schedule.enrolledUsers match their team members');
  }

  // ── CHECK 9: Users with position '' (missingPosition from quality audit) ──
  console.log('\n📋 CHECK 9: Users missing position field');
  const noPos = allUsers.filter(u => !u.position || u.position.trim() === '');
  if (noPos.length > 0) {
    info.push({ check: 'MISSING_POSITION', count: noPos.length });
    console.log(`   ℹ️  ${noPos.length} user(s): ${noPos.map(u => u.empCode + ' (' + u.role + ')').join(', ')}`);
  } else {
    console.log('   ✅ All users have position');
  }

  // ── CHECK 10: Schedule duration consistency ──
  console.log('\n📋 CHECK 10: Schedule duration consistency');
  const durations = {};
  allScheds.forEach(s => {
    const dur = (new Date(s.endTime) - new Date(s.startTime)) / 60000;
    durations[dur + 'min'] = (durations[dur + 'min'] || 0) + 1;
  });
  console.log('   Duration distribution:', JSON.stringify(durations));
  if (Object.keys(durations).length === 1 && durations['60min']) {
    console.log('   ✅ All schedules are exactly 60 minutes');
  } else {
    issues.push({ check: 'INCONSISTENT_DURATION', severity: 'LOW', count: Object.keys(durations).length });
    console.log('   ⚠️  Non-uniform schedule durations detected');
  }

  // ══════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════
  console.log('\n' + SEP);
  console.log('  AUDIT SUMMARY');
  console.log(SEP);
  console.log(`  Total records: Users=${allUsers.length} Classes=${allClasses.length} Teams=${allTeams.length} Schedules=${allScheds.length} Attendance=${allAttendance.length} Enrollments=${allEnrollments.length}`);
  console.log(`  Checks run: 10`);
  console.log(`  Issues found: ${issues.length}`);

  if (issues.length === 0) {
    console.log('\n  ✅ ALL CHECKS PASSED — Data is consistent across the system!');
  } else {
    console.log('');
    const critical = issues.filter(i => i.severity === 'CRITICAL');
    const high = issues.filter(i => i.severity === 'HIGH');
    const medium = issues.filter(i => i.severity === 'MEDIUM');
    const low = issues.filter(i => i.severity === 'LOW');
    if (critical.length) console.log(`  🔴 CRITICAL: ${critical.map(i => i.check + '(' + i.count + ')').join(', ')}`);
    if (high.length) console.log(`  🟡 HIGH: ${high.map(i => i.check + '(' + i.count + ')').join(', ')}`);
    if (medium.length) console.log(`  🟠 MEDIUM: ${medium.map(i => i.check + '(' + i.count + ')').join(', ')}`);
    if (low.length) console.log(`  ⚪ LOW: ${low.map(i => i.check + '(' + i.count + ')').join(', ')}`);
  }

  if (info.length > 0) {
    console.log('\n  ℹ️  Info notes:');
    info.forEach(i => console.log(`     ${i.check}: ${i.count}`));
  }

  console.log(SEP);
  await mongoose.disconnect();
})();
