// English-training import — pure normalization + mapping rules (Phase 1).
// Deterministic, side-effect-free, independently testable (PROJECT_RULES §8).
// Encodes the owner-locked mappings from plans/english-integration-phase-1.md §4.

// Emp/class codes: Excel stores some as floats ("237050.0") → canonical string.
function normCode(v) {
  if (v === null || v === undefined || v === '') return null;
  let s = String(v).trim();
  if (s.endsWith('.0')) s = s.slice(0, -2);
  return s || null;
}

function normText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s || null;
}

// Stable course_code slug from a display name (D-K): "Business English" → "business-english".
function slug(name) {
  return String(name || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Excel date cell → 'YYYY-MM-DD' (DATE column) or null. exceljs yields JS Date for
// date cells; strings are parsed leniently. Unparseable → null (caller records issue).
function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Employment status (D-F): only Drop reason 'Resign' means the person left the
// company. Course-lifecycle Status (Completed/Stopped/Waiting) is NOT employment.
function employmentStatus(dropReason) {
  return normText(dropReason) === 'Resign' ? 'inactive' : 'active';
}

// Run-enrollment status (D-H): 'waiting' is a real canonical value in our model.
const ENROLLMENT_STATUS_MAP = {
  active: 'active',
  completed: 'completed',
  stopped: 'dropped',
  'waiting for class': 'waiting',
};
function enrollmentStatus(raw) {
  const key = String(raw || '').trim().toLowerCase();
  return ENROLLMENT_STATUS_MAP[key] || null; // null → caller records unknown_status
}

const ENG_MAX_ABSENCES_DEFAULT = 2; // D-J: absent > 2 sessions → not eligible.

module.exports = {
  normCode, normText, slug, toDate, employmentStatus, enrollmentStatus,
  ENROLLMENT_STATUS_MAP, ENG_MAX_ABSENCES_DEFAULT,
};
