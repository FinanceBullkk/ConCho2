/**
 * Unit tests — domains/schedule/room-lock-policy
 * Pure helpers (no DB): the DELTA A same-Office guard + the robust
 * E11000 detector. The acquire/release DB paths are covered by the
 * roomOfficeScope integration suite.
 */

const { assertSameOffice, isDuplicateKeyError } = require('../../domains/schedule/room-lock-policy');
const { ServiceError } = require('../../helpers/ServiceError');

describe('room-lock-policy.assertSameOffice (DELTA A)', () => {
  const officeA = '64b000000000000000000001';
  const officeB = '64b000000000000000000002';

  test('passes when the room office matches the session office', () => {
    expect(() => assertSameOffice({ officeId: officeA }, officeA)).not.toThrow();
  });

  test('hard-fails 422 when the session has NO office (never a silent no-op)', () => {
    try {
      assertSameOffice({ officeId: officeA }, null);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect(err.statusCode).toBe(422);
      expect(err.message).toMatch(/no Office/i);
    }
  });

  test('fails 422 when the room belongs to a different office', () => {
    try {
      assertSameOffice({ officeId: officeA }, officeB);
      throw new Error('expected throw');
    } catch (err) {
      expect(err.statusCode).toBe(422);
      expect(err.message).toMatch(/different Office/i);
    }
  });

  test('compares by string (ObjectId vs string equal)', () => {
    expect(() => assertSameOffice({ officeId: { toString: () => officeA } }, officeA)).not.toThrow();
  });
});

describe('room-lock-policy.isDuplicateKeyError', () => {
  test('detects a bare E11000 code', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
  });
  test('detects E11000 nested under writeErrors (bulk under a tx)', () => {
    expect(isDuplicateKeyError({ writeErrors: [{ code: 11000 }] })).toBe(true);
  });
  test('detects E11000 in the message only', () => {
    expect(isDuplicateKeyError({ message: 'E11000 duplicate key' })).toBe(true);
  });
  test('ignores unrelated errors', () => {
    expect(isDuplicateKeyError({ code: 121, message: 'validation failed' })).toBe(false);
    expect(isDuplicateKeyError(null)).toBe(false);
  });
});
