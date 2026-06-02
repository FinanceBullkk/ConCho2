/**
 * TMS v2 — Seed Script (v2 — Leader-Created Sessions)
 * ─────────────────────────────────────────────────────
 * Populates the database with sample data for testing.
 *
 * NEW FLOW: Each Team is assigned a Class (1:1).
 * Team Leaders CREATE schedules by picking time slots.
 * Schedules use startTime/endTime (Date) instead of date+timeSlot.
 *
 * Usage: npm run seed
 *
 * Default credentials:
 *   Admin:        000001 / admin12345
 *   Teachers:     000002 / teacher123, 000003 / teacher123
 *   Participants: 000004–000009 / participant123
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Import all models
const User = require('../models/User');
const Team = require('../models/Team');
const Class = require('../models/Class');
const LearningProgram = require('../models/LearningProgram');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Evaluation = require('../models/Evaluation');
const Enrollment = require('../models/Enrollment');
const Counter = require('../models/Counter');
const Setting = require('../models/Setting');

// ── Helper: future date + time ────────────────────────────
const futureDateTime = (daysFromNow, hour, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
};

const dangerousScriptGuard = require('./lib/dangerousScriptGuard');

const seed = async () => {
  try {
    await connectDB();
    dangerousScriptGuard({ scriptName: 'seed.js — drops ALL collections', mongoose });
    console.log('\n🌱 Seeding TMS v2 database...\n');

    // ── Drop all collections ──────────────────────────────
    // Drop collections to clear old indexes
    console.log('🗑️  Dropping collections to clear data and old indexes...');
    const dropIfExists = async (model) => {
      try { await model.collection.drop(); } catch (e) { /* ignore collection not found */ }
    };
    await Promise.all([
      dropIfExists(User),
      dropIfExists(Team),
      dropIfExists(Class),
      dropIfExists(LearningProgram),
      dropIfExists(Schedule),
      dropIfExists(Attendance),
      dropIfExists(Evaluation),
      dropIfExists(Enrollment),
      dropIfExists(Counter),
      dropIfExists(Setting),
    ]);

    // Pre-set counters
    await Counter.create({ _id: 'empCode', seq: 9 });
    await Counter.create({ _id: 'classCode', seq: 2 });

    console.log('⚙️ Creating settings...');
    await Setting.create([
      {
        key: 'ALLOWED_TIME_SLOTS',
        description: 'Các khung giờ được phép đặt lịch (24h format)',
        value: [
          { sh: 10, sm: 0, eh: 11, em: 0 },
          { sh: 11, sm: 0, eh: 12, em: 0 },
          { sh: 13, sm: 0, eh: 14, em: 0 },
          { sh: 14, sm: 0, eh: 15, em: 0 },
          { sh: 15, sm: 0, eh: 16, em: 0 },
        ],
      },
      {
        key: 'COURSE_SESSIONS',
        description: 'Cấu hình số buổi học mặc định cho từng khóa học',
        value: {
          'Foundation': 16,
          'Extension of Foundation': 16,
          'Communication 1': 10,
          'Communication 2': 16,
          'Communication 3': 16,
          'Business English': 16,
        },
      }
    ]);

    console.log('📘 Creating learning programs...');
    const businessEnglishProgram = await LearningProgram.create({
      code: 'ENG_BUSINESS_ENGLISH',
      name: 'Business English',
      category: 'english',
      defaultSessionCount: 16,
      deliveryMode: 'online',
      schedulingMode: 'leader_booking',
      completionPolicy: { attendanceThresholdPercent: 0, requiresAssessment: true, requiresFeedback: false },
      legacyCourseName: 'Business English',
    });
    const communication2Program = await LearningProgram.create({
      code: 'ENG_COMMUNICATION_2',
      name: 'Communication 2',
      category: 'english',
      defaultSessionCount: 16,
      deliveryMode: 'online',
      schedulingMode: 'leader_booking',
      completionPolicy: { attendanceThresholdPercent: 0, requiresAssessment: true, requiresFeedback: false },
      legacyCourseName: 'Communication 2',
    });

    // ── Create Users ──────────────────────────────────────
    console.log('👤 Creating users...');
    const admin = await User.create({
      empCode: '000001',
      name: 'Admin User',
      role: 'Admin',
      department: 'Management',
      status: 'Active',
      password: 'admin12345',
      mustChangePassword: true, // Force password change on first login (SEC-04)
    });

    const teacher1 = await User.create({
      empCode: '000002',
      name: 'Teacher Nguyen',
      role: 'Teacher',
      department: 'English Department',
      status: 'Active',
      password: 'teacher123',
    });

    const teacher2 = await User.create({
      empCode: '000003',
      name: 'Teacher Tran',
      role: 'Teacher',
      department: 'English Department',
      status: 'Active',
      password: 'teacher123',
    });

    const part1 = await User.create({
      empCode: '000004',
      name: 'Participant Le (Team Lead A)',
      role: 'Participant',
      department: 'Sales',
      status: 'Active',
      password: 'participant123',
    });

    const part2 = await User.create({
      empCode: '000005',
      name: 'Participant Pham',
      role: 'Participant',
      department: 'Sales',
      status: 'Active',
      password: 'participant123',
    });

    const part3 = await User.create({
      empCode: '000006',
      name: 'Participant Vo',
      role: 'Participant',
      department: 'Sales',
      status: 'Active',
      password: 'participant123',
    });

    const part4 = await User.create({
      empCode: '000007',
      name: 'Participant Hoang (Team Lead B)',
      role: 'Participant',
      department: 'Marketing',
      status: 'Active',
      password: 'participant123',
    });

    const part5 = await User.create({
      empCode: '000008',
      name: 'Participant Do',
      role: 'Participant',
      department: 'Marketing',
      status: 'Active',
      password: 'participant123',
    });

    const part6 = await User.create({
      empCode: '000009',
      name: 'Participant Bui',
      role: 'Participant',
      department: 'Marketing',
      status: 'On-hold',
      password: 'participant123',
    });

    console.log(`   ✅ Created 9 users`);

    // ── Create Classes ────────────────────────────────────
    console.log('📚 Creating classes...');
    const class1 = await Class.create({
      classCode: 'EL001',
      courseName: 'Business English',
      programId: businessEnglishProgram._id,
      totalSessions: 16,
      status: 'Ongoing',
    });

    const class2 = await Class.create({
      classCode: 'EL002',
      courseName: 'Communication 2',
      programId: communication2Program._id,
      totalSessions: 16,
      status: 'Ongoing',
    });

    console.log(`   ✅ Created 2 classes`);

    // ── Create Teams (now with classId — 1:1 mapping) ─────
    console.log('👥 Creating teams...');
    const teamA = await Team.create({
      name: 'Sales Team Alpha',
      classId: class1._id,     // Team Alpha → EL001
      leaderId: part1._id,
      members: [part1._id, part2._id, part3._id],
    });

    const teamB = await Team.create({
      name: 'Marketing Team Beta',
      classId: class2._id,     // Team Beta → EL002
      leaderId: part4._id,
      members: [part4._id, part5._id, part6._id],
    });

    console.log(`   ✅ Created 2 teams (each assigned to a class)`);

    // ── Create Enrollment records for initial members ──────
    console.log('📋 Creating enrollment records...');
    const now = new Date();
    await Enrollment.insertMany([
      { userId: part1._id, teamId: teamA._id, classId: class1._id, joinedAt: now, status: 'Active' },
      { userId: part2._id, teamId: teamA._id, classId: class1._id, joinedAt: now, status: 'Active' },
      { userId: part3._id, teamId: teamA._id, classId: class1._id, joinedAt: now, status: 'Active' },
      { userId: part4._id, teamId: teamB._id, classId: class2._id, joinedAt: now, status: 'Active' },
      { userId: part5._id, teamId: teamB._id, classId: class2._id, joinedAt: now, status: 'Active' },
      { userId: part6._id, teamId: teamB._id, classId: class2._id, joinedAt: now, status: 'Active' },
    ]);
    console.log(`   ✅ Created 6 enrollment records`);

    // ── Create Schedules (using startTime/endTime) ────────
    console.log('📅 Creating schedules...');

    // Team A created 2 sessions this week
    await Schedule.create({
      classId: class1._id,
      bookedTeamId: teamA._id,
      startTime: futureDateTime(3, 10, 0),   // +3 days, 10:00
      endTime: futureDateTime(3, 11, 0),     // +3 days, 11:00
      enrolledUsers: [part1._id, part2._id, part3._id],
    });

    await Schedule.create({
      classId: class1._id,
      bookedTeamId: teamA._id,
      startTime: futureDateTime(3, 14, 0),   // +3 days, 14:00
      endTime: futureDateTime(3, 15, 0),     // +3 days, 15:00
      enrolledUsers: [part1._id, part2._id, part3._id],
    });

    // Team B created 1 session this week (has 1 more slot available)
    await Schedule.create({
      classId: class2._id,
      bookedTeamId: teamB._id,
      startTime: futureDateTime(4, 10, 0),   // +4 days, 10:00
      endTime: futureDateTime(4, 11, 0),     // +4 days, 11:00
      enrolledUsers: [part4._id, part5._id, part6._id],
    });

    console.log(`   ✅ Created 3 schedules (Team A: 2, Team B: 1)`);

    // ── Summary ───────────────────────────────────────────
    console.log('\n════════════════════════════════════════');
    console.log('  🎉 Seed complete!');
    console.log('════════════════════════════════════════');
    console.log('\n📊 Summary:');
    console.log(`   Users:      ${await User.countDocuments()}`);
    console.log(`   Teams:      ${await Team.countDocuments()}`);
    console.log(`   Classes:    ${await Class.countDocuments()}`);
    console.log(`   Schedules:  ${await Schedule.countDocuments()}`);
    console.log('\n🔑 Login credentials:');
    console.log('   Admin:       000001 / admin12345');
    console.log('   Teachers:    000002 / teacher123');
    console.log('                000003 / teacher123');
    console.log('   Participants: 000004–000009 / participant123');
    console.log('\n👥 Teams (with assigned classes):');
    console.log('   Sales Team Alpha → EL001:     000004 (lead), 000005, 000006');
    console.log('   Marketing Team Beta → EL002:  000007 (lead), 000008, 000009');
    console.log('\n📅 Schedules:');
    console.log('   Team Alpha: 2 sessions (at weekly limit)');
    console.log('   Team Beta:  1 session  (can book 1 more)');
    console.log('');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    console.error(error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

seed();
