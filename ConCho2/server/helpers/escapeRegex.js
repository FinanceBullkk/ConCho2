/**
 * Escape special regex metacharacters in a user-provided string.
 * ─────────────────────────────────────────────────────────────
 * WHY: When interpolating user input into a $regex MongoDB query,
 * unescaped metacharacters like .* or (?:) can match ALL documents
 * or cause catastrophic backtracking (ReDoS).
 *
 * USAGE:
 *   const safe = escapeRegex(req.query.department);
 *   filter.department = { $regex: safe, $options: 'i' };
 *
 * @param {string} str - Raw user input
 * @returns {string}   - Escaped string safe for $regex
 */
const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

module.exports = { escapeRegex };
