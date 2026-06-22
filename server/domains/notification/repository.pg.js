const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// notification/repository — POSTGRES impl. Same interface as ./repository.mongo.
// In-app bell read/mark surface over notification_logs + per-user preferences.
//
// Fidelity notes the parity test pins:
//   • the feed + unread count exclude status='pending' rows (transient).
//   • mark/markAll are self-scoped by recipient_user_id (the authorization).
//   • findUserPreferences/updateUserPreferences read/write users.notification_
//     preferences; a user with none set OMITS the key (Mongo default: undefined).
//   • NotificationLog has no soft-delete; User reads filter is_deleted=false.
// ──────────────────────────────────────────────────────────

const FEED_LIMIT = 20;

const logRow = (r) => (r == null ? null : {
  _id: r.id, type: r.type, channel: r.channel,
  recipientEmail: r.recipient_email || '', recipientUserId: r.recipient_user_id || null,
  assignmentId: r.assignment_id || null, learnerId: r.learner_id || null,
  cadenceKey: r.cadence_key, status: r.status, sentAt: r.sent_at, readAt: r.read_at,
  error: r.error || '', metadata: r.metadata || {},
  createdAt: r.created_at, updatedAt: r.updated_at,
});

// A user with no preferences set omits the key (Mongo `default: undefined`).
const prefRow = (r) => {
  if (r == null) return null;
  const out = { _id: r.id };
  if (r.notification_preferences != null) out.notificationPreferences = r.notification_preferences;
  return out;
};

const findForUser = async (userId, limit = FEED_LIMIT) => {
  const { rows } = await query(
    `SELECT * FROM notification_logs WHERE recipient_user_id = $1 AND status <> 'pending'
      ORDER BY created_at DESC LIMIT $2`, [String(userId), limit]);
  return rows.map(logRow);
};

const countUnreadForUser = async (userId) => {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM notification_logs
      WHERE recipient_user_id = $1 AND status <> 'pending' AND read_at IS NULL`, [String(userId)]);
  return rows[0].n;
};

// Self-scoped: the recipient_user_id predicate is the authorization. Idempotent.
const markRead = async (id, userId) => {
  const { rows } = await query(
    `UPDATE notification_logs SET read_at = now(), updated_at = now()
      WHERE id = $1 AND recipient_user_id = $2 RETURNING *`, [String(id), String(userId)]);
  return rows[0] ? logRow(rows[0]) : null;
};

const markAllReadForUser = async (userId) => {
  const { rowCount } = await query(
    `UPDATE notification_logs SET read_at = now(), updated_at = now()
      WHERE recipient_user_id = $1 AND read_at IS NULL`, [String(userId)]);
  return rowCount || 0;
};

const findUserPreferences = async (userId) => {
  const { rows } = await query(
    `SELECT id, notification_preferences FROM users WHERE id = $1 AND is_deleted = false`, [String(userId)]);
  return rows[0] ? prefRow(rows[0]) : null;
};

const updateUserPreferences = async (userId, prefs) => {
  const { rows } = await query(
    `UPDATE users SET notification_preferences = $2, updated_at = now()
      WHERE id = $1 AND is_deleted = false RETURNING id, notification_preferences`,
    [String(userId), prefs == null ? null : JSON.stringify(prefs)]);
  return rows[0] ? prefRow(rows[0]) : null;
};

module.exports = {
  findForUser, countUnreadForUser, markRead, markAllReadForUser, FEED_LIMIT,
  findUserPreferences, updateUserPreferences,
};
