/**
 * DOCS-003 (audit round 8) regression: the JWT/session TTL default.
 *
 * The documented session policy is a 24h kill-window. The old code default
 * was '7d', so any deploy that forgot to set JWT_EXPIRE (render.yaml didn't)
 * silently issued week-long sessions. These tests pin the default to 1d and
 * confirm an explicit JWT_EXPIRE still wins.
 *
 * JWT_EXPIRE is captured at module load, so each case re-requires the module
 * in isolation with a controlled env.
 */

const jwt = require('jsonwebtoken');

const loadAuthTokens = (jwtExpire) => {
  let mod;
  jest.isolateModules(() => {
    if (jwtExpire === undefined) delete process.env.JWT_EXPIRE;
    else process.env.JWT_EXPIRE = jwtExpire;
    mod = require('../../services/auth/auth-tokens');
  });
  return mod;
};

describe('JWT_EXPIRE default (DOCS-003)', () => {
  const ORIGINAL_EXPIRE = process.env.JWT_EXPIRE;

  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret';
  });

  afterEach(() => {
    if (ORIGINAL_EXPIRE === undefined) delete process.env.JWT_EXPIRE;
    else process.env.JWT_EXPIRE = ORIGINAL_EXPIRE;
  });

  test('cookie maxAge defaults to 24h when JWT_EXPIRE is unset', () => {
    const { getCookieOptions } = loadAuthTokens(undefined);
    expect(getCookieOptions().maxAge).toBe(24 * 60 * 60 * 1000);
  });

  test('token exp defaults to ~24h when JWT_EXPIRE is unset', () => {
    const { generateToken } = loadAuthTokens(undefined);
    const decoded = jwt.decode(generateToken('507f1f77bcf86cd799439011'));
    const ttlSeconds = decoded.exp - decoded.iat;
    expect(ttlSeconds).toBe(24 * 60 * 60);
  });

  test('explicit JWT_EXPIRE still overrides the default', () => {
    const { getCookieOptions } = loadAuthTokens('2h');
    expect(getCookieOptions().maxAge).toBe(2 * 60 * 60 * 1000);
  });
});
