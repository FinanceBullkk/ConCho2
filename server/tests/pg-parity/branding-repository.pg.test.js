/**
 * ──────────────────────────────────────────────────────────
 * PG-parity test — branding repository (Mongo ↔ Postgres)
 * ──────────────────────────────────────────────────────────
 * Singleton tenant config (key='default'). Runs only when a Postgres URL is
 * present; SKIPS otherwise. Asserts: getSingleton find-or-creates with the model
 * column defaults; update patches; the singleton is never duplicated.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env.pg-prototype') });
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PG_URL = process.env.PG_URL || process.env.PG_PROTOTYPE_URL;
const describePg = PG_URL ? describe : describe.skip;

const { query, closePool } = require('../../config/pg');
const repo = require('../../domains/branding/repository');

const norm = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
const both = (fn) => Promise.all([fn(repo.impls.mongo), fn(repo.impls.pg)]);
const cproj = (raw) => { const c = norm(raw); return c == null ? null : {
  key: c.key, orgName: c.orgName, accentColor: c.accentColor, logoUrl: c.logoUrl || '',
  certificateTitle: c.certificateTitle, emailSignature: c.emailSignature || '',
}; };

describePg('PG-parity: branding repository (singleton tenant config)', () => {
  let mem;

  beforeAll(async () => {
    mem = await MongoMemoryServer.create();
    await mongoose.connect(mem.getUri());
    await mongoose.model('TenantConfig').init(); // unique key
    await query('TRUNCATE tenant_config');
  }, 60_000);

  afterAll(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
    if (mem) await mem.stop();
    await closePool();
  });

  test('getSingleton: find-or-create with model defaults — identical', async () => {
    const [m, p] = await both((r) => r.getSingleton());
    expect(cproj(m)).toEqual({
      key: 'default', orgName: 'TMS', accentColor: '#3b6fe0', logoUrl: '',
      certificateTitle: 'Certificate of Completion', emailSignature: '',
    });
    expect(cproj(p)).toEqual(cproj(m));
  });

  test('update: patches the singleton — identical', async () => {
    const [m, p] = await both((r) => r.update({ orgName: 'Acme Corp', accentColor: '#ff0000', emailSignature: 'Best,\nAcme' }));
    expect(cproj(m)).toMatchObject({ key: 'default', orgName: 'Acme Corp', accentColor: '#ff0000', emailSignature: 'Best,\nAcme' });
    expect(cproj(p)).toEqual(cproj(m));
  });

  test('getSingleton after update returns the SAME (updated) singleton, not a new one — identical', async () => {
    const [m, p] = await both((r) => r.getSingleton());
    expect(cproj(m)).toMatchObject({ orgName: 'Acme Corp', accentColor: '#ff0000' }); // not reset to defaults
    expect(cproj(p)).toEqual(cproj(m));
    // exactly one row on PG
    const { rows } = await query(`SELECT count(*)::int AS n FROM tenant_config`);
    expect(rows[0].n).toBe(1);
  });
});
