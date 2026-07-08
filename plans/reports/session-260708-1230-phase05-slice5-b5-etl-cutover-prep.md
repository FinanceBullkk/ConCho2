# Session 2026-07-08 — Phase-05 hoàn tất đến "ready to run on Postgres" (slices 4/5 + B5 + H/I/backup + J checklist)

## Đã ship (merged)
- **#264 slice 4 (B1–B7)** — squash `a763a52`, 9/9 gates. Full-run evidence: targeted 16 suite/174 cả 2 lane · full PG 220/224 (3 load-flake + **1 fail THẬT**: p2-regression P2-03R còn đọc Mongo sau khi B2-tail ghi qua seam → reverse-assert, nằm trong PR) · full Mongo 224/224, 1643/1643.
- **#265 slice 5 (F3 write-gate + D-CronRun)** — squash `4a7680b`, 9/9 gates (gate #8 19m PASS **với write-gate active** = CI chính thức chứng minh zero raw-Mongoose production write).
  - D-CronRun: mig 035 `cron_runs` + seam `lib/cron-run-repository.{js,mongo,pg}` (COALESCE giữ lastSuccessAt qua error-run; bigint cadence → Number; advisory-lock bị bác — CronRun là state, không phải lock). Parity 5 case; 3 integration suite reverse-assert.
  - F3 `tests/pg-write-gate.js`: stack-frame attribution tại mọi Mongoose write entry (Model statics + save + raw collection); sanction: `/server/tests/`, `*.mongo.js`, reconcile (retire), adminDbRoutes (tracked E1); violation → JSONL (env sink từ global-setup) → **global-teardown THROW** (forceExit-safe). Flag-quanh-hooks bị bác bằng đo đạc: 63/126 file integration ghi fixture trong test body.
  - **Gate trả giá trị ngay 2 run đầu:** (1) bắt `routes/adminDbRoutes.js:236` — write production NGOÀI inventory (grep gốc bỏ sót `routes/`) → sanction+track, đề xuất RETIRE explorer lúc cutover (Neon console thay); (2) false-positive `TenantConfig.getSingleton` (static gọi từ `.mongo.js` sanctioned) → fix `models/` frames transparent (attribute về caller thật; models-only stack vẫn violation).

## Đang chờ gates / owner
- **#266 B5-reads** — sync bulk reads lên seam (`findAllTeams` tái dùng · `findAllClassCodesLean` · `findLiveSchedulesForSync` mới); **capacity guard hồi sinh** (virtual `enrolledCount` + `.lean()` = guard chết từ trước → spec delta `export-and-integrations` + scenario mới); suite `/api/sync` đầu tiên (4 case, mock googleapis) + parity 2 case. Verify post-rebase: Mongo 16/16 · PG 7/7 gate im lặng. **Merge khi 9/9 (standing approval)** — nếu session kết thúc trước: cứ `gh pr checks 266` → xanh → squash merge.
- **#267 H+I+backup — CHỜ OWNER, KHÔNG tự merge.** 4 quyết định cần chốt (ghi trong PR body): (1) custody `BACKUP_PASSPHRASE` (mất = backup vô dụng); (2) backup destination (GH artifact 30d, second copy = owner tải hàng tháng); (3) `waitlist_entries.schedule_id ON DELETE CASCADE` (promoteAndSweep hard-delete placeholder); (4) tạo secrets `NEON_PG_URL`/`BACKUP_PASSPHRASE`. Lưu ý: sau khi #266 merge, PR #267 sẽ conflict roadmap changelog (2 entry cùng vị trí) — resolve giữ cả hai, H+I trên cùng.

## H — ETL đã diễn tập end-to-end (dry-run 2026-07-08)
mongod throwaway (cache mongodb-memory-server, port 27099) + `seed.js` → `tms_etl_dry` (docker tms-pg, migrate 001–035 bằng thư mục lọc) → ETL: **11 collection, row-count khớp 100%, 0 dangling refs, size 10MB ≪ 0.5GB Neon-free gate** → **apply mig 036 sạch trên data ETL + rollback/re-apply OK** — đúng thứ tự Wave-J (migrate → ETL → verify → 036). Size thật đo lại ở prod dry-run (Atlas → Neon branch) tại J.

## Trạng thái phase-05 sau session
- Inventory A/B/C/D: **ĐÓNG HẾT** (A1–A8, B1–B7, C retire, D-Counter/TokenBlocklist/CronRun; ReconcileReport retire).
- F3 gate: **machine-enforced trên CI gate #8**.
- Còn: **E1 adminDbRoutes disposition (owner)** · **J execution (owner chốt ngày + bake 1–2 tuần)** · Wave K sau bake.
- `cutover-checklist.md` (merged trong #264): 10 bước, phân 🧪 diễn tập được / 🔒 chờ owner.

## Infra/ops notes cho session sau
- mig 035 đã apply vào docker `tmsci`; **mig 036 CHƯA và KHÔNG apply vào tmsci/CI** (chỉ Wave-J post-ETL). DB diễn tập `tms_etl_dry` còn trên docker (xoá được: `docker exec tms-pg psql -U ci -d postgres -c 'DROP DATABASE tms_etl_dry'`).
- Worktree `/Users/hao/Documents/GitHub/ConCho2-slice5` còn 3 branch đã push + symlink `server/node_modules` → main tree. Dọn: `rm server/node_modules` (symlink) → `git worktree remove`. GIỮ nếu muốn sửa tiếp PR #267 theo review owner.
- Memory `concho2-jest-export-suite-deadlock` đã cập nhật: (1) KHÔNG chạy agents song song full-jest (14 suite flake); (2) worktree chạy jest qua symlink deps; (3) quy trình xử lý write-gate violation. Lane mongo local từ worktree: 65 parity suite skip là ĐÚNG (thiếu `.env.pg-prototype` untracked — giống CI); main tree local chạy thêm parity vì có file đó.

## Unresolved (chờ owner)
1. E1: retire adminDb explorer lúc cutover hay rebuild PG explorer?
2. #267: 4 quyết định backup/FK ở trên.
3. J: ngày cutover + số tuần bake (1 hay 2) + ai gửi freeze comms (~100 users).
4. Neon PG major version — xác nhận `SELECT version()` lúc tạo project (workflow pin client 17).
