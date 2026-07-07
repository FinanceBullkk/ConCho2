const mongoose = require('mongoose');
const { getNextSequence } = require('../../helpers/counter');
const { escapeRegex } = require('../../helpers/escapeRegex');
const { programDto, cohortDto } = require('./dto');
const repository = require('./repository');
const { recordInApp } = require('../notification/in-app-writer');

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

// PERF-015: programs/cohorts lists previously returned EVERY row (cohorts
// grow ~1 per delivery, forever). Opt-in ?page/?limit window with a hard
// cap — the response envelope is unchanged, so existing clients keep
// working while the unbounded-growth path is closed.
const LIST_HARD_CAP = 500;
const listWindow = (query = {}) => {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || LIST_HARD_CAP, 1), LIST_HARD_CAP);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { limit, skip: (page - 1) * limit };
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
  const { skip, limit } = listWindow(query);
  const rows = await repository.findPrograms(buildProgramFilter(query)).skip(skip).limit(limit).lean();
  return rows.map(programDto);
};

const getProgram = async (id) => {
  const program = await repository.findProgramById(id).lean();
  return programDto(program);
};

// Real completion trend: certificates issued for the program, last 8 months,
// zero-filled so the sparkline always has a full axis.
const TREND_MONTHS = 8;
const getCompletionTrend = async (id) => {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - (TREND_MONTHS - 1), 1);
  const rows = await repository.monthlyCompletions(new mongoose.Types.ObjectId(id), since);
  const counts = new Map(rows.map((r) => [`${r._id.y}-${String(r._id.m).padStart(2, '0')}`, r.count]));
  const series = [];
  for (let i = TREND_MONTHS - 1; i >= 0; i -= 1) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    series.push({ month: key, completions: counts.get(key) || 0 });
  }
  return { series };
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
    // Backfill the legacy link through the dual-backend repo. The old
    // `byName.save()` assumed a hydrated Mongoose doc; the PG impl returns a
    // plain row (no .save()), so it threw under DB_BACKEND=postgres.
    if (!byName.legacyCourseName) {
      return repository.updateProgramById(byName._id, { legacyCourseName: courseName });
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
  const { skip, limit } = listWindow(query);
  const filter = buildCohortFilter(query);
  // Convergence Phase 3 slice 5: the server-side mode=team|cohort split was
  // retired — the UNIFIED catalog fetches all worlds and facets client-side by
  // the cohort DTO's deliveryType. `GET /api/learning/cohorts` returns both.
  const cohorts = await repository.findCohorts(filter).skip(skip).limit(limit).lean();
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
    ...(payload.customFields && typeof payload.customFields === 'object' ? { customFields: payload.customFields } : {}),
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
  if (payload.customFields !== undefined && typeof payload.customFields === 'object') update.customFields = payload.customFields;

  await repository.updateCohortById(id, update);
  return getCohort(id);
};

// Soft-archive a cohort (recoverable). Blocks while Teams/Schedules still
// reference it; then closes active Enrollments (status→Dropped, like Team
// delete) and marks the cohort deleted in one transaction. Evaluations and the
// Enrollment history are PRESERVED (golden rule); restore brings it all back.
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
  let closedEnrollments = 0;
  const deletedAt = new Date();
  try {
    await session.withTransaction(async () => {
      const enrollResult = await repository.closeEnrollmentsByCohort(id, deletedAt, session);
      closedEnrollments = enrollResult.modifiedCount;
      await repository.softDeleteCohort(id, deletedAt, session);
    });
  } finally {
    session.endSession();
  }

  return {
    cohortCode: cohort.classCode,
    courseName: cohort.courseName,
    closedEnrollments,
  };
};

// Restore a soft-archived cohort. Active enrollments closed at delete time stay
// Dropped (admin re-enrolls as needed) — mirrors Team restore.
const restoreCohort = async (id) => {
  const restored = await repository.restoreCohortById(id);
  if (!restored) {
    const err = new Error('Archived cohort not found');
    err.statusCode = 404;
    throw err;
  }
  return getCohort(id);
};

const listDeletedCohorts = async () => {
  const cohorts = await repository.findDeletedCohorts().lean();
  return enrichCohorts(cohorts);
};

// Nudge selected cohort learners with an in-app notification (roster bulk
// action). Writes are fail-soft + idempotent per learner/cohort/day via the
// cadenceKey, so a same-day re-nudge is a no-op. Returns the attempted count.
const nudgeCohortLearners = async (cohortId, { userIds, message }) => {
  const cohort = await repository.findCohortById(cohortId).lean();
  if (!cohort) {
    const err = new Error('Cohort not found');
    err.statusCode = 404;
    throw err;
  }
  const isoDate = new Date().toISOString().slice(0, 10);
  await Promise.all(userIds.map((userId) =>
    recordInApp({
      type: 'coordinator_nudge',
      recipientUserId: userId,
      learnerId: userId,
      cadenceKey: `${cohortId}:${userId}:${isoDate}`,
      metadata: { cohortId, cohortCode: cohort.classCode, message: message || '' },
    })));
  return { cohortId, notified: userIds.length };
};

module.exports = {
  listPrograms,
  getProgram,
  getCompletionTrend,
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
  restoreCohort,
  listDeletedCohorts,
  nudgeCohortLearners,
};
