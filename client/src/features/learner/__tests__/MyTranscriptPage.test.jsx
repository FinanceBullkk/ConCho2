import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MyTranscriptPage from '../MyTranscriptPage';

// Cohesion P6 — learner transcript is pure client composition over existing
// self-scoped reads; these cover the composed sections + the print action.

const h = vi.hoisted(() => ({
  enrollments: { data: { data: [] } },
  cohorts: { data: { data: [] } },
  certificates: { data: [] },
  results: { data: { data: [] } },
  attendance: { data: undefined },
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Lan Pham', empCode: '000123' } }),
}));
vi.mock('../../../hooks/useLearning', () => ({
  useLearningEnrollments: () => h.enrollments,
  useLearningCohorts: () => h.cohorts,
  useCertificates: () => h.certificates,
}));
vi.mock('../../../hooks/useAssessment', () => ({
  useMyAssessmentResults: () => h.results,
}));
vi.mock('../../../hooks/useAttendance', () => ({
  useMyAttendanceStats: () => h.attendance,
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <MyTranscriptPage />
    </MemoryRouter>,
  );

describe('MyTranscriptPage (Cohesion P6)', () => {
  it('composes programs + certificate, attendance, and only passed results (quiz + evaluation, Phase 1 convergence)', () => {
    h.enrollments = { data: { data: [{ id: 'e1', cohortId: 'c1', cohortCode: 'LD001', status: 'Completed' }] } };
    h.cohorts = { data: { data: [{ _id: 'c1', programName: 'Data Privacy', cohortCode: 'LD001' }] } };
    h.certificates = { data: [{ cohortId: 'c1', certificateNumber: 'CERT-001', certificateState: 'issued', issuedAt: '2026-05-01', validUntil: '2027-05-01' }] };
    // Unified results: a passed quiz, a passed instructor evaluation, and a failed quiz.
    h.results = { data: { data: [
      { id: 'r1', source: 'quiz', title: 'Privacy quiz', passed: true, scorePercent: 90, date: '2026-05-02' },
      { id: 'r2', source: 'evaluation', title: 'Business English — evaluation', passed: true, scorePercent: 75, date: '2026-05-03' },
      { id: 'r3', source: 'quiz', title: 'Failed quiz', passed: false, scorePercent: 20, date: '2026-05-04' },
    ] } };
    h.attendance = { data: { totalSessions: 10, present: 8, late: 1, excused: 0, absent: 1, attendanceRate: 80 } };
    renderPage();

    expect(screen.getByText('Lan Pham · 000123')).toBeInTheDocument();
    expect(screen.getByText('Data Privacy')).toBeInTheDocument();
    expect(screen.getByText('CERT-001')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    // passed quiz + passed instructor evaluation both show; failed quiz excluded
    expect(screen.getByText('Privacy quiz')).toBeInTheDocument();
    expect(screen.getByText('Business English — evaluation')).toBeInTheDocument();
    expect(screen.getByText('Instructor')).toBeInTheDocument(); // evaluation source badge
    expect(screen.queryByText('Failed quiz')).toBeNull();
  });

  it('shows an empty state when there is no history', () => {
    h.enrollments = { data: { data: [] } };
    h.cohorts = { data: { data: [] } };
    h.certificates = { data: [] };
    h.results = { data: { data: [] } };
    h.attendance = { data: { totalSessions: 0 } };
    renderPage();

    expect(screen.getByText(/no training history yet/i)).toBeInTheDocument();
  });

  it('Print button calls window.print', async () => {
    const user = userEvent.setup();
    const printSpy = vi.fn();
    window.print = printSpy;
    h.enrollments = { data: { data: [] } };
    h.cohorts = { data: { data: [] } };
    h.certificates = { data: [] };
    h.results = { data: { data: [] } };
    h.attendance = { data: { totalSessions: 0 } };
    renderPage();

    await user.click(screen.getByRole('button', { name: /print/i }));
    expect(printSpy).toHaveBeenCalled();
  });
});
