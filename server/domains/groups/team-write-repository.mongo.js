// ──────────────────────────────────────────────────────────
// groups/team-write-repository — MONGO impl
// ──────────────────────────────────────────────────────────
// Team document writes (create / update / unassign-class) + a membership read,
// threaded through the Unit of Work tx handle. The groups Wave-D slice 2 — it
// pins the membership representation bridge: Mongo stores members as an embedded
// `Team.members` array, Postgres as the `team_members` junction table. Both
// impls expose the same semantic interface so the caller never sees the shape gap.
// ──────────────────────────────────────────────────────────
const Team = require('../../models/Team');

const teamShape = (doc) =>
  (doc ? { _id: doc._id, name: doc.name, classId: doc.classId ?? null, leaderId: doc.leaderId ?? null } : null);

// Create a team with its embedded member array (atomic single-doc insert).
const insertTeam = async ({ name, classId = null, leaderId = null, members = [] }, tx = {}) => {
  const [doc] = await Team.create(
    [{ name, classId, leaderId, members }],
    tx.session ? { session: tx.session } : {},
  );
  return teamShape(doc);
};

// Patch team fields; a provided `members` array replaces the membership.
const updateTeamDoc = async (id, data, tx = {}) => {
  const doc = await Team.findOneAndUpdate({ _id: id }, data, {
    new: true, runValidators: true, ...(tx.session && { session: tx.session }),
  });
  return teamShape(doc);
};

// Free a team's class (force-swap path) — runs outside the booking tx today.
const unassignTeamClass = (teamId, tx = {}) =>
  Team.findByIdAndUpdate(teamId, { $set: { classId: null } }, tx.session ? { session: tx.session } : {});

// Member ids of a team (order-independent — compared as a set in parity).
const listTeamMemberIds = async (teamId) => {
  const doc = await Team.findById(teamId).select('members').lean();
  return doc ? doc.members.map((m) => String(m)) : [];
};

module.exports = { insertTeam, updateTeamDoc, unassignTeamClass, listTeamMemberIds };
