const { handleError } = require('../../helpers/handleError');
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

module.exports = { listMine, markRead, markAllRead };
