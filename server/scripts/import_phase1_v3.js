/**
 * Phase 1: Import Historical Attendance Data (v3 — final)
 * ────────────────────────────────────────────────────────
 * Fixes from v1/v2:
 *   - Uses limit=200 (API max)
 *   - Creates classes as Completed to bypass the "1 Ongoing" rule
 *   - Creates teams with available users (not admin who's already in a team)
 *
 * Run: cd server && node import_phase1_v3.js
 */

const XLSX = require('../node_modules/xlsx');
const API = 'http://localhost:3000/api';
let COOKIE = '';

const get = async (path, p = {}) => {
  const u = new URL(API + path);
  Object.entries(p).forEach(([k, v]) => u.searchParams.set(k, String(v)));
  const r = await fetch(u, { headers: { Cookie: COOKIE } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || r.statusText);
  return d;
};
const post = async (path, b) => {
  const r = await fetch(API + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify(b),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || r.statusText);
  return d;
};
const put = async (path, b) => {
  const r = await fetch(API + path, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: COOKIE },
    body: JSON.stringify(b),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || r.statusText);
  return d;
};

const excelDate = n => typeof n !== 'number' ? null : new Date((n - 25569) * 86400000).toISOString().slice(0, 10);

async function login() {
  const r = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empCode: '000001', password: 'admin12345' }),
  });
  COOKIE = (r.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  if (!COOKIE) COOKIE = (r.headers.get('set-cookie') || '').split(/,\s*(?=\w+=)/).map(c => c.split(';')[0]).join('; ');
  console.log('🔐', COOKIE ? '✅ Login OK' : '❌ Login FAIL');
  return !!COOKIE;
}

async function getAllUsers() {
  const map = {};
  for (let p = 1; ; p++) {
    const r = await get('/users', { page: p, limit: 200 });
    for (const u of (r.data || [])) map[u.empCode] = u._id;
    if (p >= (r.pages || 1)) break;
  }
  return map;
}

async function getAllClasses() {
  const map = {};
  const r = await get('/classes', { page: 1, limit: 200 });
  for (const c of (r.data || [])) map[`${c.classCode}|${c.courseName}`] = c._id;
  // Check if there's more pages
  if ((r.pages || 1) > 1) {
    for (let p = 2; p <= r.pages; p++) {
      const r2 = await get('/classes', { page: p, limit: 200 });
      for (const c of (r2.data || [])) map[`${c.classCode}|${c.courseName}`] = c._id;
    }
  }
  return map;
}

