const Counter = require('../models/Counter');

// ──────────────────────────────────────────────────────────
// Atomic Sequence Helper
// ──────────────────────────────────────────────────────────
// Uses findOneAndUpdate with $inc — a single atomic MongoDB
// operation that:
//   1. Finds the counter document by name
//   2. Increments `seq` by 1
//   3. Returns the NEW value (after increment)
//   4. Creates the document if it doesn't exist (upsert)
//
// Because $inc is atomic at the database engine level,
// two concurrent calls will NEVER receive the same number.
// This solves the race condition that existed with the old
// pre('save') approach (find-max → parse → increment).
// ──────────────────────────────────────────────────────────

/**
 * Get the next sequence number for a named counter.
 *
 * @param   {string} name  Counter name (e.g. 'empCode', 'classCode')
 * @returns {Promise<number>} The next integer in the sequence (1, 2, 3…)
 *
 * @example
 *   const seq = await getNextSequence('empCode');
 *   const empCode = seq.toString().padStart(6, '0');  // '000001'
 *
 * @example
 *   const seq = await getNextSequence('classCode');
 *   const classCode = `EL${seq.toString().padStart(3, '0')}`;  // 'EL001'
 */
const getNextSequence = async (name) => {
  const counter = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }   // create if missing, return updated doc
  );
  return counter.seq;
};

module.exports = { getNextSequence };
