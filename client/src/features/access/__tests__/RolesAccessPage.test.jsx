import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RolesAccessPage from '../RolesAccessPage';

// TMS.update gap #2 P3-S3 — the matrix is now EDITABLE (DB-backed grants +
// custom roles). Admin column is locked; toggling + Save calls updateRole.

const h = vi.hoisted(() => ({
  state: { data: undefined, isLoading: false, isError: false },
  update: vi.fn(), create: vi.fn(), remove: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, d) => (typeof d === 'string' ? d : k) }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../useAccess', () => ({
  useRoles: () => h.state,
  useUpdateRole: () => ({ mutateAsync: h.update, isPending: false }),
  useCreateRole: () => ({ mutateAsync: h.create, isPending: false }),
  useDeleteRole: () => ({ mutateAsync: h.remove, isPending: false }),
}));

const sample = {
  capabilities: ['program.manage', 'session.book'],
  roles: [
    { key: 'Admin', name: 'Administrator', system: true, capabilities: ['program.manage', 'session.book'] },
    { key: 'Coordinator', name: 'Coordinator', system: true, capabilities: ['program.manage'] },
    { key: 'Teacher', name: 'Teacher', system: true, capabilities: [] },
    { key: 'Participant', name: 'Participant', system: true, capabilities: ['session.book'] },
  ],
};

const renderPage = () => render(<MemoryRouter><RolesAccessPage /></MemoryRouter>);

beforeEach(() => {
  h.state = { data: undefined, isLoading: false, isError: false };
  h.update.mockReset(); h.update.mockResolvedValue({});
  h.create.mockReset(); h.create.mockResolvedValue({});
  h.remove.mockReset(); h.remove.mockResolvedValue({});
});

describe('RolesAccessPage — editable matrix', () => {
  it('renders a skeleton while loading', () => {
    h.state = { data: undefined, isLoading: true, isError: false };
    renderPage();
    expect(screen.getByTestId('access-skeleton')).toBeInTheDocument();
  });

  it('renders role columns, capability rows, and locks the Admin column', () => {
    h.state = { data: sample, isLoading: false, isError: false };
    renderPage();

    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Coordinator')).toBeInTheDocument();
    expect(screen.getByText('program.manage')).toBeInTheDocument();

    // Admin cells are checked + disabled (superuser, locked).
    const adminCell = screen.getByRole('checkbox', { name: 'Administrator program.manage' });
    expect(adminCell).toBeChecked();
    expect(adminCell).toBeDisabled();
    // Teacher cell is editable + currently unchecked.
    expect(screen.getByRole('checkbox', { name: 'Teacher program.manage' })).not.toBeChecked();
  });

  it('toggling a cell then Save persists the new grant set', async () => {
    const user = userEvent.setup();
    h.state = { data: sample, isLoading: false, isError: false };
    renderPage();

    await user.click(screen.getByRole('checkbox', { name: 'Teacher program.manage' }));
    await user.click(screen.getByRole('button', { name: 'access.save' }));

    expect(h.update).toHaveBeenCalledWith({ key: 'Teacher', capabilities: ['program.manage'] });
  });

  it('creates a custom role from the dialog', async () => {
    const user = userEvent.setup();
    h.state = { data: sample, isLoading: false, isError: false };
    renderPage();

    await user.click(screen.getByRole('button', { name: /access\.newRole/ }));
    await user.type(screen.getByLabelText('access.roleKey'), 'Auditor');
    await user.type(screen.getByLabelText('access.roleName'), 'Auditor');
    await user.click(screen.getByRole('button', { name: 'access.create' }));

    expect(h.create).toHaveBeenCalledWith({ key: 'Auditor', name: 'Auditor', capabilities: [] });
  });

  it('shows an error state when the matrix fails to load', () => {
    h.state = { data: undefined, isLoading: false, isError: true };
    renderPage();
    expect(screen.getByText('access.loadError')).toBeInTheDocument();
  });
});
