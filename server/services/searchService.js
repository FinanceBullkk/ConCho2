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
 * All matches are case-insensitive regex matches with the user input
 * escaped to prevent ReDoS.
 */
const User = require('../models/User');
const Team = require('../models/Team');
const Class = require('../models/Class');
const { escapeRegex } = require('../helpers/escapeRegex');

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;

/**
 * @param {Object}  opts
 * @param {string}  opts.q         The query string (already trimmed)
 * @param {Object}  opts.user      The authenticated user (req.user)
 * @param {number} [opts.limit]    Per-entity result cap (1..25, default 5)
 * @returns {Promise<{ users: Array, teams: Array, classes: Array, total: number }>}
 */
const search = async ({ q, user, limit = DEFAULT_LIMIT }) => {
  if (!q || q.length < 2) {
    return { users: [], teams: [], classes: [], total: 0 };
  }

  const lim = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
  const re = new RegExp(escapeRegex(q), 'i');

  const role = user?.role;
  const userId = user?._id;

  // ── User-facing filter per role ─────────────────────────
  const buildUserFilter = () => {
    const orClauses = [
      { empCode: re },
      { name: re },
      { department: re },
      { email: re },
    ];
    if (role === 'Admin') {
      return { $or: orClauses, isDeleted: { $ne: true } };
    }
    if (role === 'Teacher') {
      return {
        $or: orClauses,
        isDeleted: { $ne: true },
        role: 'Participant',
      };
    }
    // Participant: only their own record (limits info leak)
    return { _id: userId, $or: orClauses, isDeleted: { $ne: true } };
  };

  const userFilter = buildUserFilter();
  const teamFilter = { $or: [{ name: re }] };
  const classFilter = { $or: [{ classCode: re }, { courseName: re }] };

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

  return {
    users,
    teams,
    classes: scopedClasses,
    total: users.length + teams.length + scopedClasses.length,
  };
};

module.exports = { search };
