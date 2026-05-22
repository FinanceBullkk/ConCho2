// ──────────────────────────────────────────────────────────
// Shared Controller Error Handler
// ──────────────────────────────────────────────────────────
// Reads ServiceError.statusCode for proper HTTP status.
// Falls back to 500 for unexpected errors.
// ──────────────────────────────────────────────────────────

const handleError = (res, error) => {
  // Mongoose validation error (schema constraints)
  if (error.name === 'ValidationError') {
    const message = Object.values(error.errors).map(e => e.message).join(', ');
    return res.status(400).json({ success: false, message });
  }

  // MongoDB duplicate key
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `Duplicate value for '${field}': ${(error.keyValue || {})[field]}`,
    });
  }

  const status = error.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = (status === 500 && isProd) ? 'Internal Server Error' : error.message;
  res.status(status).json({ success: false, message });
};

module.exports = { handleError };
