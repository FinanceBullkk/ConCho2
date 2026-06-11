const speakeasy = require('speakeasy');
const mfaService = require('../../services/mfaService');

// ──────────────────────────────────────────────────────────
// SEC-018 (audit round 3) — MFA replay guard uses an ABSOLUTE
// TOTP step counter, not the relative verifyDelta offset.
// ──────────────────────────────────────────────────────────
// The old guard stored/compared verifyDelta (−1/0/+1). A current code is
// always delta 0, so after the first login stored 0, every later current
// code hit `0 <= 0` and was falsely rejected → TOTP worked exactly once.
// These tests inject `nowSeconds` so the two "windows" are deterministic
// (no 30 s sleeps). step = 30 s.
// ──────────────────────────────────────────────────────────

const STEP = 30;
const secret = speakeasy.generateSecret({ length: 20 }).base32;
const t0 = 1_700_000_000;            // fixed epoch seconds (step N)
const t1 = t0 + STEP;                // next step (N+1)
const codeAt = (t) => speakeasy.totp({ secret, encoding: 'base32', time: t });

describe('mfaService.verifyTokenWithReplay — absolute counter', () => {
  test('first login: valid, returns the absolute step counter', () => {
    const r = mfaService.verifyTokenWithReplay(secret, codeAt(t0), null, t0);
    expect(r.valid).toBe(true);
    expect(r.counter).toBe(Math.floor(t0 / STEP));
  });

  test('replay of the SAME code in the same step is rejected', () => {
    const first = mfaService.verifyTokenWithReplay(secret, codeAt(t0), null, t0);
    const replay = mfaService.verifyTokenWithReplay(secret, codeAt(t0), first.counter, t0);
    expect(replay.valid).toBe(false);
    expect(replay.counter).toBeNull();
  });

  test('REGRESSION: a current code in a LATER step still logs in', () => {
    // Before SEC-018 this falsely returned invalid (delta 0 <= stored 0).
    const first = mfaService.verifyTokenWithReplay(secret, codeAt(t0), null, t0);
    const next = mfaService.verifyTokenWithReplay(secret, codeAt(t1), first.counter, t1);
    expect(next.valid).toBe(true);
    expect(next.counter).toBe(first.counter + 1);
  });

  test('an old (already-consumed) step code is rejected after advancing', () => {
    const first = mfaService.verifyTokenWithReplay(secret, codeAt(t0), null, t0);
    const next = mfaService.verifyTokenWithReplay(secret, codeAt(t1), first.counter, t1);
    // Replaying the t0 code at t1: window:1 still matches it (delta -1) →
    // absolute counter == first.counter ≤ next.counter → rejected.
    const old = mfaService.verifyTokenWithReplay(secret, codeAt(t0), next.counter, t1);
    expect(old.valid).toBe(false);
  });

  test('a wrong code is rejected (no counter)', () => {
    const r = mfaService.verifyTokenWithReplay(secret, '000000', null, t0);
    // '000000' is almost never the valid code for this secret/step.
    expect(r.valid).toBe(false);
    expect(r.counter).toBeNull();
  });

  test('missing secret or token → invalid', () => {
    expect(mfaService.verifyTokenWithReplay('', codeAt(t0), null, t0).valid).toBe(false);
    expect(mfaService.verifyTokenWithReplay(secret, '', null, t0).valid).toBe(false);
  });
});
