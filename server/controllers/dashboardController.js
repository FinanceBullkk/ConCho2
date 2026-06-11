// ──────────────────────────────────────────────────────────
// Dashboard Controller (facade — Admin analytics)
// ──────────────────────────────────────────────────────────
// The legacy 369-line dashboardController was split by concern (Phase 1
// modular-monolith refactor) into controllers/dashboard/*:
//   - dashboard-stats.js  → filter options + the filtered analytics aggregation
//   - dashboard-alerts.js → cached org-wide AlertBand counts (+ cache buster)
// This module re-exports the same surface so dashboardRoutes.js is unchanged.

const { getFilterOptions, getDashboardStats } = require('./dashboard/dashboard-stats');
const { getAlerts, invalidateAlertsCache } = require('./dashboard/dashboard-alerts');

module.exports = { getDashboardStats, getFilterOptions, getAlerts, invalidateAlertsCache };
