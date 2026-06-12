/**
 * Unit Tests — verify-backup.js env loading (audit phase 05 / OPS-009).
 *
 * Regression: the script used to resolve `../../.env` (repo root), so the
 * documented bare invocation `node server/scripts/verify-backup.js` failed
 * with "MONGO_URI is not set" — the monthly backup drill never ran.
 *
 * The script connects to Mongo and calls process.exit, so we exercise it as
 * a child process and assert on the Environment section only, killing the
 * child as soon as the line we care about is printed (no DB needed).
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.resolve(__dirname, '../../scripts/verify-backup.js');

// Spawn the script with a controlled env; resolve with collected stdout as
// soon as the line containing `matcher` is COMPLETE (then kill), or when the
// child exits on its own. Waiting for the trailing newline matters: pipe
// chunks can split mid-line, and assertions read the rest of the matcher's
// line (e.g. the masked URI) — killing on a half-delivered line is the flake
// seen in full-suite runs (passes solo, rare fail under load).
const runUntil = (env, matcher, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env,
      cwd: os.tmpdir(), // neutral CWD — no stray .env pickup from repo root
      windowsHide: true,
    });
    let out = '';
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { child.kill(); } catch { /* already dead */ }
      if (err) reject(err); else resolve(out);
    };
    const timer = setTimeout(
      () => finish(new Error(`timeout waiting for ${matcher}\n--- output ---\n${out}`)),
      timeoutMs,
    );
    const onChunk = (chunk) => {
      out += chunk.toString();
      const idx = out.indexOf(matcher);
      if (idx !== -1 && out.indexOf('\n', idx) !== -1) finish();
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('error', finish);
    child.on('exit', () => finish());
  });

// Minimal child env: keep PATH/SystemRoot so node can run on every platform,
// drop any inherited Mongo connection vars so the test controls them fully.
const baseEnv = () => {
  const env = { ...process.env };
  delete env.MONGO_URI;
  delete env.MONGODB_URI;
  delete env.VERIFY_BACKUP_ENV_PATH;
  return env;
};

describe('verify-backup.js env loading (OPS-009)', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tms-verify-backup-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('loads MONGO_URI from the file given via VERIFY_BACKUP_ENV_PATH (wins over server/.env)', async () => {
    const envFile = path.join(tmpDir, 'drill.env');
    fs.writeFileSync(envFile, 'MONGO_URI=mongodb://drill-user:secret@drill-host.invalid:27017/tms-drill\n');

    const env = baseEnv();
    env.VERIFY_BACKUP_ENV_PATH = envFile;

    const out = await runUntil(env, 'MONGO_URI is set');
    // Masked URI proves the override file was the source (dotenv first-wins,
    // so a real server/.env on a dev machine cannot shadow it).
    expect(out).toContain('drill-host.invalid');
    expect(out).toContain('<user>:<pass>');
    expect(out).not.toContain('secret'); // credentials masked in output
  });

  test('MONGO_URI already in the environment wins over every .env file (documented inline form)', async () => {
    const envFile = path.join(tmpDir, 'loser.env');
    fs.writeFileSync(envFile, 'MONGO_URI=mongodb://file-user:pw@file-host.invalid:27017/file-db\n');

    const env = baseEnv();
    env.VERIFY_BACKUP_ENV_PATH = envFile;
    env.MONGO_URI = 'mongodb://inline-user:pw@inline-host.invalid:27017/inline-db';

    const out = await runUntil(env, 'MONGO_URI is set');
    expect(out).toContain('inline-host.invalid');
    expect(out).not.toContain('file-host.invalid');
  });

  test('fails loud when no MONGO_URI anywhere', async () => {
    const env = baseEnv();
    // Deterministic on dev machines AND CI: an override file with an EMPTY
    // value loads first (dotenv first-wins), so a real server/.env on a dev
    // machine cannot supply the URI; '' is falsy → script reports "not set".
    const emptyFile = path.join(tmpDir, 'empty.env');
    fs.writeFileSync(emptyFile, 'MONGO_URI=\n');
    env.VERIFY_BACKUP_ENV_PATH = emptyFile;

    const out = await runUntil(env, 'MONGO_URI (or MONGODB_URI) is not set');
    expect(out).toContain('MONGO_URI (or MONGODB_URI) is not set');
  });
});
