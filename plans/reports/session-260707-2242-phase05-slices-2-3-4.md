# Session 2026-07-07 tối — Phase-05 slices 2/3/4 (PG migration cutover blockers)

## Đã ship
- **Slice 2 MERGED** (#262, squash `81356a1`, 9/9 gates): mig 033 `counters` (id=tên counter, gapless `ON CONFLICT DO UPDATE seq=seq+1 RETURNING`) + `token_blocklist` (seam `services/auth/token-blocklist-repository.{js,mongo,pg}`, TTL ⇔ purge window days-0). `helpers/counter.js` = dual seam kiểu unit-of-work. Đi kèm: de-flake audit fire-and-forget suite-wide — `pollUntil` trong `tests/pg-test-utils.js` thay sleep cố định (trainer/planning/adminDb×2/reportsEvidencePack; trainer 30ms từng fail gate #8 CI). Parity: counter 4/4 (gapless-rollback + N-concurrent) · token-blocklist 4/4 · retention-purge 5/5.
- **Owner standing approval** (memory `concho2-phase05-merge-approval`): tự squash-merge PR phase-05 slice 2–5 khi 9/9 gates xanh. KHÔNG phủ H/I/J.

## Slice 3 — code xong, đang verify full
Branch `fix/pg-cutover-slice3-calendar-notification-seed` (rebased lên main sau #262; docs committed).
- A3: calendar-sync → `findScheduleForCalendarSync` (read đã dual sẵn) + `updateScheduleById`; **fix `meetLink → meet_link` vào UPDATE_COLS pg repo** (không có → link rơi vào meta, read đọc cột → mất). Parity case mới trong `schedule-update-team.pg.test.js`.
- A4–A6: seam ghi chung `insertLog`/`updateLogById` trên notification repo (23505→11000 qua unique mig 032); in-app-writer + expiry-reminder + assignment-reminder swap. Parity +3 case.
- A8: `upsertSystemRuleByName` (soft-deleted system rule KHÔNG hồi sinh — khớp Mongo; divergence lành: Mongoose minimize bỏ `params:{}`). Parity +1.
- 11 integration suite reverse-assert (~30 chỗ NotificationLog/AutomationRule → findActiveRowWhere/countActiveRowsWhere/distinctActiveValues; enrollmentTransfer pre-clean → deleteActiveRowsWhere).
- Verified: PG targeted 16 suite (172) + parity 19/19; Mongo targeted 192/192. **PG FULL suite đang chạy nền** (`slice3-pg-full.log`) → còn: Mongo full → push → PR → merge (standing approval).

## Slice 4 — CODE + TESTS xong trong worktree, CHƯA verify
Worktree `/Users/hao/Documents/GitHub/ConCho2-slice4`, branch `fix/pg-cutover-slice4-b-tail` (stacked trên slice-3; rebase sau khi slice-3 merge). 3 commit WIP.
- B4 settings repo (`domains/settings/`) + settingController. B3 evaluation repo (`domains/evaluation/`, revive-upsert ON CONFLICT, averageScore mapper, populate embeds) + evaluationController (policy Class reads → `class-repository.findClassLeanById`). B5 sync write → `updateScheduleById`+`applyRosterDelta` (**bulk READS Team/Class/Schedule của syncController vẫn Mongo — follow-up đã ghi trong phase-05 doc**). B7 **mig 034** `schedules.reminders_sent_at`+index; claim/refetch/rollback seams; reminderService swap. B2-tail enrollment-status → runInTransaction + `updateEnrollmentById`/`bulkUpdateEnrollmentsByIds`/`findEnrollmentByIdPopulated`; shared pull = `scheduleRepo.pullUsersFromFutureSchedules(userIds, tx)` (trả modifiedCount). B6 import → runInTransaction + `booking-write.insertSession` + `attendanceRepo.insertAttendanceMany` + `user-repository.bulkUpsertUsersByEmpCode` + `class-repository.bulkUpsertClassesByCodeCourse` (xmax + IS DISTINCT ⇔ Mongo counts; bỏ IMPORT_TX_MAX_MS). B1 user-lifecycle (delete + restore) → runInTransaction + `controllers/user/user-repository.{js,mongo,pg}` (junction pull, parking `_softDeletedEmail` → users.meta jsonb).
- Parity mới: `settings-repository` · `evaluation-repository` · `schedule-reminder-claim` · `user-import-lifecycle-repository`. Reverse-asserts: evaluationRoutes/phaseAHardening/userRoutes/auditDataRound2/scheduleCancel/enrollmentRoutes/softDeleteEmpCodeReuse/reminderPerf.
- **Việc còn cho slice 4**: (1) sau khi slice-3 merge → rebase; (2) apply mig 034 lên docker `tms-pg` (`npx knex migrate:latest --knexfile db/pg/knexfile.js` với PG_URL ci@localhost/tmsci — KHÔNG chạy khi jest đang chạy); (3) targeted 2 lane: các parity mới + evaluationRoutes teacherBinding auditDataRound2 auditFlowsRound3 settings userRoutes softDeleteEmpCodeReuse phaseAHardening reminderPerf scheduleCancel enrollmentRoutes myEnrollments importRoutes?(phaseA) — chạy từ MAIN TREE sau khi merge branch vào (worktree không có node_modules); (4) full 2 lane; (5) docs (roadmap entry + phase-05: B1–B7 CLOSED, note B5-reads + IMPORT_TX_MAX_MS retirement) + spec? (không đổi behavior — skip); (6) PR + merge (standing approval).

## Còn lại sau slice 4
- Slice 5: F3 counter trong pg-auto-mirror (fail gate nếu production Mongoose write bắn trên pg lane; phân biệt fixture bằng module flag quanh setup hooks).
- H: `scripts/etl-mongo-to-pg.js` (stream, ObjectId→text, checksum + row count, diễn tập Neon branch). I: mig FK REFERENCES+CHECK sau ETL sạch. J: checklist cutover (owner). D-CronRun còn mở (port `cron_runs` hoặc advisory lock). Reconcile RETIRE khi cutover.

## Quy tắc vận hành (nhắc phiên sau)
run-pg.sh/run-mongo.sh trong scratchpad (lock `/tmp/concho2-jest.lock` + caffeinate + heap 8G). Không 2 jest song song/liền trong 1 lệnh; không sửa source khi jest full đang chạy (worktree thì OK); verify cả 2 lane mỗi slice; merge chỉ khi 9/9 xanh.

## Unresolved
1. B5 bulk reads (Team/Class/Schedule của syncController) — port hay chấp nhận chết-lúc-cutover có chủ đích? (đã ghi follow-up trong phase-05 doc; đề xuất: port trong slice dọn READS trước Wave J).
2. importService mất `maxCommitTimeMS` khi lên UoW — có cần UoW hỗ trợ tx options?
3. adminDb negative-assert (audit-absence) vẫn sleep 50ms — poll không chứng minh phủ định; chấp nhận.

## CẬP NHẬT 2026-07-08 ~02:15 (tiếp phiên)
- **Slice 3 MERGED** (#263, squash `1f8b3e0`, 9/9 gates — gate #8 CI pass xác nhận 3 fail local là load-flake). De-flake thêm enrollmentRoutes + financeBudget + vendor (pollUntil).
- **Slice 4** giờ ở branch `fix/pg-cutover-slice4-b-tail` TRONG MAIN TREE (worktree đã xoá; rebase sạch lên main sau #263 — 1 conflict import line đã resolve). **Mig 034 đã apply lên docker tmsci (Batch 4).**
- **Parity slice-4: 4/4 suite, 12/12 test XANH trên PG lane** sau 3 fix (commit "slice 4 verification round 1"):
  1. `user-repository.mongo` parking/restore → Mongoose `User.updateOne` + cast ObjectId (bài học: fix cast ở worktree bị mất do `git add -A server/tests` không cover + `worktree remove --force`; raw driver string-id match nothing).
  2. PG bulk upserts (user/class): bỏ IS DISTINCT guard — Mongoose timestamps bump updatedAt nên Mongo modifiedCount==matched; PG giờ khớp.
  3. Fixture reminder-claim: startTime riêng cho mỗi row scheduled (partial-unique {classId,startTime}).
- **Đang chạy nền**: 12 suite integration slice-4 targeted PG lane (`slice4-pg-targeted.log`).
- **Còn lại slice 4**: đọc kết quả targeted PG → fix fallout nếu có → chạy cùng bộ trên Mongo lane → parity 4 file trên Mongo lane (cùng lệnh run-mongo) → full 2 lane → docs (roadmap entry + phase-05 B1–B7 CLOSED + note B5-reads follow-up) → push + PR → merge khi 9/9 (standing approval). Sau đó slice 5 (F3), H, I, J theo kế hoạch cũ.

## CẬP NHẬT 2026-07-08 ~02:55 — kết quả targeted PG slice-4: 8/12 pass, 4 suite / 6 test fail (chẩn đoán xong)
1. **teacherBinding (2 test, 403→200)**: `classRepo.findClassLeanById` PG twin có lẽ KHÔNG map `teacher_ids` → policy "open until populated" cho qua. FIX NHỎ: thêm `teacherIds` vào row mapper pg của `findClassLeanById` (check cả `findClassDocById`). Verify: teacherBinding + evaluationRoutes.
2. **evaluationRoutes SEC-014 (1 test, 400→200)**: PG nhận `classId=not-an-object-id` như text hợp lệ → 200 []. FIX: trong `domains/evaluation/repository.pg.js` `findAllPopulated` (và `findByIdPopulated`?) validate 24-hex; sai → throw lỗi `{name:'CastError', kind:'ObjectId', path, value}` để handleError trả 400 khớp Mongo. (Route :id đã có zod idParam nên chỉ query-filter cần.)
3. **userRoutes trash-list (1) + softDeleteEmpCodeReuse (2)**: B1 ghi PG-only nhưng userController CREATE (precheck empCode/email trùng) + TRASH LIST vẫn đọc/ghi Mongo → 409 khi tạo replacement với empCode đã "giải phóng" (bản Mongo chưa park) + trash list không thấy user vừa xoá. ĐÂY LÀ CASCADE reads-follow-writes (giống GATED cluster Wave G): cần port thêm trong B1: (a) precheck tạo user (User.findOne({empCode})/email → user-repository `findActiveUserByEmpCode/Email` ĐÃ CÓ SẴN — swap trong userController create/update); (b) trash listing read (`getUsers` deleted=true path) → đọc active backend (thêm read seam user-repository, vd `listTrashedUsers` / hoặc list users chung nếu đường đó là chung); (c) CHÚ Ý: `User.create` của create-user path vẫn Mongoose — trên pg lane test xanh nhờ auto-mirror, không phải cutover-blocker của write-gate? SAI — create là WRITE production → thuộc write-gate → cần port create (dual insert user) hoặc ghi rõ là user-mutations seam thuộc slice riêng. Đề xuất: port trọn user CRUD seam trong slice 4 (đã có user-repository làm chỗ chứa) — xem `controllers/user/` (user-mutations? getUsers?) để định vị chính xác các call sites.
- Sau 3 fix: chạy lại 4 suite fail trên PG → cả 12 targeted PG → cùng bộ + 4 parity trên Mongo → full 2 lane → docs → PR.

## Owner decisions 2026-07-08 ~02:15
- **Prod PG = Neon FREE** (thực tế ~100 users; 1000 là kỳ vọng xa). Điều kiện đi kèm: đo data size lúc ETL dry-run (<0.5GB), chấp nhận autosuspend cold-start (hoặc tái dùng cron-pinger trong giờ làm việc), thêm pg_dump backup job vào checklist J + cập nhật docs/backup-dr.md (Neon free chỉ giữ ~6h history). "Neon paid" GỠ khỏi blocker J.
- **Bake sau cutover: rút ngắn** — owner muốn dùng PG ngay; đề xuất giữ Atlas read-only nằm im 1–2 tuần (chốt số cụ thể lúc J) rồi hủy. App chạy 100% PG từ ngày flip bất kể bake.

## CẬP NHẬT 2026-07-08 ~03:25 — slice 4 targeted XANH CẢ 2 LANE
- Round-2 fixes committed: user-mutations-repository split dual (PG twin replicate pre-save hash + status→Dropped auto-release hook); listTrashedUsers (user-list-repository) + getDeletedUsers swap; classRow PG thêm teacherIds; evaluation PG CastError contract; profile cols (drop_reason/entrance_level/current_level) là CỘT thật mig 031 (không phải meta).
- Targeted PG: 16 suite / 174 test XANH. Targeted Mongo: 16 suite / 174 test XANH.
- Docs slice-4 committed (roadmap entry + phase-05 refresh + roll E1–E3 sang q3 archive; roadmap 381 dòng).
- **Đang chạy nền: FULL PG suite** (`slice4-pg-full.log`) → tiếp: full Mongo → push → PR → merge (standing approval).
- Prompt điều phối session sau đã đưa owner (inline trong chat) — bao phủ: ship slice 4 → slice 5 F3 → D-CronRun → H ETL (+đo size Neon free) → I FK (viết sẵn) → pg_dump backup → B5-reads → J checklist (owner chốt ngày + bake).
