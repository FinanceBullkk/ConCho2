const repository = require('./repository');
const { matchesUser, targetProgramIds, evaluate } = require('./derivation');
const { publish } = require('../../lib/event-bus');
const EVENTS = require('../_shared/events');
const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// compliance/use-cases — A3 required-training rules + derived matrix.
// ──────────────────────────────────────────────────────────

const SAMPLE_NON_COMPLIANT = 25; // cap drill-down sample per requirement

// ── Rule CRUD (publishes requirement.changed for A8) ─────────────────────────
const listRequirements = () => repository.listRequirements();

const createRequirement = async (body, actorId) => {
  const created = await repository.createRequirement({ ...body, createdBy: actorId || null });
  await publish(EVENTS.REQUIREMENT_CHANGED, { requirementId: created._id, action: 'created' });
  return created.toObject ? created.toObject() : created;
};

const updateRequirement = async (id, body) => {
  const before = await repository.findRequirementById(id);
  if (!before) throw new ServiceError('Requirement not found', 404);
  const after = await repository.updateRequirement(id, body);
  await publish(EVENTS.REQUIREMENT_CHANGED, { requirementId: id, action: 'updated' });
  return { before, after };
};

const archiveRequirement = async (id) => {
  const before = await repository.findRequirementById(id);
  if (!before) throw new ServiceError('Requirement not found', 404);
  const after = await repository.softDeleteRequirement(id);
  await publish(EVENTS.REQUIREMENT_CHANGED, { requirementId: id, action: 'archived' });
  return { before, after };
};

// ── Shared resolution: path programs, target names, cert map ─────────────────
const resolveContext = async (requirements, userIds) => {
  const pathIds = requirements.filter((r) => r.target?.kind === 'path').map((r) => r.target.id);
  const paths = await repository.findPathsByIds(pathIds);
  const pathProgramsById = new Map(paths.map((p) => [String(p._id), (p.programs || []).map(String)]));
  const pathNameById = new Map(paths.map((p) => [String(p._id), p.title || p.code]));

  // Every program id we need a name + cert state for.
  const programIdSet = new Set();
  for (const r of requirements) {
    for (const pid of targetProgramIds(r, pathProgramsById)) programIdSet.add(pid);
  }
  const programIds = [...programIdSet];
  const programs = await repository.findProgramsByIds(programIds);
  const programNameById = new Map(programs.map((p) => [String(p._id), p.name || p.code]));

  const certs = await repository.listIssuedCertificates({ userIds, programIds });
  const latestCertByUserProgram = new Map(); // `${userId}:${pid}` → max issuedAt(ms)
  for (const c of certs) {
    const key = `${c.userId}:${c.programId}`;
    const ts = +new Date(c.issuedAt);
    const prev = latestCertByUserProgram.get(key);
    if (prev === undefined || ts > prev) latestCertByUserProgram.set(key, ts);
  }

  return { pathProgramsById, pathNameById, programNameById, latestCertByUserProgram };
};

const targetLabel = (r, ctx) => {
  if (r.label) return r.label;
  if (r.target?.kind === 'path') return ctx.pathNameById.get(String(r.target.id)) || 'Path';
  return ctx.programNameById.get(String(r.target?.id)) || 'Program';
};

// ── Matrix: role × requirement rollup ────────────────────────────────────────
const buildMatrix = async ({ departmentId, role } = {}, now = Date.now()) => {
  const requirements = await repository.listRequirements();
  const workforce = await repository.listWorkforce({ departmentId, role });
  const ctx = await resolveContext(requirements, workforce.map((u) => u._id));

  const rows = requirements.map((r) => {
    const programIds = targetProgramIds(r, ctx.pathProgramsById);
    const matched = workforce.filter((u) => matchesUser(r, u));
    let compliant = 0; let overdue = 0; let pending = 0;
    const sample = [];
    for (const user of matched) {
      const res = evaluate({ requirement: r, user, programIds, latestCertByUserProgram: ctx.latestCertByUserProgram, now });
      if (res.status === 'compliant') compliant += 1;
      else {
        if (res.status === 'overdue') overdue += 1; else pending += 1;
        if (sample.length < SAMPLE_NON_COMPLIANT) {
          sample.push({ userId: user._id, name: user.name, empCode: user.empCode, status: res.status, dueDate: res.dueDate });
        }
      }
    }
    const total = matched.length;
    return {
      id: r._id,
      label: targetLabel(r, ctx),
      target: { kind: r.target?.kind || 'program', id: r.target?.id },
      appliesTo: r.appliesTo,
      dueWithinDays: r.dueWithinDays,
      recurrence: r.recurrence,
      mandatory: r.mandatory,
      total,
      compliant,
      overdue,
      pending,
      pct: total ? Math.round((compliant / total) * 100) : null,
      nonCompliant: sample,
    };
  }).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101)); // worst compliance first

  const summary = {
    requirements: rows.length,
    employees: workforce.length,
    overdueTotal: rows.reduce((s, r) => s + r.overdue, 0),
  };
  return { rows, summary };
};

// ── One person's required-vs-done ────────────────────────────────────────────
const getUserCompliance = async (userId, now = Date.now()) => {
  const user = await repository.findUserById(userId);
  if (!user) throw new ServiceError('User not found', 404);

  const all = await repository.listRequirements();
  const requirements = all.filter((r) => matchesUser(r, user));
  const ctx = await resolveContext(requirements, [user._id]);

  const items = requirements.map((r) => {
    const programIds = targetProgramIds(r, ctx.pathProgramsById);
    const res = evaluate({ requirement: r, user, programIds, latestCertByUserProgram: ctx.latestCertByUserProgram, now });
    return {
      requirementId: r._id,
      label: targetLabel(r, ctx),
      target: { kind: r.target?.kind || 'program', id: r.target?.id },
      dueWithinDays: r.dueWithinDays,
      recurrence: r.recurrence,
      mandatory: r.mandatory,
      status: res.status,
      dueDate: res.dueDate,
      completedAt: res.completedAt,
    };
  });

  const summary = {
    total: items.length,
    compliant: items.filter((i) => i.status === 'compliant').length,
    overdue: items.filter((i) => i.status === 'overdue').length,
  };
  return { user: { id: user._id, name: user.name, empCode: user.empCode, role: user.role }, items, summary };
};

module.exports = {
  listRequirements,
  createRequirement,
  updateRequirement,
  archiveRequirement,
  buildMatrix,
  getUserCompliance,
};
