/**
 * Cleanup: Remove accidentally created EL052 Foundation
 * Run: node server/scripts/cleanup_el052.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Class = require('../models/Class');
const Schedule = require('../models/Schedule');
const Counter = require('../models/Counter');

const run = async () => {
  await connectDB();

  const el052 = await Class.find({ classCode: 'EL052' }).lean();
  console.log('EL052 classes:', el052.map(c => `${c.classCode} - ${c.courseName}`));

  for (const cls of el052) {
    const count = await Schedule.countDocuments({ classId: cls._id });
    if (count === 0) {
      await Class.findByIdAndDelete(cls._id);
      console.log(`🗑️  Removed: ${cls.classCode} - ${cls.courseName}`);
    } else {
      console.log(`⚠️  Skipped: ${cls.classCode} has ${count} schedules`);
    }
  }

  // Reset counter back to 51 so real EL052 is next
  await Counter.findOneAndUpdate(
    { _id: 'classCode' },
    { $set: { seq: 51 } },
    { upsert: true }
  );
  console.log('🔢 Counter reset to 51');

  await mongoose.disconnect();
  console.log('✅ Done');
};

run().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
