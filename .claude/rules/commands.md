# Commands

Run from repo root unless noted. Root `package.json` proxies into `client/` and `server/`.

## Dev
```bash
npm run dev:server     # server on :5000 (node --watch)
npm run dev:client     # client on :5173 (vite)
npm run seed           # seed sample data (admin + teachers + participants + classes + schedules)
```
Seed logins: Admin `000001`/`admin12345` (forces password change), Teacher `000002`/`teacher123`, Participant/leader `000004`/`participant123`.

## Build / start (production)
```bash
npm run build          # install server+client deps, then vite build
npm start              # node server/server.js (serves built client)
```

## Test (see testing-and-ci.md for full detail)
```bash
cd server && npm test
cd client && npm run test:run
cd client && npm run test:e2e
```

## Quality checks
```bash
cd client && npm run lint    # eslint, ratchet cap (must stay ≤ current cap)
npm run scripts:check        # syntax check on root scripts
```

## Health & ops
```
GET /health   # process alive?
GET /ready    # DB connected?
GET /api/docs # Swagger UI (server running; PARTIAL — full route truth: docs/route-permission-matrix.md)
```

## Maintenance scripts (`server/scripts/`, run with node)
```bash
node server/scripts/seed-pg.js          # seed sample data (PG-native; same as `npm run seed`)
node server/scripts/verify-pg-backup.js # verify the daily encrypted pg_dump backup
```

## Git
- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`). No AI references in messages.
- Run lint before commit, tests before push. Never commit `.env` or secrets.
- Commit/push only when asked.
