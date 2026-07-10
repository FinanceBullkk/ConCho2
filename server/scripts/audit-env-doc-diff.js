/**
 * audit-env-doc-diff.js — Phase 08 docs audit helper (DOCS- series).
 *
 * Diffs the environment variables the server RUNTIME actually reads
 * (every `process.env.X` in non-test server code) against the documented
 * table in README §6.4 and the boot-time envValidator lists.
 *
 * Usage:  node server/scripts/audit-env-doc-diff.js
 * Exit 1 when a runtime-read var is missing from the README table.
 * (Doc-only extras are reported but don't fail — a documented var that
 * code no longer reads is a softer, review-me signal.)
 */

const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..');
// Runtime code only — tests and one-off scripts read env that operators
// never need documented in the deploy table.
const RUNTIME_DIRS = [
  'config', 'controllers', 'domains', 'helpers', 'jobs', 'lib',
  'middleware', 'models', 'policy', 'routes', 'schemas', 'services',
];
// Vars that are platform/test plumbing, not operator-facing deploy config.
const EXEMPT = new Set([
  'NODE_ENV', 'PORT',                      // platform-set (Render injects PORT)
  'npm_package_version',                   // npm runtime metadata
  'ALLOW_MISSING_PROD_ENV',                // break-glass flag, documented in envValidator
  'VERIFY_BACKUP_ENV_PATH',                // script-only override (OPS-009)
  'GIT_SHA', 'RENDER_GIT_COMMIT',          // CI/platform-injected release stamps
  'CORS_BYPASS_NO_ORIGIN', 'DISABLE_RATE_LIMITS', // dev/e2e-only switches
]);
// Optional tuning knobs with safe defaults — covered by the blanket
// "advanced tuning knobs" note under README §6.4 rather than one row each.
// A knob here still WARNS (so new additions get reviewed) but doesn't fail.
const TUNING_KNOBS = new Set([
  'ALERTS_LOOKBACK_DAYS', 'DASHBOARD_CACHE_TTL_MINUTES', 'EXPORT_MAX_ROWS',
  'GOOGLE_SERVICE_ACCOUNT_KEY', 'IMPORT_MAX_BATCH', 'IMPORT_TX_MAX_MS',
  'LOGIN_LOCK_MINUTES', 'LOGIN_MAX_FAILED', 'MONGO_MIN_POOL_SIZE',
  'MONGO_POOL_SIZE', 'REMINDER_CONCURRENCY',
  'REMINDER_SEND_TIMEOUT_MS', 'SEARCH_CACHE_TTL_S', 'SENTRY_TRACES_SAMPLE_RATE',
]);

function collectEnvReads() {
  const found = new Map(); // var -> first file:line
  const files = ['server.js'];
  for (const d of RUNTIME_DIRS) {
    const dir = path.join(SERVER_DIR, d);
    if (!fs.existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (e.name.endsWith('.js')) files.push(path.relative(SERVER_DIR, full));
      }
    }
  }
  for (const rel of files) {
    const text = fs.readFileSync(path.join(SERVER_DIR, rel), 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
        if (!found.has(m[1])) found.set(m[1], `${rel.replace(/\\/g, '/')}:${i + 1}`);
      }
    });
  }
  return found;
}

function collectReadmeVars() {
  const readme = fs.readFileSync(path.join(SERVER_DIR, '../README.md'), 'utf8');
  const section = readme.split(/### 6\.4\./)[1] || '';
  const table = section.split(/\n## /)[0];
  const vars = new Set();
  for (const m of table.matchAll(/^\|\s*`([A-Z][A-Z0-9_]*)`/gm)) vars.add(m[1]);
  return vars;
}

const codeVars = collectEnvReads();
const docVars = collectReadmeVars();
const { REQUIRED_ALWAYS, REQUIRED_IN_PRODUCTION } = require('../lib/envValidator');
const validated = new Set([...REQUIRED_ALWAYS, ...REQUIRED_IN_PRODUCTION]);

const undocumented = [...codeVars.keys()]
  .filter((v) => !docVars.has(v) && !EXEMPT.has(v) && !TUNING_KNOBS.has(v))
  .sort();
const knobsInUse = [...codeVars.keys()].filter((v) => TUNING_KNOBS.has(v)).sort();
const unread = [...docVars].filter((v) => !codeVars.has(v)).sort();

console.log(`runtime env reads: ${codeVars.size}  |  README §6.4 rows: ${docVars.size}  |  envValidator-required: ${validated.size}\n`);

if (undocumented.length) {
  console.log('✘ Read by runtime code but MISSING from README §6.4:');
  undocumented.forEach((v) => console.log(`  - ${v}  (${codeVars.get(v)})`));
}
if (unread.length) {
  console.log('⚠ Documented in README §6.4 but never read by runtime code:');
  unread.forEach((v) => console.log(`  - ${v}`));
}
if (knobsInUse.length) {
  console.log(`⚠ Tuning knobs in use (covered by the README §6.4 blanket note): ${knobsInUse.join(', ')}`);
}
const requiredUndocumented = undocumented.filter((v) => validated.has(v));
if (requiredUndocumented.length) {
  console.log('‼ Boot-REQUIRED (envValidator) yet undocumented:');
  requiredUndocumented.forEach((v) => console.log(`  - ${v}`));
}
if (!undocumented.length && !unread.length) {
  console.log('✔ README §6.4 matches runtime env usage.');
}

process.exit(undocumented.length ? 1 : 0);
