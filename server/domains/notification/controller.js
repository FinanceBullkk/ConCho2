const { handleError } = require('../../helpers/handleError');
const auditService = require('../../services/auditService');
const useCases = require('./use-cases');

// Thin handlers. Marking a notification read is the caller's own UI state
// (not a domain mutation), so it is intentionally NOT audit-logged — auditing
// every bell interaction would be pure noise.

const listMine = async (req, res) => {
  try {
    const { items, unreadCount } = await useCases.listMine(req.user);
    res.json({ success: true, count: items.length, unreadCount, data: items });
  } catch (error) {
    handleError(res, error);
  }
};

const markRead = async (req, res) => {
  try {
    const data = await useCases.markRead(req.params.id, req.user);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const markAllRead = async (req, res) => {
  try {
    const data = await useCases.markAllRead(req.user);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const getPreferences = async (req, res) => {
  try {
    const data = await useCases.getPreferences(req.user);
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const setPreferences = async (req, res) => {
  try {
    const { before, after } = await useCases.setPreferences(req.user, req.body);
    auditService.record({
      req,
      action: 'updated',
      entity: 'User',
      entityId: req.user._id,
      diff: auditService.diff({ notificationPreferences: before }, { notificationPreferences: after }),
      note: 'Notification preferences updated',
    });
    res.json({ success: true, data: after });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { listMine, markRead, markAllRead, getPreferences, setPreferences };
