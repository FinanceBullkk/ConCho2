/**
 * emailTemplates.js — Centralized transactional email templates.
 *
 * Each template returns { subject, text, html } and is paired with a
 * thin "send*" helper that:
 *   - silently no-ops if the user has no email
 *   - never throws (logs warning instead) — emails are best-effort
 *     and must not block business logic
 *
 * Templates are intentionally simple HTML (no <head>/<style>) so they
 * render acceptably in every mail client without inline-CSS gymnastics.
 */
const { sendMail } = require('./mailer');
const logger = require('./logger');

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

const fmtDate = (d) =>
  new Date(d).toLocaleString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'full',
    timeStyle: 'short',
  });

const safeSend = async (label, payload) => {
  if (!payload.to) return null;
  try {
    return await sendMail(payload);
  } catch (err) {
    logger.warn({ err, label, to: payload.to }, `Email send failed (${label})`);
    return null;
  }
};

// ──────────────────────────────────────────────────────────
// Templates
// ──────────────────────────────────────────────────────────

const tplBookingConfirmation = ({ userName, className, dateStr }) => ({
  subject: `TMS — Booking Confirmed: ${className}`,
  text:
    `Hi ${userName},\n\n` +
    `Your spot in "${className}" has been confirmed.\n\n` +
    `Date: ${dateStr}\n\n` +
    `If you need to cancel, please do so at least 24 hours in advance.\n\n` +
    `TMS Training System`,
  html:
    `<p>Hi <strong>${userName}</strong>,</p>` +
    `<p>Your spot in <strong>${className}</strong> has been confirmed.</p>` +
    `<p><strong>Date:</strong> ${dateStr}</p>` +
    `<p>If you need to cancel, please do so at least 24 hours in advance.</p>` +
    `<p>TMS Training System</p>`,
});

const tplClassCancellation = ({ userName, className, dateStr, cancelledBy }) => ({
  subject: `TMS — Session Cancelled: ${className}`,
  text:
    `Hi ${userName},\n\n` +
    `The following session has been cancelled${cancelledBy ? ` by ${cancelledBy}` : ''}:\n\n` +
    `Class: ${className}\n` +
    `Original date: ${dateStr}\n\n` +
    `Please check the TMS portal for rescheduling options or contact your team leader.\n\n` +
    `TMS Training System`,
  html:
    `<p>Hi <strong>${userName}</strong>,</p>` +
    `<p>The following session has been cancelled${cancelledBy ? ` by <strong>${cancelledBy}</strong>` : ''}:</p>` +
    `<ul>` +
    `<li><strong>Class:</strong> ${className}</li>` +
    `<li><strong>Original date:</strong> ${dateStr}</li>` +
    `</ul>` +
    `<p>Please check the TMS portal for rescheduling options or contact your team leader.</p>` +
    `<p>TMS Training System</p>`,
});

const tplScheduleReminder = ({ userName, className, dateStr, roomLink }) => ({
  subject: `TMS — Reminder: ${className} starts soon`,
  text:
    `Hi ${userName},\n\n` +
    `This is a reminder that your session is starting soon:\n\n` +
    `Class: ${className}\n` +
    `Date: ${dateStr}\n` +
    (roomLink ? `Join link: ${roomLink}\n` : '') +
    `\nSee you there!\n\n` +
    `TMS Training System`,
  html:
    `<p>Hi <strong>${userName}</strong>,</p>` +
    `<p>This is a reminder that your session is starting soon:</p>` +
    `<ul>` +
    `<li><strong>Class:</strong> ${className}</li>` +
    `<li><strong>Date:</strong> ${dateStr}</li>` +
    (roomLink ? `<li><strong>Join link:</strong> <a href="${roomLink}">${roomLink}</a></li>` : '') +
    `</ul>` +
    `<p>See you there!</p>` +
    `<p>TMS Training System</p>`,
});

const tplEnrollmentDropped = ({ userName, teamName, courseName }) => ({
  subject: `TMS — You have been removed from ${teamName}`,
  text:
    `Hi ${userName},\n\n` +
    `You have been removed from the team "${teamName}"${courseName ? ` (${courseName})` : ''}.\n\n` +
    `If you believe this was made in error, please contact your administrator.\n\n` +
    `TMS Training System`,
  html:
    `<p>Hi <strong>${userName}</strong>,</p>` +
    `<p>You have been removed from the team <strong>${teamName}</strong>` +
    (courseName ? ` (${courseName})` : '') +
    `.</p>` +
    `<p>If you believe this was made in error, please contact your administrator.</p>` +
    `<p>TMS Training System</p>`,
});

const tplEnrollmentTransferred = ({
  userName, fromTeamName, toTeamName, toCourseName, note,
}) => ({
  subject: `TMS — Transferred to ${toTeamName}`,
  text:
    `Hi ${userName},\n\n` +
    `You have been transferred from "${fromTeamName}" to "${toTeamName}"` +
    (toCourseName ? ` (${toCourseName})` : '') +
    `.\n\n` +
    (note ? `Reason: ${note}\n\n` : '') +
    `Your future schedules will reflect the new team. Please log into the TMS portal to review.\n\n` +
    `TMS Training System`,
  html:
    `<p>Hi <strong>${userName}</strong>,</p>` +
    `<p>You have been transferred from <strong>${fromTeamName}</strong> to <strong>${toTeamName}</strong>` +
    (toCourseName ? ` (${toCourseName})` : '') +
    `.</p>` +
    (note ? `<p><strong>Reason:</strong> ${note}</p>` : '') +
    `<p>Your future schedules will reflect the new team. Please log into the TMS portal to review.</p>` +
    `<p>TMS Training System</p>`,
});

// ──────────────────────────────────────────────────────────
// Public senders — fail-soft wrappers
// ──────────────────────────────────────────────────────────

const sendBookingConfirmation = ({ to, userName, className, startTime }) =>
  safeSend('booking-confirm', {
    to,
    ...tplBookingConfirmation({ userName, className, dateStr: fmtDate(startTime) }),
  });

const sendClassCancellation = ({ to, userName, className, startTime, cancelledBy }) =>
  safeSend('class-cancellation', {
    to,
    ...tplClassCancellation({ userName, className, dateStr: fmtDate(startTime), cancelledBy }),
  });

const sendScheduleReminder = ({ to, userName, className, startTime, roomLink }) =>
  safeSend('schedule-reminder', {
    to,
    ...tplScheduleReminder({ userName, className, dateStr: fmtDate(startTime), roomLink }),
  });

const sendEnrollmentDropped = ({ to, userName, teamName, courseName }) =>
  safeSend('enrollment-dropped', {
    to,
    ...tplEnrollmentDropped({ userName, teamName, courseName }),
  });

const sendEnrollmentTransferred = ({
  to, userName, fromTeamName, toTeamName, toCourseName, note,
}) =>
  safeSend('enrollment-transferred', {
    to,
    ...tplEnrollmentTransferred({ userName, fromTeamName, toTeamName, toCourseName, note }),
  });

module.exports = {
  // Public senders
  sendBookingConfirmation,
  sendClassCancellation,
  sendScheduleReminder,
  sendEnrollmentDropped,
  sendEnrollmentTransferred,
  // Templates exported for unit testing
  _templates: {
    tplBookingConfirmation,
    tplClassCancellation,
    tplScheduleReminder,
    tplEnrollmentDropped,
    tplEnrollmentTransferred,
  },
};
