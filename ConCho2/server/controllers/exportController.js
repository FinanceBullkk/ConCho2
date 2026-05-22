const exportService = require('../services/exportService');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Export Controller (Thin — delegates to Service Layer)
// ──────────────────────────────────────────────────────────

/**
 * GET /api/export/attendance
 * Query params:
 *   ?from=2026-04-01&to=2026-04-30     Date range (optional)
 *   ?includeExported=true               Include already-exported records
 *   ?format=json                        Return JSON instead of Excel
 *
 * Default: Returns .xlsx file download with PENDING records only.
 */
const exportAttendance = async (req, res) => {
  try {
    const { from, to, includeExported, format } = req.query;

    // JSON preview mode (for frontend table display)
    if (format === 'json') {
      const records = await exportService.queryExportData({
        from, to,
        includeExported: includeExported === 'true',
      });
      return res.json({ success: true, count: records.length, data: records });
    }

    // Excel download mode (default)
    const { buffer, filename, recordCount, markedCount } = await exportService.exportAttendance({
      from, to,
      includeExported: includeExported === 'true',
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-TMS-Record-Count', recordCount);
    res.setHeader('X-TMS-Marked-Exported', markedCount);

    res.send(buffer);
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/export/stats
 * Returns count of PENDING vs EXPORTED records.
 * Used by frontend to show "X records ready to export" badge.
 */
const getExportStats = async (req, res) => {
  try {
    const stats = await exportService.getExportStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    handleError(res, error);
  }
};

/**
 * GET /api/export/evaluations
 * Query params:
 *   ?from=2026-04-01&to=2026-04-30    Date range (optional, uses updatedAt)
 *   ?classId=...                       Filter by class (optional)
 *   ?format=json                       Return JSON instead of Excel
 *
 * Default: Returns .xlsx file download with all evaluations.
 * Unlike attendance, evaluations are NOT marked exported — re-exportable any time.
 */
const exportEvaluations = async (req, res) => {
  try {
    const { from, to, classId, format } = req.query;

    if (format === 'json') {
      const records = await exportService.queryEvaluationData({ from, to, classId });
      return res.json({ success: true, count: records.length, data: records });
    }

    const { buffer, filename, recordCount } = await exportService.exportEvaluations({
      from, to, classId,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-TMS-Record-Count', recordCount);

    res.send(buffer);
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { exportAttendance, exportEvaluations, getExportStats };
