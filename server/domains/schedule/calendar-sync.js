// Dual-backend (Mongo ⇔ Postgres) — Phase 5 slice 3 (A3): both the populate
// re-fetch and the event-id/Meet-link writeback ride the schedule repository,
// so the calendar lifecycle keeps working after the DB_BACKEND=postgres flip.
const repository = require('./repository');
const calendarService = require('../../services/calendarService');
const logger = require('../../lib/logger');

// ──────────────────────────────────────────────────────────
// Schedule ▸ calendar-sync — Google Calendar event lifecycle for a Schedule.
// Extracted from scheduleService (modular-monolith slice, 2026-06-19) to keep the
// transaction-heavy booking service focused on booking. These are best-effort,
// fail-soft side-effects: a calendar failure must NEVER break/roll back a booking.
//
// Public surface (re-exported by scheduleService for back-compat):
//   • effectiveAttendeesForSchedule — pure attendee resolver
//   • createCalendarEventForSchedule — create event after a booking commits
//   • syncCalendarForSchedule — update/create event after a non-time change
// ──────────────────────────────────────────────────────────

// ── Effective calendar attendees (Phase 3, DELTA B) ───────
// The real attendee source for a session = enrolled learners ∪ named internal
// trainers ∪ the external trainer (if it has an email). Deduped by email so a
// trainer who is also enrolled isn't invited twice. calendarService filters to
// valid emails, so entries without one are harmless. Expects a schedule with
// enrolledUsers + sessionInstructorIds populated (email) and externalTrainer raw.
const effectiveAttendeesForSchedule = (schedule) => {
  const out = [];
  const seen = new Set();
  const push = (person) => {
    if (!person || !person.email) return;
    const key = String(person.email).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(person);
  };
  (schedule.enrolledUsers || []).forEach(push);
  (schedule.sessionInstructorIds || []).forEach(push);
  if (schedule.externalTrainer && schedule.externalTrainer.email) {
    push({ email: schedule.externalTrainer.email, name: schedule.externalTrainer.name });
  }
  return out;
};

/**
 * After a Schedule is created, create a Google Calendar event for it
 * and store the event ID + Meet link back on the schedule.
 *
 * Always fail-soft: a calendar failure must never break the booking
 * flow. The schedule already exists; the worst outcome is that we
 * have a Schedule without a calendar event, which the admin can fix
 * by editing & re-saving (which would trigger an update).
 *
 * Returns { googleEventId, meetLink } or null.
 */
const createCalendarEventForSchedule = async (scheduleId) => {
  if (!calendarService.isConfigured()) return null;

  try {
    // Re-fetch with full population so we have everyone's email (learners +
    // internal trainers); the external trainer email travels on the doc.
    const schedule = await repository.findScheduleForCalendarSync(scheduleId);
    if (!schedule) return null;

    const result = await calendarService.createEventForSchedule({
      schedule,
      classDoc: schedule.classId,
      team: schedule.bookedTeamId,
      attendees: effectiveAttendeesForSchedule(schedule),
    });
    if (!result) return null;

    await repository.updateScheduleById(scheduleId, {
      googleEventId: result.eventId,
      meetLink: result.meetLink || '',
    });

    return result;
  } catch (err) {
    logger.error(
      { err: err.message, scheduleId },
      'createCalendarEventForSchedule failed (booking already saved; calendar skipped)'
    );
    return null;
  }
};

/**
 * Sync an existing schedule's Calendar event after a non-time change (e.g. a
 * trainer assignment, Phase 3). Fail-soft; skips past sessions (no point
 * notifying after the fact) and creates the event if one doesn't exist yet.
 */
const syncCalendarForSchedule = async (scheduleId) => {
  if (!calendarService.isConfigured()) return null;
  try {
    const schedule = await repository.findScheduleForCalendarSync(scheduleId);
    if (!schedule) return null;
    // Skip past sessions (m4) — calendar updates only matter for upcoming ones.
    if (new Date(schedule.startTime) <= new Date()) return null;

    const attendees = effectiveAttendeesForSchedule(schedule);
    if (schedule.googleEventId) {
      await calendarService.updateEventForSchedule({
        schedule,
        classDoc: schedule.classId,
        team: schedule.bookedTeamId,
        attendees,
      });
      return { eventId: schedule.googleEventId };
    }
    return createCalendarEventForSchedule(scheduleId);
  } catch (err) {
    logger.error({ err: err.message, scheduleId }, 'syncCalendarForSchedule failed (fail-soft)');
    return null;
  }
};

module.exports = {
  effectiveAttendeesForSchedule,
  createCalendarEventForSchedule,
  syncCalendarForSchedule,
};
