# Runbook — Cron job failure

**Trigger:**
- No `ReconcileReport` document in MongoDB for the last 25 hours, OR
- Sentry cron monitor for `runReconciliation` missed-check, OR
- Manual probe `POST /api/cron/health` returns non-200.

**SLO:** acknowledge ≤ 30 min, resolve ≤ 24 h (nightly cadence — drift accumulates slowly).

---

## 1. Quick diagnosis

| Check | How |
|---|---|
| External pinger up? | Log into cron-job.org, verify the job hits `https://<tms-host>/api/cron/reconcile` on schedule. |
| `CRON_TOKEN` correct? | Compare the bearer in cron-job.org's Authorization header to Render env. A typo silently 401s. |
| Server awake? | Hit `https://<tms-host>/health`. If 404 or timeout, the Render free instance is asleep — pinger should wake it. |
| Mongo up? | `https://<tms-host>/ready` should be 200. If 503, fix Mongo first (see §3). |
| Code path? | Tail Render logs for the period the cron should have fired. Look for `'Reconciliation cron fired'` or `'Reconciliation cron job failed'`. |

## 2. Force a manual run

```bash
curl -X POST -H "Authorization: Bearer $CRON_TOKEN" \
  https://<tms-host>/api/cron/reconcile
```

Expected: 200 with the report summary in JSON. If 401, the token doesn't match Render env. If 503, `CRON_TOKEN` is unset or shorter than 16 chars (`middleware/cronAuth.js:31-37`).

## 3. Mongo is down

This is the most common root cause of cron failure since the cron job reads + writes Mongo.

- [ ] Atlas dashboard → cluster status. Common causes: out of free-tier connection cap, replica-set election in progress, billing block.
- [ ] If billing — fix payment, then probe `/ready` until 200.
- [ ] If connection cap — temporarily lower `maxPoolSize` env override (current default 100; see audit PERF-009).

## 4. Cron token rotation

If a token leak is suspected:

```bash
# 1. Generate new token
NEW=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
echo "$NEW"

# 2. Update Render env CRON_TOKEN = $NEW
# 3. Update cron-job.org Authorization header = "Bearer $NEW"
# 4. Verify by triggering a manual run (§2)
```

Old token: now invalid; any pre-rotation pinger requests fail with 401. Pinger should self-recover on the next tick.

## 5. After the cron is healthy again

- [ ] Run the reconcile once manually and confirm the report drift count is sane (`summary.total < 50`). If higher, investigate per-rule findings.
- [ ] Post a brief update to ops Slack with: how long the cron was down, what was missed, whether drift accumulated.
- [ ] If the root cause was missing alerting, file a ticket against OPS-002 (Sentry cron monitor wiring).

---

## Related docs

- `docs/cron-pinger-setup.md` — how cron-job.org is wired.
- `docs/runbook-5xx-spike.md` — when general request errors spike.
- `server/jobs/reconcileJob.js` — in-process scheduler (best-effort; only fires when service is awake).
- `docs/audit/findings.md` § OPS-002 — Sentry cron monitor still TODO.
