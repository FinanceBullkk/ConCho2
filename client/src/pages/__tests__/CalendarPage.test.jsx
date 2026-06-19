import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CalendarPage from '../CalendarPage';

// /calendar is the GENERIC training calendar. Converge Phase 4 unified both
// tabs across the two scheduling worlds (mode="all"). A Participant landing
// here is redirected to /english. The membership-gating cases that lived in
// this file (Cohesion P4) moved to EnglishPage.test.jsx.

const h = vi.hoisted(() => ({
  auth: { user: { _id: 'u1', role: 'Participant' } },
  schedulesProps: vi.fn(),
  attendanceProps: vi.fn(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => h.auth,
}));

// The tab bodies are heavy pages — stub them, capturing the `mode` prop so we
// can assert the cohort-world scoping.
vi.mock('../../features/schedule/SchedulesPage', () => ({
  default: (props) => { h.schedulesProps(props); return <div data-testid="schedules-page" />; },
}));
vi.mock('../../features/attendance/AttendancePage', () => ({
  default: (props) => { h.attendanceProps(props); return <div data-testid="attendance-page" />; },
}));

const renderPage = (entry = '/calendar') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/english" element={<div data-testid="english-page" />} />
      </Routes>
    </MemoryRouter>,
  );

// IA Phase 03: the in-page tab strip is gone — the sidebar's Operations group
// drives ?tab=. The page renders the body for the active (or role-default) tab.
describe('CalendarPage — generic training calendar (English-class separation)', () => {
  it('Participant is redirected to /english', () => {
    h.auth = { user: { _id: 'u1', role: 'Participant' } };
    renderPage();

    expect(screen.getByTestId('english-page')).toBeInTheDocument();
    expect(screen.queryByTestId('schedules-page')).toBeNull();
  });

  it('Admin defaults to Schedules, UNIFIED across both worlds', () => {
    h.auth = { user: { _id: 'a1', role: 'Admin' } };
    renderPage();

    expect(screen.getByTestId('schedules-page')).toBeInTheDocument();
    // Converge Phase 4 slice A2: schedules is unified — mode="all" shows both
    // worlds with a Team/Cohort facet (cell-click create still books a team).
    expect(h.schedulesProps).toHaveBeenCalledWith(expect.objectContaining({ mode: 'all' }));
  });

  it('Admin ?tab=attendance renders the UNIFIED Attendance surface (both worlds)', () => {
    h.auth = { user: { _id: 'a1', role: 'Admin' } };
    renderPage('/calendar?tab=attendance');

    expect(screen.getByTestId('attendance-page')).toBeInTheDocument();
    // Converge Phase 4 slice A1: attendance is unified — mode="all" shows both
    // scheduling worlds with a client-side Team/Cohort facet.
    expect(h.attendanceProps).toHaveBeenCalledWith(expect.objectContaining({ mode: 'all' }));
  });

  it('Teacher gets the single UNIFIED Attendance surface (both worlds)', () => {
    h.auth = { user: { _id: 't1', role: 'Teacher' } };
    renderPage();

    expect(screen.getByTestId('attendance-page')).toBeInTheDocument();
    expect(h.attendanceProps).toHaveBeenCalledWith(expect.objectContaining({ mode: 'all' }));
  });
});
