const NodeCache = require('node-cache');
const Schedule = require('../../models/Schedule');
const Team = require('../../models/Team');
const { handleError } = require('../../helpers/handleError');
const { todayVN } = require('../../helpers/dayjsConfig');

// ──────────────────────────────────────────────────────────
// Dashboard Controller — alerts (AlertBand widget)
// ──────────────────────────────────────────────────────────
// Split from the legacy dashboardController (Phase 1 modular-monolith).
// Fast org-wide actionable counts, cached 30s per process (PERF-002) because
// the client refetches on every admin tab focus.

// PERF-002 (audit PR E): The /alerts endpoint was hit on every admin
// browser-tab focus (refetchOnWindowFocus:true on the client) and
// scanned EVERY past schedule in the database via a $lookup-on-
// attendances aggregation. Two-part fix:
//   1. Bound the $match to a 30-day lookback — same window as the
//      reconcile job (reconcileService.js:28).
//   2. Cache the result for 30 seconds per process; alerts don't need
//      to be real-time, and 30s caps the worst-case load to 2 runs/min
//      regardless of how many admins focus their browser tab.
const ALERTS_LOOKBACK_DAYS = Number(process.env.ALERTS_LOOKBACK_DAYS) || 30;
const alertsCache = new NodeCache({ stdTTL: 30, checkperiod: 60 });
const ALERTS_CACHE_KEY = 'dashboard:alerts';

// ──────────────────────────────────────────────────────────
// GET /api/dashboard/alerts
// Fast actionable counts for the AlertBand widget.
// No filter params — always returns org-wide numbers.
// refetchOnWindowFocus: true on the client so it stays fresh.
// ──────────────────────────────────────────────────────────
const getAlerts = async (req, res) => {
  try {
    // PERF-002 cache hit
    const cached = alertsCache.get(ALERTS_CACHE_KEY);
    if (cached) {
      return res.json({ success: true, data: cached, cached: true });
    }

    const now = new Date();
    // P2-10: use Vietnam timezone helper so "today" boundaries are correct
    // on the Render server (UTC) — avoids off-by-one on sessions near midnight VN.
    const today = todayVN();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // PERF-002: 30-day lookback bounds the scan. Sessions older than this
    // have either been marked or aged out of operational interest.
    const lookback = new Date(now.getTime() - ALERTS_LOOKBACK_DAYS * 24 * 3600_000);

    const [toMarkAgg, teamsWithoutLeader, teamsUnassigned, todayCount] = await Promise.all([
      // Past sessions in the last 30 days with incomplete attendance.
      Schedule.aggregate([
        { $match: { endTime: { $lt: now, $gte: lookback } } },
        // Count enrolled members from the array (virtual enrolledCount not available in agg)
        { $addFields: { ec: { $size: { $ifNull: ['$enrolledUsers', []] } } } },
        { $match: { ec: { $gt: 0 } } },
        {
          $lookup: {
            from: 'attendances',
            localField: '_id',
            foreignField: 'scheduleId',
            as: 'atts',
          },
        },
        { $addFields: { mc: { $size: '$atts' } } },
        // Not fully marked = markedCount < enrolledCount
        { $match: { $expr: { $lt: ['$mc', '$ec'] } } },
        { $count: 'total' },
      ]),
      // Active teams without a designated leader (leaderId null/missing)
      Team.countDocuments({ leaderId: null, isDeleted: { $ne: true } }),
      // Active teams not yet assigned to a class
      Team.countDocuments({ classId: null, isDeleted: { $ne: true } }),
      // Sessions scheduled for today (for TodayHero companion info)
      Schedule.countDocuments({ startTime: { $gte: today, $lt: tomorrow } }),
    ]);

    const toMark = toMarkAgg[0]?.total || 0;

    const data = {
      toMark,
      teamsWithoutLeader,
      teamsUnassigned,
      todaySessionCount: todayCount,
      totalAlerts: toMark + teamsWithoutLeader + teamsUnassigned,
      lookbackDays: ALERTS_LOOKBACK_DAYS,
    };
    alertsCache.set(ALERTS_CACHE_KEY, data);
    res.json({ success: true, data, cached: false });
  } catch (error) {
    handleError(res, error);
  }
};

// Exposed so the dashboard mutation paths (e.g. POST /attendance/:scheduleId
// bulkMark) can bust the cache after a mark — keeps the alert toMark counter
// from showing stale data right after the admin marked the missing sessions.
const invalidateAlertsCache = () => {
  alertsCache.del(ALERTS_CACHE_KEY);
};

module.exports = { getAlerts, invalidateAlertsCache };
