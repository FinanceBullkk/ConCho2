# Session 08 - Reports + Export

## Goal

Answer: are reports and exports correct, scoped, and safe for HR use?

## Scope

In: completion reports, rollups, HR Excel export, formula-injection safety,
soft-deleted exclusion, row correctness.

Out: new report types and compliance recertification.

## Required Evidence

- learning report domain files.
- legacy export controllers/services.
- export formula/row-cap tests.
- Reports tab client tests.

## Required Scenarios

- Report totals match source records.
- Teacher report access is scoped.
- Soft-deleted users/classes/teams excluded where required.
- Formula-leading user strings are escaped in Excel.
- Large exports respect row/memory safeguards.

## Verification

- learning reports integration tests.
- export routes/formula/row-cap tests.
- focused ReportsTab client tests.
- load/export smoke only if needed by evidence.

## Unresolved Questions

- None.

