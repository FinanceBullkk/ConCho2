# TMS v2 — Dev Handoff: Tiếp theo cần làm gì

**Ngày:** 2026-05-25  
**Commit hiện tại:** `22f305d`  
**Tài liệu liên quan:** [`docs/audit/VERIFICATION-REPORT.md`](./VERIFICATION-REPORT.md)

---

## Mục lục

1. [Việc vừa hoàn thành](#1-việc-vừa-hoàn-thành)
2. [Việc cần làm ngay (P0/P1)](#2-việc-cần-làm-ngay-p0p1)
3. [Việc cần làm sprint sau (P2)](#3-việc-cần-làm-sprint-sau-p2)
4. [Việc cần làm quý sau (P3)](#4-việc-cần-làm-quý-sau-p3)
5. [Phase 5 — Refactor lớn](#5-phase-5--refactor-lớn)
6. [Phase 4 — Enterprise](#6-phase-4--enterprise)

---

## 1. Việc vừa hoàn thành

| # | ID | Việc đã làm | File đã sửa |
|---|-----|-------------|-------------|
| 1 | SEC-013 | Cron reconcile giờ có audit log | `server/jobs/reconcileJob.js` |
| 2 | PERF-001 | Export Excel giờ streaming (không buffer toàn bộ vào RAM) | `server/services/exportService.js`, `server/controllers/exportController.js` |
| 3 | CODE-007 | Modal backdrops có `aria-hidden="true"`, filter chips có keyboard nav | `client/src/pages/DashboardPage.jsx`, `CourseManager.jsx`, `DatabaseExplorer.jsx`, `TeamsPage.jsx`, `client/src/components/Progress/StudentProgressModal.jsx` |
| 4 | API-002 | `GET /api/teams` chấp nhận `?page=`, `?limit=`, `?slim=true` (backward compat) | `server/controllers/teamController.js`, `server/tests/integration/teams.test.js` (PR T) |
| 5 | CODE-007 | Lint ratchet 138 → 113 (-5 từ autofix + -20 từ FE-010 modal migrations) | `client/package.json`, `client/eslint.config.js` (PR U) |
| 6 | P2-09 (infra) | Playwright job vào CI với Mongo replica set, server boot, seed, browser install. CI hạ-tầng đã sẵn — đang INFORMATIONAL chờ rewrite specs (xem mục 2.4) | `.github/workflows/ci.yml` (PR V) |

---

## 2. Việc cần làm ngay (P0/P1)

> **Prompt cho dev:**  
> "Kiểm tra các file sau và sửa theo hướng dẫn. Mỗi việc nên hoàn thành trong 30 phút – 1 giờ."

### 2.1 DATA-013 — Validate `endTime > startTime`

| Thông tin | Chi tiết |
|-----------|----------|
| **File cần kiểm tra** | `server/models/Schedule.js` |
| **Việc cần làm** | Thêm validation trong Mongoose schema hoặc `pre('save')` hook để đảm bảo `endTime > startTime`. Nếu `endTime <= startTime` thì throw lỗi. |
| **Cách kiểm tra** | Viết test trong `server/tests/` tạo schedule với `endTime < startTime` → mong đợi lỗi validation. |
| **Effort** | S (30 phút) |
| **Priority** | P2 |

### 2.2 SEC-014 — Thêm `search` param vào Zod schema getUsers

| Thông tin | Chi tiết |
|-----------|----------|
| **File cần kiểm tra** | `server/schemas/` (tìm schema cho getUsers), `server/controllers/userController.js` |
| **Việc cần làm** | Zod schema cho `GET /api/users` đang thiếu param `search` → thêm `.search(z.string().optional())` vào query schema. |
| **Cách kiểm tra** | Gọi `GET /api/users?search=test` → không bị Zod reject. |
| **Effort** | S (30 phút) |
| **Priority** | P3 |

### 2.3 SEC-016 — `forgotPassword` nuốt lỗi DB

| Thông tin | Chi tiết |
|-----------|----------|
| **File cần kiểm tra** | `server/controllers/authController.js` (tìm hàm `forgotPassword`) |
| **Việc cần làm** | Hiện tại nếu DB update thất bại, user vẫn nhận 200. Cần log lỗi bằng `logger.error()` hoặc throw. Vẫn giữ timing-equivalent response (không leak info) nhưng phải ghi log. |
| **Cách kiểm tra** | Tạo test mock DB fail → verify log được gọi, response vẫn 200. |
| **Effort** | S (30 phút) |
| **Priority** | P3 |

### 2.4 P2-09 — Rewrite Playwright specs để promote E2E gate ✅ DONE in PR X

| Thông tin | Chi tiết |
|-----------|----------|
| **Status** | ✅ Resolved in audit PR X (sprint 4) |
| **What shipped** | (1) `playwright.config.js` pins `use.locale = 'en-US'` so the i18n LanguageDetector falls back to English in CI. (2) `navigation.spec.js` + `permissions.spec.js` + `users-crud.spec.js` updated to the IA-S2/S3 routes (`/people`, `/programs`, `/calendar`, `/system`) — the legacy `/users`/`/teams`/`/classes`/`/schedules`/`/admin` paths are now host pages under section tabs. (3) `theme.spec.js` uses the i18n'd toggle aria-labels (`Switch to (light\|dark) mode`). (4) `continue-on-error: true` removed from the `e2e-tests` CI job — gate is REQUIRED again. |
| **Verification** | `npx playwright test --list` parses 22 tests across 5 files cleanly. End-to-end run requires the seed + server + Mongo replica set per CI. |
| **Follow-up** | Once a Vietnamese-language smoke suite is desired, add a second project to `playwright.config.js` with `use.locale = 'vi-VN'` — the i18n machinery already supports it. |

---

## 3. Việc cần làm sprint sau (P2)

> **Prompt cho dev:**  
> "Đọc VERIFICATION-REPORT.md mục 5.2 (Short-Term). Mỗi item có ID, file liên quan, và mô tả chi tiết."

| ID | Việc | File cần kiểm tra | Effort |
|----|------|-------------------|--------|
| DATA-012 | Counter model session-awareness | `server/models/Counter.js` | M |
| ~~SEC-014~~ | ✅ DONE in PR W — strict listUsersQuery schema with search/sortBy/sortOrder caps | `server/schemas/user.js` | S |
| ~~SEC-016~~ | ✅ DONE in PR W — forgotPassword DB failures logged at error severity | `server/controllers/authController.js` | S |
| FE-015 | Bắt đầu audit i18n (tìm hardcoded strings) | `client/src/pages/*.jsx`, `client/src/components/*.jsx` | S |
| FE-016 | ParticipantDashboard greeting i18n | `client/src/pages/ParticipantDashboard.jsx` | S |
| OPS-006 | Lên lịch backup restore drill | Operator, không cần code | — |

---

## 4. Việc cần làm quý sau (P3)

> **Prompt cho dev:**  
> "Đọc VERIFICATION-REPORT.md mục 5.3 (Medium-Term). Đây là các việc lớn hơn, cần plan trước khi bắt đầu."

| ID | Việc | File cần kiểm tra | Effort |
|----|------|-------------------|--------|
| ~~API-002 + PERF-011~~ | ✅ DONE in PR T — `?page&limit&slim=true` with backward-compat | `server/controllers/teamController.js` | — |
| CODE-007 | Burn down a11y warnings further (cap 113, live 81 — target 0) | Chạy `npm run lint` trong `client/` để xem danh sách warnings | L |
| FE-017 | Dynamic `document.title` trên tất cả pages | `client/src/pages/*.jsx` (8 pages) | M |
| FE-019 | Dirty-check khi đóng modal | `client/src/pages/UsersPage.jsx`, `TeamsPage.jsx`, `ClassesPage.jsx` | M |
| SEC-017 | Migrate `mongoSanitize` → `express-mongo-sanitize` v2+ | `server/server.js`, `server/package.json` | M |
| CODE-009 | Thay `window.confirm` bằng Radix AlertDialog | `client/src/pages/TeamsPage.jsx`, `ClassesPage.jsx` | M |

---

## 5. Phase 5 — Refactor lớn

> **Prompt cho dev:**  
> "Đọc VERIFICATION-REPORT.md mục 4.2 (Deferred High-Priority Items). Đây là refactor kiến trúc, cần thảo luận team trước."

| ID | Việc | File liên quan | Effort |
|----|------|----------------|--------|
| API-001 | Response shape consistency | Tất cả controllers trong `server/controllers/` | L |
| API-003 | Tách business logic ra service layer | `server/controllers/` → `server/services/` | L |
| CODE-004 | Xóa cross-controller import | `server/controllers/enrollmentController.js` (import từ teamController) | M |
| CODE-005 | Chia nhỏ files > 400 lines | Xem danh sách trong report | L |
| CODE-010 | Deduplicate conflict/cap/isLeader logic | `server/services/teamService.js`, `server/controllers/teamController.js` | M |
| CODE-011 | Thêm `asyncHandler` wrapper | Tất cả route files trong `server/routes/` | M |
| CODE-012 | Hard-coded `vi-VN` → i18n | `client/src/pages/*.jsx` | L |

---

## 6. Phase 4 — Enterprise

> **Prompt cho dev:**  
> "Đọc VERIFICATION-REPORT.md mục 4.4 (Phase 4). Đây là feature mới, cần design doc trước khi code."

| ID | Việc | Quý |
|----|------|-----|
| PROD-001 | SSO/SAML/OIDC | Q2 |
| PROD-004 | GDPR compliance | Q2 |
| PROD-005 | Multi-tenant | Q2 |
| PROD-007 | Whitelabel branding | Q2 |
| PROD-002 | Org hierarchy | Q3 |
| PROD-003 | LMS modules | Q3 |

---

## Cách sử dụng tài liệu này

1. **Mở `docs/audit/VERIFICATION-REPORT.md`** để xem chi tiết từng finding (mục 6 — Appendix)
2. **Mỗi finding có ID** (ví dụ `SEC-013`, `DATA-013`) — tra trong Appendix để biết:
   - Status hiện tại (✅/⚠️/❌)
   - File nào cần sửa
   - Notes từ auditor
3. **Sau khi sửa xong**, cập nhật status trong Appendix từ ❌ → ✅
4. **Chạy test** trước khi commit: `cd server && npm test` hoặc `cd client && npm test`
5. **Kiểm tra lint**: `cd client && npx eslint src/` để đảm bảo không tăng số warnings

---

## Checklist nhanh cho dev

```
□ Đọc VERIFICATION-REPORT.md mục 3 (Partial) và mục 4 (Not Done)
□ Chọn 1-2 việc theo priority (P0 trước, rồi P1, P2...)
□ Kiểm tra file được chỉ định trong cột "File cần kiểm tra"
□ Implement fix theo mô tả
□ Viết test nếu chưa có
□ Chạy `npm test` trong thư mục tương ứng (server/ hoặc client/)
□ Chạy `npx eslint src/` (client) để kiểm tra lint
□ Cập nhật status trong VERIFICATION-REPORT.md
□ Commit với message: `fix(<ID>): <mô tả ngắn gọn>`
```

---

*Generated 2026-05-25. Cập nhật sau mỗi sprint.*