require('dotenv').config();
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
require('../models/Schedule');
require('../models/Team');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const Schedule = mongoose.model('Schedule');
  const Team = mongoose.model('Team');

  const emptySchedules = await Schedule.find({ $or: [{ enrolledUsers: { $size: 0 } }, { enrolledUsers: { $exists: false } }] })
    .select('_id bookedTeamId enrolledUsers')
    .lean();

  console.log(`Found ${emptySchedules.length} schedules with empty enrolledUsers`);

  if (emptySchedules.length === 0) {
    console.log('Nothing to backfill.');
    await mongoose.disconnect();
    return;
  }

  const teamIds = [...new Set(emptySchedules.map(s => s.bookedTeamId?.toString()).filter(Boolean))];
  const teams = await Team.find({ _id: { $in: teamIds }, isDeleted: { $ne: true } }).lean();
  const teamMap = new Map(teams.map(t => [t._id.toString(), t.members || []]));

  console.log(`Loaded ${teams.length} teams`);

  let updated = 0, skipped = 0;
  const bulkOps = [];

  for (const schedule of emptySchedules) {
    const teamIdStr = schedule.bookedTeamId?.toString();
    const members = teamMap.get(teamIdStr);
    if (!members || members.length === 0) {
      skipped++;
      continue;
    }
    bulkOps.push({
      updateOne: {
        filter: { _id: schedule._id },
        update: { $set: { enrolledUsers: members } },
      },
    });
    updated++;
  }

  if (bulkOps.length > 0) {
    const result = await Schedule.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} schedules`);
  }
  console.log(`Skipped ${skipped} (team not found or team has no members)`);

  // Verify
  const stillEmpty = await Schedule.countDocuments({ enrolledUsers: { $size: 0 } });
  console.log(`\nAfter backfill: ${stillEmpty} schedules still have empty enrolledUsers`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
