const idOf = (value) => (value && value._id ? value._id : value) || null;

const compactUser = (user) => {
  if (!user) return null;
  return {
    _id: user._id,
    empCode: user.empCode,
    name: user.name,
    email: user.email || '',
    department: user.department || '',
    departmentId: user.departmentId || null,
  };
};

const compactDepartment = (department) => {
  if (!department) return null;
  return { _id: department._id, code: department.code, name: department.name };
};

const compactProgram = (program) => {
  if (!program) return null;
  return {
    _id: program._id,
    code: program.code,
    name: program.name,
    category: program.category,
    status: program.status,
  };
};

const compactPath = (path) => {
  if (!path) return null;
  return {
    _id: path._id,
    code: path.code,
    title: path.title,
    status: path.status,
  };
};

const assignmentDto = (assignment, learnerStatuses = []) => {
  if (!assignment) return null;
  const a = typeof assignment.toObject === 'function' ? assignment.toObject() : assignment;
  const summary = learnerStatuses.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    },
    { total: 0, not_started: 0, in_progress: 0, complete: 0, overdue: 0 },
  );

  return {
    _id: a._id,
    title: a.title,
    description: a.description || '',
    targetType: a.targetType,
    target: a.targetType === 'path' ? compactPath(a.pathId) : compactProgram(a.programId),
    dueDate: a.dueDate,
    userIds: (a.userIds || []).map(idOf),
    departmentIds: (a.departmentIds || []).map(idOf),
    users: (a.userIds || []).filter((u) => u && u._id).map(compactUser),
    departments: (a.departmentIds || []).filter((d) => d && d._id).map(compactDepartment),
    status: a.status,
    summary,
    learners: learnerStatuses,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
};

module.exports = { assignmentDto, compactUser };
