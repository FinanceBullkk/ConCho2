import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import GradingPage from '../GradingPage';

// Converge Phase 4 slice C2: the unified Grading workspace lists gradable units
// across both modes and opens each mode's native surface in place — quiz →
// ManualGradingModal, rubric → the class-scoped EvaluationPage.

const h = vi.hoisted(() => ({
  queue: { data: { quiz: [], rubric: [] }, isLoading: false },
  assessment: { data: { id: 'a1', items: [] }, isLoading: false },
  evalProps: vi.fn(),
}));

vi.mock('../useGrading', () => ({ useGradingQueue: () => h.queue }));
vi.mock('../../../hooks/useAssessment', () => ({ useAssessment: () => h.assessment }));
vi.mock('../../learning/ManualGradingModal', () => ({ default: () => <div data-testid="manual-grading-modal" /> }));
vi.mock('../../evaluations/EvaluationPage', () => ({
  default: (props) => { h.evalProps(props); return <div data-testid="evaluation-page" />; },
}));

const renderPage = () => render(<MemoryRouter><GradingPage /></MemoryRouter>);

beforeEach(() => {
  h.queue = { data: { quiz: [], rubric: [] }, isLoading: false };
  h.assessment = { data: { id: 'a1', items: [] }, isLoading: false };
  h.evalProps = vi.fn();
});

describe('GradingPage — unified grading workspace', () => {
  it('lists quiz units and rubric units', () => {
    h.queue = {
      data: {
        quiz: [{ id: 'q1', title: 'Writing Task', cohortCode: 'EL001', attemptCount: 3 }],
        rubric: [{ classId: 'c1', classCode: 'EL002', courseName: 'Business English', evaluatedCount: 2 }],
      },
      isLoading: false,
    };
    renderPage();
    expect(screen.getByText('Writing Task')).toBeInTheDocument();
    expect(screen.getByText('EL002')).toBeInTheDocument();
    expect(screen.getByText('Business English')).toBeInTheDocument();
  });

  it('opens the native manual-grading modal for a quiz unit', () => {
    h.queue = {
      data: { quiz: [{ id: 'q1', title: 'Writing Task', cohortCode: 'EL001', attemptCount: 1 }], rubric: [] },
      isLoading: false,
    };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    expect(screen.getByTestId('manual-grading-modal')).toBeInTheDocument();
  });

  it('opens the class-scoped EvaluationPage for a rubric unit', () => {
    h.queue = {
      data: { quiz: [], rubric: [{ classId: 'c1', classCode: 'EL002', courseName: 'Business English', evaluatedCount: 0 }] },
      isLoading: false,
    };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /grade/i }));
    expect(screen.getByTestId('evaluation-page')).toBeInTheDocument();
    // EvaluationPage is scoped to the chosen class (picker hidden by the prop).
    expect(h.evalProps).toHaveBeenCalledWith(expect.objectContaining({ classId: 'c1' }));
    expect(screen.getByRole('button', { name: /back to grading/i })).toBeInTheDocument();
  });

  it('shows empty states when there is nothing to grade', () => {
    renderPage();
    expect(screen.getByText(/no quizzes to review/i)).toBeInTheDocument();
    expect(screen.getByText(/no classes to evaluate/i)).toBeInTheDocument();
  });
});
