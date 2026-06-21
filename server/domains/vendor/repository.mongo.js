const mongoose = require('mongoose');
const Vendor = require('../../models/Vendor');
const CostEntry = require('../../models/CostEntry');

// ──────────────────────────────────────────────────────────
// vendor/repository — MONGO impl. Mongoose access for A2 (vendor management, H2).
// Spend roll-ups read CostEntry (`scope.vendorId`) — the A1 link — directly.
// (Was repository.js; split into mongo/pg behind a DB_BACKEND selector in the
// Phase-3 Wave-B port — behaviour-preserving.)
// ──────────────────────────────────────────────────────────

// ── Vendor CRUD ──────────────────────────────────────────────────────────────
const createVendor = (data) => Vendor.create(data);

const listVendors = (filter = {}) =>
  Vendor.find(filter).sort({ status: 1, name: 1 }).limit(500).lean();

const findVendorById = (id) => Vendor.findOne({ _id: id }).lean();

const findVendorDoc = (id) => Vendor.findOne({ _id: id }); // hydrated (for $push ratings)

const updateVendor = (id, data) =>
  Vendor.findOneAndUpdate({ _id: id }, { $set: data }, { new: true, runValidators: true }).lean();

const softDeleteVendor = (id) =>
  Vendor.findOneAndUpdate(
    { _id: id },
    { $set: { isDeleted: true, deletedAt: new Date(), status: 'archived' } },
    { new: true },
  ).lean();

const pushRating = (id, rating) =>
  Vendor.findOneAndUpdate({ _id: id }, { $push: { ratings: rating } }, { new: true }).lean();

// ── Spend roll-up (from A1 cost entries) ─────────────────────────────────────
// Sum + per-type breakdown of CostEntry where scope.vendorId === id in a window.
const vendorSpend = async (vendorId, { from, to } = {}) => {
  // aggregate $match does NOT auto-cast string ids (unlike find) — cast explicitly.
  const match = { 'scope.vendorId': new mongoose.Types.ObjectId(String(vendorId)) };
  if (from || to) {
    match.incurredOn = {};
    if (from) match.incurredOn.$gte = from;
    if (to) match.incurredOn.$lte = to;
  }
  const rows = await CostEntry.aggregate([
    { $match: match },
    { $group: { _id: '$type', totalMinor: { $sum: '$amountMinor' }, count: { $sum: 1 }, currency: { $first: '$currency' } } },
    { $sort: { totalMinor: -1 } },
  ]);
  const totalMinor = rows.reduce((sum, r) => sum + r.totalMinor, 0);
  const count = rows.reduce((sum, r) => sum + r.count, 0);
  const currency = rows[0]?.currency || null;
  const byType = rows.map((r) => ({ type: r._id || 'other', totalMinor: r.totalMinor, count: r.count }));
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
