#!/usr/bin/env node
// Preview/apply the deterministic English Archive time repair.
//
// Preview (prototype DB by default):
//   node scripts/eng-reallocate-session-times.js
// Apply:
//   node scripts/eng-reallocate-session-times.js --apply \
//     --confirm=REALLOCATE_ENGLISH_ARCHIVE --actor-emp-code=000001 \
//     --reason="Approved correction reference"
//
// Remote targets fail closed: set ENG_REALLOCATE_ALLOW_REMOTE=YES_I_HAVE_BACKUP
// (one-shot) after verifying the target and backup. Production additionally
// requires ALLOW_PROD_DATA_MUTATION=YES_I_HAVE_BACKUP.

const path = require('path');

const args = process.argv.slice(2);
const useDevDb = args.includes('--dev');
if (!process.env.PG_URL && !process.env.PG_PROTOTYPE_URL) {
  require('dotenv').config({
    path: path.join(__dirname, '..', useDevDb ? '.env' : '.env.pg-prototype'),
    quiet: true,
  });
}

const DEFAULT_TIME_SLOTS = require('../config/default-time-slots');
const { query, closePool } = require('../config/pg');
const dangerousScriptGuard = require('./lib/dangerousScriptGuard');
const auditService = require('../services/auditService');
const {
  previewArchiveSessionTimeAllocation,
  applyArchiveSessionTimeAllocation,
} = require('../domains/english-training/session-time-corrections');

const valueArg = (name) => {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || null;
};

function printPreview(plan) {
  console.log('\n=== ENGLISH ARCHIVE SESSION-TIME PREVIEW ===');
  console.log(JSON.stringify(plan.summary, null, 2));
  console.log('\n=== DATE MOVES ===');
  console.log(JSON.stringify(plan.movedSessions, null, 2));
}

(async () => {
  const apply = args.includes('--apply');
  if (!apply) {
    const preview = await previewArchiveSessionTimeAllocation({ slots: DEFAULT_TIME_SLOTS });
    printPreview(preview);
    await closePool();
    return;
  }

  if (valueArg('confirm') !== 'REALLOCATE_ENGLISH_ARCHIVE') {
    throw new Error('Apply blocked: pass --confirm=REALLOCATE_ENGLISH_ARCHIVE');
  }
  const reason = valueArg('reason');
  const actorEmpCode = valueArg('actor-emp-code');
  if (!reason || reason.trim().length < 10) throw new Error('Apply requires --reason with at least 10 characters');
  if (!actorEmpCode) throw new Error('Apply requires --actor-emp-code');

  const connectionString = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
  const target = new URL(connectionString);
  dangerousScriptGuard({
    scriptName: 'eng-reallocate-session-times.js — updates imported Archive session timestamps',
    host: target.hostname,
    dbName: target.pathname.replace(/^\//, ''),
    remoteOverride: {
      envName: 'ENG_REALLOCATE_ALLOW_REMOTE',
      expectedValue: 'YES_I_HAVE_BACKUP',
    },
  });

  const { rows } = await query(`
    SELECT id, emp_code, role FROM users
    WHERE emp_code = $1 AND is_deleted = false
  `, [actorEmpCode]);
  const actor = rows[0];
  if (!actor || actor.role !== 'Admin') throw new Error('Apply actor must be an active Admin user');

  const preview = await previewArchiveSessionTimeAllocation({ slots: DEFAULT_TIME_SLOTS });
  printPreview(preview);
  const result = await applyArchiveSessionTimeAllocation({
    reason,
    actor: { _id: actor.id, empCode: actor.emp_code, role: actor.role },
    slots: DEFAULT_TIME_SLOTS,
  });

  await auditService.record({
    req: { user: { _id: actor.id, empCode: actor.emp_code, role: actor.role } },
    action: 'session-time-reallocated',
    entity: 'EnglishArchive',
    entityId: result.batchId,
    diff: {
      before: { sourceDays: result.summary.sourceDays },
      after: result.summary,
    },
    note: reason,
  });
  await auditService.flush();
  const audit = await query(`
    SELECT count(*)::int AS count FROM audit_log
    WHERE entity = 'EnglishArchive' AND action = 'session-time-reallocated' AND entity_id = $1
  `, [result.batchId]);
  if (audit.rows[0].count !== 1) throw new Error('Correction committed but audit verification failed');

  console.log('\n=== APPLIED AND VERIFIED ===');
  console.log(JSON.stringify(result, null, 2));
  await closePool();
})().catch(async (error) => {
  console.error(`SESSION TIME CORRECTION FAILED: ${error.message}`);
  try { await closePool(); } catch { /* ignore close failure */ }
  process.exit(1);
});
