/**
 * TMS v2 — Seed Script
 * ─────────────────────
 * Populates the database with sample data for testing all roles
 * and the Team-based booking workflow.
 *
 * Usage: npm run seed
 *
 * Default credentials:
 *   Admin:       ADMIN001 / admin12345
 *   Teachers:    TEACH001 / teacher123, TEACH002 / teacher123
 *   Participants: PART001–PART006 / participant123
 *
 * Creates:
 *   - 9 Users (1 Admin, 2 Teachers, 6 Participants)
 *   - 2 Teams (3 members each, led by PART001 and PART004)
 *   - 2 Classes
 *   - 4 Schedules (future dates) with team enrollments
 *   - PART003 has status 'Dropped' to test auto-release
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// Import all models
const User = require('./models/User');
const Team = require('./models/Team');
const Class = require('./models/Class');
const Schedule = require('./models/Schedule');
const Attendance = require('./models/Attendance');
const Evaluation = require('./models/Evaluation');
const Counter = require('./models/Counter');

// ── Helper: future date ───────────────────────────────────
const futureDate = (daysFromNow) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d;
};

const seed = async () => {
  try {
    await connectDB();
    console.log('\n🌱 Seeding TMS v2 database...\n');

    // ── Drop all collections ──────────────────────────────
    console.log('🗑️  Clearing existing data...');
    await Promise.all([
      User.deleteMany({}),
      Team.deleteMany({}),
      Class.deleteMany({}),
      Schedule.deleteMany({}),
      Attendance.deleteMany({}),
      Evaluation.deleteMany({}),
      Counter.deleteMany({}),
    ]);

    // Pre-set counters: seed creates 9 users (000001–000009) and 2 classes (EL001–EL002)
    // so the next auto-generated IDs will be 000010 and EL003.
    await Counter.create({ _id: 'empCode', seq: 9 });
    await Counter.create({ _id: 'classCode', seq: 2 });

    // ── Create Users ──────────────────────────────────────
    console.log('👤 Creating users...');
    const admin = await User.create({
      empCode: '000001',
      name: 'Admin User',
      role: 'Admin',
      department: 'Management',
      status: 'Active',
      password: 'admin12345',
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
      name: 'Participant Vo (Dropped)',
      role: 'Participant',
      department: 'Sales',
      status: 'Active', // Will be changed to Dropped to test auto-release
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

    console.log(`   ✅ Created ${9} users`);

    // ── Create Teams ──────────────────────────────────────
    console.log('👥 Creating teams...');
    const teamA = await Team.create({
      name: 'Sales Team Alpha',
      leaderId: part1._id,
      members: [part1._id, part2._id, part3._id],
    });

    const teamB = await Team.create({
      name: 'Marketing Team Beta',
      leaderId: part4._id,
      members: [part4._id, part5._id, part6._id],
    });

    console.log(`   ✅ Created 2 teams`);

    // ── Create Classes ────────────────────────────────────
    console.log('📚 Creating classes...');
    const class1 = await Class.create({
      classCode: 'EL001',
      courseName: 'Business English - Intermediate (B1)',
      status: 'Ongoing',
    });

    const class2 = await Class.create({
      classCode: 'EL002',
      courseName: 'General English - Pre-Intermediate (A2)',
      status: 'Ongoing',
    });

    console.log(`   ✅ Created 2 classes`);

    // ── Create Schedules (future dates) ───────────────────
    console.log('📅 Creating schedules...');

    // Schedule 1: class1, 3 days from now, booked by Team A
    const sched1 = await Schedule.create({
      classId: class1._id,
      date: futureDate(3),
      timeSlot: '09:00-10:00',
      teacherId: teacher1._id,
      roomLink: 'https://meet.google.com/abc-defg-hij',
      capacity: 9,
      bookedTeamId: teamA._id,
      enrolledTeams: [teamA._id],
      enrolledUsers: [part1._id, part2._id, part3._id],
      enrolledCount: 3,
    });

    // Schedule 2: class1, 5 days from now, booked by Team B
    const sched2 = await Schedule.create({
      classId: class1._id,
      date: futureDate(5),
      timeSlot: '14:00-15:00',
      teacherId: teacher1._id,
      roomLink: 'https://meet.google.com/klm-nopq-rst',
      capacity: 9,
      bookedTeamId: teamB._id,
      enrolledTeams: [teamB._id],
      enrolledUsers: [part4._id, part5._id, part6._id],
      enrolledCount: 3,
    });

    // Schedule 3: class2, 4 days from now, booked by Team B
    const sched3 = await Schedule.create({
      classId: class2._id,
      date: futureDate(4),
      timeSlot: '10:00-11:00',
      teacherId: teacher2._id,
      roomLink: 'https://meet.google.com/uvw-xyza-bcd',
      capacity: 9,
      bookedTeamId: teamB._id,
      enrolledTeams: [teamB._id],
      enrolledUsers: [part4._id, part5._id, part6._id],
      enrolledCount: 3,
    });

    // Schedule 4: class2, 6 days from now, EMPTY (available to book)
    const sched4 = await Schedule.create({
      classId: class2._id,
      date: futureDate(6),
      timeSlot: '13:00-14:00',
      teacherId: teacher2._id,
      roomLink: '',
      capacity: 9,
    });

    // Schedule 5: class1, 4 days from now, EMPTY (available to book)
    const sched5 = await Schedule.create({
      classId: class1._id,
      date: futureDate(4),
      timeSlot: '15:00-16:00',
      teacherId: teacher1._id,
      roomLink: '',
      capacity: 9,
    });

    // Schedule 6: class2, 3 days from now, booked by Team A
    const sched6 = await Schedule.create({
      classId: class2._id,
      date: futureDate(3),
      timeSlot: '14:00-15:00',
      teacherId: teacher2._id,
      roomLink: '',
      capacity: 9,
      bookedTeamId: teamA._id,
      enrolledTeams: [teamA._id],
      enrolledUsers: [part1._id, part2._id, part3._id],
      enrolledCount: 3,
    });

    console.log(`   ✅ Created 6 schedules (4 booked, 2 empty)`);

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
    console.log('\n👥 Teams:');
    console.log('   Sales Team Alpha:     000004 (lead), 000005, 000006');
    console.log('   Marketing Team Beta:  000007 (lead), 000008, 000009');
    console.log('\n💡 Test auto-release: change 000006 status to "Dropped"');
    console.log('   → Should remove them from schedules 1 and 2');
    console.log('\n💡 Test team sync: remove 000005 from Team Alpha');
    console.log('   → Should remove them from schedules 1 and 2');
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
