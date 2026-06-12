/**
 * audit-route-permission-diff.js — Phase 08 docs audit helper (DOCS- series).
 *
 * Enumerates every Express route actually mounted by server.js (live
 * introspection of app._router, not a brittle source-grep) and diffs the
 * base-path inventory against docs/route-permission-matrix.md.
 *
 * Usage:  node server/scripts/audit-route-permission-diff.js [--routes]
 *   --routes  also print the full METHOD+path+middleware inventory
 *
 * Exit code 1 when the diff is non-empty so future audits can gate on it.
 * Requires no DB: server.js skips connect/listen when NODE_ENV=test.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'audit-route-diff-dummy-secret';

const fs = require('fs');
const path = require('path');

const app = require('../server');

// ── Walk the Express 4 router tree ──────────────────────────────────
// Reconstruct mount prefixes from layer regexps (the usual express
// introspection trick — fast-path mounts like /api/users stringify back
// cleanly; param segments come back as :param placeholders).
function regexpToPath(layer) {
  if (layer.path) return layer.path;
  const src = layer.regexp && layer.regexp.source;
  // Root mounts (app.use('/', ...)) — regexp is ^\/?(?=\/|$): no prefix.
  if (!src || src === '^\\/?$' || src === '^\\/?(?=\\/|$)') return '';
  let p = src
    .replace('^\\/', '/')
    .replace('\\/?(?=\\/|$)', '')
    .replace(/\$\)?$/, '')
    .replace(/\\\//g, '/')
    .replace(/\(\?:\(\[\^\\?\/\]\+\?\)\)/g, ':param')
    .replace(/\(\?=\/\|\$\)/g, '')
    .replace(/[()^$?]/g, '');
  return p;
}

function collectRoutes(stack, prefix, out) {
  for (const layer of stack) {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods)
        .filter((m) => m !== '_all')
        .map((m) => m.toUpperCase());
      const middleware = layer.route.stack
        .map((l) => l.name)
        .filter((n) => n && n !== '<anonymous>');
      out.push({
        methods,
        path: (prefix + layer.route.path).replace(/\/+/g, '/'),
        middleware,
      });
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      collectRoutes(layer.handle.stack, prefix + regexpToPath(layer), out);
    }
  }
}

const routes = [];
collectRoutes(app._router.stack, '', routes);

// ── Base-path inventory from code ───────────────────────────────────
// Base path = '/health' style root probes, or the first two segments of
// /api/* (three for /api/admin/*) — matching the matrix's row granularity.
function basePath(p) {
  const seg = p.split('/').filter(Boolean);
  if (seg[0] !== 'api') return '/' + (seg[0] || '');
  if (seg[1] === 'admin') return '/' + seg.slice(0, 3).join('/');
  return '/' + seg.slice(0, 2).join('/');
}

const codeBases = new Set(routes.map((r) => basePath(r.path)));
codeBases.delete('/api/docs'); // swagger UI, dev-only mount
codeBases.delete('/api/docs.json'); // swagger spec JSON, same dev-only surface

// ── Base paths documented in the matrix ─────────────────────────────
const matrixFile = path.join(__dirname, '../../docs/route-permission-matrix.md');
const matrix = fs.readFileSync(matrixFile, 'utf8');
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

console.log(`routes mounted: ${routes.length}  |  code base paths: ${codeBases.size}  |  matrix rows (paths): ${docBases.size}\n`);

if (process.argv.includes('--routes')) {
  for (const r of routes.sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`${r.methods.join(',').padEnd(11)} ${r.path}  [${r.middleware.join(' → ')}]`);
  }
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
