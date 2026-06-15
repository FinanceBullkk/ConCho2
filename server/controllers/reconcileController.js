const ReconcileReport = require('../models/ReconcileReport');
const { runReconciliation } = require('../services/reconcileService');
const { SAFE_CHECKS, healCheck } = require('../services/reconcile/healers');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Reconcile Controller
// ──────────────────────────────────────────────────────────
// All endpoints require Admin role (enforced in the router).
// ──────────────────────────────────────────────────────────

/**
 * GET /api/admin/reconcile/latest
 * Returns the most recent report (or 404 if no run yet).
 */
const getLatestReport = async (req, res) => {
  try {
    const report = await ReconcileReport.findOne()
      .sort({ runAt: -1 })
      .lean();

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'No reconciliation report found. Trigger a run first via POST /api/admin/reconcile/run',
      });
    }

    res.json({ success: true, data: report });
  } catch (err) {
    handleError(res, err);
  }
};

/**
 * GET /api/admin/reconcile/history
 * Returns the last 10 report headers (no issues array — just summary + runAt + status).
 * Useful for showing a run history chart without sending large payloads.
 */
const getReportHistory = async (req, res) => {
  try {
    const reports = await ReconcileReport.find()
      .sort({ runAt: -1 })
      .limit(10)
      .select('-issues') // omit the issues array to keep the payload small
      .lean();

    res.json({ success: true, data: reports });
  } catch (err) {
    handleError(res, err);
  }
};

/**
 * GET /api/admin/reconcile/:id
 * Returns a specific report by ID (with full issues array).
 */
const getReportById = async (req, res) => {
  try {
    const report = await ReconcileReport.findById(req.params.id).lean();
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    res.json({ success: true, data: report });
  } catch (err) {
    handleError(res, err);
  }
};

/**
 * POST /api/admin/reconcile/run
 * Triggers an immediate reconciliation run and returns the new report.
 * This is the primary way to use reconciliation on Render free tier
 * (where cron may not fire if the service is sleeping).
 *
 * The run is synchronous — it waits for all checks to complete before
 * responding. Typical duration: 200–800ms depending on data volume.
 */
const triggerRun = async (req, res) => {
  try {
    const report = await runReconciliation('manual');
    // Audit PR L (SEC-013): manual reconcile runs are audited so an admin
    // can answer "who kicked off that 02:14 reconcile" without grep.
    auditService.record({
      req,
      action: 'reconciled',
      entity: 'Reconcile',
      entityId: report._id || null,
      note: `manual run — status=${report.status}, total issues=${report.summary?.total ?? '?'}`,
    });
    const statusCode = report.status === 'ok' ? 200 : 200; // always 200; client reads report.status
    res.status(statusCode).json({ success: true, data: report });
  } catch (err) {
    handleError(res, err);
  }
};

/**
 * GET /api/admin/reconcile/trend?limit=N
 * Returns the last N reports' summary counts (no issues array), oldest→newest,
 * for the integrity drift line. Default 14, capped at 60.
 */
const getTrend = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 14, 1), 60);
    const reports = await ReconcileReport.find()
      .sort({ runAt: -1 })
      .limit(limit)
      .select('runAt status summary triggeredBy durationMs')
      .lean();
    // Reverse to ascending so the client draws a left-to-right trend line.
    res.json({ success: true, data: reports.reverse(), meta: { safeChecks: SAFE_CHECKS } });
  } catch (err) {
    handleError(res, err);
  }
};

/**
 * POST /api/admin/reconcile/heal  { check, refs? }
 * Applies the safe, reversible fix for a fixable check. The server re-derives
 * the current issues (never trusts client row state), heals each, then re-runs
 * the check to report what remains. 422 if the check isn't auto-healable.
 * Each fix writes an AuditLog line (entity:'Reconcile'); gated by system.ops +
 * rate-limited in the router.
 */
const triggerHeal = async (req, res) => {
  try {
    const { check, refs } = req.body || {};
    const result = await healCheck({ check, refs, req });
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.statusCode === 422) {
      return res.status(422).json({
        success: false,
        message: err.message,
        data: { safeChecks: SAFE_CHECKS },
      });
    }
    handleError(res, err);
  }
};

module.exports = {
  getLatestReport,
  getReportHistory,
  getReportById,
  getTrend,
  triggerRun,
  triggerHeal,
};
