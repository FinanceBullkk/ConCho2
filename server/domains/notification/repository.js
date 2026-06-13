const NotificationLog = require('../../models/NotificationLog');

// All Mongoose access for the in-app notification bell (Cohesion P5).
// Read surface over the existing email NotificationLog — self-scoped by
// recipientUserId at every call. `pending` rows are transient (upserted then
// immediately resolved within the sending job) so they are excluded from the
// feed and the unread count.

const FEED_LIMIT = 20;
const visible = (userId) => ({ recipientUserId: userId, status: { $ne: 'pending' } });

const findForUser = (userId, limit = FEED_LIMIT) =>
  NotificationLog.find(visible(userId)).sort({ createdAt: -1 }).limit(limit).lean();

const countUnreadForUser = (userId) =>
  NotificationLog.countDocuments({ ...visible(userId), readAt: null });

// Self-scoped: the recipientUserId predicate is the authorization — another
// user's id can never match. Idempotent (re-marking a read row returns it).
const markRead = (id, userId) =>
  NotificationLog.findOneAndUpdate(
    { _id: id, recipientUserId: userId },
    { $set: { readAt: new Date() } },
    { new: true },
  ).lean();

const markAllReadForUser = async (userId) => {
  const res = await NotificationLog.updateMany(
    { recipientUserId: userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return res.modifiedCount || 0;
};

module.exports = { findForUser, countUnreadForUser, markRead, markAllReadForUser, FEED_LIMIT };
