jest.mock('../../domains/english-training/live-repository.pg', () => ({
  getCohortContext: jest.fn(),
  listCohortSessions: jest.fn(),
  listCohortEnrollments: jest.fn(),
  listAttendanceForCohort: jest.fn(),
}));

jest.mock('../../domains/evaluation/repository.pg', () => ({
  listEnglishLevelsForCohort: jest.fn(),
  upsertEnglishLevel: jest.fn(),
  findEnglishLevelById: jest.fn(),
  softDeleteById: jest.fn(),
}));

const liveRepository = require('../../domains/english-training/live-repository.pg');
const evaluationRepository = require('../../domains/evaluation/repository.pg');
const operations = require('../../domains/english-training/live-operations');

const actor = { _id: 'teacher-1', role: 'Teacher' };
const cohort = {
  id: 'cohort-1', category: 'english', status: 'Completed', teacherIds: ['teacher-1'],
  englishPolicySnapshot: {
    maxAbsencesAllowed: 2,
    absenceStatuses: ['A'],
    levelScale: [{ code: 'advanced', displayName: 'Advanced', order: 13 }],
  },
};
const sessions = [1, 2, 3].map((number) => ({ id: `session-${number}`, sessionNumber: number, status: 'completed' }));
const enrollment = { userId: 'learner-1', name: 'Learner', empCode: 'E001', startSessionNumber: 1 };

describe('live English final-level evaluation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    liveRepository.getCohortContext.mockResolvedValue(cohort);
    liveRepository.listCohortSessions.mockResolvedValue(sessions);
    liveRepository.listCohortEnrollments.mockResolvedValue([enrollment]);
    evaluationRepository.listEnglishLevelsForCohort.mockResolvedValue([]);
    evaluationRepository.upsertEnglishLevel.mockResolvedValue({ _id: 'evaluation-1', levelCode: 'advanced' });
  });

  test('records a categorical level at the two-absence boundary without scores', async () => {
    liveRepository.listAttendanceForCohort.mockResolvedValue([
      { scheduleId: 'session-1', userId: 'learner-1', status: 'A' },
      { scheduleId: 'session-2', userId: 'learner-1', status: 'A' },
      { scheduleId: 'session-3', userId: 'learner-1', status: 'P' },
    ]);

    await operations.recordEnglishLevel({
      cohortId: 'cohort-1', userId: 'learner-1', levelCode: 'advanced', note: '',
    }, actor);

    expect(evaluationRepository.upsertEnglishLevel).toHaveBeenCalledWith(
      'cohort-1', 'learner-1', expect.objectContaining({ levelCode: 'advanced', displayName: 'Advanced' }),
    );
    expect(evaluationRepository.upsertEnglishLevel.mock.calls[0][2]).not.toHaveProperty('score');
  });

  test('rejects a level when absences exceed the snapshot allowance', async () => {
    liveRepository.listAttendanceForCohort.mockResolvedValue(sessions.map((session) => ({
      scheduleId: session.id, userId: 'learner-1', status: 'A',
    })));

    await expect(operations.recordEnglishLevel({
      cohortId: 'cohort-1', userId: 'learner-1', levelCode: 'advanced',
    }, actor)).rejects.toMatchObject({ statusCode: 422 });
    expect(evaluationRepository.upsertEnglishLevel).not.toHaveBeenCalled();
  });

  test('denies an unassigned teacher before exposing the worklist', async () => {
    await expect(operations.getEvaluationWorklist('cohort-1', { _id: 'teacher-2', role: 'Teacher' }))
      .rejects.toMatchObject({ statusCode: 403 });
  });
});
