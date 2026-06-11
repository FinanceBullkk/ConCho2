# Audit Round — Phase 01: Security & AuthZ

**Date:** 2026-06-11 · **Auditor:** agent session · **Plan:** `plans/260611-1230-full-system-audit/phase-01-security-and-authz.md`
**Verdict: no P0/P1. 1×P2, 3×P3.** Core layers verified intact.

## Verified CLEAN (evidence-backed)

| Layer | Evidence |
|---|---|
| Mount layer | `server.js`: helmet CSP (no script unsafe-*), no-origin prod write guard (SEC-006), CORS allowlist, mongo-sanitize, CSRF on all `/api`, global+write limiters, env boot validation, prod 500 message scrubbed |
| Cookies | `auth-tokens.js:69-72,150-153` — HttpOnly + Secure(prod) + SameSite Strict + bounded maxAge (session 24h, MFA-pending 5m) |
| Session invalidation | `passwordChangedAt` iat check (auth.js:143-146); `invalidateUserCache` called at password change / reset / force-logout / MFA disable (5 sites) |
| Route gates | All 22 routers walked: Admin-only walls on users/enrollments/sync/import/export/settings/admin-db/audit/reconcile/cron-health; capability gates across learning/org/room/assessment; cron router 100% behind `cronAuth` |
| Self-scoping (IDOR) | enrollments list (`use-cases.js:87` forced self), completion+certs (forced self), feedback (forced self), attempts (`listAttempts:179` forced self; answers hidden from learners `controller.js:27`), path progress (`controller.js:74` req.user._id), evaluations (Teacher requires classId + `isTeacherOfClass`), attendance by-user (Participant 403 + Teacher `scopedAttendanceMatch`), schedules list/byId (BUG#2 fixes intact `controller.js:85-112`) |
| Internal Admin gates | executive dashboard + cost-config GET/PUT (`assertAdmin` ×3), compliance report/export (`assertCanReadCompliance` Admin-only) |
| Sensitive fields | `select('+password/+mfaSecret...')` ONLY in auth internals + tests (grep-verified); pino redact covers headers/body/nested passwords + reset tokens |
| Deps & secrets | `npm audit` high+ = 0 (server prod, client all); `.gitleaks.toml` present; `git check-ignore server/.env` ✓ |

## Findings

### SEC-014 (P2) — malformed ObjectId → 500 (no CastError handling) on unvalidated legacy routes
- **Evidence:** `helpers/handleError.js` (branches: ValidationError, 11000 only — no CastError); `server.js` global handler same. Unvalidated param routes: `GET /api/evaluations/:id`, `DELETE /api/evaluations/:id`, `GET /api/attendance/schedule/:scheduleId`, `GET /api/attendance/user/:userId`, `GET/PUT /api/settings` (no zod; key-whitelist inside).
- **Impact:** garbage `:id` → Mongoose CastError → 500 + Sentry noise + generic message. Not exploitable (auth'd staff routes), but wrong status class + alert pollution; trivially triggerable.
- **Fix:** CastError→400 branch in `handleError` + `server.js`; add `validate({params: idParam})` to the 4 legacy routes. Regression test: bad-id → 400.

### SEC-015 (P3) — learning programs/cohorts lists have NO capability gate (any authenticated role)
- **Evidence:** `domains/learning/routes.js:56-80` — GET `/programs`, `/programs/:id`, `/cohorts`, `/cohorts/:id` behind `protect` only. DTO (`dto.js`) = operational metadata (codes/names/policies/teacherIds-as-ids), no PII.
- **Impact:** Participants can browse the full program/cohort catalog. Likely INTENDED (self-enroll needs the catalog; legacy `/api/classes` GET is equally open). Info-disclosure-lite at most.
- **Fix options:** (a) accept + document in route-permission-matrix as intended catalog; (b) add `cohort.read`/`program.read` capability (all 4 roles hold it today → pure scaffolding). **Owner decision.**

### SEC-016 (P3) — client perm drift: Coordinator missing from `read:classes`
- **Evidence:** `useRole.js:42` `'read:classes': ['Admin','Teacher','Participant']`; server `GET /api/classes` = any authenticated (incl. Coordinator).
- **Impact:** UI-gating only (legacy class views hidden from Coordinator; they use Learning module). No security impact.
- **Fix options:** add `'Coordinator'` to the client perm, or annotate as intended. **Owner decision.**

### SEC-017 (P3) — stale security comments (docs ride-along)
- `middleware/auth.js:27` says "2 min TTL"; actual `stdTTL: 30` (line 10; security-and-auth.md correctly says ~30s) → fix comment.
- `routes/evaluationRoutes.js:12` says "Admin/Teacher see all"; controller actually enforces Teacher classId + binding check → comment understates, fix.

## Notes (no finding)
- Attendance Teacher scope filters `status:'scheduled'` schedules — harmless: cancel is future-only, attendance is past-only; no records hidden.
- Availability grid exposes other teams' taken SLOTS (times only) — by design (booking model).
- `report.read` Teacher → operational dashboard is class-scoped inside; assignments/coverage org-wide by documented decision (dashboard README).

## Triage outcome (owner, 2026-06-11)
- **SEC-014 → FIXED this round:** CastError→400 in `handleError` + `server.js`;
  zod params on evaluations `:id` ×2 + attendance `:scheduleId`/`:userId`;
  5 regression tests (incl. one exercising the handleError branch via
  `?classId=garbage`). evaluation+attendance suites 36/36.
- **SEC-015 → accepted as designed:** catalog-open reads documented in
  `route-permission-matrix.md` (classes + learning rows).
- **SEC-016 → kept as designed:** Coordinator omission annotated in
  `useRole.js` PERMISSION_MAP.
- **SEC-017 → fixed:** auth.js TTL comment (30s), evaluationRoutes scope comment.

No backlog items carried from this round.
