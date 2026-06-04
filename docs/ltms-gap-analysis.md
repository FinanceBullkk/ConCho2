# LTMS Direction — Gap Analysis & Priority Lock-in

> **Purpose:** lock in the "training system (LTMS)" direction with an honest gap
> analysis and a re-sequenced priority order. This is a *decision* doc — it
> records *what we are NOT* as much as what we are, and proposes one roadmap
> change (a missing milestone + a re-ordering).
>
> **Read with:** [`lms-roadmap.md`](lms-roadmap.md) (6-month waves) ·
> [`development-roadmap.md`](development-roadmap.md) (live tracker) ·
> [`system-overview.md`](system-overview.md) (current shape) ·
> [`audit/findings.md`](audit/findings.md) (PROD-001…010 enterprise gaps).
>
> **Status:** **accepted 2026-06-04** (owner sign-off on §5 order + §6 decisions) · **Date:** 2026-06-04

---

## 1. Decision confirmed — LTMS, not LMS

The pivot is **already canonical** across the strategy docs (this file just
makes the reasoning + sequencing explicit):

- `lms-roadmap.md` — retitled *Internal LTMS Roadmap*; SCORM/xAPI, video
  hosting, marketplace, multi-tenant, native mobile, gamification are **de-scoped
  in writing**. Benchmark = *spreadsheets + email + manual Excel*, **not**
  Cornerstone/Docebo/SuccessFactors.
- `system-overview.md` — *"training ops + compliance, not a commercial LMS clone
  or SCORM-first content platform"*.
- `development-roadmap.md` — title *Internal LTMS*; Wave D = production readiness,
  Google OIDC, Directory sync, manager hierarchy, notifications, compliance
  reports.

**Lone inconsistency:** `README.md` still frames the product as corporate
*English* training ("đào tạo tiếng Anh doanh nghiệp"). It should be re-aligned to
the LTMS framing (see §6).

---

## 2. Why the pivot is correct (positioning reframe)

The same product scores very differently depending on the benchmark. Choosing
the LTMS frame converts an unwinnable race into a finite, achievable one.

| Lens | As a commercial **LMS** | As an internal **LTMS** |
|---|---|---|
| Current coverage | ~10–15% of feature surface | ~**60–70%** of a usable internal training-ops product |
| Remaining gap | Infinite (content + integrations + skills + AI + marketplace) | **Finite, countable** (≈5–6 areas, §3) |
| Real competitor | Cornerstone/Docebo ($1M+/yr) — unwinnable | Excel/email + low-end ILT tools — competitive |
| Small-team viable? | No | **Yes** |
| Existing strengths reused | Few | Scheduling, attendance, audit, soft-delete, completion, certificates **= the LTMS core** |

The capabilities we *lack* for an LMS (content delivery, SCORM, skills taxonomy)
are **explicitly out of scope** — they were never the target. The capabilities
we *have* (training ops + compliance + audit) are exactly the LTMS core.

---

## 3. Gap analysis — what a training system still needs

Honest list of what is missing **for an LTMS** (not an LMS). Severity = impact on
an internal training/compliance system for ~1000 employees.

| # | Gap | Severity | Today | Tracked as |
|---|-----|----------|-------|-----------|
| G1 | **Org / manager hierarchy** — `department` is a free-text string; no `managerId`; no manager dashboard. Managers can't see their team's training status. | 🔴 Critical | absent | PROD-002 · Wave D3 |
| G2 | **Assignment with due dates** — only self-enroll / manual admin enroll. No "assign program X to Dept Y, due Z". This is the central compliance-training workflow. | 🔴 Critical | absent | **Wave D4** (added §4) |
| G3 | **Notification / reminder engine** — transactional email only; no reminders, overdue notices, or manager escalation. Compliance training that never nudges won't happen. | 🔴 Critical | absent | PROD-010 · Wave D5 |
| G4 | **Identity at scale** — no SSO/OIDC, no directory sync. 1000 users via manual create + Excel import is real operational burden. | 🟠 High | absent | Wave D2 |
| G5 | **Production reliability** — single Render free-tier instance that sleeps; cron needs an external pinger; in-memory rate-limit/cache (single-instance only). | 🟠 High | fragile | Wave D1 · accepted-risk list |
| G6 | **Compliance depth** — certificates never expire; no recertification cycle; no "overdue" status or due dates. Compliance = periodic recertification. | 🟠 High | basic | Wave D6 |
| G7 | **Scheduling model is English-class-specific** — fixed 5 slots, 1h, max 2/wk/team. Too rigid for generic training (no rooms, capacity, waitlists, session types, instructor mgmt). | 🟡 Medium | narrow | **Wave E** (committed §4) |

**Latent-value debt (in-scope but unwired):** learner-facing path progress — the
`GET /api/learning/paths/:id/progress` endpoint exists but has no learner UI
(Wave C1). Counts against "done means wired".

What is **genuinely solid** and should not be re-litigated: auth/MFA, two-layer
authz (`roleGuard` + `policy/` + capability map), CSRF, rate limits, audit log
(730-day), soft-delete/trash, the completion engine + certificates, assessment
v1 + question bank + manual grading, completion reports + rollups, the
modular-monolith `domains/` direction, 7 CI gates.

---

## 4. Missing milestone — Assignment + Due Dates (propose adding)

