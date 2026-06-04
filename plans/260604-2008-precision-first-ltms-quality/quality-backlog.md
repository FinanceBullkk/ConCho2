# Quality Backlog

This file captures side findings discovered during precision sessions. Do not
fix from this list directly. Promote one item into its own focused session or
fix plan first.

| ID | Severity | Source Session | Finding | Status | Next Step |
|---|---|---|---|---|---|
| QB-001 | P2 | 01 Baseline Truth | Documentation conflict: root agent contract says new user-facing strings need `en.json` and `vi.json`, but roadmap says UI is English-only and `vi.json` removed. | resolved 2026-06-04 | English-only stated in `AGENTS.md` + `lms-roadmap.md` DoD row; `phase-5-i18n-discovery.md` (recommended VN-canonical) marked SUPERSEDED. |
| QB-002 | P1 | 01 Baseline Truth | Roadmap says Wave D3 org model is live, but org model files are still untracked/modified in the dirty worktree. | resolved 2026-06-04 | Org model committed (`f98b36a`) on green gates (server 574, client 151, lint 0-err). Baselined; not yet pushed. |
| QB-003 | P2 | 01 Baseline Truth | `docs/current-system-map.md` still describes EN/VI i18next language detection while actual locale files show only `en.json`. | resolved 2026-06-04 | `current-system-map.md` i18n section now matches code (single `en`, no detector/toggle; flags unused dep). |
| QB-004 | P2 | 01 Baseline Truth | Audit docs still contain stale enterprise gaps such as missing Department/org hierarchy after Wave D3 work. | resolved 2026-06-04 | `docs/audit/README.md` marked historical snapshot; `findings.md` PROD-002 marked superseded (Wave D3, pending baseline verify in Session 04). |
| QB-005 | P2 | 02 Auth + Session Security | Playwright auth smoke requires real API + seeded DB, but local `localhost:5000` was not TMS API during Session 02. | open | Release Gate should provide repeatable seeded backend startup before e2e auth smoke. |
| QB-006 | P2 | 05 Learning Enrollment | New DI-05b partial unique index (cohort double-enroll guard) will fail to build if pre-existing duplicate Active cohort enrollments exist. | open | Run one-off dedupe on `{userId,classId,teamId:null,status:'Active'}` before/at deploy; non-regressive if skipped. |
| QB-007 | P2 | 06 Scheduling + Attendance | Teacher attendance read scope: `/attendance/user/:userId` + `analytics/by-employee\|team\|class` let any Teacher read any employee's/class's attendance, not limited to bound classes (mark + per-schedule reads ARE class-scoped). Design intent (SEC-IDOR-02 teacher org-wide analytics). | open | Product decision: scope teacher attendance reads to bound classes, or accept org-wide. Separately, ops backfill `Class.teacherIds` so class-binding gate becomes effective. |

## Unresolved Questions

- None.
