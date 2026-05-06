/**
 * ══════════════════════════════════════════════════════════
 * TMS v2 — EXTREME STRESS TEST + SECURITY ATTACK SIMULATOR
 * ══════════════════════════════════════════════════════════
 * 
 * This script hammers the server with:
 *   1. Massive concurrent connections (up to 500 concurrent)
 *   2. Brute-force login attempts
 *   3. NoSQL injection payloads
 *   4. IDOR probes
 *   5. Rate limiter exhaustion
 *   6. Regex DoS (ReDoS) attempts
 *   7. Oversized payload bombs
 *   8. Rapid-fire write operations
 *
 * Run: node tests/load/extreme-test.js
 *
 * ⚠️  This will STRESS your server. Run against localhost only.
 */

const http = require('http');
const https = require('https');

const BASE = 'http://localhost:5000';
const RESULTS = {
  total: 0, success: 0, blocked: 0, errors: 0, timeouts: 0,
  bypassed: 0, // security bypasses (BAD if > 0)
};
const TIMING = {};
const SECURITY_ISSUES = [];

// ── HTTP Helper ──────────────────────────────────────────
const request = (method, path, body = null, headers = {}, timeoutMs = 5000) => {
  return new Promise((resolve) => {
    const start = Date.now();
    const url = new URL(path, BASE);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      timeout: timeoutMs,
    };

    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const elapsed = Date.now() - start;
        RESULTS.total++;
        resolve({ status: res.statusCode, body: data, elapsed, headers: res.headers });
      });
    });

    req.on('error', (err) => {
      RESULTS.total++;
      if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') {
        RESULTS.errors++;
      }
      resolve({ status: 0, body: err.message, elapsed: Date.now() - start, error: true });
    });

    req.on('timeout', () => {
      RESULTS.total++;
      RESULTS.timeouts++;
      req.destroy();
      resolve({ status: 0, body: 'TIMEOUT', elapsed: Date.now() - start, error: true });
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

// ── Login helper ─────────────────────────────────────────
const login = async (empCode, password) => {
  const res = await request('POST', '/api/auth/login', { empCode, password });
  if (res.status === 200) {
    // Extract cookie
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
      const match = setCookie.find(c => c.startsWith('tms_token='));
      if (match) {
        return match.split(';')[0]; // "tms_token=xxx"
      }
    }
  }
  return null;
};

// ── Test Runner ──────────────────────────────────────────
const runTest = async (name, fn) => {
  const start = Date.now();
  process.stdout.write(`\n⚡ ${name}...`);
  try {
    await fn();
    const elapsed = Date.now() - start;
    TIMING[name] = elapsed;
    console.log(` ✅ (${elapsed}ms)`);
  } catch (err) {
    console.log(` ❌ ERROR: ${err.message}`);
  }
};

// ══════════════════════════════════════════════════════════
// TEST SUITES
// ══════════════════════════════════════════════════════════

// ── 1. BRUTE FORCE LOGIN ─────────────────────────────────
const testBruteForceLogin = async () => {
  console.log('\n   Sending 50 rapid login attempts with wrong passwords...');
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(request('POST', '/api/auth/login', {
      empCode: '000001',
      password: `wrongpass_${i}_abcdefgh`,
    }));
  }
  const results = await Promise.all(promises);

  const rateLimited = results.filter(r => r.status === 429).length;
  const unauthorized = results.filter(r => r.status === 401).length;
  const succeeded = results.filter(r => r.status === 200).length;

  console.log(`   📊 401: ${unauthorized} | 429 (rate-limited): ${rateLimited} | 200 (bypassed!): ${succeeded}`);
  RESULTS.blocked += rateLimited;

  if (succeeded > 0) {
    SECURITY_ISSUES.push('🔴 CRITICAL: Brute force login succeeded!');
    RESULTS.bypassed += succeeded;
  }
  if (rateLimited < 40) {
    SECURITY_ISSUES.push(`⚠️ WARNING: Only ${rateLimited}/50 login attempts were rate-limited`);
  }
};

