// user-list-repository — MONGO impl (Phase 3 Wave-G: getUsers list read port).
//
// Extracted verbatim from controllers/user/user-queries.getUsers so the admin
// user-list read can follow DB_BACKEND. Same filter/sort/pagination semantics
// as before: role/status exact match, department + free-text search as
// case-insensitive regex, soft-delete auto-filtered by the User find-hook.
// Returns HYDRATED docs (not lean) so the controller's `u.toObject()` and the
// select:false projection stay byte-identical to the pre-port behaviour.
const User = require('../../models/User');
const { escapeRegex } = require('../../helpers/escapeRegex');

const buildFilter = ({ role, status, department, search } = {}) => {
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (department) filter.department = { $regex: escapeRegex(department), $options: 'i' };
  if (search) {
    const s = escapeRegex(search);
    filter.$or = [
      { empCode: { $regex: s, $options: 'i' } },
      { name: { $regex: s, $options: 'i' } },
      { department: { $regex: s, $options: 'i' } },
      { position: { $regex: s, $options: 'i' } },
    ];
  }
  return filter;
};

const listUsers = ({ sortField, sortOrder, skip, limit, ...q }) =>
  User.find(buildFilter(q))
    .sort({ [sortField]: sortOrder, _id: 1 })
    .skip(skip)
    .limit(limit);

const countUsers = (q) => User.countDocuments(buildFilter(q));

module.exports = { listUsers, countUsers };
