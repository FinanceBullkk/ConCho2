# Research — Industry LMS/LTMS Information Architecture & Navigation

**Date:** 2026-06-13 · **For:** owner feedback "current arrangement not okay; find
industry-standard / enterprise design options" · **Scope:** navigation/IA only.

## TL;DR
Mature corporate LMS (Docebo, TalentLMS, SAP SuccessFactors, 360Learning, Absorb,
Cornerstone) converge on **three IA patterns this app does NOT yet follow**:
1. **Left vertical sidebar** with a few labelled groups → expandable sub-items +
   breadcrumbs. (We use a top horizontal bar of 7 items hiding ~27 in-page tabs — a
   2-level hidden hierarchy that doesn't scale.)
2. **Persona-separated experiences** — distinct **Admin console** vs **My Learning
   (learner)** vs **My Team (manager)**, with an explicit **"switch view"** control.
   (We mix admin/teacher/learner entry points in one bar; `/me/*` exists but isn't a
   first-class "mode".)
3. **Dashboard = actionable metrics first** (completion %, participation, training
   due) + recents/favorites/global search. (We just moved toward this with
   AlertBand + contextual tiles — directionally right.)

The single biggest gap = **top-tabs → left-sidebar + persona modes**.

## What each product does (evidence)

- **Docebo (new navigation):** left icon sidebar; hover/expand reveals grouped
  sub-categories; hierarchy like *Content & delivery › Course management › course ›
  session*; **breadcrumbs**, **favorites**, admin-configurable Pages/Menus. [1]
- **TalentLMS (redesign):** admin **main menu on the left**, grouped: **Courses ·
  Users & Activity · Reports** (Tests/ILT/Assignments/SCORM grouped under *Learning
  Activities*) **· Account & Settings**; separate configurable **learner
  dashboard**. [4]
- **SAP SuccessFactors Learning:** left **Menu** (role-filtered) with expandable
  tree: *Learning Administration › Learning Activities › Items*; primary groups
  **Users · Learning · Content · System Admin · Reports**; **Recents** (last 100
  entities). [5]
- **360Learning:** dashboard puts **actionable data front & center** (Completion
  Rate, Participation, Training Due); dedicated **"My team's Dashboard"** for
  managers. [4][6]
- **Role/persona separation (general):** access scoped so "CEO vs intern see
  different screens"; explicit **admin↔learner switch** ("My Learner Dashboard"
  bottom-left, or profile-menu "view as" top-right). [3][7][8]
- **Enterprise UX principles:** intuitive nav lifts adoption up to ~60%; consistent
  **design system**; mobile-first (76% access on mobile); accessibility. [3]

## Mapping to THIS app (TMS v2 → internal LTMS, ~1000 employees, 4 roles)

Current pain (confirmed in code this session):
- 7 top items × umbrella pages with tab strips (Learning had 8 tabs); duplicated
  surfaces (now partly fixed: Sync dedupe, reports consolidated).
- Two parallel worlds (cohort vs English-class) reuse tab names
  (Schedules/Attendance) — disambiguation is weak in a flat bar.
- Admin/Teacher/Participant share one bar; learner `/me/*` not a real "mode".

### Proposed target (industry-aligned)

**Left sidebar + persona modes.** Profile menu switches **Admin Console ↔ My
Learning**; **My Team** surfaces for managers. Sidebar is role-filtered (you only
see groups you can use). The English-class world becomes its **own labelled group**
(disambiguates the duplicate names without merging — respects the locked owner
separation).

```
ADMIN CONSOLE (Admin/Coordinator/Teacher, role-filtered)
─ Home                      actionable dashboard (alerts + tiles)
─ LEARNING                  Programs · Cohorts · Learning paths
─ OPERATIONS                Calendar/Sessions · Attendance · Assignments · Assessments · Feedback
─ PEOPLE                    Users · Teams · Departments · Offices · Rooms
─ ENGLISH CLASS             Classes · Teams · Schedules · Attendance · Evaluations · Booking
─ REPORTS                   Overview · L&D Dashboard · Completion · Attendance · HR Export
─ SYSTEM                    Settings · Sync · Reconciliation · Audit · Database

MY LEARNING (Participant + anyone via switch)
─ Home · My programs · Catalog · My sessions · Paths · Assessments · Feedback · Transcript

MY TEAM (managers)  — direct-report progress, overdue, certificates
```

