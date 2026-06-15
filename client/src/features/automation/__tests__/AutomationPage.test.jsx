import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AutomationPage from '../AutomationPage';

// TMS.update gap #3 P4-S2 — the no-code automation Studio page.

const h = vi.hoisted(() => ({
  state: { data: undefined, isLoading: false, isError: false },
  create: vi.fn(), update: vi.fn(), remove: vi.fn(),
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k, d) => (typeof d === 'string' ? d : k) }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../useAutomation', () => ({
  useAutomationRules: () => h.state,
  useCreateRule: () => ({ mutateAsync: h.create, isPending: false }),
  useUpdateRule: () => ({ mutateAsync: h.update, isPending: false }),
  useDeleteRule: () => ({ mutateAsync: h.remove, isPending: false }),
}));

const sample = {
  triggers: ['enrollment.created', 'certificate.issued'],
  actionTypes: ['notify', 'log'],
  rules: [
    { _id: 'r1', name: 'Notify on cert', trigger: 'certificate.issued', conditions: [], actions: [{ type: 'notify', params: { message: 'hi' } }], enabled: false, runCount: 5, system: true },
    { _id: 'r2', name: 'My rule', trigger: 'enrollment.created', conditions: [{ field: 'actorIsSelf', op: 'falsy', value: null }], actions: [{ type: 'log', params: {} }], enabled: true, runCount: 0, system: false },
  ],
};

const renderPage = () => render(<AutomationPage />);

beforeEach(() => {
  h.state = { data: undefined, isLoading: false, isError: false };
  h.create.mockReset(); h.create.mockResolvedValue({});
  h.update.mockReset(); h.update.mockResolvedValue({});
  h.remove.mockReset(); h.remove.mockResolvedValue({});
});

describe('AutomationPage', () => {
  it('renders rules, the selected when→if→then, and the libraries', () => {
    h.state = { data: sample, isLoading: false, isError: false };
    renderPage();
    // 'Notify on cert' appears in the list AND (as the default selected) the detail title.
    expect(screen.getAllByText('Notify on cert').length).toBeGreaterThan(0);
    expect(screen.getByText('My rule')).toBeInTheDocument();
    // selected rule defaults to the first → its trigger is shown in the WHEN stage
    expect(screen.getAllByText('certificate.issued').length).toBeGreaterThan(0);
  });

  it('toggling a rule enables it via updateRule', async () => {
    const user = userEvent.setup();
    h.state = { data: sample, isLoading: false, isError: false };
    renderPage();

    await user.click(screen.getByRole('checkbox', { name: 'Notify on cert' }));
    expect(h.update).toHaveBeenCalledWith({ id: 'r1', enabled: true });
  });

  it('deletes a custom rule (system rule has no delete control)', async () => {
    const user = userEvent.setup();
    h.state = { data: sample, isLoading: false, isError: false };
    renderPage();

    expect(screen.queryByRole('button', { name: 'automation.deleteRule Notify on cert' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'automation.deleteRule My rule' }));
    expect(h.remove).toHaveBeenCalledWith('r2');
  });

  it('creates a rule from the dialog', async () => {
    const user = userEvent.setup();
    h.state = { data: sample, isLoading: false, isError: false };
    renderPage();

    await user.click(screen.getByRole('button', { name: 'automation.newRule' }));
    await user.type(screen.getByLabelText('automation.form.name'), 'New one');
    await user.type(screen.getByLabelText('automation.form.message'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'automation.form.create' }));

    expect(h.create).toHaveBeenCalledWith({
      name: 'New one',
      trigger: 'enrollment.created',
      actions: [{ type: 'notify', params: { message: 'Hello' } }],
    });
  });

  it('shows an error state', () => {
    h.state = { data: undefined, isLoading: false, isError: true };
    renderPage();
    expect(screen.getByText('automation.loadError')).toBeInTheDocument();
  });
});