// ── 2. NoSQL INJECTION ATTACKS ───────────────────────────
const testNoSQLInjection = async () => {
  console.log('\n   Testing 12 NoSQL injection payloads...');

  const cookie = await login('000001', 'admin12345');
  const authHeaders = cookie ? { Cookie: cookie } : {};

  const injections = [
    // Login bypass attempts
    { method: 'POST', path: '/api/auth/login', body: { empCode: { $gt: '' }, password: { $gt: '' } } },
    { method: 'POST', path: '/api/auth/login', body: { empCode: { $ne: null }, password: { $ne: null } } },
    { method: 'POST', path: '/api/auth/login', body: { empCode: '000001', password: { $regex: '.*' } } },
    { method: 'POST', path: '/api/auth/login', body: { empCode: { $regex: '.*' }, password: 'admin12345' } },

    // Query injection via URL params
    { method: 'GET', path: '/api/users?role[$ne]=null', body: null, auth: true },
    { method: 'GET', path: '/api/users?search[$regex]=.*', body: null, auth: true },
    { method: 'GET', path: '/api/users?status[$gt]=', body: null, auth: true },

    // Admin DB filter injection
    { method: 'GET', path: '/api/admin-db/user?filter={"password":{"$regex":"^\\\\$2b"}}', body: null, auth: true },
    { method: 'GET', path: '/api/admin-db/user?filter={"$where":"sleep(3000)"}', body: null, auth: true },
    { method: 'GET', path: '/api/admin-db/user?filter={"role":{"$ne":"Participant"}}', body: null, auth: true },

    // Body injection
    { method: 'POST', path: '/api/auth/login', body: { empCode: '000001', password: { $gt: '' }, $where: '1==1' } },
    { method: 'POST', path: '/api/auth/login', body: { empCode: { $in: ['000001', '000002'] }, password: 'admin12345' } },
  ];

  let blocked = 0, passed = 0;
  for (const inj of injections) {
    const headers = inj.auth ? authHeaders : {};
    const res = await request(inj.method, inj.path, inj.body, headers);

    if (res.status === 200) {
      // Check if it actually returned data it shouldn't
      try {
        const data = JSON.parse(res.body);
        if (data.data && (Array.isArray(data.data) ? data.data.length > 0 : data.data.user)) {
          // Injection returned valid data — potential bypass
          const hasPassword = res.body.includes('"password"');
          if (hasPassword) {
            SECURITY_ISSUES.push(`🔴 CRITICAL: NoSQL injection exposed passwords! Path: ${inj.path}`);
            RESULTS.bypassed++;
          }
          passed++;
        } else {
          blocked++;
        }
      } catch {
        blocked++;
      }
    } else {
      blocked++;
    }
  }

  console.log(`   📊 Blocked: ${blocked}/12 | Passed through: ${passed}/12`);
  RESULTS.blocked += blocked;

  if (passed > 0) {
    SECURITY_ISSUES.push(`⚠️ WARNING: ${passed} NoSQL injection payloads returned data`);
  }
};

// ── 3. IDOR (Insecure Direct Object Reference) ──────────
const testIDOR = async () => {
  console.log('\n   Testing IDOR with Participant credentials...');

  // Login as participant
  const partCookie = await login('000004', 'participant123');
  if (!partCookie) {
    console.log('   ⚠️ Could not login as participant, skipping IDOR tests');
    return;
  }
  const partHeaders = { Cookie: partCookie };

  const idorTests = [
    // Participant should NOT access these
    { path: '/api/users', expect: 403, desc: 'User list (Admin only)' },
    { path: '/api/teams', expect: 403, desc: 'Team list (Admin only)' },
    { path: '/api/admin-db/collections', expect: 403, desc: 'Admin DB (Admin only)' },
    { path: '/api/admin-db/user', expect: 403, desc: 'Admin DB query (Admin only)' },
    { path: '/api/dashboard/stats', expect: 403, desc: 'Dashboard (Admin only)' },
    { path: '/api/import/users', expect: 403, desc: 'Import (Admin only)' },
    { path: '/api/export/stats', expect: 403, desc: 'Export (Admin only)' },
    { path: '/api/settings', expect: 403, desc: 'Settings (Admin only)' },
    { path: '/api/attendance/analytics/by-employee', expect: 403, desc: 'Analytics (Admin/Teacher only)' },
    { path: '/api/attendance/analytics/by-team', expect: 403, desc: 'Team Analytics (Admin/Teacher only)' },
    { path: '/api/attendance/analytics/by-class', expect: 403, desc: 'Class Analytics (Admin/Teacher only)' },
  ];

  let blocked = 0, bypassed = 0;
  for (const test of idorTests) {
    const res = await request('GET', test.path, null, partHeaders);
    if (res.status === 403) {
      blocked++;
    } else if (res.status === 200) {
      bypassed++;
      SECURITY_ISSUES.push(`🔴 IDOR BYPASS: Participant accessed ${test.desc} (${test.path})`);
      RESULTS.bypassed++;
    } else {
      blocked++; // 401, 404, etc. are also "blocked"
    }
  }

  console.log(`   📊 Blocked: ${blocked}/${idorTests.length} | Bypassed: ${bypassed}/${idorTests.length}`);
  RESULTS.blocked += blocked;
};

