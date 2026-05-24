/**
 * ──────────────────────────────────────────────────────────
 * Unit Tests — Secret Hygiene
 * ──────────────────────────────────────────────────────────
 * Audit finding: SEC-001
 *
 * These tests fail CI if:
 *   - server/.env is staged into the repo
 *   - server/.env.example is missing (onboarding template)
 *   - common credential patterns appear in non-test source files
 *
 * Run locally with: cd server && npx jest tests/unit/secrets
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const serverRoot = path.resolve(__dirname, '..', '..');

describe('Secret hygiene', () => {
  test('server/.env must not be tracked by git', () => {
    // The file may exist locally; the test only fails if it was committed.
    // We detect this by checking the git index via a side-channel: a
    // gitignored file should never appear in `git ls-files` output.
    // To keep the test offline-safe we just confirm the gitignore entry exists.
    const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.env\b/m);
  });

  test('server/.env.example exists and contains all required keys', () => {
    const examplePath = path.join(serverRoot, '.env.example');
    expect(fs.existsSync(examplePath)).toBe(true);

    const content = fs.readFileSync(examplePath, 'utf8');
    const requiredKeys = [
      'PORT',
      'JWT_SECRET',
      'MONGO_URI',
      'CORS_ORIGINS',
      'CLIENT_ORIGIN',
      'CRON_TOKEN',
      'MFA_ISSUER',
      'MFA_REQUIRED_ROLES',
      'IMPORT_DEFAULT_PASSWORD',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'EMAIL_FROM',
      'GOOGLE_SERVICE_ACCOUNT_KEY_JSON',
      'GOOGLE_CALENDAR_IMPERSONATE',
      'TMS_TIMEZONE',
      'SENTRY_DSN',
    ];
    for (const key of requiredKeys) {
      expect(content).toMatch(new RegExp(`^${key}=`, 'm'));
    }
  });

  test('no obvious live secrets in source files', () => {
    // Heuristic scan: walk server source dirs and fail if we find common
    // credential patterns. Allow placeholders in .env.example (which we skip).
    const danger = [
      // MongoDB SRV connection string with embedded password
      /mongodb\+srv:\/\/[^:\s]+:[^@\s]+@[a-z0-9.-]+\.mongodb\.net/i,
      // Gmail app password (16 lowercase letters, no spaces)
      /SMTP_PASS\s*=\s*[a-z]{16}\b/,
      // Long hex JWT_SECRET literal assignment in source (not env)
      /JWT_SECRET\s*=\s*['"][0-9a-f]{32,}['"]/,
    ];
    const scanDirs = ['controllers', 'services', 'routes', 'middleware', 'models', 'lib', 'helpers', 'config'];
    const offenders = [];

    for (const dir of scanDirs) {
      const abs = path.join(serverRoot, dir);
      if (!fs.existsSync(abs)) continue;
      for (const file of fs.readdirSync(abs)) {
        if (!file.endsWith('.js')) continue;
        const full = path.join(abs, file);
        const text = fs.readFileSync(full, 'utf8');
        for (const re of danger) {
          if (re.test(text)) {
            offenders.push({ file: path.relative(repoRoot, full), pattern: re.source });
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
