/**
 * Integration Tests — Certificate expiry reminders (D6 recertification signal)
 *
 * Drives the service directly with an injected clock. The mailer is mocked so a
 * "sent" email is just sendMail resolving. Asserts cadence buckets, idempotency,
 * the email/bell NotificationLog row, and the no-op cases.
 *
 * Run: npm test -- --testPathPatterns=certificateExpiryReminders
 */

jest.mock('../../lib/mailer', () => ({ sendMail: jest.fn() }));

const request = require('supertest');
const { getApp, getSeedData, teardown } = require('../setup');
const { sendMail } = require('../../lib/mailer');
const Certificate = require('../../models/Certificate');
const NotificationLog = require('../../models/NotificationLog');
const CronRun = require('../../models/CronRun');
const User = require('../../models/User');
const { sendCertificateExpiryReminders } = require('../../domains/learning/completion/expiry-reminder-service');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-01T00:00:00.000Z');
const inDays = (n) => new Date(NOW.getTime() + n * DAY_MS);
const VALID_CRON_TOKEN = 'test-cron-token-32chars-minimum!!';

let app, seed, seq = 0;

beforeAll(async () => {
  process.env['CRON_TOKEN'] = VALID_CRON_TOKEN;
  app = await getApp();
  seed = getSeedData();
  await NotificationLog.init(); // build the unique cadence index for idempotency
  await Certificate.init();
});

afterAll(async () => {
  delete process.env['CRON_TOKEN'];
  await CronRun.deleteMany({ jobName: 'certificate-expiry-reminders' });
  await teardown();
});

afterEach(async () => {
  sendMail.mockReset();
  await NotificationLog.deleteMany({});
  await Certificate.deleteMany({});
  await User.updateMany({ _id: seed.member1._id }, { $set: { email: null } });
});

const makeCert = (over = {}) => {
  seq += 1;
  return Certificate.create({
    certificateNumber: `CERT-TEST-${seq}`,
    verificationCode: `vcode-${seq}-${Math.random().toString(36).slice(2)}`,
    userId: seed.member1._id,
    cohortId: seed.class1._id,
    programName: 'Safety Compliance',
    cohortCode: 'SC-2026',
    status: 'Issued',
    issuedAt: NOW,
    ...over,
  });
};

const withEmail = () =>
  User.updateOne({ _id: seed.member1._id }, { $set: { email: 'm1@example.com' } });

