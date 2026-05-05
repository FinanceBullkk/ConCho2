require('dotenv').config();
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
require('../models/Schedule');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const Schedule = mongoose.model('Schedule');
  
  // Check total counts
  const total = await Schedule.countDocuments();
  const empty = await Schedule.countDocuments({ enrolledUsers: { $size: 0 } });
  const nonEmpty = total - empty;
  console.log(`Total schedules: ${total}, Empty enrolledUsers: ${empty}, Non-empty: ${nonEmpty}`);
  
  // Sample some schedules with lean (like attendance calendar does)
  const samples = await Schedule.find()
    .limit(5)
    .lean({ virtuals: true });
  
  for (const s of samples) {
    console.log(`  Schedule ${s._id}: enrolledUsers.length=${(s.enrolledUsers||[]).length}, enrolledCount=${s.enrolledCount}`);
  }
  
  // Now test getAttendanceCalendar specifically
  const allSchedules = await Schedule.find()
    .populate('classId', 'classCode courseName totalSessions')
    .populate('bookedTeamId', 'name')
    .sort({ startTime: 1 })
    .lean({ virtuals: true });
  
  const noneCount = allSchedules.filter(s => (s.enrolledCount || 0) === 0).length;
  const hasStudents = allSchedules.filter(s => (s.enrolledCount || 0) > 0).length;
  console.log(`\nIn getAttendanceCalendar style query:`);
  console.log(`  enrolledCount=0 (none): ${noneCount}`);
  console.log(`  enrolledCount>0 (has students): ${hasStudents}`);
  
  // Check if enrolledUsers array actually has data but enrolledCount is wrong
  const mismatch = allSchedules.filter(s => {
    const arrLen = (s.enrolledUsers || []).length;
    const vc = s.enrolledCount;
    return arrLen !== vc;
  });
  console.log(`  Mismatches (enrolledUsers.length !== enrolledCount): ${mismatch.length}`);
  
  if (mismatch.length > 0) {
    console.log('  Sample mismatches:');
    mismatch.slice(0, 3).forEach(s => {
      console.log(`    ${s._id}: arr=${(s.enrolledUsers||[]).length} vc=${s.enrolledCount}`);
    });
  }
  
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
