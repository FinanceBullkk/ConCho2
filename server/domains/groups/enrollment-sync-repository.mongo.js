// ──────────────────────────────────────────────────────────
// groups/enrollment-sync-repository — MONGO impl
// ──────────────────────────────────────────────────────────
// The team enrollment-sync writes/reads (groups Wave-D slice 3), threaded through
// the Unit of Work tx handle. The legacy repo returned LIVE Enrollment docs that
// the caller mutated + `.save()`d; that pattern has no Postgres analogue, so the
// transfer/drop are now EXPLICIT updates and the finders return plain DATA.
// (Enrollment has no pre/post-save hooks or validators beyond the status enum, so
// `updateOne` is behaviour-equivalent to the old `doc.save()` — verified.)
// ──────────────────────────────────────────────────────────
const Team = require('../../models/Team');
const Enrollment = require('../../models/Enrollment');
const User = require('../../models/User');
require('../../models/Class'); // registered for the findTeamForEnrollmentContext classId populate

// Team + cohort label for the notification email context (sees same-tx writes).
const findTeamForEnrollmentContext = async (teamId, tx = {}) => {
  let q = Team.findById(teamId).populate('classId', 'classCode courseName');
  if (tx.session) q = q.session(tx.session);
  const doc = await q.lean();
  if (!doc) return null;
  return {
    _id: doc._id,
    name: doc.name,
    classId: doc.classId
      ? { _id: doc.classId._id, classCode: doc.classId.classCode, courseName: doc.classId.courseName }
      : null,
  };
};

// The learner's Active enrollment in ANOTHER team (the transfer source) — DATA.
const findActiveEnrollmentInOtherTeam = async (userId, teamId, tx = {}) => {
  let q = Enrollment.findOne({ userId, status: 'Active', teamId: { $ne: teamId } }).populate('teamId', 'name');
  if (tx.session) q = q.session(tx.session);
  const doc = await q.lean();
  if (!doc) return null;
  return {
    _id: doc._id,
    teamId: doc.teamId ? { _id: doc.teamId._id, name: doc.teamId.name } : null,
    note: doc.note ?? null,
  };
};

// Close the source enrollment as Transferred (explicit — was doc.save()).
const transferEnrollment = (enrollmentId, { toTeamId, leftAt }, tx = {}) =>
  Enrollment.updateOne(
    { _id: enrollmentId },
    { $set: { status: 'Transferred', leftAt, transferredTo: toTeamId } },
    tx.session ? { session: tx.session } : {},
  );

// The learner's Active enrollment in THIS team (dup-check / drop target).
const findActiveEnrollmentInTeam = async (userId, teamId, tx = {}) => {
  let q = Enrollment.findOne({ userId, teamId, status: 'Active' }).select('_id');
  if (tx.session) q = q.session(tx.session);
  const doc = await q.lean();
  return doc ? { _id: doc._id } : null;
};

// Close an enrollment as Dropped (explicit — was doc.save()).
const dropEnrollment = (enrollmentId, { leftAt }, tx = {}) =>
  Enrollment.updateOne(
    { _id: enrollmentId },
    { $set: { status: 'Dropped', leftAt } },
    tx.session ? { session: tx.session } : {},
  );

// Remove a member from a team's roster (Mongo: $pull the embedded members array).
const pullTeamMember = (teamId, userId, tx = {}) =>
  Team.findByIdAndUpdate(teamId, { $pull: { members: userId } }, tx.session ? { session: tx.session } : {});

const findUserContact = async (userId) => {
  const doc = await User.findById(userId).select('name email').lean();
  return doc ? { name: doc.name, email: doc.email } : null;
};

module.exports = {
  findTeamForEnrollmentContext,
  findActiveEnrollmentInOtherTeam,
  transferEnrollment,
  findActiveEnrollmentInTeam,
  dropEnrollment,
  pullTeamMember,
  findUserContact,
};
