// Pure helpers for the offline attendance queue (no IndexedDB / DOM here, so
// they're unit-testable). The queue is keyed by (schedule, user) so re-marking
// the same learner overwrites the earlier mark — last-write-wins, mirroring the
// server's (scheduleId, userId) upsert.

export const markKey = (scheduleId, userId) => `${scheduleId}::${userId}`;

// Build the queue rows for a batch of marks on one schedule.
export const buildQueueRows = (scheduleId, records, queuedAt) =>
  records
    .filter((r) => r && r.userId && r.status)
    .map((r) => ({
      key: markKey(scheduleId, r.userId),
      scheduleId,
      userId: r.userId,
      status: r.status,
      queuedAt,
    }));

// Group flat queue rows back into per-schedule bulkMark payloads.
// → [{ scheduleId, keys: [...], records: [{ userId, status }] }]
export const groupBySchedule = (rows) => {
  const bySchedule = new Map();
  for (const row of rows) {
    if (!bySchedule.has(row.scheduleId)) {
      bySchedule.set(row.scheduleId, { scheduleId: row.scheduleId, keys: [], records: [] });
    }
    const group = bySchedule.get(row.scheduleId);
    group.keys.push(row.key);
    group.records.push({ userId: row.userId, status: row.status });
  }
  return [...bySchedule.values()];
};

// How many distinct learners are queued for a given schedule.
export const queuedCountForSchedule = (rows, scheduleId) =>
  rows.filter((r) => r.scheduleId === scheduleId).length;
