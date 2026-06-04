// ──────────────────────────────────────────────────────────
// org/dto — response shaping for the org domain.
// ──────────────────────────────────────────────────────────

const departmentDto = (d) => {
  if (!d) return null;
  const o = typeof d.toObject === 'function' ? d.toObject() : d;
  return {
    _id: o._id,
    name: o.name,
    code: o.code,
    description: o.description || '',
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
};

const idOf = (value) => (value && value._id ? value._id : value) || null;

// A direct report + their training rollup, for the manager dashboard.
// `rollup` is computed in the use-case (batched) and merged here.
const teamMemberDto = (user, rollup = {}) => {
  if (!user) return null;
  const dept = user.departmentId;
  return {
    _id: user._id,
    name: user.name,
    empCode: user.empCode,
    email: user.email || null,
    role: user.role,
    status: user.status,
    position: user.position || '',
    department: dept && typeof dept === 'object'
      ? { _id: dept._id, name: dept.name, code: dept.code }
      : (user.department || null), // fall back to the legacy free-text string
    training: {
      activeEnrollments: rollup.activeEnrollments || 0,
      certificates: rollup.certificates || 0,
      completedPrograms: rollup.completedPrograms || 0,
    },
  };
};

module.exports = { departmentDto, teamMemberDto, idOf };
