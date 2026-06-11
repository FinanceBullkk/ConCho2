const idOf = (value) => (value && value._id ? value._id : value) || null;

// A program reference inside a path. Populated reads carry the summary fields;
// a bare ObjectId (e.g. a fresh create before re-fetch) degrades to id-only.
const programSummary = (p) => {
  if (!p) return null;
  if (typeof p !== 'object' || p._id === undefined) return { _id: idOf(p) };
  return {
    _id: p._id,
    code: p.code,
    name: p.name,
    category: p.category,
    status: p.status,
    schedulingMode: p.schedulingMode,
  };
};

const pathDto = (path) => {
  if (!path) return null;
  const p = typeof path.toObject === 'function' ? path.toObject() : path;
  return {
    _id: p._id,
    code: p.code,
    title: p.title,
    description: p.description || '',
    programs: (p.programs || []).map(programSummary),
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};

module.exports = { pathDto, programSummary, idOf };
