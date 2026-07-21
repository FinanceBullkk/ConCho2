const { query } = require('../../config/pg');

jest.mock('../../config/pg', () => ({ query: jest.fn() }));

const reads = require('../../domains/english-training/reads.pg');

describe('English training read SQL', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  test('session list groups by Meeting identity when projecting Meeting fields', async () => {
    await reads.listSessions({ limit: 200, offset: 0 });

    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/GROUP BY\s+su\.id,\s*m\.id,\s*r\.id,/i);
    expect(sql).toMatch(/su\.source_sheet\s+IS\s+NULL\s+OR\s+m\.operational_at\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/m\.source_starts_at/i);
  });

  test('historical roster uses Meeting time and event-time membership applicability', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        id: 'unit-1', course_run_id: 'run-1', session_number: 4,
        meeting_status: 'completed', held_at: '2026-07-01T02:00:00.000Z',
      }] })
      .mockResolvedValueOnce({ rows: [] });

    await reads.getSessionAttendance('unit-1');

    const [sessionSql] = query.mock.calls[0];
    const [rosterSql, params] = query.mock.calls[1];
    expect(sessionSql).toMatch(/JOIN\s+eng_meetings\s+m\s+ON\s+m\.id\s*=\s*su\.meeting_id/i);
    expect(rosterSql).toMatch(/LEFT JOIN\s+eng_cohort_memberships\s+cm/i);
    expect(rosterSql).toMatch(/cm\.start_date\s*<=\s*\$5::date/i);
    expect(params).toEqual([
      'unit-1', 'run-1', 4, 'completed', '2026-07-01T02:00:00.000Z',
    ]);
  });
});
