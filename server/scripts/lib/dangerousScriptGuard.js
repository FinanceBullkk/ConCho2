'use strict';

/**
 * Target + production safety gate for destructive scripts.
 *
 * Call this before the first mutation, after resolving the real host/dbName.
 * A caller can opt into a fail-closed remote target gate by providing
 * `remoteOverride`. Production remains protected by the separate global gate.
 */

const DEFAULT_CONFIRMATION = 'YES_I_HAVE_BACKUP';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const isLoopbackHost = (host) => {
  const normalized = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  return LOOPBACK_HOSTS.has(normalized);
};

/**
 * @param {object} opts
 * @param {string} opts.scriptName Human-readable warning name.
 * @param {import('mongoose')} [opts.mongoose] Connected mongoose instance.
 * @param {string} [opts.host] Database host; wins over mongoose metadata.
 * @param {string} [opts.dbName] Database name; wins over mongoose metadata.
 * @param {{envName: string, expectedValue?: string}} [opts.remoteOverride]
 *   One-shot environment confirmation required for non-loopback targets.
 */
function dangerousScriptGuard({ scriptName, mongoose, host, dbName, remoteOverride }) {
  const env = process.env.NODE_ENV || 'development';
  host = host || mongoose?.connection?.host || '(not connected)';
  dbName = dbName || mongoose?.connection?.name || '(unknown)';

  console.log('\n' + '!'.repeat(60));
  console.log(`  ⚠️   DESTRUCTIVE SCRIPT: ${scriptName}`);
  console.log(`  NODE_ENV : ${env}`);
  console.log(`  DB host  : ${host}`);
  console.log(`  DB name  : ${dbName}`);
  console.log('!'.repeat(60) + '\n');

  if (remoteOverride) {
    const { envName, expectedValue = DEFAULT_CONFIRMATION } = remoteOverride;
    if (!envName) throw new Error('Remote mutation guard is missing its envName configuration.');
    const isRemoteTarget = !isLoopbackHost(host);
    if (isRemoteTarget && process.env[envName] !== expectedValue) {
      throw new Error(
        `BLOCKED: ${scriptName} cannot mutate remote database ${host}/${dbName}. `
        + `Re-run with ${envName}=${expectedValue} after verifying the target and backup.`,
      );
    }
    if (isRemoteTarget) console.log(`Remote target override accepted (${envName} set).\n`);
  }

  if (env === 'production') {
    if (process.env.ALLOW_PROD_DATA_MUTATION !== DEFAULT_CONFIRMATION) {
      throw new Error(
        'BLOCKED: this script cannot mutate a production database. '
        + 'Take a verified backup, then re-run with '
        + `ALLOW_PROD_DATA_MUTATION=${DEFAULT_CONFIRMATION}.`,
      );
    }
    console.log('🟠  Production override accepted (ALLOW_PROD_DATA_MUTATION set).\n');
  }
}

module.exports = dangerousScriptGuard;
