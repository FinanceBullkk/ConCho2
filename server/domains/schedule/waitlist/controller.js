const { handleError } = require('../../../helpers/handleError');
const auditService = require('../../../services/auditService');
const useCases = require('./use-cases');

// ── Waitlist controller (thin HTTP — envelope + audit only) ──

const join = async (req, res) => {
  try {
    const { entry, position } = await useCases.join(req.params.id, req.user);
    auditService.record({
      req,
      action: 'created',
      entity: 'WaitlistEntry',
      entityId: entry._id,
      diff: { after: { scheduleId: req.params.id, position } },
      note: 'Joined session waitlist',
    });
    res.status(201).json({ success: true, data: { ...entry.toObject(), position } });
  } catch (error) {
    handleError(res, error);
  }
};

const leave = async (req, res) => {
  try {
    const entry = await useCases.leave(req.params.id, req.user);
    auditService.record({
      req,
      action: 'updated',
      entity: 'WaitlistEntry',
      entityId: entry._id,
      diff: { before: { status: 'waiting' }, after: { status: 'withdrawn' } },
      note: 'Left session waitlist',
    });
    res.json({ success: true, message: 'Left the waitlist' });
  } catch (error) {
    handleError(res, error);
  }
};

const listForSchedule = async (req, res) => {
  try {
    const data = await useCases.listForSchedule(req.params.id, req.user);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

const listMine = async (req, res) => {
  try {
    const data = await useCases.listMine(req.user);
    res.json({ success: true, count: data.length, data });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { join, leave, listForSchedule, listMine };
