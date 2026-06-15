import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SkillsPage from '../SkillsPage';

// TMS.update gap #4 — the Studio Skills & competencies page.

const h = vi.hoisted(() => ({
  skills: { data: undefined, isLoading: false, isError: false },
  profiles: { data: [] },
  remove: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, d) => (typeof d === 'string' ? d : (d?.count != null ? `${k}:${d.count}` : k)) }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../useSkills', () => ({
  useSkills: () => h.skills,
  useRoleProfiles: () => h.profiles,
  useDeleteSkill: () => ({ mutateAsync: h.remove, isPending: false }),
}));
// Stub the form dialog so the page test doesn't pull in useLearningPrograms.
vi.mock('../SkillFormDialog', () => ({ default: ({ open }) => (open ? <div data-testid="skill-dialog" /> : null) }));

const sample = {
  categories: ['Language', 'Technical'],
  skills: [
    { _id: 's1', name: 'Business English', category: 'Language', programCount: 2, holders: 40, coverageTarget: 80, coveragePct: 50 },
    { _id: 's2', name: 'Data analysis', category: 'Technical', programCount: 1, holders: 12, coverageTarget: null, coveragePct: null },
  ],
};
const profiles = [
  { role: 'Participant', userCount: 200, coverage: 64, skills: [{ name: 'Business English', target: 3 }] },
];

beforeEach(() => {
  h.skills = { data: sample, isLoading: false, isError: false };
  h.profiles = { data: profiles };
  h.remove.mockReset(); h.remove.mockResolvedValue({});
});

describe('SkillsPage', () => {
  it('renders the skills grid and the role profiles with coverage', () => {
    render(<SkillsPage />);
    expect(screen.getByText('Business English')).toBeInTheDocument();
    expect(screen.getByText('Data analysis')).toBeInTheDocument();
    // role profile coverage
    expect(screen.getByText('Participant')).toBeInTheDocument();
    expect(screen.getByText('64%')).toBeInTheDocument();
  });

  it('filters the grid by category chip', async () => {
    const u = userEvent.setup();
    render(<SkillsPage />);
    await u.click(screen.getByRole('button', { name: 'Technical' }));
    expect(screen.queryByText('Business English')).not.toBeInTheDocument();
    expect(screen.getByText('Data analysis')).toBeInTheDocument();
  });

  it('opens the create dialog from the header action', async () => {
    const u = userEvent.setup();
    render(<SkillsPage />);
    await u.click(screen.getByText('skills.newSkill'));
    expect(screen.getByTestId('skill-dialog')).toBeInTheDocument();
  });

  it('shows the empty state when there are no skills', () => {
    h.skills = { data: { skills: [], categories: [] }, isLoading: false, isError: false };
    render(<SkillsPage />);
    expect(screen.getByText('skills.empty')).toBeInTheDocument();
  });
});
