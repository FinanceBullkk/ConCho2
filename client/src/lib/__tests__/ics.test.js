import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildICS, downloadICS } from '../ics';

const event = {
  id: 'sched-1',
  title: 'ENG101 · Business English',
  description: 'Teacher: Jane',
  location: 'Room 305',
  start: '2026-01-02T10:00:00Z',
  end: '2026-01-02T11:00:00Z',
};

describe('buildICS', () => {
  it('wraps a single VEVENT in a VCALENDAR', () => {
    const ics = buildICS(event);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VEVENT');
  });

  it('uses CRLF line endings and a trailing CRLF (RFC 5545)', () => {
    const ics = buildICS(event);
    expect(ics).toContain('\r\n');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('emits UTC DATE-TIME for start/end', () => {
    const ics = buildICS(event);
    expect(ics).toContain('DTSTART:20260102T100000Z');
    expect(ics).toContain('DTEND:20260102T110000Z');
  });

  it('builds a stable UID from the id', () => {
    expect(buildICS(event)).toContain('UID:sched-1@tms-v2');
  });

  it('escapes special TEXT characters (comma, semicolon, backslash, newline)', () => {
    const ics = buildICS({ ...event, title: 'A, B; C\\D\nE' });
    expect(ics).toContain('SUMMARY:A\\, B\\; C\\\\D\\nE');
  });

  it('omits DESCRIPTION/LOCATION lines when not provided', () => {
    const ics = buildICS({ id: 'x', title: 'T', start: event.start, end: event.end });
    expect(ics).not.toContain('DESCRIPTION:');
    expect(ics).not.toContain('LOCATION:');
  });
});

describe('downloadICS', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates a blob URL, clicks a download link, and returns the URL', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const url = downloadICS(event);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(url).toBe('blob:mock-url');
  });

  it('sanitises the filename from the title', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
    const created = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        created.push(el);
        el.click = () => {};
      }
      return el;
    });

    downloadICS({ ...event, title: 'A/B C?' }, undefined);

    expect(created[0].download).toBe('A-B-C-.ics');
  });
});
