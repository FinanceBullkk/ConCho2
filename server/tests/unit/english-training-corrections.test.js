jest.mock('../../domains/english-training/repository.pg', () => ({
  withTransaction: jest.fn((fn) => fn({ tx: true })),
  findEmployeeForCorrection: jest.fn(),
  getEmployeeCorrection: jest.fn(),
  saveEmployeeCorrection: jest.fn(),
  backfillUnknownEnrollmentSnapshots: jest.fn(),
  resolveEmployeeIssues: jest.fn(),
  recordEmployeeCorrectionHistory: jest.fn(),
}));

const repo = require('../../domains/english-training/repository.pg');
const { correctEmployeeOrg } = require('../../domains/english-training/corrections');
const { employeeCorrectionBody } = require('../../domains/english-training/schemas');

describe('English-training employee correction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repo.findEmployeeForCorrection.mockResolvedValue({ id: 'e1', emp_code: '267040', full_name: 'Test Employee' });
    repo.getEmployeeCorrection.mockResolvedValue(null);
    repo.saveEmployeeCorrection.mockResolvedValue({ business_unit: 'BU-A', job_role: 'Engineer', reason: 'HR verified' });
    repo.backfillUnknownEnrollmentSnapshots.mockResolvedValue(2);
    repo.resolveEmployeeIssues.mockResolvedValue(2);
    repo.recordEmployeeCorrectionHistory.mockResolvedValue();
  });

  test('persists overlay, backfills unknown snapshots, and resolves matching issues atomically', async () => {
    const result = await correctEmployeeOrg({
      empCode: '267040', businessUnit: 'BU-A', jobRole: 'Engineer',
      reason: 'HR verified', actor: { _id: 'admin-1' },
    });

    expect(repo.saveEmployeeCorrection).toHaveBeenCalledWith(expect.objectContaining({
      empCode: '267040', businessUnit: 'BU-A', jobRole: 'Engineer', correctedBy: 'admin-1',
    }), { tx: true });
    expect(repo.backfillUnknownEnrollmentSnapshots).toHaveBeenCalledWith(
      '267040', { businessUnit: 'BU-A', jobRole: 'Engineer' }, { tx: true },
    );
    expect(repo.resolveEmployeeIssues).toHaveBeenCalled();
    expect(repo.recordEmployeeCorrectionHistory).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ snapshotsUpdated: 2, issuesResolved: 2 }));
  });

  test('returns 404 without writing when the imported employee does not exist', async () => {
    repo.findEmployeeForCorrection.mockResolvedValue(null);
    await expect(correctEmployeeOrg({ empCode: 'none', businessUnit: 'BU-A', reason: 'HR verified' }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(repo.saveEmployeeCorrection).not.toHaveBeenCalled();
  });

  test('validation requires a correction value and a meaningful reason', () => {
    expect(employeeCorrectionBody.safeParse({ reason: 'HR verified' }).success).toBe(false);
    expect(employeeCorrectionBody.safeParse({ businessUnit: 'BU-A', reason: 'ok' }).success).toBe(false);
    expect(employeeCorrectionBody.safeParse({ jobRole: 'Engineer', reason: 'HR verified' }).success).toBe(true);
  });
});
