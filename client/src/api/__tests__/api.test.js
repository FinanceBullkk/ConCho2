import { describe, it, expect, vi, beforeEach } from 'vitest';

// Helper: build a fresh mock axios + load api.js so each test sees an isolated
// instance with its own interceptors. axios.create is what api.js calls.
const buildFreshApi = async () => {
  const instance = Object.assign(
    // axios instances are callable (axios(config) === axios.request(config))
    vi.fn(),
    {
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      defaults: { headers: {} },
      get: vi.fn(),
      post: vi.fn(),
    },
  );
  const create = vi.fn(() => instance);

  vi.resetModules();
  vi.doMock('axios', () => ({ default: { create } }));
  const module = await import('../api.js');
  return { create, instance, module };
};

describe('api — axios instance (audit PR O / FE-011)', () => {
  it('configures a 30-second default timeout to avoid hung requests', async () => {
    const { create } = await buildFreshApi();
    expect(create.mock.calls[0][0].timeout).toBe(30_000);
  });

  it('passes withCredentials so HttpOnly cookies are sent', async () => {
    const { create } = await buildFreshApi();
    expect(create.mock.calls[0][0].withCredentials).toBe(true);
  });

  it('registers exactly one response interceptor (success + error handlers)', async () => {
    const { instance } = await buildFreshApi();
    expect(instance.interceptors.response.use).toHaveBeenCalledTimes(1);
    const [success, error] = instance.interceptors.response.use.mock.calls[0];
    expect(typeof success).toBe('function');
    expect(typeof error).toBe('function');
  });
});

describe('authAPI — admin reauth payloads', () => {
  it('sends currentPassword when force-logging out another user', async () => {
    const { instance, module } = await buildFreshApi();

    module.authAPI.adminForceLogout('user-123', 'admin-secret');

    expect(instance.post).toHaveBeenCalledWith(
      '/auth/admin/force-logout/user-123',
      { currentPassword: 'admin-secret' },
    );
  });

  it('sends currentPassword when disabling MFA for another user', async () => {
    const { instance, module } = await buildFreshApi();

    module.authAPI.mfaAdminDisable('user-456', 'admin-secret');

    expect(instance.post).toHaveBeenCalledWith(
      '/auth/mfa/admin-disable/user-456',
      { currentPassword: 'admin-secret' },
    );
  });
});

describe('api — CSRF refresh on 403 (audit PR O / FE-012)', () => {
  let instance, errorHandler;

  beforeEach(async () => {
    ({ instance } = await buildFreshApi());
    errorHandler = instance.interceptors.response.use.mock.calls[0][1];
    // Seed a fresh csrf cookie that the retry will pick up via getCsrfCookie().
    document.cookie = 'csrf-token=fresh-token-after-refresh';
  });

  it('refreshes CSRF + retries the original request when 403 mentions CSRF', async () => {
    const originalConfig = {
      method: 'POST',
      url: '/teams',
      headers: { 'X-CSRF-Token': 'stale' },
    };
    instance.get.mockResolvedValueOnce({ data: {} });        // /auth/csrf refresh
    instance.mockResolvedValueOnce({ data: { ok: true } });  // axios(config) retry

    const result = await errorHandler({
      response: { status: 403, data: { message: 'CSRF token invalid or missing' } },
      config: originalConfig,
    });

    expect(instance.get).toHaveBeenCalledWith('/auth/csrf');
    expect(originalConfig.__csrfRetried).toBe(true);
    expect(originalConfig.headers['X-CSRF-Token']).toBe('fresh-token-after-refresh');
    expect(instance).toHaveBeenCalledWith(originalConfig);
    expect(result.data.ok).toBe(true);
  });

  it('does NOT refresh CSRF for a 403 without csrf in the message', async () => {
    const config = { method: 'POST', url: '/teams', headers: {} };
    const err = {
      response: { status: 403, data: { message: 'Forbidden — role guard' } },
      config,
    };
    await expect(errorHandler(err)).rejects.toBe(err);
    expect(instance.get).not.toHaveBeenCalled();
    expect(config.__csrfRetried).toBeUndefined();
  });

  it('does NOT retry a request that has already been retried (no infinite loop)', async () => {
    const config = {
      method: 'POST', url: '/teams', headers: {},
      __csrfRetried: true,
    };
    const err = {
      response: { status: 403, data: { message: 'CSRF token invalid or missing' } },
      config,
    };
    await expect(errorHandler(err)).rejects.toBe(err);
    expect(instance.get).not.toHaveBeenCalled();
  });

  it('propagates the original 403 if the CSRF refresh itself fails', async () => {
    const config = { method: 'POST', url: '/teams', headers: {} };
    instance.get.mockRejectedValueOnce(new Error('network'));
    const err = {
      response: { status: 403, data: { message: 'CSRF token invalid or missing' } },
      config,
    };
    await expect(errorHandler(err)).rejects.toBe(err);
    // Header was not updated because refresh failed before the cookie was applied.
    expect(config.headers['X-CSRF-Token']).toBeUndefined();
  });
});
