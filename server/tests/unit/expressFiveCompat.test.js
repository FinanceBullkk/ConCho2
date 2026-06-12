/**
 * ──────────────────────────────────────────────────────────
 * Unit Tests — express 5 compatibility (deps major round 2)
 * ──────────────────────────────────────────────────────────
 * Two express-5-specific behaviors that the normal suites can't prove:
 *
 * 1. mongo-sanitize-in-place — express 5 made `req.query` getter-only
 *    (the stock express-mongo-sanitize middleware throws on assignment) and
 *    the getter may re-parse per access. The replacement middleware must
 *    strip $/dot keys from body AND query, surviving multiple query reads.
 *
 * 2. SPA fallback pattern — bare '*' is invalid in express 5 /
 *    path-to-regexp 8 and would crash the PRODUCTION boot at mount time
 *    (the prod-only branch in server.js that CI never executes). Prove the
 *    '/{*splat}' pattern mounts and matches /, shallow, and deep paths.
 */

const express = require('express');
const request = require('supertest');
const { mongoSanitizeInPlace } = require('../../middleware/mongo-sanitize-in-place');

describe('mongoSanitizeInPlace (express 5)', () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use(mongoSanitizeInPlace);
    app.get('/echo', (req, res) => {
      // Read query TWICE — the express 5 getter may re-parse per access;
      // the middleware pins the sanitized object so both reads must match.
      const first = req.query;
      const second = req.query;
      res.json({ query: first, sameRef: first === second });
    });
    app.post('/echo', (req, res) => {
      res.json({ body: req.body });
    });
    return app;
  };

  it('strips $-prefixed and dotted keys from req.query and pins the object', async () => {
    const res = await request(buildApp())
      .get('/echo')
      .query({ $gt: 'x', 'a.b': 'dotted', safe: 'kept' });

    expect(res.status).toBe(200);
    expect(res.body.query).toEqual({ safe: 'kept' });
    expect(res.body.sameRef).toBe(true);
  });

  it('strips prohibited keys from req.body recursively', async () => {
    const res = await request(buildApp())
      .post('/echo')
      .send({ $where: '1 === 1', ok: 1, nested: { $gt: 5, keep: true } });

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ ok: 1, nested: { keep: true } });
  });

  it('passes requests with no prohibited keys through untouched', async () => {
    const res = await request(buildApp())
      .get('/echo')
      .query({ page: '1', limit: '20' });

    expect(res.status).toBe(200);
    expect(res.body.query).toEqual({ page: '1', limit: '20' });
  });
});

describe('req.body default shim (express 5)', () => {
  // express 5 leaves req.body undefined when no parser matched; server.js
  // restores the express 4 `{}` default app-wide. Mirror that wiring here.
  it('bodyless requests see req.body as {} after the shim', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (req.body === undefined) req.body = {};
      next();
    });
    app.delete('/thing', (req, res) => {
      // The pattern dozens of handlers use — destructure with a default.
      const { reason = null } = req.body;
      res.json({ ok: true, reason });
    });

    const res = await request(app).delete('/thing'); // no body, no content-type
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, reason: null });
  });
});

describe("SPA fallback pattern '/{*splat}' (express 5)", () => {
  it('mounts without throwing and matches root, shallow, and deep paths', async () => {
    const app = express();
    // Same shape as the production branch in server.js.
    app.get('/{*splat}', (_req, res) => res.json({ spa: true }));

    for (const path of ['/', '/learning', '/me/sessions/deep/path']) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ spa: true });
    }
  });
});
