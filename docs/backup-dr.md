# Backup & Disaster Recovery Runbook

**System:** Training Management System (TMS)  
**Database:** MongoDB Atlas M0 (free tier)  
**Hosting:** Render (API server), GitHub (source code)  
**Last reviewed:** 2026-06-11 (audit phase 05 — OPS-009)

---

## 1. Overview

This runbook covers the backup strategy and disaster recovery procedures for the TMS application.

### What is backed up automatically

| Asset | Backup mechanism | Retention |
|---|---|---|
| MongoDB data | Atlas daily snapshots | 2 days (M0 limit) |
| Application source code | GitHub repository | Full history |

### What is NOT backed up automatically

| Asset | Risk | Mitigation |
|---|---|---|
| Environment variables (Render) | Lost if Render project is deleted or recreated | Screenshot / export manually — see Section 4 |
| Render service configuration (build command, start command, region) | Lost if service is deleted | Document manually — see Section 4 |
| Atlas connection string | Changes if cluster is replaced | Stored in Render env vars; re-enter after restore |

---

## 2. RTO / RPO Targets

| Metric | Target | Rationale |
|---|---|---|
| **RPO** (Recovery Point Objective) | **24 hours** | Atlas M0 provides daily snapshots; up to 24 h of data may be lost in a worst-case restore |
| **RTO** (Recovery Time Objective) | **4 hours** | Time to restore Atlas snapshot, update env vars, redeploy, and verify |

These targets are appropriate for an internal training management system with non-critical uptime requirements.

---

## 3. What Atlas Backs Up

### Atlas M0 automatic snapshots

- Atlas M0 clusters receive **daily snapshots** taken automatically.
- Retention is **2 days** (the two most recent daily snapshots are kept).
- Snapshots are managed by Atlas and cannot be triggered manually on M0.

### Accessing snapshots in the Atlas UI

