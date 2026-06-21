// Migration 010 — cohort-enrollment partial-unique (Phase 3 Wave-B: learning/enrollment).
//
// Migration 001 added the TEAM duplicate guard (uq_enr_active_team:
// {user_id,team_id} WHERE Active AND team_id NOT NULL). The COHORT guard (DI-05b)
// is its mirror: one Active cohort enrollment per (user, class) when team_id IS
// NULL. Mongo: index {userId,classId} partial {status:'Active', teamId:$type null}.

exports.up = async (knex) => {
  await knex.raw(`CREATE UNIQUE INDEX uq_enr_active_cohort ON enrollments(user_id, class_id) WHERE status = 'Active' AND team_id IS NULL`);
};

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS uq_enr_active_cohort');
};
