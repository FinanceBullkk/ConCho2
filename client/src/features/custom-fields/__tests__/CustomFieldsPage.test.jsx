import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CustomFieldsPage from '../CustomFieldsPage';

const h = vi.hoisted(() => ({ state: { data: [], isLoading: false, isError: false } }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../useCustomFields', () => ({
  useCustomFields: () => h.state,
  useCreateCustomField: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCustomField: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const fields = [
  { _id: '1', entity: 'Program', key: 'budget_code', label: 'Budget code', type: 'text', options: [], required: false },
  { _id: '2', entity: 'Program', key: 'theme', label: 'Theme', type: 'select', options: ['A', 'B'], required: true },
];

const renderPage = () => render(<MemoryRouter><CustomFieldsPage /></MemoryRouter>);

beforeEach(() => { h.state = { data: [], isLoading: false, isError: false }; });

describe('CustomFieldsPage', () => {
  it('renders a skeleton while loading', () => {
    h.state = { data: [], isLoading: true, isError: false };
    renderPage();
    expect(screen.getByTestId('cf-skeleton')).toBeInTheDocument();
  });

  it('lists defined fields, the add form, and a live preview', () => {
    h.state = { data: fields, isLoading: false, isError: false };
    renderPage();

    // The field's key shows in the list; labels show in both the list and the
    // preview, so assert at least one occurrence.
    expect(screen.getByText(/budget_code/)).toBeInTheDocument();
    expect(screen.getAllByText('Budget code').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Theme').length).toBeGreaterThan(0);

    // Add form + a remove control are present.
    expect(screen.getByText('customFields.addField')).toBeInTheDocument();
    expect(screen.getByLabelText(/customFields\.remove Budget code/)).toBeInTheDocument();
  });

  it('shows an error state when loading fails', () => {
    h.state = { data: [], isLoading: false, isError: true };
    renderPage();
    expect(screen.getByText('customFields.loadError')).toBeInTheDocument();
  });

  it('switches the managed entity (Program ↔ Cohort)', () => {
    h.state = { data: [], isLoading: false, isError: false };
    renderPage();
    // Both entity options render; Program is the default heading.
    expect(screen.getByRole('button', { name: 'customFields.entity.Program' })).toBeInTheDocument();
    expect(screen.getByText('customFields.programFields')).toBeInTheDocument();
    // Switching to Cohort updates the managed entity heading.
    fireEvent.click(screen.getByRole('button', { name: 'customFields.entity.Cohort' }));
    expect(screen.getByText('customFields.cohortFields')).toBeInTheDocument();
  });
});
