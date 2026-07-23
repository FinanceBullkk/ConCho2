#!/usr/bin/env node
// English-training Phase-1 + Phase-2 import CLI.
//   node scripts/eng-import.js <workbook.xlsx> [--reset]
// Runs the stage→transform→load→reconcile pipeline, prints the reconciliation +
// DQ summary, and asserts source=loaded+skipped per sheet. Remote targets
// require an importer-specific one-shot confirmation before any connection is
// opened.
//
// The target is `PG_URL` — from the shell if set (that is how you point at a
// disposable database), otherwise from `server/.env`. The old `--dev` flag and
// the `.env.pg-prototype` default were removed 2026-07-24: that env named the
// SAME Neon database as production, so the default target of a "prototype"
// import was production itself.

const path = require('path');
const args = process.argv.slice(2);
if (!process.env.PG_URL) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}
const { runImport } = require('../domains/english-training/import/pipeline');
const { closePool } = require('../config/pg');
const dangerousScriptGuard = require('./lib/dangerousScriptGuard');

(async () => {
  const reset = args.includes('--reset');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node scripts/eng-import.js <workbook.xlsx> [--reset]');
    process.exit(1);
  }

  const connectionString = process.env.PG_URL;
  if (!connectionString) throw new Error('PG connection string missing (PG_URL)');
  const target = new URL(connectionString);
  dangerousScriptGuard({
    scriptName: 'eng-import.js',
    host: target.hostname,
    dbName: decodeURIComponent(target.pathname.replace(/^\//, '')),
    remoteOverride: {
      envName: 'ENG_IMPORT_ALLOW_REMOTE',
      expectedValue: 'YES_I_HAVE_BACKUP',
    },
  });

  const res = await runImport(file, { reset });

  console.log('\n=== RECONCILIATION (source → loaded) ===');
  let ok = true;
  for (const [sheet, r] of Object.entries(res.reconcile)) {
    if (r && typeof r === 'object' && 'source' in r) {
      const ignored = r.ignored || 0;
      const balanced = r.source === r.loaded + ignored;
      if (!balanced) ok = false;
      const mark = balanced ? (ignored ? `OK (${ignored} exact duplicates staged)` : 'OK') : 'MISMATCH';
      console.log(`  ${sheet.padEnd(14)} source=${r.source}  loaded=${r.loaded}  ignored=${ignored}  ${mark}`);
    } else {
      console.log(`  ${sheet.padEnd(12)} ${r}`);
    }
  }
  console.log('\n=== DATA-QUALITY ISSUES (recorded, not dropped) ===');
  for (const [code, n] of Object.entries(res.issues)) console.log(`  ${String(n).padStart(4)}  ${code}`);
  console.log(`  total issues: ${res.issueCount}`);
  console.log(`\nworkbook checksum: ${res.checksum.slice(0, 16)}…`);

  await closePool();
  process.exit(ok ? 0 : 1);
})().catch(async (e) => {
  console.error('IMPORT FAILED:', e.message);
  try { await require('../config/pg').closePool(); } catch { /* ignore */ }
  process.exit(1);
});
