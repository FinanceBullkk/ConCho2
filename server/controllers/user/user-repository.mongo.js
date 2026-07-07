const User = require('../../models/User');

// user-repository — MONGO impl. Extracted verbatim from importService (B6)
// so the Postgres twin swaps cleanly.

// Trash guard (DATA-013): explicit isDeleted skips the soft-delete hook —
// trashed empCodes must be refused loudly, not silently overwritten.
const findTrashedUserEmpCodes = async (empCodes) => {
  const rows = await User.find({ empCode: { $in: empCodes }, isDeleted: true }, { empCode: 1 }).lean();
  return rows.map((u) => u.empCode);
};

// Hook-filtered (live only) — drives the isExisting bcrypt/role-guard split.
const findLiveUserEmpCodes = async (empCodes) => {
  const rows = await User.find({ empCode: { $in: empCodes } }, { empCode: 1 }).lean();
  return rows.map((u) => u.empCode);
};

/**
 * Bulk upsert-by-empCode (atomic in the caller's unit-of-work).
 * items: [{ empCode, set: {...}, setOnInsert: {...} }] — role/password ride
 * setOnInsert ONLY (DATA-010: import never promotes an existing user's role).
 * Returns Mongo bulkWrite counts { upsertedCount, modifiedCount, matchedCount }.
 */
const bulkUpsertUsersByEmpCode = async (items, tx) => {
  const result = await User.bulkWrite(
    items.map(({ empCode, set, setOnInsert }) => ({
      updateOne: {
        filter: { empCode },
        update: {
          $set: set,
          ...(Object.keys(setOnInsert || {}).length > 0 ? { $setOnInsert: setOnInsert } : {}),
        },
        upsert: true,
      },
    })),
    tx && tx.session ? { session: tx.session } : {},
  );
  return {
    upsertedCount: result.upsertedCount,
    modifiedCount: result.modifiedCount,
    matchedCount: result.matchedCount,
  };
};

// ── Soft-delete lifecycle (Phase 5 slice 4, B1) ─────────────────────────────
const Team = require('../../models/Team');
const Enrollment = require('../../models/Enrollment');
const mongoose = require('mongoose');

const findLiveUserById = (id) => User.findById(id).lean();

const findTeamsLedByUser = (userId) => Team.find({ leaderId: userId }).select('name').lean();

const pullUserFromAllTeams = async (userId, tx) => {
  const res = await Team.updateMany(
    { members: userId },
    { $pull: { members: userId } },
    tx && tx.session ? { session: tx.session } : {},
  );
  return { modifiedCount: res.modifiedCount };
};

const bulkDropActiveEnrollmentsByUser = async (userId, tx) => {
  const res = await Enrollment.updateMany(
    { userId, status: 'Active' },
    { $set: { status: 'Dropped', leftAt: new Date() } },
    tx && tx.session ? { session: tx.session } : {},
  );
  return { modifiedCount: res.modifiedCount };
};

// Raw collection update — bypasses the soft-delete auto-filter (which would
// hide the row from a Mongoose update). Parks empCode/email so the identifier
// slots free up for reuse (DATA-008); reversible via restoreUserIdentity.
const softDeleteUserWithParking = (userId, { releasedEmpCode, releasedEmail }, tx) =>
  User.collection.updateOne(
    { _id: userId },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        status: 'Dropped',
        empCode: releasedEmpCode,
        email: null,
        _softDeletedEmail: releasedEmail,
      },
    },
    tx && tx.session ? { session: tx.session } : {},
  );

const findDeletedUserById = (id) =>
  User.findOne({ _id: id, isDeleted: true })
    .select('+isDeleted +deletedAt +_softDeletedEmail')
    .lean();

// Raw-collection conflict checks — active replacements must be visible past
// the pre-find soft-delete filter.
const findActiveUserByEmpCode = (empCode) =>
  User.collection.findOne({ empCode, isDeleted: { $ne: true } });

const findActiveUserByEmail = (email) =>
  User.collection.findOne({ email, isDeleted: { $ne: true } });

const restoreUserIdentity = (id, { empCode, email }) =>
  User.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(String(id)) },
    {
      $set: {
        isDeleted: false,
        deletedAt: null,
        status: 'Inactive',
        empCode,
        email,
        _softDeletedEmail: null,
      },
    },
  );

module.exports = {
  findTrashedUserEmpCodes, findLiveUserEmpCodes, bulkUpsertUsersByEmpCode,
  findLiveUserById, findTeamsLedByUser, pullUserFromAllTeams,
  bulkDropActiveEnrollmentsByUser, softDeleteUserWithParking,
  findDeletedUserById, findActiveUserByEmpCode, findActiveUserByEmail, restoreUserIdentity,
};
