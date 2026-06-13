const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// LearningProgram
// ──────────────────────────────────────────────────────────
// Catalog-level training definition for the L&D platform.
//
// Legacy English courses map here first; existing Class documents stay
// physically stored as classes and link through Class.programId.
// ──────────────────────────────────────────────────────────

const schedulingModes = ['leader_booking', 'admin_scheduled', 'self_enroll', 'nomination'];
const deliveryModes = ['online', 'offline', 'hybrid'];
const categories = ['english', 'onboarding', 'compliance', 'soft_skills', 'technical', 'workshop', 'other'];
const statuses = ['active', 'inactive', 'archived'];

const learningProgramSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Program code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z0-9][A-Z0-9_-]*$/, 'Program code may contain only A-Z, 0-9, underscore, and hyphen'],
    },
    name: {
      type: String,
      required: [true, 'Program name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      enum: categories,
      default: 'other',
    },
    defaultSessionCount: {
      type: Number,
      min: [1, 'Program must have at least 1 session'],
      default: 1,
    },
    deliveryMode: {
      type: String,
      enum: deliveryModes,
      default: 'online',
    },
    schedulingMode: {
      type: String,
      enum: schedulingModes,
      default: 'admin_scheduled',
    },
    completionPolicy: {
      attendanceThresholdPercent: { type: Number, min: 0, max: 100, default: 0 },
      requiresAssessment: { type: Boolean, default: false },
      requiresFeedback: { type: Boolean, default: false },
    },
    certificateValidityDays: {
      type: Number,
      min: [1, 'Certificate validity days must be at least 1'],
      default: null,
    },
    capacityPolicy: {
      maxParticipants: { type: Number, min: 1, default: null },
      maxParticipantsPerSession: { type: Number, min: 1, default: null },
    },
    facilitatorPolicy: {
      assignmentRequired: { type: Boolean, default: false },
      visibility: {
        type: String,
        enum: ['all_facilitators', 'assigned_only'],
        default: 'all_facilitators',
      },
    },
    // Recertification (D6): when autoAssign is true, an expiring certificate for
    // this program auto-creates a recert Assignment for the learner (signal →
    // action). Opt-in; default off = no behaviour change.
    recertifyPolicy: {
      autoAssign: { type: Boolean, default: false },
    },
    // Programs a learner must complete before enrolling in this one (Wave C —
    // prerequisite gating). Direct prerequisites only; enforced for self-enroll
    // (admins may override). Transitive paths/cycle detection deferred.
    prerequisitePrograms: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LearningProgram' }],
      default: [],
    },
    status: {
      type: String,
      enum: statuses,
      default: 'active',
    },
    legacyCourseName: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
  },
  { timestamps: true }
);

learningProgramSchema.index({ status: 1, category: 1, name: 1 });
learningProgramSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

learningProgramSchema.statics.enums = {
  schedulingModes,
  deliveryModes,
  categories,
  statuses,
};

module.exports = mongoose.model('LearningProgram', learningProgramSchema);
