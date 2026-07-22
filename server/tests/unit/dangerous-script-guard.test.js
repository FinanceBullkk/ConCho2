'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const dangerousScriptGuard = require('../../scripts/lib/dangerousScriptGuard');

const ENV_KEYS = [
  'NODE_ENV',
  'ALLOW_PROD_DATA_MUTATION',
  'SEED_ALLOW_REMOTE',
  'ENG_IMPORT_ALLOW_REMOTE',
];

describe('dangerousScriptGuard - remote database safety', () => {
  const savedEnv = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    jest.restoreAllMocks();
  });

  it('blocks a remote database in development when the script override is absent', () => {
    process.env.NODE_ENV = 'development';

    expect(() => dangerousScriptGuard({
      scriptName: 'seed-pg.js',
      host: 'ep-example-pooler.ap-southeast-1.aws.neon.tech',
      dbName: 'neondb',
      remoteOverride: {
        envName: 'SEED_ALLOW_REMOTE',
        expectedValue: 'YES_I_HAVE_BACKUP',
      },
    })).toThrow(/remote database/i);
  });

  it('allows a remote database in development only with the exact script override', () => {
    process.env.NODE_ENV = 'development';
    process.env.SEED_ALLOW_REMOTE = 'YES_I_HAVE_BACKUP';

    expect(() => dangerousScriptGuard({
      scriptName: 'seed-pg.js',
      host: 'ep-example.ap-southeast-1.aws.neon.tech',
      dbName: 'neondb',
      remoteOverride: {
        envName: 'SEED_ALLOW_REMOTE',
        expectedValue: 'YES_I_HAVE_BACKUP',
      },
    })).not.toThrow();
  });

  it('allows a loopback database without a remote override', () => {
    process.env.NODE_ENV = 'development';

    expect(() => dangerousScriptGuard({
      scriptName: 'seed-pg.js',
      host: 'localhost',
      dbName: 'tms_dev',
      remoteOverride: {
        envName: 'SEED_ALLOW_REMOTE',
        expectedValue: 'YES_I_HAVE_BACKUP',
      },
    })).not.toThrow();
  });

  it('does not mistake a localhost-looking remote hostname for loopback', () => {
    process.env.NODE_ENV = 'development';

    expect(() => dangerousScriptGuard({
      scriptName: 'seed-pg.js',
      host: 'localhost.example.com',
      dbName: 'neondb',
      remoteOverride: {
        envName: 'SEED_ALLOW_REMOTE',
        expectedValue: 'YES_I_HAVE_BACKUP',
      },
    })).toThrow(/remote database/i);
  });

  it('still requires the production override after the remote override is accepted', () => {
    process.env.NODE_ENV = 'production';
    process.env.SEED_ALLOW_REMOTE = 'YES_I_HAVE_BACKUP';

    expect(() => dangerousScriptGuard({
      scriptName: 'seed-pg.js',
      host: 'ep-example.ap-southeast-1.aws.neon.tech',
      dbName: 'neondb',
      remoteOverride: {
        envName: 'SEED_ALLOW_REMOTE',
        expectedValue: 'YES_I_HAVE_BACKUP',
      },
    })).toThrow(/production database/i);
  });

  it('allows production remote mutation only when both overrides are exact', () => {
    process.env.NODE_ENV = 'production';
    process.env.SEED_ALLOW_REMOTE = 'YES_I_HAVE_BACKUP';
    process.env.ALLOW_PROD_DATA_MUTATION = 'YES_I_HAVE_BACKUP';

    expect(() => dangerousScriptGuard({
      scriptName: 'seed-pg.js',
      host: 'ep-example.ap-southeast-1.aws.neon.tech',
      dbName: 'neondb',
      remoteOverride: {
        envName: 'SEED_ALLOW_REMOTE',
        expectedValue: 'YES_I_HAVE_BACKUP',
      },
    })).not.toThrow();
  });

  it('wires the remote gate into seed-pg before the CLI can open a connection', () => {
    const childEnv = {
      ...process.env,
      NODE_ENV: 'development',
      PG_URL: 'postgresql://fake:fake@ep-safety-check.ap-southeast-1.aws.neon.tech/neondb',
    };
    delete childEnv.SEED_ALLOW_REMOTE;
    delete childEnv.ALLOW_PROD_DATA_MUTATION;

    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', '..', 'scripts', 'seed-pg.js')],
      { env: childEnv, encoding: 'utf8', timeout: 10_000 },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toMatch(/cannot mutate remote database/i);
    expect(output).not.toMatch(/ENOTFOUND|ECONNREFUSED|timeout expired/i);
  });

  it('wires the remote gate into eng-import before the CLI can open a connection', () => {
    const childEnv = {
      ...process.env,
      NODE_ENV: 'development',
      PG_URL: 'postgresql://fake:fake@ep-eng-import-safety.invalid/neondb',
    };
    delete childEnv.ENG_IMPORT_ALLOW_REMOTE;
    delete childEnv.ALLOW_PROD_DATA_MUTATION;

    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, '..', '..', 'scripts', 'eng-import.js'), 'fixture.xlsx', '--reset'],
      { env: childEnv, encoding: 'utf8', timeout: 10_000 },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toMatch(/cannot mutate remote database/i);
    expect(output).not.toMatch(/ENOTFOUND|ECONNREFUSED|timeout expired/i);
  });
});
