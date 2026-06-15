const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// AutomationRule — no-code "when → if → then" automation (TMS.update gap #3).
//
// A rule fires when its `trigger` domain event publishes on lib/event-bus AND
// every `condition` matches the event payload; then each `action` runs. Rules
// are OPT-IN (`enabled` defaults false) so adding/seeding one never changes
// behaviour until an admin turns it on — and the runner never double-fires the
// existing hardcoded side-effects. Audited; `runCount` tracks executions.
// ──────────────────────────────────────────────────────────

// Conditions are simple payload predicates: payload[field] <op> value.
const conditionSchema = new mongoose.Schema({
  field: { type: String, required: true, trim: true },
  op: { type: String, enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy'], default: 'eq' },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

// Actions the runner can execute. Kept additive + safe for now (notify/log);
// richer types (email/issue-cert/assign) are a documented follow-up.
const actionSchema = new mongoose.Schema({
  type: { type: String, enum: ['notify', 'log'], required: true },
  params: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const automationRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Rule name is required'], trim: true },
    // A catalogued domain-event name (domains/_shared/events.js values).
    trigger: { type: String, required: [true, 'Trigger is required'], trim: true },
    conditions: { type: [conditionSchema], default: [] },
    actions: { type: [actionSchema], default: [] },
    enabled: { type: Boolean, default: false },
    runCount: { type: Number, default: 0 },
    lastRunAt: { type: Date, default: null },
    // Seeded built-in rules (the §9 flows) — kept on reseed, not deletable.
    system: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

automationRuleSchema.index({ isDeleted: 1, enabled: 1, trigger: 1 });
// One live system rule per name (idempotent seeding).
automationRuleSchema.index({ name: 1 }, { unique: true, partialFilterExpression: { system: true, isDeleted: false } });

module.exports = mongoose.model('AutomationRule', automationRuleSchema);
