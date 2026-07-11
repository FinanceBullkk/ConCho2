// Dual-backend NotificationLog write seam (Phase 5 slice 3 — A6).
const notificationRepo = require('../../notification/repository');
// PG-only runtime (Wave K D2d-0) — the manager-digest learner lookup used to run
// via Mongoose `User.find().populate('managerId')`, reading the empty Mongo.
const { query } = require('../../../config/pg');
const logger = require('../../../lib/logger');
const {
  sendAssignmentDueSoon,
  sendAssignmentOverdue,
  sendManagerAssignmentDigest,
} = require('../../../lib/emailTemplates');
const repository = require('./repository');
const { resolveAssignmentStatuses } = require('./status-resolver');
const {
  daysBetweenUtcDates,
  getLearnerCadence,
  getManagerDigestCadenceKey,
} = require('./reminder-cadence');

const baseSummary = () => ({
  assignmentsScanned: 0,
  learnersScanned: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
  duplicates: 0,
  managerDigests: 0,
});

const targetName = (assignment) => {
  const target = assignment.targetType === 'path' ? assignment.pathId : assignment.programId;
  return target?.name || target?.title || target?.code || 'training';
};

const createLog = async (data) => {
  try {
    return await notificationRepo.insertLog(data);
  } catch (error) {
    if (error && error.code === 11000) return null;
    throw error;
  }
};

const finishLog = (id, patch) =>
  notificationRepo.updateLogById(
    id,
    patch.status === 'sent' ? { ...patch, sentAt: new Date() } : patch,
  );

const daysOverdueFor = (dueDate, now) => Math.abs(daysBetweenUtcDates(now, dueDate));

const notifyLearner = async ({ assignment, row, cadence, summary }) => {
  const learner = row.learner;
  const log = await createLog({
    type: cadence.type,
    channel: 'email',
    recipientEmail: learner.email || '',
    recipientUserId: learner._id,
    assignmentId: assignment._id,
    learnerId: learner._id,
    cadenceKey: cadence.cadenceKey,
    status: learner.email ? 'pending' : 'skipped',
    error: learner.email ? '' : 'recipient email missing',
    metadata: {
      assignmentTitle: assignment.title,
      targetName: targetName(assignment),
      dueDate: assignment.dueDate,
      daysUntil: cadence.daysUntil,
      daysOverdue: cadence.daysOverdue,
    },
  });
  if (!log) { summary.duplicates += 1; return; }
  if (!learner.email) { summary.skipped += 1; return; }

  const payload = {
    to: learner.email,
    userName: learner.name,
    assignmentTitle: assignment.title,
    targetName: targetName(assignment),
    dueDate: assignment.dueDate,
    daysUntil: cadence.daysUntil,
    daysOverdue: cadence.daysOverdue,
  };
  const result = cadence.type === 'assignment_overdue'
    ? await sendAssignmentOverdue(payload)
    : await sendAssignmentDueSoon(payload);

  if (result) {
    await finishLog(log._id, { status: 'sent', error: '' });
    summary.sent += 1;
    return;
  }

  await finishLog(log._id, { status: 'failed', error: 'email not sent' });
  summary.failed += 1;
};

const loadManagerDigestRows = async (entries) => {
  if (!entries.length) return new Map();
  const learnerIds = [...new Set(entries.map((entry) => entry.row.learner._id.toString()))];
  const { rows: userRows } = await query(
    `SELECT u.id, u.name, u.emp_code, u.email,
            m.id AS m_id, m.name AS m_name, m.email AS m_email
       FROM users u
       LEFT JOIN users m ON m.id = u.manager_id
      WHERE u.id = ANY($1)`,
    [learnerIds],
  );
  const users = userRows.map((r) => ({
    _id: r.id, name: r.name, empCode: r.emp_code, email: r.email,
    managerId: r.m_id ? { _id: r.m_id, name: r.m_name, email: r.m_email } : null,
  }));
  const byId = new Map(users.map((user) => [user._id.toString(), user]));
  const byManager = new Map();

  for (const entry of entries) {
    const user = byId.get(entry.row.learner._id.toString());
    const manager = user?.managerId;
    if (!manager) continue;
    const key = manager._id.toString();
    if (!byManager.has(key)) byManager.set(key, { manager, rows: [] });
    byManager.get(key).rows.push({
      learnerName: user.name,
      learnerEmpCode: user.empCode,
      assignmentTitle: entry.assignment.title,
      targetName: targetName(entry.assignment),
      dueDate: entry.assignment.dueDate,
      daysOverdue: entry.daysOverdue,
    });
  }
  return byManager;
};

const notifyManagers = async ({ overdueEntries, now, summary }) => {
  const cadenceKey = getManagerDigestCadenceKey(now);
  const byManager = await loadManagerDigestRows(overdueEntries);

  for (const { manager, rows } of byManager.values()) {
    const log = await createLog({
      type: 'manager_assignment_digest',
      channel: 'email',
      recipientEmail: manager.email || '',
      recipientUserId: manager._id,
      assignmentId: null,
      learnerId: null,
      cadenceKey,
      status: manager.email ? 'pending' : 'skipped',
      error: manager.email ? '' : 'recipient email missing',
      metadata: { learnerCount: rows.length },
    });
    if (!log) { summary.duplicates += 1; continue; }
    if (!manager.email) { summary.skipped += 1; continue; }

    const result = await sendManagerAssignmentDigest({
      to: manager.email,
      managerName: manager.name,
      rows,
    });
    if (result) {
      await finishLog(log._id, { status: 'sent', error: '' });
      summary.sent += 1;
      summary.managerDigests += 1;
      continue;
    }
    await finishLog(log._id, { status: 'failed', error: 'email not sent' });
    summary.failed += 1;
  }
};

const sendAssignmentReminders = async ({ now = new Date() } = {}) => {
  const summary = baseSummary();
  const assignments = await repository.list({ status: 'active' });
  summary.assignmentsScanned = assignments.length;
  const overdueEntries = [];

  for (const assignment of assignments) {
    // eslint-disable-next-line no-await-in-loop -- bounded by active assignment count
    const rows = await resolveAssignmentStatuses(assignment, now);
    summary.learnersScanned += rows.length;
    for (const row of rows) {
      if (row.status === 'complete') continue;
      if (row.status === 'overdue') {
        overdueEntries.push({
          assignment,
          row,
          daysOverdue: daysOverdueFor(assignment.dueDate, now),
        });
      }
      const cadence = getLearnerCadence({ dueDate: assignment.dueDate, now });
      if (!cadence) continue;
      // eslint-disable-next-line no-await-in-loop -- idempotent sends keep ordering predictable
      await notifyLearner({ assignment, row, cadence, summary });
    }
  }

  await notifyManagers({ overdueEntries, now, summary });
  logger.info(summary, 'Assignment reminder batch complete');
  return summary;
};

module.exports = { sendAssignmentReminders };