describe('sendCertificateExpiryReminders', () => {
  test('certificate expiring in 5 days → emails the learner + logs an expiry_7 bell row', async () => {
    await withEmail();
    sendMail.mockResolvedValue({ messageId: 'x' });
    await makeCert({ validUntil: inDays(5) });

    const summary = await sendCertificateExpiryReminders({ now: NOW });

    expect(summary.scanned).toBe(1);
    expect(summary.sent).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);

    const log = await NotificationLog.findOne({ type: 'certificate_expiring' }).lean();
    expect(log.channel).toBe('email');
    expect(log.status).toBe('sent');
    expect(log.cadenceKey).toMatch(/:expiry_7$/);
    expect(log.recipientUserId.toString()).toBe(seed.member1._id.toString());
  });

  test('expiring in 20 days → expiry_30 bucket', async () => {
    await withEmail();
    sendMail.mockResolvedValue({ messageId: 'x' });
    await makeCert({ validUntil: inDays(20) });

    await sendCertificateExpiryReminders({ now: NOW });

    const log = await NotificationLog.findOne({ type: 'certificate_expiring' }).lean();
    expect(log.cadenceKey).toMatch(/:expiry_30$/);
  });

  test('is idempotent — a second run the same day does not resend the same bucket', async () => {
    await withEmail();
    sendMail.mockResolvedValue({ messageId: 'x' });
    await makeCert({ validUntil: inDays(5) });

    await sendCertificateExpiryReminders({ now: NOW });
    const second = await sendCertificateExpiryReminders({ now: NOW });

    expect(second.sent).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(await NotificationLog.countDocuments({ type: 'certificate_expiring' })).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  test('a learner without an email → row is skipped but still bell-visible', async () => {
    await makeCert({ validUntil: inDays(5) }); // member1 email stays null

    const summary = await sendCertificateExpiryReminders({ now: NOW });

    expect(summary.skipped).toBe(1);
    expect(sendMail).not.toHaveBeenCalled();
    const log = await NotificationLog.findOne({ type: 'certificate_expiring' }).lean();
    expect(log.status).toBe('skipped'); // non-pending → appears in the bell
  });

  test('revoked / soft-deleted / no-validUntil / already-expired certs are ignored', async () => {
    await withEmail();
    await makeCert({ status: 'Revoked', validUntil: inDays(5) });
    await makeCert({ isDeleted: true, deletedAt: NOW, validUntil: inDays(5) });
    await makeCert({ cohortId: seed.class1._id, validUntil: null });
    await makeCert({ cohortId: seed.class2._id, validUntil: inDays(-5) }); // expired

    const summary = await sendCertificateExpiryReminders({ now: NOW });

    expect(summary.scanned).toBe(0);
    expect(await NotificationLog.countDocuments({})).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('POST /api/cron/certificate-expiry-reminders', () => {
  afterEach(async () => {
    await CronRun.deleteMany({ jobName: 'certificate-expiry-reminders' });
  });

  test('requires the cron token and records a CronRun heartbeat when authenticated', async () => {
    const unauthorized = await request(app).post('/api/cron/certificate-expiry-reminders');
    expect(unauthorized.status).toBe(401);

    const authorized = await request(app)
      .post('/api/cron/certificate-expiry-reminders')
      .set('Authorization', `Bearer ${VALID_CRON_TOKEN}`);

    expect(authorized.status).toBe(200);
    expect(authorized.body.success).toBe(true);
    expect(authorized.body.data).toHaveProperty('scanned');

    const run = await CronRun.findOne({ jobName: 'certificate-expiry-reminders' }).lean();
    expect(run).toMatchObject({ lastStatus: 'ok' });
  });
});

describe('manager digest of expiring certificates', () => {
  beforeEach(async () => {
    sendMail.mockResolvedValue({ messageId: 'x' });
    await User.updateOne({ _id: seed.teacher._id }, { $set: { email: 'mgr@example.com' } });
    await User.updateOne({ _id: seed.member1._id }, { $set: { managerId: seed.teacher._id } });
  });

  afterEach(async () => {
    await User.updateMany(
      { _id: { $in: [seed.member1._id, seed.teacher._id] } },
      { $set: { managerId: null, email: null } },
    );
  });

  test('a manager gets one weekly digest for a report whose certificate is expiring', async () => {
    await makeCert({ validUntil: inDays(10) });

    const summary = await sendCertificateExpiryReminders({ now: NOW });

    expect(summary.managerDigests).toBe(1);
    const log = await NotificationLog.findOne({ type: 'manager_certificate_expiry_digest' }).lean();
    expect(log.recipientUserId.toString()).toBe(seed.teacher._id.toString());
    expect(log.cadenceKey).toMatch(/^manager_cert_expiry_/);
    expect(log.metadata.learnerCount).toBe(1);
  });

  test('the digest is weekly-idempotent (a second run the same week does not resend)', async () => {
    await makeCert({ validUntil: inDays(10) });

    await sendCertificateExpiryReminders({ now: NOW });
    const second = await sendCertificateExpiryReminders({ now: NOW });

    expect(second.managerDigests).toBe(0);
    expect(await NotificationLog.countDocuments({ type: 'manager_certificate_expiry_digest' })).toBe(1);
  });

  test('a learner with no manager produces no digest', async () => {
    await User.updateOne({ _id: seed.member1._id }, { $set: { managerId: null } });
    await makeCert({ validUntil: inDays(10) });

    const summary = await sendCertificateExpiryReminders({ now: NOW });

    expect(summary.managerDigests).toBe(0);
    expect(await NotificationLog.countDocuments({ type: 'manager_certificate_expiry_digest' })).toBe(0);
  });
});
