const Evaluation = require('../../models/Evaluation');

// evaluation-export-repository — MONGO impl (Phase 3 Wave-F).
// The pipeline SHAPE stays in evaluation-export.js (its buildEvaluationPipeline);
// this file isolates the model handle so the Postgres twin
// (./evaluation-export-repository.pg) swaps only this file. Same interface as
// ./evaluation-export-repository.pg.

const aggregate = (pipeline) => Evaluation.aggregate(pipeline);

module.exports = { aggregate };
