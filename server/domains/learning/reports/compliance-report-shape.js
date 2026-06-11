const { idString, targetLabel } = require('./compliance-certificate-state');

const orgDto = (user) => ({
  departmentId: user.departmentId?._id || null,
  departmentName: user.departmentId?.name || user.department || 'Unassigned',
  managerId: user.managerId?._id || null,
  managerName: user.managerId?.name || 'No manager',
});

const learnerDto = (user) => ({
  id: user._id.toString(),
  empCode: user.empCode || '',
  name: user.name || '',
  email: user.email || '',
});

const assignmentDto = (assignment, status) => ({
  id: assignment._id.toString(),
  title: assignment.title,
  targetType: assignment.targetType,
  targetId: idString(assignment.targetType === 'path' ? assignment.pathId : assignment.programId),
  targetName: targetLabel(assignment),
  dueDate: assignment.dueDate,
  status,
});

const completionDto = (complete, certificate) => ({
  complete,
  evidence: complete && certificate.id && certificate.status === 'Issued'
    ? 'certificate'
    : (complete ? 'completion' : 'none'),
});

const complianceRow = ({ user, assignment, statusRow, certificate }) => ({
  learner: learnerDto(user),
  org: orgDto(user),
  assignment: assignmentDto(assignment, statusRow.status),
  completion: completionDto(Boolean(statusRow.complete), certificate),
  certificate,
});

const matchesFilters = (row, query) => {
  if (query.departmentId && idString(row.org.departmentId) !== query.departmentId) return false;
  if (query.managerId && idString(row.org.managerId) !== query.managerId) return false;
  if (query.status && row.assignment.status !== query.status) return false;
  if (query.certificateState && row.certificate.state !== query.certificateState) return false;
  return true;
};

const emptyRollup = (key, label) => ({
  key,
  label,
  rows: 0,
  _learners: new Set(),
  complete: 0,
  overdue: 0,
  issued: 0,
  missing: 0,
  expiring: 0,
  expired: 0,
  revoked: 0,
});

const addRollup = (map, key, label, row) => {
  const existing = map.get(key) || emptyRollup(key, label);
  existing.rows += 1;
  existing._learners.add(row.learner.id);
  if (row.completion.complete) existing.complete += 1;
  if (row.assignment.status === 'overdue') existing.overdue += 1;
  existing[row.certificate.state] += 1;
  map.set(key, existing);
};

const finalizeRollup = (map) =>
  [...map.values()]
    .map(({ _learners, ...row }) => ({ ...row, learners: _learners.size }))
    .sort((a, b) => a.label.localeCompare(b.label));

const summarize = (rows) => {
  const learners = new Set(rows.map((r) => r.learner.id));
  const assignments = new Set(rows.map((r) => r.assignment.id));
  return rows.reduce((acc, row) => {
    acc.rows += 1;
    acc[row.assignment.status.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] += 1;
    acc[row.certificate.state] += 1;
    return acc;
  }, {
    rows: 0,
    learners: learners.size,
    assignments: assignments.size,
    notStarted: 0,
    inProgress: 0,
    complete: 0,
    overdue: 0,
    issued: 0,
    missing: 0,
    revoked: 0,
    expiring: 0,
    expired: 0,
  });
};

const buildRollups = (rows) => {
  const programs = new Map();
  const departments = new Map();
  const managers = new Map();
  rows.forEach((row) => {
    addRollup(programs, row.assignment.targetId, row.assignment.targetName || row.assignment.title, row);
    addRollup(departments, idString(row.org.departmentId) || 'unassigned', row.org.departmentName, row);
    addRollup(managers, idString(row.org.managerId) || 'no-manager', row.org.managerName, row);
  });
  return {
    programs: finalizeRollup(programs),
    departments: finalizeRollup(departments),
    managers: finalizeRollup(managers),
  };
};

module.exports = { complianceRow, matchesFilters, summarize, buildRollups };
