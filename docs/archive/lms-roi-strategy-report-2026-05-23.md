# [ARCHIVED · SUPERSEDED] LMS ROI Strategy Report (2026-05-23)

> **Status: superseded historical artifact — NOT current direction.**
> This was an early (2026-05-23) exploration of turning the system into a
> **commercial LMS product to sell** (buyer personas, ICP, sales MVP, product
> taglines, prospect questions, competency data model). It was **never
> committed** (recovered from a local stash on 2026-06-13) and its commercial
> thesis was **explicitly rejected**: the project direction was locked on
> **2026-06-04** as an **Internal LTMS for ~1000 internal employees**, and the
> golden rules forbid chasing commercial-LMS breadth (see repo `CLAUDE.md`).
>
> **Do NOT treat anything below as the roadmap.** The adopted successors are:
> [`../lms-roadmap.md`](../lms-roadmap.md),
> [`../ltms-gap-analysis.md`](../ltms-gap-analysis.md), and
> [`../../plans/260610-0811-business-case-ltms-vs-excel.md`](../../plans/260610-0811-business-case-ltms-vs-excel.md)
> (internal business case, not a sales pitch). Kept verbatim for decision
> history only — some feature ideas (executive ROI dashboard, Kirkpatrick) did
> inform the shipped 2-tier dashboard; the commercial/sales framing did not.

---

# LMS ROI Strategy Report

**Project:** TMS v2 / LMS expansion  
**Audience:** Founder/Product, L&D, engineering, sales demo owner  
**Date:** 2026-05-23  
**Purpose:** Map what the current system already has, what is missing to sell it as a company LMS, and what data/research/build work is needed to make the product persuasive around ROI.

---

## 1. Executive Summary

The current system is already a strong **Training Operations System**. It can manage users, classes, schedules, teams, attendance, bookings, evaluations, and basic reports. This is useful for L&D operations, but it is not yet enough to sell as a high-value corporate LMS.

To sell to companies, the product should not be positioned as only:

> "A system to manage training classes."

It should be positioned as:

> "A platform that proves training creates capability, improves performance, saves admin time, and reduces compliance risk."

The core shift is:

```text
Training Operations
-> Capability Management
-> Business Impact / ROI
```

Companies may not know they need an LMS. They usually know they have problems such as:

- They cannot prove training ROI.
- Managers do not know who is skill-ready.
- Mandatory training is tracked manually.
- L&D spends too much time with Excel, reminders, reports, and attendance.
- Leadership cannot connect training budget to performance.
- Audit/compliance evidence is hard to retrieve.

The product must make these pains visible, measurable, and solvable.

---

## 2. Current System Map

Based on previous codebase/audit context, the system currently covers these areas.

| Area | Current Capability | Strategic Meaning |
|---|---|---|
| Users / roles | Admin, Teacher, Participant | Basic actor model exists |
| Authentication | Login, reset password, MFA, RBAC | Strong base for enterprise trust |
| Teams | Team, leader, members | Can model training cohorts or operational groups |
| Classes / programs | Class, course, sessions | Can run structured instructor-led training |
| Schedules | Calendar, session scheduling, booking | Can manage training logistics |
| Attendance | Mark attendance, attendance history | Can prove participation |
| Evaluations | Teacher evaluation | Early base for learner assessment |
| Reports | Dashboard, analytics, export | Basic reporting exists |
| Admin tools | Audit, reconcile, settings, import/export | Useful for operations/admin control |
| Automation | Cron, reminders, sync | Can reduce manual admin work |

The system is strongest at answering:

```text
Who joined which class?
When was the training?
Who attended?
Who booked/cancelled?
What did the teacher record?
What can L&D export/report?
```

It is not yet strong enough at answering:

```text
Who needs to learn what?
Why do they need it?
What skill gap is being closed?
Did the learner improve?
Did the behavior change on the job?
What business KPI was affected?
How much time or money did the company save?
```

---

## 3. Strategic Gap: LMS vs ROI Platform

Most basic LMS products track content, completion, and attendance. That is crowded and hard to sell unless the buyer already has a clear LMS requirement.

The stronger product angle is:

```text
LMS + Skill Matrix + Manager Validation + ROI Dashboard
```

Or in Vietnamese:

```text
Nền tảng quản trị đào tạo và đo lường hiệu quả năng lực nhân sự
```

This gives the buyer a clearer business case:

