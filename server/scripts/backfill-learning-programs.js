/**
 * Backfill LearningProgram catalog from legacy COURSE_SESSIONS and link
 * existing Class documents through programId.
 *
 * Usage:
 *   cd server && node scripts/backfill-learning-programs.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Class = require('../models/Class');
const learningUseCases = require('../domains/learning/use-cases');

async function run() {
  await connectDB();

  const programs = await learningUseCases.backfillProgramsFromCourseSettings();
  let linked = 0;

  for (const program of programs) {
    if (!program.legacyCourseName) continue;
    const result = await Class.updateMany(
      { courseName: program.legacyCourseName, programId: null },
      { $set: { programId: program._id } }
    );
    linked += result.modifiedCount || 0;
  }

  console.log(JSON.stringify({
    success: true,
    programs: programs.length,
    linkedClasses: linked,
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
