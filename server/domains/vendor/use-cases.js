const repository = require('./repository');
const dto = require('./dto');
const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// vendor/use-cases — vendor management business rules (A2, Horizon 2).
// CRUD + post-engagement ratings + per-vendor spend (from A1 cost entries).
// ──────────────────────────────────────────────────────────

// fiscalYear '2026' → UTC calendar-year window (mirrors finance/use-cases).
const fiscalYearRange = (fiscalYear) => {
  const y = Number(fiscalYear);
  return { from: new Date(Date.UTC(y, 0, 1)), to: new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999)) };
};

// createVendor returns a hydrated Mongoose doc (mongo) or a plain row (pg) —
// normalize before shaping so the DTO gets a POJO on either backend.
const create = async (body, actorId) => {
  const created = await repository.createVendor({ ...body, createdBy: actorId || null });
  return dto.toVendor(typeof created.toObject === 'function' ? created.toObject() : created);
};

const list = async (query = {}) => {
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  if (query.deliversProgramId) filter.delivers = query.deliversProgramId;
  if (query.q) filter.name = { $regex: query.q.trim(), $options: 'i' };
  const rows = await repository.listVendors(filter);
  const now = new Date();
  return rows.map((v) => dto.toVendorListItem(v, now));
};

const getOne = async (id) => {
  const v = await repository.findVendorById(id);
  if (!v) throw new ServiceError('Vendor not found', 404);
  return dto.toVendor(v);
};

const update = async (id, body) => {
  const before = await repository.findVendorById(id);
  if (!before) throw new ServiceError('Vendor not found', 404);
  const after = await repository.updateVendor(id, body);
  return { before, after: dto.toVendor(after) };
};

const archive = async (id) => {
  const before = await repository.findVendorById(id);
  if (!before) throw new ServiceError('Vendor not found', 404);
  const after = await repository.softDeleteVendor(id);
  return { before, after };
};

const addRating = async (id, body, actorId) => {
  const exists = await repository.findVendorById(id);
  if (!exists) throw new ServiceError('Vendor not found', 404);
  const after = await repository.pushRating(id, { value: body.value, note: body.note || '', by: actorId || null, at: new Date() });
  return dto.toVendor(after);
};

const getSpend = async (id, query = {}) => {
  const exists = await repository.findVendorById(id);
  if (!exists) throw new ServiceError('Vendor not found', 404);
  let { from, to } = query;
  if (query.fiscalYear && !from && !to) ({ from, to } = fiscalYearRange(query.fiscalYear));
  const spend = await repository.vendorSpend(id, { from, to });
  return { vendorId: String(id), ...spend };
};

module.exports = {
  create,
  list,
  getOne,
  update,
  archive,
  addRating,
  getSpend,
};
