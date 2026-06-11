---
capability: <kebab-case-name>           # matches the folder name: docs/specs/<capability>/
status: stable                          # stable | evolving | deprecated
owners: [domain/<x>, controllers/<y>]   # source modules that implement this
last_updated: YYYY-MM-DD
related_plans: []                       # plans/<dir> that proposed/changed this capability
related_code: []                        # key files: routes, service, model
---

# Capability: <Human Name>

> **This file is the source of truth for BEHAVIOR.** It describes what the system
> *does today* (observable inputs/outputs/errors), not what we intend to build.
> For the code-location map (which file/route), see `docs/current-system-map.md`.
> To change behavior: open a proposal in `plans/` (delta), implement, then fold
> the delta back here. See `.claude/rules/spec-driven-development.md`.

## Purpose

One paragraph: why this capability exists and the user/business problem it solves.

## Business Requirements (BR)

Numbered, business-level reasons. Referenced by FRs via `[BR-x]`.

- **BR-1:** ...
- **BR-2:** ...

## Actors & Use Cases (UC)

Who uses it, the trigger, and the happy-path flow. Referenced by FRs via `[UC-y]`.

- **UC-1 (<Actor>):** trigger → flow → outcome.
- **UC-2 (<Actor>):** ...

## Entities

The data this capability owns/touches, with invariants. Cite the model.

- **<Entity>** (`server/models/<X>.js`): fields that matter, invariants
  (e.g. unique index, soft-delete fields, required refs).

## Functional Requirements (FR)

Each requirement is a MUST/SHALL statement tagged with the BR/UC it serves, and
backed by at least one Given/When/Then scenario.

### Requirement: <imperative behavior statement> [BR-1, UC-1]

The system MUST/SHALL ...

#### Scenario: <short name>

- **GIVEN** <precondition>
- **WHEN** <action>
- **THEN** <observable outcome>

#### Scenario: <error/edge name>

- **GIVEN** ...
- **WHEN** ...
- **THEN** <error code / message / rejection>

### Requirement: <next behavior> [BR-2, UC-2]

...

## Non-Functional Requirements (NFR)

Cross-cutting guarantees this capability must uphold. Most inherit from
`docs/specs/security-platform/spec.md` — list only what applies + specifics.

- **Security:** authz layers (roleGuard + policy), CSRF on writes, rate limits.
- **Audit:** which mutations record an audit entry.
- **Data:** soft-delete (never hard-delete), transactions for multi-doc writes.
- **Performance:** indexes relied on, caching, expected scale.

## Acceptance Criteria (AC)

Binary, testable checklist = definition of correct behavior.

- [ ] ...
- [ ] ...

## Error & Edge Cases

| Trigger | Behavior | Recovery |
|---|---|---|
| <bad input / conflict> | <status + message> | <what the actor does> |

## Out of Scope / Deferred

What this capability deliberately does NOT do (link to plans/ if planned).
