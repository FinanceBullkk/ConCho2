const Setting = require('../../../models/Setting');
const User = require('../../../models/User');
const Enrollment = require('../../../models/Enrollment');
const Certificate = require('../../../models/Certificate');
const Attendance = require('../../../models/Attendance');
const LearningPath = require('../../../models/LearningPath');
const { ACTIVE_ENROLLMENT_STATUSES } = require('../../../helpers/cohortMembership');

// ──────────────────────────────────────────────────────────
// Executive dashboard repository — org-wide strategic aggregations + the
// LND_COST_CONFIG Setting. All read paths are batched aggregates; the only
// write is the cost-config upsert (audited at the controller).
// ──────────────────────────────────────────────────────────

const COST_CONFIG_KEY = 'LND_COST_CONFIG';
const DAY_MS = 86400000;

const getCostConfig = async () => {
  const row = await Setting.findOne({ key: COST_CONFIG_KEY }).lean();
  return row?.value || null;
};

// Upsert returning {before, after} so the controller can audit the diff.
const upsertCostConfig = async (value) => {
  const before = await getCostConfig();
  await Setting.findOneAndUpdate(
    { key: COST_CONFIG_KEY },
    { value, description: 'L&D cost inputs for the executive dashboard (integer minor currency units)' },
    { upsert: true, new: true },
  );
  return { before, after: value };
};

// All active employees (every role) — the L&D budget covers the whole org.
const activeEmployeeCount = () =>
  User.countDocuments({ status: 'Active', isDeleted: { $ne: true } });

// Month-bucketed activity events. "Completion" is derived (no stored event),
// so the honest trend series are the RECORDED events: enrollments created and
// certificates issued. $dateToString keeps Mongo 4.x compatibility.
const monthKeyStage = (field) => ({
  $dateToString: { format: '%Y-%m', date: `$${field}` },
});

const monthlyEventBuckets = async (start) => {
  const [enrollments, certificates] = await Promise.all([
    Enrollment.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: monthKeyStage('createdAt'), count: { $sum: 1 } } },
    ]),
    Certificate.aggregate([
      { $match: { issuedAt: { $gte: start }, isDeleted: false } },
      { $group: { _id: monthKeyStage('issuedAt'), count: { $sum: 1 } } },
    ]),
  ]);
  return { enrollments, certificates };
};

// Issued-certificate count over a trailing window (cost-per-completion basis).
const issuedCertificateCount = (since) =>
  Certificate.countDocuments({ status: 'Issued', isDeleted: false, issuedAt: { $gte: since } });

// Org-wide certificate validity rollup (D6 validity fields).
const certificateValidityRollup = async (now) => {
  const issued = { status: 'Issued', isDeleted: false };
  const d30 = new Date(now.getTime() + 30 * DAY_MS);
  const [totalIssued, nonExpiring, expiring30, expired, revoked] = await Promise.all([
    Certificate.countDocuments(issued),
    Certificate.countDocuments({ ...issued, validUntil: null }),
    Certificate.countDocuments({ ...issued, validUntil: { $gte: now, $lte: d30 } }),
    Certificate.countDocuments({ ...issued, validUntil: { $ne: null, $lt: now } }),
    Certificate.countDocuments({ status: 'Revoked', isDeleted: false }),
  ]);
  return {
    totalIssued,
    valid: totalIssued - expired,
    nonExpiring,
    expiring30,
    expired,
    revoked,
  };
};

// Coverage by department (legacy `department` string — same grouping the
// completion rollup uses). engagedIds = users with training activity in window.
const engagedUserIds = async (windowStart) => {
  const [attendedIds, enrolledIds] = await Promise.all([
    Attendance.distinct('userId', { createdAt: { $gte: windowStart } }),
    Enrollment.distinct('userId', {
      createdAt: { $gte: windowStart },
      status: { $in: ACTIVE_ENROLLMENT_STATUSES },
    }),
  ]);
  return [...new Set([...attendedIds, ...enrolledIds].map(String))];
};

const coverageByDepartment = async (windowStart) => {
  const engaged = await engagedUserIds(windowStart);
  const engagedSet = new Set(engaged);
  const participants = await User.find({
    role: 'Participant', status: 'Active', isDeleted: { $ne: true },
  }).select('department').lean();

  const byDept = new Map();
  for (const user of participants) {
    const key = user.department || 'Unassigned';
    const row = byDept.get(key) || { department: key, active: 0, engaged: 0 };
    row.active += 1;
    if (engagedSet.has(user._id.toString())) row.engaged += 1;
    byDept.set(key, row);
  }
  return [...byDept.values()].sort((a, b) => b.active - a.active);
};

// Path completion via the durable certificate signal: a learner counts as
// having completed a path when they hold Issued certificates for EVERY program
// in it. Cheap org-wide; programs that issue no certificates undercount —
// documented as a certificate-based proxy, not the full completion engine.
const listActivePaths = () =>
  LearningPath.find({ status: { $ne: 'archived' }, isDeleted: false })
    .select('title programs')
    .lean();

const issuedProgramSetsByUser = async (programIds) => {
  if (!programIds.length) return [];
  return Certificate.aggregate([
    { $match: { programId: { $in: programIds }, status: 'Issued', isDeleted: false } },
    { $group: { _id: '$userId', programs: { $addToSet: '$programId' } } },
  ]);
};

module.exports = {
  COST_CONFIG_KEY,
  getCostConfig,
  upsertCostConfig,
  activeEmployeeCount,
  monthlyEventBuckets,
  issuedCertificateCount,
  certificateValidityRollup,
  coverageByDepartment,
  listActivePaths,
  issuedProgramSetsByUser,
};