- HR/L&D gets automation and reporting.
- Managers get visibility into team capability.
- Leadership gets ROI and risk dashboards.
- Compliance gets evidence and expiry tracking.

---

## 4. Existing vs Missing Capability Matrix

| Domain | Already Have | Missing To Sell As Company LMS |
|---|---|---|
| Employee data | User profile, role, status | Department hierarchy, manager, job title, job level, location |
| Role design | Simple user roles | Business role profiles and required competencies |
| Skills | Not yet a first-class model | Skill taxonomy, proficiency levels, target level per role |
| Learning catalog | Classes/courses exist | Course catalog with objectives, skills covered, cost, format, certificate |
| Learning path | Not yet | Role-based learning path, required/optional modules, auto-assignment |
| Assessment | Teacher evaluation exists | Pre-test, post-test, practical assessment, rubric, score improvement |
| Manager validation | Not yet | 30/60/90-day follow-up, behavior change confirmation |
| Completion | Attendance exists | Completion rules combining attendance, score, required activities |
| Certification | Not yet | Certificate issue, expiry, renewal, compliance report |
| ROI | Not yet | Training cost, admin time saved, performance gain, estimated ROI |
| Compliance | Partial via attendance | Mandatory training, overdue list, audit evidence package |
| Executive reporting | Basic dashboard | One-page executive report with ROI, risk, skill gaps |
| Automation | Reminders/cron base | Auto-assign path, escalation to manager, renewal reminders |
| Enterprise sale | Auth/RBAC base | SSO, org hierarchy, stronger resource-level permission, tenant strategy |

---

## 5. Buyer Pain Map

The system should be sold by exposing buyer pain, not by listing features.

### 5.1 L&D Manager

Pain:

- Too much manual tracking.
- Reports take hours or days.
- Attendance and learning records are scattered.
- Hard to know who missed required training.
- Hard to prove learning impact.

Product promise:

```text
Reduce admin time, automate training operations, and produce clean reports instantly.
```

Key modules:

- Training calendar
- Attendance
- Learning path
- Completion tracking
- Auto reminders
- Report export

### 5.2 HR Director

Pain:

- No visibility into workforce capability.
- Skill gaps are anecdotal.
- Promotion/readiness decisions lack data.
- Leadership asks for ROI but HR has no evidence.

Product promise:

```text
Turn training records into workforce capability intelligence.
```

Key modules:

- Skill matrix
- Role profile
- Department capability dashboard
- Manager validation
- Executive summary

### 5.3 Operations Director / Business Head

Pain:

- Team performance issues continue after training.
- Training is not connected to operational KPIs.
- No clear answer whether training changed behavior.

Product promise:

```text
Link training to business KPIs and behavior change.
```

Key modules:

- Training-to-KPI mapping
- Manager follow-up
- Before/after assessment
- Impact dashboard

### 5.4 Compliance / Risk Owner

Pain:

- Mandatory training evidence is hard to retrieve.
- Certificate expiry is manual.
- Audit requests create panic.

Product promise:

```text
Always know who is compliant, overdue, expired, and audit-ready.
```

Key modules:

- Mandatory training
- Certification expiry
- Evidence export
- Compliance dashboard

### 5.5 CEO / CFO

Pain:

- Training budget is hard to justify.
- ROI is unclear.
- Human capability is not measured like other business assets.

Product promise:

```text
Show whether training saves time, reduces risk, and improves performance.
```

Key modules:

- ROI dashboard
- Admin time saved
- Estimated business impact
- Executive one-page report

---

## 6. Features To Add

### 6.1 Skill Matrix

This should be the most important strategic module.

Purpose:

```text
Role -> required skills -> current level -> target level -> gap -> training path
```

Core objects:

- Skill
- Skill category
- Proficiency level 1-5
- Role profile
- Employee skill rating
- Skill evidence

Example:

```text
Role: Sales Executive

Required skills:
- Product knowledge: target 4/5
- CRM discipline: target 4/5
- Negotiation: target 3/5
- Forecasting: target 3/5
```

Business value:

- Shows which teams are not capability-ready.
- Prevents random training assignment.
- Gives leadership a capability dashboard.

### 6.2 Role-Based Learning Path

Purpose:

```text
Automatically assign the right training path based on role, department, job level, or promotion plan.
```

Examples:

```text
New Sales Hire Path
- Week 1: Company/product basics
- Week 2: CRM/process
- Week 3: Pitching/objection handling
- Week 4: Certification
```

