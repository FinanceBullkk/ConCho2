# TMS.update — Phase 2: Custom-field type coverage (gap #6)

**Branch:** `feat/tms-update-custom-field-types` (off Phase-1 branch).

## Survey result — scope correction
The handoff lists **gap #1 (Program Builder UI)** + **gap #6 (custom-field types)**. On survey,
**gap #1 is already built**: `features/learning/ProgramFormModal` is a 5-step wizard
(`program-builder/`: `StepRail` + `ProgramBuilderSteps` + `ProgramLivePreview` +
`program-form-config`) writing to `LearningProgram`, with a live preview that already shows the
"Maps to LearningProgram" hint AND renders Program custom fields (`CustomFieldInput` in the Basics
step). The handoff gap map predates that work. → **No rebuild.** Phase 2 = **gap #6 only**.

Today: `CustomFieldDefinition.types = ['text','select']`, entity `['Program']`, no `showIn`.
Target (handoff §4): `text · number · select · multiselect · date · toggle · user` + `showIn[]`
(form/filter/export). Because the builder + cohort forms already consume the shared
`custom-field-input.jsx` renderer, extending it makes new types work everywhere (DRY).

## Slices
- **P2-S1 — Backend + renderer.** `CustomFieldDefinition`: add 5 types + `showIn[]`
  (default `['form']`). zod `schemas.js` + `dto.js` + `use-cases.js` (choice-types
  `select`/`multiselect` need options). `custom-field-input.jsx` renders all 7 types
  (number/date/toggle/multiselect/user-picker). Tests: BE round-trip per type + options
  validation; FE renderer per type.
- **P2-S2 — Manager UI.** `CustomFieldsPage`: type dropdown gains the 5 types; options field
  shows for select+multiselect; **showIn** toggles (form/filter/export). Field list shows `showIn`.
  Tests: add each type, showIn persisted, multiselect-needs-options gate.

> `showIn` is persisted + configurable now; honoring it in **list filters / exports** is a
> downstream surface (data is ready) — out of scope for Phase 2, noted as follow-up.

## Progress
- ✅ **Phase 2 — Custom-field type coverage** (2026-06-15). `CustomFieldDefinition` types `text → text·number·select·multiselect·date·toggle·user` + `showIn[]` (form/filter/export, default `['form']`); zod + dto + use-cases (choice types need options). Shared `custom-field-input.jsx` renders all 7 types (number/date/toggle/multiselect/**user-picker**) → builder + cohort forms light up automatically (DRY). `CustomFieldsPage`: 7-type dropdown + options-for-multiselect + showIn toggles. Tests: +2 server (extended types + showIn round-trip, multiselect-needs-options 400), +7 client (renderer per type, page type+showIn). Gates: client 347 ✓, server custom-field 6 ✓, lint 63, build clean. `showIn` honored on forms now; filter/export consumption = noted follow-up.

## DoD (per slice)
Capability (`settings.manage`) + audit preserved · client test:run + lint(≤63) + build green ·
BE custom-field suite green · tracker + (if behavior) spec updated · committed.
