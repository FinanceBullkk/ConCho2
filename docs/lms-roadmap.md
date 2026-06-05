# Internal LTMS Roadmap — TMS v2 for 1000 internal employees

> **Read first:** [`system-overview.md`](system-overview.md) for current shape,
> then [`development-roadmap.md`](development-roadmap.md) for live status.
> Filename stays `lms-roadmap.md` for link compatibility, but the product target
> is **Internal LTMS**, not a broad commercial LMS.

---

## 1. Vision and product boundary

Build an **Internal Learning/Training Management System (LTMS)** for our own
organization, around 1000 employees. The product wins by making HR/L&D training
operations reliable and auditable: schedule, attendance, assessment, completion,
certificate, audit, and reports.

Benchmark against the real replacement: spreadsheets, email, manual attendance,
manual completion tracking, and monthly Excel compilation. Do **not** benchmark
against Cornerstone, Docebo, SAP SuccessFactors, or other million-dollar LMS
suites. Those products include procurement, support, SLA, SCORM/content
ecosystems, marketplace, and integrations far outside the current target.

**In scope for the next 6 months:**

1. Ops + compliance core: reliable scheduling, attendance, assessment,
   completion, certificates, audit, and HR/L&D reports.
2. Production readiness: paid always-on hosting, reliable cron, Sentry monitors,
   and Redis/managed store if multiple instances are introduced.
3. Google Workspace identity: OIDC login and Google Directory sync for users,
   departments, and managers.
4. Close existing learner loops: learner path progress before starting more
   broad LMS features.
5. Manager/org visibility: manager hierarchy, team completion, overdue status,
   and compliance reporting.
6. Notification/escalation engine: reminders, overdue notices, manager
   escalation, and auditable send logs.
7. Mandatory assignment: assign a program/cohort/path to a department or user
   list with a due date; status = assigned / not-started / in-progress /
   complete / overdue. (The central compliance-training workflow.)
8. Generic scheduling: generalize the booking model beyond the fixed English
   slot rules — rooms, capacity, waitlists, session types, and instructor
   management. (Promoted from deferred 2026-06-04 — see
   [`ltms-gap-analysis.md`](ltms-gap-analysis.md) §6.)

**Deferred unless explicitly requested:**

- SCORM/xAPI/AICC courseware
- video hosting or authoring
- commercial LMS breadth
- multi-tenant, billing, white-label, marketplace
- native mobile/offline
- gamification/social learning

---

## 2. Agent Reference Contract

Agents working in this repo must follow this contract:

- No feature factory. Finish one milestone, then review wiring, UX flow,
  permissions, data consistency, tests, and bugs before the next milestone.
- Prefer closing incomplete loops over starting new capability. Latent value is
  debt if users cannot click it or reports cannot consume it.
- Preserve load-bearing controls: auth, CSRF, rate limits, capability/role
  authorization, audit log, soft delete, validation, and i18n.
- New work should extend `server/domains/<domain>/` when a domain exists. Do not
  add fresh business logic to legacy controllers unless it is a deliberate
  adapter step.
- Legacy physical collection names can stay when ADRs say so. Layer LTMS
  vocabulary through DTOs and domain boundaries.

**Done means wired checklist:**

| Gate | Required check |
|---|---|
| Backend | Route/use-case works with real authz/capability rules |
| Frontend | User-facing value has a reachable UI entrypoint |
| Data | Mutations audit; soft-delete applies where appropriate |
| Cross-feature | Reports/completion/certificates/notifications consume new data when relevant |
| i18n | User-facing strings added to `en.json` (English-only; single `en` locale, no `vi.json`) |
| Tests | Happy path, permission denial, and one core edge case covered |
| Review | Broken routes/buttons, stale docs, and latent-value gaps checked |

---

## 3. Current status snapshot

Wave A is complete: scheduling modes, cohort-based enrollment, Learning CRUD,
and capability authz are live. Wave B has strong foundations: completion policy,
feedback, certificates, public verification, assessment v1, question bank,
manual grading, completion reports, and rollups are live. Wave C core is done:
learner catalog, self-enroll, prerequisite gating, sequenced paths, admin paths
UI, and learner path progress are live. Wave D has codeable traction: cron
self-monitoring, org model/manager dashboard, and assignment + due dates v1 are
live.

The biggest remaining platform gaps for 1000 internal employees are Google OIDC,
Directory sync, reminders/escalation, compliance reporting depth, recertification,
and generic scheduling.

See [`development-roadmap.md`](development-roadmap.md) for exact progress and
recent changelog.

---

## 4. Six-month roadmap

**Committed order (locked 2026-06-04 — see [`ltms-gap-analysis.md`](ltms-gap-analysis.md)):**
`C1 → D1 → D2 → D3 → D4 → D5 → D6`, with **Wave E (generic scheduling) as a
committed parallel track**.

### Wave C1 — Close current learning loops *(first — cheap, satisfies "done means wired")*

