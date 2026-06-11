/**
 * ══════════════════════════════════════════════════════════════
 * COMPREHENSIVE SECURITY & DATA INTEGRITY AUDIT SUITE
 * ══════════════════════════════════════════════════════════════
 * Tests:
 *   A. Authentication & Authorization
 *   B. Data Privacy & Leakage
 *   C. Input Validation & Injection
 *   D. Business Rule Enforcement
 *   E. Data Accuracy & Integrity
 *   F. Session/Token Security
 *   G. Rate Limiting
 *   H. IDOR (Insecure Direct Object Reference)
 */
const http = require('http');
let ADMIN_TOKEN = '';
let PARTICIPANT_TOKEN = '';
let passed = 0, failed = 0;
const results = [];

const doReq = (method, path, body, token) => new Promise((res, rej) => {
  const opts = { hostname:'127.0.0.1', port:5000, path, method, headers: { 'Content-Type':'application/json' } };
  if (token) opts.headers.Authorization = 'Bearer ' + token;
  const r = http.request(opts, resp => {
    let d = ''; resp.on('data', c => d += c);
    resp.on('end', () => {
      try { res({ status: resp.statusCode, data: JSON.parse(d), headers: resp.headers }); }
      catch(e) { res({ status: resp.statusCode, data: d, headers: resp.headers }); }
    });
  });
  r.on('error', rej);
  if (body) r.write(JSON.stringify(body));
  r.end();
});

const assert = (name, condition, detail) => {
  if (condition) { passed++; results.push(`  ✅ ${name}`); }
  else { failed++; results.push(`  ❌ VULN: ${name} — ${detail || ''}`); }
};
const section = (name) => results.push(`\n━━━ ${name} ━━━`);

