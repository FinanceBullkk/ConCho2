// ──────────────────────────────────────────────────────────
// groups/team-write-repository — POSTGRES impl
// ──────────────────────────────────────────────────────────
// Same interface as ./team-write-repository.mongo. The membership bridge: where
// Mongo embeds a `Team.members` array, Postgres normalises into the
// `team_members(team_id,user_id)` junction (migration 001). insertTeam +
// updateTeam member-replace therefore touch two tables — they MUST run inside
// the caller's transaction (`tx.client`) so the team row and its membership
// commit (or roll back) together.
// ──────────────────────────────────────────────────────────
const crypto = require('crypto');
const { query } = require('../../config/pg');

const newId = () => crypto.randomBytes(12).toString('hex');
const exec = (tx, text, params) => (tx && tx.client ? tx.client.query(text, params) : query(text, params));

const teamShape = (r) =>
  (r ? { _id: r.id, name: r.name, classId: r.class_id ?? null, leaderId: r.leader_id ?? null } : null);

// Replace a team's membership rows (delete-then-insert) within the tx.
const replaceMembers = async (tx, teamId, members) => {
  await exec(tx, `DELETE FROM team_members WHERE team_id = $1`, [teamId]);
  if (members && members.length) {
    const vals = members.map((_, i) => `($1,$${i + 2})`).join(',');
    await exec(tx, `INSERT INTO team_members(team_id,user_id) VALUES ${vals} ON CONFLICT DO NOTHING`, [teamId, ...members]);
  }
};

const insertTeam = async ({ name, classId = null, leaderId = null, members = [] }, tx = {}) => {
  const id = newId();
  const { rows } = await exec(
    tx,
    `INSERT INTO teams(id,name,class_id,leader_id) VALUES ($1,$2,$3,$4) RETURNING id,name,class_id,leader_id`,
    [id, name, classId, leaderId],
  );
  await replaceMembers(tx, id, members);
  return teamShape(rows[0]);
};

const FIELD_COL = { name: 'name', classId: 'class_id', leaderId: 'leader_id' };

const updateTeamDoc = async (id, data, tx = {}) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(FIELD_COL)) {
    if (Object.prototype.hasOwnProperty.call(data, k)) { args.push(data[k]); sets.push(`${col} = $${args.length}`); }
  }
  if (sets.length) {
    sets.push('updated_at = now()');
    args.push(id);
    await exec(tx, `UPDATE teams SET ${sets.join(', ')} WHERE id = $${args.length}`, args);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'members')) {
    await replaceMembers(tx, id, data.members);
  }
  const { rows } = await exec(tx, `SELECT id,name,class_id,leader_id FROM teams WHERE id = $1`, [id]);
  return teamShape(rows[0]);
};

const unassignTeamClass = (teamId, tx = {}) =>
  exec(tx, `UPDATE teams SET class_id = NULL, updated_at = now() WHERE id = $1`, [teamId]);

const listTeamMemberIds = async (teamId) => {
  const { rows } = await query(`SELECT user_id FROM team_members WHERE team_id = $1`, [teamId]);
  return rows.map((r) => r.user_id);
};

module.exports = { insertTeam, updateTeamDoc, unassignTeamClass, listTeamMemberIds };
