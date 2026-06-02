# Implementation Workflow

How to execute roadmap work and keep the tracker current **without being reminded**.
Applies whenever the user asks to implement a milestone/feature, or runs `/next`.

## The map (source of truth)
1. `docs/development-roadmap.md` — milestones (M1–M4), phase/wave status & %. **Start here.**
2. `docs/lms-roadmap.md` — strategy, gap analysis, why each wave exists.
3. `docs/handoff-2026-06-01.md` — detailed task snapshot.
4. `plans/` — a phase plan for the milestone, if one exists.

## Steps
1. **Pick target.** Use the milestone the user named; if none, take the next
   `🟡`/`🔴` milestone in `development-roadmap.md` by order (M1 → M4).
2. **Plan if needed.** Large/ambiguous → draft a short plan in `plans/` (or
   `/ck:plan` → `/ck:cook`). Small & clear → implement directly.
3. **Implement** per conventions — extend `domains/` (don't grow legacy),
   i18n both locales, audit mutations, soft-delete. See `backend-conventions.md`,
   `frontend-conventions.md`, `domain-model-and-migration.md`.
4. **Verify** (`testing-and-ci.md`): `cd server && npm test`,
   `cd client && npm run test:run`, `cd client && npm run lint` (≤ cap).
   Fix failures for real — never skip/weaken.
5. **Update the tracker — part of Definition of Done, do it automatically:**
   - `docs/development-roadmap.md`: move the status emoji, update %, add a dated
     changelog line, update the milestone row.
   - Sync `docs/handoff-2026-06-01.md` if a phase status changed.
   - Update the scorecard in `docs/system-overview.md` if a phase % changed materially.
6. **Commit** — conventional message, no AI refs, explicit paths, exclude
   `.claude/settings.local.json` and lock files. Auto-commit is allowed.
7. **Report** — what changed · test results · tracker updates · next milestone.

## Definition of Done (a task is NOT done until all are true)
- ☑ Code implemented per conventions
- ☑ Tests + lint green (real pass)
- ☑ **Tracker updated** (`development-roadmap.md` + sync handoff)
- ☑ Committed

## Autonomy bounds
- **Auto-run + auto-commit** through step 6 without asking.
- **Pause and ask only when:** (a) blocked, or facing a decision that is the
  user's to make; (b) **before `git push`** — always confirm before pushing.