Required capabilities:

- Path template
- Required vs optional course
- Prerequisites
- Auto assignment
- Progress tracking
- Completion rules

Business value:

- Standardizes onboarding and upskilling.
- Reduces manager/L&D manual assignment.
- Makes learning predictable and measurable.

### 6.3 Pre/Post Assessment

Purpose:

```text
Prove the learner improved after training.
```

Assessment types:

- Pre-test
- Post-test
- Practical assignment
- Teacher rubric
- Self-confidence rating

Metrics:

```text
Pre score
Post score
Score improvement
Passing rate
Skill-level improvement
```

Business value:

- Moves beyond attendance.
- Creates evidence that training increased knowledge or skill.

### 6.4 Manager Follow-Up

Purpose:

```text
Confirm whether training changed behavior on the job.
```

Workflow:

```text
Training completed
-> 30 days later manager receives follow-up form
-> Manager rates application and behavior change
-> LMS updates impact dashboard
```

Sample questions:

```text
Did the employee apply the skill?
Did behavior improve?
Did productivity or quality improve?
Does the employee need more coaching?
```

Business value:

- Connects L&D to real work behavior.
- Gives managers ownership of training impact.
- Makes ROI story credible.

### 6.5 Training ROI Dashboard

Purpose:

```text
Translate training activity into business value.
```

Dashboard sections:

- Training cost
- Training hours
- Completion rate
- Attendance rate
- Assessment improvement
- Skill gap closed
- Manager validation result
- Admin time saved
- Estimated ROI

Simple formulas:

```text
Admin saving = hours saved per month * hourly cost * 12

Training cost =
  learner hours cost
  + trainer cost
  + admin time cost
  + vendor/material/venue cost

Estimated ROI =
  (estimated gain - training cost) / training cost
```

Important note:

ROI does not need to be perfect at the beginning. It must be transparent, assumption-based, and adjustable.

### 6.6 Certification & Compliance Tracking

Purpose:

```text
Track mandatory training, certificate expiry, renewal, and audit evidence.
```

Core capabilities:

- Mandatory training assignment
- Due date
- Expiry date
- Renewal reminder
- Certificate record
- Compliance status
- Evidence export

Business value:

- Reduces compliance risk.
- Makes audits faster.
- Creates a strong buyer reason even when ROI is hard to quantify.

### 6.7 Executive One-Page Report

Purpose:

```text
Give leadership a quarterly view without needing to inspect the LMS.
```

Example report:

```text
This quarter:
- 342 employees trained
- 91% completion
- 38% average score improvement
- 126 certifications renewed
- 420 admin hours saved
- Top 3 skill gaps
- Top 3 departments at risk
- Estimated ROI: 2.4x
```

Business value:

- Makes the product easier to sell internally.
- Helps L&D justify budget.
- Gives leadership a language they understand.

---

## 7. Data To Collect Before Building

The biggest risk is building dashboards without enough meaningful data. Start by collecting structured data.

### 7.1 Employee / Org Data

Create `employees.csv`:

```text
empCode
name
email
department
team
managerEmpCode
jobTitle
jobLevel
location
employmentStatus
startDate
```

Why it matters:

- Enables learning path assignment.
- Enables department/manager dashboards.
- Enables escalation reminders.
- Enables skill gap reporting by org unit.

### 7.2 Skill Taxonomy

Create `skills.csv`:

```text
skillCode
skillName
category
description
level1Description
level2Description
level3Description
level4Description
level5Description
```

Why it matters:

- Gives the LMS a capability model.
- Prevents every course from being tracked as an isolated event.

### 7.3 Role Profiles

Create `role_profiles.csv`:

```text
jobTitle
jobLevel
department
skillCode
targetLevel
priority
mandatory
```

Why it matters:

- Defines what "ready for role" means.
- Powers learning path and skill gap logic.

### 7.4 Course Catalog

Create `course_catalog.csv`:

```text
courseCode
courseName
description
durationHours
format
mandatory
targetRoles
skillsCovered
learningObjectives
assessmentMethod
certificateRequired
certificateExpiryMonths
costPerLearner
owner
```

Why it matters:

- Connects courses to skills, cost, certificates, and ROI.

### 7.5 Assessment Data

Create `assessments.csv`:

```text
courseCode
assessmentType
questionOrRubricItem
skillCode
difficulty
passingScore
maxScore
```

