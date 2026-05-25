const exportService = require('../services/exportService');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');

// ──────────────────────────────────────────────────────────
// Export Controller (Thin — delegates to Service Layer)
//
// Audit PR L (SEC-013): every Excel download writes an audit line. The
// JSON preview (?format=json) is NOT audited — it's a paginated read
// and the request is already covered by the standard request log. Only
// the side-effecting Excel build / "marked-exported" mutation is audited.
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

    // PERF-001: Excel download mode — stream directly to response
    // to avoid buffering the entire workbook in server memory.
    //
    // beforeWrite callback: the service calls this only when it has
    // confirmed there are records to write, then sets ALL of the
    // streaming headers atomically. Setting Content-Type up front broke
    // the empty-DB error path: handleError(res, ServiceError(404))
    // would emit a JSON body but the xlsx Content-Type was already
    // committed, so supertest parsed the body as Buffer and assertions
    // on res.body.success failed.
    const beforeWrite = ({ filename: fn, recordCount: rc, markedCount: mc }) => {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
      res.setHeader('X-TMS-Record-Count', rc);
      res.setHeader('X-TMS-Marked-Exported', mc);
    };

    const { buffer, filename, recordCount, markedCount } = await exportService.exportAttendance({
      from, to,
      includeExported: includeExported === 'true',
      res,
      beforeWrite,
    });

    auditService.record({
      req,
      action: 'exported',
      entity: 'Export',
      note: `attendance.xlsx — ${recordCount} rows, ${markedCount} marked-exported, range=${from || '-'}..${to || '-'}`,
    });

    // If streaming succeeded (buffer is null), data was already written.
    // Otherwise send the buffer (headers still need setting for non-stream).
    if (buffer) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-TMS-Record-Count', recordCount);
      res.setHeader('X-TMS-Marked-Exported', markedCount);
      res.send(buffer);
    }
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

    // PERF-001: Stream directly to response. Same pattern as
    // exportAttendance — defer ALL headers to beforeWrite so an early
    // ServiceError(404) lets handleError emit a JSON body without a
    // pre-committed xlsx Content-Type confusing the client.
    const beforeWriteEval = ({ filename: fn, recordCount: rc }) => {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
      res.setHeader('X-TMS-Record-Count', rc);
    };

    const { buffer, filename, recordCount } = await exportService.exportEvaluations({
      from, to, classId, res,
      beforeWrite: beforeWriteEval,
    });

    auditService.record({
      req,
      action: 'exported',
      entity: 'Export',
      note: `evaluations.xlsx — ${recordCount} rows, classId=${classId || '-'}, range=${from || '-'}..${to || '-'}`,
    });

    if (buffer) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-TMS-Record-Count', recordCount);
      res.send(buffer);
    }
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { exportAttendance, exportEvaluations, getExportStats };
