import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RoomsPage from '../RoomsPage';

// ──────────────────────────────────────────────────────────
// RoomsPage — People → Rooms tab (re-center Phase 3).
// Office-scoped physical rooms; mirrors OfficesPage.test.jsx.
// ──────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  rooms: { data: [], isLoading: false },
  offices: { data: [] },
  create: { mutate: vi.fn(), isPending: false },
  archive: { mutate: vi.fn(), isPending: false },
  can: vi.fn(() => true),
}));

vi.mock('../../hooks/useRooms', () => ({
  useRooms: () => h.rooms,
  useCreateRoom: () => h.create,
  useArchiveRoom: () => h.archive,
}));

vi.mock('../../hooks/useOrg', () => ({
  useOffices: () => h.offices,
}));

vi.mock('../../hooks/useRole', () => ({
  useRole: () => ({ can: h.can }),
}));

const sampleOffices = [{ _id: 'o1', name: 'HCM Office', code: 'HCM' }];
const sampleRooms = [
  { _id: 'r1', name: 'Room A1', code: 'HCM-A1', office: { _id: 'o1', name: 'HCM Office', code: 'HCM' }, seats: 20 },
  { _id: 'r2', name: 'Room B2', code: 'HCM-B2', office: null, seats: null },
];

beforeEach(() => {
  h.rooms = { data: [], isLoading: false };
  h.offices = { data: sampleOffices };
  h.create = { mutate: vi.fn(), isPending: false };
  h.archive = { mutate: vi.fn(), isPending: false };
  h.can = vi.fn(() => true);
});

describe('RoomsPage', () => {
  it('renders room rows with code, office, and seats', () => {
    h.rooms = { data: sampleRooms, isLoading: false };
    render(<RoomsPage />);
    expect(screen.getByText('Room A1')).toBeInTheDocument();
    expect(screen.getByText('HCM-A1')).toBeInTheDocument();
    // "HCM Office (HCM)" also appears in the create-form office option — the row
    // cell is one of several matches.
    expect(screen.getAllByText('HCM Office (HCM)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('shows the empty state when there are no rooms', () => {
    render(<RoomsPage />);
    expect(screen.getByText(/No rooms yet/i)).toBeInTheDocument();
  });

  it('submits the create form with name/code/officeId/seats', () => {
    render(<RoomsPage />);
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Room C3' } });
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'HCM-C3' } });
    fireEvent.change(screen.getByLabelText('Office'), { target: { value: 'o1' } });
    fireEvent.change(screen.getByLabelText('Seats'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /add room/i }));
    expect(h.create.mutate).toHaveBeenCalledWith(
      { name: 'Room C3', code: 'HCM-C3', officeId: 'o1', seats: 15 },
      expect.anything(),
    );
  });

  it('archives a room after confirmation', () => {
    h.rooms = { data: sampleRooms, isLoading: false };
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<RoomsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Room A1' }));
    expect(h.archive.mutate).toHaveBeenCalledWith('r1');
    confirmSpy.mockRestore();
  });

  it('hides the create form and actions without manage:room', () => {
    h.can = vi.fn((perm) => perm !== 'manage:room');
    h.rooms = { data: sampleRooms, isLoading: false };
    render(<RoomsPage />);
    expect(screen.queryByRole('button', { name: /add room/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive Room A1' })).not.toBeInTheDocument();
  });
});
