# Cohesion Wave — weave existing features into one product

> **Goal:** zero new capabilities. Connect what already exists so the learner
> experiences ONE product, not 5 feature pages — and carve the legacy
> English-class (team-booking) business into its own clearly-bounded area so
> the platform core reads as a generic L&D system.
> Status: `planned` · Owner: anhha · Created: 2026-06-12
> Honors the golden rule: "No feature factory — close loops before new capability."

## Why

Industry-LMS comparison (2026-06-12 session): operations, compliance,
security are at/above par; the gap is **horizontal cohesion** — features
shipped as vertical wave slices, the cross-feature weave is missing. All 6
phases below are UI/composition over EXISTING tested APIs; near-zero new
backend surface.

## Phases (recommended order)

| # | Phase | What it connects | Est. | Status |
|---|-------|------------------|------|--------|
| 1 | Learner Program Home | per-enrollment hub: sessions + completion checklist + quiz/feedback links + cert state | 4–6 d | 🟢 done 2026-06-13 — `/me/programs` list + `/me/programs/:cohortId` hub; ZERO new backend (self-scoped completion/certificates/sessions reads composed client-side); entries from catalog enrolled card + dashboard CTA |
| 2 | Unified My Learning home | merge `/me/catalog·paths·assessments·feedback·sessions` into one hub with a next-actions feed | 4–6 d | 🟢 done 2026-06-13 (v1) — Participant home (= the hub) gains **NextActionsFeed** (unpassed quizzes · pending feedback · waitlist positions; client-side over existing self-scoped queries) + a **My programs** band (top-2 `ProgramEnrollmentCard` + view-all). Old `/me/*` pages RETAINED per risk note (parity-first; nav-entry removal last). Assignment feed items land with P3 (needs self-scoped read) |
| 3 | Assignment → one-click enroll | D4 assignment CTA enrolls into an eligible cohort (no manual catalog hunt) | 2–3 d | 🔴 not started |
| 4 | English-class mode separation | team-booking UX becomes a bounded area entered FROM its program, not global nav | 3–4 d | 🟢 done 2026-06-12 — superseded same day by FULL separation per owner: dedicated `/english` nav section (classes/teams/schedules/attendance/evaluations/booking) + `mode` world-split + additive `/api/english` read surface. See `plans/260612-2151-english-class-separation/` |
| 5 | In-app notification bell | read-feed over existing `NotificationLog` + mark-read; email stays | 3–4 d | 🔴 not started |
| 6 | Learner transcript | one printable history view over completion + certificates data | 2–3 d | 🔴 not started |

Total: ~3–4 weeks single dev+agent. Each phase ships independently (own PR,
all 7 CI gates), so the wave can pause after any phase.

## Phase sketches

### P1 — Learner Program Home (`/me/programs/:enrollmentId` or `/me/cohorts/:id`)
- One page per active enrollment: program info; upcoming/past sessions for
  THAT cohort (existing session list API filtered); **completion checklist**
  — render the `completionPolicy` requirements vs the learner's current state
  (attendance %, assessment passed?, feedback submitted?) from the existing
  completion engine read API; links to take quiz / submit feedback;
  certificate state (issued/expiring) when complete.
- The completion engine already computes all of this server-side for reports;
  this phase EXPOSES it to the learner. Backend: at most one thin read
  endpoint composing existing use-cases (`GET /api/learning/my/cohorts/:id/progress`).
- Industry pattern this closes: "what do I still need for my certificate?"

### P2 — Unified My Learning home (`/me`)
- Single hub replacing the 5-link dashboard: next-actions feed (next session,
  due quiz, unsubmitted feedback, overdue assignment, waitlist position) +
  program cards (from P1) + tabs/sections folding in catalog & paths.
- Feed is CLIENT-side composition of existing queries (sessions, attempts,
  feedback state, assignments, waitlist mine) — no new backend. Old routes
  keep redirecting; remove nav entries last.

### P3 — Assignment → one-click enroll
- Learner sees their assignments (existing status resolver) in the P2 feed;
  CTA enrolls via existing cohort-enrollment API into an eligible ongoing
  cohort of the assigned program (self_enroll modes; respects capacity +
  prerequisites — both already enforced server-side).
- Backend: small use-case "resolve enrollable cohort for assignment" +
  audit. Email reminder template gains the deep link.
- Decision (owner): auto-enroll on assignment vs CTA-enroll. **Rec: CTA** —
  preserves capacity/prereq guards and learner agency.

### P4 — English-class (team-booking) mode separation
- Principle: the legacy English operation (Team + leader `/book` grid +
  2/week cap + fixed slots) is ONE scheduling mode (`leader_booking`), not
  the platform's face. Backend already fully mode-gated (audit r8); Team
  vocabulary stays (ADR). This phase is UX boundary work:
  - `/book` + team views move out of global nav → entered from the English
    program's card/home (P1) for members of team-mode cohorts only;
  - generic learner home (P2) shows the English class as just another
    program card whose "book a session" action opens the team grid;
  - naming sweep: UI labels say "Team booking" (mode), not "English class"
    (hardcoded) — program name carries the meaning;
  - route/perm matrix + specs updated (`scheduling-and-booking` UI note).
- Explicitly NOT: model renames, URL changes, behavior changes.

### P5 — In-app notification bell
- `GET /api/notifications/mine` read model over `NotificationLog`
  (+ `readAt` field, self-scoped) + bell dropdown with mark-read;
  badge count polls with React Query. Email channel unchanged.
- Extend log writes to the 2–3 in-app-worthy events not yet logged
  (booking confirmed, waitlist promoted already logged; verify coverage).

### P6 — Learner transcript (`/me/transcript`)
- Print-friendly page: completed programs (completion engine), certificates
  (status/validity), attendance summary, assessment passes. Existing data,
  one composition endpoint or client composition. Export = browser print/PDF
  (no new export pipeline).

## Cross-cutting rules
- English-only UI strings via `en.json` (except `/me/*` literal-English
  convention — follow each page's existing pattern).
- Every phase: audit untouched (read-only features except P3/P5 writes —
  audited), soft-delete respected, capability checks server-side
  (`enrollment.self`, `notification.read` if added → capabilities map).
- Tests per phase: component tests + integration for any new endpoint;
  e2e extension only for P2 (learner home smoke) and P3 (assign→enroll).
- Tracker + specs updated per phase (Definition of Done).

## Risks
- P2 scope creep (hub redesign → fold catalog/paths carefully, keep old
  pages as redirects until parity proven);
- P4 nav changes confusing existing leaders → keep `/book` URL working,
  announce in release note;
- P5 NotificationLog TTL 180d means feed history is bounded — acceptable,
  document it.

## Unresolved questions
1. P3: CTA-enroll (rec) or silent auto-enroll on assignment?
2. P1 route shape: per-enrollment vs per-cohort id (dev decides at impl).
3. P5: which events justify in-app entries beyond the reminder/waitlist set?
