const { subscribe } = require('../../lib/event-bus');
const EVENTS = require('../_shared/events');
const logger = require('../../lib/logger');
const repository = require('./repository');
const { recordInApp } = require('../notification/in-app-writer');

// ──────────────────────────────────────────────────────────
// Automation runner (TMS.update gap #3). One subscriber over every catalogued
// domain event. When an event fires, ENABLED rules with a matching trigger whose
// conditions all hold execute their actions. Opt-in (rules default disabled) +
// fail-soft per rule, so the runner never breaks the publishing request and
// never double-fires existing hardcoded side-effects.
// ──────────────────────────────────────────────────────────

const getField = (payload, field) =>
  field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), payload);

const evalCondition = (cond, payload) => {
  const v = getField(payload, cond.field);
  switch (cond.op) {
    case 'eq': return v === cond.value;
    case 'ne': return v !== cond.value;
    case 'gt': return v > cond.value;
    case 'gte': return v >= cond.value;
    case 'lt': return v < cond.value;
    case 'lte': return v <= cond.value;
    case 'truthy': return Boolean(v);
    case 'falsy': return !v;
    default: return false;
  }
};

const matches = (rule, payload) => (rule.conditions || []).every((c) => evalCondition(c, payload));

// Resolve a recipient user id from the common event payload shapes.
const recipientOf = (payload) =>
  payload?.userId || payload?.enrollment?.userId || payload?.learnerId || null;

const runAction = async (action, rule, payload) => {
  if (action.type === 'notify') {
    const recipient = recipientOf(payload);
    if (!recipient) return;
    const ref = payload?.certificateNumber || payload?.enrollment?._id || 'ev';
    await recordInApp({
      type: 'automation_notice',
      recipientUserId: recipient,
      cadenceKey: `auto:${rule._id}:${recipient}:${ref}`,
      metadata: { ruleName: rule.name, message: action.params?.message || '' },
    });
  }
  // 'log' is a no-op side-effect — the run is recorded below (runCount/lastRunAt).
};

// Handle one fired event: run all matching enabled rules. Exported for tests.
const handleEvent = async (trigger, payload) => {
  let rules;
  try {
    rules = await repository.findEnabledByTrigger(trigger);
  } catch (err) {
    logger.error({ err, trigger }, 'automation: rule lookup failed');
    return;
  }
  for (const rule of rules) {
    try {
      if (!matches(rule, payload)) continue;
      for (const action of rule.actions || []) await runAction(action, rule, payload);
      await repository.recordRun(rule._id);
    } catch (err) {
      logger.error({ err, rule: rule.name }, 'automation: rule execution failed');
    }
  }
};

let registered = false;
function register() {
  if (registered) return;
  registered = true;
  Object.values(EVENTS).forEach((eventName) => {
    subscribe(eventName, (payload) => handleEvent(eventName, payload));
  });
}

module.exports = { register, handleEvent, matches, evalCondition, getField };
