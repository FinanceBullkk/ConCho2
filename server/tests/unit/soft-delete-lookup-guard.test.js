/**
 * Unit Test — soft-delete $lookup discipline guard (PG-migration Phase 0, item 0.2).
 *
 * Root cause this guards against (DATA-009): Mongoose soft-delete hooks
 * `pre('find')` / `pre('aggregate')` do NOT fire inside a `$lookup` sub-pipeline.
 * So a plain `$lookup` into a soft-deletable collection silently includes
 * soft-deleted rows — e.g. a deleted Class label leaking into the HR export
 * (the bug fixed in PR #180). The fix pattern is the *pipeline form* of $lookup
 * with an explicit `isDeleted: { $ne: true }` match at the join.
 *
 * This test scans the server source for every `$lookup` into a soft-deletable
 * collection and asserts each one carries an `isDeleted` guard — so the leak
 * class can never be reintroduced, and (forward-looking) the eventual
 * Mongo→Postgres port has a complete, enforced inventory of the joins whose
 * soft-delete predicate must be made explicit in SQL.
 */

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.join(__dirname, '..', '..');
const SCAN_DIRS = ['domains', 'controllers', 'services', 'models', 'jobs'].map((d) =>
  path.join(SERVER_ROOT, d),
);

// Collections backed by a model with a soft-delete `pre('aggregate')` hook
// (audited 2026-06-17, WS-B of plans/260612-2042-postgresql-migration). A
// $lookup into any of these bypasses the hook → must filter isDeleted by hand.
// To extend: add the lowercase-pluralised collection name when a model gains a
// soft-delete aggregate hook.
const SOFT_DELETABLE = ['users', 'classes', 'teams', 'evaluations', 'costentries', 'trainingrequests'];

/** Recursively collect *.js files under a dir, skipping tests + node_modules. */
const collectJsFiles = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__' || name === 'tests') continue;
      collectJsFiles(full, acc);
    } else if (name.endsWith('.js') && !name.includes('.test.')) {
      acc.push(full);
    }
  }
  return acc;
};

/**
 * Extract every `$lookup: { ... }` object literal from source via brace
 * matching (robust to the multi-line pipeline form used across the codebase).
 */
const extractLookupBlocks = (src) => {
  const blocks = [];
  const re = /\$lookup\s*:\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const open = m.index + m[0].length - 1; // index of the opening brace
    let depth = 0;
    let i = open;
    for (; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') {
        depth -= 1;
        if (depth === 0) { i += 1; break; }
      }
    }
    blocks.push(src.slice(open, i));
  }
  return blocks;
};

const FROM_RE = /from:\s*['"]([a-z]+)['"]/;

describe('soft-delete $lookup discipline (DATA-009 guard)', () => {
  // Gather every $lookup into a soft-deletable collection, tagged compliant or not.
  const joins = []; // { file, from, hasGuard }
  for (const dir of SCAN_DIRS) {
    for (const file of collectJsFiles(dir)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const block of extractLookupBlocks(src)) {
        const from = (block.match(FROM_RE) || [])[1];
        if (from && SOFT_DELETABLE.includes(from)) {
          joins.push({
            file: path.relative(SERVER_ROOT, file),
            from,
            hasGuard: /isDeleted/.test(block),
          });
        }
      }
    }
  }

  test('every $lookup into a soft-deletable collection guards isDeleted at the join', () => {
    const offenders = joins
      .filter((j) => !j.hasGuard)
      .map((j) => `${j.file} → $lookup from '${j.from}' (missing isDeleted guard)`);
    expect(offenders).toEqual([]);
  });

  test('scanner actually finds the known soft-deletable joins (not vacuously green)', () => {
    // 6 known sites at the time of writing (2 export files + attendance rollup).
    // A drop below this means the scanner broke or joins were removed — review.
    expect(joins.length).toBeGreaterThanOrEqual(6);
  });
});
