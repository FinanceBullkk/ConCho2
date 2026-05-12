<p align="center">
  <img src="https://img.shields.io/badge/Stack-MERN-00d8ff?style=for-the-badge&logo=mongodb&logoColor=white" alt="MERN Stack"/>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React 19"/>
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB"/>
  <img src="https://img.shields.io/badge/Tests-241%2B-brightgreen?style=for-the-badge" alt="Tests"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License"/>
</p>

<h1 align="center">TMS v2 — Training Management System</h1>

<p align="center">
  <strong>Hệ thống quản lý đào tạo doanh nghiệp đa người dùng, chuẩn industrial-grade.</strong><br/>
  MongoDB · Express · React 19 · Node.js · Tailwind · Radix UI
</p>

---

## Mục lục

1. [Tổng quan (cho sếp / non-technical)](#1-tổng-quan)
2. [Tính năng chi tiết](#2-tính-năng-chi-tiết)
3. [Hướng dẫn sử dụng theo vai trò](#3-hướng-dẫn-sử-dụng-theo-vai-trò)
4. [Kiến trúc kỹ thuật](#4-kiến-trúc-kỹ-thuật)
5. [Database schema](#5-database-schema)
6. [API reference](#6-api-reference)
7. [Bảo mật](#7-bảo-mật)
8. [Cài đặt & Deployment](#8-cài-đặt--deployment)
9. [Vận hành & Maintenance](#9-vận-hành--maintenance)
10. [Testing & Chất lượng code](#10-testing--chất-lượng-code)
11. [Troubleshooting](#11-troubleshooting)
12. [Tài liệu liên quan](#12-tài-liệu-liên-quan)

---

## 1. Tổng quan

### TMS là gì?

TMS (Training Management System) v2 là một **web app nội bộ** thay thế quy trình quản lý đào tạo dựa trên Excel/Google Sheets bằng một nền tảng tập trung. Hệ thống tự động hóa toàn bộ vòng đời lớp học: **xếp lịch → đăng ký slot → điểm danh → đánh giá → báo cáo HR**.

### Bài toán đang giải quyết

| Trước khi có TMS | Sau khi có TMS |
|------------------|----------------|
| Lịch học rải rác trên nhiều file Excel | Một database duy nhất, real-time cho tất cả |
| Điểm danh thủ công, dễ sai sót | Bulk mark, có audit trail, có analytics |
| Khó tracking tỷ lệ đi học của từng nhân viên | Dashboard tự động theo BU/Department/Position |
| Không có Google Calendar invite | Tự động tạo Google Meet link, gửi invite cho học viên |
| Không có MFA, password yếu | TOTP 2FA, bcrypt hashing, password reset qua email |
| Không có backup procedure | RPO 24h / RTO 4h, monthly drill checklist |

### Ai sử dụng?

Hệ thống có **3 vai trò (roles)** với phạm vi quyền khác nhau:

| Role | Ai? | Làm được gì? |
|------|-----|--------------|
| **Admin** | HR, L&D Manager | Toàn quyền: quản lý users, classes, teams, schedules; xuất báo cáo; cấu hình hệ thống |
| **Teacher** | Giáo viên | Xem lịch dạy, điểm danh học viên, chấm điểm đánh giá |
| **Participant** | Học viên | Xem lịch học của team mình, đặt slot, xem điểm số cá nhân |

### Lợi ích kinh doanh

- **Tiết kiệm thời gian HR** — giảm ~80% công sức nhập liệu thủ công
- **Báo cáo real-time** — không cần đợi cuối tháng tổng hợp Excel
- **Truy vết đầy đủ** — mọi thao tác đều có audit log (ai làm gì, lúc nào)
- **Tự phục hồi** — daily reconciliation phát hiện và sửa data drift tự động
- **Mở rộng được** — thiết kế để scale lên hàng nghìn user mà không cần viết lại

---

## 2. Tính năng chi tiết

### 2.1. Quản lý người dùng (Users)
- CRUD đầy đủ với 6 trạng thái: Active / Inactive / Dropped / Transferred / On-hold / Waiting for class
- **Soft delete** — user bị xóa vào thùng rác, có thể restore lại
- **Bulk actions** — chọn nhiều user cùng lúc để đổi status hoặc xóa
- **Bulk import** — import từ Excel, validate empCode trùng, email format
- **Auto-release** — khi chuyển user sang status Dropped, hệ thống tự động xóa user khỏi tất cả schedules tương lai (atomic transaction)
- Trường thông tin: empCode (mã NV, unique), name, email, role, department (BU), position, entranceLevel, currentLevel

### 2.2. Quản lý lớp học (Classes)
- Class = mã lớp + tên khóa học. Một class code có thể có nhiều khóa học (Beginner, Intermediate, Advanced)
- Validate `courseName` theo whitelist `COURSE_SESSIONS` (cấu hình trong Settings)
- Tự động tạo tổng số sessions từ course mapping
- Status: Ongoing / Completed

### 2.3. Quản lý nhóm học (Teams)
- Mỗi team gắn với 1 class duy nhất
- Có **leader** (PIC — Person In Charge), thường là người đặt lịch
- Khi update danh sách members → hệ thống đồng bộ enrollments cho tất cả schedules tương lai (atomic transaction)
- **Transfer học viên** — chuyển từ team này sang team khác trong 1 thao tác: cập nhật cả 2 team + lịch học + lưu lịch sử; học viên nhận email thông báo
- Soft delete + restore

### 2.4. Đặt lịch & quản lý schedules
- **Capacity mặc định**: 9 người/slot
- **Khung giờ học cố định** (5 slot, mỗi slot 1 tiếng): 10:00–11:00 · 11:00–12:00 · 13:00–14:00 · 14:00–15:00 · 15:00–16:00
- **Booking flow**:
  - Admin tạo schedule trống (ngày, giờ, room link)
  - Team leader click slot trống trên booking calendar → cả team tự động được fill vào
  - Grid hiển thị rõ: xanh = của team mình, đỏ = bị team khác chiếm (không thể book), trắng = trống
  - Tự tạo Google Calendar event + Meet link nếu Workspace setup đầy đủ
- **Weekly limit** — mỗi team tối đa 2 buổi/tuần
- **Conflict detection** — không cho phép book slot đã bị team khác đặt
- **Cancel** — hủy slot trước giờ học; học viên trong team nhận email thông báo tự động
- **Email confirmation** — gửi email xác nhận khi book thành công (timezone Asia/Ho_Chi_Minh)
- **Reminder email** — nhắc học viên trước giờ học 24h (idempotent, tự thử lại nếu SMTP tạm lỗi)
- **Auto-attendance generation** — khi tới giờ học, hệ thống tạo sẵn record attendance để giáo viên mark

### 2.5. Điểm danh (Attendance)
- 4 trạng thái: **P** (Present) / **A** (Absent) / **L** (Late) / **EL** (Excused Late)
- **Bulk mark** — điểm danh cả lớp trong 1 lần submit
- **Photo evidence** — có thể upload ảnh chứng minh
- **Analytics** — phân tích theo employee / team / class với cache 30 phút
- **Sync status** — theo dõi record nào đã export sang HR system (PENDING/EXPORTED)

### 2.6. Đánh giá (Evaluations)
- Chấm 4 kỹ năng theo thang 0-10: Grammar, Vocabulary, Pronunciation, Fluency
- Tự tính điểm trung bình (virtual field, không lưu trong DB)
- Teacher comment dạng free-form text
- Upsert behavior — chấm lại sẽ ghi đè record cũ

### 2.7. Báo cáo & Export
- **Attendance Excel export** — file `.xlsx` đầy đủ thông tin attendance theo khoảng ngày
- **Evaluation Excel export** — file `.xlsx` điểm 4 kỹ năng + trung bình + nhận xét giáo viên theo lớp
- **JSON preview** — xem trước trước khi tải Excel
- **Sync flag** — tự động đánh dấu record đã export
- **Dashboard analytics**:
  - Tỷ lệ điểm danh theo course / BU / position
  - Filter options động (cached 60 phút)
  - Top/bottom performers

### 2.8. Audit log
- Mọi thao tác CUD (Create/Update/Delete) đều được ghi lại
- Lưu trữ: ai (actorId, role, empCode), làm gì (action), trên entity nào, diff trước-sau, request ID, IP, user-agent
- **TTL 730 ngày** (2 năm) tự động xóa record cũ
- UI tab Audit trong Admin panel cho phép filter theo entity, actor, action, date range

### 2.9. Reconciliation (tự kiểm tra dữ liệu)
- Chạy tự động hằng đêm 02:00 UTC (hoặc on-demand)
- 5 loại check:
  1. **Missing attendance** — schedule đã qua nhưng chưa có attendance
  2. **Orphaned enrollments** — enrollment trỏ tới schedule không tồn tại
  3. **Ghost members** — user trong team nhưng đã bị Dropped
  4. **Empty future schedules** — schedule không có ai book
  5. **Unattached participants** — user không thuộc team nào nhưng status Active
- Báo cáo lưu trong DB 30 ngày, có lịch sử so sánh

### 2.10. Bảo mật
- **MFA (TOTP)** — Google Authenticator / Microsoft Authenticator + 10 backup codes
- **Password reset** — qua email với token SHA-256, expire 1 giờ
- **Rate limiting đa tầng**:
  - Global 200 req/phút/IP
  - Login 5 lần thất bại / 15 phút
  - Forgot password 5 yêu cầu / 15 phút
  - Export 10 lần / giờ
- **CSRF protection** — double-submit cookie pattern
- **Audit của bảo mật** — log mọi attempt login fail, MFA fail
- **Soft-delete + restore** — chống mất dữ liệu

### 2.11. Tích hợp Google Workspace
- **Google Calendar** — auto-create events khi book slot, gửi invite cho attendees
- **Google Meet** — tự sinh link meeting trong calendar event
- **Google Sheets sync** — import dữ liệu từ HR sheet (Admin trigger thủ công)

### 2.12. UX & Accessibility
- **Global search (Cmd+K / Ctrl+K)** — tìm ngay user, team, class từ bất kỳ đâu; kết quả phân quyền theo role
- **Light/Dark mode toggle** — lưu preference trong localStorage, fallback `prefers-color-scheme`
- **Mobile responsive** — hamburger menu, table horizontal scroll
- **Skip-to-main link** — keyboard navigation friendly
- **ARIA labels** — đầy đủ cho icon buttons, error messages có `role="alert"`
- **Optimistic updates** — UI cập nhật ngay khi click, rollback nếu server fail
- **Toast notifications** — Sonner cho mọi success/error
- **Loading skeletons** — không hiển thị spinner trống
- **RBAC-gated buttons** — nút Edit/Delete/Create chỉ render với đúng role có quyền
- **URL-synced filters** — bộ lọc lưu trong URL, bookmarkable, back-button safe

---

## 3. Hướng dẫn sử dụng theo vai trò

### 3.1. Đăng nhập lần đầu

1. Mở trình duyệt, vào URL của hệ thống (ví dụ `https://tms.yourcompany.com`)
2. Nhập **Mã nhân viên** (empCode, ví dụ `000123`) và **Password** mặc định do Admin cấp
3. Nhấn **Sign In**
4. Lần đầu tiên: hệ thống có thể yêu cầu đổi password ngay
5. Nếu role bạn được cấu hình bắt buộc MFA → quét QR code bằng Google Authenticator → nhập 6 số → lưu lại 10 backup codes (chỉ hiện 1 lần duy nhất!)

**Quên password?**
- Click "Forgot password?" trên trang login
- Nhập empCode → click Send reset link
- Check email công ty → click link trong email (hết hạn sau 1 giờ)
- Đặt password mới (≥10 ký tự)

### 3.2. Workflow của Admin (HR / L&D Manager)

#### A. Setup ban đầu (1 lần khi triển khai)
1. **Settings → tab Settings**: kiểm tra `ALLOWED_TIME_SLOTS` — mặc định đã có 5 slot (10-11, 11-12, 13-14, 14-15, 15-16). Chỉnh sửa nếu tổ chức dùng khung giờ khác.
2. **Academy → Courses**: định nghĩa các course có sẵn (Beginner / Intermediate / Advanced) và số session mỗi course
3. **Academy → Users → Bulk Import**: upload file Excel danh sách nhân viên (template ở [docs/import-template.xlsx])

#### B. Quy trình tháng
**Bước 1 — Tạo class**
- Vào **Academy → Classes → New Class**
- Nhập class code (ví dụ `2026Q1-EN-A`), chọn course, system auto-fill totalSessions

**Bước 2 — Tạo team**
- Vào **Academy → Teams → New Team**
- Chọn class, đặt tên team (PIC name), chọn leader, thêm members

**Bước 3 — Tạo schedule**
- Vào **Operations → Schedules → New Schedule**
- Chọn class, ngày giờ, paste room link / Meet link manual (hoặc để system tự tạo nếu Google Workspace đã setup)
- Capacity 9 mặc định, có thể đổi

**Bước 4 — Team leader đặt slot**
- Team leader mở **Book Class**, click slot trống → cả team được fill vào schedule
- Mỗi member nhận email confirmation (nếu có cấu hình SMTP)

**Bước 5 — Điểm danh**
- Tới giờ học, vào **Operations → Attendance**
- Chọn schedule → bulk mark P/A/L/EL cho từng người → Save

**Bước 6 — Chấm điểm cuối khóa**
- Vào schedule cuối → tab Evaluations → nhập 4 scores cho mỗi học viên + comment

**Bước 7 — Export báo cáo cuối tháng**
- Vào **Reports → HR Export**
- Chọn date range → Download Excel
- File chứa toàn bộ attendance đã PENDING + được auto-mark thành EXPORTED

#### C. Vận hành hằng ngày
- **Dashboard** (`/home`) — xem attendance rate theo course/BU
- **Admin → Audit** — kiểm tra ai vừa thay đổi gì
- **Admin → Reconciliation** — chạy check thủ công nếu nghi ngờ data drift
- **Academy → Users (deleted)** — xem trash, restore nếu cần

### 3.3. Workflow của Teacher

1. Đăng nhập
2. Vào **Operations → Schedules** — xem các lớp mình dạy (nếu được assign)
3. Tới giờ học → **Attendance** → chọn schedule → bulk mark
4. Cuối khóa → **Evaluations** → chấm điểm 4 kỹ năng

### 3.4. Workflow của Participant (Học viên)

1. Đăng nhập
2. Dùng **Cmd+K** (hoặc `/`) để tìm nhanh tên lớp, team, đồng nghiệp
3. Nếu là **Team Leader**: vào **Book Class** (Operations → Schedules)
   - Grid hiển thị 5 khung giờ × 7 ngày trong tuần
   - Ô đỏ = đã bị team khác đặt; ô trắng = còn trống
   - Click ô trống → confirm → cả team tự động được đăng ký; nhận email xác nhận
4. Tới giờ học → click Meet link trong calendar event
5. **My Settings** — xem điểm số cá nhân, thay đổi password, bật MFA

### 3.5. Tự quản lý tài khoản (mọi user)

Vào **My Settings** (góc phải Navbar):
- **Change Password** — đổi password (yêu cầu password hiện tại + new ≥10 ký tự)
- **MFA Setup** — bật 2FA, save backup codes
- **Theme toggle** — Sun/Moon icon trên Navbar để chuyển dark/light mode

---

## 4. Kiến trúc kỹ thuật

### 4.1. Tech stack tổng quan

```
┌─────────────────────────────────────────────────────────┐
│                       BROWSER (Client)                  │
│  React 19 + Vite 8 + TailwindCSS + Radix UI            │
│  React Query (server state) + React Hook Form (forms)  │
│  Zod (validation) + Sentry (error tracking)            │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + HttpOnly cookie + CSRF
                       │
┌──────────────────────▼──────────────────────────────────┐
│                      EXPRESS SERVER                     │
│  Helmet · CORS · Pino · Rate Limiters · CSRF           │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Routes → Controllers → Services → Mongoose ORM   │  │
│  └──────────────────────────────────────────────────┘  │
│  Cron Jobs · Audit Logger · Reconcile Engine           │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              MongoDB Atlas (M0 free tier)               │
│  Users · Classes · Schedules · Attendance · Audit ...   │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
┌───────▼────────┐           ┌────────▼────────┐
│ Google         │           │ SMTP Provider    │
│ Workspace API  │           │ (Gmail/SendGrid)│
│ - Calendar     │           │ - Reset emails   │
│ - Sheets       │           │ - Booking confirm│
└────────────────┘           └──────────────────┘
```

### 4.2. Cấu trúc thư mục

```
ConCho2/
├── client/                      # React SPA
│   ├── src/
│   │   ├── pages/              # 28 page components (lazy-loaded)
│   │   ├── components/         # 33 reusable components + ui/ primitives
│   │   ├── hooks/              # 16 custom hooks (useUsers, useRole, useTheme...)
│   │   ├── context/            # AuthContext
│   │   ├── lib/                # validations/ (Zod schemas), sentry, utils
│   │   ├── api/                # axios instance + interceptors
│   │   └── App.jsx             # Main router
│   └── vite.config.js          # Vite + Vitest config
│
├── server/                      # Node.js/Express API
│   ├── routes/                 # 18 route files (auth, users, schedules...)
│   ├── controllers/            # 15 controllers (HTTP handlers)
│   ├── services/               # 9 business logic services
│   ├── models/                 # 12 Mongoose schemas
│   ├── middleware/             # auth, csrf, rateLimiters, validate, requestId
│   ├── lib/                    # logger, mailer, sentry, googleAuth, swagger
│   ├── helpers/                # pagination, error handling
│   ├── jobs/                   # node-cron schedules
│   ├── config/                 # db.js (Mongoose connection)
│   ├── tests/
│   │   ├── integration/        # 9 integration test suites (supertest)
│   │   ├── unit/               # 4 unit test suites
│   │   └── load/               # Artillery load tests
│   └── server.js               # Express app entry point
│
├── docs/                        # Markdown documentation
│   ├── backup-dr.md            # Disaster recovery runbook
│   ├── cron-pinger-setup.md    # External cron setup
│   └── google-calendar-setup.md # Google Workspace setup
│
├── .github/                     # GitHub Actions CI workflows
├── Dockerfile                   # Multi-stage production image
├── render.yaml                  # Render.com blueprint
├── package.json                 # Monorepo orchestrator
└── README.md                    # ← bạn đang đọc
```

### 4.3. Frontend architecture chi tiết

**Routing & Code splitting**
- Eager load: `LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage` (cần load nhanh, chưa auth)
- Lazy load: tất cả pages khác qua `React.lazy()` + `<Suspense>`
- Vite manualChunks: react-vendor, radix-vendor, query-vendor, icons-vendor, sentry-vendor, toast-vendor

**State management**
- **Server state**: React Query với staleTime 30s, gcTime 5min, retry 1 lần
- **Auth state**: React Context (`AuthContext`) — user object + login/logout/verifyMfa
- **URL state**: `useSearchParams` cho filters/pagination (bookmarkable)
- **Local state**: `useState` cho UI ephemeral

**Form pattern**
- React Hook Form + Zod resolver
- Schemas dùng chung trong `lib/validations/index.js` (loginSchema, createUserSchema, etc.)
- Components: `<FormField>`, `<FormLabel>`, `<FormError>`, `<FormInput>` tự wire `aria-invalid`/`aria-describedby`

**Data fetching pattern**
```js
// Custom hook ví dụ
function useUsers(params) {
  return useQuery({
    queryKey: qk.users.list(params),
    queryFn: () => api.get('/users', { params }).then(r => r.data),
  });
}

// Component
const { data, isLoading, isError, error, refetch } = useUsers(filters);

if (isLoading) return <TableSkeleton />;
if (isError) return <QueryError error={error} onRetry={refetch} />;
```

**Mutation pattern (with optimistic update)**
```js
function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/users/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.users.all });
      const snapshot = qc.getQueriesData({ queryKey: qk.users.all });
      // Optimistically remove from all list caches
      qc.setQueriesData({ queryKey: qk.users.lists }, (old) => 
        old?.data?.filter(u => u._id !== id));
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      // Rollback on failure
      ctx.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: () => toast.success('User deleted'),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.users.all }),
  });
}
```

### 4.4. Backend architecture chi tiết

**Request lifecycle**
```
1. Request arrives
2. requestId middleware → attach unique X-Request-Id
3. pinoHttp → structured log entry
4. helmet → security headers (CSP, X-Frame-Options, etc.)
5. CORS check → reject if origin not in CORS_ORIGINS
6. cookieParser → parse HttpOnly auth cookie
7. express.json → parse body
8. mongoSanitize → strip $-prefixed keys (NoSQL injection)
9. globalLimiter → 200 req/min/IP
10. globalWriteLimiter → 60 writes/min for POST/PUT/PATCH/DELETE
11. csrfProtection → verify X-CSRF-Token header (except /cron/*)
12. Route-specific middleware (auth, roleGuard, validate, rate limiters)
13. Controller → Service → Mongoose
14. Response → audit log async write
15. Error handler → Sentry (5xx) + structured error JSON
```

**Auth flow**
```
POST /auth/login
  ├─ Validate empCode + password (Zod)
  ├─ Find user, check failed attempts (lockUntil)
  ├─ bcrypt.compare(password, hash)
  ├─ If MFA enabled:
  │    └─ Return mfaPendingToken (5min TTL, signed JWT)
  ├─ Else:
  │    └─ Set HttpOnly cookie with full session JWT (24h)
  └─ Return user object

POST /auth/mfa/verify
  ├─ Validate mfaPendingToken
  ├─ speakeasy.totp.verify(code, secret, window:2)
  ├─ Or check backup codes (consumed once)
  └─ Set full session cookie

GET /auth/me (every request from client)
  ├─ middleware/auth.js verifies cookie
  ├─ Cache hit (30s) → return cached user
  ├─ Cache miss → DB lookup, check passwordChangedAt > token.iat
  └─ Return user (or 401)
```

**MFA implementation**
- Library: `speakeasy` (RFC 6238 TOTP)
- `window: 2` → tolerate ±60s clock drift
- Backup codes: 10 codes, format `XXXXX-XXXXX`, hashed with bcrypt, single-use

**Audit logging**
```js
// Pattern in every CUD operation
await User.findByIdAndUpdate(id, data);
await auditService.log({
  actorId: req.user._id,
  action: 'update',
  entity: 'User',
  entityId: id,
  diff: computeDiff(before, after),
  requestId: req.id,
  ip: req.ip,
});
```

### 4.5. Job scheduling

**In-process (node-cron)** — chạy trong server, có thể không reliable trên Render free tier (sleep)
- `02:00 UTC daily`: full reconciliation run

**External cron (cron-job.org)** — fallback reliable
- `02:00 UTC daily`: POST /api/cron/reconcile (trigger reconciliation)
- `*/10 mins (business hours)`: GET /api/cron/health (keep-warm để Render không sleep)

Auth: shared secret `CRON_TOKEN` qua header `Authorization: Bearer <token>` hoặc `X-Cron-Token`.

---

## 5. Database schema

12 collections chính trong MongoDB Atlas:

### Users
```
{
  empCode: String (unique),       // VD: "000123"
  name: String,
  email: String (partial unique), // bắt buộc cho Google Calendar invite
  role: 'Admin' | 'Teacher' | 'Participant',
  department: String,             // BU/Department
  position: String,
  status: 'Active'|'Inactive'|'Dropped'|'Transferred'|'On-hold'|'Waiting for class',
  dropReason: String,
  entranceLevel: String,
  currentLevel: String,
  password: String (bcrypt),
  passwordChangedAt: Date,
  passwordResetToken: String (SHA-256, select:false),
  passwordResetExpires: Date,
  mfaEnabled: Boolean,
  mfaSecret: String (select:false),
  mfaBackupCodes: [String] (select:false),
  failedLoginAttempts: Number,
  lockUntil: Date,
  isDeleted: Boolean,             // soft delete
  deletedAt: Date,
}
// Indexes: {role, status}, {department}, {email partial unique}
```

### Classes
```
{
  classCode: String,              // không unique! 1 cohort có nhiều course
  courseName: String,             // validated against COURSE_SESSIONS setting
  totalSessions: Number,
  status: 'Ongoing' | 'Completed',
}
// Index: {classCode, courseName} unique compound
```

### Schedules
```
{
  classId: ObjectId,
  bookedTeamId: ObjectId,
  startTime: Date,
  endTime: Date,
  roomLink: String,
  meetLink: String,               // auto-generated by Google Calendar
  googleEventId: String,
  capacity: Number (default 9),
  enrolledUsers: [ObjectId],
}
// Virtuals: enrolledCount, availableSpots
// Indexes: {classId, startTime}, {bookedTeamId, startTime}, {enrolledUsers, startTime}
```

### Attendance
```
{
  scheduleId: ObjectId,
  userId: ObjectId,
  status: 'P' | 'A' | 'L' | 'EL',
  remark: String,
  photoUrl: String,
  syncStatus: 'PENDING' | 'EXPORTED',
  exportedAt: Date,
}
// Index: {scheduleId, userId} unique compound
```

### Teams
```
{
  name: String,                   // PIC name
  classId: ObjectId (1:1 partial unique),
  leaderId: ObjectId,
  members: [ObjectId],
  isDeleted: Boolean,
  deletedAt: Date,
}
```

### Enrollments
```
{
  userId: ObjectId,
  teamId: ObjectId,
  classId: ObjectId,
  joinedAt: Date,
  leftAt: Date,
  status: 'Active'|'Completed'|'Dropped'|'Transferred',
  transferredTo: ObjectId,
  note: String,
}
// Unique partial: {userId, teamId} where status='Active' (DI-05)
```

### Evaluations
```
{
  classId: ObjectId,
  userId: ObjectId,
  level: String,
  grammarScore: Number (0-10),
  vocabularyScore: Number (0-10),
  pronunciationScore: Number (0-10),
  fluencyScore: Number (0-10),
  teacherComment: String,
}
// Virtual: averageScore (auto-computed)
// Index: {classId, userId} unique compound
```

### AuditLog
```
{
  actorId: ObjectId | null,       // null = System job
  actorRole: String,
  actorEmpCode: String,
  action: String,                 // 'create', 'update', 'delete', 'login', etc.
  entity: 'User'|'Team'|'Class'|'Schedule'|'Attendance'|'Evaluation'|'Enrollment'|'Setting'|'Auth'|'Import'|'Export',
  entityId: ObjectId,
  diff: Mixed,                    // before/after snapshot, password redacted
  requestId: String,
  ip: String,
  userAgent: String,
  createdAt: Date,                // TTL 730 days
}
```

### ReconcileReport
```
{
  runAt: Date,
  durationMs: Number,
  triggeredBy: 'scheduled' | 'manual' | 'cron',
  status: 'ok' | 'issues',
  summary: { check1Count: Number, ... },
  issues: [
    {
      check: String,
      description: String,
      refs: { userId, teamId, classId, scheduleId, enrollmentId },
      detail: String,
    }
  ],
}
// TTL 30 days
```

Các models khác: **Setting** (key-value config), **TokenBlocklist** (logout JWT), **Counter** (atomic ID generation).

---

## 6. API reference

### 6.1. Tổng quát

- **Base URL**: `/api`
- **Auth**: HttpOnly cookie `token` (set bởi `POST /auth/login`)
- **CSRF**: Header `X-CSRF-Token` cho mọi request thay đổi state (POST/PUT/PATCH/DELETE)
- **Content-Type**: `application/json`
- **Response shape**: `{ success: boolean, data?: any, message?: string, meta?: { total, page, limit, totalPages } }`

### 6.2. Interactive docs

Trong development hoặc khi `SWAGGER_ENABLED=true`:
- **Swagger UI**: `GET /api/docs` — browse API trong trình duyệt
- **OpenAPI JSON**: `GET /api/docs.json` — import vào Postman / codegen tools

### 6.3. Endpoints chính

#### Authentication (/api/auth)
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | /login | Public | Đăng nhập với empCode + password |
| POST | /logout | Cookie | Đăng xuất, invalidate JWT |
| GET | /me | Cookie | User hiện tại (dùng để hydrate frontend) |
| GET | /csrf | Public | Lấy CSRF token (set cookie) |
| PUT | /change-password | Cookie | Đổi password |
| POST | /mfa/setup | Cookie | Bắt đầu enrollment MFA, trả QR + backup codes |
| POST | /mfa/verify-setup | Cookie | Xác nhận enrollment MFA |
| POST | /mfa/verify | Pending token | Bước 2 của login khi có MFA |
| POST | /mfa/disable | Cookie | Tự tắt MFA |
| POST | /mfa/admin-disable/:userId | Admin | Admin reset MFA cho user |
| POST | /forgot-password | Public | Gửi email reset (anti-enumeration) |
| POST | /reset-password | Public | Reset bằng token từ email |

#### Users (/api/users) — Admin only
| Method | Path | Mô tả |
|--------|------|-------|
| GET | / | List + filter (search, role, status, department, page, limit) |
| POST | / | Create user |
| GET | /:id | Detail |
| PUT | /:id | Update |
| DELETE | /:id | Soft delete |
| GET | /deleted | Trash |
| POST | /:id/restore | Restore |
| GET | /:id/progress | Attendance progress |

#### Schedules (/api/schedules)
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | / | All authenticated | List schedules |
| POST | / | Admin | Tạo schedule trống |
| GET | /availability | All | Slots còn trống |
| POST | /book-slot | Admin/Participant | Book cho team |
| DELETE | /:id/cancel | Admin/Participant | Hủy booking |
| GET | /attendance-calendar | Admin | Calendar view cho điểm danh |
| GET | /my-class | All | Schedule của class user thuộc về |

#### Attendance (/api/attendance)
| Method | Path | Mô tả |
|--------|------|-------|
| POST | /:scheduleId | Bulk mark P/A/L/EL |
| GET | /schedule/:scheduleId | List attendance theo schedule |
| GET | /user/:userId | List theo user (Participant: chỉ self) |
| GET | /my-stats | Stats cá nhân |
| GET | /analytics/by-employee | Aggregate (cached) |
| GET | /analytics/by-team | Aggregate (cached) |
| GET | /analytics/by-class | Aggregate (cached) |

#### Other
- **Classes** (/api/classes), **Teams** (/api/teams), **Evaluations** (/api/evaluations), **Enrollments** (/api/enrollments), **Settings** (/api/settings), **Dashboard** (/api/dashboard), **Import** (/api/import), **Export** (/api/export), **Audit** (/api/admin/audit), **Reconcile** (/api/admin/reconcile), **Sync** (/api/sync), **Cron** (/api/cron), **Health** (/health, /ready)

→ Xem đầy đủ tại `/api/docs` (Swagger UI) hoặc file `server/API_REFERENCE.md`.

---

## 7. Bảo mật

### 7.1. Permission matrix (33 permissions × 3 roles)

| Permission | Admin | Teacher | Participant |
|------------|:-----:|:-------:|:-----------:|
| create:user, update:user, delete:user | ✓ | | |
| read:users | ✓ | ✓ | |
| force-logout:user, disable-mfa:user | ✓ | | |
| create/update/delete:class | ✓ | | |
| read:classes | ✓ | ✓ | ✓ |
| create:schedule, update:schedule | ✓ | ✓ | |
| delete:schedule | ✓ | | |
| read:schedules | ✓ | ✓ | ✓ |
| record:attendance, read:attendance | ✓ | ✓ | |
| manage:enrollment | ✓ | | |
| book:class | ✓ | | ✓ |
| create:evaluation, read:evaluations | ✓ | ✓ | |
| access:admin, run:reconcile, read:audit, read:database, manage:settings | ✓ | | |
| export:data, import:data | ✓ | | |

Implementation: `client/src/hooks/useRole.js` — `can('delete:user')` returns boolean. Server enforces via `roleGuard('Admin')` middleware.

### 7.2. Authentication
- **JWT** signed with `JWT_SECRET` (256-bit random), 24h expiry
- **HttpOnly cookie** — không thể đọc bằng JS, chống XSS token theft
- **SameSite=Strict** trên CSRF cookie
- **bcrypt** salt rounds 12 cho password
- **Login lockout** — 5 fail/15min/IP+empCode
- **passwordChangedAt** check — invalidate tất cả tokens cũ khi user đổi pass

### 7.3. Authorization
- Server: `auth` middleware verifies cookie → `roleGuard('Admin', 'Teacher')` checks role
- Client: `useRole().can(perm)` for UI gating; ProtectedRoute for route gating
- Defense in depth: never trust client, server always re-checks

### 7.4. Input validation
- **Zod schemas** trên cả client và server (cùng schema từ `validations/`)
- **mongoSanitize** strip `$`-prefixed keys
- **Mongoose validators** ở schema level (minlength, maxlength, regex, enum)

### 7.5. Rate limiting
| Limiter | Quota | Áp dụng |
|---------|-------|---------|
| globalLimiter | 200 req/min/IP | Tất cả /api |
| globalWriteLimiter | 60 writes/min/user | POST/PUT/PATCH/DELETE |
| loginLimiter | 5 fail/15min/(IP+empCode) | /auth/login |
| forgotPasswordLimiter | 5 req/15min/IP | /auth/forgot-password, /reset-password |
| changePasswordLimiter | 10 req/15min/IP | /auth/change-password |
| mfaLimiter | 20 req/15min/IP | /auth/mfa/* |
| bookingLimiter | 10 req/min/user | /schedules/book-slot |
| attendanceLimiter | 30 req/min/user | /attendance/:scheduleId |
| exportLimiter | 10 req/giờ/user | /export/attendance |
| importLimiter | 5 req/15min/user | /import/* |
| syncLimiter | 3 req/15min/user | /sync/google-sheets |
| reconcileLimiter | 10 req/giờ/IP | /cron/reconcile |

### 7.6. Security headers (Helmet)
- **CSP**: `default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (Radix UI), `frame-ancestors 'none'` (anti-clickjacking)
- **X-Frame-Options**: DENY (via frame-ancestors)
- **X-Content-Type-Options**: nosniff (default)
- **Referrer-Policy**: no-referrer
- **Cross-Origin-Opener-Policy**: same-origin
- **Permissions-Policy**: camera/microphone/geolocation/payment/usb/magnetometer/gyroscope/accelerometer/autoplay all denied

### 7.7. CSRF protection
- **Double-submit cookie pattern**:
  - Server set cookie `csrf-token` (readable, sameSite Strict)
  - Client đọc cookie → đính header `X-CSRF-Token` mỗi POST/PUT/PATCH/DELETE
  - Server compare cookie value vs header value
- Exempt: `/cron/*` (dùng CRON_TOKEN auth thay vì session cookie)

### 7.8. Audit & forensics
- Mọi CUD đều có entry trong AuditLog
- Mỗi request có `X-Request-Id` correlate giữa server logs + Sentry + client error reports
- Login failures được log warn level với IP + user-agent

---

## 8. Cài đặt & Deployment

### 8.1. Local development

**Yêu cầu:**
- Node.js ≥ 18
- MongoDB Atlas account (hoặc local MongoDB ≥ 6)
- (Optional) Google Workspace với service account
- (Optional) SMTP credentials

**Setup:**
```bash
# Clone
git clone https://github.com/FinanceBullkk/ConCho2.git
cd ConCho2

# Install monorepo deps
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..

# Tạo file .env trong server/
cat > server/.env <<EOF
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/tms-v2
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_EXPIRE=24h
CORS_ORIGINS=http://localhost:5173
CRON_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
TMS_TIMEZONE=Asia/Ho_Chi_Minh
EOF

# Tạo file .env trong client/
echo "VITE_API_BASE_URL=http://localhost:5000/api" > client/.env

# Seed admin account đầu tiên
cd server && npm run seed && cd ..

# Run cả 2 dev server
npm run dev:server   # cửa sổ 1: server tại :5000
npm run dev:client   # cửa sổ 2: client tại :5173
```

Mở `http://localhost:5173` → login với account vừa seed.

### 8.2. Production build

```bash
# Build client
npm run build:client    # output: client/dist/

# Server serves dist trong production
NODE_ENV=production npm start
```

### 8.3. Deploy lên Render.com (recommended cho free tier)

1. Push code lên GitHub
2. Render Dashboard → **New → Blueprint** → connect repo → chọn `render.yaml`
3. Set environment variables (xem section 8.5)
4. Render auto-build và deploy
5. Setup external cron pinger (xem `docs/cron-pinger-setup.md`)

### 8.4. Deploy bằng Docker

```bash
# Build image
docker build -t tms-v2 .

# Run với env file
docker run -d \
  --name tms-v2 \
  -p 5000:5000 \
  --env-file .env \
  tms-v2

# Healthcheck tự động: GET /health mỗi 30s
docker ps   # xem cột STATUS = "healthy"
```

### 8.5. Environment variables — bảng đầy đủ

| Tên | Bắt buộc? | Mô tả |
|-----|:---------:|-------|
| `NODE_ENV` | ✓ | development / production / test |
| `PORT` | | Server port (default 5000) |
| `MONGO_URI` | ✓ | MongoDB connection string |
| `JWT_SECRET` | ✓ | JWT signing key (256-bit hex random) |
| `JWT_EXPIRE` | | Token expiry (default 24h) |
| `CORS_ORIGINS` | ✓ | CSV list các origin cho phép |
| `CRON_TOKEN` | ✓ | Shared secret cho /cron/* (≥16 ký tự) |
| `CLIENT_ORIGIN` | ✓ | URL frontend (cho password reset link) |
| `SMTP_HOST` | | Hostname SMTP (vd `smtp.gmail.com`) |
| `SMTP_PORT` | | 587 hoặc 465 |
| `SMTP_USER` | | SMTP username / sender address |
| `SMTP_PASS` | | SMTP password hoặc app password |
| `EMAIL_FROM` | | Display sender (default = SMTP_USER) |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | | JSON key (Render: paste raw) |
| `GOOGLE_CALENDAR_IMPERSONATE` | | Email mà service account giả mạo |
| `SENTRY_DSN` | | Sentry project DSN |
| `SENTRY_TRACES_SAMPLE_RATE` | | 0.1 prod, 1.0 dev |
| `LOG_LEVEL` | | trace/debug/info/warn/error/fatal (default info) |
| `TMS_TIMEZONE` | | IANA tz (default UTC, prod nên Asia/Ho_Chi_Minh) |
| `LOGIN_MAX_FAILED` | | Max fail trước lockout (default 5) |
| `LOGIN_LOCK_MINUTES` | | Lockout duration (default 15) |
| `MFA_REQUIRED_ROLES` | | CSV roles bắt buộc MFA |
| `MFA_ISSUER` | | TOTP issuer (default "TMS") |
| `RECONCILE_CRON` | | Cron expression (default "0 2 * * *") |
| `DASHBOARD_CACHE_TTL_MINUTES` | | Cache TTL (default 30) |
| `AUDIT_RETENTION_DAYS` | | TTL audit log (default 730) |
| `SWAGGER_ENABLED` | | "true" để bật /api/docs trong production |
| `GIT_SHA` | | Commit SHA cho Sentry releases |
| `VITE_API_BASE_URL` | | (Client) URL API (vd `/api`) |
| `VITE_SENTRY_DSN` | | (Client) Sentry DSN cho frontend |

---

## 9. Vận hành & Maintenance

### 9.1. Monitoring

**Health checks:**
- `GET /health` → liveness (200 nếu process còn sống)
- `GET /ready` → readiness (200 nếu MongoDB connected)
- Response: `{ status, version, env, dbName, uptime, timestamp }`

**Sentry:**
- Server: tự động capture 5xx errors
- Client: ErrorBoundary capture render errors + axios 5xx
- Tags: `requestId` để correlate

**Logs (Pino structured JSON):**
- Mỗi request: `{ requestId, method, url, statusCode, latencyMs }`
- Mọi error: `{ err, requestId, stack }`
- Production: ship qua Render → Logtail / Datadog / etc.

### 9.2. Backup & Disaster Recovery

| Metric | Target |
|--------|--------|
| RPO (Recovery Point Objective) | 24h (Atlas daily snapshots) |
| RTO (Recovery Time Objective) | 4h |

**Atlas backup:**
- Free M0: daily snapshot, 2-day retention
- Restore: Atlas UI → Clusters → Backup → chọn snapshot → Restore

**Backup verification (monthly drill):**
```bash
node server/scripts/verify-backup.js
```
Script kiểm tra: MongoDB connectivity, doc counts của 6 collection chính, latest user createdAt.

**Incident playbook:** xem chi tiết tại `docs/backup-dr.md` (P1/P2/P3 escalation, contacts).

### 9.3. Cron pinger setup

Render free tier sleep sau 15 phút idle → in-process cron không reliable.

**Setup external pinger:** `docs/cron-pinger-setup.md`
1. Tạo `CRON_TOKEN` (32-byte hex)
2. Set vào Render env
3. Đăng ký cron-job.org (free)
4. Cron job: `POST https://your-app.onrender.com/api/cron/reconcile` với header `Authorization: Bearer <CRON_TOKEN>` lúc 02:00 UTC daily
5. (Optional) Keep-warm: `GET /api/cron/health` mỗi 10 phút giờ hành chính

### 9.4. Rotation & key management

**Rotate CRON_TOKEN:**
1. Generate token mới
2. Update Render env → redeploy
3. Update header value trong cron-job.org

**Rotate JWT_SECRET:**
- Sẽ invalidate TẤT CẢ session hiện tại — chỉ làm khi cần (lộ secret)
- Update Render env → redeploy → user phải login lại

### 9.5. Database maintenance

**Indexes** — auto-created từ schema definitions, kiểm tra:
```bash
mongo $MONGO_URI --eval "db.users.getIndexes()"
```

**TTL collections:**
- `auditlogs`: 730 ngày
- `reconcilereports`: 30 ngày
- (cấu hình bằng env `AUDIT_RETENTION_DAYS`)

**Manual reconciliation:**
- UI: Admin → Reconciliation → Run now
- API: `POST /api/admin/reconcile/run` (Admin)
- CLI cron: `POST /api/cron/reconcile` (CRON_TOKEN)

---

## 10. Testing & Chất lượng code

### 10.1. Test coverage

**Server (Jest + supertest):**
- Integration tests: 17 suites
  - `auth.test.js` — login, MFA, role guards
  - `booking.test.js` — slot booking, enrollment auto-fill, weekly limit, CSRF
  - `attendance.test.js` — bulk mark, analytics, CSRF
  - `teams.test.js` — CRUD, soft-delete sync, leader guard, CSRF
  - `passwordReset.test.js` — forgot/reset flow, anti-enumeration, timing attack fix
  - `userRoutes.test.js` — CRUD, re-auth gate, level fields, soft-delete/restore
  - `evaluationRoutes.test.js` — upsert, IDOR scoping, Teacher classId requirement
  - `enrollmentRoutes.test.js` — list, update status
  - `enrollmentTransfer.test.js` — transfer happy path, validation, conflict
  - `scheduleAuthz.test.js` — Participant IDOR scoping
  - `autoReleaseScope.test.js` — drop user không xóa nhầm team khác
  - `searchRoutes.test.js` — global search, role scoping
  - `cronRoutes.test.js` — CRON_TOKEN auth
  - `exportRoutes.test.js` — Excel/JSON export, role guards
  - `auditRoutes.test.js` — paginated query, role guards
  - `settings.test.js` — whitelist enforcement
- Unit tests: 5 suites (helpers, middleware, cronAuth, csrfProtection, emailTemplates)
- Load tests: Artillery smoke/load/spike scripts

**Client (Vitest + React Testing Library + MSW):**
- 8 test files, 47+ tests
- `schemas.test.js` — Zod validation
- `LoginPage.test.jsx` — render + validation + login flows
- `Pagination.test.jsx`, `QueryError.test.jsx` — components
- `useDebounce`, `useUsers`, `useRole`, `useTheme` — hooks

**E2E (Playwright):**
- 4 spec files, 19 tests
- `auth.spec.js`, `permissions.spec.js`, `navigation.spec.js`, `theme.spec.js`

**Tổng:** 241+ test cases, 21/21 suites pass.

### 10.2. Run tests

```bash
# Server
cd server && npm test                  # Jest, all suites
cd server && npm test -- auth          # filter by name

# Client
cd client && npm test                  # Vitest watch mode
cd client && npx vitest run            # one-shot
cd client && npm run test:coverage     # với coverage report (60% threshold)
```

### 10.3. CI/CD

- GitHub Actions workflow tại `.github/workflows/ci.yml` (nếu có)
- Pre-commit hook (recommend): chạy lint + test trước commit

### 10.4. Code quality

**Linting:**
- ESLint với `eslint-plugin-jsx-a11y` (accessibility rules)
- Run: `cd client && npm run lint`

**Code splitting metrics:**
- Vite manual chunks: react-vendor, radix-vendor, query-vendor, icons-vendor, sentry-vendor, toast-vendor
- chunkSizeWarningLimit: 700KB

**Performance:**
- Initial bundle ~300KB gzipped
- Lazy-loaded routes ~50KB each
- React Query cache eliminates redundant API calls

---

## 11. Troubleshooting

### 11.1. Lỗi đăng nhập

**"Invalid credentials"**
- Check empCode (đúng 6 số? leading zeros?)
- Caps Lock?
- Account có thể đang bị lock — wait 15 phút hoặc Admin force unlock

**"Account locked"**
- 5 fail trong 15 phút → tự động lock
- Admin: vào Users → tìm user → reset failed attempts (hoặc dùng API `POST /auth/admin/force-logout/:userId`)

**MFA code không đúng**
- Check đồng hồ điện thoại có sync NTP không (lệch >60s sẽ fail)
- Nếu mất phone → dùng backup code (XXXXX-XXXXX format)
- Mất hết → nhờ Admin reset MFA: `POST /auth/mfa/admin-disable/:userId`

### 11.2. Lỗi booking

**"Schedule full"**
- Capacity 9 mặc định → đã book đủ rồi
- Admin có thể tăng capacity: PUT /schedules/:id `{ capacity: 12 }`

**"User already enrolled in overlapping schedule"**
- Conflict detection — không được book 2 lớp cùng giờ
- Cancel 1 trong 2 trước

**"Team has no leader"**
- Team phải có leaderId → vào Teams → Edit → assign leader

### 11.3. Email không nhận được

**Password reset email**
- Check spam/junk folder
- Verify SMTP env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- Test nhanh:
  ```bash
  node -e "require('./server/lib/mailer').sendMail({to:'me@example.com',subject:'test',text:'hi'})"
  ```

**Booking confirmation email**
- Email là fire-and-forget — không block booking nếu fail
- Check server log: tìm `Booking email failed` warn entries

### 11.4. Google Calendar không sync

**Setup checklist:**
1. Service account có Domain-Wide Delegation chưa?
2. `GOOGLE_CALENDAR_IMPERSONATE` set đúng email impersonate chưa?
3. Calendar API enabled trong GCP project chưa?
4. Service account JSON paste đúng vào `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` chưa?

→ Xem chi tiết tại `docs/google-calendar-setup.md`

### 11.5. Render service sleep

**Triệu chứng:** request đầu tiên sau idle ~30s mới response.

**Solution:**
- Setup keep-warm pinger: `GET /api/cron/health` mỗi 10 phút giờ hành chính
- Hoặc upgrade Render plan (Starter $7/month không bao giờ sleep)

### 11.6. Database performance

**Slow query?**
- Vào Atlas → Performance Advisor → check missing indexes
- Tất cả compound indexes đã được khai báo trong models, kiểm tra `db.collection.getIndexes()`

**Connection limit (M0 = 500)**
- Mongoose connection pool: default 5, không cần tweak
- Nếu thấy connection errors → check connection leaks

### 11.7. CSP errors trong console

Nếu thấy `Refused to load... Content Security Policy directive`:
- Check origin trong `CORS_ORIGINS`
- Inline scripts? CSP đang block — phải refactor sang external file
- Inline styles ok vì có `'unsafe-inline'` cho Radix UI

---

## 12. Tài liệu liên quan

| File | Nội dung |
|------|----------|
| `README.md` | (file này) — tổng quan + hướng dẫn |
| `tms_v2_system_manual.md` | System manual chi tiết hơn về business logic |
| `server/API_REFERENCE.md` | API endpoint reference (Markdown) |
| `client/README.md` | Client setup riêng |
| `docs/backup-dr.md` | Disaster recovery runbook (RPO/RTO, drill, playbook) |
| `docs/cron-pinger-setup.md` | External cron setup chi tiết |
| `docs/google-calendar-setup.md` | Google Workspace integration |
| `/api/docs` (live) | Swagger UI interactive |
| `/api/docs.json` (live) | OpenAPI 3.0 spec JSON |

### Postman collection

Import: `TMS_v2_API.postman_collection.json` (root) — bao gồm các endpoint chính kèm example request body.

### GitHub repo

`https://github.com/FinanceBullkk/ConCho2`

---

## Lịch sử phát triển

Hệ thống đã trải qua **8 sprints** đưa từ MVP lên production-grade:

| Sprint | Nội dung chính |
|:------:|----------------|
| 1 | Forms + Zod validation, Accessibility (jsx-a11y), Backup/DR documentation |
| 2 | Error states + skeletons, Pagination UI, CSRF protection, Vitest + MSW setup |
| 3 | Password reset flow, URL-synced filters, Audit log UI, useDebounce hook |
| 4 | Optimistic mutations, expanded test coverage |
| 5 | SIGTERM graceful shutdown, Dockerfile, success toasts, useRole hook, bulk user actions |
| 6 | Light/dark mode, server-side analytics pagination, more tests |
| 7 | Integration tests cho 10 routes, middleware unit tests, rate limiter security fixes |
| 8 | OpenAPI/Swagger docs, mobile hamburger nav, booking confirmation email, health versioning |
| 9 | Global search (Cmd+K), enrollment transfer, email notifications, evaluation export, RBAC guards, ClassesPage filters, Playwright E2E, 18 bug fixes (IDOR scoping, anti-enumeration, re-auth gate, auto-release scope, weekly limit enforcement, key-matching fix for booking grid) |

---

## License

MIT — sử dụng tự do nội bộ.

---

<p align="center">
  Built with care · Maintained by the L&D team<br/>
  <em>Câu hỏi? Liên hệ Admin team hoặc tạo issue trên GitHub.</em>
</p>
