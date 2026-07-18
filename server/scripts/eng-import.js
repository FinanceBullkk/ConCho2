#!/usr/bin/env node
// English-training Phase-1 + Phase-2 import CLI.
//   node scripts/eng-import.js <workbook.xlsx> [--reset] [--dev]
// Loads the prototype PG env by default (`--dev` selects server/.env), runs the
// stage→transform→load→reconcile pipeline, prints the reconciliation + DQ
// summary, and asserts source=loaded+skipped per sheet. Never point at prod.

const path = require('path');
const args = process.argv.slice(2);
const useDevDb = args.includes('--dev');
if (!process.env.PG_URL) {
  require('dotenv').config({
    path: path.join(__dirname, '..', useDevDb ? '.env' : '.env.pg-prototype'),
  });
}
const { runImport } = require('../domains/english-training/import/pipeline');
const { closePool } = require('../config/pg');

(async () => {
  const reset = args.includes('--reset');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node scripts/eng-import.js <workbook.xlsx> [--reset] [--dev]');
    process.exit(1);
  }

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
