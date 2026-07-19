jest.mock('../../domains/english-training/repository.pg', () => ({
  insertMany: jest.fn(),
}));

jest.mock('../../domains/english-training/import/read-workbook', () => ({
  readWorkbook: jest.fn(),
  rowHash: jest.fn(),
  IMPORT_SHEETS: [],
}));

jest.mock('../../domains/english-training/import/transform', () => ({
  transform: jest.fn(),
}));

const repo = require('../../domains/english-training/repository.pg');
const { insertBatches, BATCH_SIZE } = require('../../domains/english-training/import/pipeline');

describe('English-training workbook import batching', () => {
  it('loads a large source in bounded database round trips without losing rows', async () => {
    const rows = Array.from({ length: BATCH_SIZE * 2 + 17 }, (_, id) => ({ id }));
    const client = { tx: true };
    const options = { onConflict: 'ON CONFLICT DO NOTHING' };

    await insertBatches('eng_test', rows, client, options);

    expect(repo.insertMany).toHaveBeenCalledTimes(3);
    expect(repo.insertMany.mock.calls.flatMap((call) => call[1])).toEqual(rows);
    expect(repo.insertMany).toHaveBeenLastCalledWith('eng_test', rows.slice(BATCH_SIZE * 2), client, options);
  });
});
