import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LearnerProfilePage from '../LearnerProfilePage';

// S6 — admin learner 360°. Composes useUser + learner-scoped enrollments +
// certificates; no new backend. Skills/role-readiness are Phase-5 stubs.

const h = vi.hoisted(() => ({ user: vi.fn(), enroll: vi.fn(), certs: vi.fn() }));

vi.mock('../../../hooks/useUsers', () => ({ useUser: (...a) => h.user(...a) }));
vi.mock('../../../hooks/useLearning', () => ({
  useLearningEnrollments: (...a) => h.enroll(...a),
  useCertificates: (...a) => h.certs(...a),
}));

const user = { _id: 'u1', name: 'Mai Lan Pham', role: 'Participant', empCode: '000001', department: 'People & Culture', email: 'mai@northwind.co' };
const enrollData = { data: [
  { id: 'e1', cohortId: 'c1', cohortCode: 'LEAD-C1', status: 'In progress' },
  { id: 'e2', cohortId: 'c2', cohortCode: 'ONB-W3', status: 'Completed' },
] };
const certs = [{ id: 'cert1', certificateNumber: 'CERT-1', programName: 'Onboarding', status: 'Issued', issuedAt: '2026-05-01' }];

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={['/people/u1']}>
      <Routes><Route path="/people/:userId" element={<LearnerProfilePage />} /></Routes>
    </MemoryRouter>,
  );

describe('LearnerProfilePage (S6)', () => {
  beforeEach(() => {
    h.user.mockReturnValue({ data: user, isLoading: false, isError: false });
    h.enroll.mockReturnValue({ data: enrollData });
    h.certs.mockReturnValue({ data: certs });
  });

  it('renders the header, KPIs and current programs from composed reads', () => {
    renderAt();
    expect(screen.getByText('Mai Lan Pham')).toBeInTheDocument();
    expect(screen.getByText('People & Culture · mai@northwind.co')).toBeInTheDocument();
    // 1 completed of 2 enrollments → 50% completion
    expect(screen.getByText('50%')).toBeInTheDocument();
    // current programs list (overview is the default tab)
    expect(screen.getByRole('link', { name: 'LEAD-C1' })).toHaveAttribute('href', '/learning/cohorts/c1');
  });

  it('shows the learner certificates on the Certificates tab', async () => {
    const user2 = userEvent.setup();
    renderAt();
    await user2.click(screen.getByRole('tab', { name: 'Certificates' }));
    expect(screen.getByText('Onboarding')).toBeInTheDocument();
    expect(screen.getByText(/CERT-1/)).toBeInTheDocument();
  });

  it('shows a not-found state when the user is missing', () => {
    h.user.mockReturnValue({ data: null, isLoading: false, isError: false });
    renderAt();
    expect(screen.getByText("Couldn't load this learner.")).toBeInTheDocument();
  });
});
