# Phase 6 Blocker · Server User-Facing Message Audit

**Mục đích:** Concrete list các backend message strings cần convert sang VN trong Phase 6 (Path A).

**Audit date:** 2026-05-20 (Phase 5 close)
**Total user-facing strings:** ~76 (~59 static + ~17 dynamic) · revised từ ~30 ban đầu (2.5× lớn hơn)
**Estimated effort:** 6-8 hours · 1 server PR · 0 schema changes · 0 new deps

**Method:** Grep `res.status(...).json({ ... message: '...' })` patterns trong `server/` directory · excluded test fixtures, console logs, library defaults.

**Strategy:**
- Convert static strings sang VN inline (cùng pattern như `teamController.js:277` đã có VN)
- Preserve template interpolation (e.g. `MFA disabled for ${user.empCode}` → `Đã tắt MFA cho ${user.empCode}`)
- Identifier + variable names giữ EN (per project memory: VN strings, EN identifiers)
- Test fixtures cập nhật cùng PR

**Out of scope:**
- `console.log` / `logger` messages (dev-facing, không reach user)
- Model schema validation messages (`{VALUE} is not a valid role`) — Mongoose enum default · giữ EN hoặc convert riêng nếu user thấy chúng (cần verify)
- Joi/Zod library defaults (đã EN, user thường không thấy)
- `err.message` re-thrown từ MongoDB/Mongoose (library messages)

---

## A · Authentication & Session (~14 strings)

