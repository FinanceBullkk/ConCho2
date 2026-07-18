// 037 — Persistent correction overlay for imported English-training data.
// Raw workbook rows remain immutable evidence. Corrections are keyed by stable
// employee code so they survive canonical reset/re-import cycles.

exports.up = async (knex) => {
  await knex.schema.createTable('eng_employee_corrections', (t) => {
    t.text('emp_code').primary();
    t.text('business_unit');
    t.text('job_role');
    t.text('reason').notNullable();
    t.text('corrected_by');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE eng_employee_corrections
    ADD CONSTRAINT ck_eng_employee_correction_value
      CHECK (business_unit IS NOT NULL OR job_role IS NOT NULL)`);

  await knex.schema.createTable('eng_employee_correction_history', (t) => {
    t.text('id').primary();
    t.text('emp_code').notNullable().index();
    t.jsonb('before').notNullable();
    t.jsonb('after').notNullable();
    t.text('reason').notNullable();
    t.text('corrected_by');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('eng_data_quality_issues', (t) => {
    t.text('status').notNullable().defaultTo('open').index();
    t.text('resolution_note');
    t.text('resolved_by');
    t.timestamp('resolved_at', { useTz: true });
  });
  await knex.raw(`ALTER TABLE eng_data_quality_issues
    ADD CONSTRAINT ck_eng_dq_status CHECK (status IN ('open','resolved','accepted'))`);
};

exports.down = async (knex) => {
  await knex.raw(`ALTER TABLE eng_data_quality_issues DROP CONSTRAINT IF EXISTS ck_eng_dq_status`);
  await knex.schema.alterTable('eng_data_quality_issues', (t) => {
    t.dropColumn('resolved_at');
    t.dropColumn('resolved_by');
    t.dropColumn('resolution_note');
    t.dropColumn('status');
  });
  await knex.schema.dropTableIfExists('eng_employee_correction_history');
  await knex.schema.dropTableIfExists('eng_employee_corrections');
};
