# Consolidation round — 13 capability domains wiring audit

Date: 2026-06-19 · Branch: `docs/sync-domain-inventory` · Scope: the 13 capability
domains added through Horizon 1/2 + TMS.update gaps (the breadth flagged as a
"feature factory / incomplete loop" risk in the heaviness/complexity review).

## Why
Initial heaviness review flagged: 21 domains in 2 months → risk of half-wired
loops (backend built, UX/nav/tests/authz missing) per the "No feature factory"
golden rule. This round checks whether those loops are actually CLOSED, before
any new capability is started.

## Method — 7-axis completeness scorecard per domain
backend layering · client feature · route (App.jsx) · nav entry (nav-config.js) ·
integration test · audit-log on mutations · capability gating (requireCapability).

## Scorecard (all 13 — every axis green unless noted)

| Domain | Backend | Client | Route | Nav | Test | Audit | Capability gate |
|---|---|---|---|---|---|---|---|
| access | full | RolesAccessPage | /access | Configure | access.test ×3 | 3 | ROLE_MANAGE (6) |
| automation | full +runner +seed | AutomationPage | /automation | Configure | automation.test | 3 | AUTOMATION_MANAGE |
| branding | full | BrandingPage | /branding | Configure | branding.test | 1¹ | BRANDING_MANAGE |
| compliance | full +derivation | ComplianceMatrixPage | /compliance | Configure | compliance ×2 | 3 | compliance.manage / report.read |
| custom-field | full +dto | CustomFieldsPage | /custom-fields | Configure | customField.test | 4 | settings.manage |
| finance | full | BudgetDashboard + CostRoi | /budget /cost-roi | Configure | financeBudget +1 | 6 | budget.manage |
| mobile | full | TodayPage | /me/today /mobile-attendance | Learner + Ops | mobile.test | 0² | self-scoped² |
| notification | full +in-app-writer +subscribers | NotificationBell + Page | /notifications | Topbar bell³ | notifications-mine | 1 | notification.read (6) |
| planning | full | PlanningPage | /planning | Configure | planning.test | 6 | training.plan |
| session-type | full | (in StudioSchedulingPage) | /scheduling | Configure | sessionTrainers | 3 | session.book / room.manage |
| skill | full +proficiency +dto | SkillsPage | /skills | Configure | skills ×2 | 3 | SKILL_READ/MANAGE (9) |
| trainer | full +dto | TrainersPage | /trainers | Configure | trainer.test | 3 | session.assign-trainer⁴ |
| vendor | full +dto | VendorsPage | /vendors | Configure | vendor.test | 4 | vendor.manage |

¹ branding = singleton `TenantConfig` (update-only, no soft-delete by nature).
² mobile = push subscribe/unsubscribe + "due today" feed; self-scoped to
  `req.user`, no managed entities → no audit/soft-delete/capability by design
  (same pattern as the notification feed). Documented in routes header.
³ notification reached via the global `NotificationBell` in Topbar (not a sidebar
  item) — intentional; the page route exists and is wired.
⁴ trainer double-gates `roleGuard('Admin','Coordinator')` + `requireCapability`
  — deliberate cheap belt-before-capability (commented in routes), not drift.

## Deep checks
- **Capability-reference integrity:** all 40 `requireCapability(...)` references
  across domain routers resolve to a key defined in `policy/capabilities.js`. No
  broken/silent gate (the "unknown capability → fail-closed → dead feature"
  class is currently closed).
- **Soft-delete absences** (branding/mobile/notification = 0) are all justified by
  domain nature (singleton config / self-scoped tokens / append-only feed). No
  user/attendance/evaluation data is hard-deleted.
- **Audit absence** (mobile = 0) justified — no managed-entity mutation.

## Verdict
**Loops are CLOSED.** The 13 capability domains are full-stack wired: backend
(routes→controller→use-cases→repository) + client feature + route + nav entry +
integration test + audit + capability gating. The "feature factory / incomplete
loop" risk is **refuted on the merits** — this is well-engineered breadth, not
debt. The complexity concern from the heaviness review should be revised: the
breadth is real and worth governing, but it is NOT half-built.

## Optional observations (NOT recommended to action — churn > value)
- **Capability-ref style split:** most domains pass string literals
  (`'budget.manage'`) to `requireCapability`; access/automation/branding/skill use
  the typed `CAPABILITIES.X` constant. Literals are the dominant established
  pattern (learning/assessment/org/room all use them). Converting either way is a
  sweeping low-value refactor — leave as-is. (If ever touched: standardise toward
  the typed constant, which the frozen object guards against typos.)

## Remaining genuine debt (separate from this round)
- `scheduleService.js` = 699 LOC, violates its own "must not grow — extract next
  slice into domains/schedule/" rule. The one concrete code-debt item; tracked as
  heaviness-review follow-up #2.

## Unresolved questions
- Are all defined capabilities granted to ≥1 role? (Not exhaustively verified;
  passing per-domain integration tests imply yes for the exercised paths.)
- session-type has no dedicated client feature folder (UI embedded in
  StudioSchedulingPage) — intentional consolidation, or should it be its own
  feature folder for parity? (Cosmetic; no functional gap.)
