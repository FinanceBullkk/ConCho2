/**
 * Unit Tests — mongoOnlyGone middleware (K1b).
 *
 * The 410 must fire ONLY when the app runs Mongo-less under Postgres, i.e.
 * DB_BACKEND=postgres AND the Mongo connection is actually down. Under Mongo, or
 * while Mongo is still connected (the bake window + every test lane, where
 * mongodb-memory-server keeps readyState=1), it must pass through untouched —
 * otherwise the required server-tests-pg gate would break.
 *
 * DB_BACKEND is read at module load (config/db-backend), and readyState comes
 * from mongoose — so each case reloads the middleware with a fresh DB_BACKEND +
 * a mongoose mock via jest.resetModules + jest.doMock.
 */

const ORIGINAL_BACKEND = process.env.DB_BACKEND;

const loadMw = ({ backend, readyState }) => {
  jest.resetModules();
  process.env.DB_BACKEND = backend;
  jest.doMock('mongoose', () => ({ connection: { readyState } }));
  return require('../../middleware/mongoOnlyGone').mongoOnlyGone;
};

const invoke = (mw) => {
  const res = {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  let nexted = false;
  mw({}, res, () => { nexted = true; });
  return { res, nexted };
};

afterEach(() => {
  jest.resetModules();
  jest.dontMock('mongoose');
  if (ORIGINAL_BACKEND === undefined) delete process.env.DB_BACKEND;
  else process.env.DB_BACKEND = ORIGINAL_BACKEND;
});

describe('mongoOnlyGone', () => {
  test('postgres + Mongo disconnected → 410 Gone', () => {
    const { res, nexted } = invoke(loadMw({ backend: 'postgres', readyState: 0 }));
    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({ success: false });
    expect(nexted).toBe(false);
  });

  test('postgres + Mongo still connected → passes through (bake/test lanes unaffected)', () => {
    const { res, nexted } = invoke(loadMw({ backend: 'postgres', readyState: 1 }));
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  test('mongo backend → passes through regardless of Mongo state', () => {
    expect(invoke(loadMw({ backend: 'mongo', readyState: 0 })).nexted).toBe(true);
    expect(invoke(loadMw({ backend: 'mongo', readyState: 1 })).nexted).toBe(true);
  });
});
