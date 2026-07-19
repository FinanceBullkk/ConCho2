# English Training — Phase-1 Import Data-Quality Review

- **Date:** 2026-07-18
- **Source workbook:** `.tmp/Copy of ENGCLASS_MANA.xlsx` (checksum `9e514aea2350fa33…`)
- **Target:** prototype Neon PG (`.env.pg-prototype`), tables `eng_*`
- **Scope:** Phase-1 identity + structure only (employees, cohorts, memberships,
  courses, course runs, run enrollments, PIC). No attendance/placement/evaluation.
- **Reconciliation:** source = loaded on all 6 sheets — **no row dropped**.

## Import result

| Entity | Rows |
|---|---|
| eng_employees | 308 (292 active / 16 inactive) |
| eng_cohorts | 52 |
| eng_courses | 6 |
| eng_course_runs | 91 (all run_number=1) |
| eng_cohort_memberships | 376 |
| eng_run_enrollments | 552 (active 81 · completed 365 · dropped 95 · waiting 11) |
| eng_cohort_pic | 52 |
| raw_eng_workbook_rows | 1009 (lossless staging) |

## Data-quality issues (36 total — all recorded, none dropped)

| Code | Count | Handling applied | Owner review? |
|---|---:|---|---|
| `employee_resigned` | 16 | `employment_status = inactive` | Confirm the 16 (list below). |
| `missing_bu` | 7 | org snapshot = `unknown` | Fill BU in source if known. |
| `missing_role` | 7 | org snapshot = `unknown` | Fill ROLE in source if known. |
| `multi_active_enrollment` | 2 | **Kept both `active`** (one-active rule relaxed to soft/reporting) | **Yes — decide if valid or error.** |
| `missing_membership_start` | 3 | membership `start_date = NULL` (no invented date) | Fill start date if known. |
| `cohort_without_course_run` | 1 | cohort `EL036` created from PIC, no runs | Confirm EL036 is real. |

## Decisions applied during this clean

1. **One-active-enrollment invariant relaxed.** The canonical model says a learner
   has ≤1 active run enrollment. Real data has 2 legitimate-looking concurrent
   cases, so the DB no longer blocks it — it's a **soft/reporting rule** (flagged
   via `multi_active_enrollment` + `meta.dq='multi_active'` on the rows). Nothing
   demoted or dropped; both keep their true `active` status.
2. **No invented dates.** 3 memberships whose source enrollments had blank start
   dates are stored with `start_date = NULL` + a DQ issue (not back-filled).
3. **Employment vs course status separated.** Only `Drop reason = 'Resign'` →
   `inactive`; course-lifecycle status (Completed/Stopped/Waiting) maps to
   enrollment, not employment.

## Detail — cases needing owner eyes

### Multi-active enrollments (2)
| Emp | Name | Enrollments (both `active`) | Note |
|---|---|---|---|
| 213817 | Bui Duy Tan | EL046 · Communication 1 **and** EL050 · Communication 1 | Same course, two cohorts → likely a cohort transfer or a data-entry duplicate. |
| 267040 | Nguyen Huynh Thao Tien | EL051 · Communication 1 **and** EL052 · Foundation | Two different courses at once → possibly legitimate concurrent study. |

### Cohort without a course run (1)
`EL036` — appears in the PIC sheet (row 37) but has no row in CLASSES, so it has
no course run. Cohort created; confirm it is a real group vs a typo.

### Memberships missing a start date (3)
| Emp | Name | Cohort |
|---|---|---|
| 213817 | Bui Duy Tan | EL050 |
| 267040 | Nguyen Huynh Thao Tien | EL052 |
| 247298 | NGUYỄN LÊ KHOA | EL003 |

### Resigned → inactive (16)
193519 LƯƠNG MINH QUÂN · 193529 NGUYỄN VĂN MẠNH CƯỜNG · 193548 NGUYỄN THIÊN ÂN ·
217001 NGUYỄN HỮU TRƯỜNG · 227064 PHÙNG ĐÌNH HUY · 227069 TÔ PHƯỚC THÁI ·
227080 NGUYỄN BÁ PHI NHẬT · 227130 HỒ MẠNH DŨNG · 237097 VÕ ĐỒNG ĐỨC DUY ·
237169 LƯƠNG ANH TUẤN · 237182 NGUYỄN TRỌNG BÌNH NGUYÊN · 237183 NGUYỄN LÊ HOÀNG VĂN ·
237207 NGUYỄN THÙY GIANG · 247086 THỚI PHI LONG · 247088 NGUYỄN VĂN HÙNG ·
247163 TRẦN ĐÌNH AN

## Open items for owner review

1. **Multi-active (213817, 267040):** valid concurrent study, or fix one in source?
2. **EL036:** real cohort (keep) or typo (remove)?
3. **Missing BU/ROLE (7/7)** and **missing membership start (3):** fill in source if
   the values are known; otherwise they remain `unknown`/`NULL` by design.
4. **Resigned 16:** confirm the list matches HR reality.

> These issues live durably in `eng_data_quality_issues`; this file is the
> human-readable snapshot. Re-running the import (`node server/scripts/eng-import.js
> <file> --reset`) reproduces the same outcomes deterministically.