- Ship learner path-progress view so paths are visible and useful to learners.
- Review `/me/*` routes as one learner journey: catalog → enroll → assess →
  feedback → completion/certificate → path progress.
- Fix bugs and wiring gaps found during that review before adding new features.

### Wave D1 — Production readiness for 1000 employees

- Move away from Render free-tier production assumptions: paid always-on service
  or equivalent.
- Replace pinger-dependent cron with reliable scheduled jobs plus monitor.
- Add Sentry alerts/cron monitors for reconcile, reminders, completion/cert
  jobs, and unexpected 5xx spikes.
- Introduce Redis/managed shared store only when multiple instances or durable
  job locks need it. YAGNI before that.

### Wave D2 — Google Workspace identity and people sync

- Add Google Workspace OIDC login alongside existing password/MFA fallback.
- Restrict login to approved Workspace domain and active internal users.
- Add Google Directory sync for name, email, department, status, and manager
  mapping when available.
- Keep Excel import as fallback/manual override, not the long-term source of
  truth.

### Wave D3 — Manager hierarchy and visibility *(G1 — #1 missing LTMS capability)*

- Introduce a real org model: `managerId` + a `Department` entity (replace the
  free-text `department` string), fed by D2's Directory sync where available.
- Add scoped manager dashboards: team completion, overdue learners, certificate
  status, and upcoming obligations — visible only down the manager's reports.
- Reuse the completion engine; respect the two-layer authz (capability +
  resource policy) so a manager sees only their own org subtree.

### Wave D4 — Mandatory assignment and due dates *(G2 — central compliance workflow)*

- **v1 live 2026-06-05:** `Assignment` assigns a Program or Learning Path to
  explicit users and/or Departments with a `dueDate`.
- Status per learner: not-started / in-progress / complete / overdue — derived
  from existing completion/certificate and cohort-enrollment signals (DRY).
- Capabilities `assignment.manage` / `assignment.read`; soft-delete + audit.
- Learning workspace has an Assignments tab with Admin create/archive and
  Admin/Teacher read.
- Remaining later: cohort-specific assignment, reminders/escalation, report
  exports, certificate expiry/recertification.

### Wave D5 — Notification / escalation engine *(G3)*

- Notification engine v1: session reminders, assessment due/overdue, certificate
  issued, and manager escalation for overdue assignments (consumes D4).
- Persist notification/job logs for audit and troubleshooting; keep sends
  fail-soft like Google Calendar.

### Wave D6 — Compliance reporting depth + recertification

- Expand completion/assignment reports by department, manager, program, cohort,
  overdue, completed, and certified.
- Add certificate **expiry + recertification cycles** (G6): certificates carry a
  validity window; expiring/expired status feeds reports and D5 reminders.
- Keep exports reliable for 1000 employees; avoid memory-heavy report paths. Add
  saved filters/presets only if HR repeats the same report monthly.

### Wave E — Generic scheduling *(G7 — committed parallel track; large, own plan)*

- Generalize the booking model beyond the fixed English slot rules (1h, 5 fixed
  slots, max 2/wk/team): configurable session types, rooms, capacity, waitlists,
  and instructor assignment.
- **Scope warning:** this is large and touches the load-bearing `Schedule`
  booking path (unique `{classId,startTime}` guard, team auto-enroll, Google
  Calendar). It needs its own phase plan and must preserve the existing
  leader-booking flow as one configurable mode. Sequence it so it does not stall
  the D-series; treat as parallel, not blocking.

---

## 5. Decision gates

| Decision | Default | Gate |
|---|---|---|
| Product label | Internal LTMS | Change only if business asks for commercial LMS scope |
| Google identity | OIDC + Directory sync | Confirm exact Workspace domain/config during implementation |
| Infrastructure | Paid minimal / always-on | Upgrade further only if load/ops data demands it |
| Redis/shared store | Defer | Add when multi-instance, durable job locks, or rate-limit consistency require it |
| PostgreSQL | Defer | Revisit when path/reporting queries become painful on MongoDB |
| SCORM/content layer | Defer | Revisit only with a concrete self-paced content requirement |
| Generic scheduling | **Committed (Wave E)** | Promoted from deferred 2026-06-04; large — own phase plan, keep leader-booking as one mode |
| Mandatory assignment + due dates | **Committed (Wave D4)** | Central compliance workflow; dept-targeting depends on Wave D3 org model |

---

## 6. Open questions

- What Google Workspace domain(s) are allowed for OIDC login?
- Is manager data available in Google Directory, or must HR maintain it another
  way?
- What compliance reports does HR need monthly: by department, manager, program,
  certification, overdue, or all of these?
- Generic scheduling (Wave E): does the org actually run sessions needing rooms,
  capacity, waitlists, or multiple instructors — or is the genericisation
  pre-emptive? Confirm the concrete need before drafting the phase plan.