// ── 4. ReDoS (Regular Expression Denial of Service) ──────
const testReDoS = async () => {
  console.log('\n   Testing ReDoS with evil regex patterns...');

  const cookie = await login('000001', 'admin12345');
  const authHeaders = cookie ? { Cookie: cookie } : {};

  const evilPatterns = [
    'a'.repeat(50000),  // Very long string
    '(a+)+$',           // Classic ReDoS
    '.*'.repeat(100),   // Wildcard spam
    '(?='.repeat(100) + 'a' + ')'.repeat(100), // Nested lookahead
    '[' + 'a-z'.repeat(1000) + ']',  // Huge character class
  ];

  let allFast = true;
  for (const pattern of evilPatterns) {
    const start = Date.now();
    const res = await request('GET', `/api/users?search=${encodeURIComponent(pattern)}`, null, authHeaders, 3000);
    const elapsed = Date.now() - start;

    if (elapsed > 2000) {
      allFast = false;
      SECURITY_ISSUES.push(`⚠️ ReDoS: Search took ${elapsed}ms with pattern length ${pattern.length}`);
    }
  }

  if (allFast) {
    console.log('   📊 All ReDoS patterns responded quickly ✅');
  }

  // Also test admin-db search
  for (const pattern of evilPatterns.slice(0, 3)) {
    const res = await request('GET', `/api/admin-db/user?search=${encodeURIComponent(pattern)}`, null, authHeaders, 3000);
  }
  console.log('   📊 Admin DB search ReDoS tests completed');
};

// ── 5. PAYLOAD BOMB ──────────────────────────────────────
const testPayloadBomb = async () => {
  console.log('\n   Testing oversized payload handling...');

  const cookie = await login('000001', 'admin12345');
  const authHeaders = cookie ? { Cookie: cookie } : {};

  // 15MB payload (should be rejected — limit is 10MB)
  const bigPayload = { data: 'x'.repeat(15 * 1024 * 1024) };
  const res1 = await request('POST', '/api/users', bigPayload, authHeaders, 5000);
  if (res1.status === 413 || res1.status === 400 || res1.error) {
    console.log(`   📊 15MB payload rejected (${res1.status || 'connection error'}) ✅`);
    RESULTS.blocked++;
  } else {
    SECURITY_ISSUES.push('⚠️ Server accepted 15MB payload!');
  }

  // Deeply nested JSON (prototype pollution attempt)
  let nested = { a: 'x' };
  for (let i = 0; i < 100; i++) nested = { a: nested };
  const res2 = await request('POST', '/api/auth/login', nested, {});
  console.log(`   📊 Deeply nested JSON: status ${res2.status}`);
  RESULTS.blocked++;

  // Array bomb
  const arrayBomb = { users: Array(10000).fill({ empCode: 'BOMB', name: 'test', role: 'Participant', password: 'aaaaaaaaaa' }) };
  const res3 = await request('POST', '/api/import/users', arrayBomb, authHeaders, 10000);
  if (res3.status === 400 || res3.status === 429) {
    console.log(`   📊 Array bomb (10,000 items) rejected (${res3.status}) ✅`);
    RESULTS.blocked++;
  } else {
    console.log(`   📊 Array bomb response: ${res3.status}`);
  }
};

// ── 6. CONCURRENT CONNECTION FLOOD ───────────────────────
const testConnectionFlood = async () => {
  console.log('\n   Flooding with 500 simultaneous connections...');

  const start = Date.now();
  const promises = [];
  for (let i = 0; i < 500; i++) {
    promises.push(request('GET', '/api/health', null, {}, 10000));
  }

  const results = await Promise.all(promises);
  const elapsed = Date.now() - start;

  const ok = results.filter(r => r.status === 200).length;
  const rateLimited = results.filter(r => r.status === 429).length;
  const errors = results.filter(r => r.error).length;
  const avgTime = results.reduce((sum, r) => sum + r.elapsed, 0) / results.length;
  const maxTime = Math.max(...results.map(r => r.elapsed));
  const p95 = results.map(r => r.elapsed).sort((a, b) => a - b)[Math.floor(results.length * 0.95)];

  console.log(`   📊 500 concurrent connections in ${elapsed}ms:`);
  console.log(`      200 OK: ${ok} | 429 Rate-limited: ${rateLimited} | Errors: ${errors}`);
  console.log(`      Avg: ${avgTime.toFixed(0)}ms | p95: ${p95}ms | Max: ${maxTime}ms`);
  
  RESULTS.success += ok;
  RESULTS.blocked += rateLimited;
  RESULTS.errors += errors;

  if (errors > 50) {
    SECURITY_ISSUES.push(`⚠️ ${errors}/500 connections failed — server may be dropping connections`);
  }
};

