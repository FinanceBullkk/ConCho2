# Audit Round 8 — Docs & Spec Truth (DOCS- series)

**Date:** 2026-06-12 · **Phase:** 08 (final) · **Method:** inline, sampling with teeth (every claim ✔/✘ with evidence)
**Helper scripts built (committed for future audits):**
- `server/scripts/audit-route-permission-diff.js` — live Express introspection (141 routes) vs `docs/route-permission-matrix.md`
- `server/scripts/audit-env-doc-diff.js` — 44 runtime `process.env` reads vs README §6.4 (16 rows) vs envValidator

---

## Findings

### DOCS-001 · P2 · users-and-roles spec describes a user-creation flow that does not exist
- **Evidence:** `docs/specs/users-and-roles/spec.md` FR-1 + UC-1 + AC: "system SHALL generate a unique 6-digit empCode atomically via the Counter helper", concurrent-creates scenario, "email (partial-unique, **optional**)". Code: `server/schemas/user.js:33-35` — "empCode is REQUIRED (admin enters; no auto-generation)… email is REQUIRED (needed for Google Calendar invites)"; `controllers/user/user-mutations.js:15`. Counter helper is Class-only (`models/Class.js:160`); no `getNextSequence` caller in user paths. Also BR-2/Entities: "Three roles (Admin/Teacher/Participant)" — `models/User.js:50` enum has **4** (`Coordinator`).
- **Impact:** an agent implementing from this 'stable' spec builds auto-gen empCode/optional email — the exact opposite of the owner's recorded decision. Highest spec-falsity of the round.
- **Fix:** rewrite FR-1 (admin-provided required empCode 1–32 chars + required email), drop Counter from related_code, 4 roles.

### DOCS-002 · P2 · auth-and-sessions spec stale on 3 security claims
- **Evidence:** spec says (a) cookie "24h" (×4 places) — code `services/auth/auth-tokens.js:13` `JWT_EXPIRE || '7d'`, `.env.example` sets `1d`; (b) "lock after **5** failed logins" — code `auth-login.js:26-27` `LOGIN_MAX_FAILED || 10` / 15 min; (c) TOTP replay "delta ≤ mfaLastUsedCounter" — that is the pre-SEC-018 RELATIVE-delta mechanism; code now stores the ABSOLUTE step counter (`models/User.js:180-188`).
- **Impact:** spec documents the buggy replay mechanism SEC-018 removed; lockout/TTL numbers wrong.

### DOCS-003 · P2 · prod session TTL is 7d, docs everywhere promise 24h (code-or-doc decision)
- **Evidence:** `render.yaml` does NOT set `JWT_EXPIRE` → prod uses code default **7d**. `.env.example` sets `1d` (intent?). Docs claiming 24h: `.claude/rules/security-and-auth.md`, `tech-stack.md`, auth spec.
- **Impact:** sessions outlive the documented kill-window 7×. Either intent drift (change code default / render.yaml to `1d`) or doc drift (document 7d). **Owner call.**

### DOCS-004 · P2 · `.claude/rules/*` drift (steers every future agent session)
- `security-and-auth.md`: "Three roles" → **4** (Coordinator, `User.js:50`); "code is still role-based today" → `requireCapability` live on 5 domain routers (schedule/learning/room/org/assessment); "locks after 5 failed" → 10; "cookie (24h)" → JWT_EXPIRE.
- `domain-model-and-migration.md`: "Still persisted-but-not-enforced: deliveryMode, completionPolicy, capacityPolicy, facilitatorPolicy" → **completionPolicy IS enforced** (`domains/learning/completion/use-cases.js:14`, rollups) and **capacityPolicy IS enforced** (`domains/schedule/session-booking-policy.js:39` maxParticipantsPerSession; `domains/learning/enrollment/use-cases.js:36` maxParticipants). Only deliveryMode + facilitatorPolicy remain stored-only. Booking model: "exactly 1 hour, only in 5 fixed slots" → Wave E1 made windows **configurable** (`ALLOWED_TIME_SLOTS` Setting, any duration; the 5×1h slots are the default). "handoff is Live" → it self-describes as dated snapshot.
- `project-structure.md`: counts 19 routes/15 controllers/13 models → actual **17/13/27**; domains tree lists 2 → actual **7** (assessment, attendance, groups, learning, org, room, schedule); "schedule/ = adapter, **no own routes**" → `domains/schedule/routes.js` mounted at `/api/schedules` (server.js:248); middleware list misses `analyticsCache`, `requireCapability`.
- `tech-stack.md`: "JWT in HttpOnly cookie (24h)".
- `backend-conventions.md`: "UNIQUE index {classId, startTime}" — now PARTIAL (`status:'scheduled'`, `Schedule.js:218`); worth the precision since cancelled rows share slots.

