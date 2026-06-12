# Security & Auth

Security is a first-class concern here. Preserve every layer when editing.

## Roles (current) → capabilities (target)
Four roles: **Admin**, **Coordinator**, **Teacher**, **Participant**. Coordinator = training-ops management bundle (program/cohort/session/report manage; never user/security caps). The capability layer (`requireCapability` + `policy/capabilities.js`, capabilities derived from role — no per-user grants yet) is LIVE on the domain routers (learning, assessment, org, schedule, room); legacy routes still use `roleGuard`. See `docs/specs/capability-authz/spec.md`.

## Auth flow
- Login → bcrypt compare → if MFA: `mfaPendingToken` (5 min) → TOTP/backup-code verify → HttpOnly cookie (TTL = `JWT_EXPIRE`, default 1d).
- `middleware/auth.js` verifies the cookie, caches the user ~30s, and rejects tokens older than `passwordChangedAt` (changing password kills all sessions).
- Account locks after 10 failed logins / 15 min (`LOGIN_MAX_FAILED` / `LOGIN_LOCK_MINUTES`).

## Mandatory protections — do not remove or bypass
- **CSRF:** every state-changing request needs the CSRF token (server-issued). Client axios attaches it automatically; keep that wiring intact.
- **Rate limiting:** per-route limiters (login, forgot-password, booking, export) + a global cap. Don't drop limiters when adding routes.
- **Input sanitization:** `express-mongo-sanitize` + zod validation. Validate everything.
- **Helmet:** CSP and security headers are configured — don't loosen without reason.
- **Authz two-layer:** `roleGuard` + `policy/` (see backend-conventions.md). Never rely on client-side hiding as the security boundary.

## Secrets & env
- **Never** commit secrets. `server/.env` is gitignored; `.gitleaks.toml` + the gitleaks CI gate guard against leaks.
- If a secret is ever committed: rotate it immediately (`JWT_SECRET`, `CRON_TOKEN`, `MONGO_URI`, SMTP, Google key).
- Required env: `NODE_ENV`, `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGINS`, `CRON_TOKEN`, `CLIENT_ORIGIN`, `IMPORT_DEFAULT_PASSWORD` (boot-required in production). See README §6.4 for the full table.

## Data handling
- **Soft delete** everywhere (`isDeleted`, `deletedAt`) — never hard-delete user/attendance/evaluation data; it's needed for reports & audit. Deleted records go to a recoverable "trash".
- **Audit log** every mutation (see backend-conventions.md). Retained 730 days (TTL).
- Sensitive User fields (`mfaSecret`, `mfaBackupCodes`, `password`) are `select:false` — never include them in API responses.

## Cron endpoints
Nightly reconcile (`POST /api/cron/reconcile`) is protected by `CRON_TOKEN`. Keep that auth in place.
