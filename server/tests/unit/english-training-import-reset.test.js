'use strict';

const repo = require('../../domains/english-training/repository.pg');

describe('English-training canonical import reset', () => {
  test('deletes exam results before their parent run enrollments', async () => {
    const statements = [];
    const client = {
      query: jest.fn(async (sql) => {
        statements.push(sql);
        return { rows: [], rowCount: 0 };
      }),
    };

    await repo.resetCanonical(client);

    expect(statements[0]).toBe('DELETE FROM eng_audit_events');
    expect(statements).toContain('DELETE FROM eng_exam_results');
    expect(statements.indexOf('DELETE FROM eng_exam_results'))
      .toBeLessThan(statements.indexOf('DELETE FROM eng_run_enrollments'));
  });
});
