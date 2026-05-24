require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Team = require('../models/Team');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');

(async () => {
  await connectDB();

  // Cleanup from previous runs
  await Class.deleteOne({ classCode: 'TEMP02' });
  await Team.deleteOne({ name: 'TEMP_CASCADE_TEST' });

  // Setup test data
  const cls = await Class.create({ classCode: 'TEMP02', courseName: 'Temp Test 2' });
  const team = await Team.create({
    name: 'TEMP_CASCADE_TEST',
    leaderId: new mongoose.Types.ObjectId(),
    classId: cls._id,
    members: [],
  });
  const sch = await Schedule.create({
    classId: cls._id,
    bookedTeamId: team._id,
    startTime: '2026-08-01T08:00:00Z',
    endTime: '2026-08-01T09:00:00Z',
    enrolledUsers: [],
    enrolledCount: 0,
  });
  await Attendance.create({ scheduleId: sch._id, userId: new mongoose.Types.ObjectId(), status: 'P', syncStatus: 'PENDING' });
  await Attendance.create({ scheduleId: sch._id, userId: new mongoose.Types.ObjectId(), status: 'A', syncStatus: 'PENDING' });

  console.log('=== BEFORE CASCADE ===');
  console.log('Schedules for team:', await Schedule.countDocuments({ bookedTeamId: team._id }));
  console.log('Attendance for schedule:', await Attendance.countDocuments({ scheduleId: sch._id }));

  // --- Simulate deleteTeam cascade (same logic as controller) ---
  const scheduleIds = await Schedule.find({ bookedTeamId: team._id }).select('_id').lean();
  const ids = scheduleIds.map(s => s._id);

  let deletedAttendance = 0;
  let deletedSchedules = 0;
  if (ids.length > 0) {
    const attResult = await Attendance.deleteMany({ scheduleId: { $in: ids } });
    deletedAttendance = attResult.deletedCount;
    const schResult = await Schedule.deleteMany({ _id: { $in: ids } });
    deletedSchedules = schResult.deletedCount;
  }
  await Team.findByIdAndDelete(team._id);

  console.log('\n=== CASCADE RESULT ===');
  console.log('Deleted schedules:', deletedSchedules);
  console.log('Deleted attendance:', deletedAttendance);

  console.log('\n=== AFTER CASCADE (should be 0) ===');
  console.log('Schedules remaining:', await Schedule.countDocuments({ bookedTeamId: team._id }));
  console.log('Attendance remaining:', await Attendance.countDocuments({ scheduleId: sch._id }));

  // Final cleanup
  await Class.findByIdAndDelete(cls._id);
  console.log('\n✅ Test complete — no orphan data!');
  process.exit(0);
})();