| File:Line | Current (EN) | Suggested (VN) |
|---|---|---|
| [authController.js:163](server/controllers/authController.js#L163) | `Invalid code` | `Mã xác thực không đúng` |
| [authController.js:222](server/controllers/authController.js#L222) | `MFA is not enabled` | `MFA chưa được bật` |
| [authController.js:231](server/controllers/authController.js#L231) | `Invalid code` | `Mã xác thực không đúng` |
| [authController.js:249](server/controllers/authController.js#L249) | `MFA disabled` | `Đã tắt MFA` |
| [authController.js:267](server/controllers/authController.js#L267) | `User not found` | `Không tìm thấy người dùng` |
| [authController.js:286](server/controllers/authController.js#L286) | `MFA disabled for ${user.empCode}` | `Đã tắt MFA cho ${user.empCode}` |
| [authController.js:320](server/controllers/authController.js#L320) | `Logged out` | `Đã đăng xuất` |
| [authController.js:347](server/controllers/authController.js#L347) | `User not found` | `Không tìm thấy người dùng` |
| [authController.js:351](server/controllers/authController.js#L351) | `Current password is incorrect` | `Mật khẩu hiện tại không đúng` |
| [authController.js:369](server/controllers/authController.js#L369) | `Password changed successfully` | `Đổi mật khẩu thành công` |
| [authController.js:390](server/controllers/authController.js#L390) | `User not found` | `Không tìm thấy người dùng` |
| [authController.js:409](server/controllers/authController.js#L409) | `All sessions for ${user.empCode} invalidated` | `Đã hủy tất cả phiên đăng nhập của ${user.empCode}` |
| [authController.js:440](server/controllers/authController.js#L440) | `empCode is required` | `Cần nhập mã nhân viên (empCode)` |
| [authController.js:502](server/controllers/authController.js#L502) | `token and password are required` | `Cần nhập token và mật khẩu` |
| [authController.js:505](server/controllers/authController.js#L505) | `Password must be at least 10 characters` | `Mật khẩu phải có ít nhất 10 ký tự` |
| [authController.js:518](server/controllers/authController.js#L518) | `Reset token is invalid or has expired` | `Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn` |
| [authController.js:534](server/controllers/authController.js#L534) | `Password reset successful. Please sign in with your new password.` | `Đặt lại mật khẩu thành công. Vui lòng đăng nhập với mật khẩu mới.` |

## B · Auth middleware (~6 strings)

| File:Line | Current (EN) | Suggested (VN) |
|---|---|---|
| [auth.js:52](server/middleware/auth.js#L52) | `Not authorized — no token provided` | `Chưa xác thực — không có token` |
| [auth.js:101](server/middleware/auth.js#L101) | `Session has been revoked. Please log in again.` | `Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.` |
| [auth.js:123](server/middleware/auth.js#L123) | `Not authorized — user no longer exists` | `Chưa xác thực — người dùng không còn tồn tại` |
| [auth.js:150](server/middleware/auth.js#L150) | `Invalid token` | `Token không hợp lệ` |
| [auth.js:153](server/middleware/auth.js#L153) | `Token expired` | `Token đã hết hạn` |
| [roleGuard.js:15](server/middleware/roleGuard.js#L15) | `Not authorized — must be logged in` | `Chưa xác thực — vui lòng đăng nhập` |
| [csrfProtection.js:67](server/middleware/csrfProtection.js#L67) | `CSRF token invalid or missing` | `Token CSRF không hợp lệ hoặc thiếu` |
| [cronAuth.js:35](server/middleware/cronAuth.js#L35) | `Cron endpoint not configured on this server` | `Endpoint cron chưa được cấu hình trên server này` |
| [cronAuth.js:55](server/middleware/cronAuth.js#L55) | `Invalid cron token` | `Token cron không hợp lệ` |

## C · Rate limiters (~10 strings · all user-facing)

| File:Line | Current (EN) | Suggested (VN) |
|---|---|---|
| [rateLimiters.js:34](server/middleware/rateLimiters.js#L34) | `Too many requests. Please slow down.` | `Quá nhiều yêu cầu. Vui lòng chậm lại.` |
| [rateLimiters.js:49](server/middleware/rateLimiters.js#L49) | `Too many write requests. Please slow down.` | `Quá nhiều yêu cầu ghi. Vui lòng chậm lại.` |
| [rateLimiters.js:78](server/middleware/rateLimiters.js#L78) | `Too many booking requests. Please wait a moment before trying again.` | `Quá nhiều yêu cầu đặt lớp. Vui lòng đợi chút rồi thử lại.` |
| [rateLimiters.js:94](server/middleware/rateLimiters.js#L94) | `Too many import requests. Please wait before importing again.` | `Quá nhiều yêu cầu nhập dữ liệu. Vui lòng đợi rồi nhập lại.` |
| [rateLimiters.js:109](server/middleware/rateLimiters.js#L109) | `Too many attendance submissions. Please slow down.` | `Quá nhiều lần điểm danh. Vui lòng chậm lại.` |
| [rateLimiters.js:136](server/middleware/rateLimiters.js#L136) | `Too many login attempts. Please try again in 15 minutes.` | `Đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.` |
| [rateLimiters.js:155](server/middleware/rateLimiters.js#L155) | `Too many sync requests. Please wait before syncing again.` | `Quá nhiều yêu cầu đồng bộ. Vui lòng đợi rồi đồng bộ lại.` |
| [rateLimiters.js:170](server/middleware/rateLimiters.js#L170) | `Too many password change attempts. Please try again later.` | `Quá nhiều lần đổi mật khẩu. Vui lòng thử lại sau.` |
| [rateLimiters.js:185](server/middleware/rateLimiters.js#L185) | `Too many MFA requests. Please try again later.` | `Quá nhiều yêu cầu MFA. Vui lòng thử lại sau.` |
| [rateLimiters.js:203](server/middleware/rateLimiters.js#L203) | `Too many password reset requests. Please try again in 15 minutes.` | `Quá nhiều yêu cầu đặt lại mật khẩu. Vui lòng thử lại sau 15 phút.` |

## D · CRUD not-found errors (~12 strings)

| File:Line | Current (EN) | Suggested (VN) |
|---|---|---|
| [classController.js:72,155,186,212](server/controllers/classController.js) | `Class not found` (×4) | `Không tìm thấy lớp` |
| [evaluationController.js:117,141](server/controllers/evaluationController.js) | `Evaluation not found` (×2) | `Không tìm thấy đánh giá` |
| [enrollmentController.js:166,239](server/controllers/enrollmentController.js) | `Enrollment not found` (×2) | `Không tìm thấy ghi danh` |
| [enrollmentController.js:258](server/controllers/enrollmentController.js#L258) | `Target team not found` | `Không tìm thấy nhóm đích` |
| [enrollmentController.js:261](server/controllers/enrollmentController.js#L261) | `Source team not found` | `Không tìm thấy nhóm nguồn` |
| [reconcileController.js:61](server/controllers/reconcileController.js#L61) | `Report not found` | `Không tìm thấy báo cáo` |
| [scheduleController.js:96,149,320](server/controllers/scheduleController.js) | `Schedule not found` (×3) | `Không tìm thấy lịch học` |
| [scheduleController.js:107](server/controllers/scheduleController.js#L107) | `Not authorized to view this schedule` | `Bạn không có quyền xem lịch học này` |
| [teamController.js:232,341,517,630](server/controllers/teamController.js) | `Team not found` (×4) | `Không tìm thấy nhóm` |
| [userController.js:105,200,262,311,456](server/controllers/userController.js) | `User not found` (×5) | `Không tìm thấy người dùng` |
| [userController.js:227](server/controllers/userController.js#L227) | `Session user not found` | `Không tìm thấy người dùng của phiên` |

## E · CRUD validation & state errors (~12 strings)

| File:Line | Current (EN) | Suggested (VN) |
|---|---|---|
| [classController.js:108](server/controllers/classController.js#L108) | `Unknown course: ${courseName}` | `Không nhận diện được khóa học: ${courseName}` |
| [enrollmentController.js:184](server/controllers/enrollmentController.js#L184) | `memberIds must be an array` | `memberIds phải là một mảng` |
| [enrollmentController.js:233](server/controllers/enrollmentController.js#L233) | `toTeamId is required` | `Cần truyền toTeamId` |
| [enrollmentController.js:250](server/controllers/enrollmentController.js#L250) | `Source and target teams are the same` | `Nhóm nguồn và nhóm đích trùng nhau` |
| [enrollmentController.js:394,440](server/controllers/enrollmentController.js) | `enrollmentIds must be a non-empty array` (×2) | `enrollmentIds phải là mảng không rỗng` |
| [enrollmentController.js:398](server/controllers/enrollmentController.js#L398) | `status must be one of ${ALLOWED.join(', ')}` | `status phải là một trong ${ALLOWED.join(', ')}` |
| [enrollmentController.js:443](server/controllers/enrollmentController.js#L443) | `toTeamId is required` | `Cần truyền toTeamId` |
| [importController.js:50](server/controllers/importController.js#L50) | `sessions array required` | `Cần truyền mảng sessions` |
| [importController.js:57](server/controllers/importController.js#L57) | `Too many sessions. Maximum ${MAX_SESSIONS_BATCH} per request. Got ${sessions.length}. Split into smaller batches.` | `Quá nhiều sessions. Tối đa ${MAX_SESSIONS_BATCH} mỗi yêu cầu. Đã nhận ${sessions.length}. Vui lòng tách thành các batch nhỏ hơn.` |
| [settingController.js:23](server/controllers/settingController.js#L23) | `Expected an array of settings` | `Cần truyền mảng settings` |
| [userController.js:133](server/controllers/userController.js#L133) | `password is required` | `Cần nhập mật khẩu` |

## F · Success messages (~3 strings)

| File:Line | Current (EN) | Suggested (VN) |
|---|---|---|
| [evaluationController.js:151](server/controllers/evaluationController.js#L151) | `Evaluation deleted` | `Đã xóa đánh giá` |
| [scheduleController.js:57](server/controllers/scheduleController.js#L57) | `Schedule cancelled and removed` | `Đã hủy và xóa lịch học` |

## G · Admin DB Explorer (~7 strings)

| File:Line | Current (EN) | Suggested (VN) |
|---|---|---|
| [adminDbRoutes.js:77](server/routes/adminDbRoutes.js#L77) | `Collection "${req.params.collection}" not found` | `Không tìm thấy collection "${req.params.collection}"` |
| [adminDbRoutes.js:142](server/routes/adminDbRoutes.js#L142) | `Collection not found` | `Không tìm thấy collection` |
| [adminDbRoutes.js:163](server/routes/adminDbRoutes.js#L163) | `Document not found` | `Không tìm thấy tài liệu` |
| [adminDbRoutes.js:182](server/routes/adminDbRoutes.js#L182) | `Collection not found` | `Không tìm thấy collection` |
| [adminDbRoutes.js:194](server/routes/adminDbRoutes.js#L194) | `Document not found` | `Không tìm thấy tài liệu` |
| [adminDbRoutes.js:196](server/routes/adminDbRoutes.js#L196) | `Deleted` | `Đã xóa` |

> **Note:** `adminDbRoutes.js:69,134,171,198` hiển thị `err.message` trực tiếp — đây là MongoDB/Mongoose library errors, **giữ EN** (không control được).

## H · Misc routes & root (~4 strings)

| File:Line | Current (EN) | Suggested (VN) |
|---|---|---|
| [dashboardRoutes.js:25](server/routes/dashboardRoutes.js#L25) | `Dashboard cache cleared. Next request will run fresh queries.` | `Đã xóa cache dashboard. Yêu cầu tiếp theo sẽ chạy queries mới.` |
| [server.js:229](server/server.js#L229) | `Route not found` | `Không tìm thấy route` |
| [server.js:250](server/server.js#L250) | `messages.join(', ')` (validation aggregate) | *(component messages individual translation · giữ join)* |
| [server.js:264](server/server.js#L264) | `Invalid token` | `Token không hợp lệ` |
| [server.js:267](server/server.js#L267) | `Token expired` | `Token đã hết hạn` |

## I · Special cases · cần discuss

| File:Line | String | Decision |
|---|---|---|
| [authController.js:445](server/controllers/authController.js#L445) | `res.json({ ...message: okMsg })` — `okMsg` built upstream | **Trace upstream:** likely `'If account exists, reset link sent'` — convert nhưng giữ enumeration safety: `'Nếu tài khoản tồn tại, liên kết đặt lại đã được gửi.'` |
| User/Class/Attendance/Enrollment model enum errors | `{VALUE} is not a valid role` etc. | **Audit-and-defer:** Mongoose validation messages — kiểm tra trong testing xem user có thấy không. Nếu có → convert. Nếu chỉ hiển thị trong dev console → skip. |

## J · Already in VN (skip · keep as-is)

| File:Line | Current (VN) | Note |
|---|---|---|
| [teamController.js:277](server/controllers/teamController.js#L277) | `Không thể tạo nhóm: ${memberConflictStr}. Vui lòng gỡ họ khỏi nhóm cũ trước.` | Reference impl cho VN tone |
| [teamController.js:389](server/controllers/teamController.js#L389) | (similar conflict message) | Same pattern |

---

## Verification checklist (trước khi merge Phase 6 server PR)

- [ ] Tất cả 76 strings đã được convert (hoặc explicit skip với reason)
- [ ] E2E tests cập nhật label expectations (search test files cho EN strings cũ)
- [ ] Manual smoke: trigger ít nhất 1 lỗi từ mỗi controller, verify VN hiển thị đúng trên client toast
- [ ] Server logs vẫn EN (logger.error, console.log) — không bị convert nhầm
- [ ] Diacritic encoding qua HTTP response: verify charset=UTF-8 header
- [ ] Special chars trong empCode (nếu có Vietnamese names): không bị mojibake khi interpolated

## Implementation hint

Cùng PR pattern như client side (per-surface PR). Suggest 1 server PR duy nhất vì:
- Tất cả thuộc same concern (i18n consolidation)
- Cross-file refactor (rate limiters + middleware + 8 controllers) — atomic review tốt hơn
- E2E test fixture updates cần đi cùng

Estimate: ~6-8 hours (1 working day) cho dev fluent với codebase. ~130-180 LOC delta.
