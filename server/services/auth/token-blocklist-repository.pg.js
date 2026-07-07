const crypto = require('crypto');
const { query } = require('../../config/pg');

// token-blocklist-repository — POSTGRES impl (mig 033). Same interface as
// ./token-blocklist-repository.mongo.
//
// Fidelity notes the parity test pins:
//   • duplicate revocation is a no-op that keeps the ORIGINAL row —
//     ON CONFLICT (jti) DO NOTHING ⇔ Mongo upsert-$setOnInsert.
//   • isJtiRevoked stays true for an expired-but-unpurged row (Mongo's TTL
//     sweeper is also lazy — ~60s cadence; JWT verify rejects expired tokens
//     before the blocklist is ever consulted, so this is unobservable).
//   • retention: expires_at < now() rows are pruned by retentionPurgeJob
//     (the E2 stand-in for the model's TTL index).

const newId = () => crypto.randomBytes(12).toString('hex'); // ObjectId-hex shaped

const insertRevocation = async (jti, { userId, expiresAt, reason }) => {
  await query(
    `INSERT INTO token_blocklist(id, jti, user_id, expires_at, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (jti) DO NOTHING`,
    [newId(), jti, userId == null ? null : String(userId), expiresAt, reason]
  );
};

const isJtiRevoked = async (jti) => {
  const { rows } = await query('SELECT 1 FROM token_blocklist WHERE jti = $1 LIMIT 1', [jti]);
  return rows.length > 0;
};

module.exports = { insertRevocation, isJtiRevoked };
