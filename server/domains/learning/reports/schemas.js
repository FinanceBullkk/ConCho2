const { z } = require('zod');
const { objectId } = require('../../../schemas/common');

// Completion report (and its export) is scoped to a single cohort.
const completionReportQuery = z.object({
  cohortId: objectId,
});

module.exports = { completionReportQuery };
