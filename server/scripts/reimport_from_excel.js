/**
 * LEGACY ONE-OFF SCRIPT — DO NOT RUN IN PRODUCTION
 * ──────────────────────────────────────────────────────────
 * Wipe & Re-import TMS data from cleaned Excel file.
 *
 * Usage:
 *   node server/scripts/reimport_from_excel.js                    # dry-run (no DB writes)
 *   CONFIRM_WIPE=YES node server/scripts/reimport_from_excel.js   # execute wipe + import
 *
 * Source file: C:/Users/anhha/Downloads/TMS_Import_Ready.xlsx
 *   Sheets: Users, Classes, Teams, Sessions, Attendance
 *
 * Behavior:
 *   - Keeps Admin users + Settings; wipes everything else.
 *   - New user password comes from IMPORT_DEFAULT_PASSWORD (bcrypt salt 12).
 *   - Schedule.startTime stored as UTC, assuming Excel times are Asia/Ho_Chi_Minh (UTC+7).
 *   - Attendance ambiguity (same classCode + date but different courseName) resolved by
 *     selecting the schedule whose enrolledUsers contains the empCode.
 *
 * P3-09: This script is legacy. Set IMPORT_DEFAULT_PASSWORD explicitly when
 * running it. For production imports use POST /api/import/users instead.
 * ──────────────────────────────────────────────────────────
 */

if (process.env.NODE_ENV === 'production') {
  console.error('❌ This legacy script must NOT be run in production. Use the /api/import/users endpoint instead.');
  process.exit(1);
}

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

const connectDB = require('../config/db');
const User = require('../models/User');
const Class = require('../models/Class');
const Team = require('../models/Team');
const Schedule = require('../models/Schedule');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const Counter = require('../models/Counter');
const dangerousScriptGuard = require('./lib/dangerousScriptGuard');

const EXCEL_PATH = process.env.EXCEL_PATH || 'C:/Users/anhha/Downloads/TMS_Import_Ready.xlsx';
const CONFIRMED = process.env.CONFIRM_WIPE === 'YES';
const IMPORT_PASSWORD = process.env['IMPORT_DEFAULT_PASSWORD'];
const VN_OFFSET = '+07:00';

function log(...args) { console.log(...args); }
function section(title) { log('\n' + '═'.repeat(60) + '\n' + title + '\n' + '═'.repeat(60)); }

function readSheets() {
  const wb = XLSX.readFile(EXCEL_PATH);
  const get = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { raw: false, defval: '' });
  return {
    users: get('Users'),
    classes: get('Classes'),
    teams: get('Teams'),
    sessions: get('Sessions'),
    attendance: get('Attendance'),
  };
}

function normDateStr(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // M/D/YYYY or D/M/YYYY (Excel sometimes localizes)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const [, a, b, y] = m;
    return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
  }
  return s;
}

function vnDate(dateStr, hhmm) {
  return new Date(`${dateStr}T${hhmm}:00${VN_OFFSET}`);
}

async function chunkedHash(passwords) {
  const CHUNK = 50;
  const out = [];
  for (let i = 0; i < passwords.length; i += CHUNK) {
    const slice = passwords.slice(i, i + CHUNK);
    const hashed = await Promise.all(slice.map(p => bcrypt.hash(p, 12)));
    out.push(...hashed);
  }
  return out;
}

