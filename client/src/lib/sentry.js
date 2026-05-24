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
      Sentry.browserTracingIntegration(),
      // Audit PR 10 (FE-013): the old code comment promised "session-replay-
      // lite" but never actually configured replay. Either we ship replay or
      // we drop the claim; we drop it for now and revisit when quota allows.
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
      // Stale-deploy chunk-load failures — happen when a long-lived tab
      // tries to lazy-load a chunk we no longer serve. User reload fixes.
      /Loading chunk \d+ failed/i,
      /Failed to fetch dynamically imported module/i,
    ],

    beforeSend(event, hint) {
      // Drop expected 401s — AuthContext already handles them via the
      // `auth-expired` event. Sending them just adds noise.
      const err = hint?.originalException;
      if (err?.response?.status === 401) return null;
      // Audit PR 10 (FE-013): strip request.data on captured events. The
      // default Sentry browser integration captures axios bodies into
      // breadcrumbs — anything posted to /auth/login or /auth/change-
      // password leaks plaintext credentials. We clear the body field on
      // every captured event before transport.
      if (event.request && 'data' in event.request) {
        event.request.data = '[REDACTED]';
      }
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((b) => {
          if (b.category === 'xhr' || b.category === 'fetch') {
            const { data, ...rest } = b.data || {};
            return { ...b, data: { ...rest, body: data ? '[REDACTED]' : undefined } };
          }
          return b;
        });
      }
      return event;
    },
  });
}

// Re-export the SDK so callers don't need a second import.
export { Sentry };
