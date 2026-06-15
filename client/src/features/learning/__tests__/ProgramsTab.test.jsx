import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProgramsTab from '../ProgramsTab';

const h = vi.hoisted(() => ({ programs: {}, rollup: {}, can: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o?.enrolled != null ? `${o.cohorts}c·${o.enrolled}e` : k) }) }));
vi.mock('../../../hooks/useLearning', () => ({
  useLearningPrograms: () => h.programs,
  useCompletionRollup: () => h.rollup,
}));
vi.mock('../../../hooks/useRole', () => ({ useRole: () => ({ can: h.can }) }));
vi.mock('../ProgramFormModal', () => ({ default: () => <div data-testid="program-form" /> }));

const renderTab = () => render(<MemoryRouter><ProgramsTab /></MemoryRouter>);

beforeEach(() => {
  h.can = vi.fn().mockReturnValue(true);
  h.programs = { data: { data: [{ _id: 'p1', code: 'ONB', name: 'New Hire Onboarding', schedulingMode: 'admin_scheduled' }] }, isLoading: false };
  h.rollup = { data: { programs: [{ key: 'p1', completionRate: 88, cohorts: 6, learners: 212 }] } };
});

describe('ProgramsTab — card grid', () => {
  it('renders a program card with completion % and health status', () => {
    renderTab();
    expect(screen.getByText('New Hire Onboarding')).toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();
    expect(screen.getByText('6c·212e')).toBeInTheDocument();
    // 88% → on-track status pill
    expect(screen.getByText('learning.programs.onTrack')).toBeInTheDocument();
  });

  it('omits the completion bar when no rollup stats (e.g. no report access)', () => {
    h.rollup = { data: undefined };
    renderTab();
    expect(screen.getByText('New Hire Onboarding')).toBeInTheDocument();
    expect(screen.queryByText('88%')).not.toBeInTheDocument();
  });
});
