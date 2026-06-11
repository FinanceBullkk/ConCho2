/**
 * Phase 1: Import Historical Data via API
 * ─────────────────────────────────────────
 * 1. Create missing Classes (81 class-course pairs)  
 * 2. Create Teams for each class
 * 3. Bulk import 859 schedules + 5,483 attendance via /import/history
 * 4. Update 304 users with Level data
 *
 * Run from: e:\ConCho2\server> node import_phase1.js
 */

const XLSX = require('../node_modules/xlsx');
const API_BASE = 'http://localhost:3000/api';
let COOKIE = '';

// ── API helpers ──
async function apiGet(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { Cookie: COOKIE } });
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText);
  return data;
}
async function apiPut(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || res.statusText);
  return data;
}

function excelDateToISO(num) {
  if (typeof num !== 'number') return null;
  return new Date((num - 25569) * 86400000).toISOString().slice(0, 10);
}

async function login() {
  const res = await fetch(API_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empCode: '000001', password: 'admin12345' }),
  });
  const cookies = res.headers.getSetCookie?.() || [];
  COOKIE = cookies.map(c => c.split(';')[0]).join('; ');
  if (!COOKIE) {
    const raw = res.headers.get('set-cookie') || '';
    COOKIE = raw.split(/,\s*/).map(c => c.split(';')[0]).join('; ');
  }
  return !!COOKIE;
}

