// Shared config + payload mapping for the Program / Delivery Builder.
// Single source of truth for the enums, delivery-profile metadata, the wizard
// step order, and the form ⇄ API payload shape. Keeping this here lets the
// orchestrator (ProgramFormModal) and the step components stay thin and DRY.

import { CalendarCheck, UserCog, Compass, ClipboardList } from 'lucide-react';

// Enums — mirror server/models/LearningProgram.js exactly.
export const CATEGORIES = ['english', 'onboarding', 'compliance', 'soft_skills', 'technical', 'workshop', 'other'];
export const DELIVERY = ['online', 'offline', 'hybrid'];
export const STATUSES = ['active', 'inactive', 'archived'];
export const FACILITATOR_VISIBILITY = ['all_facilitators', 'assigned_only'];

// The builder presents `schedulingMode` (the field the server gates every
// session-create path on — domains/schedule/scheduling-mode-policy.js) as a
// friendly "delivery profile" picker. icon + key only; labels/descriptions are
// resolved via i18n (learning.scheduling.* + learning.builder.schedulingDesc.*).
export const DELIVERY_PROFILES = [
  { key: 'leader_booking', icon: CalendarCheck },
  { key: 'admin_scheduled', icon: UserCog },
  { key: 'self_enroll', icon: Compass },
  { key: 'nomination', icon: ClipboardList },
];

// Wizard steps, in order.
export const STEP_KEYS = ['basics', 'delivery', 'completion', 'certificate', 'review'];

// Defaults for a brand-new program. Number inputs use '' for "no value" so they
// stay controlled; the payload mapper turns '' → null (no limit / never expires).
export const blank = {
  code: '', name: '', description: '', category: 'other',
  schedulingMode: 'admin_scheduled', deliveryMode: 'online',
  defaultSessionCount: 1, status: 'active', prerequisitePrograms: [],
  completionPolicy: { attendanceThresholdPercent: 0, requiresAssessment: false, requiresFeedback: false },
  certificateValidityDays: '',
  capacityPolicy: { maxParticipants: '', maxParticipantsPerSession: '' },
  facilitatorPolicy: { assignmentRequired: false, visibility: 'all_facilitators' },
  recertifyPolicy: { autoAssign: false },
  customFields: {},
};

// Edit mode: merge persisted policies over the blank defaults, normalising
// server nulls → '' so the number inputs stay controlled.
export const initForm = (program) => {
  if (!program) return blank;
  return {
    ...blank,
    ...program,
    completionPolicy: { ...blank.completionPolicy, ...(program.completionPolicy || {}) },
    capacityPolicy: {
      maxParticipants: program.capacityPolicy?.maxParticipants ?? '',
      maxParticipantsPerSession: program.capacityPolicy?.maxParticipantsPerSession ?? '',
    },
    facilitatorPolicy: { ...blank.facilitatorPolicy, ...(program.facilitatorPolicy || {}) },
    recertifyPolicy: { ...blank.recertifyPolicy, ...(program.recertifyPolicy || {}) },
    certificateValidityDays: program.certificateValidityDays ?? '',
    customFields: program.customFields || {},
  };
};

// '' → null (no limit / never expires); else a finite Number, or null if invalid.
export const numOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Map the live form state onto the LearningProgram API contract. Identical shape
// to the legacy single-form modal — the server contract is unchanged.
export function buildPayload(form) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description?.trim() || undefined,
    category: form.category,
    schedulingMode: form.schedulingMode,
    deliveryMode: form.deliveryMode,
    defaultSessionCount: Number(form.defaultSessionCount) || 1,
    status: form.status,
    prerequisitePrograms: form.prerequisitePrograms || [],
    completionPolicy: {
      attendanceThresholdPercent: Number(form.completionPolicy.attendanceThresholdPercent) || 0,
      requiresAssessment: Boolean(form.completionPolicy.requiresAssessment),
      requiresFeedback: Boolean(form.completionPolicy.requiresFeedback),
    },
    certificateValidityDays: numOrNull(form.certificateValidityDays),
    capacityPolicy: {
      maxParticipants: numOrNull(form.capacityPolicy.maxParticipants),
      maxParticipantsPerSession: numOrNull(form.capacityPolicy.maxParticipantsPerSession),
    },
    facilitatorPolicy: {
      assignmentRequired: Boolean(form.facilitatorPolicy.assignmentRequired),
      visibility: form.facilitatorPolicy.visibility,
    },
    recertifyPolicy: { autoAssign: Boolean(form.recertifyPolicy.autoAssign) },
    customFields: form.customFields || {},
  };
}

// Completion-rule sentences derived from the live form (shared by the Completion
// step copy and the Live preview pane). Returns translated strings.
export function completionRules(form, t) {
  const rules = [];
  const cp = form.completionPolicy || {};
  const pct = Number(cp.attendanceThresholdPercent) || 0;
  if (pct > 0) rules.push(t('learning.builder.rules.attendance', { pct }));
  if (cp.requiresAssessment) rules.push(t('learning.builder.rules.assessment'));
  if (cp.requiresFeedback) rules.push(t('learning.builder.rules.feedback'));
  return rules;
}

// Certificate is always issued on completion; validity controls expiry
// (null / '' / 0 → never expires).
export function neverExpires(validity) {
  return validity === '' || validity === null || validity === undefined || Number(validity) === 0;
}
