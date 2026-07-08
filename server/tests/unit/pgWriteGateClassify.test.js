// Unit tests for the F3 write-gate's stack classifier (tests/pg-write-gate.js)
// — the rules that decide fixture vs sanctioned vs PRODUCTION-violation for a
// raw-Mongoose write on the pg lane. Pure string-in/string-out, no DB.

const { classify } = require('../pg-write-gate');

// Build a plausible V8 stack from frame paths (first line = error message).
const stack = (...frames) =>
  ['Error', ...frames.map((f) => `    at someFn (${f}:12:34)`)].join('\n');

const NODE = '/repo/server/node_modules/mongoose/lib/model.js';
const GATE = '/repo/server/tests/pg-write-gate.js';

describe('pg-write-gate classify', () => {
  test('test-file frame → fixture (null)', () => {
    expect(classify(stack(NODE, GATE, '/repo/server/tests/integration/userRoutes.test.js'))).toBeNull();
  });

  test('production frame → returned (violation)', () => {
    const out = classify(stack(NODE, '/repo/server/services/reminderService.js'));
    expect(out).toContain('services/reminderService.js');
  });

  test('*.mongo.js repo impl → sanctioned (null), even when driven by a parity test', () => {
    expect(classify(stack(
      NODE,
      '/repo/server/lib/cron-run-repository.mongo.js',
      '/repo/server/tests/pg-parity/cron-run-repository.pg.test.js',
    ))).toBeNull();
  });

  test('reconcile allowlist → sanctioned (null) — retired at cutover', () => {
    expect(classify(stack(NODE, '/repo/server/services/reconcile/healers.js'))).toBeNull();
    expect(classify(stack(NODE, '/repo/server/services/reconcileService.js'))).toBeNull();
  });

  test('no repo frame (async-severed mongoose internals) → null', () => {
    expect(classify(stack(NODE, 'node:internal/process/task_queues'))).toBeNull();
  });

  test('first repo frame wins: production write invoked FROM a test still counts as production', () => {
    // A test calling an unported service directly IS the bug F3 hunts —
    // the service frame sits above the test frame and must win.
    const out = classify(stack(
      NODE,
      '/repo/server/controllers/syncController.js',
      '/repo/server/tests/integration/syncGoogleSheets.test.js',
    ));
    expect(out).toContain('controllers/syncController.js');
  });

  test('models/ middleware frame counts as production', () => {
    const out = classify(stack(NODE, '/repo/server/models/User.js'));
    expect(out).toContain('models/User.js');
  });
});
