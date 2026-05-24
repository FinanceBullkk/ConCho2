# Runbook — 5xx spike

**Trigger:** Sentry rule "5xx rate >1% over 5 min" fires, OR Render shows a sudden burst of 500/502/503 in the request log.

**SLO:** acknowledge ≤ 5 min, resolve / rollback ≤ 30 min.

---

## 1. First two minutes

- [ ] Open Sentry → group by issue title to identify the top error.
- [ ] Open Render → check the deploy history: was a new build just promoted? If yes, candidate for rollback.
- [ ] Open Atlas → cluster health panel. Connection saturation? CPU? Storage 100%?
- [ ] Hit `https://<tms-host>/ready` from a fresh window. 200 = Mongo healthy. 503 = Mongo unreachable → jump to runbook **cron-failure → Mongo down** section.

## 2. Triage by symptom

### A. Errors come from a single endpoint
Most likely a regression in the latest deploy.
- [ ] Compare the failing endpoint with the latest merged PRs.
- [ ] If the regression is obvious, decide: rollback or hotfix?
  - **Rollback** (default if uncertain): Render → Deploys → previous green build → "Roll Back".
  - **Hotfix**: open PR off `main`, get one reviewer, merge, monitor for 10 min.

### B. Errors are spread across all endpoints
Likely an infra issue (Mongo, env var, JWT_SECRET rotation, OOM).
- [ ] If `/ready` returns 503 → Mongo. Check Atlas → recent ops, replica-set health.
- [ ] Check Render service logs for `JWT_SECRET is not set` or `MONGO_URI` errors → env var was wiped.
- [ ] Check Render memory chart — if peak hit 512 MB, it's the export-OOM scenario (PERF-001). Block export usage temporarily by adding a per-IP rate limit override.

### C. Errors mention `protobufjs` / Google API
Calendar / Sheets dependency issue.
- [ ] Disable Calendar by clearing `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` in Render env (the service auto-fail-softs).
- [ ] Re-deploy. Errors should stop within 1 minute (Render rolling restart).

## 3. After the bleed stops

- [ ] Post a brief Slack update: trigger, scope, root cause, action taken.
- [ ] Open a follow-up PR or ticket against the root cause; do not leave the workaround in place.
- [ ] Capture the alert payload + Sentry issue link in the incident log.

---

## Related docs

- `docs/backup-dr.md` — DB restore procedure if drift requires reverting state.
- `docs/cron-pinger-setup.md` — external cron pinger; rules out cron-related noise.
- `docs/runbook-cron-failure.md` — when cron jobs themselves stop firing.
- `docs/audit/findings.md` § OPS-* — known reliability gaps + planned fixes.
