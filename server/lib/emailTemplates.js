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
const { getBrandingCached } = require('./branding');

// Branded org name for subjects + sign-off (TMS.update gap #5). Defaults to
// "TMS" until an admin configures branding, so unconfigured tenants are
// byte-identical to the previous hardcoded strings.
const brandName = () => getBrandingCached().orgName || 'TMS';

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────

const fmtDate = (d) =>
  new Date(d).toLocaleString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'full',
    timeStyle: 'short',
  });

const fmtDateOnly = (d) =>
  new Date(d).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    dateStyle: 'full',
  });

const pluralDays = (n) => `${n} day${n === 1 ? '' : 's'}`;

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
  subject: `${brandName()} — Booking Confirmed: ${className}`,
  text:
    `Hi ${userName},\n\n` +
    `Your spot in "${className}" has been confirmed.\n\n` +
    `Date: ${dateStr}\n\n` +
    `If you need to cancel, please do so at least 24 hours in advance.\n\n` +
    `${brandName()} Training System`,
  html:
    `<p>Hi <strong>${userName}</strong>,</p>` +
    `<p>Your spot in <strong>${className}</strong> has been confirmed.</p>` +
    `<p><strong>Date:</strong> ${dateStr}</p>` +
    `<p>If you need to cancel, please do so at least 24 hours in advance.</p>` +
    `<p>${brandName()} Training System</p>`,
});

const tplClassCancellation = ({ userName, className, dateStr, cancelledBy }) => ({
  subject: `${brandName()} — Session Cancelled: ${className}`,
  text:
    `Hi ${userName},\n\n` +
    `The following session has been cancelled${cancelledBy ? ` by ${cancelledBy}` : ''}:\n\n` +
    `Class: ${className}\n` +
    `Original date: ${dateStr}\n\n` +
    `Please check the TMS portal for rescheduling options or contact your team leader.\n\n` +
    `${brandName()} Training System`,
  html:
    `<p>Hi <strong>${userName}</strong>,</p>` +
    `<p>The following session has been cancelled${cancelledBy ? ` by <strong>${cancelledBy}</strong>` : ''}:</p>` +
    `<ul>` +
    `<li><strong>Class:</strong> ${className}</li>` +
    `<li><strong>Original date:</strong> ${dateStr}</li>` +
    `</ul>` +
    `<p>Please check the TMS portal for rescheduling options or contact your team leader.</p>` +
    `<p>${brandName()} Training System</p>`,
});

const tplScheduleReminder = ({ userName, className, dateStr, roomLink }) => ({
  subject: `${brandName()} — Reminder: ${className} starts soon`,
  text:
    `Hi ${userName},\n\n` +
    `This is a reminder that your session is starting soon:\n\n` +
    `Class: ${className}\n` +
    `Date: ${dateStr}\n` +
    (roomLink ? `Join link: ${roomLink}\n` : '') +
    `\nSee you there!\n\n` +
    `${brandName()} Training System`,
  html:
    `<p>Hi <strong>${userName}</strong>,</p>` +
    `<p>This is a reminder that your session is starting soon:</p>` +
    `<ul>` +
    `<li><strong>Class:</strong> ${className}</li>` +
    `<li><strong>Date:</strong> ${dateStr}</li>` +
    (roomLink ? `<li><strong>Join link:</strong> <a href="${roomLink}">${roomLink}</a></li>` : '') +
    `</ul>` +
    `<p>See you there!</p>` +
    `<p>${brandName()} Training System</p>`,
});

const tplEnrollmentDropped = ({ userName, teamName, courseName }) => ({
  subject: `${brandName()} — You have been removed from ${teamName}`,
  text:
    `Hi ${userName},\n\n` +
    `You have been removed from the team "${teamName}"${courseName ? ` (${courseName})` : ''}.\n\n` +
    `If you believe this was made in error, please contact your administrator.\n\n` +
    `${brandName()} Training System`,
  html:
    `<p>Hi <strong>${userName}</strong>,</p>` +
    `<p>You have been removed from the team <strong>${teamName}</strong>` +
    (courseName ? ` (${courseName})` : '') +
    `.</p>` +
    `<p>If you believe this was made in error, please contact your administrator.</p>` +
    `<p>${brandName()} Training System</p>`,
});

