import { MemoryRouter } from 'react-router-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import SchedulesPage from '../SchedulesPage';
import { getMonday } from '../../../components/CalendarGrid';

// Covers: the Admin grid renders exact configured slot rows + the create
// affordance (descriptor migration) AND the unified world facet (converge
// Phase 4 slice A2) — mode="all" shows BOTH worlds with a Team/Cohort filter.

const h = vi.hoisted(() => ({ sched: { data: { data: [], total: 0 }, isLoading: false } }));

vi.mock('../../../components/ScheduleDrawer', () => ({ ScheduleDrawer: () => null }));
vi.mock('../../../hooks/useRole', () => ({ useRole: () => ({ can: () => true }) }));
vi.mock('../../../hooks/useClasses', () => ({ useClasses: () => ({ data: [] }) }));
vi.mock('../../../hooks/useTeams', () => ({ useTeams: () => ({ data: [] }) }));
vi.mock('../../../hooks/useSchedules', () => ({ useSchedules: () => h.sched }));
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

// A session placed safely inside the current ISO week so it buckets into a cell.
const inWeek = (dayOffset) => {
  const d = getMonday(new Date());
  d.setDate(d.getDate() + dayOffset);
  d.setHours(10, 0, 0, 0);
  return { startTime: d.toISOString(), endTime: new Date(d.getTime() + 3600000).toISOString() };
};

const session = (id, classCode, deliveryType, dayOffset) => ({
  _id: id,
  classId: { _id: `class-${classCode}`, classCode, courseName: `Course ${classCode}` },
  ...inWeek(dayOffset),
  enrolledCount: 1, capacity: 9, deliveryType,
});

const renderPage = (props) => render(<MemoryRouter><SchedulesPage {...props} /></MemoryRouter>);

beforeEach(() => { h.sched = { data: { data: [], total: 0 }, isLoading: false }; });

describe('SchedulesPage — exact-slot grid + world facet', () => {
  it('renders the configured slot row + create affordance; no facet in plain mode', () => {
    renderPage();
    expect(screen.getAllByText('10:00-11:00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('+ Create').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Cohort' })).toBeNull();
  });

  it('unified mode (mode="all") shows the Team/Cohort world facet', () => {
    renderPage({ mode: 'all' });
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Team' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cohort' })).toBeInTheDocument();
  });

  it('unified mode filters the grid by world', () => {
    h.sched = {
      isLoading: false,
      data: { total: 2, data: [session('s-team', 'TEAM-A', 'team', 2), session('s-cohort', 'COH-B', 'cohort', 3)] },
    };
    renderPage({ mode: 'all' });
    expect(screen.getByText('TEAM-A')).toBeInTheDocument();
    expect(screen.getByText('COH-B')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cohort' }));
    expect(screen.queryByText('TEAM-A')).toBeNull();
    expect(screen.getByText('COH-B')).toBeInTheDocument();
  });

  it('English ownership scopes the grid by Cohort id and disables team-style creation', () => {
    h.sched = {
      isLoading: false,
      data: { total: 2, data: [session('s-team', 'TEAM-A', 'team', 2), session('s-english', 'ENG-B', 'cohort', 3)] },
    };
    renderPage({ allowedClassIds: ['class-ENG-B'], allowCreate: false });

    expect(screen.queryByText('TEAM-A')).toBeNull();
    expect(screen.getByText('ENG-B')).toBeInTheDocument();
    expect(screen.queryByText('+ Create')).toBeNull();
    expect(screen.queryByRole('button', { name: '+ New Schedule' })).toBeNull();
  });

  it('renders Archive sessions on the weekly grid without edit/create affordances', () => {
    const historical = {
      ...session('archive:1', 'HIST-A', 'cohort', 2),
      isHistorical: true,
      archiveSessionId: 'archive-1',
      historicalLabel: 'Historical',
      historicalReadOnlyLabel: 'Historical · Read-only',
      sessionNumber: 3,
      archiveCounts: { present: 4, absent: 1 },
    };
    renderPage({
      historicalOnly: true,
      historicalSchedules: [historical],
      defaultWeek: historical.startTime,
    });

    expect(screen.getByText('HIST-A')).toBeInTheDocument();
    expect(screen.getByText('Historical')).toBeInTheDocument();
    expect(screen.getByText('Historical · Read-only')).toBeInTheDocument();
    expect(screen.queryByText('+ Create')).toBeNull();
    expect(screen.queryByRole('button', { name: '+ New Schedule' })).toBeNull();
  });
});
