// English-training evaluation use-cases (Phase 3). A finished learner sits a
// final exam whose result IS a level. Sitting is gated by the Course Run's
// snapshotted attendance ratio. HR/Admin records the level; the gate
// is enforced here (server-side), not just in the UI. Soft-delete keeps history.

const repo = require('./repository.pg');
const { ServiceError } = require('../../helpers/ServiceError');

// Only participating learners can receive an exam level (not waiting/dropped/etc).
const SITTABLE_ENROLLMENT_STATUSES = ['active', 'completed'];

async function recordExamResult({ runEnrollmentId, levelCode, examDate, note, actor }) {
  await repo.assertArchiveWritable();
  return repo.withTransaction(async (client) => {
    const enrollment = await repo.getEnrollmentForExam(runEnrollmentId, client);
    if (!enrollment) throw new ServiceError('English-training enrollment not found', 404);

    if (!SITTABLE_ENROLLMENT_STATUSES.includes(enrollment.enrollment_status)) {
      throw new ServiceError(
        `Enrollment status "${enrollment.enrollment_status}" cannot sit the exam`, 422,
      );
    }
    if (enrollment.marked_count === 0) {
      throw new ServiceError('Not eligible to sit the exam (attendance is not recorded)', 422);
    }
    if (Number(enrollment.attendance_ratio) < Number(enrollment.attendance_threshold_ratio_snapshot)) {
      throw new ServiceError(
        `Not eligible to sit the exam (attendance is below ${Math.round(Number(enrollment.attendance_threshold_ratio_snapshot) * 100)}%)`, 422,
      );
    }

    const level = await repo.getLevelByCode(levelCode, client);
    if (!level) throw new ServiceError(`Unknown level "${levelCode}"`, 400);

    const previous = await repo.getActiveExamResult(runEnrollmentId, client);
    const enteredBy = actor?._id ? String(actor._id) : null;
    const { result, created } = await repo.upsertExamResult(
      { enrollmentId: runEnrollmentId, levelCode, examDate, note, enteredBy }, client,
    );

    return {
      created,
      before: previous ? { levelCode: previous.level_code, examDate: previous.exam_date } : null,
      after: { levelCode: result.level_code, examDate: result.exam_date },
      result,
    };
  });
}

async function deleteExamResult({ runEnrollmentId }) {
  await repo.assertArchiveWritable();
  return repo.withTransaction(async (client) => {
    const removed = await repo.softDeleteActiveExamResult(runEnrollmentId, client);
    if (!removed) throw new ServiceError('No exam result to delete', 404);
    return {
      before: { levelCode: removed.level_code, examDate: removed.exam_date },
      after: null,
    };
  });
}

module.exports = { recordExamResult, deleteExamResult };
