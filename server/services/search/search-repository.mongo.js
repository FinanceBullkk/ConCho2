/**
 * search-repository.mongo.js — MONGO impl (Phase 3 Wave-F).
 *
 * All Mongoose access for cross-entity global search. The searchService keeps
 * the role-scoping policy, caching, and result assembly; every collection
 * query + Mongo-specific query shape (anchored/substring regex, `$or`,
 * soft-delete `$ne` predicate, populate) lives here so the Postgres twin
 * (./search-repository.pg) swaps only this file. Same interface as
 * ./search-repository.pg.
 *
 * The regex pair is the Mongo matching primitive (PERF-007): prefer an anchored
 * prefix match (`^q`, index-friendly) and add a substring fallback once the query
 * is ≥4 chars. The Postgres equivalent is `ILIKE 'q%'` / `ILIKE '%q%'`.
 */
const User = require('../../models/User');
const Team = require('../../models/Team');
const Class = require('../../models/Class');
const LearningProgram = require('../../models/LearningProgram');
const Department = require('../../models/Department');
const { escapeRegex } = require('../../helpers/escapeRegex');

// Prefer-prefix, fall-back-to-substring regex pair. Input is escaped to prevent
// ReDoS. 1–3 chars stay prefix-only (index-friendly + fewer typeahead false hits).
const buildRegexes = (q) => {
  const escaped = escapeRegex(q);
  return q.length >= 4
    ? [new RegExp(`^${escaped}`, 'i'), new RegExp(escaped, 'i')]
    : [new RegExp(`^${escaped}`, 'i')];
};

// OR each candidate regex against each field → `$or` clause list.
const orClauses = (q, fields) => {
  const regexes = buildRegexes(q);
  return fields.flatMap((f) => regexes.map((r) => ({ [f]: r })));
};

// Users — role decides the scope: Admin = all; Teacher = Participants only
// (tightens info leak); Participant = own record only.
const findUsers = ({ q, role, userId, limit }) => {
  const $or = orClauses(q, ['empCode', 'name', 'department', 'email']);
  let filter;
  if (role === 'Admin') filter = { $or, isDeleted: { $ne: true } };
  else if (role === 'Teacher') filter = { $or, isDeleted: { $ne: true }, role: 'Participant' };
  else filter = { _id: userId, $or, isDeleted: { $ne: true } };
  return User.find(filter).select('empCode name department email role status').limit(limit).lean();
};

// Teams — Participants only see teams they belong to.
const findTeams = ({ q, role, userId, limit }) => {
  const filter = { $or: orClauses(q, ['name']) };
  if (role === 'Participant') filter.members = userId;
  return Team.find(filter)
    .select('name classId leaderId members')
    .populate('classId', 'classCode courseName')
    .populate('leaderId', 'empCode name')
    .limit(limit)
    .lean();
};

const findClasses = ({ q, limit }) =>
  Class.find({ $or: orClauses(q, ['classCode', 'courseName']) })
    .select('classCode courseName status totalSessions')
    .limit(limit)
    .lean();

const findPrograms = ({ q, limit }) =>
  LearningProgram.find({ $or: orClauses(q, ['name', 'code']), isDeleted: { $ne: true } })
    .select('code name status')
    .limit(limit)
    .lean();

const findDepartments = ({ q, limit }) =>
  Department.find({ $or: orClauses(q, ['name', 'code']), isDeleted: { $ne: true } })
    .select('name code')
    .limit(limit)
    .lean();

// Class ids of the teams a participant belongs to — used to narrow class results.
const findMemberClassIds = async (userId) => {
  const teams = await Team.find({ members: userId }).select('classId').lean();
  return teams.map((t) => t.classId?.toString()).filter(Boolean);
};

module.exports = { findUsers, findTeams, findClasses, findPrograms, findDepartments, findMemberClassIds };
