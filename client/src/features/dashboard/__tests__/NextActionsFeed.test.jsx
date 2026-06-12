import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import NextActionsFeed from '../NextActionsFeed';

// Cohesion P2+P3 — the "what should I do next?" feed is pure client
// composition; these tests cover each action source, the one-click enroll
// CTA for required assignments, and the caught-up state.

const h = vi.hoisted(() => ({
  assessments: { data: { data: [] } },
  attempts: { data: { data: [] } },
  enrollments: { data: { data: [] } },
  feedback: { data: { data: [] } },
  schedules: { data: { data: [] } },
  waitlist: { data: { data: [] } },
  myAssignments: { data: { data: [] } },
  mutateAsync: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../hooks/useAssessment', () => ({
  useAssessments: () => h.assessments,
  useAssessmentAttempts: () => h.attempts,
}));
vi.mock('../../../hooks/useLearning', () => ({
  useLearningEnrollments: () => h.enrollments,
  useLearningFeedback: () => h.feedback,
  useMyAssignments: () => h.myAssignments,
  useEnrollLearner: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));
vi.mock('../../../hooks/useSchedules', () => ({
  useMyClassSchedules: () => h.schedules,
}));
vi.mock('../../learner/useWaitlist', () => ({
  useMyWaitlist: () => h.waitlist,
}));

const renderFeed = () =>
  render(
    <MemoryRouter>
      <NextActionsFeed />
    </MemoryRouter>,
  );

describe('NextActionsFeed (Cohesion P2)', () => {
  it('surfaces unpassed quizzes, pending feedback, and waitlist positions', () => {
    h.enrollments = { data: { data: [
      { id: 'e1', cohortId: 'c1', cohortCode: 'LD001', status: 'Active' },
      { id: 'e2', cohortId: 'c2', cohortCode: 'LD002', status: 'Active' },
    ] } };
    h.assessments = { data: { data: [
      { id: 'a1', cohortId: 'c1', title: 'Privacy basics quiz' },
      { id: 'a2', cohortId: 'c2', title: 'Passed quiz' },
      { id: 'a3', cohortId: 'other', title: 'Not my cohort' },
    ] } };
    h.attempts = { data: { data: [
      { assessmentId: 'a2', passed: true, submittedAt: '2026-06-01T00:00:00Z' },
    ] } };
    h.feedback = { data: { data: [{ cohortId: 'c2' }] } };
    h.waitlist = { data: { data: [{ _id: 'w1', scheduleId: 's9', position: 2 }] } };
    renderFeed();

    expect(screen.getByText('Take quiz: Privacy basics quiz')).toBeInTheDocument();
    expect(screen.queryByText('Take quiz: Passed quiz')).toBeNull();
    expect(screen.queryByText(/not my cohort/i)).toBeNull();
    // c1 has no feedback yet; c2 already submitted
    expect(screen.getByText('Give feedback · LD001')).toBeInTheDocument();
    expect(screen.queryByText('Give feedback · LD002')).toBeNull();
    expect(screen.getByText('Waiting #2 on a full session')).toBeInTheDocument();
    // Links route into the right /me surfaces
    expect(screen.getByRole('link', { name: /take quiz: privacy/i })).toHaveAttribute('href', '/me/assessments');
    expect(screen.getByRole('link', { name: /waiting #2/i })).toHaveAttribute('href', '/me/sessions');
  });

  it('shows the caught-up state when nothing is pending', () => {
    h.enrollments = { data: { data: [{ id: 'e1', cohortId: 'c1', cohortCode: 'LD001', status: 'Active' }] } };
    h.assessments = { data: { data: [] } };
    h.attempts = { data: { data: [] } };
    h.feedback = { data: { data: [{ cohortId: 'c1' }] } };
    h.waitlist = { data: { data: [] } };
    h.myAssignments = { data: { data: [] } };
    renderFeed();

    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it('required assignment with a resolved cohort enrolls in one click (P3)', async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockResolvedValueOnce({});
    h.enrollments = { data: { data: [] } };
    h.assessments = { data: { data: [] } };
    h.attempts = { data: { data: [] } };
    h.feedback = { data: { data: [] } };
    h.waitlist = { data: { data: [] } };
    h.myAssignments = { data: { data: [
      { id: 'as1', title: 'Data privacy training', status: 'not_started', dueDate: '2026-07-01', enrollableCohortId: 'c9' },
      { id: 'as2', title: 'Done already', status: 'complete', dueDate: '2026-07-01', enrollableCohortId: null },
    ] } };
    renderFeed();

    expect(screen.getByText(/Required: Data privacy training/)).toBeInTheDocument();
    expect(screen.queryByText(/done already/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: /^enroll$/i }));
    expect(h.mutateAsync).toHaveBeenCalledWith({ cohortId: 'c9' });
  });

  it('overdue assignment without enroll path links to the catalog', () => {
    h.myAssignments = { data: { data: [
      { id: 'as3', title: 'Old mandatory course', status: 'overdue', dueDate: '2026-05-01', enrollableCohortId: null },
    ] } };
    renderFeed();

    const link = screen.getByRole('link', { name: /overdue: old mandatory course/i });
    expect(link).toHaveAttribute('href', '/me/catalog');
  });
});
