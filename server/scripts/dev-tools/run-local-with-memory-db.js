/**
 * Dev-only launcher (UX review) — boots the API against an EPHEMERAL in-memory
 * MongoDB replica set (mongodb-memory-server) instead of production Atlas, so
 * the app can be run + screenshotted WITHOUT touching prod data. A replica set
 * (not standalone) is required so the app's multi-document transactions work.
 *
 * The connection string is written to `.memdb-uri` (same dir) so the seed
 * script can target the SAME instance. Keep this process alive while reviewing;
 * stopping it discards all data (nothing persists).
 *
 *   node scripts/dev-tools/run-local-with-memory-db.js
 */
const fs = require('fs');
const path = require('path');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

(async () => {
  const replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, name: 'rs0' },
  });
  const uri = replset.getUri('tms');

  // Persist for the seed process (separate node invocation).
  fs.writeFileSync(path.join(__dirname, '.memdb-uri'), uri, 'utf8');

  // MUST be set before requiring server.js — its dotenv.config() will NOT
  // override already-set vars, so this ephemeral URI wins over server/.env.
  process.env.MONGO_URI = uri;
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'local-ux-review-secret-not-for-prod';
  process.env.PORT = process.env.PORT || '5000';
  // Avoid login lockouts / 429s during an automated screenshot tour.
  process.env.DISABLE_RATE_LIMITS = 'true';

  console.log('[mem-db] replica set ready:', uri);
  require('../../server.js');
  console.log('[mem-db] API server booting on :' + process.env.PORT);

  const shutdown = async () => {
    try { await replset.stop(); } catch { /* noop */ }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch((err) => {
  console.error('[mem-db] launcher failed:', err);
  process.exit(1);
});
