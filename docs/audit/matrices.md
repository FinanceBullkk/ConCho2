# Permission Matrix & Business Invariant Matrix

Two reference tables.

- [D. Permission Matrix](#d-permission-matrix)
- [E. Business Invariant Matrix](#e-business-invariant-matrix)

---

## D. Permission Matrix

Actors: **Admin / Teacher / Participant (incl. Team Leader) / Unauthenticated**.

| Actor | Resource | Action | Expected | Currently | Gap | Test required |
|---|---|---|---|---|---|---|
| Unauth | * | anything | Deny 401 | Deny ✓ | – | `protect.no-token.test` |
| Unauth | `POST /auth/login` | login | Allow rate-limited | Allow ✓ | rate-limit untested | `loginLimiter.test` (QA-008) |
| Unauth | `POST /auth/forgot-password` | request reset | Allow constant 200 | Allow ✓ | empCode leak in log (SEC-008) | `forgotPassword.noLog.test` |
| Unauth | `POST /auth/reset-password` | reset with token | Allow body-token | Allow URL-token | **SEC-005** | `passwordReset.tokenInPath.test` |
| Unauth | `GET /auth/csrf` | issue token | Allow | Allow ✓ | – | – |
| Any | `GET /auth/me` | self read | Self | Self ✓ | – | – |
| Any | `POST /auth/logout` | self | Self | Self ✓ revokes JTI | – | – |
| Any | `PUT /auth/change-password` | self change | Full-session ONLY | enrollment-required allowed | **SEC-007** | `mfaEnrollment.changePasswordBlocked.test` |
| Any | `POST /auth/mfa/setup`, `verify-setup`, `disable` | self | Self | Self ✓ | – | – |
| Any | `POST /auth/mfa/verify` | per pending cookie | OK | OK ✓ | rate-limit untested | `mfaVerifyLimiter.test` |
| Admin | `POST /auth/admin/force-logout/:userId` | revoke user | Admin + re-auth | Admin (no re-auth) | **SEC-009** | `forceLogout.requireReauth.test` |
| Admin | `POST /auth/mfa/admin-disable/:userId` | disable MFA | Admin + re-auth + audit | Admin (no re-auth, audit ✓) | **SEC-009** | `mfaAdminDisable.requireReauth.test` |
| Admin | `GET /users` | list | Allow | Allow ✓ | – | – |
| Admin | `POST /users` | create | Allow | Allow ✓ | – | – |
| Admin | `PUT /users/:id` (name / dept) | other | Allow | Allow ✓ | – | – |
| Admin | `PUT /users/:id` (password / role / cross-user) | Allow + re-auth | Allow + re-auth ✓ | – | – | `userRoutes.test` (covered) |
| Admin | `DELETE /users/:id` | soft-delete | Allow + leader-block | Allow + blocked when leader ✓ | – | – |
| Admin | `POST /users/:id/restore` | restore | Allow | Allow ✓ | restore fails E11000 if slot reused | (DATA-008) restore-test |
| Teacher | `GET /users` | list | Allow per UI (`useRole`) | **DENY** (route Admin-only) | **AUTHZ-003** | reconcile UI |
| Teacher | `GET /users/:id` | read | DENY | DENY ✓ | – | – |
| Participant | `GET /users` | list | DENY | DENY ✓ | – | – |
| Participant | `GET /auth/me` | self | Allow | Allow ✓ | – | – |
| Admin | `*` `/teams` | full | Allow | Allow ✓ | – | – |
| Admin | `PUT /teams/:id` (members / leader) | manage | Allow inside tx | Allow + tx ✓ | race in `checkMemberConflicts` | (DATA-001) `team-leader-exclusivity.test` |
| Participant | `GET /teams/my-teams` | own | Allow | Allow ✓ | – | – |
| Participant Leader | `PUT /teams/:id` | manage own (future) | DENY (Admin only today) | DENY (intentional) | document | – |
| Teacher | `GET /teams` | per UI | **DENY** (Admin only) | DENY ✓ | UI lies | reconcile UI |
| Admin | `*` `/classes` | full | Allow | Allow ✓ | – | – |
| Teacher | `GET /classes` | list | Allow | Allow ✓ | – | – |
| Teacher | `POST/PUT/DELETE /classes` | DENY | DENY ✓ | – | – | – |
| Participant | `GET /classes/:id` | read | Allow if enrolled | Allow (no scope) | **AUTHZ-004** | `class.canView.test` |
| Admin | `GET /schedules` | list all | Allow | Allow ✓ | – | – |
| Teacher | `GET /schedules` | scoped to taught | **Allow all (PII leak)** | unrestricted | **AUTHZ-002** | `schedule.teacherScope.test` |
| Participant | `GET /schedules` | own enrollments | scoped ✓ | scoped ✓ | – | `scheduleAuthz.test.js:86` |
| Participant Leader | `POST /schedules/book-slot` | book own team | leader-gated | OK ✓ | – | `booking.test.js:132` |
| Teacher | `POST /schedules/book-slot` | DENY | DENY ✓ | – | – | – |
| Admin | `POST /schedules` (admin-create) | full | Allow ✓ | – | – | `booking.test` |
| Admin | `PUT /schedules/:id` | update | Allow | Allow ✓ | – | – |
| Admin | `DELETE /schedules/:id` (cancelSlot) | cancel | Allow + tx | Allow + tx, **wipes past attendance** | **DATA-005** | `cancel-past-schedule-blocked.test` |
| Admin / Teacher | `POST /attendance/:scheduleId` (bulk-mark) | for taught class | **Any class** | unrestricted | **AUTHZ-001** | `attendance.canMark.test` |
| Admin / Teacher | `GET /attendance/schedule/:id` | for taught class | **Any class** | unrestricted | **AUTHZ-001** | – |
| Admin / Teacher | `GET /attendance/user/:other` | other user | Allow | Allow ✓ | – | – |
| Participant | `GET /attendance/user/:self` | own | Allow | Allow ✓ via inline check | – | – |
| Participant | `GET /attendance/analytics/*` | DENY org-wide | DENY ✓ | – | – | – |
| Admin / Teacher | `POST /evaluations` | for taught class | **Any class** | unrestricted | **AUTHZ-001** | `evaluation.canWrite.test` |
| Admin / Teacher | `GET /evaluations?classId=` | for taught class | **Any class** | unrestricted (audit only) | **AUTHZ-001** | `evaluation.canRead.test` |
| Participant | `GET /evaluations` | own only | scoped ✓ | scoped ✓ | – | `evaluationRoutes.test.js:256` |
| Admin | `DELETE /evaluations/:id` | Allow | Allow ✓ | – | – | – |
| Teacher / Participant | `DELETE /evaluations/:id` | DENY | DENY ✓ | – | – | – |
| Admin | `*` `/enrollments` | full | Allow ✓ | – | no Zod validation | (SEC-011) `enrollmentValidation.test` |
| Admin | `*` `/dashboard` | full | Allow ✓ | – | – | – |
| Teacher / Participant | `/dashboard` | DENY | DENY ✓ | – | – | – |
| Admin | `*` `/admin-db` | restricted CRUD | Restricted | **MFA / passwordReset fields writable; Counter/Setting deletable** | **SEC-003 / SEC-010** | `adminDb.forbiddenFields.test` |
| Admin | `/admin/audit/*` | list / by entity | Allow ✓ | – | – | covered (`auditRoutes.test`) |
| Admin | `/admin/reconcile/*` | run | Allow ✓ | – | no audit on `run` (SEC-013) | `reconcile.runAudit.test` |
| Cron-token | `/cron/*` | run | constant-time ✓ | – | – | covered |
| Any | `/search` | scoped | scoped in service ✓ | – | – | covered (`searchRoutes.test.js:121`) |
| Admin | `POST /import/*` | bulk import | Admin + rate-limit | Admin + rate-limit, **no audit** | SEC-013 | `audit.write.test` |
| Admin | `GET /export/*` | bulk export | Admin + rate-limit + safe | Admin + rate-limit, **formula injection + no audit** | **SEC-004 / SEC-013** | `exportFormulaInjection.test` |
| Admin | `POST /sync/google-sheets` | sync | Admin + rate-limit | Admin + rate-limit, **no audit** | SEC-013 | – |
| Admin | `PUT /settings` | update | Admin + key allowlist | Admin + allowlist ✓, **no audit** | SEC-013 | – |

---

## E. Business Invariant Matrix

30 invariants × enforcement × required test.

| # | Invariant | Why it matters | Enforced now | Weakness | Fix | Test |
|---|---|---|---|---|---|---|
| 1 | One Active enrollment per (user, team) | Wrong reports / double-pull | DB partial unique `Enrollment {userId,teamId}` Active | OK | – | exists |
| 2 | One Active enrollment per user (cross-team) | One user one team | App-only `checkMemberConflicts` (`teamController.js:31`) | **Race DATA-001** | Partial unique `{userId}` Active + dedup migration | `enrollment.concurrent.test` |
| 3 | One Ongoing class per `classCode` | UX/state | Controller `findOne` only (`classController.js:113`) | **Race DATA-002** | Partial unique | `concurrent-ongoing-class.test` |
| 4 | One Schedule per `(classId, startTime)` | No double-book | DB unique ✓ | Overlap-non-exact only caught by tx range check | `readConcern:snapshot` | `overlapping-non-exact-collision.test` |
| 5 | Attendance only for enrolled users | Forge prevention | Service `enrolledSet.has` (`attendanceService.js:49`) | App-only | DB validator (`$jsonSchema`) | `attendance-enrollment-allowlist.test` |
| 6 | One Attendance per (schedule, user) | Dedup | DB unique ✓ | OK | – | exists |
| 7 | Attendance not for future session | Logic | Service ✓ (`attendanceService.js:30-35`) | – | – | exists |
| 8 | Attendance 30d edit window | Policy | Service (`attendanceService.js:38-46`) | – | – | – |
| 9 | Max 2 sessions / team / week | Cost cap | Service `countDocuments` in tx (`scheduleService.js:254`) | Race subtle | `weekBookings.{weekKey}` counter | `weekly-booking-cap-concurrent.test` |
| 10 | `endTime > startTime` on Schedule | Sanity | Service only | No DB validator | Mongoose cross-field validator | `schedule-time-sanity.test` |
| 11 | One Evaluation per (class, user) | Dedup | DB unique ✓ | – | – | exists |
| 12 | Evaluation 0–10 | Sanity | Schema ✓ | – | – | exists |
| 13 | Team Leader assignment exclusivity | UX | **None** | DATA-004 | Partial unique on `Team.leaderId` | `team-leader-exclusivity.test` |
| 14 | Class assigned to ≤ 1 team | UX | App only | **Race DATA-003** | Partial unique on `Team.classId` | `class-team-exclusivity-race.test` |
| 15 | User email unique (active) | Auth | DB partial `email {type:string}` | Soft-deleted email blocks new user / restore | DATA-008 | `email-uniqueness-vs-deleted.test` |
| 16 | empCode unique (active) | Auth | DB `unique:true` (no partial) | Soft-deleted empCode blocks restore | DATA-008 | `empcode-collision-vs-deleted.test` |
| 17 | Role transitions guarded | Privilege | Controller re-auth ✓ on cross-user | `importService` bulkWrite bypass | DATA-010 | `import-cannot-elevate-role.test` |
| 18 | Soft-delete auto-filter | Privacy | User+Team `pre('find')` | Team aggregate hook missing → **DATA-007** | Add hook | `team-aggregate-soft-delete-filter.test` |
| 19 | PIC / leader must be team member | UX | Controller | App only | `pre('validate')` | – |
| 20 | Counter atomic | Sequence | DB upsert ✓ | Not session-aware | Document: never call inside `withTransaction` | exists (k6) |
| 21 | TTL on AuditLog & TokenBlocklist | Retention | DB TTL ✓ | Changing TTL env requires `dropIndex` + recreate | Runbook | `auditlog-ttl-applied.test` |
| 22 | Past attendance preserved | Compliance | **None** | DATA-005 — `cancelSlot` deletes | Guard `startTime < now` | `cancel-past-schedule-blocked.test` |
| 23 | Replica-set required for tx | Tx | Startup check ✓ | – | – | `rs-topology.test` |
| 24 | Teacher only writes own class eval | AuthZ | **None** | **AUTHZ-001** | `Class.teacherIds` + policy | `teacher.canWriteEval.test` |
| 25 | Teacher only marks own class attendance | AuthZ | **None** | **AUTHZ-001** | Same | `teacher.canMarkAttendance.test` |
| 26 | Participant cannot see other participant's records | Privacy | Route + service scoping ✓ | – | – | `scheduleAuthz`, `evaluationRoutes` cover |
| 27 | Export cannot double-export | Idempotent | `updateMany PENDING→EXPORTING` ✓ | Race-covered ✓ | – | `p2-regression.test.js:94` |
| 28 | Soft-deleted users hidden | Privacy | User aggregate hook ✓ | Team aggregate hook missing + `$lookup` from attendance to users does not respect hook | DATA-007, DATA-009 | `attendance.softDeletedUserExcluded.test` |
| 29 | `mustChangePassword` enforces lockdown | UX | Middleware allowlist ✓ | – | – | exists |
| 30 | `mfaEnrollmentRequired` enforces lockdown | Security | Middleware allowlist + **change-password leak** | **SEC-007** | Remove from allowlist | `mfaEnrollment.changePasswordBlocked.test` |

### Critical missing reconcile rules

The reconciler today catches **5 of ~20 drift classes**. Highest-impact gaps (DATA-011):

| Rule | Impact if undetected |
|---|---|
| Two Active enrollments for same user cross-team | HIGH — violates invariant #2 |
| Schedule.classId → deleted Class | HIGH — orphan |
| Two teams share `classId` | HIGH — invariant #14 |
| Two Ongoing classes per code | HIGH — invariant #3 |
| `Counter.seq < max(empCode/classCode)` | HIGH — next create collides |
| Soft-deleted User in `Team.members` | MED — ghost UI |
| Schedule.bookedTeamId → soft-deleted Team | MED |
| Orphan Attendance / Evaluation refs | MED |
| TokenBlocklist TTL not pruning | LOW |
| AuditLog growth > retention | LOW |