async function main() {
  console.log('🔐 Logging in...');
  if (!(await login())) { console.error('❌ Login failed'); process.exit(1); }
  console.log('✅ Logged in\n');

  const wb = XLSX.readFile('../Data/okok_FIXED_v2.xlsx');

  // ═══ STEP 1: Ensure all Classes exist ═══
  console.log('═'.repeat(50));
  console.log('STEP 1: Creating/verifying Classes');
  console.log('═'.repeat(50));

  const cpWs = wb.Sheets['COURSE_PLAN'];
  const cpData = XLSX.utils.sheet_to_json(cpWs, { header: 1 });
  const courseSessions = {};
  for (const r of cpData.slice(1)) {
    if (r[0] && r[1]) courseSessions[r[0]] = r[1];
  }

  // Parse all unique class-course pairs from ATTENDANCE_LOG
  const alWs = wb.Sheets['ATTENDANCE_LOG'];
  const alData = XLSX.utils.sheet_to_json(alWs, { header: 1 });
  const alRows = alData.slice(1).filter(r => r[0]);

  const classPairs = new Set();
  for (const r of alRows) classPairs.add(`${r[0]}|${r[1]}`);

  // Get existing classes
  const classesRes = await apiGet('/classes', { limit: '200' });
  const existingClasses = {};
  for (const c of (classesRes.data || [])) {
    existingClasses[`${c.classCode}|${c.courseName}`] = c._id;
  }

  let classesCreated = 0;
  for (const pair of classPairs) {
    if (existingClasses[pair]) continue;
    const [classCode, courseName] = pair.split('|');
    const totalSessions = courseSessions[courseName] || 16;
    try {
      const res = await apiPost('/classes', { classCode, courseName, totalSessions });
      existingClasses[pair] = res.data._id;
      classesCreated++;
    } catch (err) {
      console.log(`  ⚠️ ${pair}: ${err.message}`);
    }
  }

  // Refresh after creation
  const refreshed = await apiGet('/classes', { limit: '200' });
  for (const c of (refreshed.data || [])) {
    existingClasses[`${c.classCode}|${c.courseName}`] = c._id;
  }
  console.log(`✅ ${classesCreated} new classes, ${Object.keys(existingClasses).length} total\n`);

  // ═══ STEP 2: Build user map ═══
  console.log('═'.repeat(50));
  console.log('STEP 2: Building user lookup');
  console.log('═'.repeat(50));
  const userMap = {};
  let page = 1;
  while (true) {
    const res = await apiGet('/users', { page: String(page), limit: '200' });
    for (const u of (res.data || [])) userMap[u.empCode] = u._id;
    if (page >= (res.pages || 1)) break;
    page++;
  }
  console.log(`✅ ${Object.keys(userMap).length} users mapped\n`);

  // ═══ STEP 3: Ensure Teams ═══
  console.log('═'.repeat(50));
  console.log('STEP 3: Creating Teams for classes');
  console.log('═'.repeat(50));

  const teamsRes = await apiGet('/teams');
  const classToTeam = {};
  for (const t of (teamsRes.data || [])) {
    const cId = t.classId?._id || t.classId;
    if (cId) classToTeam[cId] = t._id;
  }

  const adminId = userMap['000001'];
  let teamsCreated = 0;
  for (const pair of classPairs) {
    const classId = existingClasses[pair];
    if (!classId || classToTeam[classId]) continue;
    const [classCode, courseName] = pair.split('|');
    try {
      const res = await apiPost('/teams', {
        name: `${classCode}-${courseName}`,
        classId,
        leaderId: adminId,
        members: [adminId],
      });
      classToTeam[classId] = res.data._id;
      teamsCreated++;
    } catch (err) {
      console.log(`  ⚠️ Team ${pair}: ${err.message}`);
    }
  }
  console.log(`✅ ${teamsCreated} new teams\n`);

  // ═══ STEP 4: Build sessions + bulk import ═══
  console.log('═'.repeat(50));
  console.log('STEP 4: Importing 5,483 attendance records');
  console.log('═'.repeat(50));

  // Group by session
  const sessions = new Map();
  for (const r of alRows) {
    const dateStr = excelDateToISO(r[5]);
    if (!dateStr) continue;
    const key = `${r[0]}|${r[1]}|${r[4]}|${dateStr}`;
    if (!sessions.has(key)) {
      sessions.set(key, {
        classCode: r[0], courseName: r[1],
        sessionOrder: r[4], date: dateStr,
        students: [],
      });
    }
    const empCode = String(r[2]);
    const userId = userMap[empCode];
    if (userId) {
      sessions.get(key).students.push({
        userId,
        status: r[6] === 'Present' ? 'P' : 'A',
      });
    }
  }

  console.log(`  ${sessions.size} unique sessions to import`);

  // Convert to API payload, batch by 50 sessions
  const allSessions = [];
  let skipped = 0;
  for (const [key, s] of sessions) {
    const classKey = `${s.classCode}|${s.courseName}`;
    const classId = existingClasses[classKey];
    const teamId = classId ? classToTeam[classId] : null;
    if (!classId || !teamId) { skipped++; continue; }

    // Create unique time: use date + session order as hour offset
    const startTime = new Date(`${s.date}T04:${String(s.sessionOrder % 60).padStart(2, '0')}:${String(Math.floor(s.sessionOrder / 60)).padStart(2, '0')}.000Z`);
    const endTime = new Date(startTime.getTime() + 3600000);

    allSessions.push({
      classId,
      teamId,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      students: s.students,
    });
  }

  console.log(`  ${allSessions.length} sessions ready, ${skipped} skipped`);

  // Batch send (50 sessions per request)
  const BATCH_SIZE = 50;
  let totalSchedules = 0, totalAttendance = 0, totalErrors = [];

  for (let i = 0; i < allSessions.length; i += BATCH_SIZE) {
    const batch = allSessions.slice(i, i + BATCH_SIZE);
    try {
      const res = await apiPost('/import/history', { sessions: batch });
      totalSchedules += res.data.schedulesCreated || 0;
      totalAttendance += res.data.attendanceCreated || 0;
      if (res.data.errors) totalErrors.push(...res.data.errors);
      
      const pct = Math.round(((i + batch.length) / allSessions.length) * 100);
      process.stdout.write(`\r  📊 Progress: ${pct}% (${totalSchedules} schedules, ${totalAttendance} attendance)`);
    } catch (err) {
      console.log(`\n  ❌ Batch ${i}: ${err.message}`);
    }
  }

  console.log(`\n✅ Schedules: ${totalSchedules}, Attendance: ${totalAttendance}`);
  if (totalErrors.length > 0) console.log(`  ⚠️ ${totalErrors.length} errors (first 5):`, totalErrors.slice(0, 5));

  // ═══ STEP 5: Import Level data ═══
  console.log('\n' + '═'.repeat(50));
  console.log('STEP 5: Importing Level data');
  console.log('═'.repeat(50));

  const sws = wb.Sheets['STUDENTS'];
  const sdata = XLSX.utils.sheet_to_json(sws, { header: 1 });
  const sHeaderIdx = sdata.findIndex(r => r && r.some(c => String(c) === 'Emp Code'));
  const sRows = sdata.slice(sHeaderIdx + 1).filter(r => r[0]);

  let levelsUpdated = 0;
  for (const r of sRows) {
    const empCode = String(r[0]).trim().toUpperCase();
    const entranceLevel = String(r[7] || '').trim();
    const currentLevel = String(r[8] || '').trim();
    const userId = userMap[empCode];
    if (!userId) continue;
    try {
      await apiPut(`/users/${userId}`, { entranceLevel, currentLevel });
      levelsUpdated++;
    } catch (err) {
      // skip silently
    }
  }
  console.log(`✅ ${levelsUpdated} users updated with levels`);

  // ═══ FINAL ═══
  console.log('\n' + '═'.repeat(50));
  console.log('🎉 PHASE 1 IMPORT COMPLETE');
  console.log('═'.repeat(50));
  console.log(`  Classes:    ${classesCreated} created`);
  console.log(`  Teams:      ${teamsCreated} created`);
  console.log(`  Schedules:  ${totalSchedules}`);
  console.log(`  Attendance: ${totalAttendance} records`);
  console.log(`  Levels:     ${levelsUpdated} users`);
  console.log('═'.repeat(50));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