### DOCS-005 · P2 · cron-pinger runbook never arms the reminder jobs
- **Evidence:** `docs/cron-pinger-setup.md` documents pings for `/api/cron/reconcile` + `/health` only. `/api/cron/attendance-reminders` + `/api/cron/assignment-reminders` have **no internal node-cron fallback** (`server/jobs/` = reconcileJob.js only; reminderService called solely from cronRoutes).
- **Impact:** operator following the runbook ships prod with attendance/assignment reminders silently dead (same failure class as OPS-009). Related-but-distinct from OPS-010 (Sentry monitors).
- **Fix:** add the 2 ping definitions (hourly / daily 01:00 per OPS-010 owner schedule).

### DOCS-006 · P3 · Swagger /api/docs is ~7% real
- **Evidence:** 10 `@openapi` ops across 5 legacy route files vs 141 mounted routes; `lib/swagger.js:109` apis glob scans `routes/*.js` + `controllers/*.js` only — `domains/` (the majority surface) can never appear. CLAUDE.md + README advertise `/api/docs` as the API reference.
- **Fix options:** (a) extend glob + annotate over time, (b) demote the claim ("partial, legacy routes only"). Annotating 130 routes is NOT a docs-round task.

### DOCS-007 · P3 · spec registry metadata drift
- 5 `last_updated` rows lag frontmatter: attendance (06-08→06-10), evaluations (06-08→06-11), learning-catalog (06-09→06-10), reporting-and-rollups (06-08→06-10), scheduling-and-booking (06-09→06-11).
- Owner columns reference deleted files: `controllers/attendanceController`, `controllers/teamController`.
- Registry coverage claim itself ✔ (28 rows ↔ 28 folders; /api/rooms covered inside scheduling-and-booking).

### DOCS-008 · P3 · spec content nits (5 specs)
- Dead `related_code` paths ×5: attendance→attendanceController.js; scheduling→scheduleRoutes.js, scheduleController.js, client BookClassPage.jsx; teams→teamController.js.
- `teams-and-groups`: "Team → LearningGroup (not migrated yet)/not started" → round-7 owner decision = rename **DROPPED** permanently.
- `capability-authz`: Entities line lists `schedulingMode` as "persisted, not enforced" while its own Out-of-Scope says enforced; also says capacityPolicy deferred (enforced — see DOCS-004); requireCapability scope "(learning, assessment, org)" misses schedule + room.
- `bulk-import`: missing DATA-013 ADDED behavior — batch **refused loudly** when rows match soft-deleted users/classes (`importService.js:97-111, 234-250`).
- `security-platform`: NFR claims boot-enforced env incl. `CORS_ORIGINS` — actual envValidator = JWT_SECRET always + prod {MONGO_URI, CRON_TOKEN, IMPORT_DEFAULT_PASSWORD} (OPS-011 unchanged); rate-limiter list misses globalWriteLimiter; "query + aggregate hooks" → + `distinct` (DATA-012).
- Verified clean (sampled): scheduling-and-booking (slots/partial-index/waitlist/2-week ✔), enrollment (knows capacity enforcement ✔), evaluations (roster + soft-delete-revive ✔), teams behavior incl. empty-sweep hard-delete ✔ (`Team.js:268` — intentional, placeholders have no history), capability-authz Coordinator allow-list ✔, audit-log 730d ✔, reconcile 02:00 ✔, settings whitelist ✔, seed logins ✔.

