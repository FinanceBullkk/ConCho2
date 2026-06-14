const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// CustomFieldDefinition — admin-defined custom fields (Studio ▸ Custom fields).
//
// Lets an org model its own data WITHOUT code changes: an admin defines extra
// fields per entity; the values are stored on the target document (phase 1:
// LearningProgram.customFields, keyed by `key`). Soft-deleted, audited via the
// domain controller. Phase 1 supports the Program entity + text/select types;
// `entities`/`types` are the extension points.
// ──────────────────────────────────────────────────────────

const entities = ['Program'];
const types = ['text', 'select'];

const customFieldDefinitionSchema = new mongoose.Schema(
  {
    entity: { type: String, enum: entities, required: true, default: 'Program' },
    // Machine key the value is stored under (snake_case). Unique per entity.
    key: {
      type: String,
      required: [true, 'Field key is required'],
      trim: true,
      lowercase: true,
      match: [/^[a-z][a-z0-9_]*$/, 'Key must be a snake_case identifier (a-z, 0-9, _)'],
    },
    label: { type: String, required: [true, 'Field label is required'], trim: true },
    type: { type: String, enum: types, default: 'text' },
    options: { type: [String], default: [] }, // choices for `select`
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One live definition per (entity, key); a deleted key can be re-created.
customFieldDefinitionSchema.index(
  { entity: 1, key: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
customFieldDefinitionSchema.index({ entity: 1, order: 1 });

customFieldDefinitionSchema.statics.enums = { entities, types };

module.exports = mongoose.model('CustomFieldDefinition', customFieldDefinitionSchema);
