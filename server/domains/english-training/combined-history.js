const repository = require('./repository.pg');
const { ServiceError } = require('../../helpers/ServiceError');

const normalizeRow = (row, cutoverAt) => ({
  source: row.source,
  sourceIdentity: row.source_identity,
  empCode: row.emp_code,
  programCode: row.program_code,
  englishGroupCode: row.english_group_code,
  cohortRunCode: row.cohort_run_code,
  sessionNumber: row.session_number == null ? null : Number(row.session_number),
  eventDate: row.event_date,
  attendanceStatus: row.attendance_status || null,
  levelCode: row.level_code || null,
  naturalKey: row.natural_key,
  cutoverAt,
});

// The temporal boundary chooses the eligible source. The natural key then
// collapses any duplicated evidence; live wins a cross-source duplicate because
// it is the authoritative write model at/after cutover.
const mergeCutoverRows = (rows, cutoverAt) => {
  const boundary = new Date(cutoverAt).getTime();
  const eligible = rows.filter((row) => {
    const at = new Date(row.eventDate ?? row.event_date).getTime();
    return row.source === 'archive' ? at < boundary : at >= boundary;
  });
  const byKey = new Map();
  for (const row of eligible) {
    const key = row.naturalKey || row.natural_key;
    const existing = byKey.get(key);
    if (!existing || (existing.source === 'archive' && row.source === 'live')) byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => (
    new Date(a.eventDate ?? a.event_date) - new Date(b.eventDate ?? b.event_date)
  ));
};

const getCombinedHistory = async () => {
  const state = await repository.getArchiveState();
  if (!state.isFrozen || !state.cutoverAt) {
    throw new ServiceError('Combined English history is available after archive cutover', 409);
  }
  const [archiveAttendance, liveAttendance, archiveEvaluations, liveEvaluations] = await Promise.all([
    repository.listArchiveAttendanceHistory(),
    repository.listLiveAttendanceHistory(),
    repository.listArchiveEvaluationHistory(),
    repository.listLiveEvaluationHistory(),
  ]);
  const attendance = mergeCutoverRows([
    ...archiveAttendance.map((row) => normalizeRow(row, state.cutoverAt)),
    ...liveAttendance.map((row) => normalizeRow(row, state.cutoverAt)),
  ], state.cutoverAt);
  const evaluations = mergeCutoverRows([
    ...archiveEvaluations.map((row) => normalizeRow(row, state.cutoverAt)),
    ...liveEvaluations.map((row) => normalizeRow(row, state.cutoverAt)),
  ], state.cutoverAt);
  return {
    cutoverAt: state.cutoverAt,
    attendance,
    evaluations,
    summary: { attendanceRows: attendance.length, evaluationRows: evaluations.length },
  };
};

module.exports = { mergeCutoverRows, getCombinedHistory };
