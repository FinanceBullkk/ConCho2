<p align="center">
  <img src="https://img.shields.io/badge/Stack-MERN-00d8ff?style=for-the-badge&logo=mongodb&logoColor=white" alt="MERN Stack"/>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React 19"/>
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB"/>
  <img src="https://img.shields.io/badge/Tests-241%2B-brightgreen?style=for-the-badge" alt="Tests"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License"/>
</p>

<h1 align="center">TMS v2 — Internal Training Management System (→ LTMS)</h1>

<p align="center">
  <strong>Internal training management system (~1000 employees) — a full replacement for Excel and Google Sheets.</strong><br/>
  Scheduling · Attendance · Evaluation · Completion · Certificates · Audit · HR reports — all in one place.
</p>

---

## Table of contents

1. [What is TMS, and why do we need it?](#1-what-is-tms-and-why-do-we-need-it)
2. [Who uses it, and what can they do?](#2-who-uses-it-and-what-can-they-do)
3. [Feature details](#3-feature-details)
4. [Role-based usage guide](#4-role-based-usage-guide)
5. [Security — how is the system protected?](#5-security--how-is-the-system-protected)
6. [Setup & Deployment](#6-setup--deployment)
7. [Day-to-day operations](#7-day-to-day-operations)
8. [Technical architecture (for developers)](#8-technical-architecture-for-developers)
9. [Testing & Quality](#9-testing--quality)
10. [Common troubleshooting](#10-common-troubleshooting)
11. [Related documentation](#11-related-documentation)
12. [Development history](#12-development-history)

---

## 1. What is TMS, and why do we need it?

TMS v2 is an **internal web application** that manages the whole **internal training** process for the organization (~1000 employees) — scheduling, attendance, evaluation, completion, certificates, audit, and HR reports. It started as an English-class manager and is becoming an **Internal LTMS** (Learning/Training Management System) for many program types — onboarding, compliance, soft skills, technical, and more — focused on **training operations + compliance**, not a commercial LMS or a SCORM content platform. Detailed direction: [`docs/lms-roadmap.md`](docs/lms-roadmap.md) and [`docs/ltms-gap-analysis.md`](docs/ltms-gap-analysis.md).

### The problem before TMS

| Before | With TMS |
|--------|----------|
| Schedules scattered across many Excel files, easy to conflict | One single system; everyone sees the same data in real time |
| Manual attendance on paper or sheets, error-prone | Mark a whole class in a few clicks, with history kept |
| No idea who attends regularly and who skips | Automatic dashboard by department, level, and course |
| No Google Calendar — learners forget their schedule | The system auto-creates Google Calendar invites + Meet links for each person |
| Weak passwords, no 2FA | bcrypt hashing + two-factor (TOTP) + auto-lock after repeated failed logins |
| No idea who changed what | Every action is logged automatically (audit log) — who did what, and when |

### Real-world benefits

- **Save ~80% of data-entry effort** for HR/L&D each month
- **Reports on demand** — no waiting for month-end Excel compilation
- **No data loss** — everything is backed up automatically; accidental deletes are recoverable
- **Self-detecting errors** — the system checks its own data every night and reports anomalies

---

## 2. Who uses it, and what can they do?

The system has **3 roles** with distinct permissions. Each person only sees and does what fits their job.

> **Why strict permissions?**
> To prevent a learner from accidentally (or deliberately) deleting someone else's schedule, or viewing a colleague's scores. Each role sees only what it needs.

| Role | For | Can do |
|------|-----|--------|
| **Admin** | HR, L&D Manager | Full access: manage employees, classes, teams, teaching schedules; export reports; configure the system |
| **Teacher** | Instructor | View teaching schedule, mark learner attendance, grade end-of-course evaluations |
| **Participant** | Learner (employee in training) | View their group's schedule, book a session slot (if team leader), view personal scores |

---

## 3. Feature details

### 3.1. User management

- Add, edit, and delete employees with full details: employee code, name, email, department, entry/current level
- **6 statuses** reflecting reality: Active / On-hold / Dropped / Transferred / Waiting / Waiting for class
- **Safe delete** — a deleted employee goes to "trash" and can be restored if removed by mistake

  > **Why no permanent delete?** Old attendance and evaluation data still needs to be kept for reports. A permanent delete would lose that history.

- **Bulk import from Excel** — upload the employee list once; the system checks for duplicate codes and email format
- **Auto-remove from schedules** — when an employee becomes "Dropped", the system removes them from all future sessions (fully in sync, nothing missed)

  > **Why automate this?** Done manually, it's easy to miss a session — a person who has left still shows up in attendance lists, confusing the teacher.

### 3.2. Class management

- Each class has a class code (e.g. `EL001`), a course name, a total session count, and a status (Ongoing / Completed)
- The course name is chosen from a predefined list (Foundation, Communication 1–3, Business English…) — avoiding typos and keeping report data consistent
- The session count is auto-filled from the course

### 3.3. Learning-group management

- Each group is tied to exactly one class
- Each group has one **team leader** — the person responsible for booking sessions for the whole group
- **Transfer a learner to another group** in a single operation: the system updates both groups, the old and new schedules, and then emails the learner

  > **Why a single operation?** If done step by step (remove from group A, add to group B, fix schedules…) and it fails midway, the data ends up half-finished — the person is removed from A but not yet in B. The system does it all-or-nothing.

### 3.4. Session booking (created by the team leader)

This is the system's central feature.

> **Key point to understand:** Schedules are **NOT** created up front by an admin for groups to book into. It's the reverse — **the team leader creates the schedule** by clicking an empty cell on the time grid. The system creates the session at that moment and enrolls the whole group.
>
> **Why design it this way?** The admin doesn't need to know in advance which group studies at which time — too much to track. Letting the team leader pick a time that fits the team is more flexible and natural. The admin only needs to ensure: the class exists, the group is assigned to the right class, and the time-slot limits are set — the group handles the rest.

**Scheduling rules:**
- Each session is exactly **1 hour**
- Sessions are only allowed in **5 fixed slots**: 10:00–11:00 · 11:00–12:00 · 13:00–14:00 · 14:00–15:00 · 15:00–16:00

  > **Why limit the slots?** To avoid cases like booking at 10:30 or a non-standard 1.5-hour session. Fixed slots keep schedules consistent and make conflicts easy to control.

- Each group is limited to **2 sessions/week**

**How to create a session (for team leaders):**
1. Open the **Booking** page (`/book`) — shows a 7-day × 5-slot grid
2. A **white** cell = free, bookable · A **colored** cell = taken by another group (cannot be selected)
3. Click an empty cell → confirm → the system creates the new session · the whole group is enrolled automatically
4. Each member receives a confirmation email + an automatic Google Calendar invite

  > **Why should a team leader see other groups' slots?** To know which times are free, and avoid trying to book a time already taken. Hiding this would leave the leader facing an error with no explanation.

- **Double-booking protection** — two leaders click the same cell in the same second? The database has a unique constraint `{class, startTime}` — only one request succeeds; the other gets a "Slot taken, please choose another" message.
- **Automatic reminders** — a reminder email is sent 24 hours before the session
- **Cancellation** — the team leader can cancel a session; members are notified automatically by email
- **Admin override if needed** — the admin can fully edit or delete a created schedule (e.g. to reschedule on a group's behalf)

### 3.5. Attendance

- 4 statuses: **Present (P)** / **Absent (A)** / **Late (L)** / **Excused (EL)**
- Mark a whole class in **one submit** — no need to do it person by person
- A **weekly calendar** view — the teacher sees at a glance which sessions are marked, which are missing, and which are overdue
- A flashing red cell = a session that has passed but is not yet marked — needs attention now

### 3.6. End-of-course evaluation

- Grade 4 skills: Grammar · Vocabulary · Pronunciation · Fluency — on a 0–10 scale
- The average is computed automatically
- The teacher can add free-form comments
- Re-grading overwrites the old result (no duplicate record)

### 3.7. Reporting & Export

- **Excel attendance export** — a complete file for a date range, ready to submit to HR
- **Excel evaluation export** — the 4-skill scores + average + comments per class
- **Exported marker** — the system records which entries have been exported, avoiding duplicate exports
- **Analytics dashboard**:
  - Attendance rate by course / department / level
  - The most diligent and most absent learners

### 3.8. Audit Log — system journal

Every create/edit/delete action is logged automatically:
- **Who** did it (employee code, role)
- **What** (create, edit, delete, login…)
- **On which data** (which user, which schedule…)
- **When** (exact time)
- **The specific change** (value before → after)

> **Why an audit log?** When something goes wrong ("who deleted my schedule?", "who changed a score?"), an admin can look it up immediately. It's also a hard requirement of many internal audit standards.

Retained for 2 years, then auto-deleted.

### 3.9. Data self-check (Reconciliation)

The system **runs a check every night at 02:00** to detect anomalies:

| Check | Meaning |
|-------|---------|
| Past session not yet marked | Remind the teacher to fill it in |
| Learner on a schedule but no longer in the group | Out-of-sync data |
| Dropped employee still in a group | Needs cleanup |
| Future session with nobody enrolled | Empty schedule, review needed |
| Active employee not in any group | Not yet assigned to a class |

Results are kept for 30 days to compare trends.

---

## 4. Role-based usage guide

### 4.1. First login

1. Open a browser → go to the system address (e.g. `https://concho2.onrender.com`)
2. Enter your **Employee code** (6 digits, e.g. `000123`) and the **Password** provided by the Admin
3. Click **Log in**
4. **First time:** the system requires you to change the default password immediately — this step cannot be skipped

   > **Why force a password change on first login?** The default password (`admin12345`) is the same for every new account — if not changed, anyone who knows it can log in.

5. If your account is required to use **two-factor authentication (2FA)**:
   - Install **Google Authenticator** or **Microsoft Authenticator** on your phone
   - Scan the QR code shown on screen
   - Enter the 6 digits from the app to confirm
   - **Save the 10 backup codes** — shown only once, used if you lose your phone

**Forgot your password?**
1. Click **"Forgot password?"** on the login page
2. Enter your employee code → Submit
3. Check your company email → click the link in the email (expires after 1 hour)
4. Set a new password (at least 10 characters)

---

### 4.2. Admin — monthly workflow

#### First-time setup (done once)

1. Go to **Admin → System settings**: check the 5 default time slots (10–11, 11–12, 13–14, 14–15, 15–16). Change them if the organization uses different hours.
2. Review the course list and the corresponding session counts
3. **Import the employee list** from Excel (Academy → Users → Import)

#### Per-new-course workflow

> **Important note:** The admin **only creates classes and groups** — not schedules. Schedules are **created by the team leader** when booking a slot in the UI. This is the core difference from traditional scheduling systems.

```
Step 1 → Create a class (Academy → Classes → New)
         Enter the class code, choose the course; the system fills in the session count

Step 2 → Create a group and assign it to the class (Academy → Groups → New)
         Tie the group to the class (1 group = 1 class), choose a leader, add members

Step 3 → Tell the team leader to book sessions
         They open "Booking" (/book) and see the 7-day × 5-slot grid
         Click an empty cell → a session is created + the whole group is enrolled
         (The admin can edit or reschedule after the group has booked, if needed)

Step 4 → Monitor
         Dashboard → view attendance rate by week/month

Step 5 → End of course: Export reports (Reports → HR Export → Download Excel)
```

#### Day-to-day operations

- **Home (Dashboard)** — attendance rate by department, anomaly alerts
- **Admin → Journal** — check who did what recently if there are questions
- **Admin → Data check** — run manually if you suspect an error
- **Academy → Users (deleted)** — view the trash, restore if deleted by mistake

---

### 4.3. Teacher — attendance workflow

1. Log in → **Operations → Attendance**
2. The weekly calendar shows all sessions:
   - 🟢 Fully marked
   - 🟡 Not yet marked
   - 🔴 **Overdue** — past session, not marked — handle now
3. Click a session → the learner list appears
4. Click **P / A / L / EL** for each person (or "Mark all P" for speed)
5. Add notes if needed → **Save**

**End of course — Grading:**
1. **Operations → Evaluation** → choose a class
2. Enter the 4-skill scores (0–10) for each learner + comments
3. The average is computed automatically

---

### 4.4. Participant (Learner) — booking a session

> Only the **team leader** can book sessions. Regular members can only view.

1. Log in → **Booking** (`/book`)
2. The weekly grid appears:
   - A **white** cell = free, bookable
   - A **colored** cell = already booked by another group, cannot be selected
3. Click an empty cell → review the session details → **Confirm booking**
4. The whole group automatically receives a confirmation email + Google Calendar invite
5. To cancel: click a booked session → **Cancel** (the whole group is notified by email)

**Limit:** at most 2 sessions/week/group.

---

### 4.5. All users — personal account management

Go to **Account settings** (top-right of the screen):
- **Change password** — requires the current password; the new one must be at least 10 characters
- **Enable two-factor authentication (2FA)** — strengthens account security
- **Switch theme** — dark / light (remembered across logins)

---

## 5. Security — how is the system protected?

This section explains **each protection layer** in plain language — important for understanding why the system is designed this way.

### 5.1. Passwords

- **The original password is never stored** — only its "fingerprint" (a bcrypt hash, 12 rounds). Even a developer looking at the database cannot tell what your password is.
- **At least 10 characters** — enough to resist real brute-force attempts
- **Auto-lock** after 5 failed logins within 15 minutes — defeats automated password guessing

### 5.2. Login session

- The auth token is stored in a **hidden cookie** — JavaScript cannot read it, malware cannot steal it
- The token expires after **24 hours** — you must log in again
- When the password changes → **all old sessions are invalidated immediately**, including on other devices

  > **Why does this matter?** If a computer is lost or someone is using your account, changing the password is enough to "kick" them out right away.

### 5.3. Two-factor authentication (2FA / MFA)

- Uses the **TOTP** standard (Time-based One-Time Password) — the same technology as Google/Facebook
- Each 6-digit code is valid for only 30 seconds, then expires
- **10 backup codes** for a lost phone — each usable exactly once

### 5.4. Strict authorization

- **The server** checks permissions on every request — you cannot "hack" it by editing browser-side code
- **The UI** hides buttons from users without permission — you won't see a "Delete user" button unless you're an Admin
- **Two layers of checks** ensure that even if the UI is bypassed, the server still refuses

### 5.5. Rate limiting

Each action has a limit to defeat automated attacks:

| Action | Limit |
|--------|-------|
| Failed login | 5 / 15 min / IP |
| Forgot password | 5 requests / 15 min |
| Booking | 10 / min |
| Report export | 10 / hour |
| All API | 200 requests / min / IP |

### 5.6. Anti-forgery protection (CSRF)

Every state-changing request (create, edit, delete) must carry a **random secret token** generated by the server. If someone tricks you into clicking a malicious link, that request won't have the token and will be rejected.

---

## 6. Setup & Deployment

### 6.1. Run locally (for developers)

**Requirements:**
- Node.js version 20 or higher (engines `>=20`; CI runs Node 22)
- A MongoDB Atlas account (or MongoDB installed locally)
- (Optional) Google Workspace with a service account for Google Calendar
- (Optional) SMTP to send email

```bash
# 1. Clone the source code
git clone https://github.com/FinanceBullkk/ConCho2.git
cd ConCho2

# 2. Install dependencies
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..

# 3. Create the server config server/.env (copy from the template)
cp server/.env.example server/.env
# Open server/.env and fill in JWT_SECRET, MONGO_URI, CRON_TOKEN, ... per the table below
# IMPORTANT: server/.env is in .gitignore — never commit this file.
# If you accidentally commit it, ROTATE every leaked secret immediately.

# 4. Seed sample data (admin + 2 teachers + 6 learners + 2 classes + schedules)
cd server && npm run seed && cd ..

# 5. Start
npm run dev:server   # Terminal 1: server on port 5000
npm run dev:client   # Terminal 2: client on port 5173
```

Open `http://localhost:5173` — log in with:
- Admin: `000001` / `admin12345` (forced to change password immediately)
- Teacher: `000002` / `teacher123`
- Participant/Team leader: `000004` / `participant123`

### 6.2. Deploy to Render.com

1. Push the code to GitHub
2. Render Dashboard → **New → Blueprint** → connect the repo → choose `render.yaml`
3. Fill in the environment variables (table below)
4. Render builds and deploys automatically
5. Set up an external cron pinger (see `docs/cron-pinger-setup.md`) so the system doesn't "sleep"

### 6.3. Deploy with Docker

```bash
docker build -t tms-v2 .
docker run -d --name tms-v2 -p 5000:5000 --env-file .env tms-v2
```

### 6.4. Environment variables

| Variable | Required? | Description |
|----------|:---------:|-------------|
| `NODE_ENV` | ✓ | `development` or `production` |
| `MONGO_URI` | ✓ | MongoDB Atlas connection string |
| `JWT_SECRET` | ✓ | Secret key for signing tokens (random 32-byte string) |
| `CORS_ORIGINS` | ✓ | Frontend URLs allowed to call the API — the server REFUSES TO START in production without it (OPS-011) |
| `CRON_TOKEN` | ✓ | Secret for the nightly automated job |
| `CLIENT_ORIGIN` | ✓ | Frontend URL (used in password-reset emails) — the server REFUSES TO START in production without it (OPS-011) |
| `IMPORT_DEFAULT_PASSWORD` | ✓ (production) | Initial password for bulk-imported users — the server REFUSES TO START in production without it |
| `JWT_EXPIRE` | | Session lifetime, e.g. `1d` (default `1d` = 24h) |
| `EMAIL_FROM` | | Sender display address (defaults to `SMTP_USER`) |
| `MFA_ISSUER` | | TOTP issuer label shown in authenticator apps (default `TMS`) |
| `SWAGGER_ENABLED` | | `true` exposes `/api/docs` in production (always on in dev) |
| `AUDIT_RETENTION_DAYS` | | Audit-log TTL in days (default `730`) |
| `REDIS_URL` | | Optional shared rate-limit store for multi-instance deploys |
| `SMTP_HOST` | | Email server (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | | Email port (587 or 465) |
| `SMTP_USER` | | Sending email account |
| `SMTP_PASS` | | Email password or App Password |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | | JSON key of the Google Service Account (for Calendar) |
| `GOOGLE_CALENDAR_IMPERSONATE` | | Email of the delegated Google account |
| `SENTRY_DSN` | | DSN for production error tracking (Sentry) |
| `TMS_TIMEZONE` | | Timezone (default UTC, recommended `Asia/Ho_Chi_Minh`) |
| `MFA_REQUIRED_ROLES` | | Roles required to enable 2FA (e.g. `Admin`) |
| `LOG_LEVEL` | | Log level: `info` (default), `debug`, `warn` |

> Advanced tuning knobs (timeouts, cache TTLs, pool sizes, login-lockout
> thresholds, import batch caps…) are read from env with safe defaults — run
> `node server/scripts/audit-env-doc-diff.js` for the full inventory of what
> the runtime reads vs this table.

---

## 7. Day-to-day operations

### 7.1. Health monitoring

```
GET /health  → Is the server running?
GET /ready   → Is the database connected?
```

Both return JSON with status, version, and uptime.

### 7.2. Backup & Restore

- **MongoDB Atlas auto-snapshots** daily — keeps the last 2 days (free tier)
- **Restore**: Atlas Dashboard → Clusters → Backup → choose a snapshot → Restore
- **Targets:** at most 24 hours of data loss (RPO) · restore within 4 hours (RTO)
- **Monthly check:** run `node server/scripts/verify-backup.js` to confirm backups work

See the detailed incident runbook in `docs/backup-dr.md`.

### 7.3. Nightly automated job

Every night at **02:00 UTC**, the system runs the data check (reconciliation). Because the Render free tier shuts the server down after 15 minutes of inactivity, you need an **external cron pinger** to ensure this job runs on time:

- Guide: `docs/cron-pinger-setup.md`
- Use [cron-job.org](https://cron-job.org) (free) to call `POST /api/cron/reconcile` every night

### 7.4. Rotating secrets

**Rotate CRON_TOKEN** (periodically or if you suspect a leak):
1. Generate a new token → update the environment variable on Render → redeploy → update on cron-job.org

**Rotate JWT_SECRET** (only if the key leaks):
- All users are logged out immediately — they need to log in again

---

## 8. Technical architecture (for developers)

### 8.1. Tech stack

```
┌─────────────────────────────────────────────────────────┐
│                     BROWSER (Client)                    │
│  React 19 + Vite 8 + TailwindCSS + Radix UI            │
│  React Query (server-state management)                 │
│  React Hook Form + Zod (forms & validation)            │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + HttpOnly cookie + CSRF token
                       │
┌──────────────────────▼──────────────────────────────────┐
│                    SERVER (Express)                     │
│  Helmet · CORS · Pino Logger · Rate Limiters · CSRF    │
│  Routes → Controllers → Services → Mongoose ORM        │
│  Cron Jobs · Audit Logger · Reconcile Engine           │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              MongoDB Atlas (Database)                   │
│  12 collections: Users, Classes, Schedules,            │
│  Attendance, Evaluations, Teams, Enrollments,          │
│  AuditLog, Settings, Counter, TokenBlocklist...        │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
┌─────────▼───────┐       ┌─────────▼────────┐
│ Google Workspace│       │  SMTP (Email)    │
│ Calendar + Sheets│      │ Booking confirm, │
│ Meet links      │       │ password reset  │
└─────────────────┘       └──────────────────┘
```

### 8.2. Directory structure

```
ConCho2/
├── client/                      # React SPA
│   └── src/
│       ├── pages/               # route-level views (lazy-loaded)
│       ├── components/          # reusable components
│       ├── hooks/               # custom hooks
│       ├── context/             # AuthContext
│       ├── lib/                 # Zod schemas, Sentry, utils
│       └── api/                 # axios instance + interceptors
│
├── server/                      # Node.js/Express API
│   ├── domains/                 # modular-monolith boundaries (learning, schedule)
│   ├── routes/                  # legacy route files
│   ├── controllers/             # legacy controllers
│   ├── services/                # business logic services
│   ├── models/                  # Mongoose schemas
│   ├── middleware/              # auth, csrf, rateLimiters, validate
│   ├── jobs/                    # node-cron schedules
│   └── tests/                   # integration + unit + load tests
│
├── docs/                        # operational documentation
│   ├── backup-dr.md             # Disaster recovery runbook
│   ├── cron-pinger-setup.md     # External cron guide
│   └── google-calendar-setup.md # Google Workspace integration
│
├── Dockerfile                   # Multi-stage production image
├── render.yaml                  # Render.com deploy blueprint
└── README.md                    # ← this file
```

### 8.3. Request lifecycle

```
Incoming request
  → Attach a unique Request ID (for log tracing)
  → Structured log (Pino)
  → Security headers (Helmet: CSP, X-Frame-Options...)
  → CORS check
  → Parse cookie (JWT session)
  → Parse JSON body
  → Strip malicious characters from input
  → Global rate limiter
  → CSRF token check
  → Route-specific middleware (auth, roleGuard, validate, per-route rate limit)
  → Controller → Service → Mongoose
  → Response
  → Write the audit log asynchronously
  → Error handler → Sentry (on 5xx errors)
```

### 8.4. Auth flow

```
POST /auth/login
  → Validate empCode + password
  → Check whether the account is locked (failedLoginAttempts)
  → Compare the password (bcrypt.compare)
  → If MFA: return mfaPendingToken (5 minutes)
  → If no MFA: set the HttpOnly cookie (24 hours)

POST /auth/mfa/verify (step 2 if MFA is on)
  → Verify the TOTP code (±60s clock tolerance)
  → Or use a backup code (mark it used)
  → Set the full HttpOnly cookie

Every subsequent request
  → middleware/auth.js verifies the cookie
  → Caches the user for 30 seconds (fewer DB queries)
  → Checks passwordChangedAt > token.iat (invalidates old tokens)
```

### 8.5. Database schema

**Users**
```
empCode (unique), name, email, role, department, position
status (Active|Inactive|Dropped|Transferred|On-hold|Waiting for class)
password (bcrypt), passwordChangedAt, mustChangePassword
mfaEnabled, mfaSecret*, mfaBackupCodes*    (* select:false — hidden from responses)
failedLoginAttempts, lockUntil
isDeleted, deletedAt                        (soft delete)
```

**Schedules**
```
classId, bookedTeamId, startTime, endTime
roomLink, meetLink, googleEventId
enrolledUsers: [userId]
UNIQUE index: {classId, startTime}          ← prevents concurrent double-booking
```

> **Why a unique index?** Checking logic in code isn't enough — two people can click "book" in the same second. A unique index at the database is the final protection layer, ensuring only one request succeeds.

**Attendance**
```
scheduleId, userId
status: P | A | L | EL
remark, photoUrl
syncStatus: PENDING | EXPORTED
UNIQUE index: {scheduleId, userId}
```

**AuditLog**
```
actorId, actorRole, actorEmpCode
action, entity, entityId
diff (before/after, passwords redacted)
requestId, ip, userAgent
createdAt (TTL: 730 days)
```

### 8.6. Authorization (33 permissions × 3 roles)

| Permission group | Admin | Teacher | Participant |
|------------------|:-----:|:-------:|:-----------:|
| Manage users (create/edit/delete) | ✓ | | |
| View user list | ✓ | ✓ | |
| Manage classes | ✓ | | |
| View classes | ✓ | ✓ | ✓ |
| Create/edit teaching schedule | ✓ | ✓ | |
| Delete teaching schedule | ✓ | | |
| Mark attendance | ✓ | ✓ | |
| Book for own group | ✓ | | ✓ |
| Grade evaluations | ✓ | ✓ | |
| Export/import data | ✓ | | |
| System config, audit log | ✓ | | |

---

## 9. Testing & Quality

### 9.1. Overview

| Test type | Tool | Count | Status |
|-----------|------|-------|--------|
| Integration tests (API) | Jest + Supertest | 17 suites | ✅ pass |
| Unit tests | Jest | 5 suites | ✅ pass |
| Client tests | Vitest + RTL | 140+ cases | ✅ pass |
| E2E (browser) | Playwright | 19 cases | ✅ pass |
| Load tests | Artillery | Smoke/Load/Spike | ✅ pass |
| **Total** | | **241+ cases** | **✅ 100%** |

> **Why do tests matter?** Each time you add a feature or fix a bug, there's a risk of accidentally breaking something else. Hundreds of test cases run automatically on every commit — if something breaks, it's caught before production.

### 9.2. Running tests

```bash
# Server (Jest)
cd server && npm test

# Client (Vitest)
cd client && npx vitest run

# With a coverage report
cd client && npm run test:coverage
```

### 9.3. Performance

- Initial JavaScript bundle: **~300KB** gzipped — fast to load
- Rarely-used pages load only on demand (lazy loading)
- Data cached for 30 seconds — no redundant API calls
- Analytics cached for 60 minutes — no recompute on each view

---

## 10. Common troubleshooting

### Cannot log in

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Invalid credentials" | Wrong employee code or password | Check Caps Lock and the leading 0 in the code |
| "Account locked" | 5 wrong passwords | Wait 15 minutes, or ask an Admin to unlock |
| 2FA code rejected | Phone clock drift | Sync the phone clock with the internet |
| Lost the phone with the 2FA app | No TOTP | Use a saved backup code, or ask an Admin to reset 2FA |

### Cannot book a session

| Symptom | Cause | Fix |
|---------|-------|-----|
| Slot shown colored (not clickable) | Already booked by another group | Choose another slot |
| "Already 2 sessions this week" | Over the 2/week limit | Book the following week |
| "Group has no team leader" | Missing leaderId | Admin → Teams → edit → assign a leader |

### Email not received

- Check the **Spam/Junk** folder
- For admins: check the SMTP environment variables on Render
- Quick test: `node -e "require('./server/lib/mailer').sendMail({to:'test@gmail.com',subject:'test',text:'hi'})"`

### Google Calendar not working

1. Has the service account been granted **Domain-Wide Delegation**?
2. Is `GOOGLE_CALENDAR_IMPERSONATE` the correct email?
3. Is the Google Calendar API enabled in the GCP project?

→ Details in `docs/google-calendar-setup.md`

### Render is slow (first request ~30 seconds)

The server "sleeps" after 15 minutes of inactivity. Fixes:
- Set up a keep-warm pinger: `GET /api/cron/health` every 10 minutes during business hours
- Or upgrade Render to the Starter plan ($7/month) — never sleeps

---

## 11. Related documentation

| File | Contents |
|------|----------|
| `AGENTS.md` | Contract for Codex/Claude: Internal LTMS, no feature factory, done means wired |
| `CLAUDE.md` | Working rules for Claude Code in this repo |
| `docs/README.md` | **Docs index** — start-here-by-role, living-docs table, archive |
| `docs/system-overview.md` | Architecture overview + current status |
| `docs/development-roadmap.md` | Living tracker: milestones, changelog, quality gate |
| `docs/lms-roadmap.md` | Internal LTMS 6-month roadmap for 1000 employees |
| `docs/ltms-gap-analysis.md` | LTMS gap analysis + locked priority order |
| `docs/backup-dr.md` | Incident handling, data recovery |
| `docs/cron-pinger-setup.md` | Setting up the nightly automated job |
| `docs/google-calendar-setup.md` | Google Workspace integration |
| `/api/docs` *(when the server is running)* | Swagger UI — partial coverage (annotated routes only); full route list: `docs/route-permission-matrix.md` |
| `/api/docs.json` *(when the server is running)* | OpenAPI spec — import into Postman |

**GitHub:** `https://github.com/FinanceBullkk/ConCho2`

---

## 12. Development history

The system was built over **9 sprints**, from a basic prototype to production-grade:

| Sprint | Focus | Meaning |
|:------:|-------|---------|
| 1 | Form validation, Backup/DR docs | Foundation: no data loss from day one |
| 2 | Skeleton loading, pagination, CSRF protection, first test suite | Smooth UX + basic security |
| 3 | Forgot password, URL filters, audit log UI | Self-service + action traceability |
| 4 | Optimistic updates, more tests | Faster interactions, higher reliability |
| 5 | Graceful shutdown, Docker, toasts, useRole, bulk actions | Production-ready |
| 6 | Dark/light mode, analytics pagination | User experience |
| 7 | Integration tests for 10 routes, middleware unit tests | Quality assurance before scaling |
| 8 | Swagger docs, mobile menu, booking confirmation emails | Documentation + mobile-ready |
| 9 | Cmd+K search, learner group transfer, evaluation export, RBAC guards, Playwright E2E, 18 bug fixes (IDOR, anti-enumeration, re-auth, auto-release, weekly limit, booking-grid key matching) | Production hardening — ready for 200 users |

> Beyond Sprint 9, the system is being re-architected into an **Internal LTMS** (Learning/Training Management System). Live status and the 6-month plan live in [`docs/development-roadmap.md`](docs/development-roadmap.md) and [`docs/lms-roadmap.md`](docs/lms-roadmap.md).

---

## License

MIT — free for internal use.

---

<p align="center">
  Built with care · Maintained by the L&D team<br/>
  <em>Questions? Contact the Admin team or open an issue on GitHub.</em>
</p>
