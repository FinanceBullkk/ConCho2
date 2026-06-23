// Migration 020 — push_subscriptions + schedules.{room_link,meet_link}
// (Phase 3 Wave-B: mobile learning surface, B5).
//
// push_subscriptions: a device's Web-Push registration. `endpoint` is GLOBALLY
// unique (re-subscribing the same device upserts + re-homes it to the current
// user); keys {p256dh, auth} → jsonb. NO soft-delete — unsubscribe is a hard
// delete (mirrors PushSubscription.deleteOne).
//
// schedules.room_link/meet_link: the mobile "upcoming sessions" feed selects
// them; they default to '' (matching the Schedule model) and no earlier port
// needed them (same precedent as office_id / settings).

const stamps = (t, knex) => {
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
};

exports.up = async (knex) => {
  await knex.schema.createTable('push_subscriptions', (t) => {
    t.text('id').primary();
    t.text('user_id').notNullable();
    t.text('endpoint').notNullable();
    t.jsonb('keys').notNullable();
    t.text('user_agent').defaultTo('');
    stamps(t, knex);
  });
  await knex.raw(`CREATE UNIQUE INDEX uq_push_subscriptions_endpoint ON push_subscriptions(endpoint)`);
  await knex.raw(`CREATE INDEX ix_push_subscriptions_user ON push_subscriptions(user_id)`);

  await knex.schema.alterTable('schedules', (t) => {
    t.text('room_link').defaultTo('');
    t.text('meet_link').defaultTo('');
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('schedules', (t) => { t.dropColumn('room_link'); t.dropColumn('meet_link'); });
  await knex.schema.dropTableIfExists('push_subscriptions');
};
