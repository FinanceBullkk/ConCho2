const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Class Model
// ──────────────────────────────────────────────────────────

const classSchema = new mongoose.Schema(
  {
    classCode: {
      type: String,
      unique: true,
      trim: true,
      uppercase: true,     // Normalize at write time (matches importController)
      // Auto-generated as EL + 3-digit number (e.g. EL001) via Counter helper
    },
    courseName: {
      type: String,
      required: [true, 'Course name is required'],
      trim: true,
    },
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

// NOTE: classCode generation has been moved to the controller
// using the atomic Counter helper (helpers/counter.js).

module.exports = mongoose.model('Class', classSchema);
