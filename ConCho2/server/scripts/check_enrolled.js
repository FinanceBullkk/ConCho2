require('dotenv').config();
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
  
  // Sample some schedules — use plain .lean() and derive count from array length
  // (enrolledCount is a virtual that may not survive lean without plugin support)
  const samples = await Schedule.find().limit(5).lean();

  for (const s of samples) {
    const count = (s.enrolledUsers || []).length;
    console.log(`  Schedule ${s._id}: enrolledUsers.length=${count}`);
  }

  // Query in the style of getAttendanceCalendar
  const allSchedules = await Schedule.find()
    .populate('classId', 'classCode courseName totalSessions')
    .populate('bookedTeamId', 'name')
    .sort({ startTime: 1 })
    .lean();

  const noneCount    = allSchedules.filter(s => (s.enrolledUsers || []).length === 0).length;
  const hasStudents  = allSchedules.filter(s => (s.enrolledUsers || []).length > 0).length;
  console.log(`\nIn getAttendanceCalendar style query:`);
  console.log(`  enrolledUsers.length=0 (none): ${noneCount}`);
  console.log(`  enrolledUsers.length>0 (has students): ${hasStudents}`);
  
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
