const repository = require('./repository');
const { ServiceError } = require('../../helpers/ServiceError');
const { departmentDto, teamMemberDto } = require('./dto');

// ──────────────────────────────────────────────────────────
// org/use-cases — business rules for the org model (Wave D3):
// department CRUD, manager/department assignment, and the
// manager-scoped "my team" training rollup.
// ──────────────────────────────────────────────────────────

const asConflict = (error) => {
  if (error && error.code === 11000) {
    return new ServiceError('A department with this code already exists', 409);
  }
  return error;
};

// ── Departments ───────────────────────────────────────────
const listDepartments = async (query) => {
  const rows = await repository.listDepartments(query);
  return rows.map(departmentDto);
};

const createDepartment = async (payload) => {
  try {
    const created = await repository.createDepartment(payload);
    return departmentDto(created);
  } catch (error) {
    throw asConflict(error);
  }
};

const updateDepartment = async (id, payload) => {
  const before = await repository.findDepartmentByIdLean(id);
  if (!before) throw new ServiceError('Department not found', 404);
  try {
    const updated = await repository.updateDepartmentById(id, payload);
    return { before: departmentDto(before), after: departmentDto(updated) };
  } catch (error) {
    throw asConflict(error);
  }
};

// Soft-delete; refuse while users still point at the department (avoid
// orphaning departmentId references — reassign first).
const archiveDepartment = async (id) => {
  const before = await repository.findDepartmentByIdLean(id);
  if (!before) throw new ServiceError('Department not found', 404);
  const inUse = await repository.countUsersInDepartment(id);
  if (inUse > 0) {
    throw new ServiceError(`Cannot archive: ${inUse} user(s) still assigned to this department`, 409);
  }
  const deleted = await repository.softDeleteDepartment(id);
  return { before: departmentDto(before), after: departmentDto(deleted) };
};

// ── Assignment (manager + department) ─────────────────────
const MAX_CHAIN_DEPTH = 50;

// Walk up from `startManagerId`; throw if we reach `userId` (a cycle). Bounded
// so a pre-existing corrupt chain can't loop forever.
const assertNoManagerCycle = async (userId, startManagerId) => {
  let cursor = startManagerId;
  let depth = 0;
  while (cursor && depth < MAX_CHAIN_DEPTH) {
    if (cursor.toString() === userId.toString()) {
      throw new ServiceError('Manager assignment would create a reporting cycle', 422);
    }
    // eslint-disable-next-line no-await-in-loop -- bounded walk up a short org chain
    const node = await repository.findUserByIdLean(cursor);
    cursor = node?.managerId || null;
    depth += 1;
  }
};

// Set a user's manager and/or department. `null` clears; omitted = unchanged.
// Returns slim before/after (org fields only) so the controller audits a tight diff.
const assignUser = async (userId, payload) => {
  const before = await repository.findUserByIdLean(userId);
  if (!before) throw new ServiceError('User not found', 404);

  const patch = {};

  if (payload.managerId !== undefined) {
    if (payload.managerId === null) {
      patch.managerId = null;
    } else {
      if (payload.managerId.toString() === userId.toString()) {
        throw new ServiceError('A user cannot be their own manager', 422);
      }
      const manager = await repository.findUserByIdLean(payload.managerId);
      if (!manager) throw new ServiceError('Manager not found', 422);
      await assertNoManagerCycle(userId, payload.managerId);
      patch.managerId = payload.managerId;
    }
  }

  if (payload.departmentId !== undefined) {
    if (payload.departmentId === null) {
      patch.departmentId = null;
    } else {
      const dept = await repository.findDepartmentByIdLean(payload.departmentId);
      if (!dept) throw new ServiceError('Department not found', 422);
      patch.departmentId = payload.departmentId;
    }
  }

  const after = await repository.updateUserAssignment(userId, patch);
  const slim = (u) => ({ managerId: u.managerId || null, departmentId: u.departmentId || null });
  return { before: slim(before), after: slim(after), user: after };
};

// ── Manager dashboard (self-scoped) ───────────────────────
// Direct reports of `managerId` + each one's training rollup. Rollups are
// batched (two aggregates over the report set) — no per-report query.
const getMyTeam = async (managerId) => {
  const reports = await repository.listDirectReports(managerId);
  if (!reports.length) {
    return { managerId, count: 0, reports: [], summary: { reports: 0, certificates: 0, completedPrograms: 0 } };
  }

  const ids = reports.map((r) => r._id);
  const [enrollAgg, certAgg] = await Promise.all([
    repository.aggregateActiveEnrollments(ids),
    repository.aggregateIssuedCertificates(ids),
  ]);

  const enrollMap = new Map(enrollAgg.map((e) => [e._id.toString(), e]));
  const certMap = new Map(certAgg.map((c) => [c._id.toString(), c]));

  const reportDtos = reports.map((u) => {
    const e = enrollMap.get(u._id.toString());
    const c = certMap.get(u._id.toString());
    return teamMemberDto(u, {
      activeEnrollments: e ? e.count : 0,
      certificates: c ? c.count : 0,
      completedPrograms: c ? (c.programs || []).filter(Boolean).length : 0,
    });
  });

  const summary = reportDtos.reduce(
    (acc, r) => {
      acc.certificates += r.training.certificates;
      acc.completedPrograms += r.training.completedPrograms;
      return acc;
    },
    { reports: reportDtos.length, certificates: 0, completedPrograms: 0 },
  );

  return { managerId, count: reportDtos.length, reports: reportDtos, summary };
};

module.exports = {
  listDepartments,
  createDepartment,
  updateDepartment,
  archiveDepartment,
  assignUser,
  getMyTeam,
};
