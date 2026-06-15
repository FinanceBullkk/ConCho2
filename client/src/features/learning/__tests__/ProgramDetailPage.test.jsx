import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProgramDetailPage from '../ProgramDetailPage';

// S3 — program drill-in. Composes getProgram + getCohorts + completion rollup;
// no new backend. These tests cover the header/KPIs/funnel/policy, the cohort
// links into cohort-detail, and the not-found path.

const h = vi.hoisted(() => ({
  program: vi.fn(),
  cohorts: vi.fn(),
  rollup: vi.fn(),
  role: { isAdmin: true, can: () => true },
}));

vi.mock('../../../hooks/useLearning', () => ({
  useLearningProgram: (...a) => h.program(...a),
  useLearningCohorts: (...a) => h.cohorts(...a),
  useCompletionRollup: (...a) => h.rollup(...a),
  useCompletionTrend: () => ({ data: { series: [{ month: '2026-06', completions: 3 }] } }),
}));
vi.mock('../../../hooks/useRole', () => ({ useRole: () => h.role }));

const program = {
  _id: 'p1', code: 'LEAD', name: 'Leadership Essentials', status: 'active', description: 'Core leadership.',
  completionPolicy: { attendanceThresholdPercent: 80, requiresAssessment: true, requiresFeedback: false },
  certificateValidityDays: 365, deliveryMode: 'online', schedulingMode: 'admin_scheduled', defaultSessionCount: 6,
  capacityPolicy: { maxParticipants: 24, maxParticipantsPerSession: null },
  facilitatorPolicy: { assignmentRequired: true, visibility: 'all_facilitators' },
  recertifyPolicy: { autoAssign: false }, prerequisitePrograms: [], customFields: {},
};
const cohortsData = {
  data: [{ _id: 'c1', cohortCode: 'LEAD-C1', classCode: 'LEAD-C1', programName: 'Leadership Essentials', status: 'Ongoing', bookedSessions: 4, totalSessions: 6 }],
};
const rollupData = { programs: [{ key: 'p1', label: 'Leadership Essentials', cohorts: 3, learners: 64, complete: 39, completionRate: 61, certificatesIssued: 21 }] };

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={['/learning/programs/p1']}>
      <Routes>
        <Route path="/learning/programs/:id" element={<ProgramDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ProgramDetailPage (S3)', () => {
  beforeEach(() => {
    h.program.mockReturnValue({ data: program, isLoading: false, isError: false });
    h.cohorts.mockReturnValue({ data: cohortsData });
    h.rollup.mockReturnValue({ data: rollupData });
  });

  it('renders header, real KPIs from the rollup, and the completion policy', () => {
    renderAt();

    expect(screen.getByText('Leadership Essentials')).toBeInTheDocument();
    expect(screen.getByText('LEAD')).toBeInTheDocument();
    expect(screen.getAllByText('64').length).toBeGreaterThan(0); // enrolled (KPI + funnel)
    expect(screen.getByText('61%')).toBeInTheDocument(); // completion rate
    expect(screen.getByText('Attendance ≥ 80%')).toBeInTheDocument();
    expect(screen.getByText('Pass assessment')).toBeInTheDocument();
  });

  it('links each cohort to its cohort-detail page', async () => {
    const user = userEvent.setup();
    renderAt();

    await user.click(screen.getByRole('tab', { name: 'Cohorts' }));
    expect(screen.getByRole('link', { name: /LEAD-C1/ })).toHaveAttribute('href', '/learning/cohorts/c1');
  });

  it('shows a not-found state when the program is missing', () => {
    h.program.mockReturnValue({ data: null, isLoading: false, isError: false });
    renderAt();
    expect(screen.getByText('Program not found.')).toBeInTheDocument();
  });
});