Why it matters:

- Enables pre/post improvement measurement.

### 7.6 Manager Follow-Up Data

Create `manager_reviews.csv`:

```text
employeeEmpCode
managerEmpCode
courseCode
reviewDay
applicationRating
behaviorChangeRating
performanceImpactRating
comment
needCoaching
```

Why it matters:

- Creates evidence of on-the-job application.

### 7.7 Business KPI Data

Create `impact_metrics.csv`:

```text
department
kpiName
baselineValue
targetValue
actualValue
relatedCourseCode
measurementPeriod
owner
```

Examples:

Sales:

```text
conversion rate
time to first deal
average deal size
CRM completion rate
```

Customer service:

```text
CSAT
complaint rate
resolution time
repeat contact rate
refund rate
```

Operations:

```text
error rate
rework hours
compliance incidents
processing time
```

### 7.8 Cost Data

Create `training_costs.csv`:

```text
courseCode
trainerCost
vendorCost
venueCost
materialCost
employeeHourlyCost
adminHours
learnerHours
```

Why it matters:

- ROI cannot exist without cost.
- Admin time saved is usually the easiest ROI to prove first.

---

## 8. Research To Do Before Building

### 8.1 Choose ICP

Do not build for every company at once. Pick the first ideal customer profile.

Options:

```text
SME 100-500 employees
Sales-heavy company
Customer service / BPO
Retail chain
Manufacturing / compliance-heavy company
Internal corporate English / soft-skill training
```

Recommendation:

Start with a segment where training ROI is visible:

- Sales onboarding
- Customer service quality
- Compliance training
- Operations error reduction

### 8.2 Interview Buyers

Interview at least:

- 3 L&D managers
- 3 HR managers/directors
- 3 business managers
- 1-2 finance/leadership stakeholders

Questions for L&D:

```text
How do you track training today?
How many hours per month are spent on reports?
How do you know who missed required training?
What reports does leadership ask for?
What is painful during audit/compliance checks?
```

Questions for managers:

```text
Do you know which skills your team lacks?
Do you receive training follow-up reports?
How do you know training changed behavior?
What team KPI should training support?
```

Questions for leadership:

```text
How is training budget justified today?
What ROI evidence would be persuasive?
What workforce capability risks matter most?
What would make you buy an LMS now?
```

### 8.3 Competitor Research

Research:

```text
TalentLMS
Docebo
Moodle Workplace
360Learning
Cornerstone
SAP SuccessFactors Learning
Coursera for Business
Udemy Business
```

Compare:

```text
Pricing
Target customer
Skill matrix support
Learning path support
ROI dashboard
Manager feedback
Compliance tracking
Setup complexity
Vietnam/SEA localization
Integration options
```

Look for gaps:

- Many LMSs track completion but not ROI.
- Many have complex enterprise setup.
- Many do not localize well for Vietnam/SEA.
- Many are expensive for SMEs.

### 8.4 Build Demo Dataset

Before sales/demo, create a convincing dataset:

```text
200 employees
6 departments
20 managers
12 roles
30 skills
15 courses
5 mandatory trainings
3 learning paths
Pre/post scores
Manager reviews
KPI before/after
Training cost assumptions
```

The ROI dashboard is only persuasive if demo data tells a realistic story.

---

## 9. Proposed Data Model Additions

These are conceptual models. Engineering should adapt names/fields to the existing code style.

### 9.1 Skill

```text
Skill
- name
- code
- category
- description
- levels[{ level, description }]
- status
```

### 9.2 RoleProfile

```text
RoleProfile
- jobTitle
- jobLevel
- department
- requiredSkills[{ skillId, targetLevel, priority, mandatory }]
```

### 9.3 EmployeeSkillProfile

```text
EmployeeSkillProfile
- userId
- skillId
- currentLevel
- targetLevel
- source: self | manager | assessment | teacher
- evidence
- assessedAt
```

### 9.4 LearningPath

```text
LearningPath
- name
- description
- targetRoles
- targetDepartments
- items[{ courseId, required, order, prerequisiteCourseIds }]
- status
```

### 9.5 Assessment

```text
Assessment
- courseId
- type: pre | post | practical | manager-review
- questionsOrRubric
- passingScore
- skillMappings
```

### 9.6 AssessmentResult