async function main() {
  if (!(await login())) process.exit(1);
  const wb = XLSX.readFile('../Data/okok_FIXED_v2.xlsx');

  // ─── Parse COURSE_PLAN ───
  const cpRows = XLSX.utils.sheet_to_json(wb.Sheets['COURSE_PLAN'], { header: 1 }).slice(1);
  const courseSessions = {};
  for (const r of cpRows) if (r[0] && r[1]) courseSessions[r[0]] = r[1];

  // ─── Parse ATTENDANCE_LOG ───
  const alRows = XLSX.utils.sheet_to_json(wb.Sheets['ATTENDANCE_LOG'], { header: 1 })
    .slice(1).filter(r => r[0]);
  console.log(`📋 ATTENDANCE_LOG: ${alRows.length} records`);

  const classPairs = new Set();
  for (const r of alRows) classPairs.add(`${r[0]}|${r[1]}`);
  console.log(`📋 Unique class-course pairs: ${classPairs.size}`);

  // ═══ STEP 1: Create all classes ═══
  console.log('\n📦 STEP 1: Classes');

  // First mark ALL existing classes as Completed
  let existingClasses = await getAllClasses();
  const allClassesRes = await get('/classes', { limit: 200 });
  for (const c of (allClassesRes.data || [])) {
    if (c.status === 'Ongoing') {
      try { await put(`/classes/${c._id}`, { status: 'Completed' }); } catch (e) {}
    }
  }

  // Now create missing ones as Completed
  let classesCreated = 0;
  for (const pair of classPairs) {
    if (existingClasses[pair]) continue;
    const [cc, cn] = pair.split('|');
    try {
      const r = await post('/classes', { classCode: cc, courseName: cn, totalSessions: courseSessions[cn] || 16, status: 'Completed' });
      existingClasses[pair] = r.data._id;
      classesCreated++;
    } catch (e) {
      // Last resort: try creating one more time
      console.log(`  ⚠️ ${pair}: ${e.message}`);
    }
  }
  // Refresh
  existingClasses = await getAllClasses();
  const coveredPairs = [...classPairs].filter(p => existingClasses[p]);
  console.log(`  ✅ ${classesCreated} new, ${coveredPairs.length}/${classPairs.size} covered`);

  // ═══ STEP 2: Users ═══
  console.log('\n👥 STEP 2: Users');
  const userMap = await getAllUsers();
  console.log(`  ✅ ${Object.keys(userMap).length} users`);

  // ═══ STEP 3: Teams ═══
  console.log('\n👥 STEP 3: Teams');
  
  const teamsAll = await get('/teams');
  const classToTeam = {};
  const usersInTeams = new Set();
  
  for (const t of (teamsAll.data || [])) {
    const cId = t.classId?._id || t.classId;
    if (cId) classToTeam[cId] = t._id;
    for (const m of (t.members || [])) {
      usersInTeams.add(String(typeof m === 'object' ? (m._id || m) : m));
    }
  }

  // Available leaders: users NOT in any team
  const availableLeaders = Object.values(userMap).filter(id => !usersInTeams.has(String(id)));
  console.log(`  Available leaders: ${availableLeaders.length}`);

  let teamsCreated = 0;
  let leaderIdx = 0;
  for (const pair of coveredPairs) {
    const classId = existingClasses[pair];
    if (classToTeam[classId]) continue;
    if (leaderIdx >= availableLeaders.length) {
      console.log(`  ⚠️ No more available leaders for ${pair}`);
      break;
    }
    const [cc, cn] = pair.split('|');
    const leaderId = availableLeaders[leaderIdx++];
    try {
      const r = await post('/teams', { name: `${cc}-${cn.replace(/\s+/g,'')}`, classId, leaderId, members: [leaderId] });
      classToTeam[classId] = r.data._id;
      teamsCreated++;
    } catch (e) {
      console.log(`  ⚠️ ${pair}: ${e.message}`);
    }
  }
  console.log(`  ✅ ${teamsCreated} teams created`);

  // ═══ STEP 4: Import attendance ═══
  console.log('\n📊 STEP 4: Bulk import');

  // Group by session
  const sessions = new Map();
  for (const r of alRows) {
    const d = excelDate(r[5]); if (!d) continue;
    const k = `${r[0]}|${r[1]}|${r[4]}|${d}`;
    if (!sessions.has(k)) sessions.set(k, { cc: r[0], cn: r[1], so: r[4], d, sts: [] });
    const uid = userMap[String(r[2])];
    if (uid) sessions.get(k).sts.push({ userId: uid, status: r[6] === 'Present' ? 'P' : 'A' });
  }

  const payload = [];
  let skip = 0;
  for (const [, s] of sessions) {
    const cid = existingClasses[`${s.cc}|${s.cn}`];
    const tid = cid ? classToTeam[cid] : null;
    if (!cid || !tid) { skip++; continue; }
    
    // Create unique timestamps using session order
    const so = s.so || 1;
    const st = new Date(`${s.d}T04:${String((so - 1) % 60).padStart(2,'0')}:${String(Math.floor((so - 1) / 60) % 60).padStart(2,'0')}.000Z`);
    const et = new Date(st.getTime() + 3600000);
    
    payload.push({ classId: cid, teamId: tid, startTime: st.toISOString(), endTime: et.toISOString(), students: s.sts });
  }
  console.log(`  ${payload.length} sessions ready, ${skip} skipped (no class/team)`);

  let tSch = 0, tAtt = 0;
  for (let i = 0; i < payload.length; i += 30) {
    const batch = payload.slice(i, i + 30);
    try {
      const r = await post('/import/history', { sessions: batch });
      tSch += r.data?.schedulesCreated || 0;
      tAtt += r.data?.attendanceCreated || 0;
    } catch (e) {
      console.log(`  ❌ Batch at ${i}: ${e.message}`);
    }
    process.stdout.write(`\r  📊 ${Math.round(((i + batch.length) / payload.length) * 100)}% — ${tSch} sched, ${tAtt} att`);
  }

  console.log(`\n  ✅ ${tSch} schedules, ${tAtt} attendance records`);
  console.log('\n🎉 PHASE 1 COMPLETE');
  console.log(`  Classes: ${classesCreated} | Teams: ${teamsCreated} | Sched: ${tSch} | Att: ${tAtt}`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
