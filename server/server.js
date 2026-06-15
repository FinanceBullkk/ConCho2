// dotenv 17 prints an "injecting env" tip per config() call — quiet it so
// structured pino output stays the only thing on stdout.
require('dotenv').config({ quiet: true });

// Sentry must be initialized before requiring anything that might throw
// during module load, otherwise early errors won't be captured.
const { Sentry, initSentry, isEnabled: sentryEnabled } = require('./lib/sentry');
initSentry();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { mongoSanitizeInPlace } = require('./middleware/mongo-sanitize-in-place');
const pinoHttp = require('pino-http');
const compression = require('compression');

const connectDB = require('./config/db');
const logger = require('./lib/logger');
const { redactUrlToken } = require('./lib/redact-url-token');
const { requestId } = require('./middleware/requestId');
const swaggerUi = require('swagger-ui-express');
const { spec } = require('./lib/swagger');

// Trigger nodemon
// ──────────────────────────────────────────────────────────
// TMS v2 — Express Server
// ──────────────────────────────────────────────────────────

// Audit PR 10 (OPS-001 launch checklist): production deploys must carry
// JWT_SECRET (always) plus MONGO_URI / CRON_TOKEN / IMPORT_DEFAULT_PASSWORD
// (production only). Failing at boot is louder + faster to diagnose than
// failing at first request. The extracted helper is unit-tested in
// tests/unit/envValidator.test.js.
const { validateEnvOrExit } = require('./lib/envValidator');
validateEnvOrExit(logger);

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
        // OPS-012: cron endpoints accept ?token=<CRON_TOKEN> as a last-resort
        // channel — redact it so the request log never persists the secret.
        req: (req) => ({ id: req.id, method: req.method, url: redactUrlToken(req.url) }),
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

// SEC-006 (audit PR E) — pre-CORS guard for no-origin requests.
//
// The `cors()` middleware below does NOT get `req`, only the `origin`
// header value, so the original code accepted EVERY no-origin request
// to keep same-origin SPA navigation working. That meant a non-browser
// tool with a stolen cookie (curl, attacker Node script) could call
// the API with `credentials: true` and pass through.
//
// Fix: in production, reject /api/* writes (POST/PUT/PATCH/DELETE) that
// arrive without an Origin header. Same-origin GETs from the address
// bar are still allowed (read-only browser navigation). /health and
// /ready remain allow-listed for Render's probe (no Origin header on
// server-side probes).
const NO_ORIGIN_ALLOWLIST = new Set(['/health', '/ready', '/api/health', '/api/ready']);
const isSafeMethod = (m) => m === 'GET' || m === 'HEAD' || m === 'OPTIONS';

app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') return next();
  // Test harness escape hatch — supertest never sets an Origin header, so
  // integration tests that temporarily toggle NODE_ENV=production for a
  // single assertion would otherwise 403 before reaching their target.
  // Production deploys must NOT set this.
  if (process.env.CORS_BYPASS_NO_ORIGIN === 'true') return next();
  if (req.headers.origin) return next();              // Origin present → CORS handles it
  if (isSafeMethod(req.method)) return next();         // GET/HEAD/OPTIONS without origin = browser nav or probe
  if (NO_ORIGIN_ALLOWLIST.has(req.path)) return next();
  // Cron endpoints are called by cron-job.org (an HTTP client, not a browser)
  // so they never carry an Origin header. They are authenticated by CRON_TOKEN
  // via cronAuth — safe to exempt from the no-origin write guard.
  if (req.path.startsWith('/api/cron/')) return next();
  return res.status(403).json({
    success: false,
    message: 'Cross-origin write requests require a valid Origin header in production',
  });
});

app.use(
  cors({
    origin: (origin, cb) => {
      // No-origin requests (same-origin browser GETs, curl, monitoring,
      // server-side health probes) are gated by the pre-CORS guard above
      // in production. Here we just allow them so the cors middleware
      // doesn't re-reject them.
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ── Core middleware ───────────────────────────────────────
// PERF-010: Gzip/Brotli compression for all responses >1 KB.
// Skips compression for tiny responses (overhead not worth it) and
// for requests that already carry a Content-Encoding (edge proxies).
app.use(compression({
  threshold: 1024,
  level: 6, // balanced speed/ratio
}));
app.use(cookieParser());                          // Parse HttpOnly cookies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// express 5: req.body is undefined when no parser matched (express 4 gave {}).
// Dozens of handlers destructure req.body on optionally-bodied requests
// (DELETE with reason, logout, ...) — restore the express 4 default app-wide.
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// ── NoSQL Injection Prevention ───────────────────────────
// Strips keys containing $ or . from req.body, req.query, req.params,
// req.headers. express-5-compatible wrapper around express-mongo-sanitize's
// sanitize() — see middleware/mongo-sanitize-in-place.js.
app.use(mongoSanitizeInPlace);

// ── CSRF Protection (double-submit cookie) ────────────────
const { csrfProtection } = require('./middleware/csrfProtection');
app.use('/api', csrfProtection);

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


// ── API Docs — enabled in dev or when SWAGGER_ENABLED=true ──
if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customSiteTitle: 'TMS v2 API Docs',
    swaggerOptions: { persistAuthorization: true },
  }));
  app.get('/api/docs.json', (_req, res) => res.json(spec));
}

// ──────────────────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────────────────

