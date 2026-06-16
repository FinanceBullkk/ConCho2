const repository = require('./repository');
const dto = require('./dto');
const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// trainer/use-cases — trainer-management business rules (A6, Horizon 2).
// Qualification + availability profiles, a qualified-and-free picker, per-trainer
// load, and post-session ratings. Double-booking itself is guarded at the
// schedule assign chokepoint (domains/schedule setTrainers), not here.
// ──────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;

// A trainer must be a live, non-Dropped Teacher/Admin (mirrors
// schedule.findValidInstructorIds — keep the two in lock-step).
const assertTrainerUser = (user) => {
  if (!user) throw new ServiceError('User not found', 404);
  if (!['Teacher', 'Admin'].includes(user.role)) {
    throw new ServiceError('Only Teacher/Admin users can have a trainer profile', 400);
  }
};

const listTrainers = async (query = {}) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.qualifiedFor) filter.canDeliver = query.qualifiedFor;

  const profiles = await repository.listProfiles(filter);
  const byUserId = new Map(profiles.map((p) => [String(p.userId), p]));
  const userIds = [...byUserId.keys()];

  // Optionally fold in Teacher/Admin users that have no profile yet (so the
  // page can offer them) — only when NOT filtering by qualification/status.
  if (query.includeCandidates && !query.qualifiedFor && !query.status) {
    const candidates = await repository.findTrainerCandidates();
    for (const c of candidates) {
      if (!byUserId.has(String(c._id))) userIds.push(String(c._id));
    }
    const users = await repository.findUsersByIds(userIds);
    return annotate(users, byUserId, query);
  }

  const users = await repository.findUsersByIds(userIds);
  return annotate(users, byUserId, query);
};

// Attach profile + (optional) free-at flag, sorted by name.
const annotate = async (users, byUserId, query) => {
  let busy = new Set();
  if (query.at) {
    const start = query.at;
    const end = query.atEnd || new Date(query.at.getTime() + HOUR_MS);
    busy = await repository.busyInstructorIds(users.map((u) => String(u._id)), start, end);
  }
  return users
    .map((u) => dto.toTrainer(u, byUserId.get(String(u._id)) || null,
      query.at ? { busy: busy.has(String(u._id)) } : {}))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

const getTrainer = async (userId) => {
  const [user] = await repository.findUsersByIds([userId]);
  if (!user) throw new ServiceError('User not found', 404);
  const profile = await repository.findProfileByUserId(userId);
  return dto.toTrainer(user, profile);
};

const upsertProfile = async (userId, body, actorId) => {
  const [user] = await repository.findUsersByIds([userId]);
  assertTrainerUser(user);
  const before = await repository.findProfileByUserId(userId);
  const after = await repository.upsertProfile(userId, { ...body, ...(before ? {} : { createdBy: actorId || null }) });
  // `after` (raw doc) feeds the audit diff; `trainer` (DTO) is the API response.
  return { before, after, trainer: dto.toTrainer(user, after), created: !before };
};

const archiveProfile = async (userId) => {
  const before = await repository.findProfileByUserId(userId);
  if (!before) throw new ServiceError('Trainer profile not found', 404);
  const after = await repository.softDeleteProfile(userId);
  return { before, after };
};

const addRating = async (userId, body, actorId) => {
  const profile = await repository.findProfileByUserId(userId);
  if (!profile) throw new ServiceError('Trainer profile not found — create one before rating', 404);
  await repository.pushRating(userId, { value: body.value, note: body.note || '', by: actorId || null, at: new Date() });
  return getTrainer(userId);
};

const getLoad = async (userId, query = {}) => {
  const [user] = await repository.findUsersByIds([userId]);
  if (!user) throw new ServiceError('User not found', 404);
  const from = query.from || new Date();
  const to = query.to || new Date(Date.now() + 90 * 24 * HOUR_MS);
  const sessions = await repository.sessionsForTrainer(userId, { from, to });
  const totalHours = sessions.reduce(
    (sum, s) => sum + Math.max(0, (new Date(s.endTime) - new Date(s.startTime)) / HOUR_MS), 0);
  return {
    userId: String(userId),
    from,
    to,
    sessionCount: sessions.length,
    totalHours: Math.round(totalHours * 10) / 10,
    sessions,
  };
};

module.exports = {
  listTrainers,
  getTrainer,
  upsertProfile,
  archiveProfile,
  addRating,
  getLoad,
};
