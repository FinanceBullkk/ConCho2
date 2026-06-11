import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MySessionsPage from '../MySessionsPage';

const join = vi.fn();
const leave = vi.fn();
let sessionsResult = { data: { data: [] }, isLoading: false };
let mineResult = { data: { data: [] } };

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'me1', role: 'Participant' } }),
}));

vi.mock('../../../hooks/useLearning', () => ({
  useLearningSessions: () => sessionsResult,
}));

vi.mock('../useWaitlist', () => ({
  useMyWaitlist: () => mineResult,
  useJoinWaitlist: () => ({ mutateAsync: join, isPending: false }),
  useLeaveWaitlist: () => ({ mutateAsync: leave, isPending: false }),
}));

const future = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
const baseSession = {
  _id: 's1', startTime: future,
  cohort: { cohortCode: 'SE-2026', programName: 'Safety' },
  office: { name: 'HCM Office' }, room: null,
  enrolledLearners: [], enrolledLearnerCount: 1, effectiveCapacity: 1,
};

describe('MySessionsPage', () => {
  beforeEach(() => {
    join.mockReset(); join.mockResolvedValue({ position: 1 });
    leave.mockReset(); leave.mockResolvedValue({});
    sessionsResult = { data: { data: [] }, isLoading: false };
    mineResult = { data: { data: [] } };
  });

  it('offers Join waitlist on a FULL session I am not enrolled in, and joins', async () => {
    sessionsResult = { data: { data: [baseSession] }, isLoading: false };
    const user = userEvent.setup();
    render(<MySessionsPage />);

    const btn = screen.getByRole('button', { name: /join waitlist/i });
    await user.click(btn);
    expect(join).toHaveBeenCalledWith('s1');
  });

  it('shows my queue position + Leave when I am waiting', async () => {
    sessionsResult = { data: { data: [baseSession] }, isLoading: false };
    mineResult = { data: { data: [{ _id: 'w1', scheduleId: { _id: 's1' }, position: 2 }] } };
    const user = userEvent.setup();
    render(<MySessionsPage />);

    expect(screen.getByText(/waiting #2/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /leave/i }));
    expect(leave).toHaveBeenCalledWith('s1');
  });

  it('shows Enrolled (no join button) when I am on the roster', () => {
    sessionsResult = {
      data: { data: [{ ...baseSession, enrolledLearners: [{ _id: 'me1' }] }] },
      isLoading: false,
    };
    render(<MySessionsPage />);

    expect(screen.getByText('Enrolled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join waitlist/i })).not.toBeInTheDocument();
  });

  it('a session with free seats offers no join (waitlist is full-only)', () => {
    sessionsResult = {
      data: { data: [{ ...baseSession, effectiveCapacity: 3 }] },
      isLoading: false,
    };
    render(<MySessionsPage />);

    expect(screen.queryByRole('button', { name: /join waitlist/i })).not.toBeInTheDocument();
    expect(screen.getByText(/ask your coordinator/i)).toBeInTheDocument();
  });
});
