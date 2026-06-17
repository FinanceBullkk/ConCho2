/**
 * searchService.js — Cross-entity global search (policy + cache + assembly).
 *
 * Returns top-N matches across Users, Teams, Classes (plus Programs/Departments
 * for staff) for one query string. Each entity is queried in parallel and capped
 * individually so a noisy collection can't crowd out other types.
 *
 * Role scoping:
 *   - Admin       → all entities, no extra filter
 *   - Teacher     → all entities, but users limited to Participants (tightens
 *                   info leakage); programs + departments visible (staff nav)
 *   - Participant → ONLY their own user record + teams they belong to + classes
 *                   their teams own (no cross-user lookup, no catalog/org nav)
 *
 * PERF-007 (audit PR F): every search is wrapped in a short-TTL (60s) NodeCache
 * keyed on role|q|limit so debounced typeaheads coalesce identical back-to-back
 * queries. The Mongo matching primitive (anchored prefix regex + substring
 * fallback) lives in `search/search-repository.js` — this file owns only policy.
 *
 * Phase 0 (Postgres readiness): all Mongoose access was extracted to
 * `search/search-repository.js`; this service no longer imports any model.
 */
const NodeCache = require('node-cache');
const repository = require('./search/search-repository');

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;

const SEARCH_CACHE_TTL_S = Number(process.env.SEARCH_CACHE_TTL_S) || 60;
const searchCache = new NodeCache({ stdTTL: SEARCH_CACHE_TTL_S, checkperiod: 30 });

const EMPTY = { users: [], teams: [], classes: [], programs: [], departments: [], total: 0 };

/**
 * @param {Object}  opts
 * @param {string}  opts.q         The query string (already trimmed)
 * @param {Object}  opts.user      The authenticated user (req.user)
 * @param {number} [opts.limit]    Per-entity result cap (1..25, default 5)
 * @returns {Promise<{ users, teams, classes, programs, departments, total, cached? }>}
 */
const search = async ({ q, user, limit = DEFAULT_LIMIT }) => {
  if (!q || q.length < 2) return { ...EMPTY };

  const lim = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
  const role = user?.role;
  const userId = user?._id;
  const isStaff = role === 'Admin' || role === 'Teacher';

  // PERF-007 cache hit (keyed by everything that affects the result). Participant
  // scope keys on userId too so two participants don't share a cache entry.
  const cacheKey = `s|${role}|${role === 'Participant' ? String(userId) : ''}|${q}|${lim}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  // Run every entity query in parallel. Programs + departments are staff-only
  // navigation aids → skipped (not just filtered) for Participants.
  const [users, teams, classes, programs, departments] = await Promise.all([
    repository.findUsers({ q, role, userId, limit: lim }),
    repository.findTeams({ q, role, userId, limit: lim }),
    repository.findClasses({ q, limit: lim }),
    isStaff ? repository.findPrograms({ q, limit: lim }) : Promise.resolve([]),
    isStaff ? repository.findDepartments({ q, limit: lim }) : Promise.resolve([]),
  ]);

  // For Participants, narrow class results to classes their teams reference.
  let scopedClasses = classes;
  if (role === 'Participant') {
    const allowedClassIds = new Set(await repository.findMemberClassIds(userId));
    scopedClasses = classes.filter((c) => allowedClassIds.has(c._id.toString()));
  }

  const result = {
    users,
    teams,
    classes: scopedClasses,
    programs,
    departments,
    total: users.length + teams.length + scopedClasses.length + programs.length + departments.length,
  };
  searchCache.set(cacheKey, result);
  return { ...result, cached: false };
};

const invalidateSearchCache = () => {
  searchCache.flushAll();
};

module.exports = { search, invalidateSearchCache };
