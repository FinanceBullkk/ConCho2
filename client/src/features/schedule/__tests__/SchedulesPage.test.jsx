import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SchedulesPage from '../SchedulesPage';

// Smoke: the Admin schedule grid renders exact configured slot rows (descriptor
// migration) and the create affordance, with the data hooks mocked.

vi.mock('../../../components/ScheduleDrawer', () => ({ ScheduleDrawer: () => null }));
vi.mock('../../../hooks/useRole', () => ({ useRole: () => ({ can: () => true }) }));
vi.mock('../../../hooks/useClasses', () => ({ useClasses: () => ({ data: [] }) }));
vi.mock('../../../hooks/useTeams', () => ({ useTeams: () => ({ data: [] }) }));
vi.mock('../../../hooks/useSchedules', () => ({
  useSchedules: () => ({ data: { data: [], total: 0 }, isLoading: false }),
}));
vi.mock('../../../hooks/useSchedulingConfig', () => ({
  DEFAULT_UTC_OFFSET_MINUTES: 420,
  useSchedulingConfig: () => ({
    data: {
      timezone: 'Asia/Ho_Chi_Minh', utcOffsetMinutes: 420, weeklyTeamLimit: 2,
      slots: [{ id: '10:00-11:00', label: '10:00-11:00', startHour: 10, startMinute: 0, endHour: 11, endMinute: 0, durationMinutes: 60 }],
    },
    isLoading: false,
  }),
}));

const renderPage = () => render(<MemoryRouter><SchedulesPage /></MemoryRouter>);

describe('SchedulesPage — exact-slot grid', () => {
  it('renders the configured slot row and the create affordance', () => {
    renderPage();
    expect(screen.getAllByText('10:00-11:00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('+ Create').length).toBeGreaterThan(0);
  });
});
