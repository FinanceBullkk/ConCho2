const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../../config/pg');

// user-mutations-repository — POSTGRES impl. Same interface as ./…mongo.
//
// The Mongo side leans on TWO model hooks this twin replicates explicitly:
//   • pre('save') password hashing → create() bcrypt-hashes here (12 rounds);
//   • the findOneAndUpdate status→Dropped auto-release → updateById re-reads
//     the old status and delegates to the dual roster-sync orchestrator +
//     post-commit waiter notifications, exactly like models/User.js.
//
// Fidelity notes the parity test pins:
//   • create maps the partial-unique (emp_code / email, WHERE is_deleted=false)
//     23505 → {code:11000} — the controller's duplicate branch is shared.
//   • rows expose a NON-ENUMERABLE toObject() (the create handler calls it;
//     class-repository precedent) and spread meta extras (dropReason /
//     entranceLevel / currentLevel / customFields ride users.meta jsonb).
//   • updateById returns the row WITHOUT password (Mongo select: '-password').

const newId = () => crypto.randomBytes(12).toString('hex');

const duplicateError = () => {
  const e = new Error('duplicate key (empCode/email already in use)');
  e.code = 11000;
  return e;
};

const withToObject = (row) => {
  if (row == null) return null;
  Object.defineProperty(row, 'toObject', { value: () => ({ ...row }), enumerable: false });
  return row;
};

const userRow = (r, { includePassword = false } = {}) => {
  if (r == null) return null;
  const out = {
    ...(r.meta || {}), // customFields + long-tail extras ride meta
    _id: r.id, empCode: r.emp_code, name: r.name, email: r.email,
    department: r.department, role: r.role, position: r.position, status: r.status,
    dropReason: r.drop_reason, entranceLevel: r.entrance_level, currentLevel: r.current_level,
    mustChangePassword: r.must_change_password,
    isDeleted: r.is_deleted, deletedAt: r.deleted_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
  if (includePassword) out.password = r.password;
  return withToObject(out);
};

// camelCase field → users column; everything else the handlers pass goes to meta.
const USER_COLS = {
  empCode: 'emp_code', name: 'name', email: 'email', department: 'department',
  role: 'role', position: 'position', status: 'status', password: 'password',
  dropReason: 'drop_reason', entranceLevel: 'entrance_level', currentLevel: 'current_level',
};
const splitColsMeta = (data) => {
  const cols = {};
  const meta = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (USER_COLS[k]) cols[USER_COLS[k]] = v;
    else meta[k] = v;
  }
  return { cols, meta };
};

const create = async (data) => {
  // pre('save') twin: hash the raw password before it touches the row.
  const { password, ...rest } = data;
  const salt = await bcrypt.genSalt(12);
  const hashed = await bcrypt.hash(password, salt);
  const { cols, meta } = splitColsMeta({ ...rest, password: hashed });
  const names = Object.keys(cols);
  const vals = names.map((c) => cols[c]);
  let rows;
  try {
    ({ rows } = await query(
      `INSERT INTO users(id, ${names.join(', ')}${Object.keys(meta).length ? ', meta' : ''})
       VALUES ($1, ${names.map((_, i) => `$${i + 2}`).join(', ')}${Object.keys(meta).length ? `, $${names.length + 2}::jsonb` : ''})
       RETURNING *`,
      [newId(), ...vals, ...(Object.keys(meta).length ? [JSON.stringify(meta)] : [])]));
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
  return userRow(rows[0], { includePassword: true });
};

const findByIdLean = async (id) => {
  const { rows } = await query(
    'SELECT * FROM users WHERE id = $1 AND is_deleted = false', [String(id)]);
  return userRow(rows[0]);
};

const findByIdWithPassword = async (id) => {
  const { rows } = await query(
    'SELECT * FROM users WHERE id = $1 AND is_deleted = false', [String(id)]);
  return userRow(rows[0], { includePassword: true });
};

const updateById = async (id, data) => {
  // Auto-release twin (models/User.js findOneAndUpdate hooks): snapshot the
  // old status BEFORE the update so a change TO 'Dropped' can release rosters.
  const before = await findByIdLean(id);
  if (!before) return null;

  const { cols, meta } = splitColsMeta(data);
  const sets = [];
  const args = [String(id)];
  for (const [col, v] of Object.entries(cols)) { args.push(v); sets.push(`${col} = $${args.length}`); }
  if (Object.keys(meta).length) {
    args.push(JSON.stringify(meta));
    sets.push(`meta = COALESCE(meta, '{}'::jsonb) || $${args.length}::jsonb`);
  }
  if (!sets.length) return before;
  sets.push('updated_at = now()');
  let rows;
  try {
    ({ rows } = await query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $1 AND is_deleted = false RETURNING *`, args));
  } catch (error) {
    if (error && error.code === '23505') throw duplicateError();
    throw error;
  }
  if (!rows[0]) return null;
  const updated = userRow(rows[0]); // no password (Mongo select: '-password')

  // Status changed TO 'Dropped' → dual roster release + post-commit notify,
  // mirroring the Mongo post-hook (lazy requires avoid circular imports).
  if (before.status !== updated.status && updated.status === 'Dropped') {
    const { releaseUserFromFutureSchedules } = require('../../domains/schedule/roster-sync');
    const { promotions: promotionsBySchedule } = await releaseUserFromFutureSchedules(updated._id);
    if (promotionsBySchedule.length > 0) {
      const { notifyPromotions } = require('../../domains/schedule/waitlist/promotion');
      for (const { scheduleId, promoted } of promotionsBySchedule) {
        // eslint-disable-next-line no-await-in-loop -- fail-soft post-commit notify
        await notifyPromotions(scheduleId, promoted);
      }
    }
  }
  return updated;
};

module.exports = { create, findByIdLean, findByIdWithPassword, updateById };
