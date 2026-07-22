jest.mock('../../domains/english-training/repository.pg', () => ({}));

const { mergeCutoverRows } = require('../../domains/english-training/combined-history');

describe('English combined-history cutover boundary', () => {
  const cutoverAt = '2026-07-19T12:00:00.000Z';

  test('uses archive before cutover and live at/after cutover', () => {
    const rows = mergeCutoverRows([
      { source: 'archive', naturalKey: 'before', eventDate: '2026-07-19T11:59:59.999Z' },
      { source: 'archive', naturalKey: 'archive-at-boundary', eventDate: cutoverAt },
      { source: 'live', naturalKey: 'live-at-boundary', eventDate: cutoverAt },
      { source: 'live', naturalKey: 'live-before', eventDate: '2026-07-19T11:59:59.999Z' },
    ], cutoverAt);

    expect(rows.map((row) => row.naturalKey)).toEqual(['before', 'live-at-boundary']);
  });

  test('returns the same natural event once and prefers the live authority', () => {
    const rows = mergeCutoverRows([
      { source: 'archive', sourceIdentity: 'old', naturalKey: 'employee|course|run|session-1', eventDate: '2026-07-18T12:00:00.000Z' },
      { source: 'live', sourceIdentity: 'new', naturalKey: 'employee|course|run|session-1', eventDate: '2026-07-20T12:00:00.000Z' },
    ], cutoverAt);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'live', sourceIdentity: 'new' });
  });
});
