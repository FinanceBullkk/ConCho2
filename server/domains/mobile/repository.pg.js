const crypto = require('crypto');
const { query } = require('../../config/pg');

// ──────────────────────────────────────────────────────────
// mobile/repository — POSTGRES impl. Same interface as ./repository.mongo.
// Web-Push subscription storage + the learner's upcoming enrolled sessions.
//
// Fidelity notes the parity test pins:
//   • upsertSubscription keys on the globally-unique endpoint (ON CONFLICT
//     re-homes the device to the current user); keys → jsonb.
//   • removeSubscription is a HARD delete (returns { deletedCount }).
//   • upcomingSessionsForUser: enrolled_users array-contains + scheduled +
//     start_time >= from, ordered start_time asc; populate('classId') → LEFT JOIN
//     classes AND is_deleted=false (a deleted/absent class → null).
//   • room_link/meet_link default '' (matching the Schedule model).
// ──────────────────────────────────────────────────────────

const newId = () => crypto.randomBytes(12).toString('hex');

const subRow = (r) => (r == null ? null : {
  _id: r.id, userId: r.user_id, endpoint: r.endpoint,
  keys: r.keys || {}, userAgent: r.user_agent || '',
  createdAt: r.created_at, updatedAt: r.updated_at,
});

// Upsert on endpoint — re-subscribing the same device updates user/keys/agent.
const upsertSubscription = async ({ userId, endpoint, keys, userAgent }) => {
  const { rows } = await query(
    `INSERT INTO push_subscriptions(id, user_id, endpoint, keys, user_agent)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys,
           user_agent = EXCLUDED.user_agent, updated_at = now()
     RETURNING *`,
    [newId(), String(userId), endpoint, JSON.stringify(keys || {}), userAgent || '']);
  return subRow(rows[0]);
};

const removeSubscription = async (userId, endpoint) => {
  const { rowCount } = await query(
    `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [String(userId), endpoint]);
  return { acknowledged: true, deletedCount: rowCount };
};

const upcomingSessionsForUser = async (userId, from, limit = 10) => {
  const { rows } = await query(
    `SELECT s.id, s.topic, s.start_time, s.end_time, s.class_id, s.room_link, s.meet_link,
            c.id AS c_id, c.class_code AS c_code, c.course_name AS c_course
       FROM schedules s
       LEFT JOIN classes c ON c.id = s.class_id AND c.is_deleted = false
      WHERE $1 = ANY(s.enrolled_users) AND s.status = 'scheduled' AND s.start_time >= $2
      ORDER BY s.start_time ASC LIMIT $3`,
    [String(userId), new Date(from).toISOString(), limit]);
  return rows.map((r) => ({
    _id: r.id, topic: r.topic, startTime: r.start_time, endTime: r.end_time,
    classId: r.c_id ? { _id: r.c_id, classCode: r.c_code, courseName: r.c_course } : null,
    roomLink: r.room_link || '', meetLink: r.meet_link || '',
  }));
};

module.exports = {
  upsertSubscription,
  removeSubscription,
  upcomingSessionsForUser,
};
