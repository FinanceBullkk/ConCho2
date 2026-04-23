// ──────────────────────────────────────────────────────────
// Shared Controller Error Handler
// ──────────────────────────────────────────────────────────
// Reads ServiceError.statusCode for proper HTTP status.
// Falls back to 500 for unexpected errors.
// ──────────────────────────────────────────────────────────

const handleError = (res, error) => {
  const status = error.statusCode || 500;
  res.status(status).json({ success: false, message: error.message });
};

module.exports = { handleError };
