// Unit tests for cronMonitor.runMonitored — the fail-soft contract.
//
// The whole point of the monitoring wrapper is: a heartbeat-write or Sentry
// failure must NEVER break (or mask) the underlying job. The job's own result
// passes through untouched and its error is re-thrown after being recorded.
// Session 09 required scenario: "Sentry failures do not break the job."
//
// Pure unit test — the DB (CronRun) and Sentry are mocked so we exercise only
// the wrapper's error-isolation logic, with no mongodb-memory-server needed.

jest.mock('../../lib/sentry', () => ({
  Sentry: { captureCheckIn: jest.fn(), captureException: jest.fn() },
  isEnabled: jest.fn(() => true),
}));
jest.mock('../../models/CronRun', () => ({ updateOne: jest.fn().mockResolvedValue({}) }));
jest.mock('../../lib/logger', () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }));

const { runMonitored } = require('../../lib/cronMonitor');
const { Sentry, isEnabled } = require('../../lib/sentry');
const CronRun = require('../../models/CronRun');

const JOB = 'reconcile';
const OPTS = { monitorSlug: 'reconcile-nightly', expectedIntervalMs: 24 * 60 * 60 * 1000 };

beforeEach(() => {
  jest.clearAllMocks();
  isEnabled.mockReturnValue(true);
  CronRun.updateOne.mockResolvedValue({});
});

describe('cronMonitor.runMonitored — happy path', () => {
  test('returns fn result and writes start + end heartbeat', async () => {
    const fn = jest.fn().mockResolvedValue('RESULT');

    const result = await runMonitored(JOB, OPTS, fn);

    expect(result).toBe('RESULT');
    expect(fn).toHaveBeenCalledTimes(1);
    // recordStart + recordEnd = two heartbeat writes
    expect(CronRun.updateOne).toHaveBeenCalledTimes(2);
    // in_progress check-in then ok check-in; no exception captured
    expect(Sentry.captureCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ monitorSlug: 'reconcile-nightly', status: 'in_progress' }),
      undefined,
    );
    expect(Sentry.captureCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok' }),
      undefined,
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('cronMonitor.runMonitored — fail-soft side channels', () => {
  test('Sentry check-in throwing does NOT break the job', async () => {
    Sentry.captureCheckIn.mockImplementation(() => { throw new Error('sentry down'); });
    const fn = jest.fn().mockResolvedValue('STILL-OK');

    await expect(runMonitored(JOB, OPTS, fn)).resolves.toBe('STILL-OK');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('heartbeat (CronRun) write failure does NOT break the job', async () => {
    CronRun.updateOne.mockRejectedValue(new Error('mongo down'));
    const fn = jest.fn().mockResolvedValue('STILL-OK');

    await expect(runMonitored(JOB, OPTS, fn)).resolves.toBe('STILL-OK');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('Sentry disabled — no check-ins or exception capture, job still runs', async () => {
    isEnabled.mockReturnValue(false);
    const fn = jest.fn().mockResolvedValue('OK');

    await expect(runMonitored(JOB, OPTS, fn)).resolves.toBe('OK');
    expect(Sentry.captureCheckIn).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('cronMonitor.runMonitored — job error path', () => {
  test('re-throws the job error AND records it (error check-in + captureException)', async () => {
    const boom = new Error('job blew up');
    const fn = jest.fn().mockRejectedValue(boom);

    await expect(runMonitored(JOB, OPTS, fn)).rejects.toBe(boom);
    // start + end(error) heartbeats both written
    expect(CronRun.updateOne).toHaveBeenCalledTimes(2);
    expect(Sentry.captureCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' }),
      undefined,
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(boom);
  });

  test('captureException throwing on the error path is swallowed — original error still re-thrown', async () => {
    const boom = new Error('job blew up');
    const fn = jest.fn().mockRejectedValue(boom);
    Sentry.captureException.mockImplementation(() => { throw new Error('sentry also down'); });

    // The job's original error must survive; the masking Sentry error must not.
    await expect(runMonitored(JOB, OPTS, fn)).rejects.toBe(boom);
  });
});
