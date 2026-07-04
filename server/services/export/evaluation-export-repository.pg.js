const { query } = require('../../config/pg');

// evaluation-export-repository — POSTGRES impl (Phase 3 Wave-F).
// Same interface as ./evaluation-export-repository.mongo — a single `aggregate`
// function. There is exactly ONE production caller of that function:
// evaluation-export.js's queryEvaluationData(opts), which always builds the
// pipeline via buildEvaluationPipeline(opts) (a fixed shape: an optional
// $match on {classId, updatedAt:{$gte,$lte}}, then joins/project/sort — see
// that file). This impl does NOT interpret an arbitrary Mongo aggregation
// pipeline (that's genuinely not portable in general); it recovers the ONE
// {classId, from, to} triple that shape always encodes and runs the SQL
// equivalent of the same join. `assertKnownShape` fails loudly (rather than
// silently mis-querying) if evaluation-export.js's pipeline shape ever grows
// a stage this parser doesn't recognise — that file is out of this port's file
// ownership, so this is the fail-fast guard against silent drift.
//
// Fidelity notes the parity test pins:
//   • user join is INNER (Mongo $unwind '$user', no preserveNullAndEmptyArrays)
//     — a soft-deleted/missing user drops the evaluation row entirely.
//   • class join is LEFT (Mongo $unwind preserveNullAndEmptyArrays: true) — a
//     soft-deleted/missing class keeps the row, just with null classCode/courseName.
//   • averageScore is computed the same way as the $divide stage (unrounded —
//     the workbook layer rounds for display).
//   • sort: classCode ASC, empCode ASC — Mongo's ascending sort treats a
//     missing/null field as sorting BEFORE real values (BSON type order), so
//     NULLS FIRST is explicit here (Postgres ASC default is NULLS LAST).
//   • score columns are `double precision` → node-pg already returns JS
//     numbers (not the numeric/string case), Number() kept as a defensive cast.

const KNOWN_STAGES = new Set(['$match', '$lookup', '$unwind', '$project', '$sort']);
const assertKnownShape = (pipeline) => {
  if (!Array.isArray(pipeline)) {
    throw new Error('evaluation-export-repository.pg: expected a pipeline array from buildEvaluationPipeline');
  }
  for (const stage of pipeline) {
    const key = stage && Object.keys(stage)[0];
    if (!KNOWN_STAGES.has(key)) {
      throw new Error(
        `evaluation-export-repository.pg: unrecognised pipeline stage "${key}" — buildEvaluationPipeline's ` +
        'shape changed; update the {classId,from,to} parser in this file to match.',
      );
    }
  }
};

// Recover the {classId, from, to} opts triple that buildEvaluationPipeline
// always encodes into its (optional) leading $match stage.
const parseOpts = (pipeline) => {
  const matchStage = pipeline.find((s) => s && s.$match);
  const m = (matchStage && matchStage.$match) || {};
  const updatedAt = m.updatedAt || {};
  return {
    classId: m.classId == null ? null : String(m.classId),
    from: updatedAt.$gte == null ? null : updatedAt.$gte,
    to: updatedAt.$lte == null ? null : updatedAt.$lte,
  };
};

const evalRow = (r) => {
  const grammar = Number(r.grammar_score);
  const vocabulary = Number(r.vocabulary_score);
  const pronunciation = Number(r.pronunciation_score);
  const fluency = Number(r.fluency_score);
  const row = {
    _id: r.id,
    empCode: r.emp_code,
    userName: r.user_name,
    department: r.department,
    level: r.level,
    grammarScore: grammar,
    vocabularyScore: vocabulary,
    pronunciationScore: pronunciation,
    fluencyScore: fluency,
    averageScore: (grammar + vocabulary + pronunciation + fluency) / 4,
    teacherComment: r.teacher_comment,
    updatedAt: r.updated_at,
  };
  // Mongo's $project on '$class.classCode' OMITS the key entirely when the
  // preceding $unwind left `class` absent (preserveNullAndEmptyArrays on a
  // join-miss) — it does NOT set it to null. Mirror that exactly (rather than
  // always emitting classCode:null) so a plain() deep-equal against the Mongo
  // lean() row holds key-for-key, not just value-for-value.
  if (r.c_id != null) {
    row.classCode = r.class_code;
    row.courseName = r.course_name;
  }
  return row;
};

const aggregate = async (pipeline) => {
  assertKnownShape(pipeline);
  const { classId, from, to } = parseOpts(pipeline);

  const conds = ['e.is_deleted = false'];
  const args = [];
  if (classId) { args.push(classId); conds.push(`e.class_id = $${args.length}`); }
  if (from) { args.push(from); conds.push(`e.updated_at >= $${args.length}`); }
  if (to) { args.push(to); conds.push(`e.updated_at <= $${args.length}`); }

  const { rows } = await query(
    `SELECT e.id, u.emp_code AS emp_code, u.name AS user_name, u.department AS department,
            c.id AS c_id, c.class_code AS class_code, c.course_name AS course_name,
            e.level, e.grammar_score, e.vocabulary_score, e.pronunciation_score, e.fluency_score,
            e.teacher_comment, e.updated_at
       FROM evaluations e
       JOIN users u ON u.id = e.user_id AND u.is_deleted = false
       LEFT JOIN classes c ON c.id = e.class_id AND c.is_deleted = false
      WHERE ${conds.join(' AND ')}
      ORDER BY class_code ASC NULLS FIRST, emp_code ASC NULLS FIRST`,
    args,
  );
  return rows.map(evalRow);
};

module.exports = { aggregate };
