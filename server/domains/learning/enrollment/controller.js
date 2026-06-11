const auditService = require('../../../services/auditService');
const { handleError } = require('../../../helpers/handleError');
const useCases = require('./use-cases');
const { enrollmentDto } = require('./dto');

const list = async (req, res) => {
  try {
    const data = await useCases.list(req.query, req.user);
    res.json({ success: true, count: data.length, data: data.map(enrollmentDto) });
  } catch (error) {
    handleError(res, error);
  }
};

const enroll = async (req, res) => {
  try {
    const data = await useCases.enroll(req.body, req.user);
    auditService.record({
      req,
      action: 'created',
      entity: 'Enrollment',
      entityId: data._id,
      diff: { after: data },
      note: 'Cohort enrollment via learning API',
    });
    res.status(201).json({ success: true, data: enrollmentDto(data) });
  } catch (error) {
    handleError(res, error);
  }
};

const withdraw = async (req, res) => {
  try {
    const { before, after } = await useCases.withdraw(req.params.id, req.user);
    auditService.record({
      req,
      action: 'withdrew',
      entity: 'Enrollment',
      entityId: req.params.id,
      diff: auditService.diff(before, after),
      note: 'Cohort enrollment withdrawn via learning API',
    });
    res.json({ success: true, data: enrollmentDto(after) });
  } catch (error) {
    handleError(res, error);
  }
};

module.exports = { list, enroll, withdraw };
