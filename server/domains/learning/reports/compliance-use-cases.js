const repository = require('./repository');
const { resolveAssignmentStatuses } = require('../assignment/status-resolver');
const { ServiceError } = require('../../../helpers/ServiceError');
const {
  idOf,
  idString,
  uniq,
  targetPrograms,
  certificateState,
  buildCertificateMap,
  assignmentCertificate,
} = require('./compliance-certificate-state');
const {
  complianceRow,
  matchesFilters,
  summarize,
  buildRollups,
} = require('./compliance-report-shape');

const assertCanReadCompliance = (actor) => {
  if (actor?.role !== 'Admin') {
    throw new ServiceError('Only Admins can read org-wide compliance reports', 403);
  }
};

const responseFilters = (query) => ({
  assignmentId: query.assignmentId || null,
  programId: query.programId || null,
  departmentId: query.departmentId || null,
  managerId: query.managerId || null,
  status: query.status || null,
  certificateState: query.certificateState || null,
  dueFrom: query.dueFrom || null,
  dueTo: query.dueTo || null,
});

const buildComplianceRows = (assignments, statusSets, userById, certByUserProgram, query, now) => {
  const rows = [];
  assignments.forEach((assignment, index) => {
    statusSets[index].forEach((statusRow) => {
      const userId = idString(statusRow.learner?._id);
      const user = userById.get(userId);
      if (!user) return;
      const certificate = assignmentCertificate(userId, assignment, certByUserProgram, now);
      const row = complianceRow({ user, assignment, statusRow, certificate });
      if (matchesFilters(row, query)) rows.push(row);
    });
  });
  return rows.sort((a, b) =>
    a.assignment.dueDate - b.assignment.dueDate
    || a.assignment.title.localeCompare(b.assignment.title)
    || a.learner.name.localeCompare(b.learner.name));
};

const buildComplianceReport = async (query = {}, actor, now = new Date()) => {
  assertCanReadCompliance(actor);
  const assignments = await repository.listComplianceAssignments(query);
  const statusSets = await Promise.all(assignments.map((assignment) => resolveAssignmentStatuses(assignment, now)));
  const learnerIds = uniq(statusSets.flatMap((rows) => rows.map((row) => row.learner?._id)));
  const programIds = uniq(assignments.flatMap(targetPrograms).map(idOf));

  const [orgUsers, certificates] = await Promise.all([
    repository.findOrgUsers(learnerIds),
    repository.listProgramCertificates(learnerIds, programIds),
  ]);
  const userById = new Map(orgUsers.map((user) => [user._id.toString(), user]));
  const certByUserProgram = buildCertificateMap(certificates);
  const rows = buildComplianceRows(assignments, statusSets, userById, certByUserProgram, query, now);

  return {
    generatedAt: now.toISOString(),
    filters: responseFilters(query),
    summary: summarize(rows),
    rollups: buildRollups(rows),
    rows,
  };
};

module.exports = { buildComplianceReport, certificateState };
