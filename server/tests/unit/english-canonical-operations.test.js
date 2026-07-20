jest.mock('../../domains/english-training/canonical-operations-repository.pg', () => ({
  newId: jest.fn(),
  withTransaction: jest.fn(),
  findActiveCourse: jest.fn(),
  createCohort: jest.fn(),
  createPicAssignment: jest.fn(),
  createCourseRun: jest.fn(),
  recordAudit: jest.fn(),
}));

const repository = require('../../domains/english-training/canonical-operations-repository.pg');
const { createClassCourseRun, normalizeLabel } = require('../../domains/english-training/canonical-operations');

describe('canonical English class command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repository.withTransaction.mockImplementation((work) => work({ query: jest.fn() }));
    repository.newId
      .mockReturnValueOnce('cohort-1')
      .mockReturnValueOnce('pic-1')
      .mockReturnValueOnce('run-1');
    repository.findActiveCourse.mockResolvedValue({
      id: 'course-1', expected_units: 20, max_absences_allowed: 2,
      attendance_threshold_ratio: '0.800',
    });
  });

  test('creates stable class, current PIC and run 1 in one transaction with domain audits', async () => {
    const result = await createClassCourseRun({
      classCode: ' el900 ', displayName: '  English   Alpha ', courseId: 'course-1',
      startDate: '2026-07-20', capacity: 12, status: 'active', picLabel: '  People   Team ',
    }, { _id: 'actor-1', empCode: 'A001' });

    expect(result).toEqual({ cohortId: 'cohort-1', picAssignmentId: 'pic-1', courseRunId: 'run-1', runNumber: 1 });
    expect(repository.createCohort).toHaveBeenCalledWith(expect.objectContaining({
      classCode: 'EL900', displayName: 'English Alpha', capacity: 12,
    }), expect.anything());
    expect(repository.createPicAssignment).toHaveBeenCalledWith(expect.objectContaining({
      cohortId: 'cohort-1', picEmployeeId: null, picLabel: 'People Team',
    }), expect.anything());
    expect(repository.createCourseRun).toHaveBeenCalledWith(expect.objectContaining({
      cohortId: 'cohort-1', courseId: 'course-1', attendanceThresholdRatio: '0.800',
    }), expect.anything());
    expect(repository.recordAudit).toHaveBeenCalledTimes(3);
  });

  test('rejects partial class creation when PIC is missing before opening a transaction', async () => {
    await expect(createClassCourseRun({
      classCode: 'EL901', displayName: 'English Beta', courseId: 'course-1',
      startDate: '2026-07-20', capacity: 12, status: 'active',
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.withTransaction).not.toHaveBeenCalled();
  });

  test('normalizes PIC labels without treating them as employee identity', () => {
    expect(normalizeLabel('  People   Team  ')).toBe('People Team');
    expect(normalizeLabel('   ')).toBeNull();
  });

  test('maps a duplicate stable class code to conflict without leaking PG details', async () => {
    repository.withTransaction.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    await expect(createClassCourseRun({
      classCode: 'EL900', displayName: 'Duplicate', courseId: 'course-1',
      startDate: '2026-07-20', capacity: 12, status: 'active', picLabel: 'People Team',
    })).rejects.toMatchObject({ statusCode: 409, message: 'English class code "EL900" already exists' });
  });
});
