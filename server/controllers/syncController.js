const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
const Class = require('../models/Class');
const auditService = require('../services/auditService');
const { handleError } = require('../helpers/handleError');
const logger = require('../lib/logger');
const googleAuth = require('../lib/googleAuth');
const { toVN } = require('../helpers/dayjsConfig');

// ──────────────────────────────────────────────────────────
// Google Sheets Sync Controller (v2 — Optimized)
// ──────────────────────────────────────────────────────────
// FIXES APPLIED:
//   1. SEC-01: Replaced $regex with exact-match + collation
//      (eliminates NoSQL injection / ReDoS risk)
//   2. PERF-01: Pre-loads Teams, Classes, Schedules into
//      in-memory Maps BEFORE the loop → 0 DB queries per row
//      (was: 5 queries × N rows = N+1 problem)
//   3. PERF-05: Updated to use startTime/endTime schema
//      (was: referencing deleted 'date', 'timeSlot', 'enrolledTeams')
// ──────────────────────────────────────────────────────────

/**
 * Initialize Google Sheets API client.
 *
 * P3-01: Reuses googleAuth.js credential resolution so both
 * GOOGLE_SERVICE_ACCOUNT_KEY_JSON (production/Render) and
 * GOOGLE_SERVICE_ACCOUNT_KEY (local file path) are supported.
 * Previously this function only read the file-path variant and
 * would always fail on Render where credentials are supplied
 * as an inline JSON string.
 */
