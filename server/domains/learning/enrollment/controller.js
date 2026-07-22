const auditService = require('../../../services/auditService');
const { handleError } = require('../../../helpers/handleError');
const useCases = require('./use-cases');
const { enrollmentDto, myEnrollmentDto } = require('./dto');

const list = async (req, res) => {
  try {
    const data = await useCases.list(req.query, req.user);
    res.json({ success: true, count: data.length, data: data.map(enrollmentDto) });
  } catch (error) {
    handleError(res, error);
  }
};

// GET /api/learning/enrollments/mine — unified self read (converge Phase 2):
// the caller's enrollments across BOTH modes (team-based + cohort-based) in one
// shape. Self-scoped in the use-case; no query params.
const listMine = async (req, res) => {
  try {
    const data = await useCases.getMyEnrollments(req.user);
    res.json({ success: true, count: data.length, data: data.map(myEnrollmentDto) });
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

const bulkEnroll = async (req, res) => {
  try {
    const { cohortId, userIds, startSessionNumber } = req.body;
    const { enrolled, skipped } = await useCases.bulkEnroll({ cohortId, userIds, startSessionNumber }, req.user);
    // One batch audit entry — the per-learner ids + skip reasons are the record.
    auditService.record({
      req,
      action: 'bulk-enrolled',
      entity: 'Enrollment',
      entityId: cohortId,
      diff: { after: { cohortId, startSessionNumber: startSessionNumber || null, enrolled: enrolled.map((e) => String(e.userId)), skipped } },
      note: `Bulk cohort enrollment via learning API (${enrolled.length} enrolled, ${skipped.length} skipped)`,
    });
    res.status(201).json({
      success: true,
      count: enrolled.length,
      data: { enrolledCount: enrolled.length, skipped },
    });
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

module.exports = { list, listMine, enroll, bulkEnroll, withdraw };
