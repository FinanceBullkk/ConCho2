const programDto = (program) => {
  if (!program) return null;
  const p = typeof program.toObject === 'function' ? program.toObject() : program;
  return {
    _id: p._id,
    code: p.code,
    name: p.name,
    description: p.description || '',
    category: p.category,
    defaultSessionCount: p.defaultSessionCount,
    deliveryMode: p.deliveryMode,
    schedulingMode: p.schedulingMode,
    completionPolicy: p.completionPolicy,
    capacityPolicy: p.capacityPolicy,
    facilitatorPolicy: p.facilitatorPolicy,
    prerequisitePrograms: (p.prerequisitePrograms || []).map((id) => id.toString()),
    status: p.status,
    legacyCourseName: p.legacyCourseName || '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
};

const cohortDto = (cohort, bookedSessions = 0) => {
  if (!cohort) return null;
  const c = typeof cohort.toObject === 'function' ? cohort.toObject() : cohort;
  const program = c.programId && typeof c.programId === 'object'
    ? programDto(c.programId)
    : null;
  return {
    _id: c._id,
    cohortCode: c.classCode,
    classCode: c.classCode,
    programId: program?._id || c.programId || null,
    program,
    programName: program?.name || c.courseName,
    legacyCourseName: c.courseName,
    totalSessions: c.totalSessions,
    bookedSessions,
    status: c.status,
    teacherIds: c.teacherIds || [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
};

module.exports = { programDto, cohortDto };
