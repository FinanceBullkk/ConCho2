import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyLearningCatalogPage from '../MyLearningCatalogPage';

const mutateAsync = vi.fn();

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../hooks/useLearning', () => ({
  useLearningPrograms: () => ({
    data: {
      data: [
        {
          _id: 'p1',
          code: 'SAFE',
          name: 'Safety Basics',
          description: 'Required onboarding course',
          category: 'compliance',
          deliveryMode: 'online',
          schedulingMode: 'self_enroll',
          defaultSessionCount: 2,
        },
        {
          _id: 'p2',
          code: 'MGR',
          name: 'Manager Nomination',
          category: 'soft_skills',
          deliveryMode: 'online',
          schedulingMode: 'nomination',
          defaultSessionCount: 1,
        },
      ],
    },
    isLoading: false,
  }),
  useLearningCohorts: () => ({
    data: {
      data: [
        { _id: 'c1', programId: 'p1', cohortCode: 'SAFE-01', totalSessions: 2, bookedSessions: 0, status: 'Ongoing' },
        { _id: 'c2', programId: 'p1', cohortCode: 'SAFE-02', totalSessions: 2, bookedSessions: 1, status: 'Ongoing' },
        { _id: 'c3', programId: 'p2', cohortCode: 'MGR-01', totalSessions: 1, bookedSessions: 0, status: 'Ongoing' },
      ],
    },
    isLoading: false,
  }),
  useLearningEnrollments: () => ({
    data: { data: [{ id: 'e1', cohortId: 'c2', status: 'Active' }] },
    isLoading: false,
  }),
  useEnrollLearner: () => ({ mutateAsync, isPending: false }),
}));

describe('MyLearningCatalogPage', () => {
  it('shows only self-enroll cohorts and marks existing enrollment', () => {
    render(<MyLearningCatalogPage />);

    expect(screen.getAllByText('Safety Basics')).toHaveLength(2);
    expect(screen.getByText((_, node) => node.textContent === 'SAFE · SAFE-01')).toBeInTheDocument();
    expect(screen.getByText((_, node) => node.textContent === 'SAFE · SAFE-02')).toBeInTheDocument();
    expect(screen.queryByText('Manager Nomination')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enrolled/i })).toBeDisabled();
  });

  it('filters by search and submits enrollment payload', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValueOnce({});

    render(<MyLearningCatalogPage />);
    await user.type(screen.getByPlaceholderText(/search programs/i), 'SAFE-01');

    expect(screen.getByText((_, node) => node.textContent === 'SAFE · SAFE-01')).toBeInTheDocument();
    expect(screen.queryByText((_, node) => node.textContent === 'SAFE · SAFE-02')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^enroll$/i }));
    expect(mutateAsync).toHaveBeenCalledWith({ cohortId: 'c1' });
  });
});
