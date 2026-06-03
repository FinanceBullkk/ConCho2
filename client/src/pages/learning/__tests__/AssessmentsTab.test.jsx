import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssessmentsTab from '../AssessmentsTab';

const cohorts = [
  { _id: 'c1', cohortCode: 'EL001', programName: 'English' },
  { _id: 'c2', cohortCode: 'ONB001', programName: 'Onboarding' },
];

const assessments = [
  {
    id: 'a1',
    title: 'Safety quiz',
    description: 'Compliance basics',
    cohortId: 'c1',
    cohortCode: 'EL001',
    isPublished: true,
    itemCount: 3,
    passingScorePercent: 80,
    maxAttempts: 0,
    items: [
      {
        id: 'i1',
        type: 'single_choice',
        prompt: 'Pick one',
        options: ['A', 'B'],
        correctOptionIndexes: [0],
        points: 1,
      },
    ],
  },
];

const archive = vi.fn();
const update = vi.fn();
const roleState = { canManage: true };

vi.mock('../../../hooks/useLearning', () => ({
  useLearningCohorts: () => ({ data: { data: cohorts } }),
}));

vi.mock('../../../hooks/useAssessment', () => ({
  useAssessments: () => ({ data: { data: assessments }, isLoading: false }),
  useArchiveAssessment: () => ({ mutateAsync: archive, isPending: false }),
  useCreateAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAssessment: () => ({ mutateAsync: update, isPending: false }),
}));

vi.mock('../../../hooks/useRole', () => ({
  useRole: () => ({
    can: (permission) => permission === 'manage:assessment' && roleState.canManage,
  }),
}));

describe('AssessmentsTab', () => {
  beforeEach(() => {
    archive.mockReset();
    update.mockReset();
    roleState.canManage = true;
  });

  it('renders assessment rows and authoring action for Admin', () => {
    render(<AssessmentsTab />);
    expect(screen.getByText('Safety quiz')).toBeInTheDocument();
    expect(screen.getByText('Compliance basics')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new assessment/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit assessment/i })).toBeInTheDocument();
  });

  it('hides manager controls for read-only roles', () => {
    roleState.canManage = false;
    render(<AssessmentsTab />);
    expect(screen.getByText('Safety quiz')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new assessment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit assessment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
  });

  it('requires archive confirmation before calling the API', async () => {
    const user = userEvent.setup();
    render(<AssessmentsTab />);
    await user.click(screen.getByRole('button', { name: /archive/i }));
    expect(archive).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /confirm archive/i }));
    expect(archive).toHaveBeenCalledWith('a1');
  });

  it('opens the assessment editor and saves changes', async () => {
    const user = userEvent.setup();
    render(<AssessmentsTab />);
    await user.click(screen.getByRole('button', { name: /edit assessment/i }));
    expect(screen.getByRole('heading', { name: /edit assessment/i })).toBeInTheDocument();

    const title = screen.getByDisplayValue('Safety quiz');
    await user.clear(title);
    await user.type(title, 'Updated quiz');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      id: 'a1',
      data: expect.objectContaining({ title: 'Updated quiz', cohortId: 'c1' }),
    }));
  });
});
