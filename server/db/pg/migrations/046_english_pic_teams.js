// 046 — PIC-owned Team idempotency for live English course runs.
//
// Each active English course run is a generic Class/Cohort with exactly one
// roster Team. The source run natural key makes the handoff retry-safe; PIC is
// stored as Team.leader_id when linked and remains explicit metadata otherwise.

exports.up = async (knex) => {
  await knex.raw(`CREATE UNIQUE INDEX uq_team_english_archive_key
    ON teams ((meta->>'englishArchiveTeamKey'))
    WHERE meta->>'englishArchiveTeamKey' IS NOT NULL`);
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS uq_team_english_archive_key');
};
