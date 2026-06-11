# ADR: Re-center on the coordinator-scheduled, offline, multi-office operating model

## Status

Accepted (2026-06-09). Informs direction; not yet fully implemented.

## Context

The system began as a TMS for English classes: an Admin creates a Class + a Team
with a leader, and the **team leader self-books Sessions** on a time grid
(`leader_booking`), which auto-enrolls the team. Much of the model (LearningGroup/
Team, leader booking, weekly cap) is shaped by that origin.

A grilling session with the product owner (2026-06-09) established how the
organisation **actually** runs internal training:

1. A **Training coordinator / HR** opens Sessions (course + Office + Room + time +
   Trainer) — not team leaders. The real flow is `admin_scheduled`.
2. Learners **self-enrol** (replacing today's Google Form/Sheet), with the
   coordinator **assigning** people as a fallback. Pre-built Teams are not used.
3. Courses run as **one or many Sessions**; "enrol per course vs per session" is a
   per-course configuration.
4. Training is **offline at 2–3 physical Offices**. **Office** is a first-class
   concept, distinct from Department; **Rooms belong to an Office**.
5. **Trainers** are internal employees **or** external people (name + contact, no
   account).
6. Coordinators need a **dedicated role** with scheduling/course/enrolment/report
   powers but **not** full Admin (no user-account/security management).

This diverges materially from the legacy shape, so direction is re-centered rather
than continuing to extend the English-class model.

## Decision

Treat the **coordinator-scheduled, offline, multi-office** model as the primary
operating model:

- `admin_scheduled` is the **primary** scheduling flow; `leader_booking` is kept as
  a **secondary/legacy** mode, not the default UX.
- Rosters come from **self-enrolment + coordinator assignment**; **LearningGroup/
  Team** becomes a legacy concept, not used for new offline-training work.
- Add **Office** as a first-class concept (employees and Rooms belong to an Office;
  a Session is delivered at an Office), distinct from Department.
- Model a **Trainer** as either an internal User or a lightweight external record
  (name + contact, no login), assigned per Session.
- Add a **Training coordinator** capability set (via the existing capability layer),
  separate from the full Admin role.

Compatibility is preserved: legacy routes/models stay; new concepts are additive and
nullable; the load-bearing booking guarantees are not weakened.

## Consequences

- Wave E3 (generic scheduling) is **central**, not optional — but its instructor
  design must support **external trainers**, and Rooms must be **Office-scoped**.
- The booking UI must surface the **coordinator-scheduled** flow as primary and
  demote leader self-booking.
- Several existing capabilities already fit (self-enrol catalog, assignment,
  attendance, certificates, compliance reports) — the work is re-centering + filling
  gaps (Office, external Trainer, Coordinator role), not a rebuild.
- Glossary updated in `server/CONTEXT.md` (Office, Department, Training coordinator,
  Trainer, legacy LearningGroup, primary `admin_scheduled`).

## Unresolved Questions

- Attendance/completion semantics for offline sessions that have no quiz.
- Where the "enrol per course vs per session" toggle lives and its default.
- Cancellation reality: who may cancel, notice period, notifying waitlisted learners.
- External-trainer logistics: calendar invite + timesheet/attendance needs.
