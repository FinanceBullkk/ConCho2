const mongoose = require('mongoose');
const dns = require('dns');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// Resilient MongoDB Connection
// ──────────────────────────────────────────────────────────
// 1. Forces Google Public DNS for Atlas SRV resolution
// 2. Exponential backoff retry (up to 5 attempts)
// 3. Connection event listeners for monitoring
// 4. Graceful shutdown on SIGINT
// ──────────────────────────────────────────────────────────

// Fix ISP DNS issues that block Atlas SRV lookups
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000; // 2s, 4s, 8s, 16s, 32s

const connectDB = async () => {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI, {
        // Mongoose 8 defaults are good, but these help with flaky networks
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
      });

      logger.info({ host: conn.connection.host, attempt }, 'MongoDB connected');
      return conn;
    } catch (error) {
      lastError = error;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
      logger.error(
        { attempt, maxRetries: MAX_RETRIES, err: error.message },
        'MongoDB connection attempt failed'
      );

      if (attempt < MAX_RETRIES) {
        logger.info({ delayMs: delay }, 'Retrying MongoDB connection');
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.fatal({ maxRetries: MAX_RETRIES }, 'All MongoDB connection attempts failed');
  throw lastError;
};

// ── Connection event listeners ────────────────────────────
mongoose.connection.on('connected', () => {
  logger.info('Mongoose connection established');
});

mongoose.connection.on('error', (err) => {
  logger.error({ err: err.message }, 'Mongoose connection error');
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected — will attempt reconnect automatically');
});

// ── Graceful shutdown ─────────────────────────────────────
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed (app termination)');
  process.exit(0);
});

module.exports = connectDB;
