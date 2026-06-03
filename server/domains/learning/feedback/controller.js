const auditService = require('../../../services/auditService');
const { handleError } = require('../../../helpers/handleError');
const useCases = require('./use-cases');
const { feedbackDto } = require('./dto');

const submitFeedback = async (req, res) => {
  try {
    const { feedback, created, before } = await useCases.submitFeedback(req.body, req.user);
    auditService.record({
      req,
      action: created ? 'created' : 'updated',
      entity: 'Feedback',
      entityId: feedback._id,
      diff: created
        ? { after: { cohortId: feedback.cohortId, userId: feedback.userId, rating: feedback.rating } }
        : auditService.diff(before, feedback),
      note: 'Cohort feedback submitted',
    });
    res.status(created ? 201 : 200).json({ success: true, data: feedbackDto(feedback) });
  } catch (error) {
    handleError(res, error);
  }
};

const listFeedback = async (req, res) => {
  try {
    const items = await useCases.listFeedback(req.query, req.user);
    res.json({ success: true, count: items.length, data: items.map(feedbackDto) });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { submitFeedback, listFeedback };
