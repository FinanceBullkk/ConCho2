// Migration 019 — notification_logs + users.notification_preferences
// (Phase 3 Wave-B: notification / in-app bell, P5).
//
// notification_logs backs the in-app bell (read surface over the email log).
// NO soft-delete (retention is TTL-based). The bell index {recipient_user_id,
// created_at desc} serves the feed + unread count.
//
// DEFERRED with the writers (the email/cron jobs that CREATE rows are not ported —
// they stay on Mongo until the cutover): the 180-day retention TTL (PG has no
// native TTL → a scheduled cleanup DELETE, Wave E) and the 7-column cadence
// UNIQUE (writer idempotency — no ported code inserts through it yet).
//
// users.notification_preferences (jsonb): the bell's per-user prefs read/write;
// no earlier port needed the column (same precedent as office_id / settings).

const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('notification_logs', (t) => {
    t.text('id').primary();
    t.text('type').notNullable();
    t.text('channel').notNullable().defaultTo('email');   // email | in_app
    t.text('recipient_email').defaultTo('');
    t.text('recipient_user_id');
    t.text('assignment_id');
    t.text('learner_id');
    t.text('cadence_key').notNullable();
    t.text('status').notNullable();                       // pending | sent | skipped | failed
    t.timestamp('sent_at', { useTz: true });
    t.timestamp('read_at', { useTz: true });
    t.text('error').defaultTo('');
    t.jsonb('metadata').defaultTo('{}');
    stamps(t, knex);
  });
  await knex.raw(`CREATE INDEX ix_notification_logs_recipient ON notification_logs(recipient_user_id, created_at DESC)`);

  await knex.schema.alterTable('users', (t) => { t.jsonb('notification_preferences'); });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('users', (t) => { t.dropColumn('notification_preferences'); });
  await knex.schema.dropTableIfExists('notification_logs');
};
