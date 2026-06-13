# External Cron Pinger Setup

Render's free tier puts idle services to sleep, so the in-process
`node-cron` schedule that runs reconciliation at 02:00 UTC doesn't
fire reliably. This doc walks through using a free external pinger
(cron-job.org) to wake the service and trigger the same job.

## 1. Generate a `CRON_TOKEN`

Generate a 32-byte random string (any method works):

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 2. Add the token to Render env

Render dashboard → your service → **Environment** → add:

```
CRON_TOKEN=<the value from step 1>
```

The server enforces `CRON_TOKEN.length >= 16`. Anything shorter is
rejected and the cron endpoint returns 503 to avoid exposing itself.

Save → wait for redeploy.

## 3. Verify the endpoint manually

```sh
curl -X POST https://<your-app>.onrender.com/api/cron/reconcile \
  -H "Authorization: Bearer $CRON_TOKEN"
```

Expected: `200 OK` with a `ReconcileReport` payload (`status`, `summary`,
`issues`, etc). If you get `401` the token is wrong; `503` means the
server-side `CRON_TOKEN` is missing.

## 4. Schedule on cron-job.org

1. Sign up at https://cron-job.org (free, no credit card).
2. Create a new cron job:
   - **URL:** `https://<your-app>.onrender.com/api/cron/reconcile`
   - **Schedule:** Daily, `02:00 UTC` (matches the in-process schedule).
   - **Method:** `POST`
   - **Headers:** add `Authorization: Bearer <CRON_TOKEN>`
   - **Notifications:** turn on "Notify on failure" — you want to know
     if reconciliation starts erroring silently.
3. Save → "Test run" to confirm it gets `200 OK`.

## 5. Reminder jobs — REQUIRED, external-only (DOCS-005, audit round 8)

Attendance and assignment reminders have **no in-process fallback at all**
(`server/jobs/` only schedules reconcile) — if these two pings are not set
up, reminder emails silently never go out in production. Create both as
additional cron-job.org jobs, same `POST` + `Authorization: Bearer
<CRON_TOKEN>` header as step 4:

| URL | Schedule | What it does |
|---|---|---|
| `https://<your-app>.onrender.com/api/cron/attendance-reminders` | Hourly (`0 * * * *`) | "Your class starts soon" emails to enrolled learners (claim via `remindersSentAt`, max one per session) |
| `https://<your-app>.onrender.com/api/cron/assignment-reminders` | Daily `01:00 UTC` (`0 1 * * *`) | Due-date reminder cadence for assignments |
| `https://<your-app>.onrender.com/api/cron/certificate-expiry-reminders` | Daily `01:30 UTC` (`30 1 * * *`) | Recertification heads-up: emails + bell when an Issued certificate is within 30 / 7 days of `validUntil` (idempotent per cert per bucket) |

Turn on "Notify on failure" for all three.

## 6. (Optional) Keep-warm pinger

If you want Render's free tier to stay awake during business hours
instead of sleeping after 15 min of idle:

- **URL:** `https://<your-app>.onrender.com/api/cron/health`
- **Schedule:** Every 10 minutes, weekdays 07:00–19:00 ICT
- **Method:** `GET`
- **Header:** `Authorization: Bearer <CRON_TOKEN>`

Costs you nothing and avoids the cold-start delay for end users.

## How auth works

`server/middleware/cronAuth.js` accepts the token via any of:

- `Authorization: Bearer <token>`  (preferred)
- `X-Cron-Token: <token>`
- `?token=<token>`  (last resort — leaks in access logs and shouldn't be
  used unless the pinger can't set headers)

Comparison is constant-time. Failed attempts are logged at `warn` level
with IP + user-agent so you can spot scanning.

## Rotating the token

1. Generate a new token (step 1 again).
2. Update `CRON_TOKEN` in Render env → redeploy.
3. Update the header value in cron-job.org.

The window between (2) and (3) will fail with 401, so do it during a
quiet period or update the pinger first if your scheduler supports
temporary disable.
