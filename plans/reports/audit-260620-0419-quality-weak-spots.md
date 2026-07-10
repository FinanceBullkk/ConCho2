# Quality weak-spots audit — TMS v2 (quality-first lens)

Date: 2026-06-20 · Branch: `main` · Method: direct code measurement (eslint JSON,
git grep, wc, npm audit, prior coverage run). Lens: owner asked "find where the
house is LOW quality, even if it means tear-down & rebuild."

## TL;DR

Code-craft is genuinely strong (near-zero inline debt, 0 real skipped tests, 1
`console.log` server-wide, real security layers, server 87.6% line cov). The weak
spots are **architectural / strategic**, mostly *already known and deferred* — not
hidden rot. The ONE place a "tear down & rebuild" is genuinely justified is the
**data foundation (MongoDB for a relational domain)**. A full app rewrite would be
the WRONG call — it would destroy good code. Targeted foundational rework is right.

## What is actually good (so this audit is honest, not alarmist)
- Inline debt ~0: 2 "TODO/FIXME" hits are false positives (MFA format comments).
- 0 real skipped/`.only` tests (the `.skip(` hits are Mongoose pagination calls).
- 1 `console.log` in all of server/ (pino used properly everywhere else).
- npm audit: server 5 moderate, client 0. No high/critical.
- Security layers real: CSRF, rate-limit, 2-layer authz, audit-all, soft-delete,
  helmet/CSP, 2FA, gitleaks gate.

## Weak spots — by tier, with evidence

### Tier 1 — Foundational (justified rebuild candidates)
**W1 · MongoDB for a deeply relational domain. [severity: HIGH / foundational]**
- Domain is relational: Program→Cohort→Session→Enrollment→Attendance→Assessment→
  Certificate. Mongo gives no FK integrity, manual joins, transactions bolted on
  via replica-set sessions. The permissive-authz workaround (W3) is partly a
  symptom of missing referential guarantees.
- Team ALREADY decided Postgres is correct (ADR, Phase 6 gate) — **not started**.
- This is the real "built on the wrong material" issue. Highest build-it-right
  leverage.

**W2 · Half-finished convergence = two ways to do the same thing. [HIGH / maintainability]**
- Legacy still mounted ALONGSIDE domains: **18 legacy routes + 17 legacy
  controllers** beside **20 domain routers**. Two patterns coexist.
- Two grading model families: `models/Evaluation.js` (instructor rubric) AND
  `models/Assessment*.js` (quiz). Convergence unified the READ only; two write
  paths/models persist.
- Enrollment = two modes on one model (team `teamId` vs cohort). Read+create
  converged; transfer/drop close-paths NOT yet on the shared spine.
- "Converge-when-touched" is a deliberate policy, but the present state is
  duplication. Quality-first ⇒ finish converging, delete legacy.

### Tier 2 — Correctness / security smells
**W3 · "Open until populated" permissive authz. [MEDIUM / security]**
- `policy/classBinding.js`: empty `teacherIds` ⇒ `{allowed:true, reason:'no-binding-set'}`.
  A Teacher reaches ANY class's resources until an admin populates bindings on
  every class. Open-by-default until backfilled. Verify prod data is fully
  populated, then flip to fail-closed.

**W4 · Lint rules silenced instead of fixed. [MEDIUM / correctness]**
- `eslint-disable` for REAL correctness rules: `react-hooks/exhaustive-deps`
  (stale-closure risk), `react-hooks/set-state-in-effect`, `no-await-in-loop`
  (`domains/groups/mutations.js` — sequential awaits). Each disable is a deferred
  bug-or-perf question, not a style nit.

**W5 · React Compiler warnings (12). [MEDIUM / correctness]**
- `react-hooks/purity` 3, `immutability` 3, `set-state-in-effect` 3,
  `incompatible-library` 3 — flag impure render / mutated state / effect-driven
  setState. Subtle bug surface the new compiler surfaces.

### Tier 3 — Coverage & polish
**W6 · Accessibility gaps (23 a11y warnings). [MEDIUM / UX-quality]**
- `click-events-have-key-events` 11, `no-static-element-interactions` 10,
  `no-noninteractive-element-interactions` 2: clickable `<div>`s without keyboard
  support. `no-autofocus` 5. For 1000 internal users incl. keyboard/AT users this
  is a real (low-urgency) defect, and it is what pins the ratchet at 41 not 0.

**W7 · Test depth skews happy-path. [MEDIUM]**
- Server branch coverage 65.8% (vs 87.6% line) — error/edge paths thin.
- Frontend unit 40% (e2e-mitigated). Tests exist but assert success paths more
  than failure paths.

**W8 · Large multi-concern files. [LOW–MEDIUM / maintainability]**
- Server: `scheduleService.js` 602, `schedule/use-cases.js` 456, `User.js` 465.
- Client: `ParticipantDashboard.jsx` 564, `admin/DatabaseExplorer.jsx` 541,
  `api/api.js` 528 (one file = all API objects), `useLearning.js` 425.
- Some legit-complex (scheduleService transactions); some pages/api.js are
  splittable.

### Tier 4 — Process (not code, but real)
**W9 · Bus factor = 1, no second human reviewer, 568 commits/30d. [HIGH / continuity]**
- Tests+CI vouch for correctness, but no human design review = inconsistency risk
  + the single largest continuity risk. CI enforcement is procedural (Free plan,
  no branch protection) — a red PR *can* be merged.

## The honest "rebuild or not" call
- **Rebuild justified:** the DATA FOUNDATION (W1, Postgres) — and *finishing* the
  convergence (W2) which is rebuild-ish (retire legacy).
- **Do NOT rewrite the app.** The application code is good; a from-scratch rewrite
  would burn the strongest asset (disciplined, tested domain logic) for no quality
  gain. "Quality at any cost" ≠ "rewrite everything" — it means fix the FOUNDATION
  and remove DUPLICATION, then tighten the correctness/security smells.

## Recommendation (leverage-ordered, quality-first)
1. **Decide the Postgres gate now (W1).** Start Phase 0 readiness: repo→repository
   interfaces are already in place; design the relational schema + dual-write/
   backfill plan. Biggest build-it-right move.
2. **Finish convergence, retire legacy (W2).** Pick the next slice: fold
   Evaluation write-path into assessment, move enrollment transfer/drop onto the
   shared spine, then delete legacy routes/controllers as domains absorb them.
3. **Backfill bindings → flip classBinding to fail-closed (W3).** Removes
   open-by-default authz.
4. **Burn down the 41 lint warnings to 0 (W4+W5+W6):** fix (not disable) the
   hooks/compiler rules; add keyboard handlers for a11y. Ratchet 41→0.
5. **Raise branch/error-path coverage (W7)** server edge paths + frontend 40→60%.
6. **Split the 500+ LOC pages/api.js (W8).**
7. **Process (W9):** document continuity (onboarding), and treat CI gates as hard
   (manual discipline today).

## Unresolved questions
- Postgres gate: is the owner ready to commit engineering time to W1 now, or hold?
  (It is the single highest-leverage quality item but also the largest.)
- classBinding (W3): are `teacherIds` fully populated in prod today? If yes, flip
  to fail-closed is low-risk; if no, it is currently open-by-default.
- Is full convergence (delete all legacy) in-scope, or stay converge-when-touched?
