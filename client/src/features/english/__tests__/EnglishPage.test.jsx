import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EnglishPage from '../EnglishPage';

// English-class separation (2026-06-12): the whole team-booking world lives
// here. These tests cover the role→tab matrix, the team-world `mode` scoping
// of the shared pages, and the membership gating inherited from Cohesion P4
// (a Participant without a Team gets pointer links, not a dead grid).

const h = vi.hoisted(() => ({
  auth: { user: { _id: 'u1', role: 'Participant' } },
  teams: { data: [], isLoading: false },
  schedulesProps: vi.fn(),
  attendanceProps: vi.fn(),
  cohortsProps: vi.fn(),
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => h.auth,
}));

vi.mock('../../../hooks/useTeams', () => ({
  useMyTeams: () => h.teams,
}));

// The tab bodies are heavy pages — stub them; this test is about the shell.
// Mode-scoped pages capture their props so we can assert the team world.
vi.mock('../../learning/CohortsTab', () => ({
  default: (props) => { h.cohortsProps(props); return <div data-testid="classes-tab" />; },
}));
vi.mock('../../groups/TeamsPage', () => ({
  default: () => <div data-testid="teams-page" />,
}));
vi.mock('../../schedule/SchedulesPage', () => ({
  default: (props) => { h.schedulesProps(props); return <div data-testid="schedules-page" />; },
}));
vi.mock('../../attendance/AttendancePage', () => ({
  default: (props) => { h.attendanceProps(props); return <div data-testid="attendance-page" />; },
}));
vi.mock('../../evaluations/EvaluationPage', () => ({
  default: () => <div data-testid="evaluation-page" />,
}));
vi.mock('../../schedule/BookClassPage', () => ({
  default: () => <div data-testid="book-class-page" />,
}));

const renderPage = (entry = '/english') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <EnglishPage />
    </MemoryRouter>,
  );

describe('EnglishPage — bounded English-class section', () => {
  it('Admin sees the full tab set, default tab Classes scoped to the team world', () => {
    h.auth = { user: { _id: 'a1', role: 'Admin' } };
    renderPage();

    for (const name of [/classes/i, /teams/i, /schedules/i, /attendance/i, /evaluations/i]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    expect(screen.getByTestId('classes-tab')).toBeInTheDocument();
    expect(h.cohortsProps).toHaveBeenCalledWith(expect.objectContaining({ mode: 'team' }));
  });

  it('Admin Schedules/Attendance tabs pass mode="team"', () => {
    h.auth = { user: { _id: 'a1', role: 'Admin' } };
    renderPage('/english?tab=schedules');
    expect(h.schedulesProps).toHaveBeenCalledWith(expect.objectContaining({ mode: 'team' }));

    renderPage('/english?tab=attendance');
    expect(h.attendanceProps).toHaveBeenCalledWith(expect.objectContaining({ mode: 'team' }));
  });

  it('Teacher sees only Attendance + Evaluations', () => {
    h.auth = { user: { _id: 't1', role: 'Teacher' } };
    renderPage();

    expect(screen.getByRole('tab', { name: /attendance/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /evaluations/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /classes/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: /teams/i })).toBeNull();
    expect(screen.getByTestId('attendance-page')).toBeInTheDocument();
  });

  it('Participant WITH a team gets the booking grid (no tab chrome)', () => {
    h.auth = { user: { _id: 'u1', role: 'Participant' } };
    h.teams = { data: [{ _id: 't1', name: 'Alpha' }], isLoading: false };
    renderPage();

    expect(screen.getByTestId('book-class-page')).toBeInTheDocument();
    expect(screen.queryByText('No English class')).toBeNull();
  });

  it('Participant WITHOUT a team gets pointed to /me surfaces instead', () => {
    h.auth = { user: { _id: 'u1', role: 'Participant' } };
    h.teams = { data: [], isLoading: false };
    renderPage();

    expect(screen.getByText('No English class')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my sessions/i })).toHaveAttribute('href', '/me/sessions');
    expect(screen.getByRole('link', { name: /browse catalog/i })).toHaveAttribute('href', '/me/catalog');
    expect(screen.queryByTestId('book-class-page')).toBeNull();
  });

  it('while teams are loading the grid renders (no pointer-panel flash)', () => {
    h.auth = { user: { _id: 'u1', role: 'Participant' } };
    h.teams = { data: undefined, isLoading: true };
    renderPage();

    expect(screen.getByTestId('book-class-page')).toBeInTheDocument();
    expect(screen.queryByText('No English class')).toBeNull();
  });

  it('Coordinator gets the not-available header (cohort-world role)', () => {
    h.auth = { user: { _id: 'c1', role: 'Coordinator' } };
    renderPage();

    expect(screen.getByText(/not available for your role/i)).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull();
  });
});