// ── 7. RAPID WRITE SPAM ──────────────────────────────────
const testWriteSpam = async () => {
  console.log('\n   Rapid-fire 100 write requests in parallel...');

  const cookie = await login('000001', 'admin12345');
  if (!cookie) {
    console.log('   ⚠️ Could not login, skipping write spam test');
    return;
  }
  const authHeaders = { Cookie: cookie };

  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(request('PUT', '/api/settings', {
      settings: [{ key: 'ALLOWED_TIME_SLOTS', value: [{ sh: 9, sm: 0, eh: 10, em: 0 }] }]
    }, authHeaders));
  }

  const results = await Promise.all(promises);
  const ok = results.filter(r => r.status === 200).length;
  const rateLimited = results.filter(r => r.status === 429).length;

  console.log(`   📊 200 OK: ${ok} | 429 Rate-limited: ${rateLimited}`);
  RESULTS.blocked += rateLimited;

  if (rateLimited < 30) {
    SECURITY_ISSUES.push(`⚠️ Only ${rateLimited}/100 rapid writes were rate-limited`);
  }
};

// ── 8. UNAUTHORIZED ACCESS WITHOUT TOKEN ─────────────────
const testNoTokenAccess = async () => {
  console.log('\n   Testing 15 protected endpoints without authentication...');

  const protectedEndpoints = [
    '/api/users', '/api/teams', '/api/classes',
    '/api/schedules', '/api/attendance/analytics/by-employee',
    '/api/evaluations', '/api/enrollments',
    '/api/dashboard/stats', '/api/dashboard/filter-options',
    '/api/export/stats', '/api/export/attendance',
    '/api/sync/status', '/api/settings',
    '/api/admin-db/collections', '/api/admin-db/user',
  ];

  let blocked = 0, leaked = 0;
  for (const ep of protectedEndpoints) {
    const res = await request('GET', ep);
    if (res.status === 401 || res.status === 403) {
      blocked++;
    } else if (res.status === 200) {
      leaked++;
      SECURITY_ISSUES.push(`🔴 CRITICAL: ${ep} accessible WITHOUT authentication!`);
      RESULTS.bypassed++;
    } else {
      blocked++; // 404, 429, etc.
    }
  }

  console.log(`   📊 Blocked: ${blocked}/15 | Leaked: ${leaked}/15`);
  RESULTS.blocked += blocked;
};

// ── 9. SUSTAINED HIGH-LOAD STRESS (60 seconds) ──────────
const testSustainedLoad = async () => {
  console.log('\n   Sustained 200 req/sec for 15 seconds (3,000 total)...');

  const startAll = Date.now();
  const batchSize = 200;
  const durationSec = 15;
  let totalSent = 0;
  const allResults = [];

  for (let sec = 0; sec < durationSec; sec++) {
    const batchStart = Date.now();
    const promises = [];
    for (let i = 0; i < batchSize; i++) {
      promises.push(request('GET', '/api/health', null, {}, 5000));
      totalSent++;
    }
    const results = await Promise.all(promises);
    allResults.push(...results);

    // Wait for remaining time in this second
    const batchElapsed = Date.now() - batchStart;
    if (batchElapsed < 1000) {
      await new Promise(r => setTimeout(r, 1000 - batchElapsed));
    }

    const ok = results.filter(r => r.status === 200).length;
    const limited = results.filter(r => r.status === 429).length;
    const errs = results.filter(r => r.error).length;
    process.stdout.write(`\r   [${sec + 1}/${durationSec}s] sent: ${totalSent} | 200: ${ok} | 429: ${limited} | err: ${errs}    `);
  }

  const totalElapsed = Date.now() - startAll;
  const totalOk = allResults.filter(r => r.status === 200).length;
  const totalLimited = allResults.filter(r => r.status === 429).length;
  const totalErrors = allResults.filter(r => r.error).length;
  const avgTime = allResults.filter(r => !r.error).reduce((s, r) => s + r.elapsed, 0) / allResults.filter(r => !r.error).length;
  const times = allResults.filter(r => !r.error).map(r => r.elapsed).sort((a, b) => a - b);
  const p99 = times[Math.floor(times.length * 0.99)] || 0;

  console.log(`\n   📊 SUSTAINED LOAD RESULTS (${totalElapsed}ms):`);
  console.log(`      Total: ${totalSent} | OK: ${totalOk} | Rate-limited: ${totalLimited} | Errors: ${totalErrors}`);
  console.log(`      Avg response: ${avgTime.toFixed(1)}ms | p99: ${p99}ms`);
  console.log(`      Throughput: ${(totalSent / (totalElapsed / 1000)).toFixed(0)} req/sec`);

  RESULTS.success += totalOk;
  RESULTS.blocked += totalLimited;
  RESULTS.errors += totalErrors;

  if (totalErrors > totalSent * 0.05) {
    SECURITY_ISSUES.push(`🔴 ${totalErrors}/${totalSent} requests failed under sustained load (${(totalErrors/totalSent*100).toFixed(1)}%)`);
  }
};

