// 049 — External calendar identity for canonical English Meetings.
//
// The English domain keeps Meeting as its scheduling aggregate. Google Calendar
// remains a fail-soft delivery channel, so these fields may stay null when the
// integration is not configured or temporarily unavailable.

exports.up = async (knex) => {
  await knex.schema.alterTable('eng_meetings', (t) => {
    t.text('google_event_id');
    t.text('meet_link');
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('eng_meetings', (t) => {
    t.dropColumn('google_event_id');
    t.dropColumn('meet_link');
  });
};
