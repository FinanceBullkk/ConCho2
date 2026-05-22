#!/usr/bin/env node
/**
 * scripts/check-syntax.js
 * Cross-platform replacement for `node --check server/scripts/*.js`.
 * Windows cmd.exe does NOT expand globs, so the shell literal
 * "server/scripts/*.js" is passed verbatim to node, causing ENOENT.
 *
 * This script:
 *  1. Reads all *.js files from server/scripts (including sub-dirs).
 *  2. Adds the explicit top-level server scripts.
 *  3. Runs `node --check <file>` on each, printing OK or ERROR.
 *  4. Exits non-zero if any file fails the syntax check.
 */

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

/**
 * Recursively collect *.js files under `dir`.
 * Skips node_modules and the legacy/ sub-directory (P3-09: legacy scripts
 * may import removed modules; they are guarded separately).
 */
function collectJs(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'legacy') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...collectJs(full));
    } else if (e.name.endsWith('.js')) {
      files.push(full);
    }
  }
  return files;
}

const targets = [
  ...collectJs(path.join(root, 'server', 'scripts')),
  path.join(root, 'server', 'import_students.js'),
  path.join(root, 'server', 'seed.js'),
];

let errors = 0;
for (const file of targets) {
  const rel = path.relative(root, file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    console.log(`  ✓  ${rel}`);
  } catch {
    console.error(`  ✗  ${rel}`);
    errors += 1;
  }
}

if (errors > 0) {
  console.error(`\n${errors} file(s) failed syntax check.`);
  process.exit(1);
} else {
  console.log(`\nAll ${targets.length} files passed syntax check.`);
}
