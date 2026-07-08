# Phase-05 slice 3–4 port-prep inventory — remaining raw-Mongoose production writes (A3–B7)

Explore-agent sweep, verified against source 2026-07-07 (post slice-2). Source of truth for slice 3 (A3–A6, A8) + slice 4 (B1–B7). Companion to `plans/260612-2042-postgresql-migration/phase-05-cutover-decommission.md`.

**Shared fact — NotificationLog dedupe tuple** (A4/A5/A6/A7):
`models/NotificationLog.js:64-75` unique = **(type, channel, recipientEmail, recipientUserId, assignmentId, learnerId, cadenceKey)**. PG twin = mig 032 `uq_notification_logs_dedupe … NULLS NOT DISTINCT`. No schema gap — only write methods + `23505→{code:11000}` mapper missing.
- A5+A6 rely on E11000 EXPLICITLY (`createLog` catches `code===11000 → null`).
- A4 implicitly (catch-all swallow, comment names E11000 as idempotent no-op).
- Precedent: `waitlist/repository.{mongo,pg}` `insertPromotionLog`/`setPromotionLogStatus` (#256).

## A3 — domains/schedule/calendar-sync.js
- ONE raw write: `calendar-sync.js:74-77` `Schedule.updateOne({_id},{$set:{googleEventId, meetLink}})`. Both create+sync paths funnel here. Fail-soft, no tx, no upsert.
- Seam EXISTS: `domains/schedule/repository.updateScheduleById(id, data, tx)` (mongo:144, pg:552). No new method.
- **REAL PG GAP:** `meetLink` NOT in `UPDATE_COLS` (repository.pg.js:546-548 = classId,bookedTeamId,roomId,roomLink,topic) → lands in `meta` jsonb, but `baseSchedule` (pg:48) reads `meetLink` from the `meet_link` COLUMN (mig 020) → writeback silently dropped on PG read. Fix: add `meetLink: 'meet_link'` to UPDATE_COLS; verify insertSession writes meet_link (grep found no pg write site today). `googleEventId` rides `meta` by design (no column) — OK.
- Jest: no direct suite (fail-soft side-effect); pg field-mapper via parity suites.

## A4 — domains/notification/in-app-writer.js
- `in-app-writer.js:17-26` `NotificationLog.create` (channel in_app, status sent, sentAt now, learnerId||recipientUserId). try/catch swallow-all. No tx.
- Seam: notification repository is read/mark-only → NEW `repository.createLog(data)` (mongo create ⇔ pg INSERT, 23505→11000).
- Jest: notifications-mine, notification-repository-dual-backend (read surface only).

## A5 — learning/completion/expiry-reminder-service.js
- `:34` create (`createLog`), `:42-45` updateOne `$set` (`finishLog`). Callers :70,:89,:92,:123,:155,:158. types certificate_expiring / manager_certificate_expiry_digest; cadenceKey `<certNumber>:<expiry_7|expiry_30>` / `manager_cert_expiry_<isoWeek>`. E11000 → null (bucket sent). No tx.
- Seam: SAME shared `repository.createLog` + `repository.finishLog(id, patch)` — A5/A6 helpers byte-identical, hoist into notification repo.
- Jest: certificateExpiryReminders, learningCertificateExpiryRoutes.

## A6 — learning/assignment/reminder-service.js
- `:34` create, `:42-45` updateOne; callers :51,:128, finish :86,:91,:148,:154. types assignment_due_soon/overdue/manager_assignment_digest + assignmentId/learnerId. Identical shape to A5.
- Seam: shared notification createLog/finishLog covers A4+A5+A6.
- Jest: assignmentReminderRoutes, learningAssignmentRoutes, unit/assignmentReminderCadence.

## A8 — domains/automation/seed.js
- `:33-37` `AutomationRule.updateOne({name, system:true},{$setOnInsert:rule},{upsert:true})` loop. Boot-time idempotent. No tx.
- Seam: automation repository has NO upsert → NEW `upsertSystemRuleByName(rule)` (pg: `INSERT … ON CONFLICT (name) WHERE system…DO NOTHING` — mig 017 partial unique `uq_automation_rules_system_name ON (name) WHERE system=true AND is_deleted=false` supports it exactly).
- Jest: automation.test.js, pg-parity/automation-repository.

## B1 — controllers/user/user-lifecycle.js (soft-DELETE cascade)
- In ONE `session.withTransaction` (:53-115): `:61` Team.updateMany $pull members; `:71` Schedule.updateMany $pull enrolledUsers (future, scheduled); `:79` Enrollment.updateMany → Dropped+leftAt; `:98-111` RAW `User.collection.updateOne` (isDeleted + empCode parking `__DEL_<ts36>` + email→null, original → `_softDeletedEmail`). restoreUser :169/:181/:193 mirrors (restore path).
- Seams: Schedule → roster-sync exists BUT opens its own tx → prefer tx-accepting bulk seam; Team → `groups/enrollment-sync-repository.pullTeamMember(teamId,userId,tx)` (bulk: loop or new bulk method); Enrollment → `dropEnrollment(id,{leftAt},tx)` / new `bulkDropActiveByUser(userId,tx)`; User soft-delete parking → NO seam yet, new `softDeleteUser(userId,{parkedEmpCode, parkedEmail})`. Re-home tx on unit-of-work.
- PG: tables exist; Team.members ⇔ team_members junction (DELETE); `_softDeletedEmail` → users.meta jsonb; partial-uniques `uq_users_emp_code_active`/`uq_users_email_active WHERE is_deleted=false` must stay satisfied by parking.
- Jest: userRoutes, softDeleteEmpCodeReuse.

## B2-tail — enrollment-status.js:48,131 + enrollment-shared.js:59
- `:48` findByIdAndUpdate single; `:131` updateMany bulk (both in withTransaction :47-59/:130-140 — BUG#2 atomicity); shared `:59` Schedule.updateMany $pull enrolledUsers (future live; NO promote/sweep).
- Seams: NEW `updateEnrollmentStatus(id,patch,tx)` + `bulkUpdateEnrollmentStatus(ids,patch,tx)` on learning/enrollment repo; Schedule pull → `findFutureUserSchedules`+`applyRosterDelta` loop (also no promote/sweep — semantics match) or new bulk `pullUsersFromFutureSchedules(userIds,tx)`. Re-home on unit-of-work.
- Jest: enrollmentRoutes, enrollmentTransfer, enrollment-repository-dual-backend, myEnrollments.

## B3 — evaluationController.js:74,247
- `:74-80` findOneAndUpdate upsert-by-(classId,userId) INCLUDING trashed (`isDeleted:{$in:[true,false,null]}`) — revive-in-place (DATA-014), `$setOnInsert:{createdBy}`; `:247` findByIdAndUpdate soft-delete. No tx.
- **Plan correction: `evaluations` PG table EXISTS** (mig 011:55-70 + FULL unique `uq_evaluations_class_user` — mig comment cites the revive upsert). Gap = missing repository, not table.
- Seam: NEW `domains/evaluation/repository.{js,mongo,pg}`: `upsertEvaluation` (pg `ON CONFLICT (class_id,user_id) DO UPDATE` + revive), `softDeleteEvaluation(id)`, + reads (findForClassUser, list, findById, roster).
- Jest: evaluationRoutes, teacherBinding, auditDataRound2 (revive), auditFlowsRound3 (roster).

## B4 — settingController.js:54
- `:54-62` `Setting.bulkWrite` upsert-by-key (whitelist ALLOWED_TIME_SLOTS). Reads :9,:49,:65. No tx.
- **Plan correction: `settings` table exists** (mig 016 + uq_settings_key); Setting IS mapped in pg-row-mappers (:132-133) — pg-auto-mirror header "Setting intentionally unmapped" is STALE. Only the schedule pg repo reads settings on PG today (`findAllowedTimeSlotsSetting`).
- Seam: NEW `domains/settings/repository`: `findAll()`, `findByKeys(keys)`, `upsertMany([{key,value}])` (pg ON CONFLICT (key) DO UPDATE).
- Jest: settings.test.js.

## B5 — syncController.js:270
- `:270` `Schedule.bulkWrite` — per row updateOne `{$set:{bookedTeamId}, $push:{enrolledUsers:$each memberIds}}`. No upsert/tx.
- Seam: per-row `updateScheduleById(id,{bookedTeamId},tx)` + `applyRosterDelta(id,[],memberIds,tx)`; or new `bookTeamAndAddMembers`. No schema gap (booked_team_id + enrolled_users text[] mig 001).
- Jest: effectively uncovered (phaseAHardening + rateLimiterWiring only reference /api/sync).

## B6 — importController.js:88,108 + importService.js:180,276
- Models: **Schedule, Attendance, User, Class**. `importController:88-98` Schedule.create({session}) + `:108` Attendance.insertMany({session}) — per-session withTransaction (:86-111, counters post-tx). `importService:180` User.bulkWrite upsert-by-empCode ($setOnInsert role/password — privilege-escalation guard) + `:276` Class.bulkWrite upsert-by-(classCode,courseName); both in tx. Trash guards pre-check isDeleted.
- Seams: schedule insertSession exists; NEW `insertAttendanceMany(rows,tx)`; NEW users `bulkUpsertByEmpCode`; NEW classes `bulkUpsertByCodeCourse`. MUST re-home on unit-of-work (plan Q#4).
- PG: tables + partial-uniques exist (uq_users_emp_code_active, uq_classes_code_course_active; schedules.capacity mig 027). No missing columns.
- Jest: phaseAHardening (import hardening/trash guards) only.

## B7 — services/reminderService.js:93,160
- `:93` updateMany bulk CLAIM (`remindersSentAt` null/missing + window → set claimStamp; atomic concurrency control); `:97` re-fetch by exact claimStamp; `:160-163` rollback → null. No tx (the atomic updateMany IS the guard).
- Seam: NEW `claimUpcomingReminders(now,windowEnd,claimStamp)` + `findByReminderStamp(claimStamp)` + `rollbackReminderClaim(ids)` on schedule repo.
- **REAL PG GAP:** no `reminders_sent_at` column (Mongo field + (remindersSentAt,startTime) index — models/Schedule.js:176,:280); meta-jsonb ride would make exact-stamp refetch unindexable → add dedicated `reminders_sent_at timestamptz` + index (mig 034 candidate).
- Jest: reminderPerf, scheduleCancel.

## Cross-cutting
- ONE shared notification write seam (createLog+finishLog, 23505→11000) closes A4+A5+A6 (precedent #256).
- 2 real PG schema gaps: A3 meetLink UPDATE_COLS; B7 reminders_sent_at column.
- Plan corrections: B3 evaluations table EXISTS (mig 011); B4 settings table EXISTS (mig 016), pg-auto-mirror "Setting unmapped" comment stale.
- Re-home on unit-of-work: B1, B2-tail, B6.

## Unresolved questions
1. B1: bulk seams accept enclosing tx vs loop per-row through existing per-id seams (perf at ~1000 users OK either way — favor tx-accepting bulk for atomicity clarity).
2. B7: confirm mig 034 `reminders_sent_at` column vs meta-jsonb (recommend column — claim concurrency).
3. B5 has no test coverage — add a sync-controller suite with the port or accept reverse-assert-only?
