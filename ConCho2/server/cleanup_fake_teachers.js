/**
 * Cleanup Script — Remove Fake "Teacher" Users
 * ──────────────────────────────────────────────
 * During data import, PIC (Person In Charge) names were
 * mistakenly created as User records with role "Teacher".
 * These are NOT real teachers — they have no department
 * and high auto-generated empCodes (000198+).
 *
 * Real teachers (000002, 000003) are preserved.
 *
 * Usage: node cleanup_fake_teachers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');

async function main() {
  await connectDB();
  console.log('\n🧹 Cleanup: Fake Teacher Users\n');

  // Find all Teacher-role users with NO department (= fake PIC imports)
  const fakeTeachers = await User.find({
    role: 'Teacher',
    $or: [
      { department: { $exists: false } },
      { department: null },
      { department: '' },
    ],
  }).select('empCode name department status').lean();

  if (fakeTeachers.length === 0) {
    console.log('✅ No fake Teacher users found. Nothing to clean up.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${fakeTeachers.length} fake Teacher user(s):\n`);
  fakeTeachers.forEach(u => {
    console.log(`  ${u.empCode}  ${u.name.padEnd(20)}  dept: "${u.department || '—'}"  status: ${u.status}`);
  });

  // Safety: double-check none of them are 000002 or 000003
  const realCodes = new Set(['000002', '000003']);
  const toDelete = fakeTeachers.filter(u => !realCodes.has(u.empCode));

  if (toDelete.length !== fakeTeachers.length) {
    console.log('\n⚠️  WARNING: Some real teachers matched — they will be SKIPPED.');
  }

  const ids = toDelete.map(u => u._id);

  // Check if any of these users are referenced as team leaders or members
  const Team = require('./models/Team');
  const leaderRefs = await Team.find({ leaderId: { $in: ids } }).select('name leaderId').lean();
  const memberRefs = await Team.find({ members: { $in: ids } }).select('name').lean();

  if (leaderRefs.length > 0) {
    console.log(`\n⚠️  ${leaderRefs.length} fake teacher(s) are team leaders — will clean team refs.`);
  }
  if (memberRefs.length > 0) {
    console.log(`⚠️  ${memberRefs.length} team(s) reference fake teachers as members — will clean.`);
  }

  // Delete in a transaction
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Pull from team members
      if (ids.length > 0) {
        await Team.updateMany(
          { members: { $in: ids } },
          { $pull: { members: { $in: ids } } },
          { session }
        );
      }

      // Delete the fake users
      const result = await User.deleteMany({ _id: { $in: ids } }, { session });
      console.log(`\n🗑️  Deleted ${result.deletedCount} fake Teacher user(s).`);
    });
  } finally {
    session.endSession();
  }

  // Verify
  const remaining = await User.countDocuments({ role: 'Teacher' });
  console.log(`✅ Remaining Teacher users: ${remaining}`);

  await mongoose.disconnect();
  console.log('🏁 Done.\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
