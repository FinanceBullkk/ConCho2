// 032 — notification_logs idempotency unique index (#256, notifyPromotions port).
//
// The Mongo NotificationLog model enforces a 7-field unique tuple
// (type, channel, recipientEmail, recipientUserId, assignmentId, learnerId,
// cadenceKey) — a duplicate insert means "already notified", which is how the
// waitlist-promotion (and every cadence-keyed) notifier stays idempotent on
// retries. The PG table had no twin, so the ported writer couldn't rely on
// 23505 → { code: 11000 }.
//
// NULLS NOT DISTINCT (PG 15+): Mongo treats null as a VALUE inside a unique
// index (two docs with the same nulls conflict), while PG's default treats
// NULLs as distinct — waitlist rows carry assignment_id = NULL, so the default
// would never dedupe them. NULLS NOT DISTINCT restores Mongo semantics.
//
// The pre-index dedupe keeps the OLDEST row per tuple — real data can't hold
// duplicates (Mongo enforced the tuple at the source), this only clears
// disposable local-test leftovers so the index can build.

exports.up = async (knex) => {
  await knex.raw(`
    DELETE FROM notification_logs a
      USING notification_logs b
     WHERE a.ctid > b.ctid
       AND a.type = b.type AND a.channel = b.channel
       AND a.recipient_email IS NOT DISTINCT FROM b.recipient_email
       AND a.recipient_user_id IS NOT DISTINCT FROM b.recipient_user_id
       AND a.assignment_id IS NOT DISTINCT FROM b.assignment_id
       AND a.learner_id IS NOT DISTINCT FROM b.learner_id
       AND a.cadence_key = b.cadence_key
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX uq_notification_logs_dedupe
      ON notification_logs (type, channel, recipient_email, recipient_user_id,
                            assignment_id, learner_id, cadence_key)
      NULLS NOT DISTINCT
  `);
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS uq_notification_logs_dedupe');
};
