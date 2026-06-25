// ──────────────────────────────────────────────────────────
// groups/lifecycle-repository — MONGO impl
// ──────────────────────────────────────────────────────────
// The soft-delete lifecycle slice of the groups domain (the first transaction
// ported onto the dual-backend Unit of Work). Methods threaded through a tx
// handle (`tx.session`); behaviour preserved 1:1 from the legacy groups
// repository (raw-collection soft-delete flips that bypass the Team pre-find
// hook, Active→Dropped enrollment close). Pairs with domains/_shared/unit-of-work.
// ──────────────────────────────────────────────────────────
const mongoose = require('mongoose');
const Team = require('../../models/Team');
const Enrollment = require('../../models/Enrollment');

const teamShape = (doc) => (doc ? { _id: doc._id, name: doc.name } : null);

// Live (non-deleted) team — minimal shape for the delete pre-read.
const findTeamById = async (id, tx = {}) => {
  let q = Team.findById(id).select('name');
  if (tx.session) q = q.session(tx.session);
  return teamShape(await q.lean());
};

// Soft-deleted team — explicit isDeleted:true overrides the pre-find default.
const findDeletedTeamById = async (id) => {
  const doc = await Team.findOne({ _id: id, isDeleted: true }).select('name').lean();
  return teamShape(doc);
};

// Close every Active enrollment for the team (delete cascade, reversible).
const closeActiveEnrollments = async (teamId, tx = {}) => {
  const res = await Enrollment.updateMany(
    { teamId, status: 'Active' },
    { $set: { status: 'Dropped', leftAt: new Date() } },
    tx.session ? { session: tx.session } : {},
  );
  return { modifiedCount: res.modifiedCount };
};

// Raw driver write — the model's pre-find hook auto-filters isDeleted, so a
// Mongoose update couldn't re-find the doc to flip it (same reason as restore).
const markTeamDeleted = (teamId, tx = {}) =>
  Team.collection.updateOne(
    { _id: teamId },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    tx.session ? { session: tx.session } : {},
  );

const markTeamRestored = (id) =>
  Team.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { $set: { isDeleted: false, deletedAt: null } },
  );

module.exports = {
  findTeamById,
  findDeletedTeamById,
  closeActiveEnrollments,
  markTeamDeleted,
  markTeamRestored,
};
