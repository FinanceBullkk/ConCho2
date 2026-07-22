import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CalendarPage from '../CalendarPage';

const h = vi.hoisted(() => ({ auth: { user: { _id: 'u1', role: 'Admin' } } }));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => h.auth }));

function Target() {
  const location = useLocation();
  return <div data-testid="english-operations">{location.search}</div>;
}

const renderPage = (entry = '/calendar') => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/english" element={<div data-testid="english-page" />} />
      <Route path="/english-operations" element={<Target />} />
    </Routes>
  </MemoryRouter>,
);

describe('CalendarPage compatibility redirect', () => {
  it('redirects the old calendar route to English Schedule', () => {
    h.auth = { user: { _id: 'a1', role: 'Admin' } };
    renderPage();
    expect(screen.getByTestId('english-operations')).toHaveTextContent('?tab=schedule');
  });

  it('keeps Teacher on overview until canonical assigned-resource scope ships', () => {
    h.auth = { user: { _id: 't1', role: 'Teacher' } };
    renderPage('/calendar?tab=attendance');
    expect(screen.getByTestId('english-operations')).toHaveTextContent('?tab=overview');
  });

  it('maps the old plural schedules tab to English Schedule', () => {
    h.auth = { user: { _id: 'a1', role: 'Admin' } };
    renderPage('/calendar?tab=schedules');
    expect(screen.getByTestId('english-operations')).toHaveTextContent('?tab=schedule');
  });

  it('keeps Participants in the English learner experience', () => {
    h.auth = { user: { _id: 'u1', role: 'Participant' } };
    renderPage();
    expect(screen.getByTestId('english-page')).toBeInTheDocument();
  });
});
