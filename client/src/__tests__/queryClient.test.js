import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted to the top of the file, so the factory must not close
// over locals declared below it. Use vi.hoisted() to declare the spy in
// the same hoisted phase as the mock factory.
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));

import { queryClient } from '../queryClient';

describe('queryClient — mutation defaults (audit PR K / FE-005)', () => {
  beforeEach(() => {
    toastError.mockReset();
  });

  it('disables retry on mutations', () => {
    const defaults = queryClient.getDefaultOptions().mutations;
    expect(defaults.retry).toBe(false);
  });

  it('default onError toasts the server message', () => {
    const onError = queryClient.getDefaultOptions().mutations.onError;
    onError(
      { response: { status: 500, data: { message: 'boom' } } },
      undefined,
      undefined,
      { meta: undefined },
    );
    expect(toastError).toHaveBeenCalledWith('boom');
  });

  it('default onError stays silent on 401 (auth interceptor handles it)', () => {
    const onError = queryClient.getDefaultOptions().mutations.onError;
    onError({ response: { status: 401, data: { message: 'no' } } }, undefined, undefined, {});
    expect(toastError).not.toHaveBeenCalled();
  });

  it('default onError respects meta.suppressGlobalErrorToast', () => {
    const onError = queryClient.getDefaultOptions().mutations.onError;
    onError(
      { response: { status: 500, data: { message: 'should not toast' } } },
      undefined,
      undefined,
      { meta: { suppressGlobalErrorToast: true } },
    );
    expect(toastError).not.toHaveBeenCalled();
  });
});
