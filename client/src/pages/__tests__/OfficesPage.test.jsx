import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OfficesPage from '../OfficesPage';

// ──────────────────────────────────────────────────────────
// OfficesPage — People → Offices tab (re-center Phase 1).
// Mutable hook returns per test, mirroring MyTeamPage.test.jsx.
// ──────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  offices: { data: [], isLoading: false },
  create: { mutate: vi.fn(), isPending: false },
  archive: { mutate: vi.fn(), isPending: false },
  can: vi.fn(() => true),
}));

vi.mock('../../hooks/useOrg', () => ({
  useOffices: () => h.offices,
  useCreateOffice: () => h.create,
  useArchiveOffice: () => h.archive,
}));

vi.mock('../../hooks/useRole', () => ({
  useRole: () => ({ can: h.can }),
}));

const sampleOffices = [
  { _id: 'o1', name: 'Ho Chi Minh Office', code: 'HCM', address: 'District 1', timezone: 'Asia/Ho_Chi_Minh' },
  { _id: 'o2', name: 'Ha Noi Office', code: 'HN', address: '', timezone: '' },
];

beforeEach(() => {
  h.offices = { data: [], isLoading: false };
  h.create = { mutate: vi.fn(), isPending: false };
  h.archive = { mutate: vi.fn(), isPending: false };
  h.can = vi.fn(() => true);
});

describe('OfficesPage', () => {
  it('renders office rows with code, address, and timezone', () => {
    h.offices = { data: sampleOffices, isLoading: false };
    render(<OfficesPage />);
    expect(screen.getByText('Ho Chi Minh Office')).toBeInTheDocument();
    expect(screen.getByText('HCM')).toBeInTheDocument();
    expect(screen.getByText('District 1')).toBeInTheDocument();
    expect(screen.getByText('Asia/Ho_Chi_Minh')).toBeInTheDocument();
    expect(screen.getByText('Ha Noi Office')).toBeInTheDocument();
  });

  it('shows the empty state when there are no offices', () => {
    render(<OfficesPage />);
    expect(screen.getByText(/No offices yet/i)).toBeInTheDocument();
  });

  it('submits the create form with name/code/address/timezone', () => {
    render(<OfficesPage />);
    fireEvent.change(screen.getByLabelText('Office name'), { target: { value: 'Da Nang Office' } });
    fireEvent.change(screen.getByLabelText('Office code'), { target: { value: 'DN' } });
    fireEvent.change(screen.getByLabelText('Office address'), { target: { value: 'Hai Chau' } });
    fireEvent.change(screen.getByLabelText('Office timezone'), { target: { value: 'Asia/Ho_Chi_Minh' } });
    fireEvent.click(screen.getByRole('button', { name: /add office/i }));
    expect(h.create.mutate).toHaveBeenCalledWith(
      { name: 'Da Nang Office', code: 'DN', address: 'Hai Chau', timezone: 'Asia/Ho_Chi_Minh' },
      expect.anything(),
    );
  });

  it('archives an office after confirmation', () => {
    h.offices = { data: sampleOffices, isLoading: false };
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OfficesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Archive Ho Chi Minh Office' }));
    expect(h.archive.mutate).toHaveBeenCalledWith('o1');
    confirmSpy.mockRestore();
  });

  it('hides the create form and actions without manage:office', () => {
    h.can = vi.fn((perm) => perm !== 'manage:office');
    h.offices = { data: sampleOffices, isLoading: false };
    render(<OfficesPage />);
    expect(screen.queryByRole('button', { name: /add office/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive Ho Chi Minh Office' })).not.toBeInTheDocument();
  });
});
