const NodeCache = require('node-cache');
const repository = require('./dashboard-stats-repository');
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
//   1. Bound the $match to a 30-day lookback (ALERTS_LOOKBACK_DAYS).
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

    // Reads follow DB_BACKEND (Wave K-1b): the counts (incomplete-attendance
    // scan + team-gap counts + today's sessions) run against the active backend
    // via the dual-backend dashboard-stats repository — no direct Mongoose here.
    const { toMark, teamsWithoutLeader, teamsUnassigned, todaySessionCount } =
      await repository.getAlertCounts({ now, lookback, today, tomorrow });

    const data = {
      toMark,
      teamsWithoutLeader,
      teamsUnassigned,
      todaySessionCount,
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
