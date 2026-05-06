const pino = require('pino');

// Pretty-print in dev for human readability; raw JSON in prod for log aggregators.
const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : isProd ? 'info' : 'debug'),
  base: { service: 'tms-server' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'newPassword',
      'currentPassword',
      '*.password',
      '*.JWT_SECRET',
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