async function main() {
  section('TMS RE-IMPORT FROM EXCEL');
  log('Excel file: ' + EXCEL_PATH);
  log('Mode: ' + (CONFIRMED ? '🔥 EXECUTE (wipe + import)' : '🧪 DRY RUN (no DB writes)'));

  const data = readSheets();
  log(`\nExcel rows: Users=${data.users.length} Classes=${data.classes.length} Teams=${data.teams.length} Sessions=${data.sessions.length} Attendance=${data.attendance.length}`);

  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI not set in server/.env');
    process.exit(1);
  }
  await connectDB();
  dangerousScriptGuard({ scriptName: 'reimport_from_excel.js — wipes attendance/schedules/enrollments/teams/classes/non-admin users', mongoose });

  // ── Current state ──
  section('CURRENT DATABASE STATE');
  const cur = {
    users: await mongoose.connection.db.collection('users').countDocuments(),
    admins: await User.countDocuments({ role: 'Admin' }),
    classes: await mongoose.connection.db.collection('classes').countDocuments(),
    teams: await mongoose.connection.db.collection('teams').countDocuments(),
    schedules: await mongoose.connection.db.collection('schedules').countDocuments(),
    attendance: await mongoose.connection.db.collection('attendances').countDocuments(),
    enrollments: await mongoose.connection.db.collection('enrollments').countDocuments(),
  };
  log(JSON.stringify(cur, null, 2));

  if (!CONFIRMED) {
    section('DRY RUN — exiting before any writes');
    log('Re-run with: CONFIRM_WIPE=YES node server/scripts/reimport_from_excel.js');
    await mongoose.disconnect();
    return;
  }

  // ────────────────────────────────────────────────────────
  // STEP 1 — WIPE (keep Admin users + Settings)
  // ────────────────────────────────────────────────────────
  section('STEP 1 — WIPE');
  // Use raw collection to bypass soft-delete middleware on Team/User
  const dropResults = {
    attendance: await mongoose.connection.db.collection('attendances').deleteMany({}),
    schedules: await mongoose.connection.db.collection('schedules').deleteMany({}),
    enrollments: await mongoose.connection.db.collection('enrollments').deleteMany({}),
    teams: await mongoose.connection.db.collection('teams').deleteMany({}),
    classes: await mongoose.connection.db.collection('classes').deleteMany({}),
    users: await mongoose.connection.db.collection('users').deleteMany({ role: { $ne: 'Admin' } }),
  };
  for (const [k, r] of Object.entries(dropResults)) log(`  ${k}: deleted ${r.deletedCount}`);

  // Counters are re-synced to actual max AFTER import (see STEP 8) to avoid collisions.

  // ────────────────────────────────────────────────────────
  // STEP 2 — IMPORT USERS
  // ────────────────────────────────────────────────────────
  section('STEP 2 — IMPORT USERS');
  if (!IMPORT_PASSWORD) {
    console.error('❌ IMPORT_DEFAULT_PASSWORD must be set before creating users.');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(IMPORT_PASSWORD, 12);
  const userOps = [];
  for (const u of data.users) {
    const empCode = String(u.empCode || '').trim().toUpperCase();
    if (!empCode || !u.name) continue;
    userOps.push({
      updateOne: {
        filter: { empCode },
        update: {
          $set: {
            name: String(u.name).trim(),
            role: u.role || 'Participant',
            status: u.status || 'Active',
            department: u.department || '',
            position: u.position || '',
            dropReason: u.dropReason || '',
            entranceLevel: u.entranceLevel || '',
            currentLevel: u.currentLevel || '',
          },
          $setOnInsert: { empCode, password: passwordHash },
        },
        upsert: true,
      },
    });
  }
  const userRes = await User.bulkWrite(userOps, { ordered: false });
  log(`  upserts=${userOps.length} inserted=${userRes.upsertedCount} matched=${userRes.matchedCount} modified=${userRes.modifiedCount}`);

  // Build empCode → ObjectId map
  const userDocs = await User.find({}, { empCode: 1 }).lean();
  const userMap = new Map(userDocs.map(u => [u.empCode.toUpperCase(), u._id]));
  log(`  total users in DB now: ${userDocs.length} (incl. preserved Admins)`);

  // ────────────────────────────────────────────────────────
  // STEP 3 — IMPORT CLASSES
  // ────────────────────────────────────────────────────────
  section('STEP 3 — IMPORT CLASSES');
  const classOps = data.classes.map(c => ({
    updateOne: {
      filter: { classCode: String(c.classCode).toUpperCase().trim(), courseName: String(c.courseName).trim() },
      update: {
        $set: {
          classCode: String(c.classCode).toUpperCase().trim(),
          courseName: String(c.courseName).trim(),
          totalSessions: Number(c.totalSessions) || 1,
          status: c.status || 'Ongoing',
        },
      },
      upsert: true,
    },
  }));
  const classRes = await Class.bulkWrite(classOps, { ordered: false });
  log(`  upserts=${classOps.length} inserted=${classRes.upsertedCount} matched=${classRes.matchedCount}`);

  const classDocs = await Class.find({}).lean();
  const classMap = new Map(classDocs.map(c => [`${c.classCode}|${c.courseName}`, c._id]));
  const classStatusMap = new Map(classDocs.map(c => [`${c.classCode}|${c.courseName}`, c.status]));
  log(`  total classes in DB: ${classDocs.length}`);

  // ────────────────────────────────────────────────────────
  // STEP 4 — IMPORT TEAMS
  // ────────────────────────────────────────────────────────
  section('STEP 4 — IMPORT TEAMS');
  const teamMap = new Map(); // `${classCode}|${courseName}` → { teamId, memberIds, leaderId }
  let teamCreated = 0, teamErrors = 0;
  for (const t of data.teams) {
    const key = `${String(t.classCode).toUpperCase().trim()}|${String(t.courseName).trim()}`;
    const classId = classMap.get(key);
    const leaderId = userMap.get(String(t.leaderEmpCode).toUpperCase().trim());
    if (!classId) { log(`  ⚠ team "${t.name}" — class not found: ${key}`); teamErrors++; continue; }
    if (!leaderId) { log(`  ⚠ team "${t.name}" — leader not found: ${t.leaderEmpCode}`); teamErrors++; continue; }
    const memberIds = String(t.memberEmpCodes || '')
      .split(',').map(s => s.trim()).filter(Boolean)
      .map(c => userMap.get(c.toUpperCase()))
      .filter(Boolean);
    try {
      const team = await Team.create({
        name: String(t.name).trim(),
        classId,
        leaderId,
        members: memberIds,
      });
      teamMap.set(key, { teamId: team._id, memberIds, leaderId, classId });
      teamCreated++;
    } catch (err) {
      log(`  ❌ team "${t.name}" (${key}): ${err.message}`);
      teamErrors++;
    }
  }
  log(`  created=${teamCreated} errors=${teamErrors}`);

  // ────────────────────────────────────────────────────────
  // STEP 5 — IMPORT ENROLLMENTS
  // ────────────────────────────────────────────────────────
  section('STEP 5 — IMPORT ENROLLMENTS');
  const enrollmentDocs = [];
  const now = new Date();
  for (const [key, { teamId, memberIds, classId }] of teamMap.entries()) {
    // Historical/completed classes get Completed enrollments; ongoing classes stay Active.
    const clsStatus = classStatusMap.get(key) || 'Ongoing';
    const enrollStatus = ['Completed', 'Cancelled'].includes(clsStatus) ? 'Completed' : 'Active';
    for (const userId of memberIds) {
      enrollmentDocs.push({ userId, teamId, classId, status: enrollStatus, joinedAt: now });
    }
  }
  let enrollmentCreated = 0;
  try {
    const result = await Enrollment.insertMany(enrollmentDocs, { ordered: false });
    enrollmentCreated = result.length;
  } catch (err) {
    enrollmentCreated = err.insertedDocs ? err.insertedDocs.length : 0;
    log(`  ⚠ partial: ${enrollmentCreated}/${enrollmentDocs.length} (${err.writeErrors ? err.writeErrors.length : 0} dup/err)`);
  }
  log(`  created=${enrollmentCreated} of ${enrollmentDocs.length}`);

  // ────────────────────────────────────────────────────────
  // STEP 6 — IMPORT SESSIONS → SCHEDULE
  // ────────────────────────────────────────────────────────
  section('STEP 6 — IMPORT SCHEDULES');
  // Pre-generate _id for each schedule so the attendance mapping is order-independent.
  // With ordered:false, the returned array on partial failure may be shorter than the input;
  // using a pre-known _id + Set<insertedId> avoids mis-mapping attendance to wrong schedules.
  const scheduleDocs = [];
  let sessionSkipped = 0;
  for (const s of data.sessions) {
    const key = `${String(s.classCode).toUpperCase().trim()}|${String(s.courseName).trim()}`;
    const team = teamMap.get(key);
    const classId = classMap.get(key);
    if (!team || !classId) { sessionSkipped++; continue; }
    const dateStr = normDateStr(s.date);
    const startTime = vnDate(dateStr, String(s.startTime).trim());
    const endTime = vnDate(dateStr, String(s.endTime).trim());
    if (isNaN(startTime) || isNaN(endTime)) { sessionSkipped++; continue; }
    scheduleDocs.push({
      _id: new mongoose.Types.ObjectId(),   // pre-generate
      classId,
      bookedTeamId: team.teamId,
      startTime,
      endTime,
      capacity: Math.max(team.memberIds.length, 9),
      enrolledUsers: team.memberIds,
      _classCode: String(s.classCode).toUpperCase().trim(),
      _courseName: String(s.courseName).trim(),
      _dateStr: dateStr,
    });
  }
  // Strip helper fields before insert
  const inserts = scheduleDocs.map(({ _classCode, _courseName, _dateStr, ...rest }) => rest);
  const insertedScheduleIds = new Set();
  let scheduleCreated = 0;
  try {
    const result = await Schedule.insertMany(inserts, { ordered: false });
    scheduleCreated = result.length;
    result.forEach(d => insertedScheduleIds.add(d._id.toString()));
  } catch (err) {
    log(`  ⚠ schedule insert err: ${err.message}`);
    if (err.insertedDocs) {
      scheduleCreated = err.insertedDocs.length;
      err.insertedDocs.forEach(d => insertedScheduleIds.add(d._id.toString()));
    }
  }
  log(`  created=${scheduleCreated} skipped=${sessionSkipped}`);

  // Build lookup: `${classCode}|${dateStr}` → [{ scheduleId, courseName, enrolledSet }]
  // Only include schedules that were actually inserted.
  const scheduleLookup = new Map();
  for (const sd of scheduleDocs) {
    if (!insertedScheduleIds.has(sd._id.toString())) continue;
    const k = `${sd._classCode}|${sd._dateStr}`;
    const enrolledSet = new Set(sd.enrolledUsers.map(id => String(id)));
    if (!scheduleLookup.has(k)) scheduleLookup.set(k, []);
    scheduleLookup.get(k).push({ scheduleId: sd._id, courseName: sd._courseName, enrolledSet });
  }

  // ────────────────────────────────────────────────────────
  // STEP 7 — IMPORT ATTENDANCE
  // ────────────────────────────────────────────────────────
  section('STEP 7 — IMPORT ATTENDANCE');
  const attendanceDocs = [];
  let attSkipped = 0;
  const skipReasons = { noSchedule: 0, noUser: 0, ambiguousUnresolved: 0, badStatus: 0 };
  const VALID_STATUS = new Set(['P', 'A', 'L', 'EL']);

  for (const a of data.attendance) {
    const classCode = String(a.classCode).toUpperCase().trim();
    const dateStr = normDateStr(a.sessionDate);
    const empCode = String(a.empCode).toUpperCase().trim();
    const status = String(a.status).trim().toUpperCase();
    if (!VALID_STATUS.has(status)) { skipReasons.badStatus++; attSkipped++; continue; }

    const userId = userMap.get(empCode);
    if (!userId) { skipReasons.noUser++; attSkipped++; continue; }

    const candidates = scheduleLookup.get(`${classCode}|${dateStr}`);
    if (!candidates || candidates.length === 0) { skipReasons.noSchedule++; attSkipped++; continue; }

    let chosen = candidates[0];
    if (candidates.length > 1) {
      const userIdStr = String(userId);
      const matched = candidates.find(c => c.enrolledSet.has(userIdStr));
      if (!matched) { skipReasons.ambiguousUnresolved++; attSkipped++; continue; }
      chosen = matched;
    }

    attendanceDocs.push({
      scheduleId: chosen.scheduleId,
      userId,
      status,
      remark: a.remark || '',
    });
  }

  let attCreated = 0;
  try {
    const result = await Attendance.insertMany(attendanceDocs, { ordered: false });
    attCreated = result.length;
  } catch (err) {
    attCreated = err.insertedDocs ? err.insertedDocs.length : 0;
    log(`  ⚠ partial insert: ${attCreated}/${attendanceDocs.length}`);
  }
  log(`  created=${attCreated} skipped=${attSkipped} reasons=${JSON.stringify(skipReasons)}`);

  // ────────────────────────────────────────────────────────
  // STEP 8 — SYNC COUNTERS TO ACTUAL MAX
  // ────────────────────────────────────────────────────────
  section('STEP 8 — SYNC COUNTERS');
  // Compute max empCode number (e.g. "000042" → 42)
  const allUserCodes = await User.find({}, { empCode: 1 }).lean();
  const maxEmpSeq = allUserCodes.reduce((max, u) => {
    const n = parseInt(u.empCode, 10);
    return isFinite(n) && n > max ? n : max;
  }, 0);
  await Counter.findOneAndUpdate({ _id: 'empCode' }, { $set: { seq: maxEmpSeq } }, { upsert: true });
  log(`  empCode counter → ${maxEmpSeq}`);

  const allClassCodes = await Class.find({}, { classCode: 1 }).lean();
  const maxClassSeq = allClassCodes.reduce((max, c) => {
    const m = c.classCode.match(/^EL(\d+)$/i);
    if (m) { const n = parseInt(m[1], 10); return n > max ? n : max; }
    return max;
  }, 0);
  await Counter.findOneAndUpdate({ _id: 'classCode' }, { $set: { seq: maxClassSeq } }, { upsert: true });
  log(`  classCode counter → ${maxClassSeq} (next will be EL${String(maxClassSeq + 1).padStart(3, '0')})`);

  // ────────────────────────────────────────────────────────
  // STEP 9 — FINAL REPORT
  // ────────────────────────────────────────────────────────
  section('FINAL REPORT');
  const finalCounts = {
    users: await User.countDocuments({}),
    admins: await User.countDocuments({ role: 'Admin' }),
    classes: await Class.countDocuments({}),
    teams: await mongoose.connection.db.collection('teams').countDocuments({}),
    schedules: await Schedule.countDocuments({}),
    attendance: await Attendance.countDocuments({}),
    enrollments: await Enrollment.countDocuments({}),
  };
  log(JSON.stringify(finalCounts, null, 2));

  await mongoose.disconnect();
  log('\n✅ Done.');
}

main().catch(err => {
  console.error('\n❌ Fatal:', err);
  process.exit(1);
});
