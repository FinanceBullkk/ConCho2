jest.mock('../../services/calendarService', () => ({
  createEventForSchedule: jest.fn(),
  updateEventForSchedule: jest.fn(),
  deleteEventForSchedule: jest.fn(),
}));
jest.mock('../../lib/emailTemplates', () => ({
  sendBookingConfirmation: jest.fn().mockResolvedValue(null),
  sendClassCancellation: jest.fn().mockResolvedValue(null),
  sendSessionRescheduled: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../domains/notification/in-app-writer', () => ({
  recordInApp: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../domains/english-training/canonical-operations-repository.pg', () => ({
  getMeetingDeliveryContext: jest.fn(),
  setMeetingCalendarDetails: jest.fn().mockResolvedValue(undefined),
}));

const calendar = require('../../services/calendarService');
const email = require('../../lib/emailTemplates');
const { recordInApp } = require('../../domains/notification/in-app-writer');
const repository = require('../../domains/english-training/canonical-operations-repository.pg');
const delivery = require('../../domains/english-training/meeting-delivery');

const context = (overrides = {}) => ({
  meeting: {
    id: 'meeting-1', session_unit_id: 'unit-1', session_number: 3,
    class_code: 'EL001', course_name: 'Foundation', status: 'planned',
    starts_at: new Date('2099-07-22T02:00:00.000Z'), duration_minutes: 60,
    updated_at: new Date('2099-07-20T00:00:00.000Z'),
    google_event_id: null, cancellation_reason: null,
    ...overrides,
  },
  audience: [
    { employee_id: 'employee-1', user_id: 'user-1', email: 'one@example.com', full_name: 'Learner One' },
    { employee_id: 'employee-2', user_id: null, email: 'two@example.com', full_name: 'Managed Learner' },
  ],
});

describe('canonical English Meeting delivery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repository.getMeetingDeliveryContext.mockResolvedValue(context());
    calendar.createEventForSchedule.mockResolvedValue({ eventId: 'google-1', meetLink: 'https://meet.example/1' });
    calendar.updateEventForSchedule.mockResolvedValue({ eventId: 'google-1' });
    calendar.deleteEventForSchedule.mockResolvedValue(true);
  });

  test('creation emails the full roster, rings linked users, and creates a Calendar event', async () => {
    await delivery.notifyMeetingCreated('meeting-1');

    expect(calendar.createEventForSchedule).toHaveBeenCalledWith(expect.objectContaining({
      attendees: expect.arrayContaining([
        expect.objectContaining({ email: 'one@example.com' }),
        expect.objectContaining({ email: 'two@example.com' }),
      ]),
    }));
    expect(repository.setMeetingCalendarDetails).toHaveBeenCalledWith('meeting-1', {
      googleEventId: 'google-1', meetLink: 'https://meet.example/1',
    });
    expect(email.sendBookingConfirmation).toHaveBeenCalledTimes(2);
    expect(recordInApp).toHaveBeenCalledTimes(1);
    expect(recordInApp).toHaveBeenCalledWith(expect.objectContaining({
      type: 'english_session_scheduled', recipientUserId: 'user-1',
    }));
  });

  test('reschedule updates the existing Calendar event and sends old/new times', async () => {
    repository.getMeetingDeliveryContext.mockResolvedValue(context({ google_event_id: 'google-1' }));
    await delivery.notifyMeetingRescheduled(
      'meeting-1', '2099-07-21T02:00:00.000Z', 'PIC request',
    );

    expect(calendar.updateEventForSchedule).toHaveBeenCalled();
    expect(calendar.createEventForSchedule).not.toHaveBeenCalled();
    expect(email.sendSessionRescheduled).toHaveBeenCalledWith(expect.objectContaining({
      oldStartTime: '2099-07-21T02:00:00.000Z',
      newStartTime: new Date('2099-07-22T02:00:00.000Z'),
      reason: 'PIC request',
    }));
    expect(recordInApp).toHaveBeenCalledWith(expect.objectContaining({
      type: 'english_session_rescheduled',
    }));
  });

  test('cancellation removes the Calendar event and notifies the roster', async () => {
    repository.getMeetingDeliveryContext.mockResolvedValue(context({
      status: 'cancelled', google_event_id: 'google-1', cancellation_reason: 'Company event',
    }));
    await delivery.notifyMeetingCancelled('meeting-1', 'Admin User');

    expect(calendar.deleteEventForSchedule).toHaveBeenCalledWith('google-1');
    expect(email.sendClassCancellation).toHaveBeenCalledTimes(2);
    expect(email.sendClassCancellation).toHaveBeenCalledWith(expect.objectContaining({
      cancelledBy: 'Admin User',
    }));
    expect(recordInApp).toHaveBeenCalledWith(expect.objectContaining({
      type: 'english_session_cancelled',
    }));
  });
});
