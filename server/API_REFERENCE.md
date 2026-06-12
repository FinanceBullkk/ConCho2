# TMS v2 — API Reference & Postman Guide

> **Interactive docs:** In development, `http://localhost:5000/api/docs` serves Swagger UI.
> Coverage is PARTIAL (a handful of annotated legacy routes — DOCS-006; annotate-over-time).
> The authoritative route inventory is `docs/route-permission-matrix.md` /
> `node server/scripts/audit-route-permission-diff.js --routes`.
> The raw OpenAPI spec JSON is at `GET /api/docs.json`.

## Quick Start with Postman

### 1. Import the Collection
1. Open Postman → Click **Import** (top-left)
2. Drag and drop `TMS_v2_API.postman_collection.json` from `e:\ConCho2\server\`
3. The collection "TMS v2 API" will appear with all endpoints organized by folder

### 2. How Authentication Works
- The `baseUrl` variable is pre-set to `http://localhost:5000/api`
- **Login first** → `POST /api/auth/login` sets an **HttpOnly cookie** (`token`) and a `XSRF-TOKEN` cookie
- Postman forwards cookies automatically; all subsequent requests are authenticated via the HttpOnly cookie + `X-XSRF-TOKEN` request header (the collection-level Pre-request Script reads `XSRF-TOKEN` and adds the header)
- **To switch roles**: simply run a different Login request (Admin/Teacher/Participant)

### 3. Testing Workflow
```
1. Login as Admin    → token saved automatically
2. GET /teams        → copy a teamId
3. GET /schedules    → copy a scheduleId
4. POST book-team    → paste teamId + scheduleId
5. Login as Teacher  → token switches to teacher
6. POST attendance   → mark attendance for a schedule
```

---

## Seed Data Reference

| empCode | Password | Role | Status |
|---------|----------|------|--------|
| ADMIN001 | admin12345 | Admin | Active |
| TEACH001 | teacher123 | Teacher | Active |
| TEACH002 | teacher123 | Teacher | Active |
| PART001 | participant123 | Participant | Active |
| PART002 | participant123 | Participant | Active |
| PART003 | participant123 | Participant | Active → test Dropped |
| PART004 | participant123 | Participant | Active |
| PART005 | participant123 | Participant | Active |
| PART006 | participant123 | Participant | On-hold |

**Teams:**
- Sales Team Alpha: PART001 (lead), PART002, PART003
- Marketing Team Beta: PART004 (lead), PART005, PART006

---

## API Endpoints

### 🔐 Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | None | Login — sets HttpOnly `token` cookie + `XSRF-TOKEN` cookie |
| GET | `/api/auth/me` | Cookie | Get current user info |

**Login Request Body:**
```json
{
  "empCode": "ADMIN001",
  "password": "admin12345"
}
```
**Response:** Returns `{ success, user }`. JWT is stored in an HttpOnly cookie (not in the response body); `XSRF-TOKEN` is a readable cookie used for CSRF protection. Both expire in 7 days.

---

### 👤 Users (Admin Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| GET | `/api/users?role=Teacher&status=Active` | Filter by role/status/department |
| GET | `/api/users/:id` | Get single user |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update user ⚡ |
| DELETE | `/api/users/:id` | Delete user |

> ⚡ **Auto-Release Trigger:** When you PUT a user's status to `"Dropped"`, the middleware automatically removes them from ALL future schedule enrollments and decrements enrolledCount. Check the server terminal log to see it happen.

**Create User Body:**
```json
{
  "empCode": "PART007",
  "name": "New Participant",
  "role": "Participant",
  "department": "HR",
  "password": "participant123"
}
```

**Test Auto-Release:**
1. `GET /api/schedules` → note enrolledCount for schedules containing PART003
2. `PUT /api/users/:part003Id` → body: `{ "status": "Dropped" }`
3. `GET /api/schedules` → enrolledCount should be decremented, PART003 removed

---

### 👥 Teams (Admin Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/teams` | List all teams (populated) |
| GET | `/api/teams/:id` | Get single team |
| POST | `/api/teams` | Create team |
| PUT | `/api/teams/:id` | Update team ⚡ |
| DELETE | `/api/teams/:id` | Delete team |

> ⚡ **Dynamic Team Sync Trigger:** When you PUT changes to the `members` array, the middleware automatically syncs all future schedules — removes old members and adds new ones (if capacity allows).

**Create Team Body:**
```json
{
  "name": "New Team",
  "leaderId": "paste_user_id_here",
  "members": ["user_id_1", "user_id_2", "user_id_3"]
}
```

**Test Team Sync:**
1. `GET /api/schedules` → note which users are enrolled
2. `PUT /api/teams/:teamId` → change the members array (remove one, add another)
3. `GET /api/schedules` → verify the enrolledUsers updated automatically

