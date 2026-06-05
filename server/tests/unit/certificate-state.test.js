const { deriveCertificateState } = require('../../domains/learning/reports/compliance-certificate-state');

const NOW = new Date('2026-06-05T12:00:00.000Z');

describe('deriveCertificateState', () => {
  test('legacy issued certificate without expiry stays issued', () => {
    expect(deriveCertificateState({ status: 'Issued', validUntil: null }, NOW)).toBe('issued');
  });

  test('issued certificate inside 30-day window is expiring', () => {
    expect(deriveCertificateState({ status: 'Issued', validUntil: '2026-06-20T00:00:00.000Z' }, NOW))
      .toBe('expiring');
  });

  test('issued certificate past validUntil is expired', () => {
    expect(deriveCertificateState({ status: 'Issued', validUntil: '2026-06-04T00:00:00.000Z' }, NOW))
      .toBe('expired');
  });

  test('revoked wins over expiry windows', () => {
    expect(deriveCertificateState({ status: 'Revoked', validUntil: '2026-12-31T00:00:00.000Z' }, NOW))
      .toBe('revoked');
  });

  test('soft-deleted certificate is treated as missing', () => {
    expect(deriveCertificateState({ status: 'Issued', isDeleted: true }, NOW)).toBe('missing');
  });
});
