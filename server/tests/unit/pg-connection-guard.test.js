/**
 * Regression guard for the 2026-07-21 production wipe.
 *
 * Root cause: config/pg resolved `PG_URL || PG_PROTOTYPE_URL` for BOTH the app
 * and the Jest lane, and tests/pg-test-utils.resetPgDatabase TRUNCATEs every
 * table. Running the suite locally with a Neon PG_URL therefore wiped the live
 * database. A prior ad-hoc guard only string-compared the two URLs and lost
 * because Neon exposes the same branch via pooler and direct hostnames.
 *
 * The fix: in NODE_ENV=test, config/pg connects ONLY to a loopback Postgres
 * (Docker locally, the postgres service in CI) and FAILS CLOSED on any remote
 * host. These tests pin that behavior. `new Pool()` is lazy, so asserting the
 * throw/allow path never opens a real connection.
 */
const path = require('path');
const PG_MODULE = path.join(__dirname, '..', '..', 'config', 'pg');

const PG_ENV_KEYS = ['NODE_ENV', 'PG_URL', 'PG_TEST_URL', 'PG_PROTOTYPE_URL'];

/** Load config/pg fresh with a clean, explicit env and try to build the pool. */
const buildPoolWith = (env) => {
  const saved = {};
  for (const k of PG_ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  jest.resetModules();
  try {
    const pg = require(PG_MODULE);
    pg.getPool();
  } finally {
    for (const k of PG_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    jest.resetModules();
  }
};

const NEON = 'postgresql://u:p@ep-abc-pooler.ap-southeast-1.aws.neon.tech/neondb';
const NEON_DIRECT = 'postgresql://u:p@ep-abc.ap-southeast-1.aws.neon.tech/neondb';
const DOCKER = 'postgresql://postgres:test@localhost:5544/tmstest';
const CI_LOCAL = 'postgresql://ci:ci@localhost:5432/tmsci';

describe('config/pg — test lane never connects to a remote database', () => {
  it('REFUSES the exact incident config: test mode + Neon in PG_URL', () => {
    expect(() => buildPoolWith({ NODE_ENV: 'test', PG_URL: NEON })).toThrow(/non-localhost/i);
  });

  it('REFUSES a Neon PG_TEST_URL even via the direct (non-pooler) hostname', () => {
    expect(() => buildPoolWith({ NODE_ENV: 'test', PG_TEST_URL: NEON_DIRECT })).toThrow(/non-localhost/i);
  });

  it('REFUSES test mode with no connection string at all', () => {
    expect(() => buildPoolWith({ NODE_ENV: 'test' })).toThrow(/PG_TEST_URL/);
  });

  it('ALLOWS a local Docker Postgres via PG_TEST_URL', () => {
    expect(() => buildPoolWith({ NODE_ENV: 'test', PG_TEST_URL: DOCKER })).not.toThrow();
  });

  it('ALLOWS the CI localhost PG_URL (no PG_TEST_URL set)', () => {
    expect(() => buildPoolWith({ NODE_ENV: 'test', PG_URL: CI_LOCAL })).not.toThrow();
  });

  it('ALLOWS the real app (non-test) to use a remote Neon PG_URL', () => {
    expect(() => buildPoolWith({ NODE_ENV: 'production', PG_URL: NEON })).not.toThrow();
  });

  // 2026-07-24: `.env.pg-prototype` named the SAME Neon database as production
  // through its direct hostname, so every "prototype" entry point wrote to prod
  // while reading as disposable. The whole concept is retired — PG_URL is the
  // only connection source, and nothing may silently fall back again.
  it('IGNORES PG_PROTOTYPE_URL — it is not a connection source any more', () => {
    expect(() => buildPoolWith({ NODE_ENV: 'production', PG_PROTOTYPE_URL: NEON_DIRECT }))
      .toThrow(/PG_URL/);
  });
});

describe('the retired prototype env has no callers left', () => {
  const { execFileSync } = require('child_process');
  const serverDir = path.join(__dirname, '..', '..');

  const grepServer = (pattern) => {
    try {
      return execFileSync(
        'git',
        ['grep', '-l', '-e', pattern, '--', '.', ':!tests/unit/pg-connection-guard.test.js'],
        { cwd: serverDir, encoding: 'utf8' },
      ).trim().split('\n').filter(Boolean);
    } catch (error) {
      // git grep exits 1 when nothing matches — that is the passing case.
      if (error.status === 1) return [];
      throw error;
    }
  };

  // Code only — the incident is explained in comments across several files.
  it('has no file reading process.env.PG_PROTOTYPE_URL', () => {
    expect(grepServer('process\\.env\\.PG_PROTOTYPE_URL')).toEqual([]);
  });

  it('has no file loading the .env.pg-prototype file', () => {
    expect(grepServer("'\\.env\\.pg-prototype'")).toEqual([]);
  });
});

describe('resetPgDatabase — refuses to run outside test mode', () => {
  it('throws when NODE_ENV is not "test" so a stray caller cannot TRUNCATE prod', async () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    try {
      const { resetPgDatabase } = require(path.join(__dirname, '..', 'pg-test-utils'));
      await expect(resetPgDatabase()).rejects.toThrow(/test-only/i);
    } finally {
      process.env.NODE_ENV = saved;
      jest.resetModules();
    }
  });
});
