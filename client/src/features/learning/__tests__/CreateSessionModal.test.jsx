import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateSessionModal from '../CreateSessionModal';

const book = vi.fn();
const onClose = vi.fn();

vi.mock('../../../hooks/useLearning', () => ({
  useBookSession: () => ({ mutateAsync: book, isPending: false }),
}));

vi.mock('../../../hooks/useOrg', () => ({
  useOffices: () => ({ data: [{ _id: 'o1', name: 'HCM Office', code: 'HCM' }] }),
}));

// Office-scoped rooms (Phase 3) — one room in office o1.
vi.mock('../../../features/rooms/useRooms', () => ({
  useRooms: () => ({ data: [{ _id: 'r1', name: 'Room A1', code: 'HCM-A1' }] }),
}));

// One configured slot: 10:00–11:00 VN. offsetMinutes 420 (+07:00).
vi.mock('../../../hooks/useSchedulingConfig', () => ({
  DEFAULT_UTC_OFFSET_MINUTES: 420,
  useSchedulingConfig: () => ({
    data: {
      utcOffsetMinutes: 420,
      slots: [{ id: '10:00-11:00', label: '10:00-11:00', startHour: 10, startMinute: 0, endHour: 11, endMinute: 0, durationMinutes: 60 }],
    },
  }),
}));

const cohort = { _id: 'c1', cohortCode: 'SE-2026', programName: 'Safety', program: { schedulingMode: 'self_enroll' } };

describe('CreateSessionModal', () => {
  beforeEach(() => {
    book.mockReset();
    book.mockResolvedValue({});
    onClose.mockReset();
  });

  it('submits cohortId + officeId + an exact UTC range built from the picked day/slot', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal cohort={cohort} onClose={onClose} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Office' }), 'o1');
    const dateInput = screen.getByLabelText('Date');
    await user.clear(dateInput);
    await user.type(dateInput, '2026-07-15');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Time slot' }), '10:00-11:00');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(book).toHaveBeenCalledTimes(1);
    const payload = book.mock.calls[0][0];
    expect(payload.cohortId).toBe('c1');
    expect(payload.officeId).toBe('o1');
    // 10:00 VN (+07:00) on 2026-07-15 == 03:00Z; 11:00 VN == 04:00Z.
    expect(payload.startTime).toBe('2026-07-15T03:00:00.000Z');
    expect(payload.endTime).toBe('2026-07-15T04:00:00.000Z');
    expect(onClose).toHaveBeenCalled();
  });

  it('includes the picked Office-scoped roomId in the payload', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal cohort={cohort} onClose={onClose} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Office' }), 'o1');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Room' }), 'r1');
    const dateInput = screen.getByLabelText('Date');
    await user.clear(dateInput);
    await user.type(dateInput, '2026-07-15');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Time slot' }), '10:00-11:00');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(book).toHaveBeenCalledTimes(1);
    expect(book.mock.calls[0][0].roomId).toBe('r1');
  });

  it('blocks submit and shows an error when no office is chosen', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal cohort={cohort} onClose={onClose} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Time slot' }), '10:00-11:00');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(book).not.toHaveBeenCalled();
    expect(screen.getByText('Please choose an office.')).toBeInTheDocument();
  });
});
