/**
 * audit-route-permission-diff.js — Phase 08 docs audit helper (DOCS- series).
 *
 * Diffs the base-path inventory mounted by server.js against
 * docs/route-permission-matrix.md, exiting 1 on a non-empty diff so audits can
 * gate on it.
 *
 * Express 5 note (2026-06-16): Express 5 + path-to-regexp 8 compile each mount
 * into an opaque `match()` function — `layer.regexp`/`layer.path` are undefined,
 * so the old live-introspection of `app._router.stack` could no longer recover
 * mount prefixes (it returned bare leaf paths like `/:id`). We now SOURCE-PARSE
 * server.js (plus the health router it mounts at `/` and `/api`) for mount
 * prefixes — robust and framework-version independent. Base-path granularity is
 * unchanged, so the matrix contract is the same.
 *
 * Usage:  node server/scripts/audit-route-permission-diff.js [--mounts]
 *   --mounts  also print the parsed code base-path inventory
 */

const fs = require('fs');
const path = require('path');

const SERVER_FILE = path.join(__dirname, '..', 'server.js');
const HEALTH_FILE = path.join(__dirname, '..', 'routes', 'healthRoutes.js');
const MATRIX_FILE = path.join(__dirname, '..', '..', 'docs', 'route-permission-matrix.md');

// Base path = the first segment for non-/api probes (/health, /ready), the
// first two segments for /api/* , or three for /api/admin/* — matching the
// matrix's row granularity.
function basePath(p) {
  const seg = p.split('/').filter(Boolean);
  if (seg[0] !== 'api') return '/' + (seg[0] || '');
  if (seg[1] === 'admin') return '/' + seg.slice(0, 3).join('/');
  return '/' + seg.slice(0, 2).join('/');
}

// ── Code base paths (source-parsed) ─────────────────────────────────
const serverSrc = fs.readFileSync(SERVER_FILE, 'utf8');
const codeBases = new Set();

// `app.use('/api/...', ...)` domain + admin mounts (the bulk of the surface).
for (const m of serverSrc.matchAll(/app\.use\(\s*['"`](\/api\/[^'"`]+)['"`]/g)) {
  codeBases.add(basePath(m[1]));
}
// Top-level direct routes, e.g. `app.get('/api/auth/csrf', ...)`. Skip the SPA
// wildcard fallback (`/{*splat}`) — first char after `/` excludes `*` and `{`.
for (const m of serverSrc.matchAll(/app\.(?:get|post|put|patch|delete)\(\s*['"`](\/[^'"`*{][^'"`]*)['"`]/g)) {
  const p = m[1];
  if (p.startsWith('/api/') || !p.slice(1).includes('/')) codeBases.add(basePath(p));
}
// The health router is mounted at both `/` and `/api`; expand its own routes
// (e.g. /health, /ready → also /api/health, /api/ready) instead of hardcoding.
const healthSrc = fs.readFileSync(HEALTH_FILE, 'utf8');
const healthPaths = [...healthSrc.matchAll(/router\.(?:get|post)\(\s*['"`](\/[^'"`]*)['"`]/g)].map((m) => m[1]);
for (const prefix of ['', '/api']) {
  for (const hp of healthPaths) codeBases.add(basePath(prefix + hp));
}

codeBases.delete('/api/docs'); // swagger UI, dev-only mount
codeBases.delete('/api/docs.json'); // swagger spec JSON, same dev-only surface

// ── Base paths documented in the matrix ─────────────────────────────
const matrix = fs.readFileSync(MATRIX_FILE, 'utf8');
const docBases = new Set();
for (const line of matrix.split('\n')) {
  const m = line.match(/^\|\s*([^|]+)\|/);
  if (!m) continue;
  // A row's first cell may list several backtick-quoted paths.
  for (const pm of m[1].matchAll(/`(\/[^`]*)`/g)) {
    const p = pm[1];
    if (p.startsWith('/api/') || !p.slice(1).includes('/')) docBases.add(basePath(p));
  }
}

// ── Diff ────────────────────────────────────────────────────────────
const missingFromDoc = [...codeBases].filter((b) => !docBases.has(b)).sort();
const missingFromCode = [...docBases].filter((b) => !codeBases.has(b)).sort();

console.log(`code base paths: ${codeBases.size}  |  matrix rows (paths): ${docBases.size}\n`);

if (process.argv.includes('--mounts')) {
  console.log('Code base paths:');
  [...codeBases].sort().forEach((b) => console.log(`  ${b}`));
  console.log('');
}

if (missingFromDoc.length) {
  console.log('✘ Mounted in code but MISSING from route-permission-matrix.md:');
  missingFromDoc.forEach((b) => console.log(`  - ${b}`));
}
if (missingFromCode.length) {
  console.log('✘ In route-permission-matrix.md but NOT mounted in code:');
  missingFromCode.forEach((b) => console.log(`  - ${b}`));
}
if (!missingFromDoc.length && !missingFromCode.length) {
  console.log('✔ route-permission-matrix.md base paths match mounted routes.');
}

process.exit(missingFromDoc.length || missingFromCode.length ? 1 : 0);
