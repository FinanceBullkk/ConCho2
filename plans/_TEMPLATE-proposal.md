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
