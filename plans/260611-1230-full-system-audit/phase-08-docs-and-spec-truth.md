# Phase 08 — Docs & Spec Truth

**Area prefix:** DOCS- (new series).
**Rule being audited:** "Specs are code-truth" (`spec-driven-development.md`) —
if code and doc disagree, that's a finding (fix the doc, or the code if spec
reveals a bug).

## A. Spec registry vs code (sampling + scripts)
- [ ] For EVERY capability spec in `docs/specs/README.md`: pick 3 requirements
      incl. 1 error-path scenario → verify against code/tests. Stale → delta PR
      (bump `last_updated`); code wrong → BUG finding to phase-03 flow.
- [ ] `status:` honesty: anything marked `stable` that is actually `evolving`
      (persisted-but-not-enforced policies: deliveryMode, completionPolicy,
      capacityPolicy partially, facilitatorPolicy — flagged correctly?).
- [ ] Registry rows complete: owner, links, no orphan spec folders.

## B. Scriptable diffs (build once, keep)
- [ ] **Route diff:** enumerate Express routes from code (small script) vs
      `docs/route-permission-matrix.md` rows — mismatches = findings.
      Consider committing the script (`server/scripts/`) for future audits.
- [ ] **Env diff:** required envs in code vs README §6.4 table.
- [ ] i18n keys used vs defined (shares the phase-03 sweep — link results).

## C. Operational docs freshness
- [ ] `current-system-map.md`: spot-check 10 file-path claims post the 2026 file
      moves (features/ migration, domains extraction).
- [ ] Runbooks: backup-dr, cron-pinger, google-calendar setup — re-walk steps
      (phase-05 did the drills; here fix the TEXT where steps drifted).
- [ ] `development-roadmap.md` + `system-overview.md` scorecard: percentages
      match shipped reality; retire stale handoff docs (handoff-2026-06-01
      superseded rows → mark archived).
- [ ] README quickstart: clean-clone → seed → dev servers on a fresh machine,
      following ONLY the README. Every snag = finding.
- [ ] Swagger `/api/docs`: spot-check 10 endpoints vs real request/response
      envelopes (success/error shape, auth requirements).

## D. Agent-facing docs (this repo is agent-operated)
- [ ] `.claude/rules/*` accuracy: eslint cap number, test counts, structure
      claims — drift corrections (these rules steer every future session).
- [ ] `AGENTS.md` + `docs/agents/*` still match practice (issue tracker, triage
      labels, domain docs).

## Method
Sampling with teeth: every claim checked gets a ✔/✘ in the report; scripts B
committed so the NEXT audit is cheaper. Doc fixes batch into 1–2 PRs.

## Output
`plans/reports/audit-docs-{yymmdd-hhmm}-findings.md` + doc PRs (+2 helper scripts).
