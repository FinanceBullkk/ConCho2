# Industry-Grade Audit — TMS v2 / Internal LTMS

> **Goal:** million-dollar-product *engineering rigor* (not feature breadth) —
> prove wiring is sound, codebase is clean, and the system is optimized.
> Quality/hardening audit; **no new features** (respects the repo's "no feature
> factory" + "don't chase commercial LMS breadth" golden rules).
> **Created:** 2026-06-16 · **Owner:** anhha · **Status:** 🟡 in progress

## Approach (what makes this "industry-grade", not surface)
1. **Data-driven, not opinion.** Every finding is backed by a measurement
   (coverage %, query explain, index inventory, bundle bytes, complexity score,
   dependency-graph edge) or a reproduced symptom — never "looks off".
2. **Adversarial verification.** Each finding is independently re-checked to
   refute it before it survives (multi-agent verify pass). Kills plausible-but-
   wrong findings that pure scanning produces.
3. **Anchored to recognized standards** per dimension (OWASP ASVS L2, 12-factor,
   Google SRE, React/Node perf guides) — see each phase.
4. **Severity rubric** (consistent triage): **P0** ship-blocker (security hole,
   data loss, crash) · **P1** real defect / broken contract · **P2** debt that
   raises change-risk · **P3** polish. Each finding: evidence · impact · fix.

## Execution model
- Owner approved **full autonomous execution** + a **one-off multi-agent
  workflow** for the assessment fan-out (overrides the standing inline rule for
  THIS task only). Fall back to inline if a workflow stalls.
- Drive: assess (workflow) → synthesize → remediate high-value → gates green → PR.
- Pause only for: destructive/irreversible actions, or a genuinely owner-only call.

## Dimensions (all four, owner-prioritized — covered in parallel)
| # | Dimension | Standard anchor | Phase |
|---|-----------|-----------------|-------|
| A | Architecture & wiring integrity | 12-factor, dep-direction, modular-monolith | [phase-01](phase-01-architecture-wiring.md) |
| B | Security & data integrity | OWASP ASVS L2 + Top 10 | [phase-02](phase-02-security-data-integrity.md) |
| C | Performance & optimization | DB index/query, N+1, bundle, caching | [phase-03](phase-03-performance-optimization.md) |
| D | Tests, gates & code cleanliness | real coverage, complexity, dup, debt | [phase-04](phase-04-tests-quality-cleanliness.md) |

## Phases & status
| Phase | Title | Status |
|-------|-------|--------|
| 00 | [Baseline & tooling](phase-00-baseline-and-tooling.md) — make the audit measurable | 🔴 todo |
| 01 | [Architecture & wiring](phase-01-architecture-wiring.md) | 🔴 todo |
| 02 | [Security & data integrity](phase-02-security-data-integrity.md) | 🔴 todo |
| 03 | [Performance & optimization](phase-03-performance-optimization.md) | 🔴 todo |
| 04 | [Tests, gates & cleanliness](phase-04-tests-quality-cleanliness.md) | 🔴 todo |
| 05 | [Synthesis & remediation roadmap](phase-05-synthesis-and-roadmap.md) | 🔴 todo |
| 06 | [Remediation & verification](phase-06-remediation-and-verification.md) | 🔴 todo |

## Deliverables
- `plans/reports/` — one findings report per dimension + a consolidated
  `industry-audit-findings.md` (severity-sorted, evidence-backed).
- A prioritized **remediation roadmap** (P0/P1 fixed this pass; P2/P3 ticketed).
- Remediation PR(s) with all 7 CI gates green; tracker/spec/docs updated per DoD.

## Guardrails
- No feature additions; no destructive renames (Mongo→Postgres stays Phase-6-gated).
- Security layers are load-bearing — audit, never weaken, them.
- Findings that touch behavior → update the capability spec on remediation (DoD).
- Lint ratchet cap only goes DOWN. Tests are gates, never weakened to pass.

## Key dependencies
- Baseline tooling (phase-00) must run before A–D so findings are measured.
- Synthesis (05) consumes all four dimension reports.
- Remediation (06) consumes the severity-ranked roadmap from 05.
