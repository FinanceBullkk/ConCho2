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
      {
        id: 'i2',
        type: 'short_text',
        prompt: 'Explain why',
        acceptedAnswers: ['Because'],
        points: 2,
      },
    ],
  },
];

const attempts = [
  {
    id: 'att1',
    learner: { id: 'u1', name: 'Learner One', empCode: '000001' },
    score: 0,
    maxScore: 2,
    scorePercent: 0,
    passed: false,
    answers: [
      {
        itemId: 'i2',
        text: 'close enough',
        pointsEarned: 0,
        pointsPossible: 2,
        correct: false,
      },
    ],
  },
];

const questionBank = [
  {
    id: 'q1',
    type: 'single_choice',
    prompt: 'Reusable safety question',
    options: ['Yes', 'No'],
    correctOptionIndexes: [0],
    points: 2,
    tags: ['safety'],
  },
];

const archive = vi.fn();
const archiveQuestion = vi.fn();
const createQuestion = vi.fn();
const manualGrade = vi.fn();
const update = vi.fn();
const roleState = { canManage: true };

vi.mock('../../../hooks/useLearning', () => ({
  useLearningCohorts: () => ({ data: { data: cohorts } }),
}));

vi.mock('../../../hooks/useAssessment', () => ({
  useAssessments: () => ({ data: { data: assessments }, isLoading: false }),
  useAssessmentAttempts: () => ({ data: { data: attempts }, isLoading: false }),
  useArchiveAssessment: () => ({ mutateAsync: archive, isPending: false }),
  useManualGradeAttempt: () => ({ mutateAsync: manualGrade, isPending: false }),
  useQuestionBank: () => ({ data: { data: questionBank }, isLoading: false }),
  useArchiveQuestionBankItem: () => ({ mutateAsync: archiveQuestion, isPending: false }),
  useCreateQuestionBankItem: () => ({ mutateAsync: createQuestion, isPending: false }),
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
    archiveQuestion.mockReset();
    createQuestion.mockReset();
    manualGrade.mockReset();
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
    expect(screen.getByRole('button', { name: /review attempts/i })).toBeInTheDocument();
    expect(screen.getByText('Question Bank')).toBeInTheDocument();
    expect(screen.getByText('Reusable safety question')).toBeInTheDocument();
  });

  it('hides manager controls for read-only roles', () => {
    roleState.canManage = false;
    render(<AssessmentsTab />);
    expect(screen.getByText('Safety quiz')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new assessment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit assessment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review attempts/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Question Bank')).not.toBeInTheDocument();
  });

  it('requires archive confirmation before calling the API', async () => {
    const user = userEvent.setup();
    render(<AssessmentsTab />);
    await user.click(screen.getAllByRole('button', { name: /archive/i })[0]);
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

  it('imports selected bank questions when saving an assessment', async () => {
    const user = userEvent.setup();
    render(<AssessmentsTab />);
    await user.click(screen.getByRole('button', { name: /edit assessment/i }));
    await user.click(screen.getByRole('checkbox', { name: /reusable safety question/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ questionBankItemIds: ['q1'] }),
    }));
  });

  it('creates a bank question from the panel', async () => {
    const user = userEvent.setup();
    render(<AssessmentsTab />);
    await user.click(screen.getByRole('button', { name: /new question/i }));
    await user.clear(screen.getByLabelText(/prompt/i));
    await user.type(screen.getByLabelText(/prompt/i), 'Reusable grammar question');
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(createQuestion).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'Reusable grammar question',
      type: 'single_choice',
    }));
  });

  it('reviews a short-text attempt and saves manual score', async () => {
    const user = userEvent.setup();
    render(<AssessmentsTab />);
    await user.click(screen.getByRole('button', { name: /review attempts/i }));
    expect(screen.getByText('Learner One')).toBeInTheDocument();

    const score = screen.getByLabelText(/explain why points/i);
    await user.clear(score);
    await user.type(score, '2');
    await user.type(screen.getByLabelText(/explain why review note/i), 'Accepted');
    await user.click(screen.getByRole('button', { name: /save review/i }));

    expect(manualGrade).toHaveBeenCalledWith({
      attemptId: 'att1',
      answers: [{ itemId: 'i2', pointsEarned: 2, note: 'Accepted' }],
    });
  });

  it('blocks invalid manual scores before saving', async () => {
    const user = userEvent.setup();
    render(<AssessmentsTab />);
    await user.click(screen.getByRole('button', { name: /review attempts/i }));
    const score = screen.getByLabelText(/explain why points/i);
    await user.clear(score);
    await user.type(score, '3');
    await user.click(screen.getByRole('button', { name: /save review/i }));

    expect(screen.getByText(/score must be between/i)).toBeInTheDocument();
    expect(manualGrade).not.toHaveBeenCalled();
  });
});
