import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyFeedbackPage from '../MyFeedbackPage';

const feedback = [
  {
    id: 'f1',
    cohortId: 'c1',
    rating: 4,
    contentRating: 5,
    instructorRating: 4,
    comment: 'Helpful class',
  },
];

vi.mock('../../hooks/useLearning', () => ({
  useLearningEnrollments: () => ({
    data: {
      data: [
        { cohortId: 'c1', cohortCode: 'EL001', status: 'Active' },
        { cohortId: 'dropped', cohortCode: 'OLD001', status: 'Dropped' },
      ],
    },
    isLoading: false,
  }),
  useLearningFeedback: () => ({ data: { data: feedback }, isLoading: false }),
  useSubmitFeedback: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../hooks/useSchedules', () => ({
  useMyClassSchedules: () => ({
    data: {
      data: [
        {
          classId: { _id: 'c2', classCode: 'EL002', courseName: 'Communication' },
        },
      ],
    },
    isLoading: false,
  }),
}));

describe('MyFeedbackPage', () => {
  it('shows active feedback cohorts from enrollments and schedules', () => {
    render(<MyFeedbackPage />);
    expect(screen.getByText('EL001')).toBeInTheDocument();
    expect(screen.getByText('EL002')).toBeInTheDocument();
    expect(screen.queryByText('OLD001')).not.toBeInTheDocument();
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText(/overall rating/i)).toHaveTextContent('4/5');
  });

  it('opens the feedback modal from a cohort card', async () => {
    const user = userEvent.setup();
    render(<MyFeedbackPage />);
    await user.click(screen.getByRole('button', { name: /submit feedback/i }));
    expect(screen.getByRole('heading', { name: 'Submit feedback' })).toBeInTheDocument();
    expect(screen.getAllByText(/EL002/)).toHaveLength(2);
  });
});
