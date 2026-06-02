# ADR: L&D Domain Vocabulary

## Status

Accepted.

## Context

Current code uses English-booking terms:

- `Class`
- `courseName`
- `Team`
- `Schedule`
- `Evaluation`

These terms are too narrow for an L&D platform that will support multiple training activities.

## Decision

Use platform vocabulary at API/DTO/UI boundaries:

| Legacy term | Platform term |
|---|---|
| `Class` | `Cohort` |
| `courseName` | `Program` |
| `Team` | `LearningGroup` |
| `Schedule` | `Session` |
| `Evaluation` | `Assessment` |

Physical Mongo collection names stay unchanged for compatibility. New endpoints expose the new vocabulary under `/api/learning/*`.

## Consequences

- Existing `/api/classes` continues to work.
- New clients should use `/api/learning/programs` and `/api/learning/cohorts`.
- Code touched for new L&D work should prefer platform names in DTOs and UI text.

## Unresolved Questions

- Whether future UI should hide legacy "Classes" wording entirely or keep it in admin/debug areas.
