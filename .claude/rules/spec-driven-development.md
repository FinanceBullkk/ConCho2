# Spec-Driven Development

How behavior is specified and kept truthful over time. This layer exists so AI
agents and humans share **one source of truth for behavior** and don't drift.

## The two layers (don't confuse them)

| Layer | Location | Answers | Lifespan |
|---|---|---|---|
| **Specs** (truth) | `docs/specs/<capability>/spec.md` | *What does the system DO today?* (BR/UC/FR/NFR/AC, Given/When/Then) | Permanent — evolves with the product |
| **Proposals** (deltas) | `plans/<date>-<slug>/` | *What are we CHANGING and why?* | Temporary — archived after ship |

`docs/current-system-map.md` is a third, different thing: a **code map** (which
file/route implements what). Specs describe behavior; the system map describes
location. Keep them distinct.

> Format note: specs are **OpenSpec-compatible** (Purpose / Requirement /
> Scenario + `ADDED/MODIFIED/REMOVED` deltas). We do not install the OpenSpec
> npm tool — the workflow is homegrown inside our existing `docs/`+`plans/`. If
> we ever adopt the tool, `mv docs/specs openspec/specs` is the whole migration.

## Lifecycle: Propose → Apply → Archive

1. **Propose.** Start a plan from `plans/_TEMPLATE-proposal.md`. Write the delta
   against the target capability spec(s) using `ADDED / MODIFIED / REMOVED`
   markers. Set `target_specs` in frontmatter.
2. **Apply.** Implement per conventions; tests + lint green (real pass).
3. **Archive (part of Definition of Done).**
   - Fold the delta into `docs/specs/<capability>/spec.md` (it now reflects new
     truth); bump `last_updated`. New capability → new folder from
     `docs/specs/_TEMPLATE-spec.md` + a registry row.
   - Set the plan's frontmatter `status: archived`.
   - Update `docs/specs/README.md` (registry) + `docs/development-roadmap.md`
     changelog.

## Rules

- **Specs are code-truth, not intent.** A spec describes *current observable
  behavior*. If code and spec disagree, the code is the truth — fix the spec (or
  the code, if it's a bug). Never write aspirational behavior into a stable spec;
  use a proposal for that.
- **Every behavior change updates a spec.** No "stealth" behavior changes that
  leave the spec stale. This is enforced via Definition of Done
  (`implementation-workflow.md`).
- **Requirements use MUST/SHALL** and carry `[BR-x, UC-y]` tags; each has ≥1
  Given/When/Then scenario, including the error/edge path.
- **`status`:** `stable` (shipped + enforced), `evolving` (partially built or
  persisted-but-not-enforced — say which), `deprecated` (kept for history).
- **Keep specs focused** (~ one capability, well under `docs.maxLoc`). Split a
  bloated capability rather than letting one spec sprawl.

## When to write / touch a spec

- New feature → new capability spec (or delta into an existing one).
- Bug fix that changes observable behavior → MODIFIED delta → fold into spec.
- Pure refactor with **no** behavior change → no spec change (update the system
  map if file locations moved).

## Registry

`docs/specs/README.md` indexes every capability with status, owners, and links.
Adding/removing a spec means updating the registry in the same change.
