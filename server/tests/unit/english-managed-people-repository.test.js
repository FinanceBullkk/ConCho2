const mockClientQuery = jest.fn();

jest.mock('../../config/pg', () => ({ query: jest.fn() }));
jest.mock('../../domains/_shared/unit-of-work', () => ({
  runInTransaction: jest.fn((work) => work({ client: { query: mockClientQuery } })),
}));
jest.mock('../../controllers/user/user-mutations-repository', () => ({
  updateById: jest.fn(),
}));

const repository = require('../../domains/english-training/managed-people-repository.pg');

describe('canonical English managed-person creation', () => {
  beforeEach(() => mockClientQuery.mockReset());

  test('creates the login-disabled User and emp_code Employee crosswalk in one transaction', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{
        id: 'user-1', emp_code: 'E001', name: 'Learner One', email: null,
        department: 'Sales', position: 'Advisor', status: 'Active',
        role: 'Participant', can_login: false,
      }] })
      .mockResolvedValueOnce({ rows: [] });

    const person = await repository.createManaged({
      empCode: 'E001', name: 'Learner One', email: null,
      department: 'Sales', position: 'Advisor', status: 'Active',
    });

    expect(person).toMatchObject({
      _id: 'user-1', empCode: 'E001', canLogin: false,
      archiveEmployeeId: expect.any(String),
    });
    expect(mockClientQuery).toHaveBeenCalledTimes(2);
    expect(mockClientQuery.mock.calls[0][0]).toMatch(/INSERT INTO users/);
    expect(mockClientQuery.mock.calls[1][0]).toMatch(/INSERT INTO eng_employees/);
    const insertedUserId = mockClientQuery.mock.calls[0][1][0];
    expect(mockClientQuery.mock.calls[1][1]).toEqual(expect.arrayContaining([
      'E001', 'Learner One', 'active', insertedUserId,
    ]));
  });

  test('maps a cross-table uniqueness conflict to 409', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{
        id: 'user-1', emp_code: 'E001', name: 'Learner One', status: 'Active',
        role: 'Participant', can_login: false,
      }] })
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));

    await expect(repository.createManaged({
      empCode: 'E001', name: 'Learner One', status: 'Active',
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});
