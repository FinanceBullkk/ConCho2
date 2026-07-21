<!-- Mirrors the Definition of Done in .claude/rules/implementation-workflow.md.
     If the DoD changes there, update this checklist in the same PR. -->

## User outcome

<!-- One observable outcome. Include non-goals and the governing spec/ADR. -->

## Verification evidence

<!-- Exact tests, browser route/interactions/viewports, and data invariants. -->

## Known limitations

<!-- Say "None" or list blocked/unverified gates. -->

## Definition of Done

- [ ] One user outcome, non-goals, domain authority, and acceptance examples are stable
- [ ] Implementation closes that outcome end to end
- [ ] Auth/authz, CSRF, validation, rate limits, audit, and soft-delete/cancellation controls remain intact
- [ ] Tests cover the real happy path, permission denial, and one core edge case
- [ ] Original bug/scenario failed before the fix and passes after it (or: new behavior, not a bug)
- [ ] User-facing changes passed real-browser interaction checks at 1440×900 and 1280×800, plus 390×844 when responsive
- [ ] Migration/import before/after invariants and rollback boundary recorded (or: no data change)
- [ ] Applicable tests, lint, build, and `git diff --check` pass
- [ ] Roadmap/spec/ADR/system map/permission matrix reflect current truth
- [ ] Final diff contains only this slice and no debug residue
- [ ] Slice is intentionally committed; all remote CI gates are green before **Done**

> **Merge discipline:** gates are procedural on this repository. Do not merge
> until `gh pr checks <number>` shows every applicable gate green.
