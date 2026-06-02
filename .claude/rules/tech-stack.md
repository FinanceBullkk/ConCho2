# Tech Stack

MERN monorepo. Node `>=18` (CI runs server on Node 22, client on Node 20).

## Server (`server/`) — CommonJS
- **Express 4** — REST API
- **Mongoose 8** + MongoDB Atlas
- **jsonwebtoken** — JWT in HttpOnly cookie (24h)
- **bcryptjs** (12 rounds) — password hashing
- **speakeasy** + **qrcode** — TOTP 2FA
- **zod 4** — request validation (`server/schemas/`)
- **helmet**, **cors**, **express-rate-limit**, **express-mongo-sanitize** — security middleware
- **pino** + **pino-http** — structured logging (request-id traced)
- **node-cron** — nightly reconcile job (02:00 UTC)
- **nodemailer** — SMTP email (booking confirm, password reset)
- **googleapis** — Calendar invites + Meet links + Sheets export
- **exceljs** — HR Excel export
- **@sentry/node** — error tracking (5xx only)
- **swagger-jsdoc** + **swagger-ui-express** — `/api/docs`

## Client (`client/`) — ESM, `type: module`
- **React 19** + **Vite 8**
- **TailwindCSS 4** (`@tailwindcss/vite`) + **Radix UI** primitives + **shadcn-style** components (`class-variance-authority`, `tailwind-merge`, `clsx`)
- **@tanstack/react-query 5** — all server state (see `client/src/hooks/queryKeys.js`)
- **react-hook-form 7** + **@hookform/resolvers** + **zod 4** — forms & validation
- **react-router-dom 7** — routing (lazy-loaded pages)
- **i18next** + **react-i18next** — i18n (`en` / `vi`); detector for browser locale
- **axios** — single instance w/ interceptors (`client/src/api/api.js`)
- **sonner** / **react-hot-toast** — toasts
- **next-themes** — dark/light mode
- **@sentry/react** — error tracking

## Versioning note
`googleapis` transitive deps drift the server lockfile, so CI uses `npm install` (not `npm ci`) for the server. Client uses `npm ci`.
