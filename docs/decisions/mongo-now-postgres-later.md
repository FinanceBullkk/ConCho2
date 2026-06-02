# ADR: MongoDB Now, PostgreSQL Later Gate

## Status

Accepted.

## Context

The current system uses MongoDB/Mongoose. The future L&D platform is increasingly relational: people, programs, cohorts, groups, enrollments, sessions, attendance, assessment, reporting, and audit.

PostgreSQL likely fits the long-term domain better, but changing database too early would turn architecture work into a migration project before domain boundaries are clear.

## Decision

Keep MongoDB as the production database for the first platform phase.

Prepare for PostgreSQL by:

- Keeping new business logic in use-cases.
- Keeping Mongoose calls behind repositories for new domain modules.
- Adding DTOs that use platform vocabulary rather than Mongo collection names.
- Avoiding physical collection renames during the 6-month practical roadmap.

PostgreSQL gets a dedicated decision gate after Learning Program, Cohort, and generic Session foundations are live.

## PostgreSQL Gate Criteria

Evaluate PostgreSQL only when:

- Reporting queries become materially harder or slower in Mongo.
- Data integrity rules are spread across too much application code.
- Generic L&D relationships stabilize enough for a relational schema.
- A read-only migration prototype can prove feasibility from a Mongo snapshot.

Default decision at the gate: migrate only if the pain is demonstrated.

## Unresolved Questions

- None.
