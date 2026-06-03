const auditService = require('../../../services/auditService');
const { handleError } = require('../../../helpers/handleError');
const { parsePagination, paginatedResponse } = require('../../../helpers/pagination');
const { invalidateAnalyticsCache } = require('../../../middleware/analyticsCache');
const useCases = require('./use-cases');

const listSessions = async (req, res) => {
  try {
    const pagination = parsePagination(req);
    const { data, total } = await useCases.listSessions(req.query, pagination, req.user);
    res.json(paginatedResponse({ data, total, page: pagination.page, limit: pagination.limit }));
  } catch (error) {
    handleError(res, error);
  }
};

const getSession = async (req, res) => {
  try {
    const data = await useCases.getSession(req.params.id, req.user);
    if (!data) return res.status(404).json({ success: false, message: 'Session not found' });
    res.json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const bookSession = async (req, res) => {
  try {
    const data = await useCases.bookSession(req.body, req.user);
    auditService.record({
      req,
      action: 'created',
      entity: 'Schedule',
      entityId: data.scheduleId,
      diff: {
        after: {
          cohortId: data.cohortId,
          groupId: data.groupId,
          startTime: data.startTime,
          endTime: data.endTime,
          enrolledLearnerCount: data.enrolledLearnerCount,
        },
      },
      note: req.body.cohortId
        ? 'Cohort session scheduled through learning session API'
        : 'Booked through learning session API',
    });
    invalidateAnalyticsCache();
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleError(res, error);
  }
};

const cancelSession = async (req, res) => {
  try {
    await useCases.cancelSession(req.params.id, req.user);
    auditService.record({
      req,
      action: 'cancelled',
      entity: 'Schedule',
      entityId: req.params.id,
      note: 'Cancelled through learning session API',
    });
    invalidateAnalyticsCache();
    res.json({ success: true, message: 'Session cancelled and removed' });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = {
  listSessions,
  getSession,
  bookSession,
  cancelSession,
};