const tplEnrollmentTransferred = ({
  userName, fromTeamName, toTeamName, toCourseName, note,
}) => ({
  subject: `${brandName()} — Transferred to ${toTeamName}`,
  text:
    `Hi ${userName},\n\n` +
    `You have been transferred from "${fromTeamName}" to "${toTeamName}"` +
    (toCourseName ? ` (${toCourseName})` : '') +
    `.\n\n` +
    (note ? `Reason: ${note}\n\n` : '') +
    `Your future schedules will reflect the new team. Please log into the TMS portal to review.\n\n` +
    `${brandName()} Training System`,
  html:
    `<p>Hi <strong>${userName}</strong>,</p>` +
    `<p>You have been transferred from <strong>${fromTeamName}</strong> to <strong>${toTeamName}</strong>` +
    (toCourseName ? ` (${toCourseName})` : '') +
    `.</p>` +
    (note ? `<p><strong>Reason:</strong> ${note}</p>` : '') +
    `<p>Your future schedules will reflect the new team. Please log into the TMS portal to review.</p>` +
    `<p>${brandName()} Training System</p>`,
});

// Deep link into the learner home (next-actions feed shows the assignment
// with its enroll CTA — Cohesion P3). Empty when CLIENT_ORIGIN is unset
// (dev/test) so the copy degrades to the generic "log into the portal" line.
const portalHomeUrl = () =>
  (process.env.CLIENT_ORIGIN ? `${process.env.CLIENT_ORIGIN.replace(/\/$/, '')}/home` : '');

const tplAssignmentDueSoon = ({
  userName, assignmentTitle, targetName, dueDateStr, daysUntil,
}) => {
  const url = portalHomeUrl();
  return {
    subject: `${brandName()} — Assignment due soon: ${assignmentTitle}`,
    text:
      `Hi ${userName},\n\n` +
      `Your assignment "${assignmentTitle}" for ${targetName} is due in ${pluralDays(daysUntil)}.\n\n` +
      `Due date: ${dueDateStr}\n\n` +
      `Please log into the TMS portal to complete it before the deadline.` +
      (url ? `\n${url}` : '') + `\n\n` +
      `${brandName()} Training System`,
    html:
      `<p>Hi <strong>${userName}</strong>,</p>` +
      `<p>Your assignment <strong>${assignmentTitle}</strong> for <strong>${targetName}</strong> ` +
      `is due in <strong>${pluralDays(daysUntil)}</strong>.</p>` +
      `<p><strong>Due date:</strong> ${dueDateStr}</p>` +
      (url
        ? `<p><a href="${url}">Open your learning home</a> to complete it before the deadline.</p>`
        : `<p>Please log into the TMS portal to complete it before the deadline.</p>`) +
      `<p>${brandName()} Training System</p>`,
  };
};

const tplAssignmentOverdue = ({
  userName, assignmentTitle, targetName, dueDateStr, daysOverdue,
}) => {
  const url = portalHomeUrl();
  return {
    subject: `${brandName()} — Assignment overdue: ${assignmentTitle}`,
    text:
      `Hi ${userName},\n\n` +
      `Your assignment "${assignmentTitle}" for ${targetName} is overdue by ${pluralDays(daysOverdue)}.\n\n` +
      `Due date: ${dueDateStr}\n\n` +
      `Please log into the TMS portal and complete it as soon as possible.` +
      (url ? `\n${url}` : '') + `\n\n` +
      `${brandName()} Training System`,
    html:
      `<p>Hi <strong>${userName}</strong>,</p>` +
      `<p>Your assignment <strong>${assignmentTitle}</strong> for <strong>${targetName}</strong> ` +
      `is overdue by <strong>${pluralDays(daysOverdue)}</strong>.</p>` +
      `<p><strong>Due date:</strong> ${dueDateStr}</p>` +
      (url
        ? `<p><a href="${url}">Open your learning home</a> and complete it as soon as possible.</p>`
        : `<p>Please log into the TMS portal and complete it as soon as possible.</p>`) +
      `<p>${brandName()} Training System</p>`,
  };
};

