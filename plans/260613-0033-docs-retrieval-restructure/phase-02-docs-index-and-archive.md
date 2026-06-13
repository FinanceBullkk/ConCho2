# Phase 02 — docs/README index + archive one-off docs

## Overview
Priority: high · Status: 🔴 not started
`docs/` has 20+ root files and 4 subdirs with no entry point, and finished
one-off discovery docs sit next to living truth. Add a role-based index and
move dead docs to `docs/archive/`.

## Key insights
- Retrieval problem is ROUTING, not content: the content layers are healthy
  (specs = behavior, system-map = location, roadmap = progress, ADRs = why).
- A role-based index beats an alphabetical list: AI agents, new devs, the
  owner checking progress, and ops each need a different first hop.
- `handoff-2026-06-01.md` is referenced by rules as a sync target in DoD —
  retiring it (recommendation, unresolved Q2) simplifies DoD to
  tracker + spec + map.

## Related code files
Create:
- `docs/README.md` — sections:
  1. *Start here by role* — AI agent (CLAUDE.md → roadmap → specs registry),
     new dev (root README → system-overview → current-system-map →
     conventions rules), progress check (roadmap status board), ops
     (runbooks, backup-dr, cron-pinger).
  2. *Living docs table* — one line of purpose per file (root + subdirs).
  3. *Archive* — what's in `docs/archive/` and why it's history.
Move (git mv → `docs/archive/`):
- `phase-5-i18n-discovery.md`, `phase-6-member-friction-survey.md`,
  `phase-6-server-message-audit.md`, `handoff-2026-06-01.md`
- Candidates to evaluate at impl: `architecture-map.{md,html}` (keep if
  still regenerated; archive if stale), `docs/audit/` contents (keep —
  referenced by audit backlog).
Modify:
- All inbound links to moved files: `CLAUDE.md`, `.claude/rules/
  domain-model-and-migration.md` (Status section), `.claude/rules/
  implementation-workflow.md` ("The map" + DoD step 5), `docs/
  development-roadmap.md`, root `README.md` §11, `AGENTS.md` if any.

## Implementation steps
1. `mkdir docs/archive` + `git mv` the four files.
2. Grep each moved filename repo-wide; fix every inbound link (point to
   archive path, or drop the reference where the doc left the live flow).
3. Apply unresolved-Q2 decision: remove "sync handoff" from DoD step 5 and
   from the rules' map list (handoff becomes pure history).
4. Write `docs/README.md`; link it from root `README.md` §11 and from
   CLAUDE.md "Key references".
5. `npm run scripts:check` n/a — docs only; verify with a link grep sweep.

## Success criteria
- `docs/` root = living docs only; archive holds finished one-offs.
- `docs/README.md` answers "where do I look for X" in one hop per role.
- Zero broken inbound references (grep for each moved filename → only
  archive/README hits remain).

## Risk
- A rule file still instructing agents to sync the handoff → stale-doc
  drift returns. Mitigate: Q2 decision applied in the SAME commit.
