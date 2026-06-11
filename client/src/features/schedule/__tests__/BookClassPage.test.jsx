import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BookClassPage from '../BookClassPage';

// ──────────────────────────────────────────────────────────
// BookClassPage — mode-aware exact-slot grid (Phase 2 + Phase 3)
// ──────────────────────────────────────────────────────────
// Renders the REAL CalendarGrid + real pure helpers (scheduling-slots,
// scheduling-mode, booking-cell-state); only the data hooks / context are
// mocked. Locks the cross-cutting behavior: leader_booking → bookable cells;
// admin_scheduled → mode banner + locked cells (no booking round-trip).
// ──────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({ schedulingMode: 'leader_booking' }));

vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'leader1' } }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../components/BookDrawer', () => ({ BookDrawer: () => null }));

vi.mock('../../../hooks/useSchedulingConfig', () => ({
  DEFAULT_UTC_OFFSET_MINUTES: 420,
  useSchedulingConfig: () => ({
    data: {
      timezone: 'Asia/Ho_Chi_Minh',
      utcOffsetMinutes: 420,
      weeklyTeamLimit: 2,
      slots: [{ id: '10:00-11:00', label: '10:00-11:00', startHour: 10, startMinute: 0, endHour: 11, endMinute: 0, durationMinutes: 60 }],
    },
    isLoading: false,
  }),
}));

// BUG-004: /api/teams/my-teams returns a populated `members` array, NOT an
// `enrolledCount` field (Team has no such virtual). The header must derive the
// student count from members.length — the old `enrolledCount` read was always
// undefined → "0 students". Mock the REAL shape (members, no enrolledCount).
vi.mock('../../../hooks/useTeams', () => ({
  useMyTeams: () => ({
    data: [{
      _id: 'team1', name: 'Alpha', leaderId: 'leader1',
      members: ['m1', 'm2', 'm3'],
      classId: { _id: 'class1', status: 'Ongoing', classCode: 'EL001', programId: { schedulingMode: h.schedulingMode } },
    }],
    isLoading: false,
  }),
}));

vi.mock('../../../hooks/useSchedules', () => ({
  useAvailability: () => ({ data: [], isLoading: false }),
  useBookSlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelSlot: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const renderPage = () => render(<MemoryRouter><BookClassPage /></MemoryRouter>);

describe('BookClassPage — mode-aware exact-slot grid', () => {
  it('leader_booking team: renders bookable "+ Book" cells and no mode banner', () => {
    h.schedulingMode = 'leader_booking';
    renderPage();
    expect(screen.getAllByText('+ Book').length).toBeGreaterThan(0);
    expect(screen.queryByText('booking.modeLocked.adminScheduled')).toBeNull();
  });

  it('admin_scheduled team: shows the mode banner and offers no "+ Book" cell', () => {
    h.schedulingMode = 'admin_scheduled';
    renderPage();
    expect(screen.getByText('booking.modeLocked.adminScheduled')).toBeInTheDocument();
    expect(screen.queryByText('+ Book')).toBeNull();
  });

  it('BUG-004: header student count comes from members.length, not the absent enrolledCount field', () => {
    h.schedulingMode = 'leader_booking';
    renderPage();
    // 3 members → "Alpha · 3 students" (regression: read enrolledCount → "0 students")
    expect(screen.getByText(/Alpha · 3 students/)).toBeInTheDocument();
  });
});
