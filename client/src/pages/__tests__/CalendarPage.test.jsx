import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CalendarPage from '../CalendarPage';

// Cohesion Wave P4 — team-booking mode separation. The Calendar "Team
// booking" surface belongs to the legacy group-based (English-class) flow:
// a Participant WITH a team gets the booking grid; a Participant WITHOUT a
// team is pointed at their generic learning surfaces (/me/sessions,
// /me/catalog) instead of a dead end. Staff tabs never depend on teams.

const h = vi.hoisted(() => ({
  auth: { user: { _id: 'u1', role: 'Participant' } },
  teams: { data: [], isLoading: false },
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => h.auth,
}));

vi.mock('../../hooks/useTeams', () => ({
  useMyTeams: () => h.teams,
}));

// The tab bodies are heavy pages — stub them; this test is about the shell.
vi.mock('../../features/schedule/SchedulesPage', () => ({
  default: () => <div data-testid="schedules-page" />,
}));
vi.mock('../../features/attendance/AttendancePage', () => ({
  default: () => <div data-testid="attendance-page" />,
}));
vi.mock('../../features/schedule/BookClassPage', () => ({
  default: () => <div data-testid="book-class-page" />,
}));

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/calendar']}>
      <CalendarPage />
    </MemoryRouter>,
  );

describe('CalendarPage — team-booking membership gating (Cohesion P4)', () => {
  it('Participant WITH a team sees the booking grid', () => {
    h.auth = { user: { _id: 'u1', role: 'Participant' } };
    h.teams = { data: [{ _id: 't1', name: 'Alpha' }], isLoading: false };
    renderPage();

    expect(screen.getByTestId('book-class-page')).toBeInTheDocument();
    expect(screen.queryByText('No team-booking class')).toBeNull();
  });

  it('Participant WITHOUT a team gets pointed to /me surfaces instead', () => {
    h.auth = { user: { _id: 'u1', role: 'Participant' } };
    h.teams = { data: [], isLoading: false };
    renderPage();

    expect(screen.getByText('No team-booking class')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my sessions/i })).toHaveAttribute('href', '/me/sessions');
    expect(screen.getByRole('link', { name: /browse catalog/i })).toHaveAttribute('href', '/me/catalog');
    expect(screen.queryByTestId('book-class-page')).toBeNull();
  });

  it('while teams are loading the grid renders (no pointer-panel flash)', () => {
    h.auth = { user: { _id: 'u1', role: 'Participant' } };
    h.teams = { data: undefined, isLoading: true };
    renderPage();

    expect(screen.getByTestId('book-class-page')).toBeInTheDocument();
    expect(screen.queryByText('No team-booking class')).toBeNull();
  });

  it('Admin tabs do not depend on team membership', () => {
    h.auth = { user: { _id: 'a1', role: 'Admin' } };
    h.teams = { data: [], isLoading: false };
    renderPage();

    expect(screen.getByTestId('schedules-page')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /attendance/i })).toBeInTheDocument();
    expect(screen.queryByText('No team-booking class')).toBeNull();
  });
});