1. Log in at [https://cloud.mongodb.com](https://cloud.mongodb.com).
2. Navigate to your **Project** → **Clusters**.
3. Click the cluster name → **Backup** tab (left sidebar).
4. The **Snapshots** list shows available restore points with timestamps.

> **Note:** On M0, Atlas provides basic backup. Point-in-time recovery (PITR) is not available. The restore granularity is one snapshot per day.

---

## 4. Non-Database Assets

### 4.1 Environment variables (Render)

Render does not export env vars via API on free/starter plans. Protect them manually:

1. Log in to [https://dashboard.render.com](https://dashboard.render.com).
2. Open the TMS API service → **Environment** tab.
3. **Screenshot** all key-value pairs (mask sensitive values when sharing).
4. Store the screenshot in a secure location (e.g., encrypted password manager, Google Drive with restricted access).

Critical env vars to document:

| Variable | Description |
|---|---|
| `MONGO_URI` | Atlas connection string (used by main server) |
| `JWT_SECRET` | JWT signing secret |
| `REFRESH_SECRET` | Refresh token secret |
| `MFA_ENCRYPTION_KEY` | TOTP encryption key |
| `CRON_TOKEN` | Cron endpoint auth token — must be ≥ 16 characters |
| `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` | Service account credentials as a JSON string — **use this in Render** |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Path to service account JSON file — local dev only; leave unset in Render |
| `GOOGLE_CALENDAR_IMPERSONATE` | Email of the Google Workspace user the service account impersonates as calendar organiser |
| `TMS_TIMEZONE` | IANA timezone for calendar events (optional; defaults to `Asia/Ho_Chi_Minh`) |
| `SENTRY_DSN` | Sentry error reporting DSN |
| `CORS_ORIGINS` | Comma-separated allowed CORS origins (e.g. `https://tms-v2.onrender.com`) |
| `CLIENT_ORIGIN` | Base URL used in password-reset email links (e.g. `https://tms-v2.onrender.com`) |
| `NODE_ENV` | `production` |
| `SMTP_HOST` | SMTP server hostname (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port — `587` (STARTTLS) or `465` (SSL) |
| `SMTP_USER` | SMTP username / sender address |
| `SMTP_PASS` | SMTP password or app password |
| `EMAIL_FROM` | Sender display address (optional, defaults to `SMTP_USER`) |

### 4.2 Source code (GitHub)

- Repository: [https://github.com/FinanceBullkk/ConCho2](https://github.com/FinanceBullkk/ConCho2) (update URL if different)
- All application code, migrations, and scripts are version-controlled.
- No additional action needed — GitHub is the source of truth for code.

### 4.3 Render service configuration

Document these values in a secure note in case the service must be recreated:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Start command | `npm start` |
| Region | (note your current region, e.g., Singapore) |
| Node version | (check Render → Environment → Node version) |

---

## 5. Restore Procedure

Use this procedure when data loss is confirmed or when restoring to a new cluster is required.

### Prerequisites

- Access to MongoDB Atlas (project Owner or Cluster Admin role)
- Access to Render dashboard (Owner role)
- The TMS GitHub repository

### Steps

#### Step 1 — Assess the situation

- Confirm whether the issue is data corruption, accidental deletion, or cluster failure.
- Identify the last known-good snapshot date from Atlas (see Section 3).

#### Step 2 — Initiate Atlas restore

1. Log in to [https://cloud.mongodb.com](https://cloud.mongodb.com).
2. Navigate to **Project** → **Clusters** → click cluster name → **Backup** tab.
3. In the **Snapshots** list, identify the target snapshot by date/time.
4. Click **Restore** next to the chosen snapshot.
5. Choose restore target:
   - **Restore to same cluster** — overwrites existing data. Use when the cluster itself is healthy but data needs rolling back.
   - **Restore to new cluster** — creates a fresh cluster from the snapshot. Use when the original cluster is corrupted or deleted.
6. Confirm the restore. Atlas will show progress; M0 restores typically complete in 10–30 minutes.

#### Step 3 — Update MONGO_URI (new cluster only)

If you restored to a **new cluster**:

1. In Atlas, go to **Clusters** → **Connect** → **Connect your application**.
2. Copy the new connection string (replace `<password>` with the actual DB user password).
3. In Render dashboard → TMS service → **Environment** tab:
   - Update `MONGO_URI` with the new connection string.
   - Click **Save Changes** (Render will auto-redeploy).

If you restored to the **same cluster**, the connection string does not change — skip this step.

#### Step 4 — Verify application health

1. Wait for Render to finish deploying (check **Deploys** tab).
2. Run the health check:
   ```
   GET https://<your-render-url>/ready
   ```
   Expected `200 OK` body:
   ```json
   { "status": "ready", "db": "connected", "dbName": "<db>", "uptime": <n>, "timestamp": "..." }
   ```
   A `503` with `{ "status": "not_ready", "reason": "mongo_disconnected" }` means MongoDB has not yet reconnected — wait and retry before proceeding.
3. Run the backup verification script to confirm data integrity:
   ```bash
   MONGO_URI="<atlas-connection-string>" node server/scripts/verify-backup.js
   ```
4. Log in to the TMS UI and perform a quick smoke test:
   - Can you log in?
   - Are classes and schedules visible?
   - Can you view attendance records?

#### Step 5 — Post-restore actions

- Document the incident: what happened, which snapshot was used, time to restore.
- Notify affected users if data from the last 24 h was lost.
- Update the incident log in this runbook (append to Section 8 below).

---

## 6. Backup Verification Drills

### 6.1 Monthly backup health check

Run this checklist on the **first Monday of each month**.

- [ ] **Run verify-backup script**
  ```bash
  MONGO_URI="<atlas-connection-string>" node server/scripts/verify-backup.js
  ```
  Confirm exit code 0 and review collection document counts for anomalies.

- [ ] **Check Atlas backup status**
  - Log in to Atlas → Clusters → Backup tab.
  - Confirm at least one snapshot is listed within the last 24 hours.
  - Note the snapshot timestamp in the drill log below.

- [ ] **Confirm env vars are documented**
  - Verify that all variables in Section 4.1 are captured in the secure note / screenshot.
  - Update the screenshot if any variables have changed since the last drill.

- [ ] **Verify Render service config is documented**
  - Check that Section 4.3 values match current Render settings.

- [ ] **Test health endpoint**
  ```
  GET https://<your-render-url>/ready
  ```
  Confirm `200 OK` with `{ "status": "ready", "db": "connected" }`.

### Monthly drill log

| Date | Run by | Snapshot timestamp confirmed | verify-backup result | Notes |
|---|---|---|---|---|
| 2026-06-11 | audit phase 05 (OPS-009) | not checked — Atlas UI is owner-side | 9/10 vs dev cluster `tms2` (`attendances` empty — young dev DB, check working as designed) | First-ever run. Script env path fixed (was repo-root `.env`, now `server/.env`; `VERIFY_BACKUP_ENV_PATH` override added for staging drills). Prod-URI run + Atlas snapshot check still owed by owner. If your network DNS refuses SRV lookups (`querySrv ECONNREFUSED`), run via `node -e "require('dns').setServers(['8.8.8.8']); require('./server/scripts/verify-backup.js')"` |

---

### 6.2 Quarterly dry-run restore on staging

Run this checklist **once per quarter** to verify the full restore path end-to-end before you need it in an incident. This drill targets a **staging** environment so production is never touched.

#### Prerequisites

- A staging Atlas cluster (separate free M0 is sufficient; cluster name e.g. `tms-staging`)
- A staging Render service (`tms-v2-staging` or similar) with the same env vars as production **except**:
  - `MONGO_URI` → staging Atlas connection string
  - `NODE_ENV` → `staging` (or `production` — either works for functionality testing)
  - `CRON_TOKEN` → a different value from production

#### Steps

- [ ] **Restore production snapshot to staging cluster**
  - In Atlas, go to your production cluster → **Backup** tab.
  - Click **Restore** → choose **Restore to different cluster** → select the staging cluster.
  - Wait for restore to complete (typically 10–30 min on M0).

- [ ] **Redeploy staging Render service**
  - In Render, trigger a manual deploy on the staging service (same git commit as production).
  - Wait for deploy to succeed.

- [ ] **Health check on staging**
  ```
  GET https://<staging-render-url>/ready
  ```
  Confirm `200 OK` with `{ "status": "ready", "db": "connected" }`.

- [ ] **Run verify-backup script against staging**
  ```bash
  MONGO_URI="<staging-atlas-connection-string>" node server/scripts/verify-backup.js
  ```
  Confirm exit code 0 and that collection document counts match expectations.

- [ ] **Smoke test staging UI**
  - Log in with a known user account.
  - Confirm classes and schedules are visible.
  - Confirm attendance records are accessible.

- [ ] **Record result in drill log below**

#### Pass criteria

| Check | Pass condition |
|---|---|
| `/ready` response | `200` with `{ "status": "ready", "db": "connected" }` |
| verify-backup.js | Exit code `0`, no `FAIL` lines |
| UI smoke test | Login, classes, schedules, and attendance all load |

#### Quarterly drill log

| Date | Run by | Staging cluster | Snapshot used | verify-backup result | Smoke test | Notes |
|---|---|---|---|---|---|---|
| <!-- fill in --> | <!-- fill in --> | <!-- fill in --> | <!-- fill in --> | <!-- fill in --> | pass/fail | |

---

## 7. Incident Playbook

### P1 — Data loss or complete outage

**Definition:** Database is inaccessible, data has been corrupted or deleted, or the application returns 5xx errors for all requests.

**RTO target: 4 hours**

**Steps:**

1. Confirm the outage via health endpoint (`GET /ready`) and Atlas cluster status page.
2. Check Atlas cluster status — if cluster is down, wait for Atlas auto-recovery or escalate to Atlas support.
3. If data loss is confirmed, begin restore procedure (Section 5) immediately.
4. Notify team lead / system owner within 30 minutes of detection.
5. Post status updates every 30 minutes until resolved.
6. After restore, run `MONGO_URI="<connection-string>" node server/scripts/verify-backup.js` and complete smoke test.
7. Write post-mortem within 48 hours.

**Contacts:** See Section 8.

---

### P2 — Partial degradation

**Definition:** Some features are unavailable (e.g., schedule creation fails, attendance submission errors), but login and read operations work.

**Steps:**

1. Check Render deploy logs for recent errors.
2. Check Sentry (if configured) for error spikes.
3. Check MongoDB Atlas metrics — connection count, CPU, disk IOPS.
4. If a recent deployment caused the issue, roll back via Render: **Deploys** → select previous deploy → **Rollback**.
5. If database-related, check for schema issues or missing indexes.
6. If unresolved within 1 hour, escalate to P1.

---

### P3 — Slow performance

**Definition:** Application is functional but noticeably slow (page loads >3s, API responses >2s consistently).

**Steps:**

1. Check Render metrics (CPU, memory) — free tier has limited resources.
2. Check Atlas metrics for slow queries.
3. Review recent code changes for missing `await`, N+1 queries, or missing indexes.
4. Check Render logs for `MongooseError: buffering timed out` or similar.
5. If Atlas M0 connection pool is exhausted, consider reducing `maxPoolSize` in Mongoose config.
6. Document findings; address in next sprint if non-critical.

---

## 8. Contacts & Escalation

| Role | Name | Contact | Notes |
|---|---|---|---|
| System Owner / Admin | <!-- name --> | <!-- email / phone --> | Primary decision-maker for P1 incidents |
| Developer on call | <!-- name --> | <!-- email / phone --> | Handles technical restore steps |
| MongoDB Atlas support | Atlas support portal | [https://support.mongodb.com](https://support.mongodb.com) | For cluster-level issues (M0 = community support only) |
| Render support | Render support portal | [https://render.com/support](https://render.com/support) | For hosting/deployment issues |

---

## 9. Incident Log

| Date | Severity | Description | Resolution | Downtime |
|---|---|---|---|---|
| <!-- fill in --> | <!-- P1/P2/P3 --> | <!-- what happened --> | <!-- how resolved --> | <!-- duration --> |
