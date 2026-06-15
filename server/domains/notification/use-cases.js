const { ServiceError } = require('../../helpers/ServiceError');
const repository = require('./repository');
const { toFeedItem } = require('./dto');
const { mergePreferences } = require('./schemas');

// In-app notification bell (Cohesion P5). Every use-case is scoped to the
// caller (`user._id`) — there is no cross-user read by design.

const listMine = async (user) => {
  const [rows, unreadCount] = await Promise.all([
    repository.findForUser(user._id),
    repository.countUnreadForUser(user._id),
  ]);
  return { items: rows.map(toFeedItem), unreadCount };
};

const markRead = async (id, user) => {
  const row = await repository.markRead(id, user._id);
  if (!row) throw new ServiceError('Notification not found', 404);
  return toFeedItem(row);
};

const markAllRead = async (user) => {
  const updated = await repository.markAllReadForUser(user._id);
  return { updated };
};

// Read the caller's delivery preferences, merged over server defaults.
const getPreferences = async (user) => {
  const row = await repository.findUserPreferences(user._id);
  return mergePreferences(row?.notificationPreferences);
};

// Patch the caller's preferences (partial — categories/digest merge over
// current). Returns before/after so the controller can audit the diff.
const setPreferences = async (user, body) => {
  const before = mergePreferences((await repository.findUserPreferences(user._id))?.notificationPreferences);
  const after = {
    categories: { ...before.categories, ...(body.categories || {}) },
    digest: body.digest || before.digest,
  };
  await repository.updateUserPreferences(user._id, after);
  return { before, after };
};

module.exports = { listMine, markRead, markAllRead, getPreferences, setPreferences };
