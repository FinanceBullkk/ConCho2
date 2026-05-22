/**
 * LEGACY ONE-OFF SCRIPT — DO NOT RUN IN PRODUCTION (P3-09)
 * Hardcodes DEFAULT_PASSWORD = 'default12345'. Use /api/import/users for production.
 *
 * Wipe & Re-import TMS data DIRECTLY from raw spreadsheet.
 *
 * Source: C:/Users/anhha/Downloads/okok_FIXED_v2 (1).xlsx
 *   - STUDENTS         → 304 Participant users
 *   - PIC              → 51 Teacher users (synthetic empCodes 900001-900051, sorted alpha)
 *   - ATTENDANCE_LOG   → source of truth for Classes, Sessions, Teams, Attendance
 *   - COURSE_PLAN      → per-course expected total sessions
 *
 * Why this exists: the previous "cleaned" Attendance sheet dropped courseName,
 * causing 18 cross-course attendance rows to collapse on the (classCode, date, empCode)
 * key. By going back to raw — which keeps courseName per row — we recover those.
 *
 * Dedup rules:
 *   - 62 real dups (same classCode+courseName+date+empCode in raw, conflicting status):
 *     PRESENT BEATS ABSENT (give student benefit of doubt).
 *
 * Usage:
 *   node server/scripts/reimport_from_raw.js                    # dry-run
 *   CONFIRM_WIPE=YES node server/scripts/reimport_from_raw.js   # execute
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

const RAW_PATH = process.env.RAW_PATH || 'C:/Users/anhha/Downloads/okok_FIXED_v2 (1).xlsx';
const CONFIRMED = process.env.CONFIRM_WIPE === 'YES';
const DEFAULT_PASSWORD = 'default12345';
const EXTERNAL_LEADER_PREFIX = '900'; // 900001+ for external PIC leaders not in STUDENTS

// Vietnamese name → ASCII transliteration
function asciiVN(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, m => m === 'đ' ? 'd' : 'D');
}
function capWord(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }
function deriveLeaderName(fullName) {
  const w = String(fullName || '').trim().split(/\s+/);
  if (w.length < 2) return null;
  return capWord(asciiVN(w[w.length - 1])) + ' ' + capWord(asciiVN(w[0]));
}
// Strip trailing " 1"/" 2"/" 3" suffix → base name
function picBaseName(picName) {
  const m = String(picName).match(/^(.+?)(\s\d+)?$/);
  return m ? m[1] : picName;
}

// COURSE_PLAN — fallback if course not in sheet
const DEFAULT_TOTAL_SESSIONS = 16;
const COURSE_PLAN_FALLBACK = {
  'Communication 1': 10,
  'Communication 2': 16,
  'Communication 3': 16,
  'Business English': 16,
  'Foundation': 16,
  'Extension of Foundation': 16,
};

// Map STUDENTS.Status → User.status enum
const STATUS_MAP = {
  'Active': 'Active',
  'Inactive': 'Inactive',
  'Waiting for class': 'Waiting for class',
  'Dropped': 'Dropped',
  'Transferred': 'Transferred',
  'On-hold': 'On-hold',
};

// Status priority — when dedup'ing within (scheduleId, userId), higher wins.
const STATUS_PRIORITY = { P: 3, L: 2, EL: 1, A: 0 };

const log = (...a) => console.log(...a);
const section = (t) => log('\n' + '═'.repeat(60) + '\n' + t + '\n' + '═'.repeat(60));

// Excel serial (with Vietnam local wall-clock time encoded) → UTC Date.
// Formula: Excel epoch is 1899-12-30 UTC. Take that UTC instant and shift back
// 7h so the resulting UTC instant matches the intended VN wall clock.
function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || !isFinite(serial)) return null;
  const utcMs = (serial - 25569) * 86400 * 1000;
  // Round to nearest minute to avoid floating-point drift (e.g. 13:59:59.999 → 14:00:00)
  const raw = utcMs - 7 * 3600 * 1000;
  return new Date(Math.round(raw / 60000) * 60000);
}

// "YYYY-MM-DD" portion (UTC) for grouping schedules by calendar date if needed
function isoDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function readRawSheets() {
  const wb = XLSX.readFile(RAW_PATH);
  const studentsRaw = XLSX.utils.sheet_to_json(wb.Sheets['STUDENTS'], { header: 1, defval: '' });
  const studentsHdrIdx = studentsRaw.findIndex(r => Array.isArray(r) && r.includes('Emp Code'));
  const studentsHeaders = studentsRaw[studentsHdrIdx];
  const studentsRows = studentsRaw.slice(studentsHdrIdx + 1).filter(r => r[0]);
  const colIdx = (name) => studentsHeaders.indexOf(name);
  const students = studentsRows.map(r => ({
    empCode: String(r[colIdx('Emp Code')]).trim().toUpperCase(),
    name: String(r[colIdx('Full Name')] || '').trim(),
    department: String(r[colIdx('BU')] || '').trim(),
    position: String(r[colIdx('ROLE')] || '').trim(),
    status: STATUS_MAP[String(r[colIdx('Status')] || 'Active').trim()] || 'Active',
    pic: String(r[colIdx('PIC')] || '').trim(),
    entranceLevel: String(r[colIdx('Entrance Level')] || '').trim(),
    currentLevel: String(r[colIdx('Current Level')] || '').trim(),
    dropDefine: String(r[colIdx('Define of drop\n(not inc. resign)')] || '').trim(),
    dropReason: String(r[colIdx('Drop reason')] || '').trim(),
  }));

  const pic = XLSX.utils.sheet_to_json(wb.Sheets['PIC'], { defval: '' })
    .filter(r => r['Class Code'] && r['PIC'])
    .map(r => ({ classCode: String(r['Class Code']).trim().toUpperCase(), pic: String(r.PIC).trim() }));

  const attLog = XLSX.utils.sheet_to_json(wb.Sheets['ATTENDANCE_LOG'], { defval: '' })
    .map(r => ({
      classCode: String(r['Class Code']).trim().toUpperCase(),
      courseName: String(r['Course Name']).trim(),
      empCode: String(r['Emp Code']).trim().toUpperCase(),
      sessionOrder: r['Session Order'],
      dateSerial: typeof r.Date === 'number' ? r.Date : null,
      status: r.Status === 'Present' ? 'P' : (r.Status === 'Absent' ? 'A' : null),
      pic: String(r.PIC || '').trim(),
    }))
    .filter(r => r.classCode && r.courseName && r.empCode && r.dateSerial && r.status);

  const coursePlan = XLSX.utils.sheet_to_json(wb.Sheets['COURSE_PLAN'], { defval: '' })
    .filter(r => r['Course Name'])
    .reduce((acc, r) => { acc[r['Course Name']] = Number(r['Expected Sessions']) || DEFAULT_TOTAL_SESSIONS; return acc; }, {});

  return { students, pic, attLog, coursePlan };
}

async function main() {
  section('TMS RE-IMPORT FROM RAW SPREADSHEET');
  log('Source: ' + RAW_PATH);
  log('Mode: ' + (CONFIRMED ? '🔥 EXECUTE' : '🧪 DRY RUN'));

  const { students, pic, attLog, coursePlan } = readRawSheets();
  log(`\nRaw rows: STUDENTS=${students.length} PIC=${pic.length} ATTENDANCE_LOG=${attLog.length} COURSE_PLAN=${Object.keys(coursePlan).length}`);

  if (!process.env.MONGO_URI) { console.error('❌ MONGO_URI missing'); process.exit(1); }
  await connectDB();
  dangerousScriptGuard({ scriptName: 'reimport_from_raw.js — wipes attendance/schedules/enrollments/teams/classes/non-admin users', mongoose });

  // ── Resolve PIC name → leader empCode ──
  // Strategy:
  //   1. For each unique PIC name, find Participant whose own student.PIC == picName
  //      AND derived "Given Family" name == picBase (suffix-stripped).
  //   2. If matched → use that real Participant's empCode.
  //   3. If no match → external leader (not in STUDENTS); create synthetic Participant
  //      with empCode 900001+ (role=Participant per user clarification).
  const allPicNames = [...new Set(pic.map(p => p.pic))].sort();
  const classCodeToPicName = new Map(pic.map(p => [p.classCode, p.pic]));

  const picNameToLeaderEmpCode = new Map(); // picName → empCode (only internal); absent = external (leaderId null)
  const externalPicNames = [];
  for (const picName of allPicNames) {
    const base = picBaseName(picName);
    const candidates = students.filter(s => s.pic === picName && deriveLeaderName(s.name) === base);
    if (candidates.length >= 1) {
      candidates.sort((a, b) => a.empCode.localeCompare(b.empCode));
      picNameToLeaderEmpCode.set(picName, candidates[0].empCode);
    } else {
      externalPicNames.push(picName);
    }
  }
  log(`\nLeader resolution: internal=${picNameToLeaderEmpCode.size} external (leaderId=null)=${externalPicNames.length}`);
  if (externalPicNames.length) log('  External team names (no leader): ' + externalPicNames.join(', '));

  // ── Derive Classes from ATTENDANCE_LOG ──
  const classKeys = new Set();
  for (const r of attLog) classKeys.add(`${r.classCode}|${r.courseName}`);
  const classes = [...classKeys].map(k => {
    const [classCode, courseName] = k.split('|');
    return {
      classCode,
      courseName,
      totalSessions: coursePlan[courseName] || COURSE_PLAN_FALLBACK[courseName] || DEFAULT_TOTAL_SESSIONS,
      status: 'Completed',
    };
  });

  // ── Derive Team membership: distinct empCodes per (classCode, courseName) ──
  const teamMembers = new Map(); // key → Set<empCode>
  for (const r of attLog) {
    const k = `${r.classCode}|${r.courseName}`;
    if (!teamMembers.has(k)) teamMembers.set(k, new Set());
    teamMembers.get(k).add(r.empCode);
  }

  // ── Derive Sessions: distinct (classCode, courseName, exact serial) ──
  const sessionKeys = new Map(); // key → { dateSerial, classCode, courseName }
  for (const r of attLog) {
    const k = `${r.classCode}|${r.courseName}|${r.dateSerial}`;
    if (!sessionKeys.has(k)) sessionKeys.set(k, { ...r });
  }

  log(`\nDerived: classes=${classes.length} sessions=${sessionKeys.size} team-members-aggregated`);

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
    log('Re-run with: CONFIRM_WIPE=YES node server/scripts/reimport_from_raw.js');
    log('\nWill insert:');
    log(`  Users:      ${students.length} Participants (from STUDENTS) + preserved Admins`);
    log(`  Classes:    ${classes.length}`);
    log(`  Teams:      ${classes.length} (1 per class), ${picNameToLeaderEmpCode.size} with leader / ${externalPicNames.length} leaderId=null`);
    log(`  Schedules:  ${sessionKeys.size}`);
    log(`  Attendance: ~${attLog.length} (after dedup)`);
    await mongoose.disconnect();
    return;
  }

  // ────────────────────────────────────────────────────────
  // STEP 1 — WIPE
  // ────────────────────────────────────────────────────────
  section('STEP 1 — WIPE (keep Admin)');
  const drops = {
    attendance: await mongoose.connection.db.collection('attendances').deleteMany({}),
    schedules: await mongoose.connection.db.collection('schedules').deleteMany({}),
    enrollments: await mongoose.connection.db.collection('enrollments').deleteMany({}),
    teams: await mongoose.connection.db.collection('teams').deleteMany({}),
    classes: await mongoose.connection.db.collection('classes').deleteMany({}),
    users: await mongoose.connection.db.collection('users').deleteMany({ role: { $ne: 'Admin' } }),
  };
  for (const [k, r] of Object.entries(drops)) log(`  ${k}: deleted ${r.deletedCount}`);
  // Counters are re-synced to actual max AFTER import to avoid collision (see FINAL REPORT step).

  // ────────────────────────────────────────────────────────
  // STEP 2 — USERS (Participants + Teachers)
  // ────────────────────────────────────────────────────────
  section('STEP 2 — IMPORT USERS');
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  // Participants from STUDENTS
  const participantOps = students
    .filter(s => s.empCode && s.name)
    .map(s => {
      const dropReason = [s.dropDefine, s.dropReason].filter(Boolean).join(' — ');
      return {
        updateOne: {
          filter: { empCode: s.empCode },
          update: {
            $set: {
              name: s.name,
              role: 'Participant',
              status: s.status,
              department: s.department,
              position: s.position,
              dropReason,
              entranceLevel: s.entranceLevel,
              currentLevel: s.currentLevel,
            },
            $setOnInsert: { empCode: s.empCode, password: passwordHash },
          },
          upsert: true,
        },
      };
    });

  const userRes = await User.bulkWrite(participantOps, { ordered: false });
  log(`  Participants ops=${participantOps.length}`);
  log(`  inserted=${userRes.upsertedCount} matched=${userRes.matchedCount} modified=${userRes.modifiedCount}`);

  // empCode → ObjectId map
  const userDocs = await User.find({}, { empCode: 1 }).lean();
  const userMap = new Map(userDocs.map(u => [u.empCode.toUpperCase(), u._id]));
  log(`  total users in DB: ${userDocs.length}`);

  // ────────────────────────────────────────────────────────
  // STEP 3 — CLASSES
  // ────────────────────────────────────────────────────────
  section('STEP 3 — IMPORT CLASSES');
  const classOps = classes.map(c => ({
    updateOne: {
      filter: { classCode: c.classCode, courseName: c.courseName },
      update: { $set: c },
      upsert: true,
    },
  }));
  const classRes = await Class.bulkWrite(classOps, { ordered: false });
  log(`  ops=${classOps.length} inserted=${classRes.upsertedCount}`);

  const classDocs = await Class.find({}).lean();
  const classMap = new Map(classDocs.map(c => [`${c.classCode}|${c.courseName}`, c._id]));

  // ────────────────────────────────────────────────────────
  // STEP 4 — TEAMS
  // ────────────────────────────────────────────────────────
  section('STEP 4 — IMPORT TEAMS');
  const teamMap = new Map(); // `${classCode}|${courseName}` → { teamId, memberIds }
  let teamCreated = 0, teamErrors = 0;
  for (const cls of classes) {
    const key = `${cls.classCode}|${cls.courseName}`;
    const picName = classCodeToPicName.get(cls.classCode);
    if (!picName) { log(`  ⚠ no PIC for ${cls.classCode}`); teamErrors++; continue; }
    const leaderEmpCode = picNameToLeaderEmpCode.get(picName); // may be undefined for external
    const leaderId = leaderEmpCode ? userMap.get(leaderEmpCode) : null;
    const memberEmpCodes = [...(teamMembers.get(key) || [])];
    const memberIds = memberEmpCodes.map(c => userMap.get(c)).filter(Boolean);
    try {
      const team = await Team.create({
        name: picName,
        classId: classMap.get(key),
        leaderId, // null OK now (schema is optional)
        members: memberIds,
      });
      teamMap.set(key, { teamId: team._id, memberIds, classId: classMap.get(key) });
      teamCreated++;
    } catch (err) {
      log(`  ❌ team ${key}: ${err.message}`);
      teamErrors++;
    }
  }
  log(`  created=${teamCreated} errors=${teamErrors}`);

  // ────────────────────────────────────────────────────────
  // STEP 5 — ENROLLMENTS
  // ────────────────────────────────────────────────────────
  section('STEP 5 — IMPORT ENROLLMENTS');
  const enrollmentDocs = [];
  const now = new Date();
  for (const { teamId, memberIds, classId } of teamMap.values()) {
    // All classes derived from raw data are historical (status: 'Completed'),
    // so enrollments are also Completed.
    for (const userId of memberIds) {
      enrollmentDocs.push({ userId, teamId, classId, status: 'Completed', joinedAt: now });
    }
  }
  let enrollmentCreated = 0;
  try {
    const result = await Enrollment.insertMany(enrollmentDocs, { ordered: false });
    enrollmentCreated = result.length;
  } catch (err) {
    enrollmentCreated = err.insertedDocs ? err.insertedDocs.length : 0;
  }
  log(`  created=${enrollmentCreated} of ${enrollmentDocs.length}`);

  // ────────────────────────────────────────────────────────
  // STEP 6 — SCHEDULES (distinct classCode + courseName + exact serial)
  // ────────────────────────────────────────────────────────
  section('STEP 6 — IMPORT SCHEDULES');
  const scheduleDocsToInsert = [];
  const scheduleKeyToIndex = new Map(); // `${classCode}|${courseName}|${serial}` → index in scheduleDocsToInsert

  // Pre-generate _id for each schedule so the attendance mapping is order-independent.
  // With ordered:false on partial failure the result array is shorter than the input;
  // using a pre-known _id + Set<insertedId> avoids mis-mapping attendance to wrong schedules.
  for (const [k, s] of sessionKeys.entries()) {
    const classKey = `${s.classCode}|${s.courseName}`;
    const team = teamMap.get(classKey);
    const classId = classMap.get(classKey);
    if (!team || !classId) continue;
    const startTime = excelSerialToDate(s.dateSerial);
    if (!startTime || isNaN(startTime)) continue;
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1h
    scheduleDocsToInsert.push({
      _id: new mongoose.Types.ObjectId(),   // pre-generate
      classId,
      bookedTeamId: team.teamId,
      startTime,
      endTime,
      capacity: Math.max(team.memberIds.length, 9),
      enrolledUsers: team.memberIds,
    });
    scheduleKeyToIndex.set(k, scheduleDocsToInsert.length - 1);
  }

  const insertedScheduleIds = new Set();
  let scheduleCreated = 0;
  try {
    const result = await Schedule.insertMany(scheduleDocsToInsert, { ordered: false });
    scheduleCreated = result.length;
    result.forEach(d => insertedScheduleIds.add(d._id.toString()));
  } catch (err) {
    log(`  ⚠ insert err: ${err.message}`);
    if (err.insertedDocs) {
      scheduleCreated = err.insertedDocs.length;
      err.insertedDocs.forEach(d => insertedScheduleIds.add(d._id.toString()));
    }
  }
  log(`  created=${scheduleCreated} of ${scheduleDocsToInsert.length}`);

  // Map session key → scheduleId (only for actually-inserted schedules)
  const sessionKeyToScheduleId = new Map();
  for (const [k, idx] of scheduleKeyToIndex.entries()) {
    const doc = scheduleDocsToInsert[idx];
    if (doc && insertedScheduleIds.has(doc._id.toString())) {
      sessionKeyToScheduleId.set(k, doc._id);
    }
  }

  // ────────────────────────────────────────────────────────
  // STEP 7 — ATTENDANCE (with Present-beats-Absent dedup)
  // ────────────────────────────────────────────────────────
  section('STEP 7 — IMPORT ATTENDANCE');
  const attDedup = new Map(); // `${scheduleId}|${userId}` → { scheduleId, userId, status }
  const skip = { noSchedule: 0, noUser: 0 };
  for (const r of attLog) {
    const sk = `${r.classCode}|${r.courseName}|${r.dateSerial}`;
    const scheduleId = sessionKeyToScheduleId.get(sk);
    if (!scheduleId) { skip.noSchedule++; continue; }
    const userId = userMap.get(r.empCode);
    if (!userId) { skip.noUser++; continue; }
    const dk = `${scheduleId}|${userId}`;
    const existing = attDedup.get(dk);
    if (!existing || (STATUS_PRIORITY[r.status] > STATUS_PRIORITY[existing.status])) {
      attDedup.set(dk, { scheduleId, userId, status: r.status, remark: '' });
    }
  }
  const attDocs = [...attDedup.values()];
  let attCreated = 0;
  try {
    const result = await Attendance.insertMany(attDocs, { ordered: false });
    attCreated = result.length;
  } catch (err) {
    attCreated = err.insertedDocs ? err.insertedDocs.length : 0;
  }
  log(`  log_rows=${attLog.length} after_dedup=${attDocs.length} created=${attCreated} skipped=${JSON.stringify(skip)}`);

  // ────────────────────────────────────────────────────────
  // SYNC COUNTERS TO ACTUAL MAX
  // ────────────────────────────────────────────────────────
  section('SYNC COUNTERS');
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
  // FINAL REPORT
  // ────────────────────────────────────────────────────────
  section('FINAL REPORT');
  const finalCounts = {
    users: await User.countDocuments({}),
    admins: await User.countDocuments({ role: 'Admin' }),
    participants: await User.countDocuments({ role: 'Participant' }),
    teamsWithLeader: await mongoose.connection.db.collection('teams').countDocuments({ leaderId: { $ne: null } }),
    teamsNoLeader: await mongoose.connection.db.collection('teams').countDocuments({ leaderId: null }),
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
