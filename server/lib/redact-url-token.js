// ──────────────────────────────────────────────────────────
// redactUrlToken — OPS-012
// ──────────────────────────────────────────────────────────
// The cron endpoints accept a last-resort `?token=<CRON_TOKEN>` query
// channel. pino's `redact` option is key-based and cannot mask substrings
// inside URL strings, so any log/audit line that embeds the raw URL
// (pino-http request log, cronAuth failure/success lines, the 730-day
// cron-auth-failed audit note) would persist the shared secret verbatim.
// Strip the token value before the URL leaves the process.
// ──────────────────────────────────────────────────────────

/**
 * Replace the value of any `token` query parameter with [REDACTED].
 * Non-string input passes through untouched (fail-soft for odd callers).
 *
 * @param {string} url e.g. "/api/cron/reconcile?token=abc&x=1"
 * @returns {string}   e.g. "/api/cron/reconcile?token=[REDACTED]&x=1"
 */
const redactUrlToken = (url) =>
  typeof url === 'string' ? url.replace(/([?&]token=)[^&]*/gi, '$1[REDACTED]') : url;

module.exports = { redactUrlToken };
