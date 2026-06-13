# Implementation Workflow

How to execute roadmap work and keep the tracker current **without being reminded**.
Applies whenever the user asks to implement a milestone/feature, or runs `/next`.

## The map (source of truth)
1. `docs/development-roadmap.md` — milestones (M1–M4), phase/wave status & %. **Start here.**
2. `docs/lms-roadmap.md` — strategy, gap analysis, why each wave exists.
3. `plans/` — a phase plan for the milestone, if one exists.

   (`docs/archive/handoff-2026-06-01.md` is a retired dated snapshot — history, not a live source.)

## Steps
1. **Pick target.** Use the milestone the user named; if none, take the next
   `🟡`/`🔴` milestone in `development-roadmap.md` by order (M1 → M4).
2. **Plan if needed.** Large/ambiguous → draft a short plan in `plans/` (or
   `/ck:plan` → `/ck:cook`). Small & clear → implement directly.
3. **Implement** per conventions — extend `domains/` (don't grow legacy),
   English-only UI strings (`en.json`), audit mutations, soft-delete. See `backend-conventions.md`,
   `frontend-conventions.md`, `domain-model-and-migration.md`.
4. **Verify** (`testing-and-ci.md`): `cd server && npm test`,
   `cd client && npm run test:run`, `cd client && npm run lint` (≤ cap).
   Fix failures for real — never skip/weaken.
5. **Update the tracker — part of Definition of Done, do it automatically:**
   - `docs/development-roadmap.md`: move the status emoji, update %, refresh the
     **Status board** (Now / Next), add a dated changelog line at the TOP of
     *Recent progress*, update the milestone row.
   - **Rolling archive (keep the tracker lean):** keep ~the last 2 weeks (~15
     entries, file ≤ ~400 lines) inline; in the SAME commit, cut older entries
     verbatim (newest-first — audit trail, do not reword) into
     `docs/changelog-archive/<year>-q<quarter>.md` and update its coverage header.
   - Update the scorecard in `docs/system-overview.md` if a phase % changed materially.
6. **Update the affected capability spec(s)** — if behavior changed, fold the
   delta into `docs/specs/<capability>/spec.md` (bump `last_updated`), or add a
   new spec + registry row for a new capability. Pure refactors (no behavior
   change) skip this. See `spec-driven-development.md`.
7. **Commit** — conventional message, no AI refs, explicit paths, exclude
   `.claude/settings.local.json` and lock files. Auto-commit is allowed.
8. **Report** — what changed · test results · tracker updates · next milestone.

## Definition of Done (a task is NOT done until all are true)
- ☑ Code implemented per conventions
- ☑ Tests + lint green (real pass)
- ☑ **Tracker updated** (`development-roadmap.md`; roll old changelog to archive)
- ☑ **Capability spec updated** if behavior changed (`docs/specs/` + registry)
- ☑ Committed

> This DoD is mirrored as a checklist in `.github/PULL_REQUEST_TEMPLATE.md` —
> when the DoD changes here, update the template in the same PR (single source
> of truth: this rule).

## Autonomy bounds
- **Auto-run + auto-commit** through step 6 without asking.
- **Pause and ask only when:** (a) blocked, or facing a decision that is the
  user's to make; (b) **before `git push`** — always confirm before pushing.