const tplManagerAssignmentDigest = ({ managerName, rows }) => {
  const lineItems = rows.map((row) =>
    `- ${row.learnerName}${row.learnerEmpCode ? ` (${row.learnerEmpCode})` : ''}: ` +
    `${row.assignmentTitle} / ${row.targetName} / due ${row.dueDateStr} / ` +
    `${pluralDays(row.daysOverdue)} overdue`);
  const htmlItems = rows.map((row) =>
    `<li><strong>${row.learnerName}</strong>` +
    (row.learnerEmpCode ? ` (${row.learnerEmpCode})` : '') +
    `: ${row.assignmentTitle} / ${row.targetName} / due ${row.dueDateStr} / ` +
    `${pluralDays(row.daysOverdue)} overdue</li>`);
  return {
    subject: `${brandName()} — Overdue assignment digest (${rows.length})`,
    text:
      `Hi ${managerName},\n\n` +
      `These direct reports have overdue TMS assignments:\n\n` +
      `${lineItems.join('\n')}\n\n` +
      `Please use the TMS portal to follow up.\n\n` +
      `${brandName()} Training System`,
    html:
      `<p>Hi <strong>${managerName}</strong>,</p>` +
      `<p>These direct reports have overdue TMS assignments:</p>` +
      `<ul>${htmlItems.join('')}</ul>` +
      `<p>Please use the TMS portal to follow up.</p>` +
      `<p>${brandName()} Training System</p>`,
  };
};

// Wave E3 phase-04 slice B — a freed seat auto-enrolled a waitlisted learner.
const tplWaitlistPromoted = ({ userName, className, dateStr }) => ({
  subject: `${brandName()} — You're in: a seat opened up in ${className}`,
  text:
    `Hi ${userName},\n\n` +
    `Good news — a seat opened up and you've been enrolled from the waitlist:\n\n` +
    `Class: ${className}\n` +
    `Date: ${dateStr}\n` +
    `\nA calendar invite will follow. See you there!\n\n` +
    `${brandName()} Training System`,
  html:
    `<p>Hi <strong>${userName}</strong>,</p>` +
    `<p>Good news — a seat opened up and you've been enrolled from the waitlist:</p>` +
    `<ul>` +
    `<li><strong>Class:</strong> ${className}</li>` +
    `<li><strong>Date:</strong> ${dateStr}</li>` +
    `</ul>` +
    `<p>A calendar invite will follow. See you there!</p>` +
    `<p>${brandName()} Training System</p>`,
});

// Certificate recertification signal — emailed when an Issued certificate nears
// its validUntil (D6 expiry reminders). Deep-links to the learner transcript.
const tplCertificateExpiring = ({ userName, programName, certificateNumber, validUntilStr, daysUntil }) => {
  const url = process.env.CLIENT_ORIGIN
    ? `${process.env.CLIENT_ORIGIN.replace(/\/$/, '')}/me/transcript`
    : '';
  const when = daysUntil <= 0 ? 'today' : `in ${pluralDays(daysUntil)}`;
  return {
    subject: `${brandName()} — Certificate expiring soon: ${programName}`,
    text:
      `Hi ${userName},\n\n` +
      `Your certificate for "${programName}" (${certificateNumber}) expires ${when}.\n\n` +
      `Valid until: ${validUntilStr}\n\n` +
      `Please arrange to recertify before it lapses.` +
      (url ? `\n${url}` : '') + `\n\n` +
      `${brandName()} Training System`,
    html:
      `<p>Hi <strong>${userName}</strong>,</p>` +
      `<p>Your certificate for <strong>${programName}</strong> (${certificateNumber}) ` +
      `expires <strong>${when}</strong>.</p>` +
      `<p><strong>Valid until:</strong> ${validUntilStr}</p>` +
      (url
        ? `<p><a href="${url}">Open your transcript</a> and arrange to recertify before it lapses.</p>`
        : `<p>Please arrange to recertify before it lapses.</p>`) +
      `<p>${brandName()} Training System</p>`,
  };
};