Mobile: sidebar collapses to a drawer (hamburger) — standard responsive pattern.

## Options (pick a direction)

| Option | What | Effort | Payoff |
|---|---|---|---:|
| **A — Left sidebar + persona modes** (recommended, phased) | Replace top bar with role-filtered left sidebar; profile-menu persona switch (Admin/My Learning); English-class as its own group; in-page tab strips collapse into sidebar sub-items over time | **Large** (new app shell), phaseable | **Highest** — matches Docebo/TalentLMS/SAP; scales; fixes scanability + persona mix + two-world confusion |
| **B — Persona top-nav + per-section left sub-nav** | Keep slim top bar (Home · Learning · Operations · People · English · Reports · System), but each section page uses a **left sub-nav** instead of horizontal tab strips | **Medium** | Good — removes tab-strip sprawl, keeps current shell |
| **C — Relabel/regroup current top nav only** | Tidy labels + grouping, keep top-tabs model | **Small** | Low — owner already finds this model "not okay" |

### Recommended path
**Option A, phased** so it's not big-bang:
- **A1 — App shell:** introduce the left `Sidebar` (role-filtered groups), keep
  existing pages mounted as-is. Top bar → just logo + search + notifications +
  avatar. Mobile drawer.
- **A2 — Persona switch:** profile-menu toggle Admin Console ↔ My Learning; route
  `/me/*` becomes the learner mode home; My Team for managers.
- **A3 — Flatten tabs:** move each umbrella page's tab strip into sidebar sub-items
  (deep-linkable), retiring the in-page `Tabs` where it adds a level.
- Keep this session's dedupe/consolidation (it's orthogonal and still valid).

## Open questions
1. Go with **A (phased sidebar + persona)**, **B (top-nav + section sub-nav)**, or a
   blend? — owner's call (changes scope a lot).
2. Persona switch placement — profile menu (top-right) vs explicit bottom-left toggle
   (both are industry-common)?
3. Is an **admin-configurable** nav (Docebo-style Pages/Menus) wanted, or a fixed
   curated IA? (Recommend fixed — YAGNI for ~1000 internal users.)
4. Keep the current branch's work (dedupe + contextual Home) as-is and layer the new
   shell on top, or fold both into one bigger IA PR?

## Sources
- [1] [Docebo — New navigation interface](https://help.docebo.com/hc/en-us/articles/30839505728914-New-navigation-interface)
- [2] [Docebo — Pages & menus](https://www.docebo.com/knowledge-base/introtopages/)
- [3] [Designing an LMS That Learners Love — UI/UX best practices 2025](https://techhbs.com/designing-lms-ui-ux-best-practices/) · [Enterprise UX best practices](https://uxpilot.ai/blogs/enterprise-ux-design)
- [4] [TalentLMS redesign guide](https://help.talentlms.com/hc/en-us/articles/14758084707228-TalentLMS-redesign-guide) · [360Learning LMS](https://360learning.com/product/learning-management-system/)
- [5] [SAP SuccessFactors Learning — Navigating the Administrator Interface](https://learning.sap.com/learning-journeys/configuring-sap-successfactors-learning/navigating-the-administrator-interface)
- [6] [360Learning — My team's Dashboard](https://support.360learning.com/hc/en-us/articles/4405706039572-My-team-s-Dashboard-overview)
- [7] [CFI — Navigating Admin & Learner views](https://help.corporatefinanceinstitute.com/article/995-navigating-between-teams-admin-learner-views)
- [8] [Virtual College — Switching between Learner and Admin](https://help.virtual-college.co.uk/knowledgebase/article/KA-01138/en-us)
