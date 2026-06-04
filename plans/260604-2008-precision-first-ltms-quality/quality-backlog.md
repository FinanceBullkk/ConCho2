# Quality Backlog

This file captures side findings discovered during precision sessions. Do not
fix from this list directly. Promote one item into its own focused session or
fix plan first.

| ID | Severity | Source Session | Finding | Status | Next Step |
|---|---|---|---|---|---|
| QB-001 | P2 | 01 Baseline Truth | Documentation conflict: root agent contract says new user-facing strings need `en.json` and `vi.json`, but roadmap says UI is English-only and `vi.json` removed. | resolved 2026-06-04 | English-only stated in `AGENTS.md` + `lms-roadmap.md` DoD row; `phase-5-i18n-discovery.md` (recommended VN-canonical) marked SUPERSEDED. |
| QB-002 | P1 | 01 Baseline Truth | Roadmap says Wave D3 org model is live, but org model files are still untracked/modified in the dirty worktree. | open | Finish/verify/commit org model or downgrade roadmap wording until merged. |
| QB-003 | P2 | 01 Baseline Truth | `docs/current-system-map.md` still describes EN/VI i18next language detection while actual locale files show only `en.json`. | resolved 2026-06-04 | `current-system-map.md` i18n section now matches code (single `en`, no detector/toggle; flags unused dep). |
| QB-004 | P2 | 01 Baseline Truth | Audit docs still contain stale enterprise gaps such as missing Department/org hierarchy after Wave D3 work. | resolved 2026-06-04 | `docs/audit/README.md` marked historical snapshot; `findings.md` PROD-002 marked superseded (Wave D3, pending baseline verify in Session 04). |

## Unresolved Questions

- None.

