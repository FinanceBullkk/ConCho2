# Session 05 - Learning Enrollment

## Goal

Answer: are programs, cohorts, enrollments, prerequisites, and paths truthful and
consistent?

## Scope

In: LearningProgram, Class/cohort DTO, cohort enrollment, self-enroll,
withdrawal, prerequisites, LearningPath progress.

Out: attendance marking, assessment scoring, report export.

## Required Evidence

- `server/domains/learning/enrollment/*`
- `server/domains/learning/path/*`
- Learning client hooks/pages for catalog, paths, prerequisites.
- enrollment/prerequisite/path tests.

## Required Scenarios

- Duplicate active enrollment rejected.
- Withdrawn or soft-deleted users do not look active.
- Participant self-enroll respects scheduling mode.
- Prerequisites use completion/certificate truth.
- Path progress marks completed/current/locked correctly.

## Verification

- learning enrollment integration tests.
- prerequisite/path integration tests.
- focused client tests for catalog/path UI.

## Unresolved Questions

- None.