```text
AssessmentResult
- userId
- assessmentId
- courseId
- score
- maxScore
- passed
- skillScores[{ skillId, score, level }]
- submittedAt
```

### 9.7 ManagerReview

```text
ManagerReview
- userId
- managerId
- courseId
- reviewWindow: 30d | 60d | 90d
- applicationRating
- behaviorChangeRating
- performanceImpactRating
- needCoaching
- comment
- submittedAt
```

### 9.8 Certification

```text
Certification
- userId
- courseId
- issuedAt
- expiresAt
- status: active | expiring | expired | revoked
- evidenceUrl
```

### 9.9 TrainingImpact

```text
TrainingImpact
- courseId
- department
- metricName
- baselineValue
- targetValue
- actualValue
- measurementPeriod
- estimatedGain
- assumptions
```

---

## 10. Build Roadmap

### Phase 1: Data Foundation

Goal:

```text
Make the system understand org structure, roles, skills, and course value.
```

Build:

- Department/team/manager fields
- Job title/job level
- Skill taxonomy
- Role profile
- Course-to-skill mapping
- Cost fields on courses

Outputs:

- Employee org view
- Role profile setup
- Course catalog enriched with skill/cost data

Do not build ROI dashboard before this data exists.

### Phase 2: Skill Matrix

Goal:

```text
Show current vs target capability by employee, team, department, and role.
```

Build:

- Employee skill profile
- Skill gap calculation
- Skill gap dashboard
- Team/department heatmap
- Recommended courses based on skill gap

Outputs:

- "Top skill gaps"
- "Employees below target"
- "Teams at risk"
- "Recommended training"

### Phase 3: Learning Paths

Goal:

```text
Turn skills into structured development plans.
```

Build:

- Learning path template
- Auto assignment by role/department/job level
- Required/optional items
- Progress tracking
- Completion rules

Outputs:

- Role-based onboarding paths
- Development path progress
- Overdue required learning

### Phase 4: Assessment & Manager Validation

Goal:

```text
Prove learning and behavior change.
```

Build:

- Pre/post assessment
- Practical rubric
- Assessment result
- Manager 30/60/90-day follow-up
- Improvement dashboard

Outputs:

- Score improvement
- Skill improvement
- Manager-confirmed application
- Coaching-needed list

### Phase 5: Compliance & Certification

Goal:

```text
Make the system valuable for risk and audit use cases.
```

Build:

- Mandatory training rules
- Certificate issue/expiry
- Renewal reminders
- Compliance dashboard
- Audit evidence export

Outputs:

- Expiring soon
- Overdue mandatory training
- Compliance by department
- Audit-ready export

### Phase 6: ROI Dashboard & Executive Report

Goal:

```text
Translate learning activity into business impact.
```

Build:

- Training cost model
- Admin time saved model
- Skill gap closed metric
- Assessment improvement metric
- Manager validation metric
- KPI mapping
- Executive one-page report

Outputs:

- Estimated ROI
- Cost saved
- Business impact assumptions
- Quarterly executive report

### Phase 7: Enterprise Readiness

Goal:

```text
Make the product credible for external company sale.
```

Build:

- SSO/SAML/Google Workspace login
- Stronger resource-level RBAC
- Department manager access
- Tenant strategy if SaaS
- Import templates
- Setup wizard
- Data retention/export policy

Outputs:

- Easier onboarding
- Better security story
- Enterprise buyer confidence

---

## 11. Recommended MVP For Sales

If the goal is to sell soon, do not build everything. Build the smallest package that can prove ROI.

### Sales MVP Modules

1. Skill Matrix
2. Role-Based Learning Path
3. Pre/Post Assessment
4. Manager 30-Day Follow-Up
5. ROI Dashboard
6. Executive One-Page Report

### Sales MVP Demo Story

Use a realistic story:

```text
A company has 200 sales/customer-service employees.

Before:
- Training tracked in Excel
- No clear skill gap
- No proof that training improves performance
- Reports take hours
- Mandatory training is risky

After:
- Skills mapped by role
- Learning paths auto-assigned
- Attendance/completion tracked
- Pre/post scores show improvement
- Manager confirms behavior change after 30 days
- Dashboard estimates admin time saved and ROI
```

The demo should end with the executive report, not with the class list.

---

## 12. Sales Positioning

### Weak positioning

```text
This is an LMS to manage courses and attendance.
```

Problem:

- Many companies do not think they need an LMS.
- Many LMS competitors already exist.
- Attendance alone does not justify budget.

