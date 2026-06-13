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
  assessments: { data: { data: [] } },
  attempts: { data: { data: [] } },
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
  useAssessments: () => h.assessments,
  useAssessmentAttempts: () => h.attempts,
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
  it('composes programs + certificate, attendance summary, and only passed assessments', () => {
    h.enrollments = { data: { data: [{ id: 'e1', cohortId: 'c1', cohortCode: 'LD001', status: 'Completed' }] } };
    h.cohorts = { data: { data: [{ _id: 'c1', programName: 'Data Privacy', cohortCode: 'LD001' }] } };
    h.certificates = { data: [{ cohortId: 'c1', certificateNumber: 'CERT-001', certificateState: 'issued', issuedAt: '2026-05-01', validUntil: '2027-05-01' }] };
    h.assessments = { data: { data: [{ id: 'a1', title: 'Privacy quiz' }] } };
    h.attempts = { data: { data: [
      { id: 'at1', assessmentId: 'a1', passed: true, scorePercent: 90, submittedAt: '2026-05-02' },
      { id: 'at2', assessmentId: 'a2', passed: false, submittedAt: '2026-05-03' },
    ] } };
    h.attendance = { data: { totalSessions: 10, present: 8, late: 1, excused: 0, absent: 1, attendanceRate: 80 } };
    renderPage();

    expect(screen.getByText('Lan Pham · 000123')).toBeInTheDocument();
    expect(screen.getByText('Data Privacy')).toBeInTheDocument();
    expect(screen.getByText('CERT-001')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    // passed attempt shows; failed one (no map entry → would be "Quiz") is excluded
    expect(screen.getByText('Privacy quiz')).toBeInTheDocument();
    expect(screen.queryByText('Quiz')).toBeNull();
  });

  it('shows an empty state when there is no history', () => {
    h.enrollments = { data: { data: [] } };
    h.cohorts = { data: { data: [] } };
    h.certificates = { data: [] };
    h.assessments = { data: { data: [] } };
    h.attempts = { data: { data: [] } };
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
    h.assessments = { data: { data: [] } };
    h.attempts = { data: { data: [] } };
    h.attendance = { data: { totalSessions: 0 } };
    renderPage();

    await user.click(screen.getByRole('button', { name: /print/i }));
    expect(printSpy).toHaveBeenCalled();
  });
});
