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
    // ── Teacher-class binding (audit PR 5 — AUTHZ-001) ───────────────
    // The list of teachers assigned to this class. When empty (legacy /
    // unbacked classes) the policy module is permissive — any Teacher
    // can read/write attendance + evaluations against this class. Once
    // populated, only listed teachers can.
    //
    // This is a graceful-migration design: existing classes continue to
    // work; admins enforce binding by editing teacherIds on each class.
    // See docs/audit/findings.md → AUTHZ-001 + scripts/migrate-teacherIds.js
    // for the recommended backfill heuristic.
    teacherIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// ── Compound Unique Index ─────────────────────────────────
// One classCode can only have ONE instance of each course.
classSchema.index({ classCode: 1, courseName: 1 }, { unique: true });

// Multikey index — reverse lookup "which classes does Teacher X teach?".
// Used by the policy module and future Teacher dashboard scoping.
classSchema.index({ teacherIds: 1 });

// No static COURSE_SESSIONS exported anymore (fetch from Setting)

// NOTE: classCode generation has been moved to the controller
// using the atomic Counter helper (helpers/counter.js).

module.exports = mongoose.model('Class', classSchema);
