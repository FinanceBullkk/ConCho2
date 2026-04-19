const { google } = require('googleapis');
const Schedule = require('../models/Schedule');
const Team = require('../models/Team');
const User = require('../models/User');
const Class = require('../models/Class');

// ──────────────────────────────────────────────────────────
// Google Sheets Sync Controller
// ──────────────────────────────────────────────────────────
// Reads registration rows from a Master Google Sheet and
// maps them into Schedule documents (team-based enrollment).
//
// Expected Sheet Format (columns):
//   A: TeamName | B: ClassCode | C: Date (YYYY-MM-DD) | D: TimeSlot
//
// The sync logic:
// 1. Reads all rows from the configured sheet
// 2. For each row, finds the Team, Class, and Schedule
// 3. Enrolls the team (all active members) into the schedule
// 4. Skips rows that are already enrolled or have errors
// 5. Returns a detailed report of what was processed
// ──────────────────────────────────────────────────────────

/**
 * Initialize Google Sheets API client
 * Uses a service account JSON key file (path in .env)
 */
const getGoogleSheetsClient = async () => {
  const credentialsPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!credentialsPath) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set. ' +
      'Set it to the path of your Google Cloud service account JSON key file.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
};

/**
 * POST /api/sync/google-sheets
 * Pull registration rows from the Master Sheet and enroll teams
 *
 * Body: {
 *   spreadsheetId: "your-spreadsheet-id",    // Required
 *   sheetName: "Sheet1",                      // Optional, default "Sheet1"
 *   range: "A2:D"                             // Optional, default "A2:D" (skip header)
 * }
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
    console.log('📊 Connecting to Google Sheets...');
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

    console.log(`📋 Found ${rows.length} registration row(s)`);

    // ── 2. Process each row ─────────────────────────────
    const report = {
      processed: 0,
      enrolled: 0,
      skipped: 0,
      errors: [],
      details: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-indexed, skip header
      const [teamName, classCode, dateStr, timeSlot] = rows[i];
      report.processed++;

      // Validate row data
      if (!teamName || !classCode || !dateStr || !timeSlot) {
        report.errors.push({ row: rowNum, error: 'Missing required fields' });
        report.skipped++;
        continue;
      }

      try {
        // Find team
        const team = await Team.findOne({ name: { $regex: `^${teamName.trim()}$`, $options: 'i' } });
        if (!team) {
          report.errors.push({ row: rowNum, error: `Team "${teamName}" not found` });
          report.skipped++;
          continue;
        }

        // Find class
        const cls = await Class.findOne({ classCode: classCode.trim().toUpperCase() });
        if (!cls) {
          report.errors.push({ row: rowNum, error: `Class "${classCode}" not found` });
          report.skipped++;
          continue;
        }

        // Parse date
        const date = new Date(dateStr.trim());
        if (isNaN(date.getTime())) {
          report.errors.push({ row: rowNum, error: `Invalid date "${dateStr}"` });
          report.skipped++;
          continue;
        }

        // Find matching schedule
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const schedule = await Schedule.findOne({
          classId: cls._id,
          date: { $gte: dayStart, $lte: dayEnd },
          timeSlot: timeSlot.trim(),
        });

        if (!schedule) {
          report.errors.push({
            row: rowNum,
            error: `No schedule found for ${classCode} on ${dateStr} at ${timeSlot}`,
          });
          report.skipped++;
          continue;
        }

        // Check if team already enrolled
        if (schedule.enrolledTeams.map(id => id.toString()).includes(team._id.toString())) {
          report.details.push({
            row: rowNum,
            status: 'skipped',
            reason: `Team "${teamName}" already enrolled`,
          });
          report.skipped++;
          continue;
        }

        // Get active members not already enrolled
        const fullTeam = await Team.findById(team._id).populate('members', '_id status');
        const enrolledSet = new Set(schedule.enrolledUsers.map(id => id.toString()));
        const activeNew = fullTeam.members.filter(
          m => m.status === 'Active' && !enrolledSet.has(m._id.toString())
        );

        // Check capacity
        if (schedule.enrolledCount + activeNew.length > schedule.capacity) {
          report.errors.push({
            row: rowNum,
            error: `Capacity exceeded. Available: ${schedule.capacity - schedule.enrolledCount}, Needed: ${activeNew.length}`,
          });
          report.skipped++;
          continue;
        }

        // Enroll team
        const memberIds = activeNew.map(m => m._id);
        await Schedule.updateOne(
          { _id: schedule._id },
          {
            $push: {
              enrolledTeams: team._id,
              enrolledUsers: { $each: memberIds },
            },
            $inc: { enrolledCount: memberIds.length },
          }
        );

        report.enrolled++;
        report.details.push({
          row: rowNum,
          status: 'enrolled',
          team: teamName,
          class: classCode,
          date: dateStr,
          membersAdded: memberIds.length,
        });
      } catch (rowError) {
        report.errors.push({ row: rowNum, error: rowError.message });
        report.skipped++;
      }
    }

    console.log(`✅ Sync complete: ${report.enrolled} enrolled, ${report.skipped} skipped`);

    res.json({
      success: true,
      message: `Sync complete: ${report.enrolled} enrolled, ${report.skipped} skipped out of ${report.processed} rows`,
      data: report,
    });
  } catch (error) {
    console.error('❌ Google Sheets sync error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/sync/status
 * Check if Google Sheets integration is configured
 */
const getSyncStatus = async (_req, res) => {
  const configured = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  res.json({
    success: true,
    data: {
      configured,
      message: configured
        ? 'Google Sheets integration is configured'
        : 'Set GOOGLE_SERVICE_ACCOUNT_KEY in .env to enable sync',
    },
  });
};

module.exports = { syncFromGoogleSheets, getSyncStatus };
