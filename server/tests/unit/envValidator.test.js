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

  test('production: all four required vars present → ok', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'x',
      MONGO_URI: 'mongodb://x',
      CRON_TOKEN: 'y',
      IMPORT_DEFAULT_PASSWORD: 'z',
    };
    expect(validateEnv()).toEqual({ ok: true, missing: [] });
  });

  test('production: missing CRON_TOKEN reports failure with missing list', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'x',
      MONGO_URI: 'mongodb://x',
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
      MONGO_URI: 'mongodb://x',
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
      MONGO_URI: '',
      CRON_TOKEN: '   ',  // whitespace-only
      IMPORT_DEFAULT_PASSWORD: 'z',
    };
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(['MONGO_URI', 'CRON_TOKEN']));
  });

  test('production: ALLOW_MISSING_PROD_ENV=true flags bypass', () => {
    process.env = {
      NODE_ENV: 'production',
      JWT_SECRET: 'x',
      ALLOW_MISSING_PROD_ENV: 'true',
    };
    delete process.env.MONGO_URI;
    delete process.env.CRON_TOKEN;
    delete process.env.IMPORT_DEFAULT_PASSWORD;
    const r = validateEnv();
    expect(r.ok).toBe(false);
    expect(r.bypassed).toBe(true);
  });
});
