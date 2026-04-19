const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Class Model
// ──────────────────────────────────────────────────────────

const classSchema = new mongoose.Schema(
  {
    classCode: {
      type: String,
      required: [true, 'Class code is required'],
      unique: true,
      trim: true,
      uppercase: true,
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

module.exports = mongoose.model('Class', classSchema);