// CSRF token endpoint (GET — exempt from CSRF check itself via safe-method rule)
const { getCsrfToken } = require('./middleware/csrfProtection');
app.get('/api/auth/csrf', getCsrfToken);

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/teams', require('./domains/groups/routes'));
app.use('/api/classes', require('./routes/classRoutes'));
app.use('/api/learning', require('./domains/learning/routes'));
app.use('/api/org', require('./domains/org/routes'));
app.use('/api/rooms', require('./domains/room/routes'));
app.use('/api/assessment', require('./domains/assessment/routes'));
app.use('/api/schedules', require('./domains/schedule/routes'));
app.use('/api/english', require('./domains/english-class/routes'));
app.use('/api/attendance', require('./domains/attendance/routes'));
app.use('/api/evaluations', require('./routes/evaluationRoutes'));
app.use('/api/enrollments', require('./routes/enrollmentRoutes'));
app.use('/api/sync', require('./routes/syncRoutes'));
app.use('/api/import', require('./routes/importRoutes'));
app.use('/api/export', require('./routes/exportRoutes'));
app.use('/api/settings', require('./routes/settingRoutes'));
app.use('/api/access', require('./domains/access/routes'));
app.use('/api/custom-fields', require('./domains/custom-field/routes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/admin-db', require('./routes/adminDbRoutes'));
app.use('/api/admin/audit', require('./routes/auditRoutes'));
app.use('/api/admin/reconcile', require('./routes/reconcileRoutes'));
app.use('/api/admin/cron', require('./routes/cronHealthRoutes'));
app.use('/api/cron', require('./routes/cronRoutes'));
app.use('/api/search', require('./routes/searchRoutes'));
app.use('/api/notifications', require('./domains/notification/routes'));
app.use('/api/automation', require('./domains/automation/routes'));
app.use('/api/skills', require('./domains/skill/routes'));
app.use('/api/branding', require('./domains/branding/routes'));

// ── Domain-event subscribers (rearchitecture Phase 0) ────────
// Wire cross-cutting concerns (in-app notifications, …) to the event bus once at
// boot, so business use-cases publish events instead of calling them inline.
require('./domains/notification/subscribers').register();
// Automation runner (TMS.update gap #3) — runs enabled no-code rules on events.
require('./domains/automation/runner').register();

// ── Production: Serve React client build ─────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  app.use(express.static(clientDist));

  // SPA fallback: any non-API route → index.html (React Router).
  // express 5 / path-to-regexp 8: bare '*' is no longer a valid pattern —
  // '/{*splat}' is the new optional-wildcard (matches '/' too).
  app.get('/{*splat}', (_req, res) => {
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

  // Mongoose CastError — malformed ObjectId is a client error, not a 500
  // (SEC-014; mirrors helpers/handleError so both error paths agree).
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid value for '${err.path || 'id'}'`,
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

    // Seed system roles + load DB-backed capability grants into the in-memory
    // store before serving traffic (TMS.update gap #2). Fail-soft: if it throws,
    // the static scaffold in policy/capabilities.js still governs authz.
    try {
      await require('./domains/access/grants-loader').initRoleGrants();
    } catch (err) {
      logger.error({ err }, 'role-grants init failed — falling back to the static capability map');
    }

    // Seed the §9 automation rules (disabled; opt-in). Fail-soft.
    try {
      await require('./domains/automation/seed').seedSystemRules();
    } catch (err) {
      logger.error({ err }, 'automation seed failed (non-fatal)');
    }

    // Load tenant branding into the in-memory cache so the email + certificate
    // pipelines use the configured org name/title (TMS.update gap #5). Fail-soft.
    try {
      await require('./lib/branding').loadBranding();
    } catch (err) {
      logger.error({ err }, 'branding load failed — using default branding');
    }

    const server = app.listen(PORT, () => {
      logger.info({ port: PORT }, 'TMS v2 API running');
    });

    // Start background jobs after DB is connected. We hold a handle so the
    // shutdown path can stop them cleanly (OPS-005).
    const { startReconcileJob, stopReconcileJob } = require('./jobs/reconcileJob');
    startReconcileJob();
    const { startSnapshotJob, stopSnapshotJob } = require('./jobs/snapshotJob');
    startSnapshotJob();

    // Graceful shutdown on SIGTERM (sent by Render, Kubernetes, systemd on
    // deploy/stop). Give in-flight requests up to 10s to complete, then
    // also stop the in-process cron + close the Mongo connection before
    // exiting (audit PR 10 / OPS-005).
    let shuttingDown = false;
    const shutdown = (signal) => {
      if (shuttingDown) return; // re-entrancy guard — SIGTERM may fire twice
      shuttingDown = true;
      logger.info({ signal }, 'Shutdown signal received — draining connections');

      // Stop scheduled jobs synchronously so no new DB work begins.
      try { if (typeof stopReconcileJob === 'function') stopReconcileJob(); } catch (e) {
        logger.warn({ err: e?.message }, 'stopReconcileJob threw');
      }
      try { if (typeof stopSnapshotJob === 'function') stopSnapshotJob(); } catch (e) {
        logger.warn({ err: e?.message }, 'stopSnapshotJob threw');
      }

      server.close(async (err) => {
        if (err) {
          logger.error({ err }, 'Error during server close');
        }
        try {
          // Close the Mongoose connection so the orchestrator's SIGKILL
          // window doesn't truncate writes mid-flush. Mongoose 8 returns
          // a promise; await it before exit.
          await require('mongoose').connection.close(false);
          logger.info('Mongo connection closed cleanly');
        } catch (e) {
          logger.warn({ err: e?.message }, 'Mongo close threw during shutdown');
        }
        logger.info('Server closed cleanly');
        process.exit(err ? 1 : 0);
      });

      // Force-kill after 10s so we don't hang indefinitely
      setTimeout(() => {
        logger.warn('Force-killing after 10s drain timeout');
        process.exit(1);
      }, 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
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
