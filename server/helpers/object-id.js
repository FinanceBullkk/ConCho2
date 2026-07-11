// Shared ObjectId-shape check for the PG-only runtime.
//
// Replaces `mongoose.Types.ObjectId.isValid(...)` now that the app no longer
// connects to Mongo: the app's ids are 24-hex strings (ObjectId-format-
// compatible — see `scripts/seed-pg.js` genId() and every `.pg` repo). This is
// a pure shape test with no `mongoose` dependency. Mirrors the inline check
// already used by `domains/room/utilization.js`.
const isValidObjectId = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);

module.exports = { isValidObjectId };
