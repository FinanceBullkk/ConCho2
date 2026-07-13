/**
 * Assessment item types — the plain source of truth for the quiz/exam item
 * `type` value set.
 *
 * Extracted from models/Assessment.js (Wave K · Phase 2 · D2e-1) so the zod
 * request schemas (schemas.js + question-bank-schemas.js) no longer require the
 * Mongoose model — a prerequisite for deleting the models + dropping `mongoose`
 * in D2e-2. On Postgres the item shape is validated by these zod schemas, not
 * the Mongoose sub-schema.
 */
const ITEM_TYPES = ['single_choice', 'multiple_choice', 'short_text'];

module.exports = { ITEM_TYPES };
