import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingChecklist, AtAGlance } from '../HomeSetup';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, o) => (o ? `${k}:${o.done ?? o.pct ?? ''}` : k) }) }));

const setup = {
  completedSteps: 2, totalSteps: 6,
  steps: [
    { key: 'directory', done: true },
    { key: 'program', done: true },
    { key: 'roles', done: false },
    { key: 'automation', done: false },
    { key: 'policy', done: false },
    { key: 'coordinators', done: false },
  ],
  atGlance: { activeLearners: 842, totalEmployees: 1000, sessionsThisWeek: 34, pendingEnrollment: 18 },
};

describe('OnboardingChecklist', () => {
  beforeEach(() => { try { localStorage.removeItem('tms-onboarding-dismissed'); } catch { /* noop */ } });

  it('renders all 6 steps and can be dismissed', async () => {
    const user = userEvent.setup();
    render(<OnboardingChecklist setup={setup} />);
    expect(screen.getByTestId('onboarding-checklist')).toBeInTheDocument();
    expect(screen.getByText('dashboard.onboarding.steps.directory')).toBeInTheDocument();
    expect(screen.getByText('dashboard.onboarding.steps.coordinators')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'dashboard.onboarding.dismiss' }));
    expect(screen.queryByTestId('onboarding-checklist')).not.toBeInTheDocument();
  });
});

describe('AtAGlance', () => {
  it('renders the this-week counts from real data', () => {
    render(<AtAGlance atGlance={setup.atGlance} />);
    expect(screen.getByTestId('at-a-glance')).toBeInTheDocument();
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('renders nothing without data', () => {
    const { container } = render(<AtAGlance atGlance={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
