const Sentry = require('@sentry/node');
const logger = require('./logger');

// Initialize Sentry only when SENTRY_DSN is configured.
// Absence of DSN is intentional — Sentry calls become no-ops.
let initialized = false;

const initSentry = () => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.warn('SENTRY_DSN not set — Sentry disabled. Set in production for error tracking.');
    return false;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RENDER_GIT_COMMIT || process.env.GIT_SHA || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    // Avoid leaking PII unless explicitly opted in.
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip cookie/authorization headers as a defense-in-depth.
      if (event.request?.headers) {
        delete event.request.headers.cookie;
        delete event.request.headers.authorization;
      }
      return event;
    },
  });

  initialized = true;
  logger.info({ dsn: dsn.replace(/:[^@]+@/, ':***@') }, 'Sentry initialized');
  return true;
};

const isEnabled = () => initialized;

module.exports = { Sentry, initSentry, isEnabled };
