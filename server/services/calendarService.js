const { google } = require('googleapis');
const googleAuth = require('../lib/googleAuth');
const logger = require('../lib/logger');

// ──────────────────────────────────────────────────────────
// Google Calendar Service
// ──────────────────────────────────────────────────────────
// Creates / updates / deletes Calendar events for TMS schedules.
//
// Design choices:
//
// 1. FAIL-SOFT. If credentials are missing or the API errors, log
//    the failure and return null — the caller (scheduleService)
//    must continue without the calendar event. Booking a class
//    must never fail just because Google is having a bad day.
//
// 2. The service account impersonates a single configured user
//    (GOOGLE_CALENDAR_IMPERSONATE) — typically a system mailbox
//    like `tms-system@<domain>`. That user becomes the "organiser"
//    of every event. Attendees receive standard Google invite emails.
//
// 3. We auto-create a Google Meet link via conferenceData. Replaces
//    the manual `roomLink` field. If the impersonated user can't
//    create Meet links (rare), the event still creates without one.
//
// 4. sendUpdates: 'all' tells Google to email every attendee on
//    create/update/delete. This is the entire reason we're using
//    Calendar instead of building our own email infra.
// ──────────────────────────────────────────────────────────

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const getCalendarClient = () => {
  if (!googleAuth.isConfigured()) return null;

  const subject = process.env.GOOGLE_CALENDAR_IMPERSONATE;
  if (!subject) {
    logger.warn('GOOGLE_CALENDAR_IMPERSONATE not set — Calendar integration disabled');
    return null;
  }

  const auth = googleAuth.getAuthClient({ scopes: SCOPES, subject });
  if (!auth) return null;

  return google.calendar({ version: 'v3', auth });
};

const isConfigured = () => {
  return googleAuth.isConfigured() && !!process.env.GOOGLE_CALENDAR_IMPERSONATE;
};

/**
 * Build the Calendar event payload from a TMS schedule + attendees.
 */
const buildEventPayload = ({ schedule, classDoc, team, attendees, summaryPrefix }) => {
  const validEmails = (attendees || [])
    .filter((u) => u && u.email)
    .map((u) => ({ email: u.email, displayName: u.name || u.empCode }));

  const className = classDoc
    ? `${classDoc.classCode} — ${classDoc.courseName}`
    : 'TMS Class';
  const teamName = team?.name ? ` (${team.name})` : '';

  return {
    summary: `${summaryPrefix || ''}${className}${teamName}`,
    description:
      `Training session managed by TMS.\n` +
      (team?.name ? `Team: ${team.name}\n` : '') +
      (classDoc?.classCode ? `Class: ${classDoc.classCode}\n` : '') +
      (classDoc?.courseName ? `Course: ${classDoc.courseName}\n` : ''),
    start: {
      dateTime: new Date(schedule.startTime).toISOString(),
      timeZone: process.env.TMS_TIMEZONE || 'Asia/Ho_Chi_Minh',
    },
    end: {
      dateTime: new Date(schedule.endTime).toISOString(),
      timeZone: process.env.TMS_TIMEZONE || 'Asia/Ho_Chi_Minh',
    },
    attendees: validEmails,
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    conferenceData: {
      createRequest: {
        // Random unique key per event so Google generates a fresh Meet link.
        requestId: `tms-${schedule._id}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };
};

/**
 * Create a Calendar event for a schedule and return { eventId, meetLink }.
 * Returns null on any failure — caller must treat as "no calendar event".
 */
const createEventForSchedule = async ({ schedule, classDoc, team, attendees }) => {
  const cal = getCalendarClient();
  if (!cal) return null;

  try {
    const event = buildEventPayload({ schedule, classDoc, team, attendees });
    const res = await cal.events.insert({
      calendarId: 'primary', // primary calendar of the impersonated user
      requestBody: event,
      conferenceDataVersion: 1, // required to actually create the Meet link
      sendUpdates: 'all',       // email all attendees
    });

    const meetLink =
      res.data.hangoutLink ||
      res.data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
      '';

    logger.info(
      { scheduleId: schedule._id?.toString(), eventId: res.data.id, attendees: attendees?.length || 0 },
      'Calendar event created'
    );

    return { eventId: res.data.id, meetLink };
  } catch (err) {
    logger.error(
      { err: err.message, scheduleId: schedule._id?.toString() },
      'Calendar event creation failed (booking continues without calendar)'
    );
    return null;
  }
};

/**
 * Patch an existing event when a schedule is updated.
 */
const updateEventForSchedule = async ({ schedule, classDoc, team, attendees }) => {
  const cal = getCalendarClient();
  if (!cal || !schedule.googleEventId) return null;

  try {
    const event = buildEventPayload({ schedule, classDoc, team, attendees });
    // patch (not update) so we only send fields we set; preserves any
    // user-edited fields on the calendar side (e.g. they renamed it).
    const res = await cal.events.patch({
      calendarId: 'primary',
      eventId: schedule.googleEventId,
      requestBody: event,
      sendUpdates: 'all',
    });

    logger.info(
      { scheduleId: schedule._id?.toString(), eventId: schedule.googleEventId },
      'Calendar event updated'
    );

    return { eventId: res.data.id };
  } catch (err) {
    logger.error(
      { err: err.message, scheduleId: schedule._id?.toString() },
      'Calendar event update failed'
    );
    return null;
  }
};

/**
 * Delete an event when a schedule is cancelled or hard-deleted.
 */
const deleteEventForSchedule = async (googleEventId) => {
  const cal = getCalendarClient();
  if (!cal || !googleEventId) return false;

  try {
    await cal.events.delete({
      calendarId: 'primary',
      eventId: googleEventId,
      sendUpdates: 'all',
    });
    logger.info({ eventId: googleEventId }, 'Calendar event deleted');
    return true;
  } catch (err) {
    // 404/410 = already gone; not a real error.
    if (err.code === 404 || err.code === 410) return true;
    logger.error(
      { err: err.message, eventId: googleEventId },
      'Calendar event deletion failed'
    );
    return false;
  }
};

module.exports = {
  isConfigured,
  createEventForSchedule,
  updateEventForSchedule,
  deleteEventForSchedule,
};
