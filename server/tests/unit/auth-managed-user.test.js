const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

jest.mock('../../services/auth/auth-repository', () => ({
  findForLogin: jest.fn(),
  findForMfaVerify: jest.fn(),
  findAuthUserById: jest.fn(),
}));
jest.mock('../../services/mfaService', () => ({ verifyToken: jest.fn() }));
jest.mock('../../services/auditService', () => ({ record: jest.fn() }));
jest.mock('../../lib/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../../services/authService', () => ({ isTokenRevoked: jest.fn().mockResolvedValue(false) }));

const repository = require('../../services/auth/auth-repository');
const { authenticate, verifyMfaLogin } = require('../../services/auth/auth-login');
const { protect, invalidateUserCache } = require('../../middleware/auth');

process.env.JWT_SECRET = 'managed-user-test-secret';

const runProtect = (token) => new Promise((resolve, reject) => {
  const req = {
    cookies: {},
    headers: { authorization: `Bearer ${token}` },
    originalUrl: '/api/learning/programs',
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { resolve({ status: this.statusCode, body }); },
  };
  protect(req, res, (error) => (error ? reject(error) : resolve({ status: 200, user: req.user })));
});

describe('managed user authentication boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  test('password login is denied before bcrypt sees a null password', async () => {
    repository.findForLogin.mockResolvedValue({
      _id: 'managed-1', empCode: 'E001', status: 'Active', canLogin: false, password: null,
    });
    const compare = jest.spyOn(bcrypt, 'compare');

    await expect(authenticate('E001', 'irrelevant')).rejects.toMatchObject({ statusCode: 403 });
    expect(compare).not.toHaveBeenCalled();
    compare.mockRestore();
  });

  test('managed user cannot complete an MFA second leg', async () => {
    repository.findForMfaVerify.mockResolvedValue({
      _id: 'managed-1', status: 'Active', canLogin: false, mfaEnabled: true, mfaSecret: 'secret',
    });
    const pending = jwt.sign({ id: 'managed-1', mfa: 'pending' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    await expect(verifyMfaLogin(pending, '123456')).rejects.toMatchObject({ statusCode: 401 });
  });

  test('disabling login rejects an existing token after cache invalidation', async () => {
    const token = jwt.sign({ id: 'user-1', jti: 'j1' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
    repository.findAuthUserById.mockResolvedValueOnce({
      _id: 'user-1', status: 'Active', canLogin: true, mustChangePassword: false,
    });
    expect((await runProtect(token)).status).toBe(200);

    invalidateUserCache('user-1');
    repository.findAuthUserById.mockResolvedValueOnce({
      _id: 'user-1', status: 'Active', canLogin: false, mustChangePassword: false,
    });
    const denied = await runProtect(token);
    expect(denied.status).toBe(403);
    expect(denied.body.message).toMatch(/access is disabled/i);
  });
});
