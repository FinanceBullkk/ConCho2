import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionWaitlistModal from '../SessionWaitlistModal';

let waitlistResult = { data: { data: [] }, isLoading: false };

vi.mock('../../../hooks/useLearning', () => ({
  useScheduleWaitlist: () => waitlistResult,
}));

const session = { scheduleId: 's1' };

describe('SessionWaitlistModal', () => {
  beforeEach(() => {
    waitlistResult = { data: { data: [] }, isLoading: false };
  });

  it('shows an empty state when nobody queued', () => {
    render(<SessionWaitlistModal session={session} onClose={vi.fn()} />);
    expect(screen.getByText('No one has joined this waitlist.')).toBeInTheDocument();
  });

  it('lists waiting entries with FIFO position and history rows without one', () => {
    waitlistResult = {
      isLoading: false,
      data: { data: [
        {
          _id: 'w1', position: 1, status: 'waiting',
          createdAt: '2026-07-01T03:00:00.000Z',
          userId: { name: 'Wai Ting', empCode: '000111' },
        },
        {
          _id: 'w2', position: null, status: 'promoted',
          createdAt: '2026-07-01T04:00:00.000Z',
          userId: { name: 'Pro Moted', empCode: '000112' },
        },
      ] },
    };
    render(<SessionWaitlistModal session={session} onClose={vi.fn()} />);

    expect(screen.getByText('Wai Ting')).toBeInTheDocument();
    expect(screen.getByText('(000111)')).toBeInTheDocument();
    expect(screen.getByText('Waiting')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // FIFO position
    // History row keeps its terminal status but no position.
    expect(screen.getByText('Pro Moted')).toBeInTheDocument();
    expect(screen.getByText('Promoted')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
