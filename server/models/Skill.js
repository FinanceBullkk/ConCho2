const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Skill — competency framework (TMS.update gap #4).
//
// A named workforce capability that one or more LearningPrograms "build". A
// learner's proficiency in a skill is DERIVED (not stored) from how many of the
// skill's contributing programs they have completed (v1 signal = issued
// Certificate), capped at `maxLevel`. `targetByRole` declares the required
// proficiency level per SYSTEM ROLE (Admin/Coordinator/Teacher/Participant) so
// gap analysis (target − level) is real and computable from existing data.
//
// Soft-delete + audited like every other managed entity. No proficiency is
// persisted here — derivation lives in domains/skill/proficiency.js.
// ──────────────────────────────────────────────────────────

const skillSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Skill name is required'], trim: true },
    category: { type: String, trim: true, default: 'General' },
    // Optional taxonomy parent (skills-as-spine, B2). null = a top-level skill.
    // A shallow hierarchy curated by Admins; `GET /api/skills/taxonomy` nests
    // children under parents (the use-case guards against self-parenting).
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Skill', default: null },
    // Display hue (OKLCH base) for the skill chip/card — purely cosmetic.
    hue: { type: Number, default: 250 },

    // Programs that build this skill (the program→skill mapping).
    programIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LearningProgram' }],

    // Max proficiency level a learner can reach (the "/5" in the UI).
    maxLevel: { type: Number, min: [1, 'maxLevel must be at least 1'], default: 5 },

    // Required level per system role. Free-form map { roleKey: level }; 0 / absent
    // = not required for that role. Validated by the domain zod schema on write.
    targetByRole: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Optional workforce coverage target (headcount expected to hold the skill).
    // null = no explicit target → the Studio shows holders without a bar.
    coverageTarget: { type: Number, min: [1, 'coverageTarget must be at least 1'], default: null },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One live skill per name (case-insensitive enforced in the use-case).
skillSchema.index({ isDeleted: 1, category: 1, name: 1 });
skillSchema.index({ name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });

module.exports = mongoose.model('Skill', skillSchema);
