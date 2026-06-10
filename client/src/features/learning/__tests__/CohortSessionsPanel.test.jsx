import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CohortSessionsPanel from '../CohortSessionsPanel';

let sessionsResult = { data: { data: [] }, isLoading: false };
let canImpl = () => true;

vi.mock('../../../hooks/useLearning', () => ({
  useLearningSessions: () => sessionsResult,
}));

vi.mock('../../../hooks/useRole', () => ({
  useRole: () => ({ can: (p) => canImpl(p) }),
}));

// Stub the modal so the panel test stays shallow (the modal has its own suite).
vi.mock('../AssignTrainersModal', () => ({
  default: ({ session, onClose }) => (
    <div data-testid="trainers-modal">
      trainers:{session.scheduleId}
      <button type="button" onClick={onClose}>close</button>
    </div>
  ),
}));

const cohort = { _id: 'c1', cohortCode: 'SE-2026', programName: 'Safety' };
const session = {
  _id: 's1', scheduleId: 's1', startTime: '2026-07-15T03:00:00.000Z',
  office: { name: 'HCM Office' }, room: { name: 'Room A1' },
  sessionInstructors: [{ _id: 't1', name: 'Tina Teacher' }],
  externalTrainer: { name: 'Vera Vendor', org: 'ACME' },
};

describe('CohortSessionsPanel', () => {
  beforeEach(() => {
    canImpl = () => true;
    sessionsResult = { data: { data: [] }, isLoading: false };
  });

  it('lists sessions with internal + external trainer chips and the location', () => {
    sessionsResult = { data: { data: [session] }, isLoading: false };
    render(<CohortSessionsPanel cohort={cohort} onBack={vi.fn()} />);

    expect(screen.getByText('Tina Teacher')).toBeInTheDocument();
    expect(screen.getByText(/Vera Vendor/)).toBeInTheDocument();
    expect(screen.getByText(/HCM Office/)).toBeInTheDocument();
  });

  it('opens the trainers modal from the Trainers action', async () => {
    sessionsResult = { data: { data: [session] }, isLoading: false };
    const user = userEvent.setup();
    render(<CohortSessionsPanel cohort={cohort} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /trainers/i }));
    expect(screen.getByTestId('trainers-modal')).toHaveTextContent('trainers:s1');
  });

  it('hides the Trainers action when the viewer cannot assign trainers', () => {
    canImpl = (p) => p !== 'assign:trainer';
    sessionsResult = { data: { data: [session] }, isLoading: false };
    render(<CohortSessionsPanel cohort={cohort} onBack={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /trainers/i })).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no sessions', () => {
    sessionsResult = { data: { data: [] }, isLoading: false };
    render(<CohortSessionsPanel cohort={cohort} onBack={vi.fn()} />);

    expect(screen.getByText('No sessions yet')).toBeInTheDocument();
  });
});
