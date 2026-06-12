import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MyProgramPage from '../MyProgramPage';

// Cohesion P1 — learner program home. The page is pure composition over
// self-scoped reads; these tests cover the checklist met/unmet rendering,
// certificate states, and the quiz/feedback CTAs.

const h = vi.hoisted(() => ({
  completion: { data: null, isLoading: false, isError: false },
  certificates: { data: [] },
  sessions: { data: { data: [] }, isLoading: false },
}));

vi.mock('../../../hooks/useLearning', () => ({
  useCompletion: () => h.completion,
  useCertificates: () => h.certificates,
  useLearningSessions: () => h.sessions,
}));

const baseCompletion = {
  cohortId: 'c1',
  programName: 'Data Privacy Basics',
  cohortCode: 'LD001',
  complete: false,
  attendance: { attendedSessions: 3, totalSessions: 4, percent: 75, thresholdPercent: 75, met: true },
  assessment: { required: true, met: false, averageScore: null, attemptScorePercent: null },
  feedback: { required: true, met: true, submitted: true },
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/me/programs/c1']}>
      <Routes>
        <Route path="/me/programs/:cohortId" element={<MyProgramPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('MyProgramPage — learner program home (Cohesion P1)', () => {
  it('renders the checklist with met/unmet rows and a Take-quiz CTA', () => {
    h.completion = { data: baseCompletion, isLoading: false, isError: false };
    h.certificates = { data: [] };
    renderPage();

    expect(screen.getByText('Data Privacy Basics')).toBeInTheDocument();
    expect(screen.getByText(/3\/4 sessions attended \(75% · required 75%\)/)).toBeInTheDocument();
    // Unmet assessment → CTA into /me/assessments
    expect(screen.getByRole('link', { name: /take quiz/i })).toHaveAttribute('href', '/me/assessments');
    // Met feedback → no CTA, submitted copy
    expect(screen.getByText('Feedback submitted')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /give feedback/i })).toBeNull();
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('shows the issued certificate number and badge', () => {
    h.completion = { data: { ...baseCompletion, complete: true, assessment: { required: true, met: true } }, isLoading: false, isError: false };
    h.certificates = {
      data: [{
        id: 'cert1', certificateNumber: 'CERT-2026-000123', certificateState: 'issued',
        issuedAt: '2026-06-01T00:00:00Z', validUntil: null,
      }],
    };
    renderPage();

    expect(screen.getByText('CERT-2026-000123')).toBeInTheDocument();
    expect(screen.getByText('Certificate issued')).toBeInTheDocument();
    expect(screen.getByText('Requirements complete')).toBeInTheDocument();
  });

  it('explains the pending certificate when complete but not yet issued', () => {
    h.completion = { data: { ...baseCompletion, complete: true }, isLoading: false, isError: false };
    h.certificates = { data: [] };
    renderPage();

    expect(screen.getByText(/certificate will appear here once issued/i)).toBeInTheDocument();
  });

  it('lists upcoming sessions for the cohort', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    h.completion = { data: baseCompletion, isLoading: false, isError: false };
    h.sessions = { data: { data: [{ id: 's1', startTime: future, office: { name: 'HCM Office' } }] }, isLoading: false };
    renderPage();

    expect(screen.getByText('HCM Office')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /all sessions/i })).toHaveAttribute('href', '/me/sessions');
  });

  it('falls back to the unavailable panel on error', () => {
    h.completion = { data: null, isLoading: false, isError: true };
    h.sessions = { data: { data: [] }, isLoading: false };
    renderPage();

    expect(screen.getByText(/progress unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to my programs/i })).toHaveAttribute('href', '/me/programs');
  });
});
