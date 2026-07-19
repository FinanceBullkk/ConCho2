// Live English final levels share the evaluations table, but they are a typed
// categorical result rather than a synthetic four-skill score.

exports.up = async (knex) => {
  await knex.raw(`
    ALTER TABLE evaluations
      ALTER COLUMN grammar_score DROP NOT NULL,
      ALTER COLUMN vocabulary_score DROP NOT NULL,
      ALTER COLUMN pronunciation_score DROP NOT NULL,
      ALTER COLUMN fluency_score DROP NOT NULL,
      ADD COLUMN result_kind text NOT NULL DEFAULT 'rubric',
      ADD COLUMN level_code text,
      ADD COLUMN evaluated_at timestamptz,
      ADD COLUMN evaluated_by text,
      ADD CONSTRAINT ck_evaluations_result_kind CHECK (result_kind IN ('rubric', 'english_level')),
      ADD CONSTRAINT ck_evaluations_kind_payload CHECK (
        (result_kind = 'rubric' AND grammar_score IS NOT NULL AND vocabulary_score IS NOT NULL
          AND pronunciation_score IS NOT NULL AND fluency_score IS NOT NULL AND level_code IS NULL)
        OR
        (result_kind = 'english_level' AND level_code IS NOT NULL AND grammar_score IS NULL
          AND vocabulary_score IS NULL AND pronunciation_score IS NULL AND fluency_score IS NULL)
      )
  `);
  await knex.raw(`CREATE INDEX ix_evaluations_kind_class ON evaluations(result_kind, class_id) WHERE is_deleted = false`);
};

exports.down = async (knex) => {
  await knex.raw(`DROP INDEX IF EXISTS ix_evaluations_kind_class`);
  await knex.raw(`
    ALTER TABLE evaluations
      DROP CONSTRAINT IF EXISTS ck_evaluations_kind_payload,
      DROP CONSTRAINT IF EXISTS ck_evaluations_result_kind,
      DROP COLUMN IF EXISTS evaluated_by,
      DROP COLUMN IF EXISTS evaluated_at,
      DROP COLUMN IF EXISTS level_code,
      DROP COLUMN IF EXISTS result_kind
  `);
  await knex.raw(`
    UPDATE evaluations SET
      grammar_score = coalesce(grammar_score, 0),
      vocabulary_score = coalesce(vocabulary_score, 0),
      pronunciation_score = coalesce(pronunciation_score, 0),
      fluency_score = coalesce(fluency_score, 0)
  `);
  await knex.raw(`
    ALTER TABLE evaluations
      ALTER COLUMN grammar_score SET NOT NULL,
      ALTER COLUMN vocabulary_score SET NOT NULL,
      ALTER COLUMN pronunciation_score SET NOT NULL,
      ALTER COLUMN fluency_score SET NOT NULL
  `);
};
