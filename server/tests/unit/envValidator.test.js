/**
 * Unit Tests — envValidator (audit PR 10 / OPS-001).
 *
 * Drives the validator directly with controlled env so we don't have to
 * import server.js and trigger the full boot path.
 */

const { validateEnv } = require('../../lib/envValidator');

describe('validateEnv()', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

  test('non-production: only JWT_SECRET is required', () => {
    process.env = { NODE_ENV: 'development', JWT_SECRET: 'x' };
    expect(validateEnv()).toEqual({ ok: true, missing: [] });
  });

  test('non-production: missing JWT_SECRET fails', () => {
    process.env = { NODE_ENV: 'development' };
    delete process.env.JWT_SECRET;
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('JWT_SECRET');
  });

  // Full prod env — clone and delete per-test to probe each var.
  const FULL_PROD_ENV = {
    NODE_ENV: 'production',
    JWT_SECRET: 'x',
    PG_URL: 'postgres://x',
    CRON_TOKEN: 'y',
    IMPORT_DEFAULT_PASSWORD: 'z',
    CORS_ORIGINS: 'https://app.example.com',
    CLIENT_ORIGIN: 'https://app.example.com',
  };

  test('production: all required vars present → ok', () => {
    process.env = { ...FULL_PROD_ENV };
    expect(validateEnv()).toEqual({ ok: true, missing: [] });
  });

  // OPS-011: missing CORS_ORIGINS used to boot fine then reject every
  // browser write at runtime (localhost allowlist fallback) — now fails fast.
  test('production: missing CORS_ORIGINS reports failure', () => {
    process.env = { ...FULL_PROD_ENV };
    delete process.env.CORS_ORIGINS;
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['CORS_ORIGINS']);
  });

  // OPS-011: missing CLIENT_ORIGIN silently sent localhost reset links.
  test('production: missing CLIENT_ORIGIN reports failure', () => {
    process.env = { ...FULL_PROD_ENV };
    delete process.env.CLIENT_ORIGIN;
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['CLIENT_ORIGIN']);
  });

  test('non-production: CORS_ORIGINS/CLIENT_ORIGIN not required', () => {
    process.env = { NODE_ENV: 'development', JWT_SECRET: 'x' };
    delete process.env.CORS_ORIGINS;
    delete process.env.CLIENT_ORIGIN;
    expect(validateEnv()).toEqual({ ok: true, missing: [] });
  });

  test('production: missing CRON_TOKEN reports failure with missing list', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'x',
      PG_URL: 'postgres://x',
      IMPORT_DEFAULT_PASSWORD: 'z',
    };
    delete process.env.CRON_TOKEN;
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('CRON_TOKEN');
    expect(r.missing).not.toContain('JWT_SECRET');
  });

  test('production: missing IMPORT_DEFAULT_PASSWORD reports failure', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'x',
      PG_URL: 'postgres://x',
      CRON_TOKEN: 'y',
    };
    delete process.env.IMPORT_DEFAULT_PASSWORD;
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('IMPORT_DEFAULT_PASSWORD');
  });

  test('production: empty-string env var counts as missing', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'x',
      PG_URL: '',
      CRON_TOKEN: '   ',  // whitespace-only
      IMPORT_DEFAULT_PASSWORD: 'z',
    };
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(['PG_URL', 'CRON_TOKEN']));
  });

  // K1b: under DB_BACKEND=postgres the app runs Mongo-less — PG_URL is the
  // required connection string, MONGO_URI is optional (the inactive backend).
  test('production + postgres: PG_URL required, MONGO_URI not needed → ok', () => {
    process.env = {
      NODE_ENV: 'production', DB_BACKEND: 'postgres', JWT_SECRET: 'x',
      PG_URL: 'postgres://x', CRON_TOKEN: 'y', IMPORT_DEFAULT_PASSWORD: 'z',
      CORS_ORIGINS: 'https://app.example.com', CLIENT_ORIGIN: 'https://app.example.com',
    };
    // MONGO_URI intentionally absent
    expect(validateEnv()).toEqual({ ok: true, missing: [] });
  });

  test('production + postgres: missing PG_URL reports failure (not MONGO_URI)', () => {
    process.env = {
      NODE_ENV: 'production', DB_BACKEND: 'postgres', JWT_SECRET: 'x',
      CRON_TOKEN: 'y', IMPORT_DEFAULT_PASSWORD: 'z',
      CORS_ORIGINS: 'https://app.example.com', CLIENT_ORIGIN: 'https://app.example.com',
    };
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['PG_URL']);
    expect(r.missing).not.toContain('MONGO_URI');
  });

  test('production: ALLOW_MISSING_PROD_ENV=true flags bypass', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'x',
      ALLOW_MISSING_PROD_ENV: 'true',
    };
    delete process.env.PG_URL;
    delete process.env.CRON_TOKEN;
    delete process.env.IMPORT_DEFAULT_PASSWORD;
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.bypassed).toBe(true);
  });
});