### Strong positioning

```text
This is a training ROI and workforce capability platform.
It helps companies know who needs what training, whether they improved,
whether managers see behavior change, and what business value training created.
```

### Product tagline options

```text
Learning impact, not just learning records.
```

```text
From training attendance to measurable capability.
```

```text
Prove training ROI with skill, behavior, and business impact data.
```

Vietnamese:

```text
Không chỉ quản lý đào tạo, mà đo lường năng lực và hiệu quả sau đào tạo.
```

---

## 13. Questions To Ask Prospects

Use these questions to create urgency.

### L&D / HR

```text
How do you know who has completed mandatory training?
How long does it take to prepare a training report?
Can you see skill gaps by department today?
Do you know which training programs improved performance?
How do managers validate whether employees applied training?
```

### Managers

```text
Do you know which skills your team lacks?
Do you get follow-up after your team attends training?
Can you request training based on capability gaps?
How do you confirm training changed behavior?
```

### Leadership

```text
Can training budget be linked to measurable business outcomes?
Which roles or departments create the biggest capability risk?
How much admin time is spent on training operations?
What compliance risk exists if training evidence is missing?
What ROI evidence would justify more L&D investment?
```

If they cannot answer, the product has a reason to exist.

---

## 14. Immediate Action Plan

### Week 1: Research & Data Collection

- Pick first ICP.
- Interview 5-10 target users/buyers.
- Create sample `employees.csv`.
- Create initial skill taxonomy.
- Create 3 role profiles.
- Create 10-course catalog with cost and skill mapping.
- Define 3 ROI formulas.

### Week 2: Product Design

- Design Skill Matrix screens.
- Design Role Profile setup.
- Design Course Catalog enrichment.
- Design Learning Path assignment.
- Design ROI dashboard wireframe.
- Design Executive Report mock.

### Week 3-4: Build Foundation

- Add org fields to users.
- Add Skill model.
- Add RoleProfile model.
- Add course-to-skill mapping.
- Add import templates.
- Add basic skill gap calculation.

### Week 5-6: Build Impact Layer

- Add LearningPath.
- Add pre/post Assessment.
- Add AssessmentResult.
- Add ManagerReview.
- Add skill improvement dashboard.

### Week 7-8: Build ROI & Demo

- Add TrainingCost fields.
- Add admin time saved model.
- Add ROI dashboard.
- Add executive report.
- Create demo dataset.
- Prepare sales demo script.

---

## 15. Engineering Principles For This Expansion

1. Do not build dashboard before data model.
2. Do not build ROI before cost and baseline assumptions.
3. Do not build AI before deterministic rules.
4. Make every report traceable to source data.
5. Separate confirmed facts from assumptions.
6. Keep ROI editable and assumption-based.
7. Design for managers, not only L&D admins.
8. Make compliance evidence exportable.
9. Use existing training operations modules instead of rebuilding them.
10. Treat skill matrix as the strategic center of the product.

---

## 16. Definition Of Done For Sellable LMS

The system becomes sales-ready when it can demonstrate:

```text
[ ] A company can import employees with department, manager, job title, and job level.
[ ] Admin can define skills and proficiency levels.
[ ] Admin can define required skills per role.
[ ] The system can show skill gaps by employee/team/department.
[ ] Courses are mapped to skills and costs.
[ ] Learning paths can be assigned by role.
[ ] Employees can complete training and assessments.
[ ] Pre/post score improvement is visible.
[ ] Managers can validate behavior change after training.
[ ] Mandatory training and certificate expiry are tracked.
[ ] ROI dashboard shows cost, time saved, improvement, and assumptions.
[ ] Executive report can be exported or presented in one page.
[ ] Demo dataset tells a realistic business story.
```

---

## 17. Final Recommendation

The product should not try to win by being a generic LMS. It should win by owning a clearer niche:

```text
Training operations + skill gap visibility + ROI evidence for companies that need practical L&D accountability.
```

Build the next version around this sequence:

```text
Org data
-> Skill taxonomy
-> Role profile
-> Course-to-skill mapping
-> Learning path
-> Assessment
-> Manager validation
-> Compliance/certification
-> ROI dashboard
-> Executive report
```

This sequence is important. If built out of order, the system may look feature-rich but fail to persuade buyers. If built in this order, every module produces the data needed by the next module, and the final ROI dashboard becomes credible.

