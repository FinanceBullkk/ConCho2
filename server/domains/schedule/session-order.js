const mongoose = require('mongoose');
const NodeCache = require('node-cache');
const Schedule = require('../../models/Schedule');

// ──────────────────────────────────────────────────────────
// Session-order numbering + cache
// ──────────────────────────────────────────────────────────
// Extracted from the legacy scheduleService (Phase 1 modular-monolith
// refactor). This is the SINGLE source of the per-class session-order cache:
// the read/query use-cases call attachSessionNumbers, and every create/delete
// path (scheduleService booking fns, domains/schedule/use-cases,
// domains/learning/session) calls invalidateSessionOrderCache. They must all
// import THIS module so they share one NodeCache instance — splitting it would
// make sessionNumbers go stale after a booking.

// Per-class ordered schedule ID list — 5 min TTL.
// Invalidated on create/delete so sessionNumbers stay accurate.
const sessionOrderCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Attach `sessionNumber` to an array of schedule objects.
 * sessionNumber = 1-based position among all sessions of the same class, ordered by startTime.
 *
 * Uses a per-classId cache (5 min TTL) so repeated calls within a request window
 * do not re-query MongoDB. Call invalidateSessionOrderCache(classId) after
 * creating or deleting a schedule to keep numbers accurate.
 */
const attachSessionNumbers = async (schedules) => {
  if (schedules.length === 0) return schedules;

  // Collect unique classIds, check cache for each
  const orderMap = {};
  const uncachedIds = [];

  for (const s of schedules) {
    const cId = s.classId?._id?.toString() || s.classId?.toString();
    if (!cId) continue;
    if (orderMap[cId]) continue; // already resolved this classId in this call
    const cached = sessionOrderCache.get(cId);
    if (cached) {
      orderMap[cId] = cached;
    } else {
      uncachedIds.push(cId);
    }
  }

  // Single query for all uncached classes
  if (uncachedIds.length > 0) {
    const objectIds = uncachedIds.map(id => new mongoose.Types.ObjectId(id));
    const allSchedules = await Schedule.find({ classId: { $in: objectIds } })
      .select('_id classId startTime')
      .sort({ startTime: 1 })
      .lean();

    const tempMap = {};
    for (const s of allSchedules) {
      const cId = s.classId.toString();
      if (!tempMap[cId]) tempMap[cId] = [];
      tempMap[cId].push(s._id.toString());
    }
    for (const [cId, ids] of Object.entries(tempMap)) {
      orderMap[cId] = ids;
      sessionOrderCache.set(cId, ids);
    }
  }

  // Attach sessionNumber
  for (const s of schedules) {
    const cId = s.classId?._id?.toString() || s.classId?.toString();
    const sId = s._id.toString();
    const order = orderMap[cId] || [];
    const idx = order.indexOf(sId);
    s.sessionNumber = idx >= 0 ? idx + 1 : null;
  }

  return schedules;
};

/**
 * Invalidate the session-order cache for a class.
 * Call after creating or deleting a schedule so sessionNumbers are recomputed.
 */
const invalidateSessionOrderCache = (classId) => {
  if (classId) sessionOrderCache.del(classId.toString());
};

module.exports = {
  attachSessionNumbers,
  invalidateSessionOrderCache,
  sessionOrderCache,
};