G2 is the biggest *unrecorded* gap. The roadmap models self-enroll and manual
enroll but **not directive assignment**, which is the core of mandatory/
compliance training. Milestone shape (accepted — canonical **Wave D4** in
`lms-roadmap.md` §4; extends existing domains, no new stack):

- **Backend:** an `Assignment` concept over the existing cohort-enrollment
  chokepoint (`server/domains/learning/enrollment/`) — assign a Program/Cohort
  (later a LearningPath) to a target set (a Department once G1 lands, or an
  explicit user list now) with a `dueDate`. Reuse `hasCompletedProgram` /
  `evaluateCompletion` for status; soft-delete + audit like every mutation.
- **Status surface:** completion reports gain `assigned / not-started / in-
  progress / complete / overdue` (depends on G6 for due-date semantics).
- **Capabilities:** `assignment.manage` (Admin/Teacher) / `assignment.read`.
- **Why now-ish:** unlocks the #1 HR workflow and gives notifications (G3) and
  manager dashboards (G1) something concrete to report on.

Depends on G1 (target = Department) for full value, but a v1 against an explicit
user/cohort list is shippable before G1.

---

## 5. Proposed priority order (re-sequence)

The current roadmap order is **C1 → D1 → D2 → D3 → D4**. Recommend a change:
production/identity are correctly foundational, but **manager hierarchy +
assignment/due-date + notifications deliver the clearest org ROI** and should
rank above the learner path-progress polish.

| Order | Current (`lms-roadmap.md`) | **Proposed** | Rationale for change |
|------:|-----------|----------|-----------|
| 1 | C1 — learner path progress | **D1 — production readiness** | 1000 people can't depend on a sleeping free-tier instance; foundational. |
| 2 | D1 — production readiness | **D2 — Google OIDC + Directory sync** | Removes manual user/dept burden; **provides the Department/manager data G1 needs**. |
| 3 | D2 — identity | **G1 — manager hierarchy + scoped dashboards** | The #1 missing LTMS capability; depends on D2's directory data. |
| 4 | D3 — manager + notifications | **G2 — assignment + due dates** (§4) | The central compliance workflow; depends on G1 for dept targeting. |
| 5 | D4 — compliance reporting | **G3 — notification/reminder/escalation** | Makes assignments actually get done; consumes G1+G2 data. |
| 6 | — | **C1 — learner path progress** | Real but lower-urgency "journey" polish; safe to follow. |
| 7 | — | **D4 — compliance reporting depth + recertification (G6)** | Builds on assignment/overdue/manager data already in place. |

Key reordering claims:
- **D2 before manager hierarchy** — Directory sync is the natural source of
  `managerId`/department, so do identity first, then build hierarchy on real data
  (avoids hand-maintaining org structure).
- **Assignment (G2) before notifications (G3)** — you can't remind people about
  assignments that don't exist yet.
- **C1 (path progress) demoted** — it's the one in-scope unwired loop, but it's
  learner-motivation polish; the manager/assignment/notification chain is what
  changes whether mandatory training happens.

### Accepted order (2026-06-04)

Owner chose **"close C1 first, then re-sequence."** Final committed order:

> **C1 → D1 → D2 → D3(G1 manager) → D4(G2 assignment) → D5(G3 notifications) →
> D6(compliance + recertification)**, with **Wave E (G7 generic scheduling)
> promoted to a committed parallel track** (large — own phase plan). These are the
> canonical wave numbers used in `lms-roadmap.md` §4.

C1 stays first (cheap, nearly done, satisfies "done means wired"); the
foundational + manager/assignment/notification chain follows; compliance depth
last. This order is now canonical in `lms-roadmap.md` §4.

---

## 6. Decisions (resolved 2026-06-04)

| # | Decision | Outcome |
|---|----------|---------|
| 1 | Re-sequence (§5) | ✅ **Close C1 first, then re-sequence** → `C1 → D1 → D2 → D3 → D4 → D5 → D6` (+ Wave E parallel). |
| 2 | Add Assignment + Due Dates (G2, §4) as a milestone | ✅ **Yes — first-class milestone, scheduled after G1** (dept-targeting needs the org hierarchy). |
| 3 | Re-align `README.md` to LTMS framing | ✅ **Yes — now** (keep Vietnamese; widen beyond English). |
| 4 | Scheduling model (G7) | ✅ **Full genericisation within 6 months** (rooms/capacity/waitlists/session types/instructor mgmt) — promoted from "deferred" to a committed track; large, needs its own phase plan. |

These are now applied to `lms-roadmap.md` (§1 in-scope, §4 waves, §5 gates) and
`development-roadmap.md` (LTMS waves table). `README.md` re-framed to Internal
LTMS.

Open inputs still needed from HR/IT (mirrors `lms-roadmap.md` §6): allowed Google
Workspace domain(s) for OIDC; whether manager data lives in Directory; the exact
monthly compliance reports HR needs; for G7 — does the org actually run sessions
needing rooms/capacity/waitlists, or is the genericisation pre-emptive?

---

## 7. Reaffirmed out-of-scope (do not drift)

SCORM/xAPI/AICC · video hosting/authoring · skills taxonomy/AI · marketplace ·
multi-tenant/billing/white-label · native mobile/offline · gamification/social.
Revisit only on an explicit, concrete business requirement (per
`lms-roadmap.md` §5 decision gates).
