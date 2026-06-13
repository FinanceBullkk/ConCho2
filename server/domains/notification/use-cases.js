const { ServiceError } = require('../../helpers/ServiceError');
const repository = require('./repository');
const { toFeedItem } = require('./dto');

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

module.exports = { listMine, markRead, markAllRead };
