const pino = require('pino');

// Pretty-print in dev for human readability; raw JSON in prod for log aggregators.
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : isProd ? 'info' : 'debug'),
  base: { service: 'tms-server' },
  redact: {
    // Audit PR 10 (OPS-007): expanded to cover nested request-body paths.
    // pino's redact engine treats each path string as a strict accessor —
    // 'password' alone matches a top-level field but NOT req.body.password,
    // so we list both. The '*.password' glob covers deeply nested cases.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      // Top-level fields that controllers may log directly.
      'password',
      'newPassword',
      'currentPassword',
      'mfaSecret',
      'mfaBackupCodes',
      'passwordResetToken',
      'token',
      'refreshToken',
      'jwtSecret',
      'apiKey',
      'secret',
      // Common nested req.body paths.
      'req.body.password',
      'req.body.newPassword',
      'req.body.currentPassword',
      'req.body.token',
      'req.body.mfaSecret',
      // Wildcard glob — catches arbitrary depth.
      '*.password',
      '*.newPassword',
      '*.currentPassword',
      '*.mfaSecret',
      '*.passwordResetToken',
      '*.token',
      '*.JWT_SECRET',
      '*.SMTP_PASS',
    ],
    remove: true,
  },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname,service',
          },
        },
      }),
});

module.exports = logger;
