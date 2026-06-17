const Evaluation = require('../../models/Evaluation');

// evaluation-export-repository — Mongoose execution for the evaluation export.
// The pipeline SHAPE stays in evaluation-export.js (it gets rewritten to SQL at
// the Postgres port); this file isolates the model handle (Phase 0 readiness).

const aggregate = (pipeline) => Evaluation.aggregate(pipeline);

module.exports = { aggregate };
