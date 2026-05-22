const { cronAuth } = require('../../middleware/cronAuth');

function mockReq(overrides = {}) {
  return {
    headers: {},
    query: {},
    ip: '127.0.0.1',
    originalUrl: '/api/cron/reconcile',
    ...overrides,
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return res;
}

describe('cronAuth middleware', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns 503 when CRON_TOKEN is not set', () => {
    delete process.env.CRON_TOKEN;
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    cronAuth(req, res, next);
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 503 when CRON_TOKEN is shorter than 16 characters', () => {
    process.env.CRON_TOKEN = 'short';
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    cronAuth(req, res, next);
    expect(res.statusCode).toBe(503);
  });

  it('returns 401 when no token is provided', () => {
    process.env.CRON_TOKEN = 'a-valid-token-that-is-long-enough';
    const req = mockReq({ headers: {}, query: {} });
    const res = mockRes();
    const next = jest.fn();
    cronAuth(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when wrong Bearer token is provided', () => {
    process.env.CRON_TOKEN = 'a-valid-token-that-is-long-enough';
    const req = mockReq({ headers: { authorization: 'Bearer wrong-token' } });
    const res = mockRes();
    const next = jest.fn();
    cronAuth(req, res, next);
    expect(res.statusCode).toBe(401);
  });

  it('calls next() with correct Bearer token', () => {
    process.env.CRON_TOKEN = 'a-valid-token-that-is-long-enough';
    const req = mockReq({ headers: { authorization: 'Bearer a-valid-token-that-is-long-enough' } });
    const res = mockRes();
    const next = jest.fn();
    cronAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('calls next() with X-Cron-Token header', () => {
    process.env.CRON_TOKEN = 'a-valid-token-that-is-long-enough';
    const req = mockReq({ headers: { 'x-cron-token': 'a-valid-token-that-is-long-enough' } });
    const res = mockRes();
    const next = jest.fn();
    cronAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next() with ?token query param', () => {
    process.env.CRON_TOKEN = 'a-valid-token-that-is-long-enough';
    const req = mockReq({ query: { token: 'a-valid-token-that-is-long-enough' } });
    const res = mockRes();
    const next = jest.fn();
    cronAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('is case-insensitive for Bearer prefix', () => {
    process.env.CRON_TOKEN = 'a-valid-token-that-is-long-enough';
    const req = mockReq({ headers: { authorization: 'BEARER a-valid-token-that-is-long-enough' } });
    const res = mockRes();
    const next = jest.fn();
    cronAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