// Weekly manager digest of direct reports' expiring certificates (D6 recert).
const tplCertificateExpiryManagerDigest = ({ managerName, rows }) => {
  const lineItems = rows.map((row) =>
    `- ${row.learnerName}${row.learnerEmpCode ? ` (${row.learnerEmpCode})` : ''}: ` +
    `${row.programName} / ${row.certificateNumber} / expires ${row.validUntilStr}`);
  const htmlItems = rows.map((row) =>
    `<li><strong>${row.learnerName}</strong>` +
    (row.learnerEmpCode ? ` (${row.learnerEmpCode})` : '') +
    `: ${row.programName} / ${row.certificateNumber} / expires ${row.validUntilStr}</li>`);
  return {
    subject: `${brandName()} — Team certificates expiring (${rows.length})`,
    text:
      `Hi ${managerName},\n\n` +
      `These direct reports have a certificate expiring soon:\n\n` +
      `${lineItems.join('\n')}\n\n` +
      `Please follow up so they can recertify before it lapses.\n\n` +
      `${brandName()} Training System`,
    html:
      `<p>Hi <strong>${managerName}</strong>,</p>` +
      `<p>These direct reports have a certificate expiring soon:</p>` +
      `<ul>${htmlItems.join('')}</ul>` +
      `<p>Please follow up so they can recertify before it lapses.</p>` +
      `<p>${brandName()} Training System</p>`,
  };
};

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

const sendWaitlistPromoted = ({ to, userName, className, startTime }) =>
  safeSend('waitlist-promoted', {
    to,
    ...tplWaitlistPromoted({ userName, className, dateStr: fmtDate(startTime) }),
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

const sendAssignmentDueSoon = ({
  to, userName, assignmentTitle, targetName, dueDate, daysUntil,
}) =>
  safeSend('assignment-due-soon', {
    to,
    ...tplAssignmentDueSoon({
      userName,
      assignmentTitle,
      targetName,
      dueDateStr: fmtDateOnly(dueDate),
      daysUntil,
    }),
  });

const sendAssignmentOverdue = ({
  to, userName, assignmentTitle, targetName, dueDate, daysOverdue,
}) =>
  safeSend('assignment-overdue', {
    to,
    ...tplAssignmentOverdue({
      userName,
      assignmentTitle,
      targetName,
      dueDateStr: fmtDateOnly(dueDate),
      daysOverdue,
    }),
  });

const sendManagerAssignmentDigest = ({ to, managerName, rows }) =>
  safeSend('manager-assignment-digest', {
    to,
    ...tplManagerAssignmentDigest({
      managerName,
      rows: rows.map((row) => ({ ...row, dueDateStr: fmtDateOnly(row.dueDate) })),
    }),
  });

const sendCertificateExpiring = ({ to, userName, programName, certificateNumber, validUntil, daysUntil }) =>
  safeSend('certificate-expiring', {
    to,
    ...tplCertificateExpiring({
      userName, programName, certificateNumber, validUntilStr: fmtDateOnly(validUntil), daysUntil,
    }),
  });

const sendCertificateExpiryManagerDigest = ({ to, managerName, rows }) =>
  safeSend('certificate-expiry-manager-digest', {
    to,
    ...tplCertificateExpiryManagerDigest({
      managerName,
      rows: rows.map((row) => ({ ...row, validUntilStr: fmtDateOnly(row.validUntil) })),
    }),
  });

module.exports = {
  // Public senders
  sendBookingConfirmation,
  sendClassCancellation,
  sendScheduleReminder,
  sendEnrollmentDropped,
  sendEnrollmentTransferred,
  sendAssignmentDueSoon,
  sendAssignmentOverdue,
  sendManagerAssignmentDigest,
  sendWaitlistPromoted,
  sendCertificateExpiring,
  sendCertificateExpiryManagerDigest,
  // Templates exported for unit testing
  _templates: {
    tplBookingConfirmation,
    tplClassCancellation,
    tplScheduleReminder,
    tplEnrollmentDropped,
    tplEnrollmentTransferred,
    tplAssignmentDueSoon,
    tplAssignmentOverdue,
    tplManagerAssignmentDigest,
    tplWaitlistPromoted,
    tplCertificateExpiring,
    tplCertificateExpiryManagerDigest,
  },
};