const getGoogleSheetsClient = async () => {
  const { google } = require('googleapis');

  const authClient = googleAuth.getAuthClient({
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  if (!authClient) {
    throw new Error(
      'Google service-account credentials are not configured. ' +
      'Set GOOGLE_SERVICE_ACCOUNT_KEY_JSON (Render/production) or ' +
      'GOOGLE_SERVICE_ACCOUNT_KEY (local file path) in your environment.'
    );
  }

  return google.sheets({ version: 'v4', auth: authClient });
};

/**
 * POST /api/sync/google-sheets
 * Pull registration rows from the Master Sheet and enroll teams.
 *
 * Expected Sheet columns:
 *   A: TeamName | B: ClassCode | C: Date (YYYY-MM-DD) | D: TimeSlot (HH:MM-HH:MM)
 *
 * OPTIMIZATION: Pre-loads ALL Teams, Classes, and relevant Schedules
 * into in-memory Maps before processing rows. This reduces DB queries
 * from 5×N (old) to 3 (new) regardless of how many rows the sheet has.
 */
const syncFromGoogleSheets = async (req, res) => {
  try {
    const {
      spreadsheetId,
      sheetName = 'Sheet1',
      range = 'A2:D',
    } = req.body;

    if (!spreadsheetId) {
      return res.status(400).json({
        success: false,
        message: 'spreadsheetId is required',
      });
    }

    // ── 1. Connect to Google Sheets ─────────────────────
    logger.info({ spreadsheetId, range: `${sheetName}!${range}` }, 'Connecting to Google Sheets');
    const sheets = await getGoogleSheetsClient();

    const fullRange = `${sheetName}!${range}`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: fullRange,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return res.json({
        success: true,
        message: 'No data found in the sheet',
        data: { processed: 0, enrolled: 0, skipped: 0, errors: [] },
      });
    }

    logger.info({ rows: rows.length }, 'Sheet rows fetched');

    // ── 2. PRE-LOAD: Build in-memory lookup Maps ────────
    // This replaces the N+1 queries inside the loop.
    // 3 DB queries total, regardless of row count.

    // Team lookup: lowercase name → team document
    const allTeams = await Team.find().populate('members', '_id status').lean();
    const teamMap = new Map();
    for (const t of allTeams) {
      teamMap.set(t.name.toLowerCase(), t);
    }

    // Class lookup: uppercase classCode → class document
    const allClasses = await Class.find().lean();
    const classMap = new Map();
    for (const c of allClasses) {
      classMap.set(c.classCode.toUpperCase(), c);
    }

    // Schedule lookup: "classId|YYYY-MM-DD" → schedule documents for that day
    // We load ALL LIVE schedules (cancelled rows are history, not sync targets)
    const allSchedules = await Schedule.find({ status: 'scheduled' })
      .select('_id classId bookedTeamId startTime endTime enrolledUsers enrolledCount capacity')
      .lean();

    // Group schedules by classId + VN date for fast lookup.
    // P3-02: Use VN timezone (Asia/Ho_Chi_Minh) so schedules starting before
    // 07:00 VN (< 00:00 UTC next day) group under the correct VN calendar date.
    const scheduleMap = new Map();
    for (const s of allSchedules) {
      const dateKey = toVN(s.startTime).format('YYYY-MM-DD'); // VN calendar date
      const key = `${s.classId.toString()}|${dateKey}`;
      if (!scheduleMap.has(key)) scheduleMap.set(key, []);
      scheduleMap.get(key).push(s);
    }

    // ── 3. Process each row (NO DB queries in this loop) ─
    const report = {
      processed: 0,
      enrolled: 0,
      skipped: 0,
      errors: [],
      details: [],
    };

    // Collect bulk operations to execute at the end
    const bulkOps = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-indexed, skip header
      const [teamName, classCode, dateStr, timeSlot] = rows[i];
      report.processed++;

      // ── Validate row data ───────────────────────────────
      if (!teamName || !classCode || !dateStr || !timeSlot) {
        report.errors.push({ row: rowNum, error: 'Missing required fields' });
        report.skipped++;
        continue;
      }

      // ── Find team (case-insensitive, from Map) ──────────
      // FIX SEC-01: No $regex — simple Map.get with lowercase key
      const team = teamMap.get(teamName.trim().toLowerCase());
      if (!team) {
        report.errors.push({ row: rowNum, error: `Team "${teamName}" not found` });
        report.skipped++;
        continue;
      }

      // ── Find class (from Map) ───────────────────────────
      const cls = classMap.get(classCode.trim().toUpperCase());
      if (!cls) {
        report.errors.push({ row: rowNum, error: `Class "${classCode}" not found` });
        report.skipped++;
        continue;
      }

      // ── Parse date ──────────────────────────────────────
      const date = new Date(dateStr.trim());
      if (isNaN(date.getTime())) {
        report.errors.push({ row: rowNum, error: `Invalid date "${dateStr}"` });
        report.skipped++;
        continue;
      }

      // ── Parse timeSlot (HH:MM-HH:MM) to match startTime ─
      // FIX PERF-05: Match by startTime/endTime instead of deleted 'timeSlot' field
      const slotParts = timeSlot.trim().match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
      if (!slotParts) {
        report.errors.push({ row: rowNum, error: `Invalid timeSlot format "${timeSlot}" — expected HH:MM-HH:MM` });
        report.skipped++;
        continue;
      }

      const [, sh, sm, eh, em] = slotParts.map(Number);
      // P3-02: Use VN date from the sheet's date string so it matches the
      // scheduleMap keys (which are also keyed by VN calendar date).
      const dateKey = toVN(date).format('YYYY-MM-DD');
      const lookupKey = `${cls._id.toString()}|${dateKey}`;

      // ── Find matching schedule (from Map) ───────────────
      // P3-02: Compare using VN timezone (Asia/Ho_Chi_Minh) so time-slot
      // "10:00" in the sheet matches the schedule's startTime correctly
      // on the Render server (UTC+0). Using getUTCHours() was off by 7 h.
      const daySchedules = scheduleMap.get(lookupKey) || [];
      const schedule = daySchedules.find(s => {
        const sVN = toVN(s.startTime);
        return sVN.hour() === sh && sVN.minute() === sm;
      });

      if (!schedule) {
        report.errors.push({
          row: rowNum,
          error: `No schedule found for ${classCode} on ${dateStr} at ${timeSlot}`,
        });
        report.skipped++;
        continue;
      }

      // ── Check if team already booked this schedule ──────
      // FIX PERF-05: Use bookedTeamId instead of deleted 'enrolledTeams'
      if (schedule.bookedTeamId && schedule.bookedTeamId.toString() === team._id.toString()) {
        report.details.push({
          row: rowNum,
          status: 'skipped',
          reason: `Team "${teamName}" already booked this schedule`,
        });
        report.skipped++;
        continue;
      }

      // ── Get active members not already enrolled ─────────
      const enrolledSet = new Set(schedule.enrolledUsers.map(id => id.toString()));
      const activeNew = team.members.filter(
        m => m.status === 'Active' && !enrolledSet.has(m._id.toString())
      );

      // ── Check capacity ──────────────────────────────────
      if (schedule.enrolledCount + activeNew.length > schedule.capacity) {
        report.errors.push({
          row: rowNum,
          error: `Capacity exceeded. Available: ${schedule.capacity - schedule.enrolledCount}, Needed: ${activeNew.length}`,
        });
        report.skipped++;
        continue;
      }

      // ── Queue the update (will be executed via bulkWrite) ─
      const memberIds = activeNew.map(m => m._id);
      bulkOps.push({
        updateOne: {
          filter: { _id: schedule._id },
          update: {
            $set: { bookedTeamId: team._id },
            $push: { enrolledUsers: { $each: memberIds } },
          },
        },
      });

      report.enrolled++;
      report.details.push({
        row: rowNum,
        status: 'enrolled',
        team: teamName,
        class: classCode,
        date: dateStr,
        membersAdded: memberIds.length,
      });
    }

    // ── 4. Execute all updates in a single bulkWrite ─────
    // Instead of N individual updateOne calls, one DB roundtrip.
    if (bulkOps.length > 0) {
      await Schedule.bulkWrite(bulkOps);
      logger.info({ ops: bulkOps.length }, 'Schedule bulkWrite executed');
    }

    logger.info({ ...report }, 'Google Sheets sync complete');

    // Audit PR L (SEC-013): record who triggered the sync + summary.
    // spreadsheetId is included so a reviewer can trace which source was used.
    auditService.record({
      req,
      action: 'synced',
      entity: 'Sync',
      note: `google-sheets ${spreadsheetId} ${sheetName}!${range} — enrolled ${report.enrolled}/${report.processed}, skipped ${report.skipped}`,
    });

    res.json({
      success: true,
      message: `Sync complete: ${report.enrolled} enrolled, ${report.skipped} skipped out of ${report.processed} rows`,
      data: report,
    });
  } catch (error) {
    logger.error({ err: error }, 'Google Sheets sync failed');
    handleError(res, error);
  }
};

/**
 * GET /api/sync/status
 * Check if Google Sheets integration is configured
 */
const getSyncStatus = async (_req, res) => {
  // P3-01: check both credential sources (JSON inline + file path)
  const configured = googleAuth.isConfigured();
  res.json({
    success: true,
    data: {
      configured,
      message: configured
        ? 'Google Sheets integration is configured'
        : 'Set GOOGLE_SERVICE_ACCOUNT_KEY_JSON (production) or GOOGLE_SERVICE_ACCOUNT_KEY (local) to enable sync',
    },
  });
};

module.exports = { syncFromGoogleSheets, getSyncStatus };
