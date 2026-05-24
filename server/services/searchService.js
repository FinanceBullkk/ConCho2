/**
 * searchService.js — Cross-entity global search.
 *
 * Returns top-N matches across Users, Teams, Classes (and optionally
 * Schedules) for a single query string. Each entity is queried in
 * parallel and limited individually so a noisy collection (e.g. users)
 * can't crowd out matches from other types.
 *
 * Role scoping:
 *   - Admin    → all entities, no extra filter
 *   - Teacher  → all entities, but users limited to Participants
 *                (Teachers don't need to find other Teachers/Admins
 *                through search; tightens info leakage)
 *   - Participant → ONLY their own user record + teams they belong to
 *                  + classes their teams own (no cross-user lookup)
 *
 * PERF-007 (audit PR F): the old version used an UNANCHORED case-
 * insensitive regex (e.g. `/foo/i`) on multiple string fields. Mongo
 * cannot use an index for case-insensitive regex without a collation,
 * so each search keystroke was a full-collection scan. With 10k users
 * and 5 chars typed = 5 scans/100ms. Two-part fix:
 *   1. Anchor the regex (`^foo`) so it can hit a prefix-index plan.
 *   2. Wrap the whole search in a short-TTL (60s) NodeCache keyed on
 *      role|q|limit so debounced typeaheads coalesce identical
 *      back-to-back queries.
 *
 * Anchoring trade-off: we lose "match anywhere in the field" — e.g.
 * "smith" no longer hits "Johnsmith". For empCode + classCode (which
 * are short structured codes the user types from the start) this is
 * fine. For name + department (free text) it's a UX regression. We
 * mitigate by ALSO matching the substring form when the query is ≥4
 * chars (longer queries are usually intentional substring searches).
 *
 * All matches are case-insensitive regex matches with the user input
 * escaped to prevent ReDoS.
 */
const NodeCache = require('node-cache');
const User = require('../models/User');
const Team = require('../models/Team');
const Class = require('../models/Class');
const { escapeRegex } = require('../helpers/escapeRegex');

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;

const SEARCH_CACHE_TTL_S = Number(process.env.SEARCH_CACHE_TTL_S) || 60;
const searchCache = new NodeCache({ stdTTL: SEARCH_CACHE_TTL_S, checkperiod: 30 });

/**
 * Build a "prefer-prefix, fall-back-to-substring" regex pair.
 * Short queries (1–3 chars) are prefix-only (index-friendly + fewer
 * false-positives during typeahead). 4+ chars also match substring.
 */
const buildRegexes = (q) => {
  const escaped = escapeRegex(q);
  if (q.length >= 4) {
    // Anchored AND substring fallback — Mongo will OR them.
    return [new RegExp(`^${escaped}`, 'i'), new RegExp(escaped, 'i')];
  }
  return [new RegExp(`^${escaped}`, 'i')];
};

/**
 * @param {Object}  opts
 * @param {string}  opts.q         The query string (already trimmed)
 * @param {Object}  opts.user      The authenticated user (req.user)
 * @param {number} [opts.limit]    Per-entity result cap (1..25, default 5)
 * @returns {Promise<{ users: Array, teams: Array, classes: Array, total: number, cached?: boolean }>}
 */
const search = async ({ q, user, limit = DEFAULT_LIMIT }) => {
  if (!q || q.length < 2) {
    return { users: [], teams: [], classes: [], total: 0 };
  }

  const lim = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
  const role = user?.role;
  const userId = user?._id;

  // PERF-007 cache hit (keyed by everything that affects the result).
  // Participant scope keys on userId too so two participants don't
  // share a cache entry.
  const cacheKey = `s|${role}|${role === 'Participant' ? String(userId) : ''}|${q}|${lim}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  const regexes = buildRegexes(q);
  // Mongo: $in inside $regex isn't directly supported; instead OR each
  // candidate regex against each field. With 1-2 regex variants × 4
  // fields = 4-8 OR clauses, still cheap.
  const fieldRegexClauses = (fields) =>
    fields.flatMap((f) => regexes.map((r) => ({ [f]: r })));

  // ── User-facing filter per role ─────────────────────────
  const userOrClauses = fieldRegexClauses(['empCode', 'name', 'department', 'email']);
  const buildUserFilter = () => {
    if (role === 'Admin') {
      return { $or: userOrClauses, isDeleted: { $ne: true } };
    }
    if (role === 'Teacher') {
      return {
        $or: userOrClauses,
        isDeleted: { $ne: true },
        role: 'Participant',
      };
    }
    // Participant: only their own record (limits info leak)
    return { _id: userId, $or: userOrClauses, isDeleted: { $ne: true } };
  };

  const userFilter = buildUserFilter();
  const teamFilter = { $or: fieldRegexClauses(['name']) };
  const classFilter = { $or: fieldRegexClauses(['classCode', 'courseName']) };

  // Participant team filter: only teams they're a member of
  if (role === 'Participant') {
    teamFilter.members = userId;
  }

  // Run all three queries in parallel — keep this fast even on cold cache.
  const [users, teams, classes] = await Promise.all([
    User.find(userFilter)
      .select('empCode name department email role status')
      .limit(lim)
      .lean(),
    Team.find(teamFilter)
      .select('name classId leaderId members')
      .populate('classId', 'classCode courseName')
      .populate('leaderId', 'empCode name')
      .limit(lim)
      .lean(),
    Class.find(classFilter)
      .select('classCode courseName status totalSessions')
      .limit(lim)
      .lean(),
  ]);

  // For Participants, additionally narrow class results to classes their
  // teams reference. Cheaper to filter post-hoc than to pre-resolve team
  // membership when the query likely returns few classes anyway.
  let scopedClasses = classes;
  if (role === 'Participant') {
    const memberTeams = await Team.find({ members: userId }).select('classId').lean();
    const allowedClassIds = new Set(
      memberTeams.map(t => t.classId?.toString()).filter(Boolean),
    );
    scopedClasses = classes.filter(c => allowedClassIds.has(c._id.toString()));
  }

  const result = {
    users,
    teams,
    classes: scopedClasses,
    total: users.length + teams.length + scopedClasses.length,
  };
  searchCache.set(cacheKey, result);
  return { ...result, cached: false };
};

const invalidateSearchCache = () => {
  searchCache.flushAll();
};

module.exports = { search, invalidateSearchCache };
