import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssessmentAttemptModal from '../AssessmentAttemptModal';

const h = vi.hoisted(() => ({ submit: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../../../hooks/useAssessment', () => ({
  useSubmitAssessmentAttempt: () => ({ mutateAsync: h.submit, isPending: false }),
}));

const assessment = {
  id: 'a1',
  title: 'Module 1 Quiz',
  timeLimitMinutes: 5,
  shuffleQuestions: false,
  showAnswersAfter: false,
  items: [
    { id: 'q1', type: 'single_choice', prompt: '2+2?', points: 1, options: ['3', '4'] },
    { id: 'q2', type: 'short_text', prompt: 'Why?', points: 2, options: [] },
  ],
};

beforeEach(() => { h.submit.mockReset(); h.submit.mockResolvedValue({ passed: true }); });

describe('AssessmentAttemptModal — exam runner', () => {
  it('shows a countdown timer when a time limit is set, plus the answered counter', () => {
    render(<AssessmentAttemptModal assessment={assessment} onClose={vi.fn()} />);
    expect(screen.getByTestId('exam-timer')).toHaveTextContent('05:00');
    expect(screen.getByTestId('answered-count')).toBeInTheDocument();
  });

  it('hides the timer when there is no time limit', () => {
    render(<AssessmentAttemptModal assessment={{ ...assessment, timeLimitMinutes: 0 }} onClose={vi.fn()} />);
    expect(screen.queryByTestId('exam-timer')).not.toBeInTheDocument();
  });

  it('preview mode does not submit to the server and closes on finish', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AssessmentAttemptModal assessment={assessment} preview onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'learning.assessments.finishPreview' }));
    expect(h.submit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
