require('dotenv').config();

// Sentry must be initialized before requiring anything that might throw
// during module load, otherwise early errors won't be captured.
const { Sentry, initSentry, isEnabled: sentryEnabled } = require('./lib/sentry');
initSentry();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const pinoHttp = require('pino-http');

const connectDB = require('./config/db');
const logger = require('./lib/logger');
const { requestId } = require('./middleware/requestId');

// Trigger nodemon
// ──────────────────────────────────────────────────────────
// TMS v2 — Express Server
// ──────────────────────────────────────────────────────────

// Fail fast if required secrets are missing — prevents silently
// signing tokens with `undefined` and confusing login failures.
if (!process.env.JWT_SECRET) {
  logger.fatal('JWT_SECRET is not set. Refusing to start.');
  process.exit(1);
}

const app = express();

// ── Request correlation ID (must be early so all logs/errors carry it) ──
app.use(requestId);

// ── Structured request/response logging ─────────────────────
// pino-http logs each request with method, url, status, latency, and
// the X-Request-Id we just attached. Skipped in test runs.
if (process.env.NODE_ENV !== 'test') {
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    })
  );
}

// Trust the first proxy hop (needed for correct client IPs
// behind a load balancer so rate-limit keys on real IPs).
app.set('trust proxy', 1);

// ── Security headers (Phase 1.5) ──────────────────────────
// CSP notes:
//   - style-src KEEPS 'unsafe-inline' because Radix UI / Floating UI
//     set dynamic inline styles for popover positioning. Removing
//     it requires either CSP nonces (every component touched) or
//     migrating to a positioning library that uses classes only.
//     Tracked as Phase 5 polish work.
//   - object-src 'none' blocks Flash/PDF/Java applet embedding.
//   - base-uri 'self' prevents <base> tag injection (an XSS escalator).
//   - form-action 'self' prevents <form action="evil.com"> attacks.
//   - frame-ancestors 'none' is a stronger X-Frame-Options: prevents
//     this app from being iframed anywhere (clickjacking).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'"],
      styleSrc:      ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:       ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:        ["'self'", 'data:', 'https:'],
      connectSrc:    ["'self'"],
      objectSrc:     ["'none'"],
      baseUri:       ["'self'"],
      formAction:    ["'self'"],
      frameAncestors: ["'none'"],
      // Force HTTPS at the browser level in production.
      ...(process.env.NODE_ENV === 'production'
        ? { upgradeInsecureRequests: [] }
        : {}),
    },
  },
  crossOriginEmbedderPolicy: false,
  // Cross-Origin-Opener-Policy: protects against side-channel attacks
  // (Spectre) and window.opener leaks.
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  // Cross-Origin-Resource-Policy: prevents this app's resources being
  // loaded by other origins.
  crossOriginResourcePolicy: { policy: 'same-site' },
  // Referrer-Policy: don't leak the URL on outbound navigation.
  referrerPolicy: { policy: 'no-referrer' },
}));

// Permissions-Policy: deny access to powerful browser APIs we don't use.
// Helmet doesn't ship a built-in Permissions-Policy in v8, so we set
// the header directly. Each entry says "no origin can use this feature".
app.use((_req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
      'autoplay=()',
      'fullscreen=(self)',
    ].join(', ')
  );
  next();
});

// ── CORS allowlist ────────────────────────────────────────
// CORS_ORIGINS is a comma-separated list of allowed origins.
// Example: CORS_ORIGINS=http://localhost:5173,https://tms.example.com
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // No-origin requests (same-origin browser GETs, curl, monitoring,
      // server-side health probes) must be allowed. Browsers only set
      // the Origin header on cross-origin or non-simple requests, so
      // rejecting no-origin here breaks legitimate same-origin traffic
      // (e.g. typing the URL into the address bar to load the SPA).
      // The cross-origin protection comes from the allowedOrigins
      // check below — that's where actual CORS enforcement happens.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ── Core middleware ───────────────────────────────────────
app.use(cookieParser());                          // Parse HttpOnly cookies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── NoSQL Injection Prevention ───────────────────────────
// Strips keys containing $ or . from req.body, req.query, req.params
app.use(mongoSanitize());

// ── Global Rate Limiters (SEC-RL-01/02) ──────────────────
const { globalLimiter, globalWriteLimiter } = require('./middleware/rateLimiters');
app.use('/api', globalLimiter);       // 200 requests/min per IP (all endpoints)
app.use('/api', globalWriteLimiter);   // 60 writes/min per user (POST/PUT/PATCH/DELETE)

// ── Health & readiness ───────────────────────────────────
// /health   = liveness (always 200 if process is up)
// /ready    = readiness (503 if Mongo is unreachable)
// /api/health kept as alias for backward compat with existing clients.
const healthRouter = require('./routes/healthRoutes');
app.use('/', healthRouter);
app.use('/api', healthRouter);


// ──────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/teams', require('./routes/teamRoutes'));
app.use('/api/classes', require('./routes/classRoutes'));
app.use('/api/schedules', require('./routes/scheduleRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/evaluations', require('./routes/evaluationRoutes'));
app.use('/api/enrollments', require('./routes/enrollmentRoutes'));
app.use('/api/sync', require('./routes/syncRoutes'));
app.use('/api/import', require('./routes/importRoutes'));
app.use('/api/export', require('./routes/exportRoutes'));
app.use('/api/settings', require('./routes/settingRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/admin-db', require('./routes/adminDbRoutes'));
app.use('/api/admin/audit', require('./routes/auditRoutes'));
app.use('/api/admin/reconcile', require('./routes/reconcileRoutes'));
app.use('/api/cron', require('./routes/cronRoutes'));

// ── Production: Serve React client build ─────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));

  // SPA fallback: any non-API route → index.html (React Router)
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  // Dev: plain 404 for non-API routes
  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
  });
}

// ── Global error handler ─────────────────────────────────
app.use((err, req, res, _next) => {
  // Log with request context. pino-http already attached req.log; fall
  // back to the base logger if it's missing (e.g. very early errors).
  const log = req.log || logger;
  log.error({ err, requestId: req.id, statusCode: err.statusCode || 500 }, 'Request error');

  // Forward to Sentry for 5xx and unexpected errors only.
  // 4xx (validation / auth) are expected and would be noise.
  const status = err.statusCode || 500;
  if (sentryEnabled() && status >= 500) {
    Sentry.captureException(err, { tags: { requestId: req.id } });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `Duplicate value for '${field}': ${err.keyValue[field]}`,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token expired' });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error',
  });
});

// ── Start ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

// In test mode, supertest handles HTTP and tests manage their own DB connection.
// Only auto-start when running normally (dev/production).
if (process.env.NODE_ENV !== 'test') {
  const startServer = async () => {
    await connectDB();
    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'TMS v2 API running');
    });
    // Start background jobs after DB is connected
    const { startReconcileJob } = require('./jobs/reconcileJob');
    startReconcileJob();
  };

  startServer().catch((err) => {
    logger.fatal({ err }, 'Failed to start server');
    if (sentryEnabled()) Sentry.captureException(err);
    process.exit(1);
  });
}

// Last-resort catchers so a stray rejection doesn't take down the process
// silently. Sentry captures, logger records, then we exit so the orchestrator
// can restart us cleanly.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
  if (sentryEnabled()) Sentry.captureException(reason);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — exiting');
  if (sentryEnabled()) Sentry.captureException(err);
  // Give Sentry a moment to flush, then exit so the orchestrator restarts us.
  setTimeout(() => process.exit(1), 1000).unref();
});

module.exports = app;