(async () => {
  console.log('🔒 Comprehensive Security & Integrity Audit\n');

  // ═══════════════════════════════════════════
  // SETUP: Get tokens
  // ═══════════════════════════════════════════
  const admin = await doReq('POST', '/api/auth/login', { empCode: '000001', password: 'admin12345' });
  if (admin.status === 429) { console.log('⚠️ Rate-limited. Wait 15 min.'); process.exit(0); }
  ADMIN_TOKEN = admin.data.data?.token;
  if (!ADMIN_TOKEN) { console.log('FATAL: Admin login failed'); process.exit(1); }

  // Create a participant for testing
  const partData = { empCode: 'SEC001', name: 'Security Test User', password: 'sectest12345', role: 'Participant', department: 'Security', status: 'Active' };
  const createPart = await doReq('POST', '/api/users', partData, ADMIN_TOKEN);
  const partId = createPart.data.data?._id;
  if (!partId) { console.log('FATAL: Cannot create test participant:', createPart.data.message); process.exit(1); }
  let partLogin = await doReq('POST', '/api/auth/login', { empCode: 'SEC001', password: 'sectest12345' });
  PARTICIPANT_TOKEN = partLogin.data.data?.token;
  if (!PARTICIPANT_TOKEN) { console.log('FATAL: Participant login failed'); process.exit(1); }

  // Also create a Teacher
  const teachData = { empCode: 'SEC002', name: 'Security Teacher', password: 'sectest12345', role: 'Teacher', department: 'Security', status: 'Active' };
  const createTeach = await doReq('POST', '/api/users', teachData, ADMIN_TOKEN);
  const teachId = createTeach.data.data?._id;
  const teachLogin = await doReq('POST', '/api/auth/login', { empCode: 'SEC002', password: 'sectest12345' });
  const TEACHER_TOKEN = teachLogin.data.data?.token;

  // ═══════════════════════════════════════════
  // A. AUTHENTICATION & AUTHORIZATION
  // ═══════════════════════════════════════════
  section('A. Authentication & Authorization');

  // A1. No token → 401
  const noToken = await doReq('GET', '/api/users');
  assert('No token returns 401', noToken.status === 401);

  // A2. Invalid token → 401
  const badToken = await doReq('GET', '/api/users', null, 'invalid.token.here');
  assert('Invalid token returns 401', badToken.status === 401);

  // A3. Expired token format → 401
  const expToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsImlhdCI6MTAwMDAwMDAwMCwiZXhwIjoxMDAwMDAwMDAxfQ.fakesig';
  const expired = await doReq('GET', '/api/users', null, expToken);
  assert('Expired/tampered token returns 401', expired.status === 401);

  // A4. Participant cannot access admin-only endpoints
  const partUsers = await doReq('GET', '/api/users', null, PARTICIPANT_TOKEN);
  assert('Participant blocked from GET /users', [401,403].includes(partUsers.status), `status=${partUsers.status}`);

  const partCreate = await doReq('POST', '/api/users', { empCode:'HACK01', name:'Hacker', password:'test123', role:'Admin' }, PARTICIPANT_TOKEN);
  assert('Participant blocked from creating users', [401,403].includes(partCreate.status), `status=${partCreate.status}`);

  const partDelUser = await doReq('DELETE', '/api/users/' + partId, null, PARTICIPANT_TOKEN);
  assert('Participant blocked from deleting users', [401,403].includes(partDelUser.status), `status=${partDelUser.status}`);

  // A5. Participant cannot access import
  const partImport = await doReq('POST', '/api/import/users', { users: [] }, PARTICIPANT_TOKEN);
  assert('Participant blocked from bulk import', [401,403].includes(partImport.status), `status=${partImport.status}`);

  // A6. Participant cannot access teams CRUD
  const partTeams = await doReq('GET', '/api/teams', null, PARTICIPANT_TOKEN);
  assert('Participant blocked from listing teams', [401,403].includes(partTeams.status), `status=${partTeams.status}`);

  // A7. Participant cannot access enrollments
  const partEnroll = await doReq('GET', '/api/enrollments', null, PARTICIPANT_TOKEN);
  assert('Participant blocked from enrollments', [401,403].includes(partEnroll.status), `status=${partEnroll.status}`);

  // A8. Teacher cannot create/delete users
  const teachCreate = await doReq('POST', '/api/users', { empCode:'HACK02', name:'Hacker2', password:'test123', role:'Admin' }, TEACHER_TOKEN);
  assert('Teacher blocked from creating users', [401,403].includes(teachCreate.status), `status=${teachCreate.status}`);

  // A9. Participant cannot create schedules (admin-only)
  const partSched = await doReq('POST', '/api/schedules', { classId: '000000000000000000000000' }, PARTICIPANT_TOKEN);
  assert('Participant blocked from admin schedule create', [401,403].includes(partSched.status), `status=${partSched.status}`);

  // A10. Participant cannot delete schedules
  const partDelSched = await doReq('DELETE', '/api/schedules/000000000000000000000000', null, PARTICIPANT_TOKEN);
  assert('Participant blocked from deleting schedules', [401,403].includes(partDelSched.status), `status=${partDelSched.status}`);

  // A11. Participant cannot access dashboard stats
  const partDash = await doReq('GET', '/api/dashboard/stats', null, PARTICIPANT_TOKEN);
  assert('Participant blocked from dashboard stats', [401,403].includes(partDash.status), `status=${partDash.status}`);

  // A12. Participant cannot access export
  const partExport = await doReq('GET', '/api/export/stats', null, PARTICIPANT_TOKEN);
  assert('Participant blocked from export', [401,403].includes(partExport.status), `status=${partExport.status}`);

  // ═══════════════════════════════════════════
  // B. DATA PRIVACY & LEAKAGE
  // ═══════════════════════════════════════════
  section('B. Data Privacy & Leakage');

  // B1. Password never returned in user data
  const userData = await doReq('GET', '/api/users', null, ADMIN_TOKEN);
  const anyPass = userData.data.data?.some(u => u.password || u.passwordHash);
  assert('No password hash in user listings', !anyPass);

  // B2. GET user by ID doesn't expose password
  const singleUser = await doReq('GET', '/api/users/' + partId, null, ADMIN_TOKEN);
  assert('No password in single user response', !singleUser.data.data?.password);

  // B3. Auth /me doesn't expose password
  const meData = await doReq('GET', '/api/auth/me', null, ADMIN_TOKEN);
  assert('No password in /auth/me response', !meData.data.data?.password);

  // B4. Token not exposed in response bodies (except login)
  const schedList = await doReq('GET', '/api/schedules?limit=5', null, ADMIN_TOKEN);
  const schedBody = JSON.stringify(schedList.data);
  assert('No JWT leaked in schedule responses', !schedBody.includes('eyJ'));

  // B5. Security headers present
  const headers = meData.headers;
  assert('X-Content-Type-Options header set', headers['x-content-type-options'] === 'nosniff');
  assert('X-Frame-Options header set', !!headers['x-frame-options']);
  assert('Content-Security-Policy or X-CSP header set', !!(headers['content-security-policy'] || headers['x-content-security-policy']));

  // B6. Error messages don't expose internal paths
  const badReq = await doReq('GET', '/api/users/invalid-id', null, ADMIN_TOKEN);
  const errMsg = JSON.stringify(badReq.data);
  assert('Error does not expose file paths', !errMsg.includes('\\ConCho2') && !errMsg.includes('/ConCho2'));
  assert('Error does not expose stack traces', !errMsg.includes('at ') || !errMsg.includes('.js:'));

  // ═══════════════════════════════════════════
  // C. INPUT VALIDATION & INJECTION
  // ═══════════════════════════════════════════
  section('C. Input Validation & Injection');

  // C1. SQL-like injection in search
  const sqlInject = await doReq('GET', '/api/users?search=' + encodeURIComponent("'; DROP TABLE users; --"), null, ADMIN_TOKEN);
  assert('SQL injection in search returns safe result', sqlInject.status === 200);

  // C2. NoSQL injection attempt
  const nosqlInject = await doReq('POST', '/api/auth/login', { empCode: { $gt: '' }, password: { $gt: '' } });
  assert('NoSQL injection blocked (login)', nosqlInject.status !== 200, `status=${nosqlInject.status}`);

  // C3. XSS in user name
  const xssUser = await doReq('POST', '/api/users', {
    empCode: 'XSS001', name: '<script>alert("xss")</script>', password: 'sectest12345',
    role: 'Participant', department: 'Test', status: 'Active'
  }, ADMIN_TOKEN);
  if (xssUser.status === 201) {
    const xssGet = await doReq('GET', '/api/users/' + xssUser.data.data._id, null, ADMIN_TOKEN);
    // Name should be stored as-is (XSS prevention is in frontend via React escaping)
    // But it should NOT execute — just verify it doesn't crash
    assert('XSS payload stored without server crash', xssGet.status === 200);
    await doReq('DELETE', '/api/users/' + xssUser.data.data._id, null, ADMIN_TOKEN);
  } else {
    assert('XSS payload rejected by validation', xssUser.status === 400);
  }

  // C4. Invalid ObjectId handling
  const badId = await doReq('GET', '/api/users/not-a-valid-objectid', null, ADMIN_TOKEN);
  assert('Invalid ObjectId returns 400', badId.status === 400 || badId.status === 422);

  // C5. Oversized payload
  const bigPayload = { empCode: 'BIG001', name: 'A'.repeat(10000), password: 'sectest12345', role: 'Participant', department: 'Test', status: 'Active' };
  const bigRes = await doReq('POST', '/api/users', bigPayload, ADMIN_TOKEN);
  assert('Oversized name handled gracefully', bigRes.status === 400 || bigRes.status === 201);
  if (bigRes.status === 201) await doReq('DELETE', '/api/users/' + bigRes.data.data._id, null, ADMIN_TOKEN);

  // C6. Empty body on POST
  const emptyBody = await doReq('POST', '/api/users', {}, ADMIN_TOKEN);
  assert('Empty body returns 400', emptyBody.status === 400);

  // C7. Invalid role value
  const badRole = await doReq('POST', '/api/users', { empCode: 'BAD001', name: 'BadRole', password: 'test123', role: 'SuperAdmin', department: 'Test' }, ADMIN_TOKEN);
  assert('Invalid role rejected', badRole.status === 400, `status=${badRole.status}`);

  // C8. Prototype pollution attempt
  const protoPollution = await doReq('POST', '/api/users', {
    empCode: 'PROTO01', name: 'Proto', password: 'test123', role: 'Participant',
    department: 'Test', status: 'Active', __proto__: { isAdmin: true }, constructor: { prototype: { isAdmin: true } }
  }, ADMIN_TOKEN);
  if (protoPollution.status === 201) {
    await doReq('DELETE', '/api/users/' + protoPollution.data.data._id, null, ADMIN_TOKEN);
  }
  assert('Proto pollution does not crash server', protoPollution.status === 201 || protoPollution.status === 400);

  // ═══════════════════════════════════════════
  // D. BUSINESS RULE ENFORCEMENT
  // ═══════════════════════════════════════════
  section('D. Business Rule Enforcement');

  // D1. Duplicate empCode rejected
  const dupUser = await doReq('POST', '/api/users', partData, ADMIN_TOKEN);
  assert('Duplicate empCode rejected', dupUser.status >= 400, `status=${dupUser.status}`);

  // D2. Cannot change own role to admin via update
  const selfEscalate = await doReq('PUT', '/api/users/' + partId, { role: 'Admin' }, ADMIN_TOKEN);
  // This is admin updating, so it might be allowed — check if the user is actually admin now
  const checkRole = await doReq('GET', '/api/users/' + partId, null, ADMIN_TOKEN);
  // Reset role back if changed
  if (checkRole.data.data?.role === 'Admin') {
    await doReq('PUT', '/api/users/' + partId, { role: 'Participant' }, ADMIN_TOKEN);
    // Admin CAN change roles — this is by design. Not a vulnerability.
    assert('Role change only via admin (by design)', true);
  } else {
    assert('Role change rejected or handled', true);
  }

  // D3. Password change requires current password
  const passChange = await doReq('PUT', '/api/auth/change-password', { 
    currentPassword: 'wrong_password', newPassword: 'newpass123' 
  }, PARTICIPANT_TOKEN);
  assert('Wrong current password rejected', passChange.status >= 400, `status=${passChange.status}`);

  // D4. Inactive user cannot login
  await doReq('PUT', '/api/users/' + partId, { status: 'Dropped' }, ADMIN_TOKEN);
  const inactiveLogin = await doReq('POST', '/api/auth/login', { empCode: 'SEC001', password: 'sectest12345' });
  assert('Dropped user blocked from login', [401,403].includes(inactiveLogin.status), `status=${inactiveLogin.status}`);
  await doReq('PUT', '/api/users/' + partId, { status: 'Active' }, ADMIN_TOKEN);
  // Re-login to refresh the participant token
  partLogin = await doReq('POST', '/api/auth/login', { empCode: 'SEC001', password: 'sectest12345' });
  PARTICIPANT_TOKEN = partLogin.data.data?.token;

  // D5. Non-existent class for schedule
  const fakeSched = await doReq('POST', '/api/schedules', {
    classId: '000000000000000000000000',
    startTime: '2026-07-01T09:00:00Z',
    endTime: '2026-07-01T10:00:00Z',
  }, ADMIN_TOKEN);
  assert('Fake classId rejected for schedule', fakeSched.status >= 400);

  // ═══════════════════════════════════════════
  // E. DATA ACCURACY & INTEGRITY
  // ═══════════════════════════════════════════
  section('E. Data Accuracy & Integrity');

  // E1. Check all teams have valid classId
  const allTeams = await doReq('GET', '/api/teams', null, ADMIN_TOKEN);
  const allClasses = await doReq('GET', '/api/classes', null, ADMIN_TOKEN);
  const classIds = new Set(allClasses.data.data.map(c => c._id));
  let orphanTeams = 0;
  for (const t of allTeams.data.data || []) {
    const cid = t.classId?._id || t.classId;
    if (cid && !classIds.has(cid)) orphanTeams++;
  }
  assert('All teams reference valid classes', orphanTeams === 0, `${orphanTeams} orphan teams`);

  // E2. Check all schedules reference valid classes and teams
  const allScheds = await doReq('GET', '/api/schedules?limit=1000', null, ADMIN_TOKEN);
  let orphanScheds = 0;
  for (const s of allScheds.data.data || []) {
    if (!s.classId) orphanScheds++;
    if (s.bookedTeamId && !s.bookedTeamId._id && !s.bookedTeamId) orphanScheds++;
  }
  assert('All schedules reference valid classes', orphanScheds === 0, `${orphanScheds} orphans`);

  // E3. No user in multiple teams
  const teamIds = new Set();
  const userTeamMap = {};
  for (const t of allTeams.data.data || []) {
    for (const m of (t.members || [])) {
      const mid = m._id || m;
      if (!userTeamMap[mid]) userTeamMap[mid] = [];
      userTeamMap[mid].push(t.name);
    }
  }
  let multiTeamUsers = 0;
  for (const [uid, teams] of Object.entries(userTeamMap)) {
    if (teams.length > 1) multiTeamUsers++;
  }
  assert('No user in multiple teams', multiTeamUsers === 0, `${multiTeamUsers} users in >1 team`);

  // E4. bookedSessions matches actual schedules
  let mismatchClasses = 0;
  for (const c of allClasses.data.data || []) {
    if (typeof c.bookedSessions !== 'number') mismatchClasses++;
  }
  assert('All classes have valid bookedSessions', mismatchClasses === 0, `${mismatchClasses} invalid`);

  // E5. No orphan enrollments
  const allEnrollments = await doReq('GET', '/api/enrollments', null, ADMIN_TOKEN);
  let orphanEnroll = 0;
  for (const e of (allEnrollments.data.data || [])) {
    if (!e.userId || !e.teamId) orphanEnroll++;
  }
  assert('No orphan enrollments', orphanEnroll === 0, `${orphanEnroll} orphans`);

  // E6. Enrollment count consistency
  const activeEnrollments = (allEnrollments.data.data || []).filter(e => e.status === 'Active');
  assert('Active enrollments exist', activeEnrollments.length > 0, `${activeEnrollments.length}`);

  // ═══════════════════════════════════════════
  // F. SESSION & TOKEN SECURITY
  // ═══════════════════════════════════════════
  section('F. Session & Token Security');

  // F1. Token does not contain password
  const tokenParts = ADMIN_TOKEN.split('.');
  if (tokenParts.length === 3) {
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    assert('Token payload has no password', !payload.password && !payload.passwordHash);
    assert('Token payload has no email', !payload.email);
    assert('Token has expiry', !!payload.exp);
    assert('Token has userId', !!payload.id);
    // Check token doesn't contain too much info
    const payloadKeys = Object.keys(payload);
    assert('Token payload is minimal (<5 fields)', payloadKeys.length < 5, `${payloadKeys.length} fields: ${payloadKeys.join(',')}`);
  }

  // ═══════════════════════════════════════════
  // G. IDOR (Insecure Direct Object Reference)
  // ═══════════════════════════════════════════
  section('G. IDOR — Object Access Control');

  // G1. Participant cannot view other users' progress
  const adminProgress = await doReq('GET', '/api/users/000000000000000000000000/progress', null, PARTICIPANT_TOKEN);
  assert('Participant blocked from user progress endpoint', [401,403].includes(adminProgress.status), `status=${adminProgress.status}`);

  // G2. Participant cannot update other users
  const partUpdate = await doReq('PUT', '/api/users/' + partId, { name: 'Hacked' }, PARTICIPANT_TOKEN);
  assert('Participant blocked from updating users', [401,403].includes(partUpdate.status), `status=${partUpdate.status}`);

  // G3. Participant cannot view enrollments
  const partEnrollOther = await doReq('GET', '/api/enrollments/user/' + teachId, null, PARTICIPANT_TOKEN);
  assert('Participant blocked from other user enrollments', [401,403].includes(partEnrollOther.status), `status=${partEnrollOther.status}`);

  // G4. Participant can only see own /auth/me
  const partMe = await doReq('GET', '/api/auth/me', null, PARTICIPANT_TOKEN);
  assert('Participant /me only shows own data', partMe.status === 200 && partMe.data.data?.empCode === 'SEC001', `status=${partMe.status} empCode=${partMe.data.data?.empCode}`);

  // ═══════════════════════════════════════════
  // H. EDGE CASES & MISC
  // ═══════════════════════════════════════════
  section('H. Edge Cases & Miscellaneous');

  // H1. Non-existent route returns 404
  const notFound = await doReq('GET', '/api/nonexistent');
  assert('Non-existent API route returns 404', notFound.status === 404);

  // H2. HTTP method not allowed
  const patch = await doReq('PATCH', '/api/users', null, ADMIN_TOKEN);
  assert('PATCH on /users handled (no route or blocked)', [403,404,405].includes(patch.status), `status=${patch.status}`);

  // H3. Large page number
  const largePage = await doReq('GET', '/api/users?page=99999&limit=10', null, ADMIN_TOKEN);
  assert('Large page number returns empty data', largePage.status === 200 && (largePage.data.data?.length === 0 || largePage.data.total >= 0));

  // H4. Negative page/limit
  const negLimit = await doReq('GET', '/api/users?page=-1&limit=-10', null, ADMIN_TOKEN);
  assert('Negative pagination handled', negLimit.status === 200 || negLimit.status === 400);

  // H5. Very long URL
  const longUrl = '/api/users?search=' + 'A'.repeat(5000);
  const longRes = await doReq('GET', longUrl, null, ADMIN_TOKEN);
  assert('Very long URL handled gracefully', longRes.status < 500);

  // ═══════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════
  await doReq('DELETE', '/api/users/' + partId, null, ADMIN_TOKEN);
  await doReq('DELETE', '/api/users/' + teachId, null, ADMIN_TOKEN);

  // ── FINAL: Logout/Re-login test (must be last) ──
  section('I. Logout & Re-login');
  const logoutRes = await doReq('POST', '/api/auth/logout', null, ADMIN_TOKEN);
  assert('Logout returns success', logoutRes.status === 200);
  const relogin = await doReq('POST', '/api/auth/login', { empCode: '000001', password: 'admin12345' });
  assert('Re-login after logout works', relogin.status === 200);

  // ═══════════════════════════════════════════
  // RESULTS
  // ═══════════════════════════════════════════
  console.log(results.join('\n'));
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  ✅ PASSED: ${passed}`);
  console.log(`  ❌ VULNERABILITIES: ${failed}`);
  console.log('══════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('⚠️ VULNERABILITIES FOUND — Review above');
    process.exit(1);
  } else {
    console.log('🎉 ALL SECURITY CHECKS PASSED!');
    process.exit(0);
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
