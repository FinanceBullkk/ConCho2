// Migration 011 — completion engine + certification (Phase 3 Wave-B: learning/completion).
//
// The completion engine reads four evidence tables and writes certificates:
//   • certificates — migration 001 created a MINIMAL stub (id/user_id/program_id/
//     status/issued_at/meta). This fleshes it out to the full immutable record the
//     issue/revoke/verify path needs (serial, verification code, cohort link,
//     snapshot blob, validity window, revocation). The partial-unique
//     {user_id,cohort_id} WHERE Issued AND live mirrors the QB-008 race backstop.
//   • evaluations — the legacy 4-skill rubric (one per learner per class; FULL
//     unique so a soft-delete revives the slot in place, matching Mongo).
//   • feedbacks — end-of-cohort survey (completionPolicy.requiresFeedback signal).
//   • assessment_attempts — generic engine attempts (completion reads the best
//     passing attempt per learner per cohort).
//
// Score columns are `double precision` (node-pg parses these to JS numbers; a
// `numeric` would surface as strings and break parity). Soft-delete + stamps per
// the project convention; FK constraints deferred to the post-ETL hardening pass.

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  // ── certificates: enrich the 001 stub to the full completion record ──
  await knex.schema.alterTable('certificates', (t) => {
    t.text('certificate_number');
    t.text('verification_code');
    t.text('cohort_id').index();
    t.text('learner_name').defaultTo('');
    t.text('program_name').defaultTo('');
    t.text('cohort_code').defaultTo('');
    t.jsonb('completion_snapshot');
    t.text('issued_by');
    t.timestamp('valid_from', { useTz: true });
    t.timestamp('valid_until', { useTz: true });
    t.integer('validity_days');
    t.timestamp('revoked_at', { useTz: true });
    t.text('revoked_reason').defaultTo('');
  });
  // Human serial + opaque verification token are globally unique (Mongo unique:true).
  await knex.raw(`CREATE UNIQUE INDEX uq_certificates_number ON certificates(certificate_number) WHERE certificate_number IS NOT NULL`);
  await knex.raw(`CREATE UNIQUE INDEX uq_certificates_verification ON certificates(verification_code) WHERE verification_code IS NOT NULL`);
  // QB-008: one ACTIVE certificate per (learner, cohort). Active = Issued AND live,
  // so a trashed cert never blocks re-issue (mirrors findActiveCertificate).
  await knex.raw(`CREATE UNIQUE INDEX uq_cert_active_learner_cohort ON certificates(user_id, cohort_id) WHERE status = 'Issued' AND is_deleted = false`);
  // Expiry-scan support index (status, valid_until, is_deleted) — mirrors Mongo.
  await knex.raw(`CREATE INDEX ix_certificates_expiry ON certificates(status, valid_until, is_deleted)`);

  // ── evaluations: legacy 4-skill rubric (one per learner per class) ──
  await knex.schema.createTable('evaluations', (t) => {
    t.text('id').primary();
    t.text('class_id').notNullable().index();
    t.text('user_id').notNullable().index();
    t.text('level').defaultTo('');
    t.specificType('grammar_score', 'double precision').notNullable().defaultTo(0);
    t.specificType('vocabulary_score', 'double precision').notNullable().defaultTo(0);
    t.specificType('pronunciation_score', 'double precision').notNullable().defaultTo(0);
    t.specificType('fluency_score', 'double precision').notNullable().defaultTo(0);
    t.text('teacher_comment').defaultTo('');
    t.text('created_by');
    soft(t); stamps(t, knex);
  });
  // FULL unique (not partial): a re-evaluation after soft-delete REVIVES the slot
  // in place (controllers/evaluationController upsert) — Mongo keeps it full too.
  await knex.raw(`CREATE UNIQUE INDEX uq_evaluations_class_user ON evaluations(class_id, user_id)`);

  // ── feedbacks: end-of-cohort survey (requiresFeedback signal) ──
  await knex.schema.createTable('feedbacks', (t) => {
    t.text('id').primary();
    t.text('cohort_id').notNullable().index();
    t.text('user_id').notNullable().index();
    t.text('program_id');
    t.integer('rating').notNullable();          // overall 1-5 (required)
    t.integer('content_rating');                // optional dimension 1-5
    t.integer('instructor_rating');             // optional dimension 1-5
    t.text('comment').defaultTo('');
    t.text('submitted_by');
    soft(t); stamps(t, knex);
  });
  // One feedback per learner per cohort (submit upserts on this key).
  await knex.raw(`CREATE UNIQUE INDEX uq_feedbacks_cohort_user ON feedbacks(cohort_id, user_id)`);

  // ── assessment_attempts: generic engine attempts (one-shot, score frozen) ──
  await knex.schema.createTable('assessment_attempts', (t) => {
    t.text('id').primary();
    t.text('assessment_id').notNullable().index();
    t.text('user_id').notNullable().index();
    t.text('cohort_id').notNullable().index();
    t.jsonb('answers').defaultTo('[]');
    t.specificType('score', 'double precision').notNullable().defaultTo(0);
    t.specificType('max_score', 'double precision').notNullable().defaultTo(0);
    t.specificType('score_percent', 'double precision').notNullable().defaultTo(0);
    t.boolean('passed').notNullable().defaultTo(false);
    t.timestamp('submitted_at', { useTz: true });
    soft(t); stamps(t, knex);
  });
  // Completion lookup: "best passing attempt for this learner in this cohort?"
  await knex.raw(`CREATE INDEX ix_assessment_attempts_cohort_user_passed ON assessment_attempts(cohort_id, user_id, passed)`);
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('assessment_attempts');
  await knex.schema.dropTableIfExists('feedbacks');
  await knex.schema.dropTableIfExists('evaluations');
  await knex.raw('DROP INDEX IF EXISTS ix_certificates_expiry');
  await knex.raw('DROP INDEX IF EXISTS uq_cert_active_learner_cohort');
  await knex.raw('DROP INDEX IF EXISTS uq_certificates_verification');
  await knex.raw('DROP INDEX IF EXISTS uq_certificates_number');
  await knex.schema.alterTable('certificates', (t) => {
    t.dropColumn('certificate_number'); t.dropColumn('verification_code'); t.dropColumn('cohort_id');
    t.dropColumn('learner_name'); t.dropColumn('program_name'); t.dropColumn('cohort_code');
    t.dropColumn('completion_snapshot'); t.dropColumn('issued_by'); t.dropColumn('valid_from');
    t.dropColumn('valid_until'); t.dropColumn('validity_days'); t.dropColumn('revoked_at');
    t.dropColumn('revoked_reason');
  });
};
