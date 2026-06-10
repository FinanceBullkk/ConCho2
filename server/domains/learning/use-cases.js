const mongoose = require('mongoose');
const { getNextSequence } = require('../../helpers/counter');
const { escapeRegex } = require('../../helpers/escapeRegex');
const { programDto, cohortDto } = require('./dto');
const repository = require('./repository');

const legacyEnglishCourses = new Set([
  'Foundation',
  'Extension of Foundation',
  'Communication 1',
  'Communication 2',
  'Communication 3',
  'Business English',
]);

const normalizeProgramPayload = (payload) => ({
  ...payload,
  code: payload.code?.toUpperCase(),
  legacyCourseName: payload.legacyCourseName || '',
});

const makeLegacyProgramCode = (courseName) => {
  const slug = courseName
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
  return `ENG_${slug || 'PROGRAM'}`.slice(0, 40);
};

const buildProgramFilter = (query = {}) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.category) filter.category = query.category;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { description: rx }];
  }
  return filter;
};

const listPrograms = async (query = {}) => {
  const rows = await repository.findPrograms(buildProgramFilter(query)).lean();
  return rows.map(programDto);
};

const getProgram = async (id) => {
  const program = await repository.findProgramById(id).lean();
  return programDto(program);
};

const createProgram = async (payload) => {
  const created = await repository.createProgram(normalizeProgramPayload(payload));
  return programDto(created);
};

const updateProgram = async (id, payload) => {
  const normalized = normalizeProgramPayload(payload);
  // A program can never be its own prerequisite.
  if (Array.isArray(normalized.prerequisitePrograms)) {
    normalized.prerequisitePrograms = normalized.prerequisitePrograms.filter(
      (pid) => pid.toString() !== id.toString(),
    );
  }
  const updated = await repository.updateProgramById(id, normalized);
  return programDto(updated);
};

const archiveProgram = async (id) => updateProgram(id, { status: 'archived' });

const ensureProgramForLegacyCourse = async (courseName, defaultSessionCount = 1) => {
  const byLegacy = await repository.findProgramByLegacyCourseName(courseName);
  if (byLegacy) return byLegacy;

  const byName = await repository.findProgramByName(courseName);
  if (byName) {
    if (!byName.legacyCourseName) {
      byName.legacyCourseName = courseName;
      await byName.save();
    }
    return byName;
  }

  return repository.createProgram({
    code: makeLegacyProgramCode(courseName),
    name: courseName,
    category: legacyEnglishCourses.has(courseName) ? 'english' : 'other',
    defaultSessionCount,
    deliveryMode: 'online',
    schedulingMode: 'leader_booking',
    completionPolicy: {
      attendanceThresholdPercent: 0,
      requiresAssessment: true,
      requiresFeedback: false,
    },
    legacyCourseName: courseName,
  });
};

const backfillProgramsFromCourseSettings = async () => {
  const Setting = mongoose.model('Setting');
  const setting = await Setting.findOne({ key: 'COURSE_SESSIONS' }).lean();
  const courseSessions = setting?.value || {};
  const programs = [];

  for (const [courseName, totalSessions] of Object.entries(courseSessions)) {
    const program = await ensureProgramForLegacyCourse(courseName, totalSessions);
    programs.push(programDto(program));
  }

  return programs;
};

const buildCohortFilter = (query = {}) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.programId) filter.programId = query.programId;
  const code = query.cohortCode || query.classCode;
  if (code) filter.classCode = code.toUpperCase();
  return filter;
};

const enrichCohorts = async (cohorts) => {
  const ids = cohorts.map((cohort) => cohort._id);
  const counts = await repository.countSessionsByCohortIds(ids);
  return cohorts.map((cohort) => cohortDto(cohort, counts[cohort._id.toString()] || 0));
};

const listCohorts = async (query = {}) => {
  const cohorts = await repository.findCohorts(buildCohortFilter(query)).lean();
  return enrichCohorts(cohorts);
};

