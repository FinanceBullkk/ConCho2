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

  test('session list scopes to a from/to calendar window when given', async () => {
    await reads.listSessions({
      limit: 200, offset: 0, from: '2026-07-01T00:00:00.000Z', to: '2026-07-08T00:00:00.000Z',
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE\s+m\.starts_at\s*>=\s*\$1\s+AND\s+m\.starts_at\s*<\s*\$2/i);
    expect(params).toEqual(['2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 200, 0]);
  });

  test('session list combines the q filter with a from/to window', async () => {
    await reads.listSessions({
      q: 'EL0', limit: 50, offset: 0, from: '2026-07-01T00:00:00.000Z', to: '2026-07-08T00:00:00.000Z',
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/WHERE\s+\(co\.class_code ILIKE \$1 OR c\.course_name ILIKE \$1\)\s+AND\s+m\.starts_at\s*>=\s*\$2\s+AND\s+m\.starts_at\s*<\s*\$3/i);
    expect(params).toEqual(['%EL0%', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 50, 0]);
  });

  test('sessions summary aggregates counts/bounds without LIMIT/OFFSET row paging', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        all_count: 3, upcoming_count: 1, recorded_count: 1, needs_evidence_count: 1,
        nearest_session_at: '2026-07-24T02:00:00.000Z', latest_session_at: '2026-08-01T02:00:00.000Z',
        upcoming_seed_at: '2026-08-01T02:00:00.000Z', recorded_seed_at: '2026-07-20T02:00:00.000Z',
        needs_evidence_seed_at: '2026-07-24T02:00:00.000Z',
      }],
    });

    const summary = await reads.getSessionsSummary();

    const call = query.mock.calls[0];
    // No page params — it is one global aggregate, not a row page (unlike
    // listSessions, which always takes a [..., limit, offset] params array).
    expect(call).toHaveLength(1);
    expect(call[0]).toMatch(/FILTER\s*\(WHERE starts_at > now\(\)\)/i);
    expect(call[0]).toMatch(/min\(starts_at\)\s+FILTER\s*\(WHERE starts_at > now\(\)\)\s+AS upcoming_seed_at/i);
    expect(summary).toMatchObject({
      all_count: 3, upcoming_count: 1, recorded_count: 1, needs_evidence_count: 1,
      upcoming_seed_at: '2026-08-01T02:00:00.000Z',
    });
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
