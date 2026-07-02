// Migration 028 — training_requests + training_plans (Phase 3 Wave-D: domains/planning).
//
// A4 TNA → annual plan (Horizon 2): demand intake lines (TrainingRequest) and
// the one-per-fiscal-year costed plan (TrainingPlan).
//
//   • training_requests.target {kind,id} subobject → flat target_kind/target_id
//     columns (same precedent as required_training, mig 018).
//   • training_plans.items → jsonb (the plan-item subdoc array; each item carries
//     an app-side generated _id, target {kind,id}, quarter, demand, estCostMinor,
//     cohortIds — exactly the Mongo subdoc shape, mirroring assessments.items).
//   • fiscal_year = FULL unique (the Mongo path-level `unique: true`, not partial).
//   • soft-delete (trash) + stamps per convention; FK constraints deferred (Wave I).

const soft = (t) => {
  t.boolean('is_deleted').notNullable().defaultTo(false);
  t.timestamp('deleted_at', { useTz: true });
};
const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('training_requests', (t) => {
    t.text('id').primary();
    t.text('requested_by');
    t.text('department_id');
    t.text('target_kind').notNullable();
    t.text('target_id').notNullable();
    t.integer('headcount').notNullable();
    t.text('rationale').notNullable().defaultTo('');
    t.text('priority').notNullable().defaultTo('med');
    t.text('target_quarter').notNullable();
    t.text('status').notNullable().defaultTo('submitted');
    t.text('created_by');
    soft(t); stamps(t, knex);
  });
  // Mongo compounds: {status, targetQuarter, isDeleted} + {departmentId, isDeleted}.
  await knex.raw(`CREATE INDEX ix_training_requests_status_quarter ON training_requests(status, target_quarter, is_deleted)`);
  await knex.raw(`CREATE INDEX ix_training_requests_department ON training_requests(department_id, is_deleted)`);

  await knex.schema.createTable('training_plans', (t) => {
    t.text('id').primary();
    t.text('fiscal_year').notNullable().unique();
    t.jsonb('items').notNullable().defaultTo('[]');
    t.text('created_by');
    soft(t); stamps(t, knex);
  });
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('training_plans');
  await knex.schema.dropTableIfExists('training_requests');
};