### DOCS-009 · P3 · README + .env.example drift
- README §6.1: "Node.js version 18 or higher" → engines `>=20` (CI runs 22).
- README §6.4: missing boot-REQUIRED `IMPORT_DEFAULT_PASSWORD` (OPS-011 doc-half; render.yaml:41 already documents it); script found 26 runtime vars undocumented — most are tuning knobs, propose documenting the operator-meaningful subset (`JWT_EXPIRE`, `EMAIL_FROM`, `MFA_ISSUER`, `SWAGGER_ENABLED`, `AUDIT_RETENTION_DAYS`, `REDIS_URL`) + one "advanced knobs" line for the rest.
- `.env.example` documents `SENTRY_RELEASE` — no code reads it (code uses GIT_SHA/RENDER_GIT_COMMIT).

### DOCS-010 · P3 · route docs gaps
- `route-permission-matrix.md`: probes row misses `/api/ready` (script-verified; everything else matches).
- `current-system-map.md` route table missing 3 rows: `/api/org`, `/api/assessment`, `/api/admin/cron`; §Booking Logic references deleted `scheduleController`; line 24 lists 2 domains of 7.

### DOCS-011 · P3 · backup-dr §4.1 env table (= OPS-013, fix text this round)
- Lists nonexistent `REFRESH_SECRET` + `MFA_ENCRYPTION_KEY` (not among the 44 runtime env reads); omits `IMPORT_DEFAULT_PASSWORD`, `CORS_ORIGINS`, `CLIENT_ORIGIN` → rebuild-from-runbook boot-loops mid-incident.

### DOCS-012 · P3 · scorecard sync
- `system-overview.md` scorecard vs roadmap: phase 0 92↔93, phase 4 80↔78. Cosmetic.

## Backlog interactions
- **DATA-017? (needs-triage) likely OBSOLETE:** User model HAS an aggregate soft-delete hook (`User.js:269`, injects `isDeleted` unless explicitly filtered) — added with DATA-012 round. Recommend re-verify + close.
- OPS-010/011/012 unchanged (code-side, stay backlogged); DOCS-011 executes OPS-013's doc half; DOCS-005 complements OPS-010.
- i18n key sweep: done in phase-03 (`audit-flows-260611-1357-findings.md:68`) — 15 keys missing from en.json, all with inline English defaults; P3 hygiene, not re-run.

## Verified clean (round summary)
- Registry 28/28 specs, no orphans, every mounted base path spec-covered.
- 7 CI gates claim ✔ (e2e job at ci.yml:267); eslint cap 63 ✔; client features/ list (16) + 4 page shells ✔; AGENTS.md + docs/agents/* ✔ (no falsifiable drift); cron-pinger + google-calendar runbook steps otherwise ✔; roadmap changelog current (knows completionPolicy enforced — rules lag IT, not vice versa).

## Proposed fixes (1 PR, docs+rules text only + 2 committed scripts)
1. Rewrite users-and-roles FR-1/roles; auth spec 3 claims; spec nits (DOCS-008); registry rows.
2. `.claude/rules` corrections (DOCS-004) — biggest leverage, these steer every session.
3. Runbook: add 2 reminder pings; backup-dr §4.1 table.
4. README node/env rows; matrix `/api/ready`; system-map 3 rows + scheduleController text; scorecard sync.
5. Commit both audit scripts.

## Unresolved questions (owner)
1. **DOCS-003:** session TTL intent — change default/render.yaml to `1d` (code fix + test) or document 7d?
2. **DOCS-006:** Swagger — demote the claim now, annotate-over-time later?
3. Lockout 10-vs-5: accept 10 as intent (docs say 10 + env knobs)?
4. DATA-017? close after re-verify?
