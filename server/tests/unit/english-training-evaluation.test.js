jest.mock('../../domains/english-training/repository.pg', () => ({
  withTransaction: jest.fn((fn) => fn({ tx: true })),
  getEnrollmentForExam: jest.fn(),
  getLevelByCode: jest.fn(),
  getActiveExamResult: jest.fn(),
  upsertExamResult: jest.fn(),
  softDeleteActiveExamResult: jest.fn(),
}));

const repo = require('../../domains/english-training/repository.pg');
const { recordExamResult, deleteExamResult } = require('../../domains/english-training/evaluation');
const { examResultBody } = require('../../domains/english-training/schemas');

describe('English-training exam result (evaluation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repo.getEnrollmentForExam.mockResolvedValue({
      id: 'en1', enrollment_status: 'completed', run_status: 'completed', absence_count: 1,
    });
    repo.getLevelByCode.mockResolvedValue({ code: 'advanced', display_name: 'Advanced', rank: 13 });
    repo.getActiveExamResult.mockResolvedValue(null);
    repo.upsertExamResult.mockResolvedValue({
      result: { id: 'x1', run_enrollment_id: 'en1', level_code: 'advanced', exam_date: '2026-07-01' },
      created: true,
    });
  });

  test('records a level when the learner is eligible (≤2 absences)', async () => {
    const out = await recordExamResult({
      runEnrollmentId: 'en1', levelCode: 'advanced', examDate: '2026-07-01', actor: { _id: 'admin-1' },
    });

    expect(repo.upsertExamResult).toHaveBeenCalledWith(
      expect.objectContaining({ enrollmentId: 'en1', levelCode: 'advanced', enteredBy: 'admin-1' }),
      { tx: true },
    );
    expect(out).toEqual(expect.objectContaining({ created: true, after: { levelCode: 'advanced', examDate: '2026-07-01' } }));
  });

  test('blocks with 422 when the learner has more than 2 absences', async () => {
    repo.getEnrollmentForExam.mockResolvedValue({
      id: 'en1', enrollment_status: 'completed', run_status: 'completed', absence_count: 3,
    });
    await expect(recordExamResult({ runEnrollmentId: 'en1', levelCode: 'advanced', examDate: '2026-07-01' }))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(repo.upsertExamResult).not.toHaveBeenCalled();
  });

  test('blocks with 422 when the enrollment status cannot sit (e.g. dropped)', async () => {
    repo.getEnrollmentForExam.mockResolvedValue({
      id: 'en1', enrollment_status: 'dropped', run_status: 'completed', absence_count: 0,
    });
    await expect(recordExamResult({ runEnrollmentId: 'en1', levelCode: 'advanced', examDate: '2026-07-01' }))
      .rejects.toMatchObject({ statusCode: 422 });
    expect(repo.upsertExamResult).not.toHaveBeenCalled();
  });

  test('rejects an unknown level with 400', async () => {
    repo.getLevelByCode.mockResolvedValue(null);
    await expect(recordExamResult({ runEnrollmentId: 'en1', levelCode: 'nope', examDate: '2026-07-01' }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(repo.upsertExamResult).not.toHaveBeenCalled();
  });

  test('returns 404 when the enrollment does not exist', async () => {
    repo.getEnrollmentForExam.mockResolvedValue(null);
    await expect(recordExamResult({ runEnrollmentId: 'none', levelCode: 'advanced', examDate: '2026-07-01' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  test('soft-deletes an active result, or 404 when there is none', async () => {
    repo.softDeleteActiveExamResult.mockResolvedValue({ level_code: 'advanced', exam_date: '2026-07-01' });
    const out = await deleteExamResult({ runEnrollmentId: 'en1' });
    expect(out.before).toEqual({ levelCode: 'advanced', examDate: '2026-07-01' });

    repo.softDeleteActiveExamResult.mockResolvedValue(null);
    await expect(deleteExamResult({ runEnrollmentId: 'en1' })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('validation guards the exam-result body shape', () => {
    expect(examResultBody.safeParse({ levelCode: 'advanced', examDate: '2026-07-01' }).success).toBe(true);
    expect(examResultBody.safeParse({ levelCode: 'advanced', examDate: '01/07/2026' }).success).toBe(false);
    expect(examResultBody.safeParse({ examDate: '2026-07-01' }).success).toBe(false);
    expect(examResultBody.safeParse({ levelCode: 'Bad Code', examDate: '2026-07-01' }).success).toBe(false);
  });
});
