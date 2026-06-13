# Certificate Expiry Reminders (recertification signal)

> Slice B of the "push migration phase 3/4/5 → done" goal. Closes the
> `lms-roadmap` D6 "remaining later" item: **certificate expiry reminder emails**.
> Status: in progress (2026-06-13).

## Why
Compliance certificates carry `validUntil` and the compliance report already
shows an *expired* state, but nothing **warns** a learner before a certificate
lapses. For an internal LTMS this is the core recertification trigger. Reuses the
existing assignment-reminder infrastructure (cron monitor + `NotificationLog`
idempotency + email templates + in-app bell) — no new machinery.

## Behaviour
- A cron-driven scan finds **Issued, non-deleted** certificates whose `validUntil`
  is within the next **30 days** (and not past).
- Two once-per-cert cadence buckets, idempotent via `cadenceKey`:
  - `expiry_30` — 8–30 days out (heads-up)
  - `expiry_7`  — 0–7 days out (imminent)
- Each fires one `certificate_expiring` `NotificationLog` (channel `email`) that
  **doubles as the in-app bell item** (same as assignment reminders): email sent
  when the learner has one; `skipped` (no email) rows still surface in the bell.
- Link → `/me/transcript`. No auto-recert assignment yet (v1 = signal only).

## Files
**Backend**
- `models/NotificationLog.js` — add `certificate_expiring` to the type enum.
- `lib/emailTemplates.js` — `tplCertificateExpiring` + `sendCertificateExpiring`.
- `domains/learning/completion/expiry-reminder-service.js` (new) —
  `sendCertificateExpiryReminders({ now })`: scan → bucket → createLog(pending) →
  send → finishLog; idempotent; fail-soft.
- `lib/cronMonitor.js` — `CRON_JOBS.certificateExpiry` (daily, slug
  `certificate-expiry-reminders`).
- `routes/cronRoutes.js` — `POST /api/cron/certificate-expiry-reminders`.
- `domains/notification/dto.js` — presenter for `certificate_expiring`.

**Docs**
- `docs/cron-pinger-setup.md` — add the daily ping.
- Specs: `completion-and-certificates` (new requirement + scenarios),
  `assignments-and-reminders` (in-app feed: `certificate_expiring` type).
- `docs/development-roadmap.md` + `lms-roadmap.md` (D6 item) — changelog + bump.

## Tests (`server/tests/integration/`)
- expiring-in-5-days cert → one `expiry_7` email + log; bell shows it.
- second run same day → duplicate (no resend) — idempotent.
- expiring-in-20-days → `expiry_30` bucket.
- Revoked / soft-deleted / no-`validUntil` / already-expired → no-op.
- learner without email → row `skipped`, still bell-visible.

## Out of scope (deferred)
- Automatic recertification-assignment creation (needs HR policy) — v2.
- Manager digest of expiring certs — fold into the existing manager digest later.
