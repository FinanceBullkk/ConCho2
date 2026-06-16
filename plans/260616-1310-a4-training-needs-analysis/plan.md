# A4 — Training Needs Analysis → Annual Plan (Modernization Horizon 2)

Status: in progress (backend first). **BUDGET MODE: build + verify LOCALLY, commit
on branch `feat/h2-a4-training-needs`, DO NOT push until GitHub Actions budget resets.**

## Goal
Demand-intake pipeline: managers/L&D submit training requests → aggregate demand
→ a planner turns approved demand into a costed annual plan + scheduled cohorts.

## Scope (this slice)
**Backend (`domains/planning`, mounted `/api/planning`):**
- `TrainingRequest` model: requestedBy, departmentId, target{kind:'program'|'skill',id},
  headcount, rationale, priority(low|med|high), targetQuarter ('YYYY-Qn'),
  status(submitted|in-review|approved|planned|rejected), soft-delete.
- `TrainingPlan` model: fiscalYear (unique), items[{target,demand,quarter,
  estCostMinor,cohortIds[]}], soft-delete.
- Routes (cap `training.plan`, Admin+Coordinator, audited):
  - POST `/requests` (submit) · GET `/requests` (filters) ·
    PATCH `/requests/:id/status` (status machine) · DELETE `/requests/:id` (archive)
  - GET `/demand?by=program|skill|quarter|department` (aggregate count + headcount)
  - GET `/plan/:fy` · PUT `/plan/:fy` (upsert items)
  - POST `/plan/:fy/items/:itemId/schedule` → create cohort (`Class` with
    courseName=program.name + programId + classCode + totalSessions), link cohortId,
    mark linked requests 'planned', optional Budget estimate via finance.createBudget.
- AuditLog enum: + 'TrainingRequest','TrainingPlan'. New cap `training.plan`.

**Client (next increment):** Demand board + annual-plan/planner UI, hooks, nav, route, i18n.
**Docs (next increment):** spec `training-needs-analysis` + registry + roadmap + maps.

## Deliberate deferrals (documented)
- **Manager self-service intake** — submit gated to `training.plan` (Admin+Coordinator)
  for now; opening intake to any line-manager needs a manager-identity gate (org
  hierarchy) → follow-up.
- **A7 approval engine** (Horizon 3) — implement the status *machine* (manual
  approve/reject transitions); A7 will later drive it.
- Deep cohort-builder reuse — `schedule` creates a minimal `Class` (admin supplies
  classCode + totalSessions); full session generation stays in the cohort tools.

## Gates (local only this phase)
server jest · client vitest · lint ≤63 · vite build — all green before commit.
NO push (budget).
