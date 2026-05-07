import * as Sentry from '@sentry/react';

// ──────────────────────────────────────────────────────────
// Sentry initialization (Frontend)
// ──────────────────────────────────────────────────────────
// Initialized lazily so missing DSN (local dev) is a silent no-op.
// VITE_SENTRY_DSN is injected at build time by Vite — anything starting
// with VITE_ is exposed to the client bundle.
//
// Source maps are uploaded by @sentry/vite-plugin during `vite build`,
// so production stack traces deminify back to the original source.
// ──────────────────────────────────────────────────────────

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // No DSN configured — skip silently in dev/local

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,

    integrations: [
      // Session-replay-lite: only auto-capture when an error fires.
      // Cheap on quota and zero PII unless we opt in.
      Sentry.browserTracingIntegration(),
    ],

    // Performance sampling — 10% of sessions in prod, 100% in dev
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Don't spam Sentry with predictable network errors. Let the user
    // see them via the existing toast/auth-expired modal.
    ignoreErrors: [
      'Network Error',
      'Request aborted',
      'AbortError',
      // Browser noise
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
    ],

    beforeSend(event, hint) {
      // Drop expected 401s — AuthContext already handles them via the
      // `auth-expired` event. Sending them just adds noise.
      const err = hint?.originalException;
      if (err?.response?.status === 401) return null;
      return event;
    },
  });
}

// Re-export the SDK so callers don't need a second import.
export { Sentry };