---

### 📚 Classes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/classes` | Any | List classes |
| GET | `/api/classes?status=Ongoing` | Any | Filter by status |
| GET | `/api/classes/:id` | Any | Get single class |
| POST | `/api/classes` | Admin | Create class |
| PUT | `/api/classes/:id` | Admin | Update class |
| DELETE | `/api/classes/:id` | Admin | Delete class |

---

### 📅 Schedules

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/schedules` | Any | List schedules |
| GET | `/api/schedules?classId=X&from=2026-04-20&to=2026-05-01` | Any | Filter |
| GET | `/api/schedules/:id` | Any | Get single schedule |
| POST | `/api/schedules` | Admin | Create schedule |
| PUT | `/api/schedules/:id` | Admin | Update schedule |
| DELETE | `/api/schedules/:id` | Admin | Delete schedule |
| POST | `/api/schedules/:id/book-team` | Admin | Enroll a team |
| POST | `/api/schedules/:id/cancel-team` | Admin | Cancel team booking |

**Book Team Body:**
```json
{ "teamId": "paste_team_id_here" }
```

The book-slot endpoint (`POST /api/schedules/book-slot`):
- Validates the time slot against allowed time slots (Admin settings)
- Finds all **Active** team members and auto-enrolls them
- Enforces max 2 sessions per team per week
- Prevents overlapping slots for the same class (collision check)
- Returns the populated schedule with enrolled users
- **Sends a booking confirmation email** to the requester (team leader or admin) if they have an email address on file — the email is fire-and-forget and will not roll back the booking if delivery fails

---

### ✅ Attendance

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/attendance/:scheduleId` | Teacher/Admin | Bulk mark attendance |
| GET | `/api/attendance/schedule/:scheduleId` | Teacher/Admin | Get by schedule |
| GET | `/api/attendance/user/:userId` | Any | Get user's history |

**Bulk Mark Body (the key feature):**
```json
{
  "records": [
    { "userId": "id1", "status": "P", "remark": "On time" },
    { "userId": "id2", "status": "A" },
    { "userId": "id3", "status": "L", "remark": "10 min late" },
    { "userId": "id4", "status": "EL", "remark": "Sick leave" }
  ]
}
```

Status values: `P` (Present), `A` (Absent), `L` (Late), `EL` (Excused Leave)

This uses MongoDB `bulkWrite` with upsert — you can call it repeatedly and it will update existing records rather than creating duplicates.

---

### 📊 Evaluations

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/evaluations` | Teacher/Admin | Create or update evaluation |
| GET | `/api/evaluations` | Any | List evaluations |
| GET | `/api/evaluations?classId=X&userId=Y` | Any | Filter |
| GET | `/api/evaluations/:id` | Any | Get single evaluation |
| DELETE | `/api/evaluations/:id` | Admin | Delete evaluation |

**Upsert Evaluation Body:**
```json
{
  "classId": "paste_class_id",
  "userId": "paste_user_id",
  "level": "B1",
  "grammarScore": 7.5,
  "vocabularyScore": 8,
  "pronunciationScore": 6.5,
  "fluencyScore": 7,
  "teacherComment": "Good progress"
}
```

The response includes a computed `averageScore` virtual field.

---

### 📊 Google Sheets Sync (Admin Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/status` | Check if Google Sheets integration is configured |
| POST | `/api/sync/google-sheets` | Pull registrations from Master Sheet |

**Sync Body:**
```json
{
  "spreadsheetId": "your-google-spreadsheet-id",
  "sheetName": "Sheet1",
  "range": "A2:D"
}
```

**Expected Sheet Format (columns A–D):**

| A: TeamName | B: ClassCode | C: Date | D: TimeSlot |
|-------------|-------------|---------|-------------|
| Sales Team Alpha | ENG-B1-2026 | 2026-04-21 | 09:00-10:30 |
| Marketing Team Beta | ENG-A2-2026 | 2026-04-25 | 09:00-10:30 |

**Setup Required:**
1. Create a Google Cloud project
2. Enable the Google Sheets API
3. Create a Service Account and download the JSON key
4. Configure credentials (pick one):
   - **Local dev:** Add to `.env`: `GOOGLE_SERVICE_ACCOUNT_KEY=./path-to-key.json`
   - **Render (production):** Set env var `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` to the full JSON key content (single line)
5. Share the Google Sheet with the service account email

---

## Error Responses

All errors follow the format:
```json
{
  "success": false,
  "message": "Error description"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error |
| 401 | Not authenticated / invalid token |
| 403 | Forbidden (wrong role or inactive account) |
| 404 | Resource not found |
| 500 | Server error |
