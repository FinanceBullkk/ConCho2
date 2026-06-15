import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LearnerProfilePage from '../LearnerProfilePage';

// S6 — admin learner 360°. Composes useUser + learner-scoped enrollments +
// certificates; the Skills tab + role-readiness are now real (Phase 5 — derived
// proficiency via GET /api/skills/learner/:userId, mocked here).

const h = vi.hoisted(() => ({ user: vi.fn(), enroll: vi.fn(), certs: vi.fn(), skills: vi.fn() }));

vi.mock('../../../hooks/useUsers', () => ({ useUser: (...a) => h.user(...a) }));
vi.mock('../../../hooks/useLearning', () => ({
  useLearningEnrollments: (...a) => h.enroll(...a),
  useCertificates: (...a) => h.certs(...a),
}));
// Both the page and LearnerSkillsTab/RoleReadinessList import useLearnerSkills
// from this module → one mock covers all.
vi.mock('../../skills/useSkills', () => ({ useLearnerSkills: (...a) => h.skills(...a) }));

const user = { _id: 'u1', name: 'Mai Lan Pham', role: 'Participant', empCode: '000001', department: 'People & Culture', email: 'mai@northwind.co' };
const enrollData = { data: [
  { id: 'e1', cohortId: 'c1', cohortCode: 'LEAD-C1', status: 'In progress' },
  { id: 'e2', cohortId: 'c2', cohortCode: 'ONB-W3', status: 'Completed' },
] };
const certs = [{ id: 'cert1', certificateNumber: 'CERT-1', programName: 'Onboarding', status: 'Issued', issuedAt: '2026-05-01' }];
const learnerSkills = {
  kpis: { skills: 2, gaps: 1, met: 1 },
  skills: [{ skillId: 's1', name: 'Business English', category: 'Language', level: 4, max: 5, via: ['BE Foundation'] }],
  roleProfile: { role: 'Participant', required: [
    { name: 'Business English', target: 4, level: 4, gap: 0 },
    { name: 'People management', target: 3, level: 1, gap: 2 },
  ] },
};

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
    h.skills.mockReturnValue({ data: learnerSkills });
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

  it('renders real derived skills + role gap on the Skills tab', async () => {
    const user2 = userEvent.setup();
    renderAt();
    await user2.click(screen.getByRole('tab', { name: 'Skills' }));
    // 'Business English' shows in both the acquired list and the role profile.
    expect(screen.getAllByText('Business English').length).toBeGreaterThan(0);
    // role gap: People management has a gap of 2
    expect(screen.getByText('People management')).toBeInTheDocument();
    expect(screen.getByText('target 3')).toBeInTheDocument();
  });

  it('shows a not-found state when the user is missing', () => {
    h.user.mockReturnValue({ data: null, isLoading: false, isError: false });
    renderAt();
    expect(screen.getByText("Couldn't load this learner.")).toBeInTheDocument();
  });
});
