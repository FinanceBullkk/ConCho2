const { z } = require('zod');
const EVENTS = require('../_shared/events');

// Admins can only author rules on CATALOGUED (publishable) triggers; seeded
// system rules may reference future triggers for documentation (they bypass zod).
const TRIGGERS = Object.values(EVENTS);
const ACTION_TYPES = ['notify', 'log'];

const condition = z.object({
  field: z.string().trim().min(1).max(60),
  op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'truthy', 'falsy']).default('eq'),
  value: z.any().optional().default(null),
});
const action = z.object({
  type: z.enum(ACTION_TYPES),
  params: z.record(z.string(), z.any()).optional().default({}),
});

const createBody = z.object({
  name: z.string().trim().min(1).max(80),
  trigger: z.enum(TRIGGERS),
  conditions: z.array(condition).max(10).optional().default([]),
  actions: z.array(action).min(1).max(10),
  enabled: z.boolean().optional().default(false),
});

const updateBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  conditions: z.array(condition).max(10).optional(),
  actions: z.array(action).min(1).max(10).optional(),
  enabled: z.boolean().optional(),
}).refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });

module.exports = { createBody, updateBody, TRIGGERS, ACTION_TYPES };
