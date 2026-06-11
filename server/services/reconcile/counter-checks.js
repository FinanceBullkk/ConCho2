const User = require('../../models/User');
const Class = require('../../models/Class');
const Counter = require('../../models/Counter');

// ──────────────────────────────────────────────────────────
// Reconcile — counter-drift check (READ-ONLY)
// ──────────────────────────────────────────────────────────
//  9. counter_drift — empCode/classCode counter seq < max code already in use

/**
 * CHECK 9 — Counter sequence is less than the max code already in use.
 * Indicates the counter was reset (e.g. DB restore from an older snapshot
 * without the corresponding User/Class re-import) and the NEXT create
 * will produce a duplicate code — a hard production incident.
 *
 * Checks both empCode (User) and classCode (Class). The counter helper
 * uses _id like '<empCode>' / '<classCode>' as the document key.
 */
async function checkCounterDrift() {
  const issues = [];

  const numericFrom = (s) => {
    if (!s || typeof s !== 'string') return 0;
    const m = s.match(/(\d+)$/); // trailing digits
    return m ? parseInt(m[1], 10) : 0;
  };

  // ── empCode counter ─────────────────────────────────────
  const empCodeCounter = await Counter.findById('empCode').lean();
  if (empCodeCounter) {
    const maxUser = await User.findOne({ empCode: { $regex: /\d+$/ } })
      .sort({ empCode: -1 }).select('empCode').lean();
    const maxNum = numericFrom(maxUser?.empCode);
    if (empCodeCounter.seq < maxNum) {
      issues.push({
        check: 'counter_drift',
        description: `Counter 'empCode' seq=${empCodeCounter.seq} < max in-use empCode numeric=${maxNum}`,
        refs: {},
        detail: { counter: 'empCode', seq: empCodeCounter.seq, maxInUse: maxNum, sampleMaxEmpCode: maxUser?.empCode },
      });
    }
  }

  // ── classCode counter ───────────────────────────────────
  const classCodeCounter = await Counter.findById('classCode').lean();
  if (classCodeCounter) {
    const maxClass = await Class.findOne({ classCode: { $regex: /\d+$/ } })
      .sort({ classCode: -1 }).select('classCode').lean();
    const maxNum = numericFrom(maxClass?.classCode);
    if (classCodeCounter.seq < maxNum) {
      issues.push({
        check: 'counter_drift',
        description: `Counter 'classCode' seq=${classCodeCounter.seq} < max in-use classCode numeric=${maxNum}`,
        refs: {},
        detail: { counter: 'classCode', seq: classCodeCounter.seq, maxInUse: maxNum, sampleMaxClassCode: maxClass?.classCode },
      });
    }
  }
  return issues;
}

module.exports = { checkCounterDrift };
