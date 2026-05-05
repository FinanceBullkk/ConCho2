require('dotenv').config();
const connectDB = require('../config/db');
const mongoose = require('mongoose');

const User = require('../models/User');
const Team = require('../models/Team');
const Class = require('../models/Class');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const Evaluation = require('../models/Evaluation');

(async () => {
  await connectDB();
  const report = {};

  // ═══════════════════════════════════════════════════════════
  // 1. USER DATA QUALITY
  // ═══════════════════════════════════════════════════════════
  const allUsers = await User.find({}).select('+isDeleted').lean();
  const userIssues = {
    total: allUsers.length,
    missingName: allUsers.filter(u => !u.name || u.name.trim() === '').length,
    missingEmpCode: allUsers.filter(u => !u.empCode).length,
    duplicateEmpCodes: 0,
    invalidRole: allUsers.filter(u => !['Admin', 'Teacher', 'Participant'].includes(u.role)).length,
    invalidStatus: allUsers.filter(u => !['Active', 'Inactive', 'Dropped', 'Transferred', 'On-hold', 'Waiting for class'].includes(u.status)).length,
    missingDepartment: allUsers.filter(u => !u.department || u.department.trim() === '').length,
    missingPosition: allUsers.filter(u => !u.position || u.position.trim() === '').length,
    softDeleted: allUsers.filter(u => u.isDeleted).length,
    statusBreakdown: {},
    roleBreakdown: {},
  };

  // Duplicate empCodes
  const empCodeMap = {};
  allUsers.forEach(u => {
    if (u.empCode) {
      empCodeMap[u.empCode] = (empCodeMap[u.empCode] || 0) + 1;
    }
  });
  userIssues.duplicateEmpCodes = Object.values(empCodeMap).filter(v => v > 1).length;

  // Status/role breakdown
  allUsers.forEach(u => {
    userIssues.statusBreakdown[u.status] = (userIssues.statusBreakdown[u.status] || 0) + 1;
    userIssues.roleBreakdown[u.role] = (userIssues.roleBreakdown[u.role] || 0) + 1;
  });

  report.users = userIssues;

  // ═══════════════════════════════════════════════════════════
  // 2. CLASS DATA QUALITY  
  // ═══════════════════════════════════════════════════════════
  const allClasses = await Class.find({}).lean();
  const classIssues = {
    total: allClasses.length,
    missingClassCode: allClasses.filter(c => !c.classCode).length,
    missingCourseName: allClasses.filter(c => !c.courseName).length,
    missingTotalSessions: allClasses.filter(c => !c.totalSessions || c.totalSessions <= 0).length,
    invalidStatus: allClasses.filter(c => !['Ongoing', 'Completed'].includes(c.status)).length,
    zeroSessions: allClasses.filter(c => c.totalSessions === 0).length,
    statusBreakdown: {},
    courseBreakdown: {},
  };

  allClasses.forEach(c => {
    classIssues.statusBreakdown[c.status] = (classIssues.statusBreakdown[c.status] || 0) + 1;
    classIssues.courseBreakdown[c.courseName] = (classIssues.courseBreakdown[c.courseName] || 0) + 1;
  });

  report.classes = classIssues;

  // ═══════════════════════════════════════════════════════════
  // 3. TEAM DATA QUALITY
  // ═══════════════════════════════════════════════════════════
  const allTeams = await Team.find({}).select('+isDeleted').lean();
  const validUserIds = new Set(allUsers.map(u => u._id.toString()));
  const validClassIds = new Set(allClasses.map(c => c._id.toString()));

  const teamIssues = {
    total: allTeams.length,
    missingName: allTeams.filter(t => !t.name || t.name.trim() === '').length,
    missingLeader: allTeams.filter(t => !t.leaderId).length,
    orphanedLeader: allTeams.filter(t => t.leaderId && !validUserIds.has(t.leaderId.toString())).length,
    missingClassId: allTeams.filter(t => !t.classId).length,
    orphanedClassId: allTeams.filter(t => t.classId && !validClassIds.has(t.classId.toString())).length,
    emptyMembers: allTeams.filter(t => !t.members || t.members.length === 0).length,
    orphanedMembers: 0,
    softDeleted: allTeams.filter(t => t.isDeleted).length,
  };

  // Check orphaned members
  let orphanedMemberCount = 0;
  allTeams.forEach(t => {
    (t.members || []).forEach(m => {
      if (!validUserIds.has(m.toString())) orphanedMemberCount++;
    });
  });
  teamIssues.orphanedMembers = orphanedMemberCount;

  report.teams = teamIssues;

  // ═══════════════════════════════════════════════════════════
  // 4. SCHEDULE DATA QUALITY
  // ═══════════════════════════════════════════════════════════
  const allSchedules = await Schedule.find({}).lean();
  const validTeamIds = new Set(allTeams.map(t => t._id.toString()));

  const schedIssues = {
    total: allSchedules.length,
    missingClassId: allSchedules.filter(s => !s.classId).length,
    missingTeamId: allSchedules.filter(s => !s.bookedTeamId).length,
    orphanedClassId: allSchedules.filter(s => s.classId && !validClassIds.has(s.classId.toString())).length,
    orphanedTeamId: allSchedules.filter(s => s.bookedTeamId && !validTeamIds.has(s.bookedTeamId.toString())).length,
    missingStartTime: allSchedules.filter(s => !s.startTime).length,
    missingEndTime: allSchedules.filter(s => !s.endTime).length,
    invalidTimeRange: allSchedules.filter(s => s.startTime && s.endTime && new Date(s.startTime) >= new Date(s.endTime)).length,
    orphanedEnrolledUsers: 0,
    timeSlotDistribution: {},
  };

  // Check orphaned enrolled users
  let orphanedEnrolled = 0;
  allSchedules.forEach(s => {
    (s.enrolledUsers || []).forEach(u => {
      if (!validUserIds.has(u.toString())) orphanedEnrolled++;
    });
  });
  schedIssues.orphanedEnrolledUsers = orphanedEnrolled;

  // Time slot irregularity check
  const slotPattern = {};
  allSchedules.forEach(s => {
    if (s.startTime && s.endTime) {
      const start = new Date(s.startTime);
      const end = new Date(s.endTime);
      const mins = start.getMinutes();
      if (mins !== 0) slotPattern['non-zero-minutes'] = (slotPattern['non-zero-minutes'] || 0) + 1;
      const durationMin = (end - start) / 60000;
      slotPattern[`${durationMin}min`] = (slotPattern[`${durationMin}min`] || 0) + 1;
    }
  });
  schedIssues.timeSlotDistribution = slotPattern;

  report.schedules = schedIssues;

  // ═══════════════════════════════════════════════════════════
  // 5. ATTENDANCE DATA QUALITY
  // ═══════════════════════════════════════════════════════════
  const validScheduleIds = new Set(allSchedules.map(s => s._id.toString()));
  const attCount = await Attendance.countDocuments();
  const attSample = await Attendance.find().limit(5000).lean();
  
  const attIssues = {
    total: attCount,
    sampleSize: attSample.length,
    orphanedScheduleId: attSample.filter(a => !validScheduleIds.has(a.scheduleId.toString())).length,
    orphanedUserId: attSample.filter(a => !validUserIds.has(a.userId.toString())).length,
    invalidStatus: attSample.filter(a => !['P', 'A', 'L', 'EL'].includes(a.status)).length,
    statusBreakdown: {},
  };

  attSample.forEach(a => {
    attIssues.statusBreakdown[a.status] = (attIssues.statusBreakdown[a.status] || 0) + 1;
  });

  report.attendance = attIssues;

  // ═══════════════════════════════════════════════════════════
  // 6. ENROLLMENT DATA QUALITY
  // ═══════════════════════════════════════════════════════════
  const allEnrollments = await Enrollment.find().lean();

  const enrollIssues = {
    total: allEnrollments.length,
    orphanedUserId: allEnrollments.filter(e => !validUserIds.has(e.userId.toString())).length,
    orphanedTeamId: allEnrollments.filter(e => !validTeamIds.has(e.teamId.toString())).length,
    orphanedClassId: allEnrollments.filter(e => e.classId && !validClassIds.has(e.classId.toString())).length,
    nullClassId: allEnrollments.filter(e => !e.classId).length,
    statusBreakdown: {},
  };

  allEnrollments.forEach(e => {
    enrollIssues.statusBreakdown[e.status] = (enrollIssues.statusBreakdown[e.status] || 0) + 1;
  });

  report.enrollments = enrollIssues;

  // ═══════════════════════════════════════════════════════════
  // PRINT FULL REPORT
  // ═══════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  console.log('   TMS DATA QUALITY AUDIT REPORT');
  console.log('   Generated:', new Date().toISOString());
  console.log('═'.repeat(60));

  for (const [collection, data] of Object.entries(report)) {
    console.log(`\n── ${collection.toUpperCase()} ${'─'.repeat(50 - collection.length)}`);
    for (const [key, val] of Object.entries(data)) {
      if (typeof val === 'object') {
        console.log(`   ${key}:`);
        for (const [k, v] of Object.entries(val)) {
          console.log(`      ${k}: ${v}`);
        }
      } else {
        const flag = (key !== 'total' && key !== 'sampleSize' && val > 0 && key.match(/missing|orphan|invalid|duplicate/i)) ? ' ⚠️' : '';
        console.log(`   ${key}: ${val}${flag}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(60));
  process.exit(0);
})();
