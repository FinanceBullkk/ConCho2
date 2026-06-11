import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyAssessmentsPage from '../MyAssessmentsPage';

const assessments = [
  {
    id: 'a1',
    title: 'Safety quiz',
    description: 'Basics',
    cohortId: 'c1',
    cohortCode: 'EL001',
    itemCount: 1,
    passingScorePercent: 70,
    items: [
      { id: 'i1', type: 'single_choice', prompt: 'Pick one', options: ['A', 'B'], points: 1 },
    ],
  },
  {
    id: 'a2',
    title: 'Other cohort quiz',
    cohortId: 'other',
    cohortCode: 'X001',
    itemCount: 1,
    passingScorePercent: 70,
    items: [],
  },
];

vi.mock('../../../hooks/useAssessment', () => ({
  useAssessments: () => ({ data: { data: assessments }, isLoading: false }),
  useAssessmentAttempts: () => ({
    data: {
      data: [
        {
          assessmentId: 'a1',
          scorePercent: 90,
          passed: true,
          submittedAt: '2026-06-03T01:00:00.000Z',
        },
      ],
    },
    isLoading: false,
  }),
  useSubmitAssessmentAttempt: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../hooks/useLearning', () => ({
  useLearningEnrollments: () => ({ data: { data: [{ cohortId: 'c1', status: 'Active' }] }, isLoading: false }),
}));

vi.mock('../../../hooks/useSchedules', () => ({
  useMyClassSchedules: () => ({ data: { data: [] }, isLoading: false }),
}));

describe('MyAssessmentsPage', () => {
  it('shows only assessments for the learner cohorts', () => {
    render(<MyAssessmentsPage />);
    expect(screen.getByText('Safety quiz')).toBeInTheDocument();
    expect(screen.queryByText('Other cohort quiz')).not.toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(screen.getByText(/latest score/i)).toHaveTextContent('90%');
  });

  it('opens the attempt modal from the card action', async () => {
    const user = userEvent.setup();
    render(<MyAssessmentsPage />);
    await user.click(screen.getByRole('button', { name: /retake assessment/i }));
    expect(screen.getByRole('heading', { name: 'Safety quiz' })).toBeInTheDocument();
    expect(screen.getByText(/pick one/i)).toBeInTheDocument();
  });
});
