// Phase 1 PG-migration prototype — connectivity smoke test.
// Reads PG_PROTOTYPE_URL from the gitignored server/.env.pg-prototype and
// confirms we can reach the throwaway Neon database. No secret in this file.
// Run: node scripts/dev-tools/pg-prototype-smoke.js   (from server/)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const { Client } = require('pg');

(async () => {
  const url = process.env.PG_PROTOTYPE_URL;
  if (!url) {
    console.error('Missing PG_PROTOTYPE_URL (server/.env.pg-prototype).');
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    const t0 = Date.now();
    await client.connect();
    const r = await client.query('SELECT version() AS v, now() AS ts');
    console.log(`CONNECTED in ${Date.now() - t0} ms`);
    console.log('version :', r.rows[0].v.split(',')[0]);
    console.log('db time :', r.rows[0].ts);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.error('CONNECT FAILED:', e.message);
    process.exit(2);
  }
})();
