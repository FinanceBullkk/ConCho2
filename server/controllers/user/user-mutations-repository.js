const User = require('../../models/User');

// user-mutations-repository — Mongoose access for the admin user create/update
// handlers. The controller keeps ALL security logic (bcrypt hashing, the BUG #9
// re-auth gate, audit, cache invalidation); this file only isolates the model
// calls so the eventual Postgres port swaps THIS file (Phase 0 readiness).
//
// `create` deliberately uses `User.create` so the model's `pre('save')` hook
// still hashes the password — the update path hashes manually because
// findOneAndUpdate does NOT fire pre('save').

const create = (data) => User.create(data);

// Lean snapshot for the audit before-diff + existence check.
const findByIdLean = (id) => User.findById(id).lean();

// Hydrated doc WITH the normally-hidden password — for the acting admin's
// re-auth password compare.
const findByIdWithPassword = (id) => User.findById(id).select('+password');

// Update + return the fresh doc without the password. `runValidators` keeps the
// schema rules; the `findOneAndUpdate` form fires the User auto-release hook.
const updateById = (id, data) =>
  User.findOneAndUpdate(
    { _id: id },
    data,
    { new: true, runValidators: true, select: '-password' },
  );

module.exports = { create, findByIdLean, findByIdWithPassword, updateById };
