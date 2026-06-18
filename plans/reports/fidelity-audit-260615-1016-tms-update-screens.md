> ⚠️ **SUPERSEDED — verified STALE 2026-06-17.** Re-checked every Tier 1 delta
> against `main`: all are already shipped (audit predates the TMS.update +
> Build-Plan work merged 2026-06-15/16). Evidence:
> - #04 program-card status pill/%/bar/chip/counts → `ProgramsTab.jsx:21-55`
> - #13 roles sensitive-permission icons → `RolesAccessPage.jsx:234` (`SensitiveMark`)
> - #02 "updated N min ago" badge → `AdminAnalyticsPanel.jsx:80-137`
> - #23/24 audit entity chips + colored action badges + before→after diff → `SystemPage.jsx`
> - #05 "Edit in builder" + Curriculum/Analytics tabs + trend → `ProgramDetailPage.jsx:121-242`
>
> **Tier 2 re-checked 2026-06-17 — also all shipped + wired (real endpoints):**
> - #01 onboarding checklist + at-a-glance → `HomeSetup.jsx` mounted in `DashboardPage.jsx:62,67` (`/dashboard/setup`)
> - #02 time-range picker + dept performance table → `DepartmentPerformance.jsx` (`variant="table"`) in `DashboardOperationalPanel.jsx:217` (`/dashboard/departments`)
> - #20 Departments metric cards → same component `variant="cards"` in `DepartmentsPage.jsx:70`
> - #25 reconciliation 3-KPI strip + run-history drift trend + real Auto-heal → `ReconcilePage.jsx` (Build Plan #4)
> - #15 custom-fields multi-entity tabs (Program/User/Cohort/Session) → `CustomFieldsPage.jsx:13,86`
>   (only the prototype's drag-reorder of fields is unbuilt — minor nice-to-have)
> Tier 2 = DONE. Only genuinely-open item across both tiers was custom-field
> drag-reorder — **now shipped 2026-06-17** (`PUT /api/custom-fields/reorder` +
> drag/keyboard UI). **Both tiers now fully closed; nothing open.**
>
> Also: the "audit is NOT hash-chained → SKIP" note is itself outdated — hash-chain
> shipped (`useVerifyAuditChain`, Build Plan #3a). Tier 1 = DONE, nothing to build.
> Remaining real deltas are marginal cosmetics (delivery-mode vs scheduling chip,
> "Live" pill styling, drawer-vs-accordion) + items needing endpoints that would be
> fake (program-detail Export). Treat the tiers below as historical, not a TODO.

# TMS.update — pixel-fidelity audit vs. prototype screenshots

Date: 2026-06-15 · Branch: feat/tms-update-automation-engine · Mode: option (a) full audit

## Method
Compared each shipped screen against its prototype screenshot. Tokens/colors/
spacing already match (styles.css ported from index.css), so deltas are
**structural/content** (missing panels, chrome, columns, copy) not sub-pixel.
17 highest-signal screens diffed in depth; simple list/form screens noted at end.

## Verdict
Shipped app is a **lean, honest** rendering of the prototype: every screen has the
core data + actions, but many lack the prototype's **secondary panels & chrome**
(trend charts, filter chips, sparklines, funnels, agenda/materials, onboarding).
Some prototype elements **cannot be reproduced truthfully** (hash-chained audit,
mock sparkline trends, at-a-glance counts w/o an endpoint) — flagged SKIP/DATA.

---

## Deltas by screen (severity · effort · real-data feasible?)

### Home (01)
- **Onboarding checklist** ("Finish setting up your workspace · 3/6") — NOT built. MED · MED · ✅ (signals derivable: has depts/programs/custom-roles/automation-rules/policies).
- **"At a glance · This week"** panel (active learners X/1000, sessions scheduled, pending enrollment) — TodayHero shows only sessions. MED · MED · ⚠️ needs a small counts endpoint (some exist in dashboards).

### Reports · Overview (02)
- **Time-range segmented** (7d/30d/Quarter/YTD) — missing. MED · MED · ⚠️ needs server range param.
- **Department filter chips** (All/Eng/Sales/…) — missing. MED · LOW-MED.
- **Department performance table** (Headcount/Completion/Coverage/Overdue) — impl has by-dept bars only. MED · MED · ⚠️ coverage-per-dept may need aggregation.
- **"Live · updated Nm ago"** badge — missing. LOW · LOW.
- **KPI sparklines** + On-track/Watch/At-risk legend — missing. LOW · LOW-MED · ⚠️ sparkline needs trend series (else SKIP — no fake).

### Reports · Executive (03)
- Narrative + 4 heroes + tooltips + Kirkpatrick + trend = **built**. "Board pack" label vs "Export". LOW · LOW. Largely aligned.

### Programs (04)
- Program cards: impl shows category badge; prototype card adds **status (on-track/watch/at-risk) + completion % + progress bar + delivery-profile chip + cohorts·enrolled counts**. MED · LOW-MED · ✅ data exists (completion rollup).

### Program detail (05)
- **Curriculum** + **Analytics** tabs — likely missing (impl: overview/cohorts/settings). MED · MED-HIGH · ⚠️ curriculum=sessions→skills, analytics=by-dept/score-dist.
- **Completion-trend area chart** — missing. LOW-MED · ⚠️ needs trend series.
- **6 KPIs** (add Assessment, Avg feedback) + **5-row funnel** (add Started, Assessed) vs impl 3-row. LOW-MED.
- "Edit in builder" + "Export" header buttons. LOW.

### Cohort detail (06)
- **Mostly built** — roster has dept filter + at-risk + sort + cert column + 360 drawer + bulk. Verify all 5 KPIs (Avg attendance, Assessment pass) present. LOW.

### Session detail (10)
- **Agenda** card + **Materials** card + **Find/search** box — missing. MED · MED · ⚠️ Agenda/Materials need Schedule fields that may not exist (else static/empty-state).

### Learner profile 360 (08)
- Built (overview/skills/certs/activity + role-readiness + suggested-next). LOW. Aligned.

### Program builder (12)
- Impl = **modal**; prototype = **full page** w/ live-preview sidebar. Same 5-step wizard. LOW · (presentation choice — recommend keep modal or add a page route).

### Roles matrix (13)
- Impl = **binary checkboxes**; prototype = **tri-state Full/Read/None** + role summary chips w/ counts + **sensitive-permission warning icons**. MED · MED · ⚠️ tri-state contradicts the binary capability model (read vs manage = separate caps) → partial only. Warning icons on sensitive caps = ✅ feasible + worthwhile.

### Automation builder + run-history (16/17)
- Impl has when→if→then + run history. Prototype richer: **condition editor UI** (field/op/value rows), **reorderable actions**, **more action types** (issue-cert/email/update-transcript vs notify/log), **recipe templates**, **Test run**, **run-history table** (when/target/result/detail + Export). MED-HIGH · ⚠️ richer actions need real action handlers (don't fake).

### Audit log + diff drawer (23/24)
- Impl = **tab** in /system w/ dropdown filters + IP + diff. Prototype = **standalone page** + **entity chips** + colored action badges + **before→after drawer** (red/green field chips). LOW-MED · ✅ (chips + drawer presentational).
- **"Tamper-evident / hash-chained"** copy — our AuditLog is NOT hash-chained. **SKIP** (untruthful).

### Reconciliation (25)
- Impl = tab w/ checks list. Prototype adds **3-KPI header** (last run / records checked / drift found), **integrity-checks table** (records/drift/status per check), **"Drift · 8 nights" trend**, **Auto-heal** button. MED · ⚠️ trend needs history; auto-heal needs a real heal path (don't fake).

---

## Remaining 10 screens — now deep-diffed (verified in code)

- **07 Users** — ALIGNED. Table (name/code/role/dept/status) exists + richer (filter, soft-delete). LOW.
- **09 Calendar** — ALIGNED. Week booking grid + attendance tab built (Wave E). Maybe legend chip polish. LOW.
- **20 Departments** — **DELTA**: impl = simple CRUD **table** (`DepartmentsPage`); prototype = rich **metric cards** (N people · Completion bar · Coverage bar · overdue badge). MED · ✅ data exists (`completion.departments` from dashboard).
- **30 Learner catalog** — near-aligned: category filter present but a **`<select>` not chip row**; verify **Locked + "Requires X" prereq badge** renders. LOW-MED.
- **15 Custom fields** — **DELTA**: `ENTITY='Program'` **hardcoded** → missing **User/Cohort/Session entity tabs** + drag-reorder. Has all 7 types + showIn + preview. MED (was flagged Phase-1 extension point).
- **18 Scheduling** — **DELTA**: no Studio **Scheduling** page (session-type table + room-utilization). Needs a **new `SessionType` model**; the app uses `ALLOWED_TIME_SLOTS` not session-types → partly contradicts the booking model. NOT in the gap map. MED-HIGH · ⚠️ feature/deferred.
- **16 Skills** — ALIGNED. Category chips + skill cards (coverage X/Y) + role profiles all present. LOW.
- **17 Branding** — ALIGNED. Identity (org/accent/logo/cert title) + live certificate preview present. LOW.
- **Notifications (21/28)** — ALIGNED. Feed filter + per-category in-app/email toggles + daily/weekly/off digest present. LOW.
- **My Team (22/29)** — mostly built (`MyTeamPage` summary tiles + direct-report rollup). Verify the **4 KPIs** (completion/on-track/at-risk/overdue) + per-row certs/message + **Send digest**. LOW-MED.

### New deltas added to tiers
- Tier 1 (+): Catalog category **chips** instead of select (30); My-Team KPI set + Send-digest polish (22).
- Tier 2 (+): Departments **metric cards** (20); Custom-fields **multi-entity tabs** (15).
- Tier 3 / DECLINE (+): Studio **Scheduling** page (18) — needs a new `SessionType` model and conflicts with the slot-based booking model; not in the approved gap map.

---

## Recommended fix tiers (pros/cons/impact)

**Tier 1 — Quick presentational wins, real data, low risk (recommend DO):**
program-card enrichment (04), "Live·updated" badge + On/Watch/Risk legend (02),
audit entity-chips + before→after drawer polish (23/24), roles sensitive-permission
warning icons (13), "Board pack"/header-button labels (03/05).
- Pros: closes the most visible gaps fast, no fake data, low regression risk.
- Cons: doesn't add the big secondary panels.
- Impact: noticeably closer to prototype; ~1 commit.

**Tier 2 — Secondary panels needing light endpoints (DO if owner wants depth):**
Home onboarding checklist + at-a-glance, Reports time-range + dept filter + dept
table, Program-detail Curriculum/Analytics tabs + completion trend, Reconciliation
3-KPI + drift trend.
- Pros: real feature value, matches prototype depth.
- Cons: needs new server aggregations/trend series; larger; more test surface.
- Impact: several commits; real backend work.

**Tier 3 — Decline / partial (recommend SKIP):**
Audit "hash-chained" claim (untruthful), full tri-state roles (contradicts binary
model), any sparkline/trend that would show mock data, automation fake action types.
- Rationale: would require fabricated data or false claims — violates project rules.

## Unresolved questions
1. Which tier(s) to implement? (Recommend Tier 1 now; Tier 2 by owner priority.)
2. Program builder: keep modal, or also add a full-page `/program-builder` route?
3. Should I deep-diff the 10 not-yet-audited screens before deciding, or only if their tier is chosen?
