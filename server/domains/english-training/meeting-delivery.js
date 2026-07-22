// Fail-soft delivery for canonical English Meeting changes.
//
// The Meeting mutation commits first. Bell rows, email, and Google Calendar are
// conveniences: a provider outage must never roll back the English schedule.

const calendarService = require('../../services/calendarService');
const logger = require('../../lib/logger');
const {
  sendBookingConfirmation,
  sendClassCancellation,
  sendSessionRescheduled,
} = require('../../lib/emailTemplates');
const { recordInApp } = require('../notification/in-app-writer');
const repository = require('./canonical-operations-repository.pg');

const classNameFor = (meeting) => `${meeting.class_code} — ${meeting.course_name}`;
const scheduleFor = (meeting) => ({
  _id: meeting.id,
  startTime: meeting.starts_at,
  endTime: new Date(
    new Date(meeting.starts_at).getTime() + Number(meeting.duration_minutes) * 60000,
  ),
  googleEventId: meeting.google_event_id || null,
});
const classFor = (meeting) => ({
  classCode: meeting.class_code,
  courseName: meeting.course_name,
});
const attendeesFor = (audience) => audience
  .filter((person) => person.email)
  .map((person) => ({
    email: person.email,
    name: person.full_name,
    empCode: person.employee_id,
  }));

const notifyBell = async (type, context, metadata) => {
  await Promise.all(context.audience.map((person) => {
    if (!person.user_id) return null;
    return recordInApp({
      type,
      recipientUserId: person.user_id,
      learnerId: person.user_id,
      cadenceKey: `${context.meeting.id}:${type}:${metadata.eventVersion}`,
      metadata: {
        className: classNameFor(context.meeting),
        meetingId: context.meeting.id,
        sessionUnitId: context.meeting.session_unit_id,
        sessionNumber: context.meeting.session_number,
        ...metadata,
      },
    });
  }));
};

const createOrRefreshCalendar = async (context) => {
  const args = {
    schedule: scheduleFor(context.meeting),
    classDoc: classFor(context.meeting),
    team: null,
    attendees: attendeesFor(context.audience),
  };
  const result = context.meeting.google_event_id
    ? await calendarService.updateEventForSchedule(args)
    : await calendarService.createEventForSchedule(args);
  if (result && !context.meeting.google_event_id) {
    await repository.setMeetingCalendarDetails(context.meeting.id, {
      googleEventId: result.eventId,
      meetLink: result.meetLink,
    });
  }
};

const withContext = async (meetingId, work) => {
  try {
    const context = await repository.getMeetingDeliveryContext(meetingId);
    if (context) await work(context);
  } catch (error) {
    logger.warn({ err: error.message, meetingId }, 'English Meeting delivery notification failed');
  }
};

const notifyMeetingCreated = async (meetingId) => withContext(meetingId, async (context) => {
  const className = classNameFor(context.meeting);
  await createOrRefreshCalendar(context);
  await Promise.all(context.audience.map((person) => sendBookingConfirmation({
    to: person.email,
    userName: person.full_name,
    className,
    startTime: context.meeting.starts_at,
  })));
  await notifyBell('english_session_scheduled', context, {
    sessionDate: context.meeting.starts_at,
    eventVersion: new Date(context.meeting.updated_at).toISOString(),
  });
});

const notifyMeetingRescheduled = async (meetingId, oldStartTime, reason) => withContext(
  meetingId,
  async (context) => {
    const className = classNameFor(context.meeting);
    await createOrRefreshCalendar(context);
    await Promise.all(context.audience.map((person) => sendSessionRescheduled({
      to: person.email,
      userName: person.full_name,
      className,
      oldStartTime,
      newStartTime: context.meeting.starts_at,
      reason,
    })));
    await notifyBell('english_session_rescheduled', context, {
      previousSessionDate: oldStartTime,
      sessionDate: context.meeting.starts_at,
      reason: reason || null,
      eventVersion: new Date(context.meeting.updated_at).toISOString(),
    });
  },
);

const notifyMeetingCancelled = async (meetingId, cancelledBy) => withContext(
  meetingId,
  async (context) => {
    const className = classNameFor(context.meeting);
    if (context.meeting.google_event_id) {
      await calendarService.deleteEventForSchedule(context.meeting.google_event_id);
    }
    await Promise.all(context.audience.map((person) => sendClassCancellation({
      to: person.email,
      userName: person.full_name,
      className,
      startTime: context.meeting.starts_at,
      cancelledBy,
    })));
    await notifyBell('english_session_cancelled', context, {
      sessionDate: context.meeting.starts_at,
      cancellationReason: context.meeting.cancellation_reason,
      eventVersion: new Date(context.meeting.updated_at).toISOString(),
    });
  },
);

module.exports = {
  notifyMeetingCreated,
  notifyMeetingRescheduled,
  notifyMeetingCancelled,
};
