/**
 * Fix: Reset the classCode counter to match the actual max class code in the database.
 * 
 * Problem: Counter.seq is stuck at a low value (e.g. 8) while the actual
 * max classCode is EL051. This causes new cohorts to get EL009 instead of EL052.
 * 
 * Run: node server/scripts/fix_class_counter.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Counter = require('../models/Counter');
const Class = require('../models/Class');

const run = async () => {
  await connectDB();
  
  // Find the current highest class code
  const allClasses = await Class.find().select('classCode').lean();
  const maxNum = allClasses.reduce((max, c) => {
    const match = c.classCode.match(/^EL(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      return num > max ? num : max;
    }
    return max;
  }, 0);

  console.log(`📊 Current max classCode: EL${maxNum.toString().padStart(3, '0')}`);
  
  // Check current counter value
  const currentCounter = await Counter.findById('classCode').lean();
  console.log(`🔢 Current counter.seq: ${currentCounter?.seq || 'NOT SET'}`);

  if (!currentCounter || currentCounter.seq < maxNum) {
    // Reset counter to match actual max
    await Counter.findOneAndUpdate(
      { _id: 'classCode' },
      { $set: { seq: maxNum } },
      { upsert: true }
    );
    console.log(`✅ Counter reset to ${maxNum}. Next cohort will be EL${(maxNum + 1).toString().padStart(3, '0')}`);
  } else {
    console.log(`✅ Counter is already correct (${currentCounter.seq}). No fix needed.`);
  }

  await mongoose.disconnect();
};

run().catch(err => {
  console.error('❌ Fix failed:', err);
  process.exit(1);
});
