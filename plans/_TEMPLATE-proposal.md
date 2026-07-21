---
change: <kebab-slug>                    # the change id (matches plan folder)
status: proposed                        # proposed | applied | archived
target_specs: []                        # docs/specs/<capability> this change touches
milestone: <Mx Wave Y>                  # from docs/development-roadmap.md
created: YYYY-MM-DD
---

# Proposal: <title>

> A plan in `plans/` is a CHANGE PROPOSAL (≈ OpenSpec `changes/`). It is
> temporary: it describes a *delta* to one or more capability specs. When the
> change ships, fold the delta into `docs/specs/<capability>/spec.md`, set this
> file's `status: archived`, and update the registry. See
> `.claude/rules/spec-driven-development.md`.

## Why

The problem / need. Link the milestone in `docs/development-roadmap.md`.

## Delivery Contract

Complete this section before implementation. If an item does not apply, write
`N/A` and explain why; do not delete the field.

- **User outcome:** One observable result for one actor.
- **In scope:** The smallest end-to-end path that produces that result.
- **Non-goals:** Adjacent workflows or capabilities that will not change.
- **Domain authority:** Governing spec, ADR, reference implementation, or named
  decision owner.
- **Data impact:** Tables/records affected, source evidence, migration/import
  rehearsal, before/after invariants, and rollback or compensating boundary.
- **Feedback loop:** Exact failing/passing test, HTTP probe, data verifier, or
  browser flow that proves the outcome.
- **UI reference and states (when applicable):** Named reference screen plus
  empty, loading, populated, error, drawer/modal open, and mutation
  success/failure states.

### Acceptance Examples

- **Happy path:** Given / When / Then.
- **Permission denial:** Given / When / Then.
- **Core edge case:** Given / When / Then.

## What Changes (delta)

Describe behavior changes against the target spec(s) using delta markers. Only
list what changes — do not restate the whole spec.

### ADDED Requirements

#### Requirement: <new behavior> [BR-x, UC-y]
- Scenario(s) Given/When/Then.

### MODIFIED Requirements

#### Requirement: <changed behavior>
- *Previously:* <old behavior>
- *Now:* <new behavior + scenario>

### REMOVED Requirements

#### Requirement: <deprecated behavior>
- Reason + migration note.

## Design / Approach

Technical approach: files, layering, data flow, rejected alternatives. Keep
behavior decisions in the delta above; keep implementation detail here.

## Tasks

- [ ] ...
- [ ] Tests (unit/integration) — exercise real paths, no fakes.
- [ ] Lint ≤ cap, server + client tests green.
- [ ] Fold delta into `docs/specs/<capability>/spec.md`; bump `last_updated`.
- [ ] Update registry + `docs/development-roadmap.md` changelog.

## Verification

How to prove it works end-to-end (commands, scenarios, MCP/manual smoke).

## Stop / Re-plan Checkpoint

Re-baseline this proposal before adding more code if any answer becomes `yes`:

- [ ] Did the governing ADR, domain model, or reference product change?
- [ ] Did a second independent user outcome enter this slice?
- [ ] Did a migration/import change business meaning rather than only support
      the agreed outcome?
- [ ] Does the original feedback loop no longer prove the requested behavior?
- [ ] Did the diff cross roughly 15 files or 500 handwritten changed lines
      without an explicit reason the slice must remain atomic?

If re-baselining is triggered, update the delivery contract, acceptance
examples, and feedback loop before implementation continues. Split work by
independently verifiable user outcome, never by frontend/backend layer.
