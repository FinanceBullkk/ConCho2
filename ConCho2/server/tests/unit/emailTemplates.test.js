/**
 * Unit tests — emailTemplates module.
 *
 * Covers two concerns:
 *   1. Template generators return the expected subject + bodies.
 *   2. Public senders no-op cleanly when:
 *        - `to` is missing
 *        - the underlying sendMail throws (fail-soft)
 *      and never rethrow.
 */

jest.mock('../../lib/mailer', () => ({
  sendMail: jest.fn(),
}));

const { sendMail } = require('../../lib/mailer');
const {
  sendBookingConfirmation,
  sendClassCancellation,
  sendScheduleReminder,
  sendEnrollmentDropped,
  sendEnrollmentTransferred,
  _templates,
} = require('../../lib/emailTemplates');

beforeEach(() => {
  sendMail.mockReset();
});

// ── Pure templates ────────────────────────────────────────

describe('templates', () => {
  test('booking confirmation includes user name + class', () => {
    const t = _templates.tplBookingConfirmation({
      userName: 'Anh', className: 'EL001 — Foundation', dateStr: 'Mon 1 June',
    });
    expect(t.subject).toMatch(/Booking Confirmed/);
    expect(t.text).toContain('Anh');
    expect(t.text).toContain('EL001 — Foundation');
    expect(t.html).toContain('<strong>Anh</strong>');
  });

  test('class cancellation mentions canceller when provided', () => {
    const t = _templates.tplClassCancellation({
      userName: 'Bao', className: 'EL002', dateStr: 'Tue', cancelledBy: 'Admin User',
    });
    expect(t.subject).toMatch(/Cancelled/);
    expect(t.text).toContain('Admin User');
    expect(t.html).toContain('<strong>Admin User</strong>');
  });

  test('schedule reminder omits roomLink line when not provided', () => {
    const t = _templates.tplScheduleReminder({
      userName: 'Cuong', className: 'EL003', dateStr: 'Wed',
    });
    expect(t.text).not.toMatch(/Join link/);
    expect(t.html).not.toMatch(/Join link/);
  });

  test('schedule reminder includes roomLink line when provided', () => {
    const t = _templates.tplScheduleReminder({
      userName: 'Cuong', className: 'EL003', dateStr: 'Wed',
      roomLink: 'https://meet.google.com/abc',
    });
    expect(t.text).toContain('https://meet.google.com/abc');
    expect(t.html).toContain('https://meet.google.com/abc');
  });

  test('enrollment dropped without course name skips parens', () => {
    const t = _templates.tplEnrollmentDropped({
      userName: 'Dung', teamName: 'Alpha',
    });
    expect(t.subject).toContain('Alpha');
    expect(t.text).not.toMatch(/\(/);
  });

  test('enrollment transferred renders both team names + optional note', () => {
    const t = _templates.tplEnrollmentTransferred({
      userName: 'Em', fromTeamName: 'A', toTeamName: 'B', toCourseName: 'Comm 1', note: 'level up',
    });
    expect(t.subject).toContain('B');
    expect(t.text).toContain('A');
    expect(t.text).toContain('B');
    expect(t.text).toContain('Comm 1');
    expect(t.text).toContain('level up');
  });
});

// ── Public senders ────────────────────────────────────────

describe('senders', () => {
  test('sendBookingConfirmation calls sendMail with composed payload', async () => {
    sendMail.mockResolvedValueOnce({ messageId: 'x' });
    await sendBookingConfirmation({
      to: 'a@b.com', userName: 'Anh', className: 'EL001', startTime: new Date('2026-06-01T03:00:00Z'),
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe('a@b.com');
    expect(arg.subject).toMatch(/Booking Confirmed/);
    expect(arg.text).toContain('Anh');
  });

  test('no-ops silently when `to` is missing', async () => {
    const result = await sendBookingConfirmation({
      userName: 'Anh', className: 'X', startTime: new Date(),
    });
    expect(result).toBeNull();
    expect(sendMail).not.toHaveBeenCalled();
  });

  test('fail-soft: swallows sendMail errors and returns null', async () => {
    sendMail.mockRejectedValueOnce(new Error('SMTP boom'));
    const result = await sendClassCancellation({
      to: 'a@b.com', userName: 'X', className: 'C', startTime: new Date(), cancelledBy: 'Y',
    });
    expect(result).toBeNull();
  });

  test('sendEnrollmentDropped forwards team + course name', async () => {
    sendMail.mockResolvedValueOnce({ messageId: 'y' });
    await sendEnrollmentDropped({
      to: 'a@b.com', userName: 'Anh', teamName: 'Alpha', courseName: 'Foundation',
    });
    const arg = sendMail.mock.calls[0][0];
    expect(arg.subject).toContain('Alpha');
    expect(arg.text).toContain('Foundation');
  });

  test('sendEnrollmentTransferred forwards both team names', async () => {
    sendMail.mockResolvedValueOnce({ messageId: 'z' });
    await sendEnrollmentTransferred({
      to: 'a@b.com', userName: 'Anh', fromTeamName: 'A', toTeamName: 'B',
    });
    const arg = sendMail.mock.calls[0][0];
    expect(arg.text).toContain('A');
    expect(arg.text).toContain('B');
  });

  test('sendScheduleReminder forwards roomLink when supplied', async () => {
    sendMail.mockResolvedValueOnce({ messageId: 'r' });
    await sendScheduleReminder({
      to: 'a@b.com', userName: 'X', className: 'C',
      startTime: new Date(), roomLink: 'https://meet.example/abc',
    });
    const arg = sendMail.mock.calls[0][0];
    expect(arg.text).toContain('https://meet.example/abc');
  });
});
