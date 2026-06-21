const MetricSnapshot = require('../models/MetricSnapshot');
const Enrollment = require('../models/Enrollment');
const Certificate = require('../models/Certificate');
const Class = require('../models/Class');

// ──────────────────────────────────────────────────────────
// Metrics repository (PG-migration Phase 0, item 0.6)
// ──────────────────────────────────────────────────────────
// All Mongoose calls for metricSnapshotService (the nightly writer) AND
// analyticsSeriesService (the trend/funnel reader) live here, so the eventual
// Mongo→Postgres port swaps repository internals — the services keep only the
// pure aggregation/derivation logic. Both touch the same four models, hence one
// shared repository (DRY).

// ── Snapshot writer (metricSnapshotService) ───────────────

/** Program-linked classes — source for the class→program map. */
const findProgramClasses = () =>
  Class.find({ programId: { $ne: null } }).select('_id programId').lean();

/** Live enrollment counts grouped by (classId, status). */
const aggregateEnrollmentsByClassStatus = () =>
  Enrollment.aggregate([
    { $group: { _id: { classId: '$classId', status: '$status' }, count: { $sum: 1 } } },
  ]);

/** Live issued-certificate counts grouped by program. */
const aggregateIssuedCertsByProgram = () =>
  Certificate.aggregate([
    { $match: { status: 'Issued', isDeleted: { $ne: true } } },
    { $group: { _id: '$programId', count: { $sum: 1 } } },
  ]);

/** Idempotent upsert of one snapshot row per metric for a UTC day. */
const upsertSnapshots = async (day, metrics) => {
  const ops = metrics.map((m) => {
    const scopeId = m.scopeId || null;
    return {
      updateOne: {
        filter: { scope: m.scope, scopeId, key: m.key, date: day },
        update: {
          $set: { value: m.value },
          $setOnInsert: { scope: m.scope, scopeId, key: m.key, date: day },
        },
        upsert: true,
      },
    };
  });
  const res = await MetricSnapshot.bulkWrite(ops, { ordered: false });
  return { upserted: res.upsertedCount || 0, modified: res.modifiedCount || 0 };
};

/** Non-Transferred enrollments with the timestamp fields backfill derives from. */
const findNonTransferredEnrollments = () =>
  Enrollment.find({ status: { $ne: 'Transferred' } })
    .select('joinedAt createdAt status leftAt updatedAt classId').lean();

/** Issued certificates with the timestamp fields backfill derives from. */
const findIssuedCertificates = () =>
  Certificate.find({ status: 'Issued', isDeleted: { $ne: true } })
    .select('issuedAt createdAt programId').lean();

// ── Series + funnel reader (analyticsSeriesService) ───────

/** Stored snapshot rows for one metric/scope since a date, ascending. */
const findSnapshotSeries = ({ key, scope, scopeId, since }) =>
  MetricSnapshot.find({ key, scope, scopeId: scopeId || null, date: { $gte: since } })
    .sort({ date: 1 })
    .select('date value')
    .lean();

const findClassIdsForProgram = (programId) =>
  Class.find({ programId }).select('_id').lean();

const countEnrollments = (match) => Enrollment.countDocuments(match);

const countCertificates = (match) => Certificate.countDocuments(match);

module.exports = {
  findProgramClasses,
  aggregateEnrollmentsByClassStatus,
  aggregateIssuedCertsByProgram,
  upsertSnapshots,
  findNonTransferredEnrollments,
  findIssuedCertificates,
  findSnapshotSeries,
  findClassIdsForProgram,
  countEnrollments,
  countCertificates,
};
