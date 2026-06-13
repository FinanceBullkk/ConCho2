# Docs Retrieval Restructure — fast lookup for devs & AI, lean progress truth

> **Goal:** a new dev or AI agent opens the repo and reaches the RIGHT doc in
> one hop; the progress tracker shows current status without scrolling
> through history; the existing update-mechanism (Definition of Done) gets a
> PR-level backstop. **Zero new doc categories** — this plan slims, indexes
> and hardens what already exists. No code behavior changes.
> Status: `archived` (P1–P3 done 2026-06-13) · Owner: anhha · Created: 2026-06-13

## Context — what already exists (do NOT reinvent)

| Layer | Where | State |
|---|---|---|
| Update mechanism | `.claude/rules/implementation-workflow.md` DoD: tracker + spec + map updates are mandatory, automatic | ✅ working (procedural) |
| Behavior truth | `docs/specs/` — 29 capability specs + registry | ✅ healthy |
| Code map | `docs/current-system-map.md`, `docs/route-permission-matrix.md` | ✅ fresh |
| Progress | `docs/development-roadmap.md` | ✅ **351 lines** (P1) — status board first, history in `changelog-archive/` |
| Entry point | `docs/README.md` — role-based index + living-docs table | ✅ added (P2) |
| PR backstop | `.github/PULL_REQUEST_TEMPLATE.md` — DoD checklist | ✅ added (P3) |

## Owner decisions (locked 2026-06-13)
1. Tracker slimmed via changelog archive (keep ~2 recent weeks inline).
2. One-off docs (`phase-5-*`, `phase-6-*`, `handoff-2026-06-01`) → `docs/archive/`.
3. Enforcement = PR template DoD checklist (no CI noise job).

## Phases
| # | Phase | File | Est. | Status |
|---|-------|------|------|--------|
| 1 | Slim the tracker + changelog archive | `phase-01-slim-tracker-changelog-archive.md` | 0.5 d | 🟢 done 2026-06-13 (1,827→351 lines; `changelog-archive/2026-q2.md`; rolling policy in impl-workflow rule) |
| 2 | docs/README index + archive one-off docs | `phase-02-docs-index-and-archive.md` | 0.5 d | 🟢 done 2026-06-13 (`docs/README.md`; 6 one-offs → `docs/archive/`; handoff retired from DoD; links fixed) |
| 3 | PR template DoD checklist + rule sync | `phase-03-pr-template-dod-backstop.md` | 0.25 d | 🟢 done 2026-06-13 (`.github/PULL_REQUEST_TEMPLATE.md` mirrors DoD) |

Each phase ships independently (own commit; P1+P2 can share a PR).

## Success criteria (whole plan)
- `development-roadmap.md` ≤ ~400 lines; opening it answers "what is the
  status NOW / what's next" without scrolling history.
- `docs/README.md` gives a 1-hop reading path per role (AI agent · new dev ·
  progress check · ops) and every live doc has a one-line purpose.
- `docs/` root contains ONLY living docs; finished one-offs in `docs/archive/`.
- Every PR shows the DoD checklist; no inbound link broken (grep-verified).
- `.claude/rules/*` and `CLAUDE.md` references stay accurate.

## Explicitly NOT in scope
- No new doc types (no wiki, no per-domain READMEs — system map covers it).
- No CI docs-drift job (decision #3); revisit only if checklist proves weak.
- No spec/plan lifecycle changes — spec-driven flow already works.

## Unresolved questions
1. ~~Changelog archive granularity~~ — RESOLVED (P1, 2026-06-13): per-quarter.
   All current entries are 2026-Q2 → one `changelog-archive/2026-q2.md`.
2. ~~Retire the "sync handoff-2026-06-01" DoD step~~ — RESOLVED (P2, 2026-06-13):
   yes. handoff moved to `docs/archive/`; sync-handoff removed from DoD step 5,
   the rules' map list, and the DoD checklist. Tracker + spec + map are the live
   truth.
