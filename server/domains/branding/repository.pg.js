const crypto = require('crypto');
const { query } = require('../../config/pg');

// branding/repository — POSTGRES impl. Same interface as ./repository.mongo.
// Singleton config (key='default') over tenant_config (migration 013).
// getSingleton = find-or-create with column defaults; update = $set upsert.

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const configRow = (r) => (r == null ? null : {
  _id: r.id, key: r.key, orgName: r.org_name, accentColor: r.accent_color,
  logoUrl: r.logo_url || '', certificateTitle: r.certificate_title, emailSignature: r.email_signature || '',
  createdAt: r.created_at, updatedAt: r.updated_at,
});

// find-or-create the singleton (ON CONFLICT no-op so RETURNING yields the existing
// row unchanged; a fresh insert takes the column defaults = the model defaults).
const getSingleton = async () => {
  const { rows } = await query(
    `INSERT INTO tenant_config(id, key) VALUES ($1, 'default')
     ON CONFLICT (key) DO UPDATE SET key = tenant_config.key RETURNING *`,
    [newId()]);
  return configRow(rows[0]);
};

const TC_COL = { orgName: 'org_name', accentColor: 'accent_color', logoUrl: 'logo_url', certificateTitle: 'certificate_title', emailSignature: 'email_signature' };

const update = async (patch) => {
  const present = Object.keys(TC_COL).filter((k) => hasOwn(patch, k));
  const cols = ['id', 'key', ...present.map((k) => TC_COL[k])];
  const vals = [newId(), 'default', ...present.map((k) => patch[k])];
  const updates = present.map((k) => `${TC_COL[k]} = EXCLUDED.${TC_COL[k]}`);
  updates.push('updated_at = now()');
  const ph = cols.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await query(
    `INSERT INTO tenant_config(${cols.join(',')}) VALUES (${ph})
     ON CONFLICT (key) DO UPDATE SET ${updates.join(', ')} RETURNING *`,
    vals);
  return configRow(rows[0]);
};

module.exports = { getSingleton, update };
