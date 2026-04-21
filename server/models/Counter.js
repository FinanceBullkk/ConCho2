const mongoose = require('mongoose');

// ──────────────────────────────────────────────────────────
// Counter Model — Atomic Sequence Generator
// ──────────────────────────────────────────────────────────
// Each document in this collection tracks a named sequence.
// Using findOneAndUpdate with $inc guarantees atomicity at
// the database level — no two concurrent requests can ever
// receive the same number, even under high load.
//
// Usage:
//   const { getNextSequence } = require('../helpers/counter');
//   const seq = await getNextSequence('empCode');  // → 1, 2, 3…
// ──────────────────────────────────────────────────────────

const counterSchema = new mongoose.Schema({
  _id: {
    type: String,       // e.g. 'empCode', 'classCode'
    required: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
});

module.exports = mongoose.model('Counter', counterSchema);
