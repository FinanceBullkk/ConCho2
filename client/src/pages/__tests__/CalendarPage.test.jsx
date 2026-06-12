import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CalendarPage from '../CalendarPage';

// English-class separation (2026-06-12): /calendar is the GENERIC training
// calendar (cohort world). Team-booking surfaces live in /english; a
// Participant landing here is redirected there. The membership-gating cases
// that lived in this file (Cohesion P4) moved to EnglishPage.test.jsx.

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

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/calendar']}>
      <Routes>
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/english" element={<div data-testid="english-page" />} />
      </Routes>
    </MemoryRouter>,
  );

describe('CalendarPage — generic training calendar (English-class separation)', () => {
  it('Participant is redirected to /english', () => {
    h.auth = { user: { _id: 'u1', role: 'Participant' } };
    renderPage();

    expect(screen.getByTestId('english-page')).toBeInTheDocument();
    expect(screen.queryByTestId('schedules-page')).toBeNull();
  });

  it('Admin sees Schedules + Attendance tabs, scoped to the cohort world', () => {
    h.auth = { user: { _id: 'a1', role: 'Admin' } };
    renderPage();

    expect(screen.getByTestId('schedules-page')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /attendance/i })).toBeInTheDocument();
    expect(h.schedulesProps).toHaveBeenCalledWith(expect.objectContaining({ mode: 'cohort' }));
  });

  it('Teacher gets the single Attendance surface (cohort world)', () => {
    h.auth = { user: { _id: 't1', role: 'Teacher' } };
    renderPage();

    expect(screen.getByTestId('attendance-page')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).toBeNull(); // single-tab: no tab chrome
    expect(h.attendanceProps).toHaveBeenCalledWith(expect.objectContaining({ mode: 'cohort' }));
  });
});
