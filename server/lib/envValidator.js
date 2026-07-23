/**
 * ──────────────────────────────────────────────────────────
 * envValidator.js — startup fail-fast (audit PR 10 / OPS-001)
 * ──────────────────────────────────────────────────────────
 * Extracted from server.js so the validation logic is unit-testable
 * without booting the full Express app + database connection. server.js
 * calls validateEnvOrExit() at module load.
 *
 * Returns { ok: true } on success.
 * Returns { ok: false, missing: [...] } on failure. The caller decides
 * whether to log + process.exit, so tests can drive the function with
 * controlled env and assert on the result.
 */

const REQUIRED_ALWAYS = ['JWT_SECRET'];
// OPS-011: CORS_ORIGINS missing in prod silently falls back to a localhost
// allowlist → every browser write is rejected at runtime (boot succeeds,
// app-wide outage). CLIENT_ORIGIN missing → password-reset emails link to
// http://localhost:5173. Both are README-§6.4-required; fail fast at boot
// instead (ALLOW_MISSING_PROD_ENV remains the emergency bypass).
// Backend-agnostic production requirements (the ACTIVE backend's connection
// string is added on top — see activeDbEnv). PostgreSQL is the only backend
// since Wave K (Mongoose removed 2026-07-14), so PG_URL is what must be present.
// Read DB_BACKEND fresh (not the cached db-backend helper) so the check tracks
// the current env in tests; a legacy `mongo` value still maps to MONGO_URI.
const REQUIRED_IN_PRODUCTION_BASE = [
  'CRON_TOKEN',
  'IMPORT_DEFAULT_PASSWORD',
  'CORS_ORIGINS',
  'CLIENT_ORIGIN',
];
const activeDbEnv = () =>
  ((process.env.DB_BACKEND || 'postgres').toLowerCase() === 'mongo' ? 'MONGO_URI' : 'PG_URL');
// Kept for back-compat / documentation of the default (postgres) production set.
const REQUIRED_IN_PRODUCTION = ['PG_URL', ...REQUIRED_IN_PRODUCTION_BASE];

const isMissing = (key) => {
  const v = process.env[key];
  return v === undefined || v === null || String(v).trim() === '';
};

const validateEnv = () => {
  const missing = [];
  for (const k of REQUIRED_ALWAYS) {
    if (isMissing(k)) missing.push(k);
  }
  if (process.env.NODE_ENV === 'production') {
    for (const k of [activeDbEnv(), ...REQUIRED_IN_PRODUCTION_BASE]) {
      if (isMissing(k)) missing.push(k);
    }
  }
  if (missing.length === 0) return { ok: true, missing: [] };
  return {
    ok: false,
    missing,
    bypassed: process.env.ALLOW_MISSING_PROD_ENV === 'true',
  };
};

/**
 * Use this at server.js startup. On failure it calls process.exit(1)
 * (unless ALLOW_MISSING_PROD_ENV=true and the missing var is in the
 * production-only set — JWT_SECRET is ALWAYS required and bypassing
 * it is never permitted).
 */
const validateEnvOrExit = (logger) => {
  const result = validateEnv();
  if (result.ok) return result;

  // JWT_SECRET is never bypassable — without it we'd sign tokens with
  // `undefined` and fail silently at runtime.
  const jwtMissing = result.missing.includes('JWT_SECRET');
  if (jwtMissing) {
    logger.fatal({ missing: result.missing }, 'JWT_SECRET is not set. Refusing to start.');
    process.exit(1);
    return result;
  }

  if (result.bypassed) {
    logger.warn({ missing: result.missing }, 'Starting with ALLOW_MISSING_PROD_ENV=true — features will be degraded');
    return { ok: true, missing: result.missing, bypassed: true };
  }

  logger.fatal({ missing: result.missing }, 'Required production env vars missing. Refusing to start.');
  process.exit(1);
  return result;
};

module.exports = { validateEnv, validateEnvOrExit, REQUIRED_ALWAYS, REQUIRED_IN_PRODUCTION };
