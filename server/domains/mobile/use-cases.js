const repository = require('./repository');
const assignmentUseCases = require('../learning/assignment/use-cases');
const pushService = require('../../services/pushService');
const { ServiceError } = require('../../helpers/ServiceError');

// ──────────────────────────────────────────────────────────
// mobile/use-cases — B5 (mobile learning surface, Horizon 2).
// Push-subscription management + the "due today" learner feed, composed from
// existing data (assignment listMine + upcoming enrolled sessions). No new
// content model — deeper content is deferred to B3.
// ──────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 7;

const getVapidKey = () => {
  const publicKey = pushService.getPublicKey();
  if (!publicKey) throw new ServiceError('Web Push is not configured on this server', 503);
  return { publicKey };
};

const subscribe = (actor, body) =>
  repository.upsertSubscription({
    userId: actor._id,
    endpoint: body.endpoint,
    keys: body.keys,
    userAgent: body.userAgent,
  });

const unsubscribe = (actor, endpoint) => repository.removeSubscription(actor._id, endpoint);

const assignmentItem = (a) => ({
  id: String(a.id),
  title: a.title,
  dueDate: a.dueDate || null,
  programName: a.programName || a.pathTitle || null,
  status: a.status,
  enrollableCohortId: a.enrollableCohortId ? String(a.enrollableCohortId) : null,
});

const sessionItem = (s) => ({
  id: String(s._id),
  topic: s.topic || (s.classId?.courseName || 'Session'),
  cohort: s.classId?.classCode || null,
  startTime: s.startTime,
  endTime: s.endTime,
  joinUrl: s.meetLink || s.roomLink || null,
});

// The learner's mobile feed: overdue + due-soon assignments, upcoming sessions,
// and a single "microlearning" nudge (the most urgent incomplete item).
const buildFeed = async (actor, now = new Date()) => {
  const [mine, sessions] = await Promise.all([
    assignmentUseCases.listMine(actor, now),
    repository.upcomingSessionsForUser(actor._id, now, 10),
  ]);

  const incomplete = mine.filter((a) => a.status !== 'complete');
  const soonCutoff = new Date(now.getTime() + DUE_SOON_DAYS * DAY);

  const overdue = incomplete
    .filter((a) => a.dueDate && new Date(a.dueDate) < now)
    .sort((x, y) => new Date(x.dueDate) - new Date(y.dueDate))
    .map(assignmentItem);

  const dueSoon = incomplete
    .filter((a) => a.dueDate && new Date(a.dueDate) >= now && new Date(a.dueDate) <= soonCutoff)
    .sort((x, y) => new Date(x.dueDate) - new Date(y.dueDate))
    .map(assignmentItem);

  // Microlearning nudge: the most urgent incomplete item (overdue → due-soon →
  // any incomplete). A single actionable "do this now".
  const nudge = overdue[0] || dueSoon[0] || (incomplete[0] ? assignmentItem(incomplete[0]) : null);

  return {
    generatedAt: now,
    pushEnabled: pushService.isConfigured(),
    overdue,
    dueSoon,
    upcomingSessions: sessions.map(sessionItem),
    microlearning: nudge,
  };
};

module.exports = { getVapidKey, subscribe, unsubscribe, buildFeed };
