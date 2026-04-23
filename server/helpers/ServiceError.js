// ──────────────────────────────────────────────────────────
// Shared ServiceError class
// ──────────────────────────────────────────────────────────
// Used across all service layers to throw HTTP-friendly errors.
// The controller-level handleError() reads .statusCode to
// set the correct HTTP response status.
// ──────────────────────────────────────────────────────────

class ServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
  }
}

module.exports = { ServiceError };
