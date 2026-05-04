/**
 * Cleanup: Remove accidentally created EL008 Foundation and EL009 Business English
 * that were created during browser testing.
 * 
 * Run: node server/scripts/cleanup_test_classes.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Class = require('../models/Class');

const run = async () => {
  await connectDB();
  
  // Check what was accidentally created
  const el008 = await Class.find({ classCode: 'EL008' }).lean();
  const el009 = await Class.find({ classCode: 'EL009' }).lean();

  console.log('EL008 classes:', el008.map(c => `${c.classCode} - ${c.courseName}`));
  console.log('EL009 classes:', el009.map(c => `${c.classCode} - ${c.courseName}`));

  // Only remove Foundation from EL008 and Business English from EL009
  // if they were accidentally created and have 0 booked sessions
  const Schedule = require('../models/Schedule');
  
  for (const cls of [...el008, ...el009]) {
    const schedCount = await Schedule.countDocuments({ classId: cls._id });
    if (schedCount === 0) {
      await Class.findByIdAndDelete(cls._id);
      console.log(`🗑️  Removed: ${cls.classCode} - ${cls.courseName} (0 sessions)`);
    } else {
      console.log(`⚠️  Skipped: ${cls.classCode} - ${cls.courseName} (${schedCount} sessions)`);
    }
  }

  await mongoose.disconnect();
  console.log('✅ Cleanup complete.');
};

run().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
