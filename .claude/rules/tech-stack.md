# Tech Stack

PERN monorepo (PostgreSQL / Express / React / Node — migrated off MongoDB in Wave K, 2026-07-14). Node `>=20` (engines; CI runs Node 22 for both server and client — aligned in audit round 7).

## Server (`server/`) — CommonJS
- **Express 5** — REST API (4→5 migrated 2026-06-12; `req.query` is getter-only — NoSQL sanitize runs via `middleware/mongo-sanitize-in-place.js`; SPA fallback pattern is `/{*splat}`)
- **PostgreSQL 17** (Neon, `ap-southeast-1`) via **pg 8** (pooled client, `config/pg.js`) + **Knex 3** (migrations only, `db/pg/migrations`, `knex_migrations`) — **Mongoose fully removed** in Wave K (2026-07-14), Atlas cancelled 2026-07-10; prod is PG-only. Repositories are `.pg.js` modules behind each domain.
- **jsonwebtoken** — JWT in HttpOnly cookie (`JWT_EXPIRE`, default 1d)
- **bcryptjs** (12 rounds) — password hashing
- **speakeasy** + **qrcode** — TOTP 2FA
- **zod 4** — request validation (`server/schemas/`)
- **helmet**, **cors**, **express-rate-limit**, **express-mongo-sanitize** (its `sanitize()` only, wrapped by `middleware/mongo-sanitize-in-place.js` — the stock middleware throws on express 5) — security middleware
- **pino** + **pino-http** — structured logging (request-id traced)
- **node-cron** — nightly reconcile job (02:00 UTC)
- **nodemailer** — SMTP email (booking confirm, password reset)
- **googleapis** — Calendar invites + Meet links + Sheets export
- **exceljs** — HR Excel export
- **@sentry/node** — error tracking (5xx only)
- **swagger-jsdoc** + **swagger-ui-express** — `/api/docs` (partial coverage — only annotated routes; the route truth is `docs/route-permission-matrix.md`)

## Client (`client/`) — ESM, `type: module`
- **React 19** + **Vite 8**
- **TailwindCSS 4** (`@tailwindcss/vite`) + **Radix UI** primitives + **shadcn-style** components (`class-variance-authority`, `tailwind-merge`, `clsx`)
- **@tanstack/react-query 5** — all server state (see `client/src/hooks/queryKeys.js`)
- **react-hook-form 7** + **@hookform/resolvers** + **zod 4** — forms & validation
- **react-router-dom 7** — routing (lazy-loaded pages)
- **i18next** + **react-i18next** — i18n (English-only, single `en` locale; no detector)
- **axios** — single instance w/ interceptors (`client/src/api/api.js`)
- **sonner** — toasts (react-hot-toast removed in audit round 7 — CODE-015)
- **next-themes** — dark/light mode
- **@sentry/react** — error tracking

## Versioning note
Both server and client install with **`npm ci`** (CI + root build scripts) — the committed
lockfiles are the source of truth. The old "googleapis transitive drift forces npm install"
workaround was retired in audit round 7 (CODE-014): if a dep bump ever desyncs
package.json↔lockfile, regenerate the lockfile in the same PR. Radix is consumed via the
umbrella `radix-ui` package (individual `@radix-ui/react-*` deps removed — CODE-015).
