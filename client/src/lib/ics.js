// ──────────────────────────────────────────────────────────
// Minimal ICS (iCalendar) generator + downloader — Phase 3 Screen 6 §E rule 4
//
// "Add to calendar" link triggers an ICS download that Google/Outlook/Apple
// Calendar can import. We emit a single VEVENT per call.
//
// Constraints we honor:
//   - RFC 5545 line endings (CRLF) and DATE-TIME format (UTC: YYYYMMDDTHHMMSSZ)
//   - Long values escaped per spec (\\ , ; , newlines)
//   - PRODID identifies our app; UID is stable per schedule id so re-imports
//     update the same event rather than duplicating it.
//
// Usage:
//   downloadICS({
//     id: schedule._id,
//     title: `${classCode} · ${courseName}`,
//     description: 'Teacher: …',
//     location: 'Room 305',
//     start: schedule.startTime,
//     end:   schedule.endTime,
//   });
// ──────────────────────────────────────────────────────────

const CRLF = '\r\n';

const pad = (n) => String(n).padStart(2, '0');

/** UTC date → "YYYYMMDDTHHMMSSZ" per RFC 5545. */
function toICSDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Escape a TEXT-typed VEVENT property value. */
function escapeText(v) {
  return String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function buildICS({ id, title, description, location, start, end }) {
  const now = toICSDateTime(new Date());
  const uid = `${id || crypto.randomUUID?.() || now}@tms-v2`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TMS v2//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${toICSDateTime(start)}`,
    `DTEND:${toICSDateTime(end)}`,
    `SUMMARY:${escapeText(title)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    location ? `LOCATION:${escapeText(location)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join(CRLF) + CRLF;
}

/**
 * Download the event as an .ics file. Filename defaults to the event title.
 * Returns the generated Blob URL (caller may revoke; we also revoke on next tick).
 */
export function downloadICS(event, filename) {
  const ics = buildICS(event);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const safe = (filename || event.title || 'session')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .slice(0, 80);
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `${safe}.ics`,
  });
  a.click();

  // Revoke after the browser has had a tick to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return url;
}