const getCohort = async (id) => {
  const cohort = await repository.findCohortById(id).lean();
  if (!cohort) return null;
  const [dto] = await enrichCohorts([cohort]);
  return dto;
};

const createCohort = async (payload) => {
  const program = await repository.findProgramById(payload.programId);
  if (!program || program.status === 'archived') {
    const err = new Error('Learning program not found');
    err.statusCode = 404;
    throw err;
  }

  let classCode = payload.cohortCode || payload.classCode;
  if (!classCode) {
    const seq = await getNextSequence('classCode');
    classCode = `LD${seq.toString().padStart(3, '0')}`;
  }

  const created = await repository.createCohort({
    classCode: classCode.toUpperCase(),
    courseName: program.name,
    programId: program._id,
    totalSessions: payload.totalSessions || program.defaultSessionCount,
    status: payload.status || 'Ongoing',
    teacherIds: payload.teacherIds || [],
  });

  return getCohort(created._id);
};

// Edit a cohort. Mirrors the legacy classController.updateClass surface:
// only `status` + `totalSessions` are editable, with the "one Ongoing run per
// cohort code" guard preserved.
const updateCohort = async (id, payload) => {
  const existing = await repository.findCohortById(id);
  if (!existing) {
    const err = new Error('Cohort not found');
    err.statusCode = 404;
    throw err;
  }

  // Rule: only one Ongoing run per cohort code — block a Completed→Ongoing flip
  // when another run of the same code is already Ongoing.
  if (payload.status === 'Ongoing' && existing.status !== 'Ongoing') {
    const conflict = await repository.findOngoingCohortConflict(existing.classCode, id);
    if (conflict) {
      const err = new Error(
        `Cohort "${existing.classCode}" already has an Ongoing run: "${conflict.courseName}". Mark it Completed first.`,
      );
      err.statusCode = 409;
      throw err;
    }
  }

  const update = {};
  if (payload.status !== undefined) update.status = payload.status;
  if (payload.totalSessions !== undefined) update.totalSessions = payload.totalSessions;

  await repository.updateCohortById(id, update);
  return getCohort(id);
};

// Delete a cohort. Mirrors legacy classController.deleteClass: blocks while
// Teams/Schedules still reference it, then cascades Evaluation + Enrollment
// cleanup with the cohort delete in one transaction.
const deleteCohort = async (id) => {
  const cohort = await repository.findCohortById(id);
  if (!cohort) {
    const err = new Error('Cohort not found');
    err.statusCode = 404;
    throw err;
  }

  const teamCount = await repository.countTeamsByCohort(id);
  if (teamCount > 0) {
    const err = new Error(
      `Cannot delete: ${teamCount} group(s) are still assigned to this cohort. Delete or reassign them first.`,
    );
    err.statusCode = 409;
    throw err;
  }

  const scheduleCount = await repository.countSchedulesByCohort(id);
  if (scheduleCount > 0) {
    const err = new Error(
      `Cannot delete: ${scheduleCount} session(s) still reference this cohort. Delete them first.`,
    );
    err.statusCode = 409;
    throw err;
  }

  const session = await mongoose.startSession();
  let deletedEvaluations = 0;
  let deletedEnrollments = 0;
  try {
    await session.withTransaction(async () => {
      const evalResult = await repository.deleteEvaluationsByCohort(id, session);
      deletedEvaluations = evalResult.deletedCount;
      const enrollResult = await repository.deleteEnrollmentsByCohort(id, session);
      deletedEnrollments = enrollResult.deletedCount;
      await repository.deleteCohortById(id, session);
    });
  } finally {
    session.endSession();
  }

  return {
    cohortCode: cohort.classCode,
    courseName: cohort.courseName,
    deletedEvaluations,
    deletedEnrollments,
  };
};

module.exports = {
  listPrograms,
  getProgram,
  createProgram,
  updateProgram,
  archiveProgram,
  ensureProgramForLegacyCourse,
  backfillProgramsFromCourseSettings,
  listCohorts,
  getCohort,
  createCohort,
  updateCohort,
  deleteCohort,
};