// ══════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════
const main = async () => {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  🔥 TMS v2 — EXTREME STRESS + SECURITY ATTACK TEST     ║');
  console.log('║  Target: http://localhost:5000                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Verify server is up
  const health = await request('GET', '/api/health');
  if (health.status !== 200) {
    console.log('\n❌ Server is not responding! Start the server first.');
    process.exit(1);
  }
  console.log(`\n✅ Server is UP (response: ${health.elapsed}ms)`);

  const startTime = Date.now();

  await runTest('1. BRUTE FORCE LOGIN (50 attempts)', testBruteForceLogin);
  await runTest('2. NoSQL INJECTION (12 payloads)', testNoSQLInjection);
  await runTest('3. IDOR PROBES (Participant → Admin routes)', testIDOR);
  await runTest('4. ReDoS PATTERNS (evil regex)', testReDoS);
  await runTest('5. PAYLOAD BOMBS (oversized + nested)', testPayloadBomb);
  await runTest('6. CONNECTION FLOOD (500 concurrent)', testConnectionFlood);
  await runTest('7. RAPID WRITE SPAM (100 parallel writes)', testWriteSpam);
  await runTest('8. UNAUTHENTICATED ACCESS (15 endpoints)', testNoTokenAccess);
  await runTest('9. SUSTAINED LOAD (200 req/s × 15 sec)', testSustainedLoad);

  const totalTime = Date.now() - startTime;

  // ── FINAL REPORT ───────────────────────────────────────
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                    📊 FINAL REPORT                      ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Total Requests:    ${String(RESULTS.total).padStart(6)}                             ║`);
  console.log(`║  Successful (200):  ${String(RESULTS.success).padStart(6)}                             ║`);
  console.log(`║  Blocked (403/429): ${String(RESULTS.blocked).padStart(6)}                             ║`);
  console.log(`║  Errors:            ${String(RESULTS.errors).padStart(6)}                             ║`);
  console.log(`║  Timeouts:          ${String(RESULTS.timeouts).padStart(6)}                             ║`);
  console.log(`║  SECURITY BYPASSES: ${String(RESULTS.bypassed).padStart(6)}                             ║`);
  console.log(`║  Total Time:     ${(totalTime / 1000).toFixed(1)}s                              ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');

  if (SECURITY_ISSUES.length === 0) {
    console.log('║  ✅ NO SECURITY ISSUES FOUND                            ║');
    console.log('║  🛡️  ALL ATTACKS WERE BLOCKED                           ║');
  } else {
    console.log(`║  ⚠️  ${SECURITY_ISSUES.length} SECURITY ISSUE(S) FOUND:                          ║`);
    console.log('╠══════════════════════════════════════════════════════════╣');
    for (const issue of SECURITY_ISSUES) {
      console.log(`║  ${issue.padEnd(56)}║`);
    }
  }

  console.log('╠══════════════════════════════════════════════════════════╣');

  // Grade
  const grade = RESULTS.bypassed === 0 && SECURITY_ISSUES.length <= 2
    ? '🟢 A — PRODUCTION READY'
    : RESULTS.bypassed === 0
      ? '🟡 B — MINOR ISSUES'
      : RESULTS.bypassed <= 3
        ? '🟠 C — NEEDS FIXES'
        : '🔴 F — CRITICAL VULNERABILITIES';

  console.log(`║  GRADE: ${grade.padEnd(48)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
};

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
