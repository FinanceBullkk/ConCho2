'use strict';

/**
 * dangerousScriptGuard — production safety gate for destructive scripts.
 *
 * Call this AFTER connecting, so the real host/dbName are available.
 *
 * Rules enforced:
 *   • NODE_ENV === 'production'  requires  ALLOW_PROD_DATA_MUTATION=YES_I_HAVE_BACKUP
 *   • Always prints DB host + name so the operator sees exactly what will be wiped.
 *
 * Backend-agnostic: pass a connected `mongoose` instance (Mongo scripts) OR the
 * resolved `host`/`dbName` strings directly (Postgres scripts). `host`/`dbName`
 * win when both are supplied.
 *
 * @param {object}  opts
 * @param {string}  opts.scriptName   Human-readable name shown in the warning banner.
 * @param {import('mongoose')} [opts.mongoose]  A connected mongoose instance.
 * @param {string}  [opts.host]       DB host (Postgres path).
 * @param {string}  [opts.dbName]     DB name (Postgres path).
 */
function dangerousScriptGuard({ scriptName, mongoose, host, dbName }) {
  const env      = process.env.NODE_ENV || 'development';
  host   = host   || mongoose?.connection?.host || '(not connected)';
  dbName = dbName || mongoose?.connection?.name || '(unknown)';

  console.log('\n' + '!'.repeat(60));
  console.log(`  ⚠️   DESTRUCTIVE SCRIPT: ${scriptName}`);
  console.log(`  NODE_ENV : ${env}`);
  console.log(`  DB host  : ${host}`);
  console.log(`  DB name  : ${dbName}`);
  console.log('!'.repeat(60) + '\n');

  if (env === 'production') {
    if (process.env.ALLOW_PROD_DATA_MUTATION !== 'YES_I_HAVE_BACKUP') {
      console.error('❌  BLOCKED: this script cannot mutate a production database.');
      console.error('    Take a verified backup first, then re-run with:');
      console.error('    ALLOW_PROD_DATA_MUTATION=YES_I_HAVE_BACKUP node <script>');
      process.exit(1);
    }
    console.log('🟠  Production override accepted (ALLOW_PROD_DATA_MUTATION set).\n');
  }
}

module.exports = dangerousScriptGuard;
