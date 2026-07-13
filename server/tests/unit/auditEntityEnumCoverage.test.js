/**
 * Unit Test — AuditLog entity-enum coverage (2026-06-16 health audit).
 *
 * Root cause this guards against: the AuditLog `entity` enum repeatedly lagged
 * behind the controllers that audit new entities. Because audit writes are
 * fire-and-forget (auditService.record never throws into the caller), a write
 * with an entity value missing from the enum fails Mongoose validation
 * SILENTLY — the mutation succeeds but its audit row is dropped, breaking the
 * "audit every mutation" golden rule with zero visible symptom.
 *
 * This test scans the server source for every `entity: '<X>'` literal passed to
 * an audit call and asserts each one is a valid enum value, so the enum can
 * never silently fall behind a controller again.
 */

const fs = require('fs');
const path = require('path');
const { AUDIT_ENTITY_VALUES } = require('../../services/audit-enums');

// Directories that contain audit-emitting code (not tests, not node_modules).
const SCAN_DIRS = ['domains', 'controllers', 'services', 'jobs', 'middleware'].map((d) =>
  path.join(__dirname, '..', '..', d)
);

// Audited entity values are PascalCase model names ('Certificate', 'Role', …),
// so require an uppercase initial. This excludes lowercase `entity: 'entity'`
// column-map literals in the dual-backend Postgres repositories
// (domains/**/repository.pg.js), which are SQL field maps — not audit calls.
const ENTITY_LITERAL = /entity:\s*['"]([A-Z][A-Za-z]*)['"]/g;

/** Recursively collect *.js files under a dir, skipping test files. */
const collectJsFiles = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '__tests__' || name === 'tests') continue;
      collectJsFiles(full, acc);
    } else if (name.endsWith('.js') && !name.includes('.test.')) {
      acc.push(full);
    }
  }
  return acc;
};

describe('AuditLog entity-enum coverage', () => {
  const enumValues = new Set(AUDIT_ENTITY_VALUES);

  test('every entity audited by a controller/service exists in the AuditLog enum', () => {
    const offenders = []; // { entity, file }

    for (const dir of SCAN_DIRS) {
      for (const file of collectJsFiles(dir)) {
        const src = fs.readFileSync(file, 'utf8');
        let m;
        while ((m = ENTITY_LITERAL.exec(src)) !== null) {
          const entity = m[1];
          if (!enumValues.has(entity)) {
            offenders.push({ entity, file: path.relative(path.join(__dirname, '..', '..'), file) });
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  // Explicit guard for the five entities found missing in the 2026-06-16 audit,
  // so a future enum trim that drops them re-fails loudly.
  test.each(['Role', 'AutomationRule', 'Skill', 'TenantConfig', 'Notification'])(
    'enum includes %s (regression for the silent audit-drop bug)',
    (entity) => {
      expect(enumValues.has(entity)).toBe(true);
    }
  );
});
