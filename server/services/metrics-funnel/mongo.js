// Funnel reference repository — MONGO implementation (Phase 2 / 2.6).
// Semantic interface `getFunnelCounts({ programId })`; reuses the Phase-0
// metrics-repository so the Mongo path is unchanged. Mirror of the live
// analyticsSeriesService.getFunnel counting logic. Pin impls.mongo explicitly —
// metrics-repository became a DB_BACKEND selector in Wave F-PR-1, and this
// wrapper must stay the Mongo side of the parity comparison on the pg lane.
const repo = require('../metrics-repository').impls.mongo;

const getFunnelCounts = async ({ programId = null } = {}) => {
  let classIds = null;
  if (programId) {
    const classes = await repo.findClassIdsForProgram(programId);
    classIds = classes.map((c) => c._id);
  }
  const enrollMatch = { status: { $ne: 'Transferred' } };
  if (classIds) enrollMatch.classId = { $in: classIds };
  const certMatch = { status: 'Issued', isDeleted: { $ne: true } };
  if (programId) certMatch.programId = programId;

  const [enrolled, completed, certified] = await Promise.all([
    repo.countEnrollments(enrollMatch),
    repo.countEnrollments({ ...enrollMatch, status: 'Completed' }),
    repo.countCertificates(certMatch),
  ]);
  return { enrolled, completed, certified };
};

module.exports = { getFunnelCounts };
