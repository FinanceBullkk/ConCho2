const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// vendor/repository — POSTGRES impl. Same interface as ./repository.mongo.
// Vendor CRUD over the vendors table (migration 008) + the spend roll-up over
// cost_entries (scope_vendor_id, the A1 link).
//
// Fidelity to the Mongoose models the parity test pins:
//   • Vendor has a soft-delete pre('find') hook + isDeleted select:false → reads
//     filter is_deleted=false; returned shapes omit isDeleted.
//   • subdoc arrays contacts/contracts/ratings → jsonb; delivers → text[].
//   • CostEntry has a pre('aggregate') soft-delete hook → vendorSpend filters
//     is_deleted=false (a soft-deleted cost line drops out of the roll-up).
//   • createVendor defaults: type 'provider', contacts/delivers/contracts/ratings
//     [], note '', status 'active'.
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const vendorRow = (v) => (v == null ? null : {
  _id: v.id, name: v.name, type: v.type,
  contacts: v.contacts || [],
  delivers: (v.delivers || []).map(String),
  contracts: v.contracts || [],
  ratings: v.ratings || [],
  note: v.note || '',
  status: v.status,
  createdBy: v.created_by || null,
  createdAt: v.created_at, updatedAt: v.updated_at,
});

// ── Vendor CRUD ───────────────────────────────────────────
const VENDOR_COL = {
  name: 'name', type: 'type', contacts: 'contacts', delivers: 'delivers', contracts: 'contracts',
  ratings: 'ratings', note: 'note', status: 'status', createdBy: 'created_by', isDeleted: 'is_deleted', deletedAt: 'deleted_at',
};
const vendorVal = (k, v) => {
  if (k === 'delivers') return (v || []).map(String);
  if (k === 'contacts' || k === 'contracts' || k === 'ratings') return JSON.stringify(v || []);
  if (k === 'name' || k === 'note') return v == null ? v : String(v).trim();
  if (k === 'createdBy') return v == null ? null : String(v);
  return v;
};

const createVendor = async (data) => {
  const { rows } = await query(
    `INSERT INTO vendors(id,name,type,contacts,delivers,contracts,ratings,note,status,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      newId(), String(data.name).trim(), data.type == null ? 'provider' : data.type,
      JSON.stringify(data.contacts || []), (data.delivers || []).map(String),
      JSON.stringify(data.contracts || []), JSON.stringify(data.ratings || []),
      data.note == null ? '' : String(data.note).trim(),
      data.status == null ? 'active' : data.status,
      data.createdBy == null ? null : String(data.createdBy),
    ],
  );
  return vendorRow(rows[0]);
};

const listVendors = async (filter = {}) => {
  const conds = ['is_deleted = false'];
  const args = [];
  if (filter.status) { args.push(filter.status); conds.push(`status = $${args.length}`); }
  if (filter.type) { args.push(filter.type); conds.push(`type = $${args.length}`); }
  if (filter.delivers) { args.push(String(filter.delivers)); conds.push(`$${args.length} = ANY(delivers)`); }
  const { rows } = await query(
    `SELECT * FROM vendors WHERE ${conds.join(' AND ')} ORDER BY status ASC, name ASC LIMIT 500`, args);
  return rows.map(vendorRow);
};

const findVendorById = async (id) => {
  const { rows } = await query(`SELECT * FROM vendors WHERE id = $1 AND is_deleted = false`, [id]);
  return rows[0] ? vendorRow(rows[0]) : null;
};
const findVendorDoc = findVendorById; // PG has no hydrated-doc distinction

const updateVendor = async (id, data) => {
  const sets = [];
  const args = [];
  for (const [k, col] of Object.entries(VENDOR_COL)) {
    if (hasOwn(data, k)) { args.push(vendorVal(k, data[k])); sets.push(`${col} = $${args.length}`); }
  }
  sets.push('updated_at = now()');
  args.push(id);
  const { rows } = await query(
    `UPDATE vendors SET ${sets.join(', ')} WHERE id = $${args.length} AND is_deleted = false RETURNING *`, args);
  return rows[0] ? vendorRow(rows[0]) : null;
};

const softDeleteVendor = async (id) => {
  const { rows } = await query(
    `UPDATE vendors SET is_deleted = true, deleted_at = now(), status = 'archived', updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`, [id]);
  return rows[0] ? vendorRow(rows[0]) : null;
};

const pushRating = async (id, rating) => {
  const { rows } = await query(
    `UPDATE vendors SET ratings = ratings || $2::jsonb, updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING *`,
    [id, JSON.stringify([rating])]);
  return rows[0] ? vendorRow(rows[0]) : null;
};

// ── Spend roll-up (cost_entries; soft-deleted excluded, mirrors the aggregate hook) ──
const vendorSpend = async (vendorId, { from, to } = {}) => {
  const conds = ['scope_vendor_id = $1', 'is_deleted = false'];
  const args = [String(vendorId)];
  if (from) { args.push(new Date(from).toISOString()); conds.push(`incurred_on >= $${args.length}`); }
  if (to) { args.push(new Date(to).toISOString()); conds.push(`incurred_on <= $${args.length}`); }
  const { rows } = await query(
    `SELECT type, sum(amount_minor)::bigint AS total_minor, count(*)::int AS count, min(currency) AS currency
       FROM cost_entries WHERE ${conds.join(' AND ')}
      GROUP BY type ORDER BY total_minor DESC`, args);

  const byType = rows.map((r) => ({ type: r.type || 'other', totalMinor: Number(r.total_minor), count: r.count }));
  const totalMinor = byType.reduce((s, r) => s + r.totalMinor, 0);
  const count = byType.reduce((s, r) => s + r.count, 0);
  const currency = rows[0] ? rows[0].currency : null;
  return { totalMinor, count, currency, byType };
};

module.exports = {
  createVendor,
  listVendors,
  findVendorById,
  findVendorDoc,
  updateVendor,
  softDeleteVendor,
  pushRating,
  vendorSpend,
};
