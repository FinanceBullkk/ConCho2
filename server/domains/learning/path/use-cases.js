const repository = require('./repository');
const LearningProgram = require('../../../models/LearningProgram');
const { ServiceError } = require('../../../helpers/ServiceError');
const { hasCompletedProgram } = require('../enrollment/prerequisites');
const { pathDto, programSummary } = require('./dto');

// Preserve order, drop duplicate program references.
const dedupePrograms = (ids = []) => {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(id);
    }
  }
  return out;
};

// Every referenced program must exist (we don't gate on status — a path may
// reference an inactive program that is still part of the curriculum).
const assertProgramsExist = async (ids) => {
  if (!ids.length) return;
  const found = await LearningProgram.find({ _id: { $in: ids } }).distinct('_id');
  if (found.length !== ids.length) {
    throw new ServiceError('One or more programs do not exist', 422);
  }
};

// Translate a duplicate-code write into a user-facing 409.
const asConflict = (error) => {
  if (error && error.code === 11000) {
    return new ServiceError('A learning path with this code already exists', 409);
  }
  return error;
};

const listPaths = async (query) => {
  const rows = await repository.list(query);
  return rows.map(pathDto);
};

const getPath = async (id) => {
  const path = await repository.findByIdLean(id);
  return pathDto(path);
};

const createPath = async (payload) => {
  const programs = dedupePrograms(payload.programs || []);
  await assertProgramsExist(programs);
  try {
    const created = await repository.create({ ...payload, programs });
    return pathDto(created);
  } catch (error) {
    throw asConflict(error);
  }
};

// Returns { before, path } so the controller can audit a real diff.
const updatePath = async (id, payload) => {
  const before = await repository.findByIdLean(id);
  if (!before) throw new ServiceError('Learning path not found', 404);

  const patch = { ...payload };
  if (payload.programs) {
    patch.programs = dedupePrograms(payload.programs);
    await assertProgramsExist(patch.programs);
  }
  try {
    const updated = await repository.updateById(id, patch);
    return { before: pathDto(before), path: pathDto(updated) };
  } catch (error) {
    throw asConflict(error);
  }
};

const archivePath = async (id) => {
  const before = await repository.findByIdLean(id);
  if (!before) throw new ServiceError('Learning path not found', 404);
  const deleted = await repository.softDelete(id);
  return { before: pathDto(before), path: pathDto(deleted) };
};

// Per-learner progress: walk the ordered programs, derive completion from the
// shared prerequisite engine. The first not-yet-completed step is `current`;
// everything after it is `locked`; completed steps are `completed`.
const getPathProgress = async (id, userId) => {
  const path = await repository.findByIdLean(id);
  if (!path) throw new ServiceError('Learning path not found', 404);

  const programs = path.programs || [];
  const completions = [];
  for (const program of programs) {
    const programId = program._id || program;
    // eslint-disable-next-line no-await-in-loop -- paths are short ordered lists
    completions.push(await hasCompletedProgram(userId, programId));
  }

  let currentAssigned = false;
  const steps = programs.map((program, index) => {
    const completed = completions[index];
    let status;
    if (completed) {
      status = 'completed';
    } else if (!currentAssigned) {
      status = 'current';
      currentAssigned = true;
    } else {
      status = 'locked';
    }
    return { order: index + 1, status, program: programSummary(program) };
  });

  const total = programs.length;
  const completedCount = completions.filter(Boolean).length;
  return {
    pathId: path._id,
    code: path.code,
    title: path.title,
    steps,
    summary: {
      total,
      completed: completedCount,
      percentComplete: total ? Math.round((completedCount / total) * 100) : 0,
      complete: total > 0 && completedCount === total,
    },
  };
};

module.exports = {
  listPaths,
  getPath,
  createPath,
  updatePath,
  archivePath,
  getPathProgress,
};
