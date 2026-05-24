const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Class Model (v2 — Cohort / Matrix Architecture)
// ──────────────────────────────────────────────────────────
// A Class is identified by {classCode + courseName}.
// classCode = Cohort identifier (e.g. EL001)
// courseName = one of 6 fixed courses
//
// One classCode can have many courses (but not at the same
// time — they are sequential). Teams are assigned to the
// currently active class record.
// ──────────────────────────────────────────────────────────



const classSchema = new mongoose.Schema(
  {
    classCode: {
      type: String,
      trim: true,
      uppercase: true,
      required: [true, 'Class code is required'],
      // NOT unique — multiple courses share the same classCode
    },
    courseName: {
      type: String,
      required: [true, 'Course name is required'],
      trim: true,
      validate: {
        validator: async function(value) {
          const Setting = mongoose.model('Setting');
          const setting = await Setting.findOne({ key: 'COURSE_SESSIONS' });
          if (!setting || !setting.value) return true; // fail open if no setting
          return Object.keys(setting.value).includes(value);
        },
        message: '{VALUE} is not a valid course name',
      },
    },
    totalSessions: {
      type: Number,
      required: true,
      min: [1, 'Must have at least 1 session'],
    },
    // NOTE: bookedSessions was removed (UX-04) — it was never updated
    // by any controller. The actual count is computed on-the-fly via
    // Schedule.countDocuments({ classId }) wherever needed.
    status: {
      type: String,
      enum: {
        values: ['Ongoing', 'Completed'],
        message: '{VALUE} is not a valid class status',
      },
      default: 'Ongoing',
    },
  },
  {
    timestamps: true,
  }
);

// ── Compound Unique Index ─────────────────────────────────
// One classCode can only have ONE instance of each course.
classSchema.index({ classCode: 1, courseName: 1 }, { unique: true });

// DATA-002 (audit PR 6): at most ONE Ongoing class per classCode.
// Previously two concurrent POST /api/classes with the same classCode
// could both pass the controller-level `findOne` check and insert,
// leaving two Ongoing cohorts for the same code. Mongo enforces this
// at the storage engine level — the second insert fails with E11000,
// which controllers already convert to a 409 response.
//
// NOTE on data migration: any pre-existing duplicates would cause
// `db.classes.createIndex` to fail at build time. Production rollout
// must be preceded by a dedup pass:
//   db.classes.aggregate([
//     { $match: { status: 'Ongoing' } },
//     { $group: { _id: '$classCode', n: { $sum: 1 } } },
//     { $match: { n: { $gt: 1 } } },
//   ])
// Resolve manually before deploying this PR to prod.
classSchema.index(
  { classCode: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'Ongoing' } },
);

// No static COURSE_SESSIONS exported anymore (fetch from Setting)

// NOTE: classCode generation has been moved to the controller
// using the atomic Counter helper (helpers/counter.js).

module.exports = mongoose.model('Class', classSchema);
