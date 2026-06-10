import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import FeedbackTab from '../FeedbackTab';

const cohorts = [
  { _id: 'c1', cohortCode: 'EL001', programName: 'English' },
];

const feedback = [
  {
    id: 'f1',
    cohortCode: 'EL001',
    learner: { name: 'Minh Nguyen', empCode: '000123' },
    rating: 5,
    contentRating: 4,
    instructorRating: 5,
    comment: 'Useful sessions',
  },
];

const state = { feedback };

vi.mock('../../../hooks/useLearning', () => ({
  useLearningCohorts: () => ({ data: { data: cohorts } }),
  useLearningFeedback: () => ({ data: { data: state.feedback }, isLoading: false }),
}));

describe('FeedbackTab', () => {
  it('renders submitted feedback rows for managers', () => {
    render(<FeedbackTab />);
    expect(screen.getByText('Minh Nguyen')).toBeInTheDocument();
    expect(screen.getByText('000123')).toBeInTheDocument();
    expect(screen.getByText('EL001')).toBeInTheDocument();
    expect(screen.getByText('Useful sessions')).toBeInTheDocument();
    expect(screen.getAllByText('5/5')).toHaveLength(2);
  });

  it('shows an empty state when no feedback exists', () => {
    state.feedback = [];
    render(<FeedbackTab />);
    expect(screen.getByText('No feedback yet')).toBeInTheDocument();
  });
});
