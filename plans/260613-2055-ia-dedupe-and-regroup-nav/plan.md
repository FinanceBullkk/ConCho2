# IA Cleanup — Dedupe Surfaces + Regroup Nav

**Created:** 2026-06-13 · **Status:** 🟢 shipped (full scope + Home landing; owner-confirmed)
**Type:** Frontend IA / UX restructure (no backend behavior change)
**Owner ask:** "Tính năng OK nhưng thiết kế all-in-one, khó hiểu — admin cũng không biết dùng thế nào."

## Problem (measured)

Admin sees **7 nav items hiding ~27 sub-tabs**. Confusion comes from:

1. **Accidental duplication** — the same surface mounted in two places:
   - `SyncPage` → both `System▸Sync` and `Reports▸Sheets Sync` (identical component).
   - `SchedulesPage`/`AttendancePage` → both `Calendar` (mode=cohort) and `English` (mode=team).
   - `CohortsTab` → `Learning▸Cohorts` (mode=cohort) and `English▸Classes` (mode=team).
2. **Reporting scattered across 4 places** — `Home`, `Learning▸Dashboard`, `Learning▸Reports`, top-level `Reports`.
3. **Learning = 8 tabs in a horizontal scroll strip** (worst sprawl offender).
4. Nav organized by *data entity*, not *job-to-be-done*; the inverse booking model (leaders self-create sessions) makes "where do I make a schedule?" unclear.

> Locked constraints (do NOT undo): English-class separation (two worlds — cohort vs
> English team-booking — stay separate, owner decision 2026-06-12); React/Vite stays;
> capability authz + roleGuard intact; English-only UI strings via `en.json`.

## Target IA (proposed — see phase-01 for detail)

| Move | Before | After | Value |
|---|---|---|---|
| **Sync dedupe** | Sync in System **and** Reports | Sync only in **System** (next to Reconcile = data-ops); `/reports?tab=sheets-sync` → redirect | Removes a duplicate; `sync:sheets` is Admin-only so zero access loss |
| **Consolidate reporting** | Home + Learning▸Dashboard + Learning▸Reports + Reports | All numbers in **Reports**: Overview · Completion · Attendance Analytics · HR Export | One reporting home; Learning 8→6 tabs |
| **Group Learning tabs** | 8 flat tabs (scroll) | 6 tabs in 2 clusters: **Catalog** (Programs·Cohorts·Paths) ‖ **Delivery** (Assignments·Assessments·Feedback) | Mental model, no scroll |
| **Coordinator Reports nav** | `none` | `full` (already holds `read:reports`) | Consistency — they could see these inside Learning before |
| Naming clarity (minor) | "Schedules" in both Calendar & English | clarify section descriptions | Lower confusion between worlds |

## Phases

- [phase-01-dedupe-and-regroup.md](phase-01-dedupe-and-regroup.md) — the implementation

## Definition of Done

- ☑ Sync reachable from exactly one place (System); redirect added
- ☑ All reporting under `/reports`; Learning down to 6 grouped tabs
- ☑ Nav access map consistent (Coordinator sees Reports)
- ☑ `client/src/i18n/locales/en.json` keys updated (no Vietnamese)
- ☑ Tests + lint green (≤ cap 63); build clean
- ☑ Tracker + system map updated; no spec change (UI location only, no behavior change)

## Open questions

1. Confirm reporting-consolidation target (move Learning▸Dashboard/Reports into `/reports`) vs lighter "keep in Learning, just dedupe Sync"? — **decision is owner's**, asked before coding.
2. Keep `Home` dashboard as-is (it's the role landing), or also fold its KPIs into Reports Overview? (default: keep Home as landing, Reports = deep analytics.)
