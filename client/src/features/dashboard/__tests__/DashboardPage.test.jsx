import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../DashboardPage';

// IA cleanup 2026-06-13: Home is now a lightweight landing (greeting +
// AlertBand + TodayHero + QuickActions). The heavy analytics moved to
// Reports▸Overview (AdminAnalyticsPanel), so Home no longer fires dashboard
// queries. UX-09 still holds: while mustChangePassword, Home renders nothing.

const h = vi.hoisted(() => ({
  auth: { user: null, isParticipant: true },
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => h.auth,
}));

vi.mock('../../../hooks/useRole', () => ({
  useRole: () => ({ can: () => true, canAny: () => true }),
}));

vi.mock('../ParticipantDashboard', () => ({
  default: () => <div data-testid="participant-dashboard" />,
}));

vi.mock('../QuickActions', () => ({
  default: () => <div data-testid="quick-actions" />,
}));

// Actionable bands fire their own queries — stub them out; the landing's job
// here is purely the role/gate routing.
vi.mock('@/components/home/AlertBand', () => ({
  AlertBand: () => <div data-testid="alert-band" />,
}));
vi.mock('@/components/home/TodayHero', () => ({
  TodayHero: () => <div data-testid="today-hero" />,
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );

beforeEach(() => {
  h.auth = { user: null, isParticipant: true };
});

describe('DashboardPage — Home landing', () => {
  it('renders nothing while mustChangePassword (UX-09)', () => {
    h.auth = { user: { mustChangePassword: true }, isParticipant: true };
    const { container } = renderPage();

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('participant-dashboard')).toBeNull();
    expect(screen.queryByTestId('quick-actions')).toBeNull();
  });

  it('renders nothing while mustChangePassword for staff too', () => {
    h.auth = { user: { mustChangePassword: true }, isParticipant: false };
    const { container } = renderPage();

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('quick-actions')).toBeNull();
  });

  it('mounts the participant dashboard for a participant past the password gate', () => {
    h.auth = { user: { mustChangePassword: false, name: 'Pat' }, isParticipant: true };
    renderPage();

    expect(screen.getByTestId('participant-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('quick-actions')).toBeNull();
  });

  it('renders the landing (QuickActions + action bands) for staff', () => {
    h.auth = { user: { mustChangePassword: false, name: 'Sam' }, isParticipant: false };
    renderPage();

    expect(screen.getByTestId('quick-actions')).toBeInTheDocument();
    expect(screen.getByTestId('alert-band')).toBeInTheDocument();
    expect(screen.getByTestId('today-hero')).toBeInTheDocument();
    expect(screen.queryByTestId('participant-dashboard')).toBeNull();
  });
});